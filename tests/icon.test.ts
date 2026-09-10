import { describe, it, expect } from "vitest";
import { ICON_NAMES, iconPath } from "@/components/ui/icon-paths";

describe("icons", () => {
  it("has a path for every registered name", () => {
    for (const n of ICON_NAMES) expect(iconPath(n).length).toBeGreaterThan(10);
  });
  it("includes the names the portal and admin rely on", () => {
    for (const n of ["calendar", "seat", "map", "info", "megaphone", "link", "home", "user", "qr", "grid", "scan"]) expect(ICON_NAMES).toContain(n);
  });
  it("includes bell, plus, filter and clock by name", () => {
    for (const n of ["bell", "plus", "filter", "clock"]) expect(ICON_NAMES).toContain(n);
  });
});
