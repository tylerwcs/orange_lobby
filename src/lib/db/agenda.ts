import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { AgendaItem, Event } from "@/lib/types";

export async function listAgenda(eventId: string): Promise<AgendaItem[]> {
  const { data, error } = await serviceClient().from("agenda_items").select("*").eq("event_id", eventId).order("day").order("starts_at").order("sort_order");
  if (error) throw error;
  return (data as AgendaItem[]).map((i) => ({ ...i, starts_at: i.starts_at.slice(0, 5), ends_at: i.ends_at?.slice(0, 5) ?? null }));
}
export async function createAgendaItem(event: Pick<Event, "id" | "org_id">, input: Omit<AgendaItem, "id" | "event_id">) {
  const { error } = await serviceClient().from("agenda_items").insert({ org_id: event.org_id, event_id: event.id, ...input });
  if (error) throw error;
}
export async function deleteAgendaItem(id: string) {
  const { error } = await serviceClient().from("agenda_items").delete().eq("id", id);
  if (error) throw error;
}
