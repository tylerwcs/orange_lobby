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
