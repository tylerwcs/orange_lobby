import { describe, it, expect } from "vitest";
import { brandStyle } from "@/lib/brand";

describe("brandStyle", () => {
  it("uses a valid hex colour as-is for --brand", () => {
    const style = brandStyle("#1D4ED8");
    expect(style["--brand"]).toBe("#1D4ED8");
  });

  it("derives --brand-ink and --brand-soft as color-mix strings containing the hex", () => {
    const style = brandStyle("#1D4ED8");
    expect(style["--brand-ink"]).toContain("color-mix(");
    expect(style["--brand-ink"]).toContain("#1D4ED8");
    expect(style["--brand-soft"]).toContain("color-mix(");
    expect(style["--brand-soft"]).toContain("#1D4ED8");
  });

  it.each([["orange"], [null], ["#12"]])("falls back to #F97316 for invalid value %p", (value) => {
    const style = brandStyle(value as string | null);
    expect(style["--brand"]).toBe("#F97316");
    expect(style["--brand-ink"]).toContain("#F97316");
    expect(style["--brand-soft"]).toContain("#F97316");
  });

  it("falls back to #F97316 for undefined", () => {
    const style = brandStyle(undefined);
    expect(style["--brand"]).toBe("#F97316");
  });
});
