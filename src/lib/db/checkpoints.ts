import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { Checkpoint, Event } from "@/lib/types";

export async function listCheckpoints(eventId: string): Promise<Checkpoint[]> {
  const { data, error } = await serviceClient().from("checkpoints").select("*").eq("event_id", eventId).order("day").order("sort_order").order("created_at");
  if (error) throw error;
  return data as Checkpoint[];
}
export async function getCheckpoint(id: string, eventId: string): Promise<Checkpoint | null> {
  const { data, error } = await serviceClient().from("checkpoints").select("*").eq("id", id).eq("event_id", eventId).maybeSingle();
  if (error) throw error;
  return data as Checkpoint | null;
}
/** Appends to the end of its day: a new checkpoint is the next thing that happens, not the first. */
export async function createCheckpoint(event: Pick<Event, "id" | "org_id">, name: string, day: string) {
  const db = serviceClient();
  const { data: last } = await db.from("checkpoints").select("sort_order")
    .eq("event_id", event.id).eq("day", day).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const sort_order = (last?.sort_order ?? -1) + 1;
  const { error } = await db.from("checkpoints").insert({ org_id: event.org_id, event_id: event.id, name, day, sort_order });
  if (error) throw error;
}

/**
 * Writes a day's running order. Takes the ids in their new order and stores the index,
 * so the caller never has to think in sort numbers. Scoped by event id as well as row
 * id, so a posted id from another event updates nothing.
 */
export async function setCheckpointOrder(eventId: string, orderedIds: string[]) {
  const db = serviceClient();
  for (const [index, id] of orderedIds.entries()) {
    const { error } = await db.from("checkpoints").update({ sort_order: index }).eq("id", id).eq("event_id", eventId);
    if (error) throw error;
  }
}
export async function deleteCheckpoint(id: string, eventId: string) {
  const { error } = await serviceClient().from("checkpoints").delete().eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}
