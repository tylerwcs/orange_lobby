import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { generateToken } from "@/lib/tokens";
import type { Booth, BoothStamp, Event } from "@/lib/types";

export async function listBooths(eventId: string): Promise<Booth[]> {
  const { data, error } = await serviceClient().from("booths").select("*")
    .eq("event_id", eventId).order("sort_order").order("created_at");
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

/** Appends to the end: a new booth is the next stand, not the first. */
export async function createBooth(event: Pick<Event, "id" | "org_id">, name: string, location: string | null) {
  const db = serviceClient();
  const { data: last } = await db.from("booths").select("sort_order")
    .eq("event_id", event.id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const sort_order = (last?.sort_order ?? -1) + 1;
  const { error } = await db.from("booths")
    .insert({ org_id: event.org_id, event_id: event.id, name, location, token: generateToken(), sort_order });
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

/** Scoped by event id as well as row id, so a posted id from another event updates nothing. */
export async function setBoothOrder(eventId: string, orderedIds: string[]) {
  const db = serviceClient();
  for (const [index, id] of orderedIds.entries()) {
    const { error } = await db.from("booths").update({ sort_order: index }).eq("id", id).eq("event_id", eventId);
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

/**
 * One stamp. The unique constraint on (booth_id, attendee_id) is what makes a second scan a
 * duplicate rather than a second chop — the same shape `recordCheckin` uses, for the same
 * reason: the check has to happen in the database, not in a read-then-write.
 */
export async function recordStamp(booth: Booth, attendeeId: string): Promise<{ created: boolean; existing?: BoothStamp }> {
  const db = serviceClient();
  const { error } = await db.from("booth_stamps")
    .insert({ org_id: booth.org_id, event_id: booth.event_id, booth_id: booth.id, attendee_id: attendeeId });
  if (!error) return { created: true };
  if (error.code === "23505") {
    const { data } = await db.from("booth_stamps").select("*")
      .eq("booth_id", booth.id).eq("attendee_id", attendeeId).single();
    return { created: false, existing: data as BoothStamp };
  }
  throw error;
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
