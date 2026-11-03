import { describe, expect, it } from "vitest";
import { boardWeek, leaderboardView, rankByTotal, standingLine } from "@/features/activities/lib/leaderboard";
import { challengeWeeks } from "@/features/activities/lib/challenge";
import type { Standing } from "@/features/activities/lib/challenge-score";

/** Standings as scoreChallenge returns them: live teams by total desc with competition ranks, void last. */
const row = (id: string, total: number, rank: number | null, over: Partial<Standing> = {}): Standing => ({
  id, name: `Group ${id}`, km: 0, tier1: total, bonus: 0, podium: 0, adjust: 0, total, void: rank === null, rank, volumeRank: null, ...over,
});
const table: Standing[] = [
  row("04", 260, 1), row("07", 248, 2), row("02", 198, 3), row("09", 185, 4), row("01", 176, 5), row("05", 90, 6),
  row("03", 0, null),
];

describe("standingLine (D386)", () => {
  it("says how far 1st leads 2nd", () => {
    expect(standingLine(table, "04")).toEqual({ rank: "#1", title: "Group 04 · 260 pts", line: "Leading by 12 pts." });
  });

  it("says tied for 1st when another team shares the top", () => {
    const tied = [row("04", 248, 1), row("07", 248, 1), row("02", 198, 3)];
    expect(standingLine(tied, "07")).toEqual({ rank: "#1", title: "Group 07 · 248 pts", line: "Tied for 1st." });
  });

  it("gives mid-table the gap to the team just above and to the podium", () => {
    expect(standingLine(table, "01")).toEqual({
      rank: "#5", title: "Group 01 · 176 pts", line: "9 pts behind Group 09. 22 pts to reach the podium.",
    });
  });

  it("gives 4th only the podium gap, since the team just above is the podium's third", () => {
    expect(standingLine(table, "09")).toEqual({ rank: "#4", title: "Group 09 · 185 pts", line: "13 pts to reach the podium." });
  });

  it("leaves out the podium sentence for 3rd", () => {
    expect(standingLine(table, "02")).toEqual({ rank: "#3", title: "Group 02 · 198 pts", line: "50 pts behind Group 07." });
  });

  it("works for last place", () => {
    expect(standingLine(table, "05")).toEqual({
      rank: "#6", title: "Group 05 · 90 pts", line: "86 pts behind Group 01. 108 pts to reach the podium.",
    });
  });

  it("says pt for a single point", () => {
    const close = [row("04", 11, 1), row("07", 10, 2)];
    expect(standingLine(close, "04")?.line).toBe("Leading by 1 pt.");
    expect(standingLine(close, "07")).toEqual({ rank: "#2", title: "Group 07 · 10 pts", line: "1 pt behind Group 04." });
  });

  it("measures a tied team against the team above the tie, not its twin", () => {
    const tied = [row("04", 260, 1), row("07", 200, 2), row("02", 200, 2), row("09", 150, 4)];
    expect(standingLine(tied, "02")?.line).toBe("60 pts behind Group 04.");
    // 4th behind a tie for 2nd: the podium's third team is the second of the pair.
    expect(standingLine(tied, "09")?.line).toBe("50 pts to reach the podium.");
  });

  it("explains a void team", () => {
    expect(standingLine(table, "03")).toEqual({ rank: "–", title: "Group 03 · Void", line: "Your team is void: a member was disqualified." });
  });

  it("returns null without a team, or for a team not in the standings", () => {
    expect(standingLine(table, null)).toBeNull();
    expect(standingLine(table, "99")).toBeNull();
  });

  it("before any points, gives no rank and says when the race starts", () => {
    const zero = [row("01", 0, 1), row("02", 0, 1)];
    expect(standingLine(zero, "01", { startsOn: "2026-10-05", today: "2026-10-03" })).toEqual({
      rank: "–", title: "Group 01 · 0 pts", line: "The race starts Mon 5 Oct.",
    });
    expect(standingLine(zero, "01", { startsOn: "2026-10-05", today: "2026-10-05" })?.line).toBe("No team has points yet.");
  });
});

describe("leaderboardView (D386)", () => {
  it("puts the first three live teams on the podium and everyone else below", () => {
    const v = leaderboardView(table);
    expect(v.scored).toBe(true);
    expect(v.leaderTotal).toBe(260);
    expect(v.podium.map((s) => s.id)).toEqual(["04", "07", "02"]);
    expect(v.rest.map((s) => s.id)).toEqual(["09", "01", "05", "03"]);
  });

  it("never puts a void team on the podium", () => {
    const v = leaderboardView([row("04", 10, 1), row("03", 0, null)]);
    expect(v.podium.map((s) => s.id)).toEqual(["04"]);
    expect(v.rest.map((s) => s.id)).toEqual(["03"]);
  });

  it("keeps a shared rank on the podium", () => {
    const v = leaderboardView([row("04", 9, 1), row("07", 9, 1), row("02", 5, 3), row("09", 1, 4)]);
    expect(v.podium.map((s) => s.rank)).toEqual([1, 1, 3]);
  });

  it("lists every team below, podium included, in rank order with void last, when rosters open (D516)", () => {
    const v = leaderboardView(table, { everyTeam: true });
    expect(v.podium.map((s) => s.id)).toEqual(["04", "07", "02"]);
    expect(v.rest.map((s) => s.id)).toEqual(["04", "07", "02", "09", "01", "05", "03"]);
  });

  it("keeps today's list, 4th onwards, without the option (D516)", () => {
    expect(leaderboardView(table, { everyTeam: false }).rest.map((s) => s.id)).toEqual(["09", "01", "05", "03"]);
  });

  it("before any points, leaves the podium empty and lists every team below", () => {
    const zero = [row("01", 0, 1), row("02", 0, 1), row("03", 0, null)];
    const v = leaderboardView(zero);
    expect(v.scored).toBe(false);
    expect(v.podium).toEqual([]);
    expect(v.rest.map((s) => s.id)).toEqual(["01", "02", "03"]);
  });
});

describe("rankByTotal (D810)", () => {
  it("ranks on the rows' own totals, ties shared, void last and unranked", () => {
    const week = [row("04", 5, 1), row("07", 30, 2), row("02", 30, 3), row("03", 99, null), row("09", 12, 4)];
    expect(rankByTotal(week).map((r) => [r.id, r.rank])).toEqual([["02", 1], ["07", 1], ["09", 3], ["04", 4], ["03", null]]);
  });
});

describe("boardWeek (D810)", () => {
  // Week 1 is 26 Oct – 1 Nov, Week 6 is 30 Nov – 4 Dec.
  const weeks = challengeWeeks({ starts_on: "2026-10-26", ends_on: "2026-12-04", week_origin: "challenge" }, null).map((week) => ({ week }));

  it("opens on this week", () => {
    expect(boardWeek(weeks, null, "2026-11-03")).toBe(2);
    expect(boardWeek(weeks, "nonsense", "2026-11-03")).toBe(2);
  });
  it("shows a week that has started when asked, and the season for `all`", () => {
    expect(boardWeek(weeks, "1", "2026-11-03")).toBe(1);
    expect(boardWeek(weeks, "all", "2026-11-03")).toBeNull();
  });
  it("never shows a week that hasn't begun", () => {
    expect(boardWeek(weeks, "3", "2026-11-03")).toBe(2);
  });
  it("shows the season before the first week and after the last", () => {
    expect(boardWeek(weeks, null, "2026-10-25")).toBeNull();
    expect(boardWeek(weeks, null, "2026-12-05")).toBeNull();
    expect(boardWeek(weeks, "6", "2026-12-05")).toBe(6);
  });
});
