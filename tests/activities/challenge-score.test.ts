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
const score = (totals: DailyTotal[], today = "2026-10-12", disqualified = new Map<string, string | null>(), teams = TEAMS, scoring = S) =>
  scoreChallenge({ totals, teams, disqualified, scoring, weeks: WEEKS, today });

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
    expect(score(totals, "2026-10-12", new Map(), moved).weeks[0].teams.A.bonus).toBe(20);
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
    const s = score(totals, "2026-10-12", new Map([["a2", null]]));
    const last = s.standings[s.standings.length - 1];
    expect(last).toMatchObject({ id: "A", void: true, rank: null });
    const w = s.weeks[0].teams;
    expect([w.B.podium, w.C.podium, w.D.podium]).toEqual([20, 12, 6]);
  });

  it("ignores a stored week under the default season void", () => {
    const s = score([t("a1", "A", "2026-10-05", 30)], "2026-10-12", new Map([["a2", "2026-10-05"]]));
    expect(s.standings.find((x) => x.id === "A")).toMatchObject({ void: true, rank: null });
    expect(s.weeks[0].teams.A.void).toBe(false);
  });

  it("knows a person's km on a day, across teams", () => {
    expect(score([t("a1", "A", "2026-10-05", 2), t("a1", "B", "2026-10-05", 1.5)]).personKm("a1", "2026-10-05")).toBe(3.5);
  });
});

describe("Ultra-Effort ranking (D468)", () => {
  const SM: ChallengeScoring = { ...S, void: "week" };
  const vr = (s: ReturnType<typeof score>) => Object.fromEntries(s.standings.map((x) => [x.id, x.volumeRank]));

  it("ranks teams by season total, a tie sharing a rank", () => {
    const s = score([t("a1", "A", "2026-10-05", 900), t("b1", "B", "2026-10-05", 1200), t("c1", "C", "2026-10-05", 1200)]);
    expect(vr(s)).toMatchObject({ A: 3, B: 1, C: 1 });
  });

  it("leaves a team with no total unranked", () => {
    const s = score([t("a1", "A", "2026-10-05", 900)]);
    expect(vr(s)).toEqual({ A: 1, B: null, C: null, D: null });
  });

  it("leaves a season-void team unranked and the teams behind it move up", () => {
    const s = score([t("a1", "A", "2026-10-05", 2000), t("b1", "B", "2026-10-05", 1200), t("c1", "C", "2026-10-05", 900)], "2026-10-12", new Map([["a2", null]]));
    expect(vr(s)).toMatchObject({ A: null, B: 1, C: 2 });
  });

  it("ranks on the season total without the voided week (D467)", () => {
    const W1 = WEEKS[0].days[0], W2 = WEEKS[1].days[0];
    const totals = [t("a1", "A", W1, 500), t("a1", "A", W2, 100), t("b1", "B", W1, 400), t("b1", "B", W2, 100)];
    // A is void in week 1, so its season total is 100 against B's 500.
    const s = score(totals, "2026-10-19", new Map([["a2", W1]]), TEAMS, SM);
    expect(vr(s)).toMatchObject({ A: 2, B: 1 });
  });
});

describe("a week void (D467)", () => {
  const SW: ChallengeScoring = { ...S, void: "week" };
  const [W1, W2] = [WEEKS[0].days, WEEKS[1].days]; // 5–11 Oct, 12–18 Oct
  const dq = (weekOf: string | null) => new Map([["a2", weekOf]]);
  const race = [
    t("a1", "A", W1[0], 30), t("b1", "B", W1[0], 20), t("c1", "C", W1[0], 10), t("d1", "D", W1[0], 5),
    t("a1", "A", W2[0], 30), t("a2", "A", W2[0], 50), t("b1", "B", W2[0], 20), t("c1", "C", W2[0], 10),
  ];

  it("zeroes the team for that week only, and the teams behind move up its podium", () => {
    const s = score(race, "2026-10-19", dq(W1[0]), TEAMS, SW);
    expect(s.weeks[0].teams.A).toMatchObject({ tier1: 0, bonus: 0, podium: 0, void: true });
    expect([s.weeks[0].teams.B.podium, s.weeks[0].teams.C.podium, s.weeks[0].teams.D.podium]).toEqual([20, 12, 6]);
    // Week 2 counts, but the disqualified person's 50 does not: 30 is 8 daily points and 1st.
    expect(s.weeks[1].teams.A).toMatchObject({ km: 30, tier1: 8, podium: 20, void: false });
    const a = s.standings.find((x) => x.id === "A")!;
    expect(a).toMatchObject({ void: false, total: 8 + 20, km: 30 });
    expect(a.rank).not.toBeNull();
  });

  it("voids the week even before it ends", () => {
    expect(score(race, "2026-10-06", dq(W1[0]), TEAMS, SW).weeks[0].teams.A).toMatchObject({ tier1: 0, void: true });
  });

  it("leaves the weeks before the void week alone", () => {
    const s = score(race, "2026-10-19", dq(W2[0]), TEAMS, SW);
    expect(s.weeks[0].teams.A).toMatchObject({ km: 30, tier1: 8, podium: 20, void: false });
    expect(s.weeks[1].teams.A).toMatchObject({ tier1: 0, bonus: 0, podium: 0, void: true });
    expect(s.weeks[1].teams.B.podium).toBe(20);
  });

  it("drops the disqualified person from Tier 2, so the rest can still earn the bonus", () => {
    const s = score(everyDay("a1", "A", 1, W2), "2026-10-19", dq(W1[0]), TEAMS, SW);
    expect(s.weeks[1].teams.A).toMatchObject({ bonus: 20, members: 1, onTrack: 1 });
  });

  it("voids no week for a week_of outside the challenge, but the person still counts nothing from it", () => {
    const s = score(race, "2026-10-19", dq("2026-09-28"), TEAMS, SW);
    expect(s.weeks.every((w) => !w.teams.A.void)).toBe(true);
    expect(s.weeks[1].teams.A.km).toBe(30);
    expect(s.standings.find((x) => x.id === "A")!.void).toBe(false);
  });

  it("voids no week for a missing week_of, and counts the person nothing", () => {
    const s = score(race, "2026-10-19", dq(null), TEAMS, SW);
    expect(s.weeks.every((w) => !w.teams.A.void)).toBe(true);
    expect(s.weeks[1].teams.A.km).toBe(30);
  });

  it("keeps the disqualified person's earlier days for Tier 2: the bonus is earned in the week before", () => {
    const both = [...everyDay("a1", "A", 1, W1), ...everyDay("a2", "A", 1, W1), ...everyDay("a1", "A", 1, W2)];
    const s = score(both, "2026-10-19", dq(W2[0]), TEAMS, SW);
    expect(s.weeks[0].teams.A).toMatchObject({ bonus: 20, members: 2, onTrack: 2, void: false });
    expect(s.weeks[1].teams.A).toMatchObject({ tier1: 0, bonus: 0, void: true });
  });

  it("voids each week of two disqualified members with different week_of, and no other", () => {
    const W3 = WEEKS[2].days;
    const two = new Map<string, string | null>([["a1", W1[0]], ["a2", W2[0]]]);
    const s = score([...everyDay("a1", "A", 1, W3), ...everyDay("a2", "A", 1, W3)], "2026-10-26", two, TEAMS, SW);
    expect(s.weeks.map((w) => w.teams.A.void)).toEqual([true, true, false, ...WEEKS.slice(3).map(() => false)]);
    expect(s.weeks.every((w) => !w.teams.B.void)).toBe(true);
  });

  it("answers whether a person counts on a day: until their week_of, then not", () => {
    const s = score(race, "2026-10-19", dq(W2[0]), TEAMS, SW);
    expect(s.counts("a2", W1[6])).toBe(true);
    expect(s.counts("a2", W2[0])).toBe(false);
    expect(s.counts("a2", W2[3])).toBe(false);
    expect(s.counts("a1", W2[3])).toBe(true);
  });

  it("counts a person with no week_of out from the start", () => {
    expect(score(race, "2026-10-19", dq(null), TEAMS, SW).counts("a2", W1[0])).toBe(false);
  });

  it("counts everyone under a season void or no void", () => {
    const season = score(race, "2026-10-19", dq(W1[0]));
    expect(season.counts("a2", W2[0])).toBe(true);
    expect(season.counts("a1", W2[0])).toBe(true);
  });
});

describe("cancelled members (D582)", () => {
  // a2 cancelled: still in cancelledIds, no longer a member for the bonus or the counts.
  const CANCELLED: Team[] = [{ id: "A", name: "Group 01", memberIds: ["a1"], cancelledIds: ["a2"] }, ...TEAMS.slice(1)];

  it("does not block the team bonus when the cancelled member logged nothing", () => {
    const totals = everyDay("a1", "A");
    const s = score(totals, "2026-10-12", new Map(), CANCELLED);
    expect(s.weeks[0].teams.A).toMatchObject({ bonus: 20, members: 1, onTrack: 1 });
    // The same people with a2 still a member: the bonus is withheld, which is what cancelling avoids.
    expect(score(totals).weeks[0].teams.A.bonus).toBe(0);
  });

  it("keeps the earned points of a cancelled member's days", () => {
    const s = score([...everyDay("a1", "A"), t("a2", "A", WEEK2[0], 10)], "2026-10-12", new Map(), CANCELLED);
    expect(s.weeks[0].teams.A.tier1).toBe(everyDay("a1", "A").length * 1 + 8);
  });

  it("still voids the team for a cancelled member's disqualification (season)", () => {
    const s = score(everyDay("a1", "A"), "2026-10-12", new Map([["a2", null]]), CANCELLED);
    expect(s.standings.find((x) => x.id === "A")!.void).toBe(true);
  });

  it("still voids the week for a cancelled member's week disqualification", () => {
    const s = score(everyDay("a1", "A"), "2026-10-12", new Map([["a2", WEEK2[0]]]), CANCELLED, { ...S, void: "week" });
    expect(s.weeks[0].teams.A).toMatchObject({ tier1: 0, bonus: 0, void: true });
  });
});

describe("ad hoc points (D705)", () => {
  it("adds an organiser's adjustment to the season total and ranks on it, but never to a void team", () => {
    const totals = [t("a1", "A", "2026-10-05", 6), t("b1", "B", "2026-10-05", 3)];
    const plain = scoreChallenge({ totals, teams: TEAMS, disqualified: new Map(), scoring: S, weeks: WEEKS, today: "2026-10-06" });
    expect(plain.standings[0].id).toBe("A");
    const s = scoreChallenge({ totals, teams: TEAMS, disqualified: new Map(), scoring: S, weeks: WEEKS, today: "2026-10-06", adjustments: new Map([["B", 20], ["C", -5]]) });
    const b = s.standings.find((x) => x.id === "B")!;
    expect([b.adjust, b.total, b.rank]).toEqual([20, 22, 1]);
    expect(s.standings.find((x) => x.id === "C")!.total).toBe(-5);
    const v = scoreChallenge({ totals, teams: TEAMS, disqualified: new Map([["b1", null]]), scoring: S, weeks: WEEKS, today: "2026-10-06", adjustments: new Map([["B", 20]]) });
    expect(v.standings.find((x) => x.id === "B")!.adjust).toBe(0);
  });
});
