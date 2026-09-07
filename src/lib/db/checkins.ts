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

export async function listCheckinsForEvent(eventId: string): Promise<Checkin[]> {
  const { data, error } = await serviceClient().from("checkins").select("*").eq("event_id", eventId);
  if (error) throw error;
  return data as Checkin[];
}

export async function countCheckinsByCheckpoint(eventId: string): Promise<Record<string, number>> {
  const rows = await listCheckinsForEvent(eventId);
  return rows.reduce<Record<string, number>>((acc, r) => { acc[r.checkpoint_id] = (acc[r.checkpoint_id] ?? 0) + 1; return acc; }, {});
}
