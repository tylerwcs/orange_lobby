import type { AttendeeField } from "@/lib/attendee-fields";
import type { AgendaItem, Attendee } from "@/lib/types";

/**
 * Whether this agenda item is one room of a breakout round.
 *
 * The `slot` is what makes it one — not the title. An item called "Breakout: regional teams"
 * with no slot is the single all-hands row this feature replaces, and it keeps behaving
 * exactly as it does today.
 */
export function isBreakout(item: AgendaItem): boolean {
  return typeof item.slot === "string" && item.slot.trim() !== "";
}

export type BreakoutSlot = { slot: string; items: AgendaItem[] };

/**
 * The breakout rounds this event runs, each holding the rooms that are alternatives to one
 * another, in the order the agenda presents them.
 */
export function breakoutSlots(items: AgendaItem[]): BreakoutSlot[] {
  const sorted = [...items].sort((a, b) =>
    a.day.localeCompare(b.day) || a.starts_at.localeCompare(b.starts_at) || a.sort_order - b.sort_order);
  const out: BreakoutSlot[] = [];
  const byName = new Map<string, BreakoutSlot>();
  for (const i of sorted) {
    if (!isBreakout(i)) continue;
    const name = (i.slot as string).trim();
    let slot = byName.get(name);
    if (!slot) { slot = { slot: name, items: [] }; byName.set(name, slot); out.push(slot); }
    slot.items.push(i);
  }
  return out;
}

/**
 * One row per breakout round for one attendee: the room they have, or null when they have none.
 *
 * The null row is the point. `visibleTo` removed every room this attendee is not in, so
 * without this an unassigned attendee's afternoon is a silent ninety-minute hole. When the
 * attendee is assigned, the row's time comes from their own room, so a mistyped agenda cannot
 * show someone else's hours. When unassigned (placeholder), the time comes from the round's
 * first room, which has no better source — the rooms should share a time, but nothing enforces it.
 */
export type MyBreakout = { slot: string; item: AgendaItem | null; day: string; starts_at: string; ends_at: string | null };

export function myBreakouts(items: AgendaItem[], assignedItemIds: ReadonlySet<string>): MyBreakout[] {
  return breakoutSlots(items).map((s) => {
    const assigned = s.items.find((i) => assignedItemIds.has(i.id)) ?? null;
    const source = assigned ?? s.items[0];
    return {
      slot: s.slot,
      item: assigned,
      day: source.day,
      starts_at: source.starts_at,
      ends_at: source.ends_at,
    };
  });
}

export type AssignMatch = { attendeeId: string; itemId: string; slot: string };
export type AssignReport = { matched: AssignMatch[]; unmatched: { value: string; count: number }[]; blank: number };

/**
 * Reads one round's assignments out of the column the client's spreadsheet already imported.
 *
 * The slot's name doubles as the spreadsheet's column header, which is what lets this work
 * with no mapping UI: the organiser types "Breakout 1" on four agenda items, the client's
 * column is headed "Breakout 1", and the values line up against each item's `code`.
 *
 * Comparison is trimmed and case-folded, because a spreadsheet is typed by hand. Anything
 * that still matches nothing is reported rather than dropped — that report is the only thing
 * standing between a typo and an attendee who silently has no room (D83). Blank cells are
 * counted apart from wrong ones: they are people nobody has placed yet, not mistakes.
 */
export function matchAssignments(attendees: Pick<Attendee, "id" | "extra">[], slot: BreakoutSlot): AssignReport {
  const norm = (s: string) => s.trim().toLowerCase();
  const byCode = new Map<string, string>();
  for (const i of slot.items) {
    if (i.code && i.code.trim()) byCode.set(norm(i.code), i.id);
  }
  const matched: AssignMatch[] = [];
  const misses = new Map<string, number>();
  let blank = 0;
  for (const a of attendees) {
    const raw = (a.extra?.[slot.slot] ?? "").trim();
    if (!raw) { blank++; continue; }
    const itemId = byCode.get(norm(raw));
    if (itemId) matched.push({ attendeeId: a.id, itemId, slot: slot.slot });
    else misses.set(raw, (misses.get(raw) ?? 0) + 1);
  }
  return { matched, unmatched: [...misses.entries()].map(([value, count]) => ({ value, count })), blank };
}

export type RosterRoom = { slot: string; code: string; title: string; location: string | null; attendeeIds: string[] };
export type SlotRoster = { slot: string; rooms: RosterRoom[]; unassignedIds: string[] };

/**
 * Who is in which room, per round, plus everyone who is in none of them.
 *
 * The unassigned list is the operationally useful half: it is the people the desk has to find
 * before the round starts, and it is also what a typo in the client's spreadsheet looks like
 * from the organiser's side.
 */
export function rosters(
  items: AgendaItem[],
  attendeeIds: string[],
  assignments: { agenda_item_id: string; attendee_id: string }[],
): SlotRoster[] {
  const byItem = new Map<string, string[]>();
  for (const a of assignments) {
    const list = byItem.get(a.agenda_item_id);
    if (list) list.push(a.attendee_id); else byItem.set(a.agenda_item_id, [a.attendee_id]);
  }
  // listAssignments has no ORDER BY, so assignment order is not stable. attendeeIds comes from
  // listAttendees, which is already ordered by name — sorting into that order makes each room's
  // list both deterministic and alphabetical, which is what a printed roster wants.
  const rank = new Map(attendeeIds.map((id, i) => [id, i]));
  return breakoutSlots(items).map((s) => {
    const rooms = s.items.map((i) => ({
      slot: s.slot, code: i.code?.trim() || "", title: i.title, location: i.location,
      attendeeIds: (byItem.get(i.id) ?? []).slice().sort((x, y) => (rank.get(x) ?? Infinity) - (rank.get(y) ?? Infinity)),
    }));
    const placed = new Set(rooms.flatMap((r) => r.attendeeIds));
    return { slot: s.slot, rooms, unassignedIds: attendeeIds.filter((id) => !placed.has(id)) };
  });
}

/** The prefix that marks a bulk-edit column as a breakout round rather than an attendee column. */
const BREAKOUT_COLUMN_PREFIX = "breakout:";

/**
 * Each breakout round, described as a column the bulk-edit popover can render.
 *
 * Rounds appear beside Company, Category and the organiser's own columns rather than in a
 * control of their own: choosing a room is the same gesture as setting any other fact about
 * the people you have selected. Describing a round as a `select` field is what makes that
 * free — the popover already renders a dropdown for that type.
 *
 * A round whose rooms have no codes is skipped, because it offers nothing to choose.
 */
export function breakoutColumns(items: AgendaItem[]): AttendeeField[] {
  const out: AttendeeField[] = [];
  for (const s of breakoutSlots(items)) {
    const options = s.items.map((i) => i.code?.trim()).filter((c): c is string => !!c);
    if (options.length === 0) continue;
    out.push({ key: `${BREAKOUT_COLUMN_PREFIX}${s.slot}`, label: s.slot, type: "select", options });
  }
  return out;
}

/**
 * The round a bulk-edit column names, or null when it names an ordinary attendee column.
 *
 * Split once: a round's name may itself contain a colon, and the remainder is the name.
 */
export function breakoutSlotFromColumn(key: string): string | null {
  if (!key.startsWith(BREAKOUT_COLUMN_PREFIX)) return null;
  const slot = key.slice(BREAKOUT_COLUMN_PREFIX.length).trim();
  return slot === "" ? null : slot;
}
