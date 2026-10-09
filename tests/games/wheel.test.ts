import { describe, expect, it } from "vitest";
import { canTick, easeOutQuart, landingAngle, sliceAt, TICK_MIN_MS } from "@/features/games/wheel";

const TAU = Math.PI * 2;

describe("wheel geometry (D314)", () => {
  it("slice 0 is under the pointer at rest", () => {
    expect(sliceAt(0.01, 12)).toBe(11);
    expect(sliceAt(-0.01, 12)).toBe(0);
    expect(sliceAt(TAU - TAU / 24, 12)).toBe(0);
  });
  it("lands on the target slice after whole turns", () => {
    for (const n of [2, 7, 60, 437]) {
      for (const t of [0, 1, Math.floor(n / 2), n - 1]) {
        const a = landingAngle(t, n, 5);
        expect(sliceAt(a, n)).toBe(t);
        expect(a).toBeGreaterThanOrEqual(5 * TAU);
      }
    }
  });
  it("stays inside the slice for any offset within it", () => {
    expect(sliceAt(landingAngle(3, 10, 4, 0.1), 10)).toBe(3);
    expect(sliceAt(landingAngle(3, 10, 4, 0.9), 10)).toBe(3);
  });
  it("eases from 0 to 1", () => {
    expect(easeOutQuart(0)).toBe(0);
    expect(easeOutQuart(1)).toBe(1);
    expect(easeOutQuart(0.5)).toBeGreaterThan(0.9);
  });
  it("caps slice ticks at 30 a second", () => {
    expect(canTick(0, TICK_MIN_MS - 1)).toBe(false);
    expect(canTick(0, TICK_MIN_MS)).toBe(true);
  });
});

