import type { AgendaItem } from "@/lib/types";
import { isBreakout, breakoutSlots } from "@/lib/breakouts";

/** Who is looking. `null` is the anonymous portal — nobody signed in, so no assignments. */
export type AgendaViewer = { category: string | null; assignedItemIds: ReadonlySet<string> } | null;

/**
 * The category rule alone: an item with no categories is for everyone; otherwise the viewer's
 * category (case/whitespace-insensitive) must be one of the item's. This says nothing about
 * assignment — `visibleTo` ANDs that in separately, and `categoryVisibleBreakoutItems` below
 * uses this rule on its own, on purpose, to answer "was this round ever open to them" rather
 * than "do they have a room in it".
 */
export function categoryVisible(item: AgendaItem, category: string | null): boolean {
  const c = category?.trim().toLowerCase() ?? null;
  return !item.categories || item.categories.length === 0
    || (c !== null && item.categories.some((x) => x.trim().toLowerCase() === c));
}

/**
 * The items this viewer may see, under two independent filters that must BOTH pass.
 *
 * The category rule is unchanged: an item with no categories is for everyone. The assignment
 * rule applies only to items carrying a slot — a breakout room is visible only to someone
 * assigned to it — so an item with no slot behaves exactly as it did before breakouts existed.
 *
 * Both rules fail closed. An unassigned attendee sees no room rather than everyone's rooms;
 * the placeholder that tells them so is built by `myBreakouts`, not here, because this
 * function's job is to remove things.
 */
export function visibleTo(items: AgendaItem[], viewer: AgendaViewer): AgendaItem[] {
  const category = viewer?.category ?? null;
  const assigned = viewer?.assignedItemIds ?? new Set<string>();
  return items.filter((i) => {
    const categoryOk = categoryVisible(i, category);
    const assignmentOk = !isBreakout(i) || assigned.has(i.id);
    return categoryOk && assignmentOk;
  });
}

/**
 * The breakout items to hand to `myBreakouts`: every room of every round that has at least
 * one room this attendee could see on category grounds — assignment ignored entirely, because
 * `myBreakouts` needs the round's other rooms to build the "not assigned yet" placeholder.
 *
 * Without this, `myBreakouts` (fed the fully unfiltered agenda, correctly, so it can see rounds
 * an attendee is not assigned to) can't tell "not assigned to this round" apart from "this round
 * was never open to my category" — a round entirely restricted to another category produced a
 * phantom placeholder row ("Room not assigned yet · call the desk") for attendees it never
 * concerned. A round only *partly* restricted still needs every one of its rooms passed through,
 * so the placeholder (and, once assigned, the room itself) is never built from a partial list.
 */
export function categoryVisibleBreakoutItems(items: AgendaItem[], category: string | null): AgendaItem[] {
  return breakoutSlots(items)
    .filter((s) => s.items.some((i) => categoryVisible(i, category)))
    .flatMap((s) => s.items);
}

export function groupByDay(items: AgendaItem[]): { day: string; items: AgendaItem[] }[] {
  const sorted = [...items].sort((a, b) => a.day.localeCompare(b.day) || a.starts_at.localeCompare(b.starts_at) || a.sort_order - b.sort_order);
  const out: { day: string; items: AgendaItem[] }[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && last.day === i.day) last.items.push(i); else out.push({ day: i.day, items: [i] });
  }
  return out;
}

export function parseCategories(csv: string): string[] | null {
  const arr = csv.split(",").map((s) => s.trim()).filter(Boolean);
  return arr.length ? arr : null;
}

function endOf(i: AgendaItem): string {
  if (i.ends_at) return i.ends_at;
  const [h, m] = i.starts_at.split(":").map(Number);
  if (h + 1 > 23) return "23:59";
  return `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function isNow(i: AgendaItem, date: string, time: string): boolean {
  return i.day === date && i.starts_at <= time && time < endOf(i);
}

export function nextSession(items: AgendaItem[], date: string, time: string): { item: AgendaItem; status: "now" | "next" } | null {
  const sorted = groupByDay(items).flatMap((d) => d.items);
  const now = sorted.find((i) => isNow(i, date, time));
  if (now) return { item: now, status: "now" };
  const next = sorted.find((i) => i.day > date || (i.day === date && i.starts_at > time));
  return next ? { item: next, status: "next" } : null;
}

export function pickDay(days: string[], requested: string | undefined, today: string): string | null {
  if (days.length === 0) return null;
  if (requested && days.includes(requested)) return requested;
  if (days.includes(today)) return today;
  return days[0];
}

/**
 * The categories a session is restricted to, read from the ticked toggles.
 *
 * Replaces the comma-separated text box: the toggles are built from the categories the
 * event's attendees actually have, so a session can no longer be restricted to a category
 * nobody is in — which used to be a silent way to hide a session from everyone.
 *
 * Nothing ticked means everyone, stored as null. `visibleTo` treats null and [] alike, so
 * only one of them is ever written.
 */
export function categoriesFromValues(values: string[]): string[] | null {
  const out = Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
  return out.length ? out : null;
}
