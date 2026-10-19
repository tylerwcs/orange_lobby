import { describe, expect, it } from "vitest";
import { adjustmentTotals, readAdjustment } from "@/lib/adjustments";

const form = (o: Record<string, string>) => ({ text: (k: string) => (o[k] ?? "").trim() });

describe("adjustmentTotals (D704)", () => {
  it("adds each group's adjustments, minus ones included, and drops a group that nets to 0", () => {
    const rows = [{ group_id: "a", points: 20 }, { group_id: "a", points: -5 }, { group_id: "b", points: 10 }, { group_id: "b", points: -10 }];
    expect([...adjustmentTotals(rows)]).toEqual([["a", 15]]);
  });
});

describe("readAdjustment (D704)", () => {
  it("reads whole points, plus or minus, and a reason", () => {
    expect(readAdjustment(form({ points: "+20", reason: " Best cheer " }))).toEqual({ points: 20, reason: "Best cheer" });
    expect(readAdjustment(form({ points: "-5", reason: "Late" }))).toEqual({ points: -5, reason: "Late" });
  });
  it("refuses 0, fractions, out-of-range numbers and a missing reason", () => {
    expect(() => readAdjustment(form({ points: "0", reason: "x" }))).toThrow("Points must be a whole number from -9999 to 9999, not 0.");
    expect(() => readAdjustment(form({ points: "1.5", reason: "x" }))).toThrow("Points must be a whole number from -9999 to 9999, not 0.");
    expect(() => readAdjustment(form({ points: "10000", reason: "x" }))).toThrow("Points must be a whole number from -9999 to 9999, not 0.");
    expect(() => readAdjustment(form({ points: "5", reason: "" }))).toThrow("Say what the points are for.");
    expect(() => readAdjustment(form({ points: "5", reason: "x".repeat(121) }))).toThrow("Keep the reason to 120 characters.");
  });
});
