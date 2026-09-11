import "server-only";
import { serviceClient } from "@/lib/supabase/service";
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

export async function listCheckinsForEvent(eventId: string): Promise<Checkin[]> {
  const { data, error } = await serviceClient().from("checkins").select("*").eq("event_id", eventId);
  if (error) throw error;
  return data as Checkin[];
}

export async function countCheckinsByCheckpoint(eventId: string): Promise<Record<string, number>> {
  const rows = await listCheckinsForEvent(eventId);
  return rows.reduce<Record<string, number>>((acc, r) => { acc[r.checkpoint_id] = (acc[r.checkpoint_id] ?? 0) + 1; return acc; }, {});
}

/** Attendee ids already checked in at one checkpoint; used to label search hits. */
export async function listCheckedInAttendeeIds(checkpointId: string): Promise<Set<string>> {
  const { data, error } = await serviceClient().from("checkins").select("attendee_id").eq("checkpoint_id", checkpointId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.attendee_id as string));
}

/** Removes one check-in (the scanner's Undo). Returns whether a row was deleted. */
export async function deleteCheckin(eventId: string, checkpointId: string, attendeeId: string): Promise<boolean> {
  const { data, error } = await serviceClient().from("checkins").delete()
    .eq("event_id", eventId).eq("checkpoint_id", checkpointId).eq("attendee_id", attendeeId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
