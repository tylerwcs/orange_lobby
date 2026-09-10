import { describe, it, expect } from "vitest";
import { meterPercent } from "@/components/ui/Meter";

describe("meterPercent", () => {
  it("scales value against max", () => {
    expect(meterPercent(76, 98)).toBeCloseTo(77.55, 1);
    expect(meterPercent(0, 98)).toBe(0);
    expect(meterPercent(98, 98)).toBe(100);
  });

  it("returns 0 when max is zero or negative so an empty event does not divide by zero", () => {
    expect(meterPercent(0, 0)).toBe(0);
    expect(meterPercent(5, 0)).toBe(0);
    expect(meterPercent(5, -1)).toBe(0);
  });

  it("clamps out-of-range values", () => {
    expect(meterPercent(120, 98)).toBe(100);
    expect(meterPercent(-4, 98)).toBe(0);
  });
});
