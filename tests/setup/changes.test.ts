import { describe, expect, it } from "vitest";
import { changeSummary, type PlanChange } from "@/features/setup/sections/changes";

const c = (what: PlanChange["what"], how: PlanChange["how"]): PlanChange => ({ what, how, label: "x", lines: [] });

describe("changeSummary (D449)", () => {
  it("counts by kind, then by what happened, and leaves out what was kept", () => {
    const changes = [c("session", "added"), c("session", "added"), c("session", "added"), c("session", "changed"), c("session", "removed"), c("day", "added"), c("day", "kept")];
    expect(changeSummary(changes)).toBe("1 day added · 3 sessions added, 1 changed, 1 removed");
  });
  it("says nothing when nothing is written", () => {
    expect(changeSummary([c("day", "kept")])).toBe("");
  });
  it("uses the singular for one", () => {
    expect(changeSummary([c("session", "changed"), c("day", "removed")])).toBe("1 day removed · 1 session changed");
  });
});
