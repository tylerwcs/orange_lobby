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
 * The checkpoint a day should show: the requested one when it belongs to that day,
 * otherwise that day's first. Switching day must never leave a checkpoint selected
 * whose scans are all on a different date.
 */
export function pickCheckpoint(checkpoints: Checkpoint[], day: string, requested: string | undefined): Checkpoint | null {
  const onDay = checkpointsByDay(checkpoints).find((g) => g.day === day)?.items ?? [];
  return onDay.find((c) => c.id === requested) ?? onDay[0] ?? null;
}

/**
 * The checkpoint every surface should be working against: the one an organiser set in
 * Settings, or — before they have set one, or after it was deleted — the first dated today,
 * or failing that the first there is.
 *
 * The fallback matters more than it looks. Without it a brand new event, or one whose
 * current checkpoint was just deleted, would show a dashboard counting nothing and a
 * scanner with nowhere to scan.
 */
export function activeCheckpoint(activeId: string | null, checkpoints: Checkpoint[], today: string): Checkpoint | null {
  const chosen = checkpoints.find((c) => c.id === activeId);
  if (chosen) return chosen;
  const byDay = checkpointsByDay(checkpoints);
  return byDay.find((g) => g.day === today)?.items[0] ?? byDay[0]?.items[0] ?? null;
}
