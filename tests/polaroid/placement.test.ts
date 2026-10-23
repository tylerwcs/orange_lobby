import { describe, expect, it } from "vitest";
import { cleanPlacements, clampPlacement, normaliseAngle, newPlacement, MAX_STICKERS } from "@/features/polaroid/lib/placement";
import { pinch, handleDrag } from "@/features/polaroid/lib/gesture";
import { cardRatio } from "@/features/polaroid/lib/card";

const allowed = new Set(["heart", "star"]);
const p = (over = {}) => ({ id: "heart", x: 0.5, y: 0.5, scale: 0.2, rot: 0, ...over });

describe("cleanPlacements (D476)", () => {
  it("accepts up to 8 known stickers", () => {
    expect(cleanPlacements(Array.from({ length: MAX_STICKERS }, () => p()), allowed, 1.2).ok).toBe(true);
  });
  it("refuses 9, an unknown id, a non-number and a non-list", () => {
    expect(cleanPlacements(Array.from({ length: 9 }, () => p()), allowed, 1.2)).toEqual({ ok: false, error: "Use up to 8 stickers." });
    expect(cleanPlacements([p({ id: "ev-gone0000" })], allowed, 1.2).ok).toBe(false);
    expect(cleanPlacements([p({ x: Number.NaN })], allowed, 1.2).ok).toBe(false);
    expect(cleanPlacements("nope", allowed, 1.2).ok).toBe(false);
  });
  it("clamps position, size and angle into the card", () => {
    const r = cleanPlacements([p({ x: 1.4, y: -1, scale: 2, rot: 270 })], allowed, 1.2);
    expect(r).toEqual({ ok: true, stickers: [{ id: "heart", x: 1, y: 0, scale: 0.6, rot: -90 }] });
  });
  it("bounds y by the clamped card ratio of an extreme photo (Review Focus 5)", () => {
    const ratio = cardRatio(1, 4000);
    const r = cleanPlacements([p({ y: 50 })], allowed, ratio);
    expect(r.ok && r.stickers[0].y).toBeCloseTo(ratio, 3);
    expect(ratio).toBeLessThan(2);
  });
});

describe("normaliseAngle", () => {
  it("wraps into −180…180", () => {
    expect(normaliseAngle(270)).toBe(-90);
    expect(normaliseAngle(-190)).toBe(170);
    expect(normaliseAngle(45)).toBe(45);
  });
});

describe("newPlacement and clampPlacement", () => {
  it("drops a new sticker in the middle of the photo, 22% of the card wide", () => {
    // 0.055 + (1.2 − 0.055 − 0.27) / 2 = 0.4925
    expect(newPlacement("star", 1.2)).toEqual({ id: "star", x: 0.5, y: 0.4925, scale: 0.22, rot: 0 });
  });
  it("still lands in the photo's middle when a print logo deepens the strip (D718)", () => {
    // 0.055 + (1.28 − 0.055 − 0.35) / 2 = 0.4925
    expect(newPlacement("star", 1.28, true).y).toBe(0.4925);
  });
  it("rounds to four decimals", () => {
    expect(clampPlacement(p({ x: 0.123456 }), 1).x).toBe(0.1235);
  });
});

describe("gestures", () => {
  it("pinch scales by the spread and rotates by the turn", () => {
    const k = pinch([{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 0, y: 0 }, { x: 0, y: 20 }], { scale: 0.2, rot: 10 });
    expect(k.scale).toBeCloseTo(0.4);
    expect(k.rot).toBeCloseTo(100);
  });
  it("the corner handle measures from the sticker's centre", () => {
    const k = handleDrag({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { scale: 0.3, rot: 0 });
    expect(k.scale).toBeCloseTo(0.3);
    expect(k.rot).toBeCloseTo(90);
  });
  it("ignores a pinch that starts with both fingers on one spot", () => {
    expect(pinch([{ x: 5, y: 5 }, { x: 5, y: 5 }], [{ x: 0, y: 0 }, { x: 9, y: 9 }], { scale: 0.2, rot: 0 })).toEqual({ scale: 0.2, rot: 0 });
  });
});
