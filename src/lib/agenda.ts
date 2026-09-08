import type { AgendaItem } from "@/lib/types";

export function visibleTo(items: AgendaItem[], category: string | null): AgendaItem[] {
  const c = category?.trim().toLowerCase() ?? null;
  return items.filter((i) => !i.categories || i.categories.length === 0 || (c !== null && i.categories.some((x) => x.trim().toLowerCase() === c)));
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
  return `${String(Math.min(h + 1, 23)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
