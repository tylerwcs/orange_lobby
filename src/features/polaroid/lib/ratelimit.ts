/**
 * D480: one post per 30 s per device (and per attendee); walk-ins also 10 an hour per device.
 * No per-IP cap (user, 12 Oct 2026): a venue's Wi-Fi or a mobile carrier puts a whole room
 * behind one address. Pausing the wall, rotating the walk-in link and takedowns handle abuse.
 */
export const SPACING_MS = 30_000;
export const WALKIN_PER_HOUR = 10;
export const HOUR_MS = 3_600_000;

/** One of the activity's posts from the last hour, removed ones included: a takedown is not a refund. */
export type RecentPost = { created_at: string; attendee_id: string | null; client_key: string; ip_hash: string };
export type Poster = { attendeeId: string | null; clientKey: string; ipHash: string };

/** When `cap` posts already sit in the hour, the next is allowed once the oldest of the last `cap` ages out. */
function capFreesAt(times: number[], cap: number): number {
  if (times.length < cap) return 0;
  const sorted = [...times].sort((a, b) => a - b);
  return sorted[times.length - cap] + HOUR_MS;
}

/** Whole seconds until `who` may post again; 0 is now. */
export function waitSeconds(recent: readonly RecentPost[], who: Poster, now: number): number {
  const at = (p: RecentPost) => Date.parse(p.created_at);
  const inHour = recent.filter((p) => now - at(p) < HOUR_MS);
  const mine = inHour.filter((p) => p.client_key === who.clientKey || (who.attendeeId !== null && p.attendee_id === who.attendeeId));

  let until = mine.length ? Math.max(...mine.map(at)) + SPACING_MS : 0;
  if (who.attendeeId === null) {
    until = Math.max(until, capFreesAt(inHour.filter((p) => p.client_key === who.clientKey).map(at), WALKIN_PER_HOUR));
  }
  return Math.max(0, Math.ceil((until - now) / 1000));
}
