import { describe, expect, it } from "vitest";
import { tierFor, gridFor, seededOrder } from "@/lib/games/mosaic";

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
