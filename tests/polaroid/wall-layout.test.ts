import { describe, expect, it } from "vitest";
import {
  autoColumns, columnCount, assignColumns, shortestColumn, layoutColumn, visibleSlots, keepAnchor, insertionFor, rebase, columnSpeed,
  minCycleFor, padToFill,
} from "@/features/polaroid/lib/wall-layout";

const items = (hs: number[]) => hs.map((height, i) => ({ id: String.fromCharCode(97 + i), height }));

describe("column count (D484)", () => {
  it("fits the KOM LED and an ordinary TV", () => {
    expect(autoColumns(5504, 2322)).toBe(7);
    expect(autoColumns(1920, 1080)).toBe(5);
  });
  it("never goes under 3 or over 10, and honours an override", () => {
    expect(autoColumns(800, 1080)).toBe(3);
    expect(autoColumns(20000, 1000)).toBe(10);
    expect(autoColumns(0, 0)).toBe(3);
    expect(columnCount(6, 5504, 2322)).toBe(6);
    expect(columnCount("auto", 1920, 1080)).toBe(5);
  });
});

describe("assignColumns", () => {
  it("gives each card, oldest first, to the column with the least content", () => {
    expect(assignColumns(items([100, 100, 100, 300, 100]), 2, 0)).toEqual([["a", "c", "e"], ["b", "d"]]);
  });
  it("repeats cards across columns when there are fewer cards than columns", () => {
    expect(assignColumns(items([100, 100]), 3, 0)).toEqual([["a"], ["b"], ["a"]]);
    expect(assignColumns([], 3, 0)).toEqual([[], [], []]);
  });
  it("keeps every card exactly once whatever the column count (Review Focus 3)", () => {
    const seven = items([120, 90, 200, 150, 110, 130, 170]);
    for (const cols of [3, 5, 7]) {
      expect(assignColumns(seven, cols, 10).flat().sort()).toEqual(seven.map((s) => s.id).sort());
    }
  });
  it("finds the shortest column", () => {
    expect(shortestColumn([300, 120, 120, 400])).toBe(1);
  });
});

describe("visibleSlots", () => {
  const layout = layoutColumn([100, 50], 10);
  it("lays cards out with a gap and a cycle", () => {
    expect(layout).toEqual({ tops: [0, 110], heights: [100, 50], cycle: 170 });
  });
  it("finds what overlaps the window, across the repeat", () => {
    expect(visibleSlots(layout, 150, 100, 0)).toEqual([
      { index: 1, repeat: 0, y: 110 },
      { index: 0, repeat: 1, y: 170 },
    ]);
  });
  it("repeats a short column until it fills the screen", () => {
    expect(visibleSlots(layoutColumn([100], 10), 0, 400, 0).map((s) => s.y)).toEqual([0, 110, 220, 330]);
  });
  it("is empty for an empty column", () => {
    expect(visibleSlots(layoutColumn([], 10), 0, 400, 0)).toEqual([]);
  });
});

describe("insertionFor: nothing on screen moves", () => {
  const layout = layoutColumn([100, 100, 100], 0);
  it("scrolling up, goes in just below the last card on screen", () => {
    expect(insertionFor(layout, 0, 150, 1, 100, 0)).toEqual({ index: 2, offset: 0 });
  });
  it("scrolling down, goes in just above the first card on screen, with the offset carried", () => {
    expect(insertionFor(layout, 0, 150, -1, 100, 0)).toEqual({ index: 0, offset: 100 });
  });
  it("keeps every visible card at the same screen position, wherever the window is", () => {
    for (const [offset, dir] of [[250, 1], [250, -1], [620, 1], [-130, -1]] as const) {
      const { index, offset: next } = insertionFor(layout, offset, 150, dir, 80, 0);
      const heights = [100, 100, 100];
      heights.splice(index, 0, 80);
      const after = layoutColumn(heights, 0);
      const before = visibleSlots(layout, offset, 150, 0).map((s) => s.y - offset);
      const kept = visibleSlots(after, next, 150, 0).filter((s) => s.index !== index).map((s) => s.y - next);
      expect(kept).toEqual(before);
      expect(visibleSlots(after, next, 150, 0).some((s) => s.index === index)).toBe(false);
    }
  });
});

describe("padToFill (D484)", () => {
  it("repeats a short column's ids until one pass is at least the minimum cycle", () => {
    expect(padToFill(["a", "b"], () => 100, 0, 450)).toEqual(["a", "b", "a", "b", "a", "b"]);
  });
  it("leaves an empty column empty", () => {
    expect(padToFill([], () => 100, 0, 450)).toEqual([]);
  });
  it("returns a column that is already tall enough once", () => {
    expect(padToFill(["a", "b"], () => 100, 0, 150)).toEqual(["a", "b"]);
  });
});

describe("insertion into a padded sparse column (D484)", () => {
  const view = 200;
  const ids = padToFill(["a", "b"], () => 100, 0, minCycleFor(view, 100, 0));
  const layout = layoutColumn(ids.map(() => 100), 0);
  it("pads two cards to four slots and a 400 cycle", () => {
    expect(ids).toEqual(["a", "b", "a", "b"]);
    expect(layout.cycle).toBe(400);
  });
  it("keeps every visible card still, and the new card off screen, in both directions", () => {
    for (const offset of [0, 50, 130, 370, -90]) {
      for (const dir of [1, -1] as const) {
        const { index, offset: next } = insertionFor(layout, offset, view, dir, 100, 0);
        const heights = [...layout.heights];
        heights.splice(index, 0, 100);
        const after = layoutColumn(heights, 0);
        const before = visibleSlots(layout, offset, view, 0).map((s) => s.y - offset);
        const shown = visibleSlots(after, next, view, 0);
        expect(shown.filter((s) => s.index !== index).map((s) => s.y - next)).toEqual(before);
        expect(shown.some((s) => s.index === index)).toBe(false);
      }
    }
  });
});

describe("keepAnchor", () => {
  it("a removal above the screen shifts the offset by the removed card", () => {
    const prev = layoutColumn([100, 100, 100], 0);
    const next = layoutColumn([100, 100], 0);
    expect(keepAnchor(prev, next, 150, 100, (i) => (i === 0 ? null : i - 1))).toBe(50);
  });
  it("with several removals, the first surviving card on screen still does not move", () => {
    const prev = layoutColumn([100, 100, 100, 100], 0);
    const next = layoutColumn([100, 100], 0);
    const map = [0, null, 1, null];
    const newIndexOf = (i: number) => map[i];
    const offset = keepAnchor(prev, next, 150, 100, newIndexOf);
    const anchor = visibleSlots(prev, 150, 100, 0).find((s) => newIndexOf(s.index) !== null)!;
    const moved = visibleSlots(next, offset, 100, 0).find((s) => s.index === newIndexOf(anchor.index))!;
    expect(moved.y - offset).toBe(anchor.y - 150);
  });
});

describe("rebase (Review Focus 1)", () => {
  it("leaves small offsets alone", () => {
    expect(rebase(500, 300)).toBe(500);
  });
  it("pulls a huge offset back by whole cycles, so the picture is unchanged", () => {
    expect(rebase(2_500_000.5, 300)).toBeCloseTo(100.5);
    expect(rebase(-2_500_000, 300)).toBeCloseTo(-100);
  });
  it("does nothing to an empty column", () => {
    expect(rebase(5_000_000, 0)).toBe(5_000_000);
  });
});

describe("columnSpeed", () => {
  it("alternates direction and scales with the screen height", () => {
    expect(columnSpeed("medium", 0, 1080)).toBe(50);
    expect(columnSpeed("medium", 1, 1080)).toBeCloseTo(-53.5);
    expect(columnSpeed("slow", 0, 2160)).toBe(60);
  });
});
