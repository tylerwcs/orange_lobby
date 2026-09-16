import type { Event } from "@/lib/types";

/**
 * The last date the crew link works: one day after the event ends (D106).
 *
 * Computed from the event's own dates rather than stored, so moving an event moves the
 * link's life with it. `null` means the event has no dates at all, which the caller reads
 * as "no expiry" (D107) — not as "already expired".
 *
 * Date maths is done through `Date.UTC` on the parts rather than by parsing the string in
 * local time, because `new Date("2026-08-31")` is midnight UTC and adding a day in a
 * negative-offset environment would land on the wrong date.
 */
export function crewLinkLastDay(event: Pick<Event, "starts_on" | "ends_on">): string | null {
  const last = event.ends_on ?? event.starts_on;
  if (!last) return null;
  const [y, m, d] = last.split("-").map(Number);
  const grace = new Date(Date.UTC(y, m - 1, d + 1));
  return grace.toISOString().slice(0, 10);
}

/**
 * Whether the crew link should open at all today.
 *
 * Expiry is a courtesy against a screenshot that outlives the event, not an access control —
 * the control is rotating the token (D108). An archived event is closed here as it is
 * everywhere else.
 */
export function crewLinkLive(event: Pick<Event, "starts_on" | "ends_on" | "status">, today: string): boolean {
  if (event.status === "archived") return false;
  const lastDay = crewLinkLastDay(event);
  if (!lastDay) return true;
  return today <= lastDay;
}
