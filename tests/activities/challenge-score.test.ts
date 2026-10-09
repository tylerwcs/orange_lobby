import { describe, expect, it } from "vitest";
import { scoreChallenge, type DailyTotal, type Team } from "@/features/activities/lib/challenge-score";
import { challengeWeeks } from "@/features/activities/lib/challenge";
import type { ChallengeScoring } from "@/lib/types";

const S: ChallengeScoring = {
  metric_key: "km", daily_min: 1, starts_on: "2026-10-05", ends_on: "2026-12-04",
  daily_steps: [{ at: 1, pts: 1 }, { at: 3, pts: 2 }, { at: 5, pts: 4 }, { at: 8, pts: 6 }, { at: 10, pts: 8 }],
  team_bonus: 20, podium: [20, 12, 6],
};
const WEEKS = challengeWeeks(S, "2026-09-28");
const WEEK2 = WEEKS[0].days; // 5–11 Oct
const t = (attendeeId: string, groupId: string | null, day: string, km: number): DailyTotal => ({ attendeeId, groupId, day, km });
const everyDay = (a: string, g: string, km = 1, days = WEEK2) => days.map((d) => t(a, g, d, km));

const TEAMS: Team[] = [
  { id: "A", name: "Group 01", memberIds: ["a1", "a2"] },
  { id: "B", name: "Group 02", memberIds: ["b1", "b2"] },
  { id: "C", name: "Group 03", memberIds: ["c1"] },
  { id: "D", name: "Group 04", memberIds: ["d1"] },
];
const score = (totals: DailyTotal[], today = "2026-10-12", disqualified = new Set<string>(), teams = TEAMS) =>
  scoreChallenge({ totals, teams, disqualified, scoring: S, weeks: WEEKS, today });

describe("Tier 1 — daily points (D377)", () => {
  it("scores each person-day on the steps and sums them per team", () => {
    const s = score([t("a1", "A", "2026-10-05", 6), t("a2", "A", "2026-10-05", 0.99), t("a2", "A", "2026-10-06", 10)], "2026-10-06");
    expect(s.weeks[0].teams.A.tier1).toBe(4 + 0 + 8);
    expect(s.weeks[0].teams.A.km).toBe(16.99);
  });

  it("counts Tier 1 straight away, before the week ends", () => {
    expect(score([t("a1", "A", "2026-10-05", 3)], "2026-10-05").standings.find((x) => x.id === "A")!.total).toBe(2);
  });
});

describe("Tier 2 — team bonus (D377)", () => {
  it("awards the bonus when every current member logged every day, once the week has ended", () => {
    const totals = [...everyDay("a1", "A"), ...everyDay("a2", "A")];
    expect(score(totals, "2026-10-12").weeks[0].teams.A.bonus).toBe(20);
    expect(score(totals, "2026-10-11").weeks[0].teams.A.bonus).toBe(0);
  });

  it("withholds it when one member misses one day", () => {
    const totals = [...everyDay("a1", "A"), ...everyDay("a2", "A").filter((x) => x.day !== "2026-10-09")];
    expect(score(totals).weeks[0].teams.A.bonus).toBe(0);
  });

  it("shows progress during the week as members on track", () => {
    const totals = [...everyDay("a1", "A").slice(0, 3), t("a2", "A", "2026-10-05", 1)];
    const w = score(totals, "2026-10-08").weeks[0].teams.A;
    expect(w.onTrack).toBe(1);
    expect(w.members).toBe(2);
  });

  it("uses the five days of the last week", () => {
    const last = WEEKS[8].days;
    const totals = [...everyDay("a1", "A", 1, last), ...everyDay("a2", "A", 1, last)];
    expect(score(totals, "2026-12-05").weeks[8].teams.A.bonus).toBe(20);
  });

  it("judges current members, wherever their km was stamped", () => {
    const moved: Team[] = [{ id: "A", name: "Group 01", memberIds: ["a1", "x"] }, ...TEAMS.slice(1)];
    const totals = [...everyDay("a1", "A"), ...everyDay("x", "B").slice(0, 3), ...everyDay("x", "A").slice(3)];
    expect(score(totals, "2026-10-12", new Set(), moved).weeks[0].teams.A.bonus).toBe(20);
  });
});

describe("Tier 3 — podium (D377)", () => {
  it("gives 20, 12 and 6 to the top three km once the week ends", () => {
    const totals = [t("a1", "A", "2026-10-05", 30), t("b1", "B", "2026-10-05", 20), t("c1", "C", "2026-10-05", 10), t("d1", "D", "2026-10-05", 5)];
    const w = score(totals).weeks[0].teams;
    expect([w.A.podium, w.B.podium, w.C.podium, w.D.podium]).toEqual([20, 12, 6, 0]);
    expect(score(totals, "2026-10-11").weeks[0].teams.A.podium).toBe(0);
  });

  it("shares a tied place and skips the next one", () => {
    const totals = [t("a1", "A", "2026-10-05", 20), t("b1", "B", "2026-10-05", 20), t("c1", "C", "2026-10-05", 10)];
    const w = score(totals).weeks[0].teams;
    expect([w.A.podium, w.B.podium, w.C.podium]).toEqual([20, 20, 6]);
  });

  it("gives nothing to a team with no km", () => {
    expect(score([t("a1", "A", "2026-10-05", 3)]).weeks[0].teams.B.podium).toBe(0);
  });
});

describe("standings and Void (D380)", () => {
  it("ranks teams by total, ties sharing a rank", () => {
    const s = score([t("a1", "A", "2026-10-05", 3), t("b1", "B", "2026-10-05", 3), t("c1", "C", "2026-10-05", 1)], "2026-10-05");
    expect(s.standings.map((x) => [x.id, x.total, x.rank])).toEqual([["A", 2, 1], ["B", 2, 1], ["C", 1, 3], ["D", 0, 4]]);
  });

  it("voids a team with a disqualified member, puts it last and takes it off the podium", () => {
    const totals = [t("a1", "A", "2026-10-05", 30), t("b1", "B", "2026-10-05", 20), t("c1", "C", "2026-10-05", 10), t("d1", "D", "2026-10-05", 5)];
    const s = score(totals, "2026-10-12", new Set(["a2"]));
    const last = s.standings[s.standings.length - 1];
    expect(last).toMatchObject({ id: "A", void: true, rank: null });
    const w = s.weeks[0].teams;
    expect([w.B.podium, w.C.podium, w.D.podium]).toEqual([20, 12, 6]);
  });

  it("knows a person's km on a day, across teams", () => {
    expect(score([t("a1", "A", "2026-10-05", 2), t("a1", "B", "2026-10-05", 1.5)]).personKm("a1", "2026-10-05")).toBe(3.5);
  });
});
