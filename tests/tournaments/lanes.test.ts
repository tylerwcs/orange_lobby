import { describe, expect, it } from "vitest";
import { canSwapIn, drawLanes, laneComplete, lanePlaces, laneTotals, type LaneSeat } from "@/features/tournaments/lib/lanes";
import { sportPlaces, type SportResults } from "@/features/tournaments/lib/results";
import type { TournamentSport } from "@/features/tournaments/lib/squads";

/** A fixed pseudo-random sequence, so every run draws the same lanes. */
const seeded = (seed = 7) => { let s = seed; return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648); };
const side = (id: string, n = 4) => ({ id, bowlers: Array.from({ length: n }, (_, i) => `${id}-${i + 1}`) });
const six = ["A", "B", "C", "D", "E", "F"].map((x) => side(x));

const bowling: TournamentSport = {
  id: "bw", activity_id: "act", name: "Bowling", min_size: 4, max_size: 4, position: 3, result_kind: "score", format: "lanes",
  pool_size: 3, lane_count: 6, games: 4, forfeits_marked_at: null,
};
const sr = (seats: LaneSeat[], forfeit: string[] = []): SportResults => ({
  sport: bowling,
  pools: [...new Set(seats.map((s) => s.group_id))].map((g) => ({ sport_id: "bw", group_id: g, pool: 0, forfeit: forfeit.includes(g), manual_place: null })),
  matches: [], slots: [], seats,
});
/** Every seat of a 6 × 4 draw over 4 games, scored by `score(side)`. */
const scored = (score: (side: string) => number | null) =>
  drawLanes(six, 6, 4, seeded()).map((s) => ({ ...s, sport_id: "bw", score: score(s.group_id) }));

describe("drawLanes (D862)", () => {
  const seats = drawLanes(six, 6, 4, seeded());

  it("seats every bowler once per game, 4 to a lane, never two of one side on a lane", () => {
    expect(seats).toHaveLength(96);
    for (let game = 1; game <= 4; game++) {
      const g = seats.filter((s) => s.game === game);
      expect(new Set(g.map((s) => s.attendee_id)).size).toBe(24);
      for (let lane = 1; lane <= 6; lane++) {
        const l = g.filter((s) => s.lane === lane);
        expect(l).toHaveLength(4);
        expect(new Set(l.map((s) => s.group_id)).size).toBe(4);
        expect(l.map((s) => s.seat).sort()).toEqual([1, 2, 3, 4]);
      }
    }
  });

  it("numbers each side's bowlers 1-4 once, the same in every game", () => {
    for (const { id } of six) {
      const mine = seats.filter((s) => s.group_id === id);
      expect(new Set(mine.filter((s) => s.game === 1).map((s) => s.number))).toEqual(new Set([1, 2, 3, 4]));
      for (const s of mine) expect(s.number).toBe(mine.find((x) => x.game === 1 && x.attendee_id === s.attendee_id)!.number);
    }
  });

  it("reshuffles lane-mates from game to game", () => {
    const met = new Map<string, number>();
    for (let game = 1; game <= 4; game++) {
      for (let lane = 1; lane <= 6; lane++) {
        const l = seats.filter((s) => s.game === game && s.lane === lane).map((s) => s.attendee_id).sort();
        for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) met.set(`${l[i]}|${l[j]}`, (met.get(`${l[i]}|${l[j]}`) ?? 0) + 1);
      }
    }
    const repeats = [...met.values()].reduce((n, v) => n + v - 1, 0);
    expect(repeats).toBeLessThanOrEqual(24);
  });

  it("fills lanes as evenly as it can with fewer bowlers, still one per side per lane", () => {
    const five = drawLanes(six.slice(0, 5), 6, 2, seeded(3));
    for (let game = 1; game <= 2; game++) {
      const sizes = [1, 2, 3, 4, 5, 6].map((lane) => five.filter((s) => s.game === game && s.lane === lane).length).sort();
      expect(sizes).toEqual([3, 3, 3, 3, 4, 4]);
      for (let lane = 1; lane <= 6; lane++) {
        const l = five.filter((s) => s.game === game && s.lane === lane);
        expect(new Set(l.map((s) => s.group_id)).size).toBe(l.length);
      }
    }
  });
});

describe("totals and places (D866, D861a)", () => {
  const points: Record<string, number> = { A: 150, B: 120, C: 120, D: 100, E: 90, F: 80 };

  it("sums each side's seats and counts what's keyed", () => {
    const t = laneTotals(scored((g) => points[g]), ["A", "B"]);
    expect(t).toEqual([{ groupId: "A", total: 2400, keyed: 16, seats: 16 }, { groupId: "B", total: 1920, keyed: 16, seats: 16 }]);
  });

  it("ranks by total once every seat is keyed; equal totals share a place", () => {
    const r = sr(scored((g) => points[g]));
    expect(laneComplete(r)).toBe(true);
    expect(lanePlaces(r)).toEqual([
      { place: 1, groupId: "A", forfeit: false }, { place: 2, groupId: "B", forfeit: false }, { place: 2, groupId: "C", forfeit: false },
      { place: 4, groupId: "D", forfeit: false }, { place: 5, groupId: "E", forfeit: false }, { place: 6, groupId: "F", forfeit: false },
    ]);
    expect(sportPlaces(r, [])).toEqual(lanePlaces(r));
  });

  it("has no places while one seat is blank", () => {
    const seats = scored((g) => points[g]);
    seats[17] = { ...seats[17], score: null };
    expect(laneComplete(sr(seats))).toBe(false);
    expect(lanePlaces(sr(seats))).toEqual([]);
  });

  it("places a side forfeited after the draw last, without waiting for its seats", () => {
    const r = sr(scored((g) => (g === "B" ? null : points[g])), ["B"]);
    expect(laneComplete(r)).toBe(true);
    expect(lanePlaces(r).map((p) => [p.place, p.groupId, p.forfeit])).toEqual([
      [1, "A", false], [2, "C", false], [3, "D", false], [4, "E", false], [5, "F", false], [6, "B", true],
    ]);
  });

  it("has no places before a draw", () => {
    expect(laneComplete(sr([]))).toBe(false);
    expect(lanePlaces(sr([]))).toEqual([]);
  });
});

describe("canSwapIn (D864)", () => {
  const seats = scored(() => null);
  it("refuses someone already bowling in this sport", () => {
    expect(canSwapIn(seats, "bw", "A-1")).toBe(false);
    expect(canSwapIn(seats, "bw", "stand-in")).toBe(true);
  });
});
