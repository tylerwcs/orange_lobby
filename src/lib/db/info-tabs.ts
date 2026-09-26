import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { Event, InfoTab } from "@/lib/types";

const COLUMNS = "id, org_id, event_id, title, html, sort_order, categories";

/** The event's tabs in the organiser's order; creation breaks a tie. */
export async function listInfoTabs(eventId: string): Promise<InfoTab[]> {
  const { data, error } = await serviceClient().from("info_tabs").select(COLUMNS)
    .eq("event_id", eventId).order("sort_order").order("created_at");
  if (error) throw error;
  return data as InfoTab[];
}

/** A new, empty tab at the end of the list. Returns its id so the admin can open its editor. */
export async function createInfoTab(event: Pick<Event, "id" | "org_id">, title: string): Promise<string> {
  const db = serviceClient();
  const { data: last } = await db.from("info_tabs").select("sort_order")
    .eq("event_id", event.id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await db.from("info_tabs")
    .insert({ org_id: event.org_id, event_id: event.id, title, html: null, sort_order: ((last?.sort_order as number | undefined) ?? 0) + 10 })
    .select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function updateInfoTab(id: string, eventId: string, patch: { title: string; html: string | null; categories: string[] | null }) {
  const { error } = await serviceClient().from("info_tabs").update(patch).eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

export async function deleteInfoTab(id: string, eventId: string) {
  const { error } = await serviceClient().from("info_tabs").delete().eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

/** Writes the order the list shows, 10 apart. The caller has already checked it is exactly this event's tabs. */
export async function setInfoTabOrder(eventId: string, orderedIds: string[]) {
  const db = serviceClient();
  for (const [n, id] of orderedIds.entries()) {
    const { error } = await db.from("info_tabs").update({ sort_order: (n + 1) * 10 }).eq("id", id).eq("event_id", eventId);
    if (error) throw error;
  }
}
