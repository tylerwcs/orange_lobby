import type { Attendee, Checkin } from "@/lib/types";

export type CheckinState = { status: "checked_in" | "expected"; at: string | null };

/** Whether one attendee is in, and when they first were. */
export function checkinStatus(attendeeId: string, checkins: Checkin[]): CheckinState {
  let earliest: string | null = null;
  for (const c of checkins) {
    if (c.attendee_id !== attendeeId) continue;
    if (earliest === null || c.scanned_at < earliest) earliest = c.scanned_at;
  }
  return earliest === null ? { status: "expected", at: null } : { status: "checked_in", at: earliest };
}

export type ScanRow = {
  checkinId: string; attendeeId: string; name: string; company: string | null;
  tableNo: string | null; checkpointId: string; at: string; duplicate: boolean;
};

/**
 * True when `a` is the row that should stand as "the original" between two rows
 * for the same attendee + checkpoint. Primarily the earlier `scanned_at`; when
 * that ties (same instant, e.g. a backfill import) `id` is the tiebreaker —
 * arbitrary but total and stable, so the pick never depends on array order.
 */
function isOriginal(a: Checkin, b: Checkin): boolean {
  if (a.scanned_at !== b.scanned_at) return a.scanned_at < b.scanned_at;
  return a.id < b.id;
}

/**
 * Newest scans first, with the attendee joined. A scan is a duplicate when the same
 * attendee already has an earlier scan at the same checkpoint — the case the crew
 * needs to see rather than have silently succeed.
 */
export function recentScans(checkins: Checkin[], attendees: Attendee[], limit: number): ScanRow[] {
  const byId = new Map(attendees.map((a) => [a.id, a]));
  const original = new Map<string, Checkin>();
  for (const c of checkins) {
    const key = `${c.attendee_id} ${c.checkpoint_id}`;
    const best = original.get(key);
    if (best === undefined || isOriginal(c, best)) original.set(key, c);
  }
  return [...checkins]
    .sort((a, b) => (a.scanned_at < b.scanned_at ? 1 : a.scanned_at > b.scanned_at ? -1 : 0))
    .slice(0, limit)
    .map((c) => {
      const a = byId.get(c.attendee_id);
      return {
        checkinId: c.id,
        attendeeId: c.attendee_id,
        name: a?.name ?? "Removed attendee",
        company: a?.company ?? null,
        tableNo: a?.table_no ?? null,
        checkpointId: c.checkpoint_id,
        at: c.scanned_at,
        duplicate: original.get(`${c.attendee_id} ${c.checkpoint_id}`)?.id !== c.id,
      };
    });
}

/**
 * How many distinct attendees are in — either anywhere, or at one named checkpoint.
 *
 * Counting rows would do for a single checkpoint, since (checkpoint_id, attendee_id) is
 * unique, but not across all of them: someone scanned at registration and again at dinner
 * is one person in the room, not two.
 */
export function checkedInCount(checkins: Checkin[], checkpointId?: string | null): number {
  const seen = new Set<string>();
  for (const c of checkins) {
    if (checkpointId && c.checkpoint_id !== checkpointId) continue;
    seen.add(c.attendee_id);
  }
  return seen.size;
}

/**
 * Check-ins per checkpoint, over rows already fetched. A checkpoint with no scans is
 * simply absent rather than present as 0 — callers that want a full checkpoint list
 * with zeros should read this with `?? 0` against their own checkpoint set.
 */
export function countByCheckpoint(checkins: Checkin[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of checkins) counts[c.checkpoint_id] = (counts[c.checkpoint_id] ?? 0) + 1;
  return counts;
}

/**
 * Where one attendee has been scanned: checkpoint id -> the earliest scan time there.
 * A checkpoint they never reached is absent, so a caller can read presence directly.
 * Backs the admin panel's check-in timeline, which says when each door was reached and
 * which crew account did the scanning.
 */
export type AttendeeScan = { at: string; by: string | null };

export function attendeeCheckins(attendeeId: string, checkins: Checkin[]): Record<string, AttendeeScan> {
  const out: Record<string, AttendeeScan> = {};
  for (const c of checkins) {
    if (c.attendee_id !== attendeeId) continue;
    const seen = out[c.checkpoint_id];
    if (seen === undefined || c.scanned_at < seen.at) out[c.checkpoint_id] = { at: c.scanned_at, by: c.scanned_by };
  }
  return out;
}
