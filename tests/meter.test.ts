import { describe, it, expect } from "vitest";
import { meterPercent, meterAriaMax, meterAriaValue } from "@/components/ui/Meter";

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

describe("meterAriaMax", () => {
  it("passes through a positive max", () => {
    expect(meterAriaMax(98)).toBe(98);
  });

  it("floors at 1 so an empty event (max 0, or negative) never yields aria-valuemax <= aria-valuemin", () => {
    expect(meterAriaMax(0)).toBe(1);
    expect(meterAriaMax(-3)).toBe(1);
  });
});

describe("meterAriaValue", () => {
  it("passes through an in-range value", () => {
    expect(meterAriaValue(76, 98)).toBe(76);
  });

  it("clamps into [0, meterAriaMax(max)], matching the visual fill even on an empty event", () => {
    expect(meterAriaValue(0, 0)).toBe(0);
    expect(meterAriaValue(5, 0)).toBe(1);
    expect(meterAriaValue(-4, 98)).toBe(0);
    expect(meterAriaValue(120, 98)).toBe(98);
  });
});
