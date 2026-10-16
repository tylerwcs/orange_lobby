import { describe, expect, it } from "vitest";
import {
  blockedBy, bracketName, defaultPlaying, drawPools, formatProblem, formatTime, matchesLeft, ordinal, overallTable, parseTime, planPools,
  pointsFor, poolName, poolPlaces, poolStandings, readPlacePoints, resolveSport, roundRobinPairs, sportPlaces,
  type MatchPlan, type Slot, type SportResults,
} from "@/features/tournaments/lib/results";
import type { SquadRow, TournamentSport } from "@/features/tournaments/lib/squads";

const sport = (over: Partial<TournamentSport> = {}): TournamentSport => ({
  id: "sp", activity_id: "act", name: "Futsal", min_size: 2, max_size: 2, position: 0,
  result_kind: "score", format: "pools", pool_size: 3, forfeits_marked_at: null, ...over,
});
const ids = (n: number) => Array.from({ length: n }, (_, i) => `g${String(i + 1).padStart(2, "0")}`);
const names = new Map(ids(12).map((g, i) => [g, `Team ${i + 1}`]));
const counter = () => { let n = 0; return () => `m${++n}`; };

/** A plan written as the database would hold it: every slot empty of results. */
function fromPlan(s: TournamentSport, plan: MatchPlan): SportResults {
  return {
    sport: s,
    pools: plan.pools.map((p) => ({ ...p, sport_id: s.id })),
    matches: plan.matches.map((m) => ({ id: m.id, stage: m.stage, pool: m.pool, bracket: m.bracket, round: m.round, position: m.position, sport_id: s.id, walkover_to: null, went_through: null })),
    slots: plan.matches.flatMap((m) => m.slots.map((sl) => ({ ...sl, match_id: m.id, score: null, time_ms: null, dnf: false }))),
  };
}
/** 12 groups in pools A (1-3), B (4-6), C (7-9), D (10-12). */
const twelve = (over: Partial<TournamentSport> = {}) => {
  const s = sport(over);
  const g = ids(12);
  return fromPlan(s, planPools(s, [g.slice(0, 3), g.slice(3, 6), g.slice(6, 9), g.slice(9, 12)], counter()));
};
const slotsOf = (sr: SportResults, matchId: string) => sr.slots.filter((s) => s.match_id === matchId).sort((a, b) => a.slot - b.slot);
const matchOf = (sr: SportResults, label: string) => {
  const r = resolveSport(sr, names).find((x) => x.label === label);
  if (!r) throw new Error(`no match ${label}`);
  return r.match;
};
/** Sets a match's scores (by slot order), and optionally who went through. */
function score(sr: SportResults, matchId: string, a: number, b: number, wentThrough: string | null = null): SportResults {
  const [s0, s1] = slotsOf(sr, matchId);
  return {
    ...sr,
    slots: sr.slots.map((s): Slot => (s === s0 ? { ...s, score: a } : s === s1 ? { ...s, score: b } : s)),
    matches: sr.matches.map((m) => (m.id === matchId ? { ...m, went_through: wentThrough } : m)),
  };
}
const poolMatch = (sr: SportResults, x: string, y: string) => {
  const m = sr.matches.find((mm) => {
    const g = slotsOf(sr, mm.id).map((s) => s.group_id);
    return mm.stage === "pool" && g.includes(x) && g.includes(y);
  });
  if (!m) throw new Error(`no pool match ${x} v ${y}`);
  return m;
};
/** Scores x v y in the order given, whichever slot each is in. */
function play(sr: SportResults, x: string, y: string, sx: number, sy: number): SportResults {
  const m = poolMatch(sr, x, y);
  const first = slotsOf(sr, m.id)[0].group_id;
  return first === x ? score(sr, m.id, sx, sy) : score(sr, m.id, sy, sx);
}
function pick(sr: SportResults, matchId: string, groups: string[]): SportResults {
  return { ...sr, slots: sr.slots.map((s) => (s.match_id === matchId && groups[s.slot] !== undefined ? { ...s, group_id: groups[s.slot] } : s)) };
}

describe("words", () => {
  it("names pools, brackets and places", () => {
    expect(poolName(0)).toBe("Pool A");
    expect(poolName(3)).toBe("Pool D");
    expect([0, 1, 2, 3].map(bracketName)).toEqual(["Gold", "Silver", "Bronze", "4th placing"]);
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
  });
});

describe("parseTime / formatTime", () => {
  it("round-trips relay times", () => {
    expect(parseTime("1:52.30")).toBe(112300);
    expect(parseTime("52.3")).toBe(52300);
    expect(parseTime(" 2:01.1 ")).toBe(121100);
    expect(parseTime("DNF")).toBe("dnf");
    expect(parseTime("dnf")).toBe("dnf");
    expect(parseTime("abc")).toBeNull();
    expect(parseTime("1:75.00")).toBeNull();
    expect(parseTime("0")).toBeNull();
    expect(formatTime(112300)).toBe("1:52.30");
    expect(formatTime(52300)).toBe("52.30");
  });
});

describe("readPlacePoints (D654)", () => {
  it("reads the table, 1st first", () => {
    expect(readPlacePoints("40, 35, 30, 29, 28, 27, 26, 25, 24, 23, 22, 20")).toEqual([40, 35, 30, 29, 28, 27, 26, 25, 24, 23, 22, 20]);
    expect(readPlacePoints("  ")).toBeNull();
    expect(() => readPlacePoints("40, x")).toThrow("Points per place must be whole numbers, 1st first, separated by commas.");
  });
});

describe("formatProblem (D655, D656)", () => {
  it("says why a sport's groups can't run in pools", () => {
    expect(formatProblem(13, 3, "score")).toBe("13 groups don't split into pools of 3. Change the pool size, or switch this sport to Matches I add by hand.");
    expect(formatProblem(9, 3, "score")).toBe("Placing brackets need 2 or 4 pools. Use Matches I add by hand for this sport.");
    expect(formatProblem(9, 3, "time")).toBeNull();
    expect(formatProblem(12, 3, "score")).toBeNull();
    expect(formatProblem(6, 3, "score")).toBeNull();
    expect(formatProblem(0, 3, "score")).toBe("Tick at least one group to play.");
  });
});

describe("drawPools / defaultPlaying", () => {
  it("is deterministic for a fixed random and places everyone once", () => {
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const a = drawPools(ids(12), 3, random);
    seed = 1;
    const b = drawPools(ids(12), 3, random);
    expect(a).toEqual(b);
    expect(a).toHaveLength(4);
    expect(a.every((p) => p.length === 3)).toBe(true);
    expect(a.flat().sort()).toEqual(ids(12));
  });
  it("ticks groups with a squad player, or everyone when no squad has one", () => {
    const row = (group_id: string): SquadRow => ({ sport_id: "x", group_id, attendee_id: `a-${group_id}`, added_by: null, added_at: "" });
    expect(defaultPlaying(["g1", "g2", "sean"], [row("g1"), row("g2")])).toEqual(["g1", "g2"]);
    expect(defaultPlaying(["g1", "g2"], [])).toEqual(["g1", "g2"]);
  });
});

describe("planPools (D655, D656)", () => {
  it("makes the round robin and empty brackets for 4 pools of 3", () => {
    const sr = twelve();
    expect(roundRobinPairs(3).flat().map((p) => p.join("v")).sort()).toEqual(["0v1", "0v2", "1v2"]);
    expect(sr.matches.filter((m) => m.stage === "pool")).toHaveLength(12);
    const bracket = sr.matches.filter((m) => m.stage === "bracket");
    expect(bracket).toHaveLength(12);
    const labels = resolveSport(sr, names).map((r) => r.label);
    expect(labels).toContain("Gold · Semi 1");
    expect(labels).toContain("Bronze · 3rd place");
    const final = matchOf(sr, "Gold · Final");
    const semi1 = matchOf(sr, "Gold · Semi 1");
    expect(slotsOf(sr, final.id).map((s) => [s.source_outcome, s.group_id])).toEqual([["winner", null], ["winner", null]]);
    expect(slotsOf(sr, final.id)[0].source_match_id).toBe(semi1.id);
    expect(slotsOf(sr, matchOf(sr, "Gold · 3rd place").id).map((s) => s.source_outcome)).toEqual(["loser", "loser"]);
  });
  it("makes heats and one final race per bracket for time sports", () => {
    const sr = twelve({ result_kind: "time" });
    const heats = sr.matches.filter((m) => m.stage === "pool");
    expect(heats).toHaveLength(4);
    expect(heats.every((h) => slotsOf(sr, h.id).length === 3)).toBe(true);
    const races = sr.matches.filter((m) => m.stage === "bracket");
    expect(races).toHaveLength(3);
    expect(races.every((r) => slotsOf(sr, r.id).length === 4)).toBe(true);
    expect(resolveSport(sr, names).find((r) => r.match.id === races[0].id)?.label).toBe("Gold · Final race");
  });
  it("makes one final per bracket for 2 pools", () => {
    const s = sport({ pool_size: 2 });
    const sr = fromPlan(s, planPools(s, [["g01", "g02"], ["g03", "g04"]], counter()));
    expect(sr.matches.filter((m) => m.stage === "bracket").map((m) => m.round)).toEqual(["final", "final"]);
  });
});

describe("poolStandings (D659)", () => {
  it("ranks by wins, then point difference, then points scored; a draw is neither", () => {
    let sr = twelve();
    sr = play(sr, "g01", "g02", 3, 1);
    sr = play(sr, "g02", "g03", 2, 2);
    sr = play(sr, "g01", "g03", 1, 0);
    const a = poolStandings(sr, resolveSport(sr, names))[0];
    expect(a.name).toBe("Pool A");
    expect(a.rows.map((r) => [r.groupId, r.rank, r.won, r.drawn, r.lost, r.diff])).toEqual([
      ["g01", 1, 2, 0, 0, 3], ["g03", 2, 0, 1, 1, -1], ["g02", 3, 0, 1, 1, -2],
    ]);
  });
  it("shows a full three-way tie as tied", () => {
    let sr = twelve();
    sr = play(sr, "g01", "g02", 2, 1);
    sr = play(sr, "g02", "g03", 2, 1);
    sr = play(sr, "g03", "g01", 2, 1);
    const rows = poolStandings(sr, resolveSport(sr, names))[0].rows;
    expect(rows.map((r) => [r.rank, r.tied])).toEqual([[1, true], [1, true], [1, true]]);
    expect(poolPlaces(poolStandings(sr, resolveSport(sr, names))).get("g01")).toBe("A1=");
  });
  it("gives a forfeit group's matches as walkovers, with no points, and ranks it last", () => {
    let sr = twelve();
    sr = { ...sr, pools: sr.pools.map((p) => (p.group_id === "g03" ? { ...p, forfeit: true } : p)) };
    sr = play(sr, "g01", "g02", 1, 0);
    const resolved = resolveSport(sr, names);
    const walk = resolved.find((r) => r.match.id === poolMatch(sr, "g01", "g03").id)!;
    expect(walk.played).toBe(true);
    expect(walk.winner).toBe("g01");
    expect(walk.note).toBe("Walkover · Team 3 forfeits");
    const rows = poolStandings(sr, resolved)[0].rows;
    expect(rows.map((r) => [r.groupId, r.won, r.lost, r.diff, r.scored, r.forfeit])).toEqual([
      ["g01", 2, 0, 1, 1, false], ["g02", 1, 1, -1, 0, false], ["g03", 0, 2, 0, 0, true],
    ]);
  });
  it("gives two forfeit groups in one pool match no winner and a loss each", () => {
    let sr = twelve();
    sr = { ...sr, pools: sr.pools.map((p) => (p.group_id === "g02" || p.group_id === "g03" ? { ...p, forfeit: true } : p)) };
    const both = resolveSport(sr, names).find((r) => r.match.id === poolMatch(sr, "g02", "g03").id)!;
    expect(both.played).toBe(true);
    expect(both.winner).toBeNull();
    const rows = poolStandings(sr, resolveSport(sr, names))[0].rows;
    expect(rows.find((r) => r.groupId === "g02")?.lost).toBe(2);
  });
  it("counts an admin's walkover as a win with no points", () => {
    let sr = twelve();
    const m = poolMatch(sr, "g01", "g02");
    sr = { ...sr, matches: sr.matches.map((x) => (x.id === m.id ? { ...x, walkover_to: "g02" } : x)) };
    const r = resolveSport(sr, names).find((x) => x.match.id === m.id)!;
    expect([r.played, r.winner, r.note]).toEqual([true, "g02", "Walkover"]);
    const g2 = poolStandings(sr, resolveSport(sr, names))[0].rows.find((x) => x.groupId === "g02")!;
    expect([g2.won, g2.diff, g2.scored]).toEqual([1, 0, 0]);
  });
  it("orders a time heat fastest first, then DNF, then forfeit", () => {
    let sr = twelve({ result_kind: "time" });
    sr = { ...sr, pools: sr.pools.map((p) => (p.group_id === "g04" ? { ...p, forfeit: true } : p)) };
    const heat = sr.matches.find((m) => m.stage === "pool" && m.pool === 0)!;
    const times: Record<string, Partial<Slot>> = { g01: { time_ms: 121100 }, g02: { time_ms: 112300 }, g03: { dnf: true } };
    sr = { ...sr, slots: sr.slots.map((s) => (s.match_id === heat.id && s.group_id ? { ...s, ...times[s.group_id] } : s)) };
    const resolved = resolveSport(sr, names);
    expect(resolved.find((r) => r.match.id === heat.id)?.order).toEqual(["g02", "g01", "g03"]);
    expect(poolStandings(sr, resolved)[0].rows.map((r) => [r.groupId, r.rank])).toEqual([["g02", 1], ["g01", 2], ["g03", 3]]);
    const heatB = sr.matches.find((m) => m.stage === "pool" && m.pool === 1)!;
    sr = { ...sr, slots: sr.slots.map((s) => (s.match_id === heatB.id && s.group_id !== "g04" ? { ...s, time_ms: 100000 + Number(s.group_id!.slice(1)) } : s)) };
    const b = resolveSport(sr, names).find((r) => r.match.id === heatB.id)!;
    expect(b.played).toBe(true);
    expect(b.order[b.order.length - 1]).toBe("g04");
  });
});

describe("brackets and places (D657, D658, D661)", () => {
  const gold = (sr: SportResults) => ({
    s1: matchOf(sr, "Gold · Semi 1"), s2: matchOf(sr, "Gold · Semi 2"), fin: matchOf(sr, "Gold · Final"), third: matchOf(sr, "Gold · 3rd place"),
  });
  it("fills the final from the semis, and waits on a level semi until someone went through", () => {
    let sr = twelve();
    const { s1, s2, fin } = gold(sr);
    sr = pick(sr, s1.id, ["g01", "g07"]);
    sr = pick(sr, s2.id, ["g04", "g10"]);
    sr = score(sr, s1.id, 4, 2);
    sr = score(sr, s2.id, 1, 1);
    let f = resolveSport(sr, names).find((r) => r.match.id === fin.id)!;
    expect(resolveSport(sr, names).find((r) => r.match.id === s2.id)?.played).toBe(false);
    expect(f.entries.map((e) => [e.groupId, e.pointer])).toEqual([["g01", "Winner Gold Semi 1"], [null, "Winner Gold Semi 2"]]);
    sr = score(sr, s2.id, 1, 1, "g10");
    f = resolveSport(sr, names).find((r) => r.match.id === fin.id)!;
    expect(f.entries.map((e) => e.groupId)).toEqual(["g01", "g10"]);
    expect(resolveSport(sr, names).find((r) => r.match.id === s2.id)?.note).toBe("Team 10 went through");
  });
  it("places 1-4 from the final and 3rd-place match, and only what's settled", () => {
    let sr = twelve();
    const { s1, s2, fin, third } = gold(sr);
    sr = score(pick(sr, s1.id, ["g01", "g07"]), s1.id, 4, 2);
    sr = score(pick(sr, s2.id, ["g04", "g10"]), s2.id, 0, 3);
    sr = score(sr, fin.id, 2, 1);
    expect(sportPlaces(sr, resolveSport(sr, names)).map((p) => [p.place, p.groupId])).toEqual([[1, "g01"], [2, "g10"]]);
    sr = score(sr, third.id, 0, 5);
    expect(sportPlaces(sr, resolveSport(sr, names)).map((p) => [p.place, p.groupId])).toEqual([[1, "g01"], [2, "g10"], [3, "g04"], [4, "g07"]]);
    expect(matchesLeft(resolveSport(sr, names))).toBe(20);
  });
  it("places a silver bracket from 5th", () => {
    let sr = twelve();
    const fin = matchOf(sr, "Silver · Final");
    const s1 = matchOf(sr, "Silver · Semi 1");
    const s2 = matchOf(sr, "Silver · Semi 2");
    sr = score(pick(sr, s1.id, ["g02", "g08"]), s1.id, 1, 0);
    sr = score(pick(sr, s2.id, ["g05", "g11"]), s2.id, 1, 0);
    sr = score(sr, fin.id, 0, 1);
    expect(sportPlaces(sr, resolveSport(sr, names)).map((p) => [p.place, p.groupId])).toEqual([[5, "g05"], [6, "g02"]]);
  });
  it("routes two forfeit groups in a semi by slot order, so the bracket can finish", () => {
    let sr = twelve();
    sr = { ...sr, pools: sr.pools.map((p) => (p.group_id === "g03" || p.group_id === "g09" ? { ...p, forfeit: true } : p)) };
    const s1 = matchOf(sr, "Bronze · Semi 1");
    const fin = matchOf(sr, "Bronze · Final");
    sr = pick(sr, s1.id, ["g03", "g09"]);
    const semi = resolveSport(sr, names).find((r) => r.match.id === s1.id)!;
    expect([semi.played, semi.winner, semi.note]).toEqual([true, "g03", "Both forfeit"]);
    expect(resolveSport(sr, names).find((r) => r.match.id === fin.id)?.entries[0].groupId).toBe("g03");
  });
  it("shares a place on an equal time in a final race", () => {
    let sr = twelve({ result_kind: "time" });
    const race = sr.matches.find((m) => m.stage === "bracket" && m.bracket === 0)!;
    sr = pick(sr, race.id, ["g01", "g04", "g07", "g10"]);
    const t: Record<string, Partial<Slot>> = { g01: { time_ms: 100000 }, g04: { time_ms: 100000 }, g07: { time_ms: 110000 }, g10: { dnf: true } };
    sr = { ...sr, slots: sr.slots.map((s) => (s.match_id === race.id && s.group_id ? { ...s, ...t[s.group_id] } : s)) };
    expect(sportPlaces(sr, resolveSport(sr, names)).map((p) => [p.place, p.groupId])).toEqual([[1, "g01"], [1, "g04"], [3, "g07"], [4, "g10"]]);
  });
  it("reads a by-hand sport's places from the admin, ties allowed", () => {
    const s = sport({ format: "manual" });
    const sr: SportResults = {
      sport: s, matches: [], slots: [],
      pools: [
        { sport_id: s.id, group_id: "g01", pool: 0, forfeit: false, manual_place: 2 },
        { sport_id: s.id, group_id: "g02", pool: 0, forfeit: false, manual_place: 1 },
        { sport_id: s.id, group_id: "g03", pool: 0, forfeit: true, manual_place: 2 },
        { sport_id: s.id, group_id: "g04", pool: 0, forfeit: false, manual_place: null },
      ],
    };
    expect(sportPlaces(sr, resolveSport(sr, names)).map((p) => [p.place, p.groupId, p.forfeit])).toEqual([[1, "g02", false], [2, "g01", false], [2, "g03", true]]);
  });
});

describe("points and the overall table (D660, D662)", () => {
  const table = [40, 35, 30, 29, 28, 27, 26, 25, 24, 23, 22, 20];
  it("gives a place its points, and a forfeit or a place past the table nothing", () => {
    expect(pointsFor({ place: 1, groupId: "g", forfeit: false }, table)).toBe(40);
    expect(pointsFor({ place: 12, groupId: "g", forfeit: true }, table)).toBe(0);
    expect(pointsFor({ place: 13, groupId: "g", forfeit: false }, table)).toBe(0);
    expect(pointsFor({ place: 1, groupId: "g", forfeit: false }, null)).toBe(0);
  });
  it("adds up sports, shows unplaced and forfeits, and breaks ties by 1st places", () => {
    const a = sport({ id: "a", position: 0 });
    const b = sport({ id: "b", position: 1 });
    const c = sport({ id: "c", position: 2 });
    const places = new Map([
      ["a", [{ place: 1, groupId: "x", forfeit: false }, { place: 3, groupId: "y", forfeit: false }, { place: 2, groupId: "z", forfeit: true }]],
      ["b", [{ place: 3, groupId: "x", forfeit: false }, { place: 1, groupId: "y", forfeit: false }]],
      ["c", [{ place: 2, groupId: "w", forfeit: false }, { place: 2, groupId: "v", forfeit: false }]],
    ]);
    const rows = overallTable({ sports: [a, b, c], places, groupIds: ["v", "w", "x", "y", "z"], table });
    expect(rows.map((r) => [r.groupId, r.total, r.rank, r.tied])).toEqual([
      ["x", 70, 1, true], ["y", 70, 1, true], ["v", 35, 3, true], ["w", 35, 3, true], ["z", 0, 5, false],
    ]);
    expect(rows.find((r) => r.groupId === "z")?.bySport).toEqual(["F", null, null]);
    const tieBreak = overallTable({
      sports: [a, b],
      places: new Map([["a", [{ place: 1, groupId: "x", forfeit: false }, { place: 2, groupId: "y", forfeit: false }]], ["b", [{ place: 4, groupId: "x", forfeit: false }, { place: 2, groupId: "y", forfeit: false }]]]),
      groupIds: ["x", "y"], table: [40, 30, 30, 30],
    });
    expect(tieBreak.map((r) => [r.groupId, r.total, r.rank, r.tied])).toEqual([["x", 70, 1, false], ["y", 60, 2, false]]);
    const firsts = overallTable({
      sports: [a, b],
      places: new Map([["a", [{ place: 1, groupId: "y", forfeit: false }, { place: 2, groupId: "x", forfeit: false }]], ["b", [{ place: 3, groupId: "y", forfeit: false }, { place: 2, groupId: "x", forfeit: false }]]]),
      groupIds: ["x", "y"], table: [40, 35, 30],
    });
    expect(firsts.map((r) => [r.groupId, r.total, r.rank])).toEqual([["y", 70, 1], ["x", 70, 2]]);
  });
});

describe("blockedBy (D658)", () => {
  it("refuses a semi change once the final it feeds has a result", () => {
    let before = twelve();
    const s1 = matchOf(before, "Gold · Semi 1");
    const s2 = matchOf(before, "Gold · Semi 2");
    const fin = matchOf(before, "Gold · Final");
    before = score(pick(before, s1.id, ["g01", "g07"]), s1.id, 4, 2);
    before = score(pick(before, s2.id, ["g04", "g10"]), s2.id, 0, 3);
    const flipped = score(before, s1.id, 1, 5);
    expect(blockedBy(before, flipped, names)).toBeNull();
    const played = score(before, fin.id, 2, 1);
    expect(blockedBy(played, score(played, s1.id, 1, 5), names)).toBe("Gold · Final");
    expect(blockedBy(played, score(played, s1.id, 5, 1), names)).toBeNull();
    expect(blockedBy(played, pick(played, s1.id, ["g02", "g07"]), names)).toBe("Gold · Semi 1");
  });
});
