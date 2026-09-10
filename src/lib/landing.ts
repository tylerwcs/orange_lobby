import type { Event } from "@/lib/types";

/**
 * The event `/admin` opens on: the live one starting latest. `Event` carries no
 * `created_at`, so ties fall back to input order — `listEvents` already returns
 * newest-created first, and Array#sort is stable.
 */
export function pickLandingEvent(events: Event[]): Event | null {
  const live = events.filter((e) => e.status === "live");
  if (live.length === 0) return null;
  return [...live].sort((a, b) => {
    if (a.starts_on === b.starts_on) return 0;
    if (a.starts_on === null) return 1;
    if (b.starts_on === null) return -1;
    return a.starts_on < b.starts_on ? 1 : -1;
  })[0];
}
