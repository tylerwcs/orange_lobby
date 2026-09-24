import type { AgendaItem } from "@/lib/types";

/**
 * The one ordering every agenda list shares (D197): by day, then the organiser's hand order.
 * Never by time - an organiser who drags lunch above the keynote meant it. Ties keep their
 * input order (Array.prototype.sort is stable), and `listAgenda` breaks them by creation.
 */
export function byAgendaOrder(a: AgendaItem, b: AgendaItem): number {
  return a.day.localeCompare(b.day) || a.sort_order - b.sort_order;
}

/** A session, with the time only sessions have. */
export type TimedItem = AgendaItem & { kind: "session"; starts_at: string };

/**
 * The gate every time-based reader goes through (D200): happening now, booked-row placement,
 * breakout times. An image row has no time and must never be compared as if it had one.
 */
export function isSession(i: AgendaItem): i is TimedItem {
  return i.kind === "session" && i.starts_at !== null;
}

/**
 * The index of the first entry that starts strictly later than `time`, skipping entries with
 * no time; the list's length when none does. "Strictly": a row added at 09:00 goes after the
 * 09:00 already there, so the earlier arrival keeps its place.
 */
export function firstLater<T>(list: readonly T[], time: string, timeOf: (t: T) => string | null): number {
  const at = list.findIndex((t) => {
    const s = timeOf(t);
    return s !== null && s > time;
  });
  return at === -1 ? list.length : at;
}

/**
 * Where a row at `day` + `time` goes in a list already in agenda order: within its own day,
 * before the first later timed row; with no rows on its day, where that day would begin.
 * The hand order of the rows around it is never disturbed (D198).
 */
export function timeSlot<T>(
  list: readonly T[],
  day: string,
  time: string,
  dayOf: (t: T) => string,
  timeOf: (t: T) => string | null,
): number {
  const start = list.findIndex((t) => dayOf(t) >= day);
  if (start === -1) return list.length;
  const after = list.findIndex((t) => dayOf(t) > day);
  const end = after === -1 ? list.length : after;
  return start + firstLater(list.slice(start, end), time, timeOf);
}
