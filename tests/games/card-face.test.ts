import { describe, expect, it } from "vitest";
import { cardUv, containRect, coverCrop, fitText, wrapWords } from "@/features/games/card-face";

// A fixed-width stand-in for canvas measureText: every character is half the font size wide.
const measure = (s: string, size: number) => s.length * size * 0.5;

describe("coverCrop", () => {
  it("crops the sides of a wide image to a tall card, centred", () => {
    const r = coverCrop(2000, 1000, 100, 140);
    expect(r.h).toBe(1000);
    expect(r.w).toBeCloseTo(1000 / 1.4, 6);
    expect(r.x).toBeCloseTo((2000 - r.w) / 2, 6);
    expect(r.y).toBe(0);
  });
  it("crops the top and bottom of a tall image to a wide box", () => {
    const r = coverCrop(500, 2000, 200, 100);
    expect(r.w).toBe(500);
    expect(r.h).toBeCloseTo(250, 6);
    expect(r.y).toBeCloseTo(875, 6);
  });
  it("keeps the box's aspect ratio and stays inside the image", () => {
    for (const [iw, ih] of [[640, 480], [480, 640], [1000, 1000], [37, 911]]) {
      const r = coverCrop(iw, ih, 260, 364);
      expect(r.w / r.h).toBeCloseTo(260 / 364, 6);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(iw + 1e-9);
      expect(r.y + r.h).toBeLessThanOrEqual(ih + 1e-9);
    }
  });
  it("uses the whole image for a zero-sized box or image instead of dividing by zero", () => {
    expect(coverCrop(100, 50, 0, 10)).toEqual({ x: 0, y: 0, w: 100, h: 50 });
    expect(coverCrop(0, 0, 10, 10)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});

describe("containRect", () => {
  const box = { x: 10, y: 20, w: 200, h: 100 };
  it("fits a wide image to the box's width, centred vertically", () => {
    expect(containRect(400, 100, box)).toEqual({ x: 10, y: 45, w: 200, h: 50 });
  });
  it("fits a tall image to the box's height, centred horizontally", () => {
    expect(containRect(100, 400, box)).toEqual({ x: 97.5, y: 20, w: 25, h: 100 });
  });
  it("returns the box itself for an image with no size", () => {
    expect(containRect(0, 0, box)).toEqual(box);
  });
});

describe("cardUv", () => {
  it("maps the card's corners to the texture's corners", () => {
    expect(cardUv(-50, -70, 100, 140)).toEqual([0, 0]);
    expect(cardUv(50, 70, 100, 140)).toEqual([1, 1]);
    expect(cardUv(0, 0, 100, 140)).toEqual([0.5, 0.5]);
    expect(cardUv(-50, 70, 100, 140)).toEqual([0, 1]);
  });
});

describe("wrapWords", () => {
  it("puts as many words on a line as fit", () => {
    expect(wrapWords("aa bb cc dd", 5, (s) => s.length)).toEqual(["aa bb", "cc dd"]);
  });
  it("gives an over-long word its own line", () => {
    expect(wrapWords("a enormous b", 5, (s) => s.length)).toEqual(["a", "enormous", "b"]);
  });
  it("ignores extra spaces", () => {
    expect(wrapWords("  a   b  ", 10, (s) => s.length)).toEqual(["a b"]);
  });
});

describe("fitText", () => {
  it("keeps the starting size when the text already fits", () => {
    expect(fitText("7", measure, { maxW: 100, maxH: 100, maxLines: 1, start: 60 })).toEqual({ lines: ["7"], size: 60 });
  });
  it("shrinks one line until it fits the width", () => {
    const r = fitText("Grand prize", measure, { maxW: 110, maxH: 200, maxLines: 1, start: 60 });
    expect(r.lines).toEqual(["Grand prize"]);
    expect(measure("Grand prize", r.size)).toBeLessThanOrEqual(110);
    expect(r.size).toBeGreaterThan(15);
  });
  it("wraps onto more lines before shrinking further, within the height", () => {
    const r = fitText("Samsung Galaxy Tab", measure, { maxW: 100, maxH: 100, maxLines: 3, start: 40 });
    expect(r.lines.length).toBeGreaterThan(1);
    expect(r.lines.length).toBeLessThanOrEqual(3);
    for (const l of r.lines) expect(measure(l, r.size)).toBeLessThanOrEqual(100);
    expect(r.lines.length * r.size * 1.1 - 0.1 * r.size).toBeLessThanOrEqual(100);
  });
  it("falls back to the minimum size with at most maxLines lines when nothing fits", () => {
    const r = fitText("one two three four five six", measure, { maxW: 10, maxH: 10, maxLines: 2, start: 40, min: 8 });
    expect(r.size).toBe(8);
    expect(r.lines).toHaveLength(2);
    expect(r.lines.join(" ")).toBe("one two three four five six");
  });
});
