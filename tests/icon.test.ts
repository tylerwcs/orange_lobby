import { describe, it, expect } from "vitest";
import { ICONS, ICON_NAMES, isIconName } from "@/components/ui/icon";
import { MODULE_ICONS } from "@/lib/modules";

describe("icon registry", () => {
  it("resolves every registered name to a component", () => {
    for (const n of ICON_NAMES) expect(typeof ICONS[n], n).toBe("object");
  });

  it("includes the names the portal and admin rely on", () => {
    for (const n of ["calendar", "seat", "map", "info", "megaphone", "link", "home", "user", "qr", "grid", "scan"]) {
      expect(ICON_NAMES).toContain(n);
    }
  });

  it("includes the icons added since the redesign by name", () => {
    for (const n of ["bell", "plus", "filter", "clock", "close", "grip"]) expect(ICON_NAMES).toContain(n);
  });

  it("narrows an arbitrary string", () => {
    expect(isIconName("calendar")).toBe(true);
    expect(isIconName("definitely-not-an-icon")).toBe(false);
  });
});

// The registry exists because these names are persisted: `events.modules` is a jsonb column whose
// rows carry an icon name validated by z.enum(MODULE_ICONS). Dropping one from the registry would
// not fail the build - it would throw when an existing event's module tried to render.
describe("persisted icon names stay renderable", () => {
  it("registers every icon a stored module may reference", () => {
    for (const n of MODULE_ICONS) expect(ICON_NAMES, `MODULE_ICONS has ${n}`).toContain(n);
  });
});
