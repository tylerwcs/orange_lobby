export const SPOTLIGHT_MS = 6000;
export const BUSY_SPOTLIGHT_MS = 3000;
export const BUSY_AT = 5;
export const SKIP_BEYOND = 15;

/** D484: 6 s each, 3 s while more than 5 wait behind it. */
export function spotlightMs(waiting: number): number {
  return waiting > BUSY_AT ? BUSY_SPOTLIGHT_MS : SPOTLIGHT_MS;
}

/** Beyond 15 queued, the rest skip the spotlight and go straight into the columns. */
export function splitQueue<T>(queue: readonly T[]): { spotlight: T[]; direct: T[] } {
  return { spotlight: queue.slice(0, SKIP_BEYOND), direct: queue.slice(SKIP_BEYOND) };
}

const RECENT_MS = 60_000;

/** New cards worth a spotlight: unseen and under a minute old. A first load (prev null) has none. */
export function arrivals<T extends { id: string; created_at: string }>(prev: ReadonlySet<string> | null, next: readonly T[], now: number): T[] {
  if (prev === null) return [];
  return next.filter((c) => !prev.has(c.id) && now - Date.parse(c.created_at) < RECENT_MS);
}

/** Review Focus 2: anything taken down while it waited never reaches the wall. */
export function pruneQueue<T extends { id: string }>(queue: readonly T[], live: ReadonlySet<string>): T[] {
  return queue.filter((c) => live.has(c.id));
}
