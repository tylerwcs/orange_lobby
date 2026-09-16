import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { AgendaItem, Event } from "@/lib/types";

export async function listAgenda(eventId: string): Promise<AgendaItem[]> {
  const { data, error } = await serviceClient().from("agenda_items").select("*").eq("event_id", eventId).order("day").order("starts_at").order("created_at");
  if (error) throw error;
  return (data as AgendaItem[]).map((i) => ({ ...i, starts_at: i.starts_at.slice(0, 5), ends_at: i.ends_at?.slice(0, 5) ?? null }));
}
/**
 * `slot` and `code` are added by migration 0007, deliberately not yet applied to production
 * (docs/runbook.md). PostgREST rejects an insert that NAMES a column absent from the schema
 * cache — error PGRST204 — even when the value sent for it is null. `slot` and `code` are
 * therefore omitted from the payload entirely when null, rather than sent as `slot: null`,
 * so an ordinary (non-breakout) agenda item still inserts on either side of that migration.
 * There is no agenda-item UPDATE path anywhere in this app, so omitting a null on insert can
 * never fail to clear a previously-set value — the column simply defaults to null.
 *
 * NOTE: if an edit path is ever added here, renaming `slot` MUST also call
 * `renameSlotAssignments()` (src/lib/db/breakouts.ts) — `unique (attendee_id, slot)` on
 * breakout_assignments reads the copy of `slot` denormalised onto each assignment row, not
 * the value on this agenda item, so an item renamed without it leaves its people enforcing
 * the old round.
 */
export async function createAgendaItem(event: Pick<Event, "id" | "org_id">, input: Omit<AgendaItem, "id" | "event_id">) {
  const { slot, code, ...rest } = input;
  const payload: Record<string, unknown> = { org_id: event.org_id, event_id: event.id, ...rest };
  if (slot !== null) payload.slot = slot;
  if (code !== null) payload.code = code;
  const { error } = await serviceClient().from("agenda_items").insert(payload);
  if (error) throw error;
}
export async function deleteAgendaItem(id: string, eventId: string) {
  const { error } = await serviceClient().from("agenda_items").delete().eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}
