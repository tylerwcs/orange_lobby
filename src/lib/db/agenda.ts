import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { AgendaDay, AgendaItem, Event } from "@/lib/types";

/** Postgres's unique_violation: the one error a day write expects, when its date is taken. */
const TAKEN = "23505";

/**
 * The whole agenda in agenda order (D197): by day, then the organiser's hand order, then
 * creation - the tie-break for rooms of one round, which share a position.
 */
export async function listAgenda(eventId: string): Promise<AgendaItem[]> {
  const { data, error } = await serviceClient().from("agenda_items").select("*").eq("event_id", eventId)
    .order("day").order("sort_order").order("created_at");
  if (error) throw error;
  return (data as AgendaItem[]).map((i) => ({ ...i, starts_at: i.starts_at?.slice(0, 5) ?? null, ends_at: i.ends_at?.slice(0, 5) ?? null }));
}

/** The event's days in date order - the only order days have (D193). */
export async function listAgendaDays(eventId: string): Promise<AgendaDay[]> {
  const { data, error } = await serviceClient().from("agenda_days").select("id, org_id, event_id, date, name")
    .eq("event_id", eventId).order("date");
  if (error) throw error;
  return data as AgendaDay[];
}

/** Null when that date already has a day - the caller says so rather than failing. */
export async function createAgendaDay(event: Pick<Event, "id" | "org_id">, input: { date: string; name: string | null }): Promise<AgendaDay | null> {
  const { data, error } = await serviceClient().from("agenda_days")
    .insert({ org_id: event.org_id, event_id: event.id, date: input.date, name: input.name })
    .select("id, org_id, event_id, date, name").single();
  if (error?.code === TAKEN) return null;
  if (error) throw error;
  return data as AgendaDay;
}

/**
 * Renames or re-dates a day. False when the new date is taken. A new date carries the day's
 * rows with it - the database does that (D194), so there is nothing else to call.
 */
export async function updateAgendaDay(id: string, eventId: string, patch: { date: string; name: string | null }): Promise<boolean> {
  const { error } = await serviceClient().from("agenda_days").update(patch).eq("id", id).eq("event_id", eventId);
  if (error?.code === TAKEN) return false;
  if (error) throw error;
  return true;
}

/** Deletes the day and, by cascade, its rows and their breakout assignments (D201). */
export async function deleteAgendaDay(id: string, eventId: string) {
  const { error } = await serviceClient().from("agenda_days").delete().eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

/** A row always names its day (D194); the database fills in the date. */
export type NewAgendaItem = Omit<AgendaItem, "id" | "event_id" | "day" | "day_id"> & { day_id: string };

/**
 * Adds one row and returns its id, so the caller can place it in its day (D197).
 *
 * `slot`, `code` and `color` are omitted when null rather than sent as null: PostgREST refuses
 * an insert that NAMES a column its schema cache lacks (PGRST204) even for a null, and that
 * trick kept Add-a-session working either side of 0007 and 0009. `day` is never sent - the
 * database copies it from the day (D194).
 */
export async function createAgendaItem(event: Pick<Event, "id" | "org_id">, input: NewAgendaItem): Promise<string> {
  const { slot, code, color, ...rest } = input;
  const payload: Record<string, unknown> = { org_id: event.org_id, event_id: event.id, ...rest };
  if (slot !== null) payload.slot = slot;
  if (code !== null) payload.code = code;
  if (color !== null) payload.color = color;
  const { data, error } = await serviceClient().from("agenda_items").insert(payload).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/**
 * Edits one row, sending every column explicitly INCLUDING nulls: clearing an end time or a
 * location has to actually clear it.
 *
 * Renaming `slot` is the dangerous edit. `unique (attendee_id, slot)` on breakout_assignments
 * reads the copy denormalised onto each assignment row, so the caller MUST follow a slot change
 * with `renameSlotAssignments()` (src/lib/db/breakouts.ts). `updateAgendaItemAction` and
 * `updateBreakoutRoundAction` do; anything else that calls this must too.
 */
export async function updateAgendaItem(id: string, eventId: string, patch: NewAgendaItem) {
  const { error } = await serviceClient().from("agenda_items").update(patch).eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

export async function deleteAgendaItem(id: string, eventId: string) {
  const { error } = await serviceClient().from("agenda_items").delete().eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

/** Writes new `sort_order`s, one row at a time - a day holds a couple of dozen at most. */
export async function setAgendaOrder(eventId: string, orders: ReadonlyMap<string, number>) {
  const db = serviceClient();
  for (const [id, sort_order] of orders) {
    const { error } = await db.from("agenda_items").update({ sort_order }).eq("id", id).eq("event_id", eventId);
    if (error) throw error;
  }
}
