import { isoToLocalInput } from "@/lib/time";
import type { Checkin } from "@/lib/types";

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
