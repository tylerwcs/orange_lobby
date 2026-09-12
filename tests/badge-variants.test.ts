import { describe, it, expect } from "vitest";
import { badgeVariants } from "@/components/ui/badge";

// D62 — the one deliberate divergence from stock shadcn. `success` and `warning` carry the
// checked-in and expected states the scanner and attendee table depend on. If a shadcn upgrade
// overwrites badge.tsx, these fail rather than the states silently falling back to `default`.
describe("badge D62 variants", () => {
  it("exposes success and warning alongside the stock variants", () => {
    expect(badgeVariants({ variant: "success" })).toContain("bg-success-soft");
    expect(badgeVariants({ variant: "warning" })).toContain("bg-warning-soft");
  });

  it("pairs each soft ground with the strong ink the contrast test verifies", () => {
    expect(badgeVariants({ variant: "success" })).toContain("text-success-strong");
    expect(badgeVariants({ variant: "warning" })).toContain("text-warning");
  });

  it("keeps the stock variants intact", () => {
    for (const variant of ["default", "secondary", "destructive", "outline", "ghost", "link"] as const) {
      expect(badgeVariants({ variant }), variant).toBeTruthy();
    }
  });
});
