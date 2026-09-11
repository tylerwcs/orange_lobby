import { describe, it, expect } from "vitest";
import { arrivalBuckets, arrivalWindow, attendeeCheckins, checkinStatus, countByCheckpoint, recentScans } from "@/lib/checkins-stats";
import type { Attendee, Checkin } from "@/lib/types";

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

const attendee = (id: string, name: string, over: Partial<Attendee> = {}): Attendee => ({
  id, org_id: "o1", event_id: "e1", token: `t-${id}`, name, email: null, phone: null,
  company: "Ecopia Events", category: null, table_no: "12", seat_no: null, extra: {},
  source: "import", status: "active", ...over,
});

describe("checkinStatus", () => {
  it("reports expected when nothing was scanned", () => {
    expect(checkinStatus("a1", [])).toEqual({ status: "expected", at: null });
  });

  it("reports checked in with the scan time", () => {
    const rows = [scan("c1", "2026-09-30T08:41:00+08:00", "a1")];
    expect(checkinStatus("a1", rows)).toEqual({ status: "checked_in", at: "2026-09-30T08:41:00+08:00" });
  });

  it("reports the earliest scan when there are several", () => {
    const rows = [
      scan("c2", "2026-09-30T18:30:00+08:00", "a1", "cp2"),
      scan("c1", "2026-09-30T08:41:00+08:00", "a1", "cp1"),
    ];
    expect(checkinStatus("a1", rows).at).toBe("2026-09-30T08:41:00+08:00");
  });

  it("ignores other attendees' scans", () => {
    expect(checkinStatus("a2", [scan("c1", "2026-09-30T08:41:00+08:00", "a1")]).status).toBe("expected");
  });
});

describe("recentScans", () => {
  const people = [attendee("a1", "CS Wong"), attendee("a2", "Priya Ramasamy", { company: "Ecopia Labs", table_no: "03" })];

  it("returns newest first and honours the limit", () => {
    const rows = [
      scan("c1", "2026-09-30T08:41:00+08:00", "a1"),
      scan("c2", "2026-09-30T09:12:00+08:00", "a2"),
      scan("c3", "2026-09-30T08:58:00+08:00", "a1"),
    ];
    const out = recentScans(rows, people, 2);
    expect(out.map((r) => r.checkinId)).toEqual(["c2", "c3"]);
    expect(out[0].name).toBe("Priya Ramasamy");
    expect(out[0].tableNo).toBe("03");
  });

  it("marks the later of two scans at the same checkpoint as a duplicate", () => {
    const rows = [
      scan("c1", "2026-09-30T08:58:00+08:00", "a1", "cp1"),
      scan("c2", "2026-09-30T09:12:00+08:00", "a1", "cp1"),
    ];
    const out = recentScans(rows, people, 10);
    expect(out.map((r) => [r.checkinId, r.duplicate])).toEqual([["c2", true], ["c1", false]]);
  });

  it("breaks a scanned_at tie deterministically, independent of input order", () => {
    const at = "2026-09-30T08:58:00+08:00";
    const rows = [scan("c1", at, "a1", "cp1"), scan("c2", at, "a1", "cp1")];

    const out = recentScans(rows, people, 10);
    const flags = new Map(out.map((r) => [r.checkinId, r.duplicate]));
    expect(flags.get("c1")).toBe(false);
    expect(flags.get("c2")).toBe(true);

    // Reversing the input order must not change which row is the original.
    const reversed = recentScans([rows[1], rows[0]], people, 10);
    const flagsReversed = new Map(reversed.map((r) => [r.checkinId, r.duplicate]));
    expect(flagsReversed.get("c1")).toBe(false);
    expect(flagsReversed.get("c2")).toBe(true);
  });

  it("does not treat a second checkpoint as a duplicate", () => {
    const rows = [
      scan("c1", "2026-09-30T08:58:00+08:00", "a1", "cp1"),
      scan("c2", "2026-09-30T18:31:00+08:00", "a1", "cp2"),
    ];
    expect(recentScans(rows, people, 10).every((r) => !r.duplicate)).toBe(true);
  });

  it("survives a scan whose attendee row is gone", () => {
    const out = recentScans([scan("c1", "2026-09-30T08:41:00+08:00", "ghost")], people, 10);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Removed attendee");
    expect(out[0].company).toBeNull();
    expect(out[0].tableNo).toBeNull();
  });
});

describe("countByCheckpoint", () => {
  it("returns an empty map for no scans", () => {
    expect(countByCheckpoint([])).toEqual({});
  });

  it("counts scans per checkpoint", () => {
    const rows = [
      scan("c1", "2026-09-30T08:41:00+08:00", "a1", "cp1"),
      scan("c2", "2026-09-30T08:58:00+08:00", "a2", "cp1"),
      scan("c3", "2026-09-30T09:12:00+08:00", "a3", "cp2"),
    ];
    expect(countByCheckpoint(rows)).toEqual({ cp1: 2, cp2: 1 });
  });

  it("leaves a checkpoint with no scans absent, rather than present at 0", () => {
    const rows = [scan("c1", "2026-09-30T08:41:00+08:00", "a1", "cp1")];
    const counts = countByCheckpoint(rows);
    expect(counts).toEqual({ cp1: 1 });
    expect("cp2" in counts).toBe(false);
  });
});

describe("attendeeCheckins", () => {
  it("returns an empty map when the attendee has never been scanned", () => {
    expect(attendeeCheckins("a1", [])).toEqual({});
    expect(attendeeCheckins("a1", [scan("c1", "2026-09-30T08:41:00+08:00", "a2", "cp1")])).toEqual({});
  });

  it("maps each checkpoint the attendee was scanned at to that scan time", () => {
    const rows = [
      scan("c1", "2026-09-30T08:41:00+08:00", "a1", "cp1"),
      scan("c2", "2026-09-30T18:31:00+08:00", "a1", "cp2"),
    ];
    expect(attendeeCheckins("a1", rows)).toEqual({
      cp1: "2026-09-30T08:41:00+08:00",
      cp2: "2026-09-30T18:31:00+08:00",
    });
  });

  it("keeps the earliest scan when the same checkpoint has more than one", () => {
    const rows = [
      scan("c2", "2026-09-30T09:12:00+08:00", "a1", "cp1"),
      scan("c1", "2026-09-30T08:41:00+08:00", "a1", "cp1"),
    ];
    expect(attendeeCheckins("a1", rows)).toEqual({ cp1: "2026-09-30T08:41:00+08:00" });
  });

  it("ignores other attendees at the same checkpoint", () => {
    const rows = [
      scan("c1", "2026-09-30T08:41:00+08:00", "a1", "cp1"),
      scan("c2", "2026-09-30T08:42:00+08:00", "a2", "cp1"),
    ];
    expect(attendeeCheckins("a2", rows)).toEqual({ cp1: "2026-09-30T08:42:00+08:00" });
  });
});

describe("arrivalWindow", () => {
  it("returns null when nothing was scanned that day", () => {
    expect(arrivalWindow([], { day: "2026-09-30", minutes: 15 })).toBeNull();
    expect(arrivalWindow([scan("c1", "2026-10-01T08:52:00+08:00")], { day: "2026-09-30", minutes: 15 })).toBeNull();
  });

  it("starts at the bucket holding the first scan and ends after the bucket holding the last", () => {
    const rows = [
      scan("c1", "2026-09-30T08:05:00+08:00"),
      scan("c2", "2026-09-30T09:50:00+08:00"),
    ];
    expect(arrivalWindow(rows, { day: "2026-09-30", minutes: 15 })).toEqual({ from: "08:00", to: "10:00" });
  });

  it("widens a single scan to a readable minimum rather than one lonely bucket", () => {
    const out = arrivalWindow([scan("c1", "2026-09-30T08:52:00+08:00")], { day: "2026-09-30", minutes: 15 });
    expect(out).toEqual({ from: "08:45", to: "09:45" });
  });

  it("honours the checkpoint filter", () => {
    const rows = [
      scan("c1", "2026-09-30T08:05:00+08:00", "a1", "cp1"),
      scan("c2", "2026-09-30T18:20:00+08:00", "a2", "cp2"),
    ];
    expect(arrivalWindow(rows, { day: "2026-09-30", minutes: 15, checkpointId: "cp2" })).toEqual({ from: "18:15", to: "19:15" });
  });

  it("reads the instant in Malaysian time", () => {
    const out = arrivalWindow([scan("c1", "2026-09-30T00:52:00Z")], { day: "2026-09-30", minutes: 15 });
    expect(out?.from).toBe("08:45");
  });
});
