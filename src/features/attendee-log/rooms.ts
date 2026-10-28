import "server-only";
import { listAssignments } from "@/lib/db/breakouts";
import { listAttendeesByIds } from "@/lib/db/attendees";
import type { Actor } from "@/lib/access";
import type { AgendaItem, Event } from "@/lib/types";
import { recordChange } from "./db";
import { people } from "./lib/changes";
import type { NewChange, PersonChange } from "./types";

/**
 * Breakout-room side effects on the Agenda page (D745): deleting a room, a round or a day takes
 * its assignments with it (cascade), and renaming a round rewrites them. Neither is an
 * attendee edit, but the people in those rooms are affected, so each leaves a row.
 */

type Ev = Pick<Event, "id">;

/** Who is assigned to these items, grouped by attendee: the room code they hold in each round. */
async function holders(ev: Ev, items: Pick<AgendaItem, "id" | "slot" | "code">[]): Promise<Map<string, { slot: string; code: string }[]>> {
  const byItem = new Map(items.filter((i) => i.slot).map((i) => [i.id, i]));
  const out = new Map<string, { slot: string; code: string }[]>();
  if (byItem.size === 0) return out;
  for (const a of await listAssignments(ev.id)) {
    const item = byItem.get(a.agenda_item_id);
    if (!item) continue;
    out.set(a.attendee_id, [...(out.get(a.attendee_id) ?? []), { slot: item.slot as string, code: item.code ?? "" }]);
  }
  return out;
}

/** Named people for the log: cancelled ones too, who still hold a room until the rows go. */
async function named(ev: Ev, ids: string[]): Promise<Map<string, PersonChange>> {
  const rows = await listAttendeesByIds(ev.id, ids);
  return new Map(rows.map((a) => [a.id, { attendeeId: a.id, name: a.name, email: a.email }]));
}

/**
 * Reads who loses a room when these items are deleted. Call BEFORE the delete: the cascade
 * removes the assignments, and with them the only record of who held what. Null when nobody
 * was assigned. Record the result after the delete succeeds.
 */
export async function roomLossChange(ev: Ev, items: Pick<AgendaItem, "id" | "slot" | "code">[], what: string): Promise<NewChange | null> {
  const held = await holders(ev, items);
  if (held.size === 0) return null;
  const who = await named(ev, [...held.keys()]);
  const list = [...held].flatMap(([id, rooms]): PersonChange[] => {
    const p = who.get(id);
    return p ? [{ ...p, fields: rooms.map((r) => ({ label: `${r.slot} room`, before: r.code, after: "" })) }] : [];
  });
  if (list.length === 0) return null;
  return { kind: "room_delete", summary: `${what}: ${people(list.length)} lost their room`, people: list };
}

/** Read and record in one go, for a caller that deletes straight after. Prefer `roomLossChange` and record once the delete has worked. */
export async function logRoomLoss(ev: Ev, by: Actor, items: Pick<AgendaItem, "id" | "slot" | "code">[], what: string): Promise<void> {
  await recordChange(ev.id, by, await roomLossChange(ev, items, what));
}

/**
 * A round renamed: everyone in any of these rooms is now in a round with a new name. Call
 * after `renameSlotAssignments` has worked. No row when nobody is assigned.
 */
export async function logRoundRename(ev: Ev, by: Actor, itemIds: string[], from: string, to: string): Promise<void> {
  if (itemIds.length === 0) return;
  const ids = new Set(itemIds);
  const held = new Set<string>();
  for (const a of await listAssignments(ev.id)) if (ids.has(a.agenda_item_id)) held.add(a.attendee_id);
  if (held.size === 0) return;
  const who = await named(ev, [...held]);
  const list = [...held].flatMap((id): PersonChange[] => {
    const p = who.get(id);
    return p ? [{ ...p, fields: [{ label: "Round", before: from, after: to }] }] : [];
  });
  if (list.length === 0) return;
  await recordChange(ev.id, by, { kind: "round_rename", summary: `Renamed ${from} → ${to} (${people(list.length)})`, people: list });
}
