import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { generateToken } from "@/lib/tokens";
import type { Activity, Booth, BoothStamp } from "@/lib/types";

export async function listBooths(eventId: string): Promise<Booth[]> {
  const { data, error } = await serviceClient().from("booths").select("*")
    .eq("event_id", eventId).order("sort_order").order("created_at");
  if (error) throw error;
  return data as Booth[];
}

/** One passport's booths, in admin order — what its card, its scanner progress and its page draw. */
export async function listPassportBooths(activityId: string): Promise<Booth[]> {
  const { data, error } = await serviceClient().from("booths").select("*")
    .eq("activity_id", activityId).order("sort_order").order("created_at");
  if (error) throw error;
  return data as Booth[];
}

/**
 * The booth behind a scanner link. Looked up by token alone — there is no event in the URL,
 * and the token is unique across the table for exactly that reason.
 */
export async function getBoothByToken(token: string): Promise<Booth | null> {
  const { data, error } = await serviceClient().from("booths").select("*").eq("token", token).maybeSingle();
  if (error) throw error;
  return (data as Booth | null) ?? null;
}

/** Appends to the end of its passport: a new booth is the next stand, not the first. */
export async function createBooth(passport: Pick<Activity, "id" | "org_id" | "event_id">, name: string, location: string | null) {
  const db = serviceClient();
  const { data: last } = await db.from("booths").select("sort_order")
    .eq("activity_id", passport.id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const sort_order = (last?.sort_order ?? -1) + 1;
  const { error } = await db.from("booths").insert({
    org_id: passport.org_id, event_id: passport.event_id, activity_id: passport.id,
    name, location, token: generateToken(), sort_order,
  });
  if (error) throw error;
}

/**
 * Renaming is always allowed, including for a booth that has stamped people: the stamps point
 * at the row, not at its name, so nothing is lost (D94).
 */
export async function updateBooth(id: string, eventId: string, patch: { name: string; location: string | null }) {
  const { error } = await serviceClient().from("booths").update(patch).eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

/**
 * Scoped by event AND passport as well as row id: a posted id from another event updates
 * nothing, and one from a sibling passport cannot renumber that passport's booths.
 */
export async function setBoothOrder(eventId: string, activityId: string, orderedIds: string[]) {
  const db = serviceClient();
  for (const [index, id] of orderedIds.entries()) {
    const { error } = await db.from("booths").update({ sort_order: index })
      .eq("id", id).eq("event_id", eventId).eq("activity_id", activityId);
    if (error) throw error;
  }
}

/**
 * Deletes a booth only while nobody has stamped there (D94). The database's foreign key
 * constraint on booth_stamps.booth_id (restrict, not cascade) refuses the deletion if any
 * stamps exist — a rule the database enforces atomically, so no check-then-delete race can
 * sneak a stamp between the two and lose it.
 *
 * Returns false when the booth has stamps; the caller turns that into a message.
 */
export async function deleteBoothIfUnstamped(id: string, eventId: string): Promise<boolean> {
  const db = serviceClient();
  const { data, error } = await db.from("booths").delete()
    .eq("id", id).eq("event_id", eventId).select("id");
  // 23503 is a foreign-key violation: booth_stamps still references this booth, and the
  // restrict on that key is what refuses the delete. Asking first and deleting second would
  // leave a window in which a stamp lands between the two and is cascaded away silently.
  if (error?.code === "23503") return false;
  if (error) throw error;
  // Zero rows matched: the booth is gone, or the id belongs to another event. Either way
  // nothing was deleted, and saying otherwise would have the admin page report a success.
  return (data?.length ?? 0) > 0;
}

/** Every answer `record_stamp` can give (D185). `missing` means the booth, passport or attendee is gone or foreign. */
export type StampResult = "ok" | "duplicate" | "closed" | "ineligible" | "missing";

/**
 * One stamp, decided by `record_stamp` (0036): the open flag and the passport's categories are
 * checked in the same statement that writes, as `book_session` does for a seat (D184, D185).
 * The unique (booth_id, attendee_id) still makes a second scan a duplicate rather than a second
 * chop; on a duplicate the original row is read back so the booth can say when.
 */
export async function recordStamp(boothId: string, attendeeId: string): Promise<{ result: StampResult; existing?: BoothStamp }> {
  const db = serviceClient();
  const { data, error } = await db.rpc("record_stamp", { p_booth_id: boothId, p_attendee_id: attendeeId });
  if (error) throw error;
  const result = data as StampResult;
  if (result !== "duplicate") return { result };
  const { data: row, error: readError } = await db.from("booth_stamps").select("*")
    .eq("booth_id", boothId).eq("attendee_id", attendeeId).single();
  if (readError) throw readError;
  return { result, existing: row as BoothStamp };
}

/** The booth scanner's Undo. Returns whether a row was deleted. */
export async function deleteStamp(boothId: string, attendeeId: string): Promise<boolean> {
  const { data, error } = await serviceClient().from("booth_stamps").delete()
    .eq("booth_id", boothId).eq("attendee_id", attendeeId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function listStampsForEvent(eventId: string): Promise<BoothStamp[]> {
  const { data, error } = await serviceClient().from("booth_stamps").select("*").eq("event_id", eventId);
  if (error) throw error;
  return data as BoothStamp[];
}

export async function stampsForAttendee(attendeeId: string): Promise<BoothStamp[]> {
  const { data, error } = await serviceClient().from("booth_stamps").select("*").eq("attendee_id", attendeeId);
  if (error) throw error;
  return data as BoothStamp[];
}

/**
 * How many people this one booth has stamped. A head-count query rather than
 * `countStampsByBooth`, which reads every stamp row in the event to answer for one booth —
 * the booth scanner's page is public, dynamic and unauthenticated, so its per-request cost
 * has to stay flat.
 */
export async function countStampsForBooth(boothId: string): Promise<number> {
  const { count, error } = await serviceClient().from("booth_stamps")
    .select("id", { count: "exact", head: true }).eq("booth_id", boothId);
  if (error) throw error;
  return count ?? 0;
}

export async function countStampsByBooth(eventId: string): Promise<Record<string, number>> {
  const rows = await listStampsForEvent(eventId);
  return rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.booth_id] = (acc[r.booth_id] ?? 0) + 1;
    return acc;
  }, {});
}
