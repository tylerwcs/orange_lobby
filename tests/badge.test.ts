import { describe, it, expect } from "vitest";
import { badgeClass, BADGE_TONES } from "@/components/ui/Badge";

describe("badgeClass", () => {
  it("gives every tone a background and a foreground", () => {
    for (const tone of BADGE_TONES) {
      const cls = badgeClass(tone);
      expect(cls, tone).toMatch(/\bbg-/);
      expect(cls, tone).toMatch(/\btext-/);
    }
  });

  it("uses the darker green step for text on the soft green ground", () => {
    expect(badgeClass("ok")).toContain("bg-ok-soft");
    expect(badgeClass("ok")).toContain("text-ok-strong");
  });

  it("never puts text on the plain brand fill", () => {
    expect(badgeClass("brand")).toContain("bg-brand-soft");
    expect(badgeClass("brand")).not.toContain("bg-brand ");
  });
});
