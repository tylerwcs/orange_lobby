import type { Checkpoint } from "@/lib/types";

/**
 * A checkpoint is a moment on a date, not a whole day: one event day can hold
 * registration, lunch and a dinner door. These shape the day-then-checkpoint
 * filtering the admin and the scanner both use.
 */

/** Checkpoints grouped under their day, days ascending, ordered within a day. */
export function checkpointsByDay(checkpoints: Checkpoint[]): { day: string; items: Checkpoint[] }[] {
  const byDay = new Map<string, Checkpoint[]>();
  for (const c of checkpoints) {
    const list = byDay.get(c.day);
    if (list) list.push(c); else byDay.set(c.day, [c]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, items]) => ({
      day,
      // Two checkpoints added on the same day both default to sort_order 0, so fall
      // back to the name rather than leaving the order down to insertion chance.
      items: [...items].sort((x, y) => x.sort_order - y.sort_order || x.name.localeCompare(y.name)),
    }));
}

/**
 * The days the filter offers: the event's own days plus any day a checkpoint sits on.
 * A checkpoint dated outside the event — a rehearsal, or a date typed wrong — stays
 * reachable instead of silently dropping off the dashboard.
 */
export function dayOptions(eventDays: string[], checkpoints: Checkpoint[]): string[] {
  const days = new Set<string>(eventDays);
  for (const c of checkpoints) days.add(c.day);
  return [...days].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The checkpoint a day should show: the requested one when it belongs to that day,
 * otherwise that day's first. Switching day must never leave a checkpoint selected
 * whose scans are all on a different date.
 */
export function pickCheckpoint(checkpoints: Checkpoint[], day: string, requested: string | undefined): Checkpoint | null {
  const onDay = checkpointsByDay(checkpoints).find((g) => g.day === day)?.items ?? [];
  return onDay.find((c) => c.id === requested) ?? onDay[0] ?? null;
}
