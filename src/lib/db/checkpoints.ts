import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { Checkpoint, Event } from "@/lib/types";

export async function listCheckpoints(eventId: string): Promise<Checkpoint[]> {
  const { data, error } = await serviceClient().from("checkpoints").select("*").eq("event_id", eventId).order("sort_order").order("created_at");
  if (error) throw error;
  return data as Checkpoint[];
}
export async function createCheckpoint(event: Pick<Event, "id" | "org_id">, name: string, sort_order: number) {
  const { error } = await serviceClient().from("checkpoints").insert({ org_id: event.org_id, event_id: event.id, name, sort_order });
  if (error) throw error;
}
export async function deleteCheckpoint(id: string, eventId: string) {
  const { error } = await serviceClient().from("checkpoints").delete().eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}
