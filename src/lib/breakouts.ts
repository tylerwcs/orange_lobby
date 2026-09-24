import type { AttendeeField } from "@/lib/attendee-fields";
import type { AgendaItem, Attendee, BreakoutAssignment } from "@/lib/types";
import { byAgendaOrder } from "@/lib/agenda-order";

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
 * another, in the organiser's order (D197).
 */
export function breakoutSlots(items: AgendaItem[]): BreakoutSlot[] {
  const sorted = [...items].sort(byAgendaOrder);
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
export type MyBreakout = { slot: string; item: AgendaItem | null; day: string; starts_at: string | null; ends_at: string | null };

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

/**
 * The room one breakout item is in, as an attendee is told it: its location, else its code
 * (what the client's spreadsheet named the room), else its title.
 */
export function breakoutRoom(item: Pick<AgendaItem, "location" | "code" | "title">): string {
  return item.location || item.code || item.title;
}

/**
 * A room name split for the ticket (D218): "Room 1" and "Nusantara Room" both become a small
 * "Room" over the part that tells rooms apart, drawn large - the way a boarding pass prints a
 * gate. Any other name is drawn whole.
 */
export function roomLabel(room: string): { prefix: string | null; main: string } {
  const name = room.trim();
  const m = /^room\s+(\S.*)$/i.exec(name) ?? /^(.*\S)\s+room$/i.exec(name);
  return m ? { prefix: "Room", main: m[1].trim() } : { prefix: null, main: name };
}

/**
 * A breakout's title on its ticket, without a leading "Breakout:" / "Breakout 2 –": the ticket
 * already names the round on the line above. A title that is nothing but the prefix is kept.
 */
export function ticketTitle(title: string): string {
  const rest = title.replace(/^\s*breakout(\s*\d+)?\s*[:\-–—]\s*/i, "");
  return rest.trim() ? rest.trim() : title;
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

/** At most this many rooms in one round. Beyond it, somebody has pasted the wrong column. */
export const MAX_ROOMS_PER_ROUND = 24;

/**
 * The rooms of one round, read from a single line: "3A, 3B, 3C, 3D".
 *
 * A round is created once, with all its rooms, because everything except the code is
 * shared — the day, the time, the title, the colour. Entering that four times to create
 * four rooms was the same form filled in four times over.
 *
 * Repeats are dropped case-insensitively. `matchAssignments` case-folds when it reads the
 * client's spreadsheet, so "3a" and "3A" would both claim the same cell value and an
 * attendee could land in either room.
 */
export function parseRoomCodes(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const code = part.trim();
    if (!code) continue;
    const fold = code.toLowerCase();
    if (seen.has(fold)) continue;
    seen.add(fold);
    out.push(code);
    if (out.length >= MAX_ROOMS_PER_ROUND) break;
  }
  return out;
}

/**
 * A line in the organiser's agenda: either one ordinary session, or a whole breakout round
 * with its rooms folded into it.
 *
 * A four-room round was four rows saying the same time, the same title and the same round
 * name, differing only in a code — four lines to carry one fact. It is one line now, and
 * the rooms are what it lists.
 */
export type AgendaRow =
  | { kind: "item"; item: AgendaItem }
  | { kind: "round"; slot: string; items: AgendaItem[]; day: string; starts_at: string | null; ends_at: string | null };

export function agendaRows(items: AgendaItem[]): AgendaRow[] {
  const sorted = [...items].sort(byAgendaOrder);
  const out: AgendaRow[] = [];
  const rounds = new Map<string, Extract<AgendaRow, { kind: "round" }>>();
  for (const i of sorted) {
    if (!isBreakout(i)) { out.push({ kind: "item", item: i }); continue; }
    const slot = (i.slot as string).trim();
    const seen = rounds.get(slot);
    if (seen) {
      seen.items.push(i);
      // The round shows its EARLIEST room's hours. Rooms normally share a time, but nothing
      // enforces it, and one mistyped room must not be what the round is shown as.
      if (i.starts_at !== null && (seen.starts_at === null || i.starts_at < seen.starts_at)) {
        seen.starts_at = i.starts_at;
        seen.ends_at = i.ends_at;
      }
      continue;
    }
    // The round sits where its first room sits in the hand order; every room shares that
    // position (D197).
    const row = { kind: "round" as const, slot, items: [i], day: i.day, starts_at: i.starts_at, ends_at: i.ends_at };
    rounds.set(slot, row);
    out.push(row);
  }
  return out;
}

/**
 * Each match sorted by what it would actually do: place someone who has no room, leave
 * someone who is already in the room the sheet names, or disagree with a room somebody
 * already holds.
 *
 * Worked out from the assignments as they stood before the write, rather than from the row
 * count an `ignoreDuplicates` upsert returns: what "count" means there is the database
 * driver's business, and these numbers are reported to an organiser as fact.
 *
 * `conflicting` is the only one that needs a decision from a person. It is the desk's manual
 * move disagreeing with the client's spreadsheet, and add-only leaves it standing — which is
 * why it is the only case that has anything to say about overwriting. Keeping it apart from
 * `unchanged` is what stops a routine re-import from nagging about 27 people who are exactly
 * where everyone wants them.
 */
export function splitByExisting(
  matched: AssignMatch[],
  existing: Pick<BreakoutAssignment, "attendee_id" | "agenda_item_id" | "slot">[],
): { fresh: AssignMatch[]; unchanged: AssignMatch[]; conflicting: AssignMatch[] } {
  const held = new Map(existing.map((e) => [`${e.attendee_id}\u0000${e.slot}`, e.agenda_item_id]));
  const fresh: AssignMatch[] = [];
  const unchanged: AssignMatch[] = [];
  const conflicting: AssignMatch[] = [];
  for (const m of matched) {
    const current = held.get(`${m.attendeeId}\u0000${m.slot}`);
    if (current === undefined) fresh.push(m);
    else if (current === m.itemId) unchanged.push(m);
    else conflicting.push(m);
  }
  return { fresh, unchanged, conflicting };
}

/**
 * One round's outcome, in the words the import flash and the Assign-from-column flash both
 * use — one function so the two can never drift into describing the same event differently.
 *
 * `overwriteHint` is the only part that depends on where the reader is standing: an importer
 * has to be sent to the control that can overwrite, while someone already at that control
 * needs to be told which tick to use. Observed the hard way — one shared sentence told a
 * person standing in Assign from column to go to Assign from column.
 *
 * Blanks are named only alongside a placement, where they answer "and the rest?". On a
 * re-import that changed nothing they are the same five people as last time and say nothing
 * new. Empty when the round has no data at all, so an event with three rounds and a column
 * for one of them mentions one of them.
 */
export function describeAssignment(
  slot: string,
  outcome: {
    fresh: number;
    unchanged: number;
    conflicting: number;
    report: Pick<AssignReport, "unmatched" | "blank">;
  },
  overwriteHint = "use Assign from column to overwrite",
): string {
  const { fresh, unchanged, conflicting, report } = outcome;
  const misses = report.unmatched.map((u) => `${u.value} (${u.count})`).join(", ");
  const tail = misses ? ` No room matches: ${misses}.` : "";

  if (fresh === 0 && conflicting === 0) {
    if (misses) return `${slot}:${tail}`;
    // Nothing to do and nothing wrong: confirm the column was read rather than stay silent.
    if (unchanged > 0) return `${slot}: no change, all ${unchanged} already placed.`;
    return "";
  }

  const head = [
    fresh ? `${fresh} assigned` : "",
    conflicting ? `${conflicting} in a different room to the sheet — ${overwriteHint}` : "",
    fresh && report.blank ? `${report.blank} blank` : "",
  ].filter(Boolean).join(", ");
  return `${slot}: ${head}.${tail}`;
}
