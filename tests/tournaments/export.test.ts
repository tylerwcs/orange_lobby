import { describe, expect, it } from "vitest";
import { buildSquadsWorkbook, resultSheets, squadSheetRows } from "@/features/tournaments/export";
import { planPools, type SportResults } from "@/features/tournaments/lib/results";
import type { TournamentSport } from "@/features/tournaments/lib/squads";
import { tournamentSides } from "@/features/tournaments/lib/sides";

const people = new Map([["a", { name: "Aina", email: "aina@x.co", extra: { master_no: "M-001" } }]]);
const columns = [{ key: "master_no", label: "Master No" }];
const rows = [
  { sport: "Badminton", group: "Group 01", attendeeId: "a", state: "" as const },
  { sport: "Badminton", group: "Group 02", attendeeId: null, state: "Short" as const },
];

describe("squadSheetRows (D649)", () => {
  it("writes Sport, Group, Name, the chosen columns and State, with a blank name on a short squad", () => {
    expect(squadSheetRows(rows, people, columns)).toEqual([
      ["Sport", "Group", "Name", "Master No", "State"],
      ["Badminton", "Group 01", "Aina", "M-001", ""],
      ["Badminton", "Group 02", "", "", "Short"],
    ]);
  });
  it("says so when there are no squads at all", () => {
    expect(squadSheetRows([], people, [])).toEqual([["Sport", "Group", "Name", "State"], ["No squads yet", "", "", ""]]);
  });
});

describe("squadSheetRows with super teams (D833)", () => {
  it("adds a Team column after the super team", () => {
    const paired = [{ sport: "Badminton", group: "Group 01 + Group 02", team: "Group 02", attendeeId: "a", state: "" as const }];
    expect(squadSheetRows(paired, people, [])).toEqual([
      ["Sport", "Super team", "Team", "Name", "State"],
      ["Badminton", "Group 01 + Group 02", "Group 02", "Aina", ""],
    ]);
  });
});

describe("buildSquadsWorkbook", () => {
  it("puts the rows on one Squads sheet", () => {
    const ws = buildSquadsWorkbook(rows, people, columns).getWorksheet("Squads");
    expect(ws?.getRow(1).values).toEqual([undefined, "Sport", "Group", "Name", "Master No", "State"]);
    expect(ws?.getRow(3).values).toEqual([undefined, "Badminton", "Group 02", "", "", "Short"]);
  });
});

describe("resultSheets (D666)", () => {
  const sport = (over: Partial<TournamentSport>): TournamentSport => ({
    id: "s", activity_id: "act", name: "Futsal", min_size: 1, max_size: 5, position: 0, result_kind: "score", format: "pools", pool_size: 2, lane_count: 6, games: 4, forfeits_marked_at: null, ...over,
  });
  const groups = [1, 2, 3, 4].map((n) => ({ id: `g${n}`, name: `Team ${n}` }));
  let n = 0;
  const build = (s: TournamentSport): SportResults => {
    const plan = planPools(s, [["g1", "g2"], ["g3", "g4"]], () => `${s.id}-m${++n}`);
    return {
      sport: s,
      pools: plan.pools.map((p) => ({ ...p, sport_id: s.id })),
      matches: plan.matches.map((m) => ({ id: m.id, sport_id: s.id, stage: m.stage, pool: m.pool, bracket: m.bracket, round: m.round, position: m.position, walkover_to: null, went_through: null })),
      slots: plan.matches.flatMap((m) => m.slots.map((sl) => ({ ...sl, match_id: m.id, score: null, time_ms: null, dnf: false }))),
    };
  };
  const setSlot = (sr: SportResults, matchId: string, slot: number, v: Partial<SportResults["slots"][number]>): SportResults =>
    ({ ...sr, slots: sr.slots.map((x) => (x.match_id === matchId && x.slot === slot ? { ...x, ...v } : x)) });

  it("writes every match, the places with points, and the overall table", () => {
    let futsal = build(sport({ id: "f" }));
    const pool = futsal.matches[0];
    futsal = setSlot(setSlot(futsal, pool.id, 0, { score: 3 }), pool.id, 1, { score: 1 });
    const gold = futsal.matches.find((m) => m.stage === "bracket" && m.bracket === 0)!;
    futsal = setSlot(setSlot(futsal, gold.id, 0, { group_id: "g1", score: 2 }), gold.id, 1, { group_id: "g3", score: 0 });
    let swim = build(sport({ id: "w", name: "Swimming", position: 1, result_kind: "time" }));
    const heat = swim.matches[0];
    swim = setSlot(setSlot(swim, heat.id, 0, { time_ms: 112300 }), heat.id, 1, { dnf: true });

    const bonus = { points: 100, earned: new Set(["g3"]) };
    const sheets = resultSheets({ results: [futsal, swim], groups, table: [40, 35], bonus });
    expect(sheets.matches[0]).toEqual(["Sport", "Stage", "Team 1", "Score 1", "Team 2", "Score 2", "Note"]);
    expect(sheets.matches[1]).toEqual(["Futsal", "Pool A", "Team 1", "3", "Team 2", "1", ""]);
    expect(sheets.matches).toContainEqual(["Futsal", "Gold · Final", "Team 1", "2", "Team 3", "0", ""]);
    expect(sheets.matches).toContainEqual(["Sport", "Stage", "Team", "Time", "Place", "Note"]);
    expect(sheets.matches).toContainEqual(["Swimming", "Heat 1 · Pool A", "Team 1", "1:52.30", "1", ""]);
    expect(sheets.matches).toContainEqual(["Swimming", "Heat 1 · Pool A", "Team 2", "DNF", "2", ""]);
    expect(sheets.matches).toContainEqual(["Swimming", "Heat 2 · Pool B", "Team 4", "", "", ""]);
    expect(sheets.places).toEqual([["Sport", "Place", "Group", "Points"], ["Futsal", "1", "Team 1", "40"], ["Futsal", "2", "Team 3", "35"]]);
    expect(sheets.leaderboard?.[0]).toEqual(["Rank", "Group", "Futsal", "Swimming", "Bonus", "Total"]);
    expect(sheets.leaderboard?.[1]).toEqual(["1", "Team 3", "35", "", "100", "135"]);
    expect(sheets.leaderboard?.[2]).toEqual(["2", "Team 1", "40", "", "0", "40"]);
    expect(resultSheets({ results: [futsal], groups, table: null }).leaderboard).toBeNull();
  });
});

describe("resultSheets with super teams (D833)", () => {
  const s: TournamentSport = { id: "f", activity_id: "act", name: "Futsal", min_size: 1, max_size: 5, position: 0, result_kind: "score", format: "pools", pool_size: 2, lane_count: 6, games: 4, forfeits_marked_at: null };
  const groups = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: `g${n}`, name: `Team ${n}` }));
  const sides = tournamentSides(groups, [1, 2, 3, 4].map((n) => ({ id: `st${n}`, activity_id: "act", name: null, groupIds: [`g${n}`, `g${n + 4}`] })));
  let n = 0;
  const plan = planPools(s, [["g1", "g2"], ["g3", "g4"]], () => `m${++n}`);
  const base: SportResults = {
    sport: s,
    pools: plan.pools.map((p) => ({ ...p, sport_id: s.id })),
    matches: plan.matches.map((m) => ({ id: m.id, sport_id: s.id, stage: m.stage, pool: m.pool, bracket: m.bracket, round: m.round, position: m.position, walkover_to: null, went_through: null })),
    slots: plan.matches.flatMap((m) => m.slots.map((sl) => ({ ...sl, match_id: m.id, score: null, time_ms: null, dnf: false }))),
  };
  const gold = base.matches.find((m) => m.stage === "bracket" && m.bracket === 0)!;
  const futsal: SportResults = {
    ...base,
    slots: base.slots.map((x) => (x.match_id === gold.id ? { ...x, group_id: x.slot === 0 ? "g1" : "g3", score: x.slot === 0 ? 2 : 0 } : x)),
  };

  it("names super teams in places and ranks one leaderboard row per super team", () => {
    const sheets = resultSheets({ results: [futsal], groups, sides, table: [40, 35] });
    expect(sheets.places[0]).toEqual(["Sport", "Place", "Super team", "Points"]);
    expect(sheets.places[1]).toEqual(["Futsal", "1", "Team 1 + Team 5", "40"]);
    expect(sheets.leaderboard?.[0]).toEqual(["Rank", "Super team", "Futsal", "Total"]);
    expect(sheets.leaderboard?.slice(1, 3)).toEqual([["1", "Team 1 + Team 5", "40", "40"], ["2", "Team 3 + Team 7", "35", "35"]]);
    expect(sheets.leaderboard).toHaveLength(5);
  });
});
