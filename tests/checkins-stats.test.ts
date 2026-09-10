import { describe, it, expect } from "vitest";
import { arrivalBuckets } from "@/lib/checkins-stats";
import type { Checkin } from "@/lib/types";

/** `scanned_at` is stored as an absolute instant; these are Malaysian wall-clock times (UTC+8). */
const scan = (id: string, at: string, attendee = "a1", checkpoint = "cp1"): Checkin => ({
  id, event_id: "e1", checkpoint_id: checkpoint, attendee_id: attendee, scanned_by: null, scanned_at: at,
});

const OPTS = { day: "2026-09-30", from: "08:30", to: "09:30", minutes: 15 };

describe("arrivalBuckets", () => {
  it("returns every bucket in the window, including empty ones", () => {
    expect(arrivalBuckets([], OPTS)).toEqual([
      { label: "08:30", count: 0 }, { label: "08:45", count: 0 },
      { label: "09:00", count: 0 }, { label: "09:15", count: 0 },
    ]);
  });

  it("counts a scan into its bucket", () => {
    const out = arrivalBuckets([scan("c1", "2026-09-30T08:52:00+08:00")], OPTS);
    expect(out.map((b) => b.count)).toEqual([0, 1, 0, 0]);
  });

  it("puts a scan exactly on a boundary into the later bucket", () => {
    const out = arrivalBuckets([scan("c1", "2026-09-30T08:45:00+08:00")], OPTS);
    expect(out.map((b) => b.count)).toEqual([0, 1, 0, 0]);
  });

  it("excludes scans before the window, at the exclusive end, and after it", () => {
    const out = arrivalBuckets([
      scan("c1", "2026-09-30T08:29:00+08:00"),
      scan("c2", "2026-09-30T09:30:00+08:00"),
      scan("c3", "2026-09-30T11:00:00+08:00"),
    ], OPTS);
    expect(out.map((b) => b.count)).toEqual([0, 0, 0, 0]);
  });

  it("excludes scans on another day", () => {
    const out = arrivalBuckets([scan("c1", "2026-10-01T08:52:00+08:00")], OPTS);
    expect(out.map((b) => b.count)).toEqual([0, 0, 0, 0]);
  });

  it("reads the instant in Malaysian time, not UTC", () => {
    // 2026-09-30T00:52Z is 08:52 in Kuala Lumpur on the same date.
    const out = arrivalBuckets([scan("c1", "2026-09-30T00:52:00Z")], OPTS);
    expect(out.map((b) => b.count)).toEqual([0, 1, 0, 0]);
  });

  it("filters to one checkpoint when asked", () => {
    const rows = [
      scan("c1", "2026-09-30T08:52:00+08:00", "a1", "cp1"),
      scan("c2", "2026-09-30T08:52:00+08:00", "a2", "cp2"),
    ];
    expect(arrivalBuckets(rows, OPTS).map((b) => b.count)).toEqual([0, 2, 0, 0]);
    expect(arrivalBuckets(rows, { ...OPTS, checkpointId: "cp2" }).map((b) => b.count)).toEqual([0, 1, 0, 0]);
  });
});
