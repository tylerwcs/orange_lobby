import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { AgendaItem, Event } from "@/lib/types";

export async function listAgenda(eventId: string): Promise<AgendaItem[]> {
  const { data, error } = await serviceClient().from("agenda_items").select("*").eq("event_id", eventId).order("day").order("starts_at").order("created_at");
  if (error) throw error;
  return (data as AgendaItem[]).map((i) => ({ ...i, starts_at: i.starts_at.slice(0, 5), ends_at: i.ends_at?.slice(0, 5) ?? null }));
}
/**
 * `slot` and `code` (migration 0007) and `color` (0009) are omitted from the payload
 * entirely when null, rather than sent as `slot: null`. PostgREST rejects an insert that
 * NAMES a column absent from the schema cache — error PGRST204 — even when the value sent
 * for it is null, so sending them unconditionally breaks the Add-a-session form on every
 * event until the migration has run. Omitting them means an ordinary session inserts on
 * either side of any of those migrations.
 * There is no agenda-item UPDATE path anywhere in this app, so omitting a null on insert can
 * never fail to clear a previously-set value — the column simply defaults to null.
 *
 * The edit path is `updateAgendaItem` below, and it is where the slot-rename obligation
 * that used to be a warning here now lives.
 */
export async function createAgendaItem(event: Pick<Event, "id" | "org_id">, input: Omit<AgendaItem, "id" | "event_id">) {
  const { slot, code, color, ...rest } = input;
  const payload: Record<string, unknown> = { org_id: event.org_id, event_id: event.id, ...rest };
  if (slot !== null) payload.slot = slot;
  if (code !== null) payload.code = code;
  if (color !== null) payload.color = color;
  const { error } = await serviceClient().from("agenda_items").insert(payload);
  if (error) throw error;
}
/**
 * Edits one session.
 *
 * Unlike the insert, this sends every column explicitly INCLUDING nulls: clearing an end
 * time or a location has to actually clear it, so the "omit when null" trick used above
 * would quietly make those fields un-clearable. Migrations 0007 and 0009 are applied, so
 * naming the columns is safe.
 *
 * Renaming `slot` is the dangerous edit. `unique (attendee_id, slot)` on
 * breakout_assignments reads the copy denormalised onto each assignment row, not the value
 * on this item — so the caller MUST follow a slot change with `renameSlotAssignments()`
 * (src/lib/db/breakouts.ts), or the people in this room go on enforcing the old round.
 * `updateAgendaItemAction` does that; anything else that calls this must too.
 */
export async function updateAgendaItem(id: string, eventId: string, patch: Omit<AgendaItem, "id" | "event_id">) {
  const { error } = await serviceClient().from("agenda_items").update(patch).eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

export async function deleteAgendaItem(id: string, eventId: string) {
  const { error } = await serviceClient().from("agenda_items").delete().eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}
