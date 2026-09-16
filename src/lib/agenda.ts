import type { AgendaItem } from "@/lib/types";
import { isBreakout } from "@/lib/breakouts";

/** Who is looking. `null` is the anonymous portal — nobody signed in, so no assignments. */
export type AgendaViewer = { category: string | null; assignedItemIds: ReadonlySet<string> } | null;

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
  const c = viewer?.category?.trim().toLowerCase() ?? null;
  const assigned = viewer?.assignedItemIds ?? new Set<string>();
  return items.filter((i) => {
    const categoryOk = !i.categories || i.categories.length === 0
      || (c !== null && i.categories.some((x) => x.trim().toLowerCase() === c));
    const assignmentOk = !isBreakout(i) || assigned.has(i.id);
    return categoryOk && assignmentOk;
  });
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
