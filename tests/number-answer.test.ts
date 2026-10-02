import { describe, expect, it } from "vitest";
import { checkNumber, hasNumberLimits, numberInputAttrs } from "@/lib/number-answer";

const km = { label: "Distance (km)", min: 1, max: 50, decimals: 2 };

describe("checkNumber", () => {
  it("accepts a number inside the limits and normalises it", () => {
    expect(checkNumber(km, "2.50")).toEqual({ ok: true, value: "2.5" });
    expect(checkNumber(km, " 10 ")).toEqual({ ok: true, value: "10" });
    expect(checkNumber(km, "1")).toEqual({ ok: true, value: "1" });
    expect(checkNumber(km, "50")).toEqual({ ok: true, value: "50" });
  });

  it("refuses below the minimum", () => {
    expect(checkNumber(km, "0.8")).toEqual({ ok: false, error: "Distance (km) must be at least 1" });
  });

  it("refuses above the maximum", () => {
    expect(checkNumber(km, "50.01")).toEqual({ ok: false, error: "Distance (km) must be 50 or less" });
  });

  it("refuses too many decimal places, ignoring trailing zeros", () => {
    expect(checkNumber(km, "2.345")).toEqual({ ok: false, error: "Distance (km) can have at most 2 decimal places" });
    expect(checkNumber(km, "2.300")).toEqual({ ok: true, value: "2.3" });
  });

  it("asks for a whole number when decimals is 0", () => {
    expect(checkNumber({ label: "Steps", decimals: 0 }, "2.5")).toEqual({ ok: false, error: "Steps must be a whole number" });
  });

  it("refuses anything that is not a plain decimal number", () => {
    for (const bad of ["abc", "1,5", "-2", "1e3", "2.", ".5", "RM 5"]) {
      expect(checkNumber(km, bad)).toEqual({ ok: false, error: "Distance (km) must be a number, like 2.5" });
    }
  });
});

describe("hasNumberLimits", () => {
  it("is false for a number question with no limits", () => {
    expect(hasNumberLimits({})).toBe(false);
    expect(hasNumberLimits({ decimals: 0 })).toBe(true);
    expect(hasNumberLimits({ min: 1 })).toBe(true);
  });
});

describe("numberInputAttrs", () => {
  it("gives the phone a decimal keypad and a step from decimals", () => {
    expect(numberInputAttrs(km)).toEqual({ inputMode: "decimal", step: "0.01", min: 1, max: 50 });
    expect(numberInputAttrs({ decimals: 0 })).toEqual({ inputMode: "decimal", step: "1" });
    expect(numberInputAttrs({ min: 1 })).toEqual({ inputMode: "decimal", step: "any", min: 1 });
  });

  it("is null without limits, so old forms render as before", () => {
    expect(numberInputAttrs({})).toBeNull();
  });
});
