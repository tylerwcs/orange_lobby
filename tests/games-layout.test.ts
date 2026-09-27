import { describe, expect, it } from "vitest";
import { cardGrid, cardLayout, reelLayout, toWorld } from "@/lib/games/layout";

describe("cardGrid (D317)", () => {
  it("is 5×2 for 10 and 3×2 for 6", () => {
    expect(cardGrid(10)).toEqual({ cols: 5, rows: 2 });
    expect(cardGrid(6)).toEqual({ cols: 3, rows: 2 });
  });
  it("is one row up to 5, then 2, 3 and 4 rows", () => {
    expect(cardGrid(1)).toEqual({ cols: 1, rows: 1 });
    expect(cardGrid(5)).toEqual({ cols: 5, rows: 1 });
    expect(cardGrid(15)).toEqual({ cols: 5, rows: 3 });
    expect(cardGrid(20)).toEqual({ cols: 5, rows: 4 });
    expect(cardGrid(11)).toEqual({ cols: 4, rows: 3 });
  });
});

describe("cardLayout", () => {
  it("places every card on the canvas without overlap", () => {
    for (const n of [1, 3, 6, 10, 14, 20]) {
      const boxes = cardLayout(n);
      expect(boxes).toHaveLength(n);
      for (const b of boxes) {
        expect(b.x - b.w / 2).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w / 2).toBeLessThanOrEqual(1920);
        expect(b.y - b.h / 2).toBeGreaterThanOrEqual(200);
        expect(b.y + b.h / 2).toBeLessThanOrEqual(1080);
      }
      for (let i = 1; i < boxes.length; i++) {
        const [a, b] = [boxes[i - 1], boxes[i]];
        const apart = Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2;
        expect(apart).toBe(true);
      }
    }
  });
});

describe("reelLayout (D313)", () => {
  it("is one wide reel for one winner", () => {
    expect(reelLayout(1)).toHaveLength(1);
    expect(reelLayout(1)[0].w).toBeGreaterThan(1000);
  });
  it("is one row up to 5 and two rows up to 10", () => {
    expect(new Set(reelLayout(5).map((b) => b.y)).size).toBe(1);
    expect(new Set(reelLayout(10).map((b) => b.y)).size).toBe(2);
  });
  it("has no reels past 10", () => {
    expect(reelLayout(11)).toEqual([]);
  });
});

describe("toWorld", () => {
  it("puts the canvas centre at the origin with y up", () => {
    expect(toWorld(960, 540)).toEqual([0, 0]);
    expect(toWorld(0, 0)).toEqual([-960, 540]);
  });
});
