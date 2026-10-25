import { describe, expect, it } from "vitest";
import { scoreChallenge, type DailyTotal, type Team } from "@/features/activities/lib/challenge-score";
import { challengeWeeks } from "@/features/activities/lib/challenge";
import { mergeDisqualified, sameCalendar, scorePair } from "@/features/tracks/combined";
import type { ChallengeScoring } from "@/lib/types";

const KM: ChallengeScoring = {
  metric_key: "km", unit: "km", daily_min: 1, starts_on: "2026-10-26", ends_on: "2026-12-04", week_origin: "challenge", void: "week",
  daily_steps: [{ at: 1, pts: 1 }, { at: 3, pts: 2 }, { at: 5, pts: 3 }, { at: 8, pts: 4 }, { at: 10, pts: 5 }], podium: [15, 10, 5],
};
const MIN: ChallengeScoring = {
  metric_key: "minutes", unit: "min", daily_min: 20, starts_on: "2026-10-26", ends_on: "2026-12-04", week_origin: "challenge", void: "week",
  daily_steps: [{ at: 20, pts: 1 }, { at: 30, pts: 2 }, { at: 45, pts: 3 }, { at: 60, pts: 4 }, { at: 120, pts: 5 }], podium: [15, 10, 5],
};
const WEEKS = challengeWeeks(KM, null);
const WEEK1 = WEEKS[0].days; // 26 Oct – 1 Nov
const AFTER = "2026-11-02";
const t = (attendeeId: string, groupId: string, day: string, km: number): DailyTotal => ({ attendeeId, groupId, day, km });
const daily = (who: string, team: string, value: number, days = WEEK1) => days.map((d) => t(who, team, d, value));

const TEAMS: Team[] = [{ id: "T1", name: "Group 01", memberIds: ["x", "y"] }, { id: "T2", name: "Group 02", memberIds: ["z"] }];

function pair(a: DailyTotal[], b: DailyTotal[], opts: { teams?: Team[]; dq?: Map<string, string | null>; today?: string; adjA?: Map<string, number> } = {}) {
  const teams = opts.teams ?? TEAMS;
  const disqualified = opts.dq ?? new Map<string, string | null>();
  const today = opts.today ?? AFTER;
  const sa = scoreChallenge({ totals: a, teams, disqualified, scoring: KM, weeks: WEEKS, today, adjustments: opts.adjA });
  const sb = scoreChallenge({ totals: b, teams, disqualified, scoring: MIN, weeks: WEEKS, today });
  return { sa, sb, p: scorePair({ a: sa, b: sb, aScoring: KM, bScoring: MIN, teams, bonus: 10, today }) };
}

describe("scorePair — the bonus across tracks (D727)", () => {
  it("awards +10 when every member logs every day, each on their own track", () => {
    const { p } = pair(daily("x", "T1", 1), daily("y", "T1", 20));
    expect(p.weeks[0].teams.T1.bonus).toBe(10);
  });
  it("awards nothing when one member misses one day", () => {
    const { p } = pair(daily("x", "T1", 1), daily("y", "T1", 20, WEEK1.slice(1)));
    expect(p.weeks[0].teams.T1.bonus).toBe(0);
  });
  it("counts a member with no entries at all - no track still means a member", () => {
    const teams = [{ id: "T1", name: "Group 01", memberIds: ["x", "y", "nobody"] }];
    const { p } = pair(daily("x", "T1", 1), daily("y", "T1", 20), { teams });
    expect(p.weeks[0].teams.T1.bonus).toBe(0);
  });
  it("takes a mid-week move: days on either track count, and both tracks' points add up", () => {
    const { p } = pair(daily("x", "T1", 1, WEEK1.slice(0, 3)), [...daily("x", "T1", 20, WEEK1.slice(3)), ...daily("y", "T1", 20)]);
    const w = p.weeks[0].teams.T1;
    expect(w.bonus).toBe(10);
    expect(w.a).toBe(3 + 15); // 3 days at 1 pt, plus Track A's podium (the only team with km)
    expect(w.b).toBe(4 + 7 + 15);
  });
  it("gives no bonus before the week has ended", () => {
    const { p } = pair(daily("x", "T1", 1), daily("y", "T1", 20), { today: "2026-11-01" });
    expect(p.weeks[0].teams.T1.bonus).toBe(0);
  });
  it("counts how many members are on track so far, on either track", () => {
    const { p } = pair(daily("x", "T1", 1, WEEK1.slice(0, 2)), daily("y", "T1", 20, WEEK1.slice(0, 1)), { today: "2026-10-28" });
    expect([p.weeks[0].teams.T1.onTrack, p.weeks[0].teams.T1.members]).toEqual([1, 2]);
  });
});

describe("a disqualification across the pair (D726)", () => {
  it("merges the two tracks' lists, a season void or the earliest week winning", () => {
    expect(mergeDisqualified(new Map([["x", "2026-11-02"]]), new Map([["x", "2026-10-26"]])).get("x")).toBe("2026-10-26");
    expect(mergeDisqualified(new Map([["x", "2026-11-02"]]), new Map([["x", null]])).get("x")).toBeNull();
    expect(mergeDisqualified(new Map([["x", "2026-11-02"]]), new Map([["y", "2026-10-26"]])).size).toBe(2);
  });
  it("voids the team's week on both tracks and its bonus", () => {
    const dq = new Map<string, string | null>([["x", "2026-10-26"]]);
    const { p } = pair(daily("x", "T1", 1), daily("y", "T1", 20), { dq });
    const w = p.weeks[0].teams.T1;
    expect([w.a, w.b, w.bonus, w.void]).toEqual([0, 0, 0, true]);
  });
});

describe("pair standings (D727)", () => {
  it("adds both tracks' points, ad hoc points and the bonus into one total", () => {
    const { sa, sb, p } = pair([...daily("x", "T1", 5), t("z", "T2", WEEK1[0], 1)], daily("y", "T1", 45), { adjA: new Map([["T1", 2]]) });
    const a = sa.standings.find((s) => s.id === "T1")!, b = sb.standings.find((s) => s.id === "T1")!;
    const row = p.standings.find((s) => s.id === "T1")!;
    expect(row.a).toBe(a.tier1 + a.podium + a.adjust);
    expect(row.b).toBe(b.tier1 + b.podium + b.adjust);
    expect(row.bonus).toBe(10);
    expect(row.total).toBe(row.a + row.b + 10);
    expect(row.rank).toBe(1);
    expect(p.standings.find((s) => s.id === "T2")!.rank).toBe(2);
  });
});

describe("sameCalendar (D727)", () => {
  it("needs the same dates and week numbering on both tracks", () => {
    expect(sameCalendar(KM, MIN)).toBe(true);
    expect(sameCalendar(KM, { ...MIN, starts_on: "2026-10-27" })).toBe(false);
    expect(sameCalendar(KM, { ...MIN, week_origin: undefined })).toBe(false);
  });
});
