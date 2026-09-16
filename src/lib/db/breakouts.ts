import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { BreakoutAssignment } from "@/lib/types";

export async function listAssignments(eventId: string): Promise<BreakoutAssignment[]> {
  const { data, error } = await serviceClient()
    .from("breakout_assignments").select("*").eq("event_id", eventId);
  if (error) throw error;
  return (data ?? []) as BreakoutAssignment[];
}

/** The breakout items one attendee is in. The portal's hot path — one query, one column. */
export async function assignedItemIdsFor(attendeeId: string): Promise<Set<string>> {
  const { data, error } = await serviceClient()
    .from("breakout_assignments").select("agenda_item_id").eq("attendee_id", attendeeId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => (r as { agenda_item_id: string }).agenda_item_id));
}

/**
 * Writes assignments, one round at a time.
 *
 * `unique (attendee_id, slot)` means a second room for the same round is a conflict, not a
 * duplicate row — so this upserts on that pair when overwriting, and skips people who
 * already have a room when not. Skipping is the default because re-running "Assign from
 * column" on the morning of day 2 must not undo the desk's moves at breakfast (D83).
 */
export async function assignMany(
  eventId: string,
  rows: { attendeeId: string; itemId: string; slot: string }[],
  overwrite: boolean,
): Promise<number> {
  if (rows.length === 0) return 0;
  const payload = rows.map((r) => ({ event_id: eventId, agenda_item_id: r.itemId, attendee_id: r.attendeeId, slot: r.slot }));
  const q = serviceClient().from("breakout_assignments");
  const { error, count } = overwrite
    ? await q.upsert(payload, { onConflict: "attendee_id,slot", count: "exact" })
    : await q.upsert(payload, { onConflict: "attendee_id,slot", ignoreDuplicates: true, count: "exact" });
  if (error) throw error;
  return count ?? 0;
}

export async function unassign(eventId: string, attendeeId: string, slot: string): Promise<void> {
  const { error } = await serviceClient()
    .from("breakout_assignments").delete().eq("event_id", eventId).eq("attendee_id", attendeeId).eq("slot", slot);
  if (error) throw error;
}

/**
 * Keeps the denormalised slot in step when an agenda item's slot is renamed.
 *
 * This is the one line D80 warns about: the copy on the assignment row is what the unique
 * index reads, so an item renamed without this leaves its people enforcing the old round.
 */
export async function renameSlotAssignments(itemId: string, slot: string): Promise<void> {
  const { error } = await serviceClient()
    .from("breakout_assignments").update({ slot }).eq("agenda_item_id", itemId);
  if (error) throw error;
}
