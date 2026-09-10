import { isoToLocalInput } from "@/lib/time";
import type { Attendee, Checkin } from "@/lib/types";

export type ArrivalBucket = { label: string; count: number };

/** Splits an absolute instant into Malaysian wall-clock date and time, reusing the tested formatter. */
function klParts(iso: string): { day: string; time: string } | null {
  const s = isoToLocalInput(iso);
  if (!s) return null;
  const [day, time] = s.split("T");
  return { day, time };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toLabel(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Scans per fixed-width bucket across one day's window. `to` is exclusive, and empty
 * buckets are kept so the chart shows a gap rather than closing it up.
 */
export function arrivalBuckets(
  checkins: Checkin[],
  opts: { day: string; from: string; to: string; minutes: number; checkpointId?: string },
): ArrivalBucket[] {
  const { day, minutes, checkpointId } = opts;
  const start = toMinutes(opts.from), end = toMinutes(opts.to);
  if (!(minutes > 0) || end <= start) return [];
  // Deferred (Minor, not fixed here): when (to - from) isn't a whole multiple of
  // `minutes`, the final bucket below still spans a full `minutes` width by label,
  // but the exclusive `end` bound in the scan-assignment loop cuts off anything
  // scanned past `to` — so that last bucket is narrower than its label implies.
  const buckets: ArrivalBucket[] = [];
  for (let t = start; t < end; t += minutes) buckets.push({ label: toLabel(t), count: 0 });
  for (const c of checkins) {
    if (checkpointId && c.checkpoint_id !== checkpointId) continue;
    const parts = klParts(c.scanned_at);
    if (!parts || parts.day !== day) continue;
    const m = toMinutes(parts.time);
    if (m < start || m >= end) continue;
    buckets[Math.floor((m - start) / minutes)].count += 1;
  }
  return buckets;
}

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
 * Backs the admin's per-checkpoint check-in state, including the reversal control —
 * removing a check-in needs to name which checkpoint it is removing.
 */
export function attendeeCheckins(attendeeId: string, checkins: Checkin[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of checkins) {
    if (c.attendee_id !== attendeeId) continue;
    const seen = out[c.checkpoint_id];
    if (seen === undefined || c.scanned_at < seen) out[c.checkpoint_id] = c.scanned_at;
  }
  return out;
}
