import { describe, expect, it } from "vitest";
import {
  blockedBy, bracketName, defaultPlaying, pickerOptions, pickSport, readBonus, readResult, tournamentTab, tournamentOverall, withChange, withForfeit, drawPools, formatProblem, formatTime, matchesLeft, ordinal, overallTable, parseTime, planPools, podium,
  pointsFor, poolName, poolPlaces, poolStandings, readPlacePoints, resolveSport, roundRobinPairs, sportPlaces, timeTable,
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
  it("makes two heats per pool, the same groups each time, and no brackets for time sports (D673)", () => {
    const sr = twelve({ result_kind: "time" });
    const heats = sr.matches.filter((m) => m.stage === "pool");
    expect(heats).toHaveLength(8);
    expect(heats.every((h) => slotsOf(sr, h.id).length === 3)).toBe(true);
    expect(sr.matches.filter((m) => m.stage === "bracket")).toHaveLength(0);
    const labels = resolveSport(sr, names).map((r) => r.label);
    expect(labels).toEqual(["Heat 1 · Pool A", "Heat 1 · Pool B", "Heat 1 · Pool C", "Heat 1 · Pool D", "Heat 2 · Pool A", "Heat 2 · Pool B", "Heat 2 · Pool C", "Heat 2 · Pool D"]);
    const [a1, a2] = heats.filter((h) => h.pool === 0);
    expect(slotsOf(sr, a2.id).map((s) => s.group_id)).toEqual(slotsOf(sr, a1.id).map((s) => s.group_id));
  });
  it("runs a time sport in any number of whole pools (D673)", () => {
    expect(formatProblem(3, 3, "time")).toBeNull();
    expect(formatProblem(4, 3, "time")).toBe("4 groups don't split into pools of 3. Change the pool size, or switch this sport to Matches I add by hand.");
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
  it("ranks a forfeit squad last even before its heat is swum", () => {
    let sr = twelve({ result_kind: "time" });
    sr = { ...sr, pools: sr.pools.map((p) => (p.group_id === "g01" ? { ...p, forfeit: true } : p)) };
    const rows = poolStandings(sr, resolveSport(sr, names))[0].rows;
    expect(rows.map((r) => [r.groupId, r.rank])).toEqual([["g02", 1], ["g03", 1], ["g01", 3]]);
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
  it("places a time sport by best time across both heats, once every heat is in (D673)", () => {
    let sr = twelve({ result_kind: "time" });
    sr = { ...sr, pools: sr.pools.map((p) => (p.group_id === "g12" ? { ...p, forfeit: true } : p)) };
    // Heat 1: g01 100.0s … g11 110.0s; heat 2: g05 swims 90.0s, g02 matches g01's 100.0s, g03 DNFs both.
    const heat1 = (g: string) => (g === "g03" ? { dnf: true } : { time_ms: 100000 + (Number(g.slice(1)) - 1) * 1000 });
    const heat2: Record<string, Partial<Slot>> = { g05: { time_ms: 90000 }, g02: { time_ms: 100000 }, g03: { dnf: true } };
    const first = new Set(sr.matches.filter((m) => m.round === "heat 1").map((m) => m.id));
    sr = { ...sr, slots: sr.slots.map((s) => (first.has(s.match_id) && s.group_id ? { ...s, ...heat1(s.group_id) } : s)) };
    expect(sportPlaces(sr, resolveSport(sr, names))).toEqual([]);
    sr = { ...sr, slots: sr.slots.map((s) => (!first.has(s.match_id) && s.group_id ? { ...s, ...(heat2[s.group_id] ?? { time_ms: 200000 }) } : s)) };
    const resolved = resolveSport(sr, names);
    const places = sportPlaces(sr, resolved).map((p) => [p.place, p.groupId]);
    expect(places.slice(0, 4)).toEqual([[1, "g05"], [2, "g01"], [2, "g02"], [4, "g04"]]);
    expect(places.slice(-2)).toEqual([[11, "g03"], [12, "g12"]]);
    const row = timeTable(sr, resolved).find((r) => r.groupId === "g05")!;
    expect([row.swims.map((x) => x.timeMs), row.bestMs]).toEqual([[104000, 90000], 90000]);
    expect(timeTable(sr, resolved).find((r) => r.groupId === "g03")).toMatchObject({ dnf: true, bestMs: null });
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
  it("adds up sports, shows unplaced and forfeits, and shares a place on equal totals", () => {
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
    // D711: equal totals share the place, whoever has more 1st places.
    expect(firsts.map((r) => [r.groupId, r.total, r.rank, r.tied])).toEqual([["x", 70, 1, true], ["y", 70, 1, true]]);
  });
  it("puts every group sharing a place on its podium step, and leaves a skipped place empty", () => {
    const row = (groupId: string, rank: number) => ({ groupId, rank, tied: false, total: 0, bySport: [], bonus: null });
    const steps = (rows: ReturnType<typeof row>[]) => podium(rows).map((s) => [s.rank, s.rows.map((r) => r.groupId)]);
    expect(steps([row("a", 1), row("b", 2), row("c", 3), row("d", 4)])).toEqual([[2, ["b"]], [1, ["a"]], [3, ["c"]]]);
    expect(steps([row("a", 1), row("b", 1), row("c", 3), row("d", 4)])).toEqual([[2, []], [1, ["a", "b"]], [3, ["c"]]]);
    expect(steps([row("a", 1), row("b", 2), row("c", 2), row("d", 2)])).toEqual([[2, ["b", "c", "d"]], [1, ["a"]], [3, []]]);
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

describe("readResult / withChange / pickerOptions (D657, D658)", () => {
  const read = (o: Record<string, string>) => (k: string) => o[k] ?? "";
  it("reads two scores, and a went-through only for a level bracket match", () => {
    let sr = twelve();
    const pool = resolveSport(sr, names).find((r) => r.match.stage === "pool")!;
    expect(readResult(pool, "score", read({ "score:0": "3", "score:1": "1" }))).toEqual({ ok: true, slots: [{ slot: 0, score: 3, time_ms: null, dnf: false }, { slot: 1, score: 1, time_ms: null, dnf: false }], went_through: null });
    expect(readResult(pool, "score", read({ "score:0": "3", "score:1": "" }))).toEqual({ ok: false, error: "Scores must be whole numbers from 0 to 999." });
    expect(readResult(pool, "score", read({ "score:0": "1000", "score:1": "1" })).ok).toBe(false);
    const s1 = matchOf(sr, "Gold · Semi 1");
    sr = pick(sr, s1.id, ["g01", "g07"]);
    const semi = resolveSport(sr, names).find((r) => r.match.id === s1.id)!;
    expect(readResult(semi, "score", read({ "score:0": "1", "score:1": "1" }))).toEqual({ ok: false, error: "Pick who went through." });
    expect(readResult(semi, "score", read({ "score:0": "1", "score:1": "1", went_through: "g07" }))).toMatchObject({ ok: true, went_through: "g07" });
    expect(readResult(semi, "score", read({ "score:0": "2", "score:1": "1", went_through: "g07" }))).toMatchObject({ ok: true, went_through: null });
  });
  it("reads times and DNF, leaving blanks empty", () => {
    const sr = twelve({ result_kind: "time" });
    const heat = resolveSport(sr, names).find((r) => r.match.stage === "pool")!;
    expect(readResult(heat, "time", read({ "time:0": "1:52.30", "time:1": "dnf", "time:2": "" }))).toEqual({ ok: true, went_through: null, slots: [
      { slot: 0, score: null, time_ms: 112300, dnf: false }, { slot: 1, score: null, time_ms: null, dnf: true }, { slot: 2, score: null, time_ms: null, dnf: false },
    ] });
    expect(readResult(heat, "time", read({ "time:0": "fast" }))).toEqual({ ok: false, error: "Times look like 1:52.30, or DNF." });
    expect(readResult(heat, "time", read({}))).toEqual({ ok: false, error: "Type at least one time." });
  });
  it("applies a change to a copy, for blockedBy", () => {
    const sr = twelve();
    const m = sr.matches[0];
    const after = withChange(sr, m.id, { slots: [{ slot: 0, score: 2, time_ms: null, dnf: false }], walkover_to: null, went_through: null });
    expect(slotsOf(after, m.id)[0].score).toBe(2);
    expect(slotsOf(sr, m.id)[0].score).toBeNull();
    const g = withChange(sr, m.id, { groups: [{ slot: 1, group_id: "g09" }] });
    expect(slotsOf(g, m.id)[1].group_id).toBe("g09");
  });
  it("offers a bracket's own pool place first, and marks groups already picked", () => {
    let sr = twelve();
    sr = play(sr, "g01", "g02", 1, 0);
    sr = play(sr, "g02", "g03", 1, 0);
    sr = play(sr, "g01", "g03", 1, 0);
    const s1 = matchOf(sr, "Silver · Semi 1");
    const s2 = matchOf(sr, "Silver · Semi 2");
    sr = pick(sr, s2.id, ["g05", null as unknown as string]);
    const resolved = resolveSport(sr, names);
    const opts = pickerOptions(sr, resolved, poolStandings(sr, resolved), names, s1.id);
    expect(opts[0]).toEqual({ id: "g02", label: "Team 2 · A2", usedIn: null });
    expect(opts.find((o) => o.id === "g05")?.usedIn).toBe("Silver · Semi 2");
    expect(opts).toHaveLength(12);
  });
});

describe("tournamentOverall (D662)", () => {
  it("adds every sport's places for the groups that play, in the given group order", () => {
    let sr = twelve();
    const s1 = matchOf(sr, "Gold · Semi 1");
    const s2 = matchOf(sr, "Gold · Semi 2");
    const fin = matchOf(sr, "Gold · Final");
    sr = score(pick(sr, s1.id, ["g01", "g07"]), s1.id, 4, 2);
    sr = score(pick(sr, s2.id, ["g04", "g10"]), s2.id, 0, 3);
    sr = score(sr, fin.id, 2, 1);
    const groups = [{ id: "sean", name: "Sean" }, ...ids(12).map((id) => ({ id, name: names.get(id)! }))];
    const rows = tournamentOverall([sr], groups, [40, 35, 30]);
    expect(rows).toHaveLength(12);
    expect(rows.slice(0, 2).map((r) => [r.groupId, r.total, r.rank])).toEqual([["g01", 40, 1], ["g10", 35, 2]]);
    expect(rows[2]).toMatchObject({ groupId: "g02", total: 0, rank: 3, tied: true, bySport: [null] });
  });
  it("adds the participation bonus to the groups that earned it (D674)", () => {
    const sr = twelve();
    const groups = ids(12).map((id) => ({ id, name: names.get(id)! }));
    const rows = tournamentOverall([sr], groups, [40], { points: 100, earned: new Set(["g07"]) });
    expect(rows[0]).toMatchObject({ groupId: "g07", total: 100, bonus: 100, rank: 1 });
    expect(rows[1]).toMatchObject({ bonus: 0, total: 0 });
    expect(tournamentOverall([sr], groups, [40])[0].bonus).toBeNull();
  });
  it("reads the bonus: blank or 0 is none", () => {
    expect([readBonus(""), readBonus(" 0 "), readBonus("100")]).toEqual([null, null, 100]);
    expect(() => readBonus("-5")).toThrow("The participation bonus must be a whole number of points, up to 9999.");
  });
  it("shows a forfeit as 0 F before it has a place", () => {
    const sr = twelve();
    const forfeited = { ...sr, pools: sr.pools.map((p) => (p.group_id === "g03" ? { ...p, forfeit: true } : p)) };
    const rows = tournamentOverall([forfeited], ids(12).map((id) => ({ id, name: names.get(id)! })), [40]);
    expect(rows.find((r) => r.groupId === "g03")?.bySport).toEqual(["F"]);
  });
});

describe("final review fixes", () => {
  it("refuses a forfeit flip that would change a played final's teams (D658, D660)", () => {
    let sr = twelve();
    const s1 = matchOf(sr, "Gold · Semi 1");
    const s2 = matchOf(sr, "Gold · Semi 2");
    const fin = matchOf(sr, "Gold · Final");
    sr = score(pick(sr, s1.id, ["g01", "g07"]), s1.id, 4, 2);
    sr = score(pick(sr, s2.id, ["g04", "g10"]), s2.id, 0, 3);
    expect(blockedBy(sr, withForfeit(sr, "g01", true), names)).toBeNull();
    const played = score(sr, fin.id, 2, 1);
    expect(withForfeit(played, "g01", true).pools.find((p) => p.group_id === "g01")?.forfeit).toBe(true);
    expect(blockedBy(played, withForfeit(played, "g01", true), names)).toBe("Gold · Final");
  });
  it("opens on Squads before the deadline, then the Leaderboard or Results (D663)", () => {
    const base = { tab: null, locked: false, leaderboard: true, about: true };
    expect(tournamentTab(base)).toBe("squads");
    expect(tournamentTab({ ...base, locked: true })).toBe("leaderboard");
    expect(tournamentTab({ ...base, locked: true, leaderboard: false })).toBe("results");
    expect(tournamentTab({ ...base, tab: "about" })).toBe("about");
    expect(tournamentTab({ ...base, tab: "about", about: false })).toBe("squads");
    expect(tournamentTab({ ...base, locked: true, tab: "leaderboard", leaderboard: false })).toBe("results");
    expect(tournamentTab({ ...base, tab: "nonsense" })).toBe("squads");
  });
  it("keeps the last sport: the link's, else the remembered one, else the first", () => {
    expect(pickSport("b", "c", ["a", "b", "c"])).toBe("b");
    expect(pickSport(null, "c", ["a", "b", "c"])).toBe("c");
    expect(pickSport("gone", "gone2", ["a", "b"])).toBe("a");
    expect(pickSport(null, null, [])).toBeNull();
  });
});

describe("ad hoc points in the overall table (D705)", () => {
  it("adds adjustments into the Bonus column and the total, with or without a participation bonus", () => {
    const sr = twelve();
    const groups = ids(12).map((id) => ({ id, name: names.get(id)! }));
    const plain = tournamentOverall([sr], groups, [40]);
    expect(plain[0].bonus).toBeNull();
    const adj = tournamentOverall([sr], groups, [40], { points: 0, earned: new Set(), extra: new Map([["g05", 25], ["g06", -10]]) });
    expect(adj[0]).toMatchObject({ groupId: "g05", bonus: 25, total: 25, rank: 1 });
    expect(adj.find((r) => r.groupId === "g06")).toMatchObject({ bonus: -10, total: -10, rank: 12 });
    const both = tournamentOverall([sr], groups, [40], { points: 100, earned: new Set(["g05"]), extra: new Map([["g05", 25]]) });
    expect(both[0]).toMatchObject({ groupId: "g05", bonus: 125, total: 125 });
  });
});
