import type { AgendaItem } from "@/lib/types";

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
 * without this an unassigned attendee's afternoon is a silent ninety-minute hole. The
 * placeholder's time comes from the round's own rooms, which share a time by definition —
 * they are alternatives to one another.
 */
export type MyBreakout = { slot: string; item: AgendaItem | null; day: string; starts_at: string; ends_at: string | null };

export function myBreakouts(items: AgendaItem[], assignedItemIds: ReadonlySet<string>): MyBreakout[] {
  return breakoutSlots(items).map((s) => {
    const first = s.items[0];
    return {
      slot: s.slot,
      item: s.items.find((i) => assignedItemIds.has(i.id)) ?? null,
      day: first.day,
      starts_at: first.starts_at,
      ends_at: first.ends_at,
    };
  });
}
