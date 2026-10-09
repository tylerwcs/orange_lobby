import { describe, expect, it } from "vitest";
import { mosaicSurvivors, survivorCounts, tierFor, gridFor, seededOrder } from "@/features/games/mosaic";

describe("tierFor", () => {
  it("picks a tier by how many players are still in", () => {
    expect([500, 200, 199, 50, 49, 6, 5, 1].map(tierFor))
      .toEqual(["dense", "dense", "medium", "medium", "large", "large", "finalist", "finalist"]);
  });
});

describe("gridFor", () => {
  it("gives one player the whole height", () => {
    expect(gridFor(1)).toEqual({ cols: 1, rows: 1, cell: 1080 });
  });
  it("fits every player on a 1920×1080 screen", () => {
    for (const n of [2, 7, 38, 147, 312, 500, 1000]) {
      const g = gridFor(n);
      expect(g.cols * g.rows).toBeGreaterThanOrEqual(n);
      expect(g.cols * g.cell).toBeLessThanOrEqual(1920);
      expect(g.rows * g.cell).toBeLessThanOrEqual(1080);
    }
  });
  it("keeps 500 tiles big enough to read initials", () => {
    expect(gridFor(500).cell).toBeGreaterThanOrEqual(55);
  });
});

describe("seededOrder", () => {
  const ids = Array.from({ length: 20 }, (_, i) => `a${i}`);
  it("is a permutation", () => {
    expect([...seededOrder(ids, "r1:0")].sort()).toEqual([...ids].sort());
  });
  it("is the same for the same seed, so a reload replays the ripple", () => {
    expect(seededOrder(ids, "r1:0")).toEqual(seededOrder(ids, "r1:0"));
  });
  it("differs between questions", () => {
    expect(seededOrder(ids, "r1:0")).not.toEqual(seededOrder(ids, "r1:1"));
  });
  it("does not change its input", () => {
    const copy = [...ids];
    seededOrder(ids, "x");
    expect(ids).toEqual(copy);
  });
});

describe("mosaic elimination rounds (D315)", () => {
  const pool = Array.from({ length: 300 }, (_, i) => `p${String(i).padStart(3, "0")}`);
  const winners = ["p007", "p250"];

  it("shrinks geometrically from the pool to the winners", () => {
    const c = survivorCounts(300, 2, 4);
    expect(c[0]).toBe(300);
    expect(c[4]).toBe(2);
    for (let r = 1; r <= 4; r++) expect(c[r]).toBeLessThan(c[r - 1]);
    expect(c[2]).toBe(Math.round(300 * Math.pow(2 / 300, 2 / 4)));
  });
  it("still shrinks by at least one each round when the numbers are small", () => {
    expect(survivorCounts(5, 1, 4)).toEqual([5, 4, 3, 2, 1]);
  });
  it("never drops below the winners, even with more rounds than people", () => {
    const c = survivorCounts(3, 1, 8);
    expect(Math.min(...c)).toBe(1);
    expect(c[8]).toBe(1);
  });
  it("round 0 is everyone and the last round is exactly the winners", () => {
    expect(mosaicSurvivors(pool, winners, 0, 4, "s")).toEqual(pool);
    expect(mosaicSurvivors(pool, winners, 4, 4, "s")).toEqual(winners);
  });
  it("always keeps the winners and keeps pool order", () => {
    for (let r = 0; r <= 4; r++) {
      const s = mosaicSurvivors(pool, winners, r, 4, "s");
      expect(s).toEqual(expect.arrayContaining(winners));
      expect(s).toEqual(pool.filter((id) => s.includes(id)));
      expect(s.length).toBe(survivorCounts(300, 2, 4)[r]);
    }
  });
  it("each round's survivors are inside the last round's", () => {
    for (let r = 1; r <= 4; r++) {
      const before = new Set(mosaicSurvivors(pool, winners, r - 1, 4, "s"));
      expect(mosaicSurvivors(pool, winners, r, 4, "s").every((id) => before.has(id))).toBe(true);
    }
  });
  it("is the same for the same seed and different for another", () => {
    expect(mosaicSurvivors(pool, winners, 2, 4, "s")).toEqual(mosaicSurvivors(pool, winners, 2, 4, "s"));
    expect(mosaicSurvivors(pool, winners, 2, 4, "s")).not.toEqual(mosaicSurvivors(pool, winners, 2, 4, "t"));
  });
});
