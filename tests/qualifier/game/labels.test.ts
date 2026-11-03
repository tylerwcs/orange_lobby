import { describe, expect, it } from "vitest";
import { layoutLabels, type LabelBox } from "@/features/qualifier/game/labels";

const view = { w: 400, h: 700 };
type Placed = { id: number; x: number; y: number; w: number; h: number };

const overlaps = (a: Placed, b: Placed) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function placed(boxes: readonly LabelBox[]): Placed[] {
  const out = layoutLabels(boxes, view);
  return boxes.map((b) => {
    const p = out.get(b.id);
    if (!p) throw new Error(`no position for ${b.id}`);
    return { id: b.id, x: p.x, y: p.y, w: b.w, h: b.h };
  });
}

function expectClean(ps: Placed[]) {
  for (const p of ps) {
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.x + p.w).toBeLessThanOrEqual(view.w);
    expect(p.y + p.h).toBeLessThanOrEqual(view.h);
  }
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) expect(overlaps(ps[i], ps[j])).toBe(false);
}

describe("layoutLabels", () => {
  it("spreads 8 labels at the same point so none overlap and all stay inside the view", () => {
    const boxes = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, x: 150, y: 300, w: 110, h: 34, near: 5 + i }));
    expectClean(placed(boxes));
  });

  it("still finds room when the shared point is near the top of the view", () => {
    const boxes = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, x: 150, y: 10, w: 110, h: 34, near: 5 + i }));
    expectClean(placed(boxes));
  });

  it("keeps the nearest label where it is, whatever the input order", () => {
    const boxes: LabelBox[] = [
      { id: 1, x: 140, y: 300, w: 100, h: 30, near: 12 },
      { id: 2, x: 150, y: 305, w: 100, h: 30, near: 4 },
      { id: 3, x: 145, y: 310, w: 100, h: 30, near: 8 },
    ];
    const out = layoutLabels(boxes, view);
    expect(out.get(2)).toEqual({ x: 150, y: 305 });
  });

  it("moves an overlapping farther label up, not the nearer one", () => {
    const boxes: LabelBox[] = [
      { id: 1, x: 150, y: 300, w: 100, h: 30, near: 3 },
      { id: 2, x: 160, y: 310, w: 100, h: 30, near: 9 },
    ];
    const out = layoutLabels(boxes, view);
    expect(out.get(1)).toEqual({ x: 150, y: 300 });
    expect(out.get(2)!.y).toBeLessThanOrEqual(300 - 30);
    expect(out.get(2)!.x).toBe(160);
  });

  it("does not move a label that is already clear", () => {
    const boxes: LabelBox[] = [
      { id: 1, x: 20, y: 400, w: 100, h: 30, near: 3 },
      { id: 2, x: 250, y: 100, w: 100, h: 30, near: 9 },
    ];
    const out = layoutLabels(boxes, view);
    expect(out.get(1)).toEqual({ x: 20, y: 400 });
    expect(out.get(2)).toEqual({ x: 250, y: 100 });
  });

  it("clamps a label that sticks out of the view back inside it", () => {
    const out = layoutLabels([{ id: 1, x: 360, y: -20, w: 100, h: 30, near: 3 }], view);
    expect(out.get(1)).toEqual({ x: 300, y: 0 });
  });

  it("keeps every label below view.top, where the score and the clock are", () => {
    const boxes = [0, 1, 2].map((id) => ({ id, x: 100, y: 10, w: 120, h: 30, near: id }));
    const at = layoutLabels(boxes, { w: 800, h: 600, top: 90 });
    for (const p of at.values()) expect(p.y).toBeGreaterThanOrEqual(90);
  });

  it("returns an empty map for no labels", () => {
    expect(layoutLabels([], view).size).toBe(0);
  });
});
