import { describe, expect, it } from "vitest";
import { buildTracker, dailyKm, teamDayRows } from "@/lib/tracker";
import type { ActivitySubmission, ChallengeScoring } from "@/lib/types";

const S: ChallengeScoring = {
  metric_key: "km", daily_min: 1, starts_on: "2026-10-05", ends_on: "2026-12-04",
  daily_steps: [{ at: 1, pts: 1 }, { at: 3, pts: 2 }, { at: 5, pts: 4 }, { at: 8, pts: 6 }, { at: 10, pts: 8 }],
};
let n = 0;
const e = (day: string, km: string, over: Partial<ActivitySubmission> = {}): ActivitySubmission => ({
  id: `s${++n}`, event_id: "e", activity_id: "m", attendee_id: "a1", group_id: "g1", answers: { km },
  // A zero-padded counter, so created_at sorts in the order the fixtures were made.
  submitted_on: day, status: "submitted", per_day: false, created_at: `${day}T00:00:00.${String(n).padStart(6, "0")}Z`,
  revoked_at: null, revoked_by: null, edited_at: null, edited_by: null, ...over,
});
const build = (entries: ActivitySubmission[], today: string, requested: string | null = null) =>
  buildTracker({ scoring: S, eventStartsOn: "2026-09-28", entries, today, requested })!;

describe("dailyKm", () => {
  it("sums live entries per day and ignores revoked ones", () => {
    const m = dailyKm([e("2026-10-06", "3"), e("2026-10-06", "3.2"), e("2026-10-06", "9", { status: "revoked" })], "km");
    expect(m.get("2026-10-06")).toBe(6.2);
  });
});

describe("buildTracker (D374)", () => {
  it("draws the week strip states", () => {
    const t = build([e("2026-10-05", "2"), e("2026-10-07", "0.5"), e("2026-10-08", "1")], "2026-10-08");
    expect(t.week.number).toBe(2);
    expect(t.days.map((d) => d.state)).toEqual(["logged", "missed", "missed", "today", "future", "future", "future"]);
    expect(t.days[3].logged).toBe(true);
    expect(t.days.map((d) => d.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });

  it("shows today's km, points and the next goal", () => {
    const t = build([e("2026-10-06", "3"), e("2026-10-06", "1.2")], "2026-10-06");
    expect(t.km).toBe(4.2);
    expect(t.pts).toBe(2);
    expect(t.goal).toEqual({ at: 5, pts: 4, gap: 0.8 });
    expect(t.marks).toEqual([1, 3, 5, 8, 10]);
    expect(t.full).toBe(10);
  });

  it("has no goal once the top step is reached", () => {
    expect(build([e("2026-10-06", "12")], "2026-10-06").goal).toBeNull();
  });

  it("counts the streak back from today, or from yesterday while today is not logged yet", () => {
    const entries = [e("2026-10-05", "1"), e("2026-10-06", "1"), e("2026-10-07", "1")];
    expect(build(entries, "2026-10-07").streak).toBe(3);
    expect(build(entries, "2026-10-08").streak).toBe(3);
    expect(build(entries, "2026-10-09").streak).toBe(0);
  });

  it("adds up this week's points to today", () => {
    expect(build([e("2026-10-05", "6"), e("2026-10-06", "3")], "2026-10-06").weekPts).toBe(6);
  });

  it("opens a requested day, with that day's entries oldest first, revoked ones included", () => {
    const t = build([e("2026-10-05", "2"), e("2026-10-05", "4", { status: "revoked" }), e("2026-10-06", "1")], "2026-10-06", "2026-10-05");
    expect(t.selected).toBe("2026-10-05");
    expect(t.isToday).toBe(false);
    expect(t.km).toBe(2);
    expect(t.entries.map((x) => x.answers.km)).toEqual(["2", "4"]);
  });

  it("clamps a day outside the challenge, and ignores junk", () => {
    expect(build([], "2026-10-02").selected).toBe("2026-10-05");
    expect(build([], "2026-12-20").selected).toBe("2026-12-04");
    expect(build([], "2026-10-06", "nonsense").selected).toBe("2026-10-06");
    // Well-formed but not a real day (D374): a hand-edited URL must not take the page down.
    expect(build([], "2026-10-06", "2026-11-31").selected).toBe("2026-10-06");
    expect(build([], "2026-10-06", "2026-10-32").selected).toBe("2026-10-06");
  });

  it("links to the previous week, and to the next one only once it has started", () => {
    const t = build([], "2026-10-13");
    expect(t.week.number).toBe(3);
    expect(t.prev).toBe("2026-10-05");
    expect(t.next).toBeNull();
    expect(build([], "2026-10-13", "2026-10-05").next).toBe("2026-10-12");
  });

  it("shows only Mon–Fri in the last week", () => {
    expect(build([], "2026-12-02").days.map((d) => d.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  });

  it("works without points steps: the ring marks the daily minimum and points are hidden", () => {
    const t = buildTracker({ scoring: { ...S, daily_steps: undefined }, eventStartsOn: null, entries: [e("2026-10-06", "0.5")], today: "2026-10-06", requested: null })!;
    expect(t.pts).toBeNull();
    expect(t.weekPts).toBeNull();
    expect(t.marks).toEqual([1]);
    expect(t.goal).toEqual({ at: 1, pts: 0, gap: 0.5 });
  });
});

describe("teamDayRows (D379, D383)", () => {
  const names = new Map([["a", "Aida"], ["b", "Ben"], ["c", "Chong"]]);
  const km: Record<string, number> = { a: 3, b: 0, c: 0.5 };
  const rows = (day: string, today: string) =>
    teamDayRows({ memberIds: ["a", "b", "c"], names, kmOf: (id) => km[id], dailyMin: 1, day, today });

  it("puts the ones still to log first on a day that has come", () => {
    expect(rows("2026-10-06", "2026-10-06").map((r) => [r.name, r.state])).toEqual([["Ben", "missing"], ["Chong", "missing"], ["Aida", "logged"]]);
    expect(rows("2026-10-05", "2026-10-06").map((r) => r.state)).toEqual(["missing", "missing", "logged"]);
  });

  it("marks every member future, in name order, on a day still to come", () => {
    expect(rows("2026-10-07", "2026-10-06").map((r) => [r.name, r.state])).toEqual([["Aida", "future"], ["Ben", "future"], ["Chong", "future"]]);
  });

  it("names a member it can't find Unknown", () => {
    const r = teamDayRows({ memberIds: ["z"], names, kmOf: () => 0, dailyMin: 1, day: "2026-10-06", today: "2026-10-06" });
    expect(r[0].name).toBe("Unknown");
  });
});
