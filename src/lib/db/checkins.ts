import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { selectAll } from "@/lib/db/select-all";
import type { Arrival } from "@/features/activities/client";
import type { Checkin, Event } from "@/lib/types";

export async function recordCheckin(event: Pick<Event, "id" | "org_id">, checkpointId: string, attendeeId: string, userId: string | null): Promise<{ created: boolean; existing?: Checkin }> {
  const db = serviceClient();
  const { error } = await db.from("checkins").insert({ org_id: event.org_id, event_id: event.id, checkpoint_id: checkpointId, attendee_id: attendeeId, scanned_by: userId });
  if (!error) return { created: true };
  if (error.code === "23505") {
    const { data } = await db.from("checkins").select("*").eq("checkpoint_id", checkpointId).eq("attendee_id", attendeeId).single();
    return { created: false, existing: data as Checkin };
  }
  throw error;
}

/**
 * Checks several attendees in at once. `ignoreDuplicates` matters: the unique constraint
 * on (checkpoint_id, attendee_id) would otherwise fail the whole batch because one person
 * in the selection had already been scanned.
 */
export async function recordCheckins(event: Pick<Event, "id" | "org_id">, checkpointId: string, attendeeIds: string[], userId: string | null) {
  if (attendeeIds.length === 0) return;
  const rows = attendeeIds.map((attendee_id) => ({
    org_id: event.org_id, event_id: event.id, checkpoint_id: checkpointId, attendee_id, scanned_by: userId,
  }));
  const { error } = await serviceClient().from("checkins").upsert(rows, { onConflict: "checkpoint_id,attendee_id", ignoreDuplicates: true });
  if (error) throw error;
}

/**
 * Every check-in of the event. Paged (D289): door tallies, the Overview, the Bookings tab and
 * the attendance export all count from it, and one scan per person per door passes 1,000 rows
 * on any event of size.
 */
export async function listCheckinsForEvent(eventId: string): Promise<Checkin[]> {
  return selectAll<Checkin>((from, to) => serviceClient().from("checkins")
    .select("*").eq("event_id", eventId).order("id").range(from, to));
}

/** Every check-in at these doors, and nothing else of the event: a booking door's arrivals (D324). Paged as above. */
export async function listCheckinsAt(checkpointIds: string[]): Promise<Checkin[]> {
  if (checkpointIds.length === 0) return [];
  return selectAll<Checkin>((from, to) => serviceClient().from("checkins")
    .select("*").in("checkpoint_id", checkpointIds).order("id").range(from, to));
}

/** Attendee ids already checked in at one checkpoint; used to label search hits. Paged (D401). */
export async function listCheckedInAttendeeIds(checkpointId: string): Promise<Set<string>> {
  const rows = await selectAll<{ attendee_id: string }>((from, to) => serviceClient().from("checkins")
    .select("attendee_id").eq("checkpoint_id", checkpointId).order("id").range(from, to));
  return new Set(rows.map((r) => r.attendee_id));
}

/** Removes one check-in (the scanner's Undo). Returns whether a row was deleted. */
export async function deleteCheckin(eventId: string, checkpointId: string, attendeeId: string): Promise<boolean> {
  const { data, error } = await serviceClient().from("checkins").delete()
    .eq("event_id", eventId).eq("checkpoint_id", checkpointId).eq("attendee_id", attendeeId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** One attendee's check-in at one door, or null. */
export async function getCheckin(checkpointId: string, attendeeId: string): Promise<Checkin | null> {
  const { data, error } = await serviceClient().from("checkins").select("*")
    .eq("checkpoint_id", checkpointId).eq("attendee_id", attendeeId).maybeSingle();
  if (error) throw error;
  return data as Checkin | null;
}

/**
 * This attendee's check-ins at booking doors (D333): their check-ins, then which of those doors
 * stand for an activity. Two small queries; an attendee has a handful of check-ins.
 */
export async function bookingArrivalsFor(attendeeId: string): Promise<Arrival[]> {
  const db = serviceClient();
  const { data: rows, error } = await db.from("checkins").select("checkpoint_id, scanned_at").eq("attendee_id", attendeeId);
  if (error) throw error;
  const ids = [...new Set((rows ?? []).map((r) => r.checkpoint_id as string))];
  if (ids.length === 0) return [];
  const { data: doors, error: e2 } = await db.from("checkpoints").select("id, activity_id, day").in("id", ids).not("activity_id", "is", null);
  if (e2) throw e2;
  const byId = new Map((doors ?? []).map((d) => [d.id as string, d as { activity_id: string; day: string }]));
  return (rows ?? []).flatMap((r) => {
    const d = byId.get(r.checkpoint_id as string);
    return d ? [{ activity_id: d.activity_id, day: d.day, scanned_at: r.scanned_at as string }] : [];
  });
}
