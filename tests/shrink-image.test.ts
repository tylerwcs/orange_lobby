import { describe, it, expect } from "vitest";
import { fitWithin, shouldShrink, SHRINK_EDGE, SHRINK_ABOVE_BYTES } from "@/lib/shrink-image";

describe("fitWithin", () => {
  it("scales the long edge down to the limit and keeps the aspect ratio", () => {
    expect(fitWithin(4032, 3024, 2400)).toEqual({ width: 2400, height: 1800 });
    expect(fitWithin(3024, 4032, 2400)).toEqual({ width: 1800, height: 2400 });
  });

  it("never scales up", () => {
    expect(fitWithin(1200, 800, 2400)).toEqual({ width: 1200, height: 800 });
  });
});

describe("shouldShrink", () => {
  const big = SHRINK_ABOVE_BYTES + 1;

  it("shrinks a large photo", () => {
    expect(shouldShrink({ type: "image/jpeg", size: big })).toBe(true);
    expect(shouldShrink({ type: "image/png", size: big })).toBe(true);
    expect(shouldShrink({ type: "image/webp", size: big })).toBe(true);
  });

  it("leaves a small image alone", () => {
    expect(shouldShrink({ type: "image/jpeg", size: SHRINK_ABOVE_BYTES })).toBe(false);
  });

  it("never touches a PDF", () => {
    expect(shouldShrink({ type: "application/pdf", size: big })).toBe(false);
  });

  it("keeps an InBody sheet readable", () => {
    expect(SHRINK_EDGE).toBeGreaterThanOrEqual(2000);
  });
});
