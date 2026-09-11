import { describe, it, expect } from "vitest";
import { attendeeCheckins, checkedInCount, checkinStatus, countByCheckpoint, recentScans } from "@/lib/checkins-stats";
import type { Attendee, Checkin } from "@/lib/types";

/** `scanned_at` is stored as an absolute instant; these are Malaysian wall-clock times (UTC+8). */
const scan = (id: string, at: string, attendee = "a1", checkpoint = "cp1", by: string | null = null): Checkin => ({
  id, event_id: "e1", checkpoint_id: checkpoint, attendee_id: attendee, scanned_by: by, scanned_at: at,
});

const attendee = (id: string, name: string, over: Partial<Attendee> = {}): Attendee => ({
  id, org_id: "o1", event_id: "e1", token: `t-${id}`, name, email: null, phone: null,
  company: "Ecopia Events", category: null, table_no: "12", extra: {},
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

  it("maps each checkpoint the attendee was scanned at to when it happened and who did it", () => {
    const rows = [
      scan("c1", "2026-09-30T08:41:00+08:00", "a1", "cp1", "crew-1"),
      scan("c2", "2026-09-30T18:31:00+08:00", "a1", "cp2"),
    ];
    expect(attendeeCheckins("a1", rows)).toEqual({
      cp1: { at: "2026-09-30T08:41:00+08:00", by: "crew-1" },
      cp2: { at: "2026-09-30T18:31:00+08:00", by: null },
    });
  });

  it("keeps the earliest scan when the same checkpoint has more than one, and its scanner with it", () => {
    const rows = [
      scan("c2", "2026-09-30T09:12:00+08:00", "a1", "cp1", "crew-2"),
      scan("c1", "2026-09-30T08:41:00+08:00", "a1", "cp1", "crew-1"),
    ];
    expect(attendeeCheckins("a1", rows)).toEqual({ cp1: { at: "2026-09-30T08:41:00+08:00", by: "crew-1" } });
  });

  it("ignores other attendees at the same checkpoint", () => {
    const rows = [
      scan("c1", "2026-09-30T08:41:00+08:00", "a1", "cp1"),
      scan("c2", "2026-09-30T08:42:00+08:00", "a2", "cp1"),
    ];
    expect(attendeeCheckins("a2", rows)).toEqual({ cp1: { at: "2026-09-30T08:42:00+08:00", by: null } });
  });
});

describe("checkedInCount", () => {
  const rows = [
    scan("c1", "2026-09-30T08:41:00+08:00", "a1", "cp1"),
    scan("c2", "2026-09-30T18:31:00+08:00", "a1", "cp2"),
    scan("c3", "2026-09-30T08:52:00+08:00", "a2", "cp1"),
    scan("c4", "2026-09-30T19:02:00+08:00", "a3", "cp2"),
  ];

  it("counts nobody when there are no scans", () => {
    expect(checkedInCount([])).toBe(0);
    expect(checkedInCount([], "cp1")).toBe(0);
  });

  it("counts people, not scans, when counting across every checkpoint", () => {
    // a1 was scanned at registration and again at dinner: one person in the room, not two.
    expect(checkedInCount(rows)).toBe(3);
  });

  it("counts only the named checkpoint", () => {
    expect(checkedInCount(rows, "cp1")).toBe(2);
    expect(checkedInCount(rows, "cp2")).toBe(2);
  });

  it("counts nobody at a checkpoint with no scans", () => {
    expect(checkedInCount(rows, "cp-none")).toBe(0);
  });

  it("treats null and undefined as every checkpoint, not as one that does not exist", () => {
    expect(checkedInCount(rows, null)).toBe(3);
    expect(checkedInCount(rows, undefined)).toBe(3);
  });
});
