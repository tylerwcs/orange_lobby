import { describe, it, expect } from "vitest";
import { activeNavHref, isPortalHome } from "@/lib/portal-nav";

const BASE = "/e/ecpkom/a/6dv9gkdhpe99";

describe("isPortalHome", () => {
  it("is true only for the base path itself", () => {
    expect(isPortalHome(BASE, BASE)).toBe(true);
    expect(isPortalHome(`${BASE}/agenda`, BASE)).toBe(false);
  });

  it("tolerates a trailing slash", () => {
    // Next normalises most of these away, but a hand-typed or shared link may not be.
    expect(isPortalHome(`${BASE}/`, BASE)).toBe(true);
  });

  it("is false for a path that merely starts with the base path", () => {
    // The tokens are 12 chars of [a-z0-9]; one can be a prefix of nothing else, but the
    // anonymous portal's basePath ("/e/ecpkom") IS a prefix of every personal path.
    expect(isPortalHome(`${BASE}/me`, "/e/ecpkom")).toBe(false);
  });
});

describe("activeNavHref", () => {
  it("marks the home tab on the base path", () => {
    expect(activeNavHref(BASE, BASE)).toBe("");
  });

  it("marks each nav destination", () => {
    expect(activeNavHref(`${BASE}/agenda`, BASE)).toBe("/agenda");
    expect(activeNavHref(`${BASE}/info`, BASE)).toBe("/info");
    expect(activeNavHref(`${BASE}/me`, BASE)).toBe("/me");
  });

  it("marks nothing on a page that is not in the nav", () => {
    // stamps, plan, seat and announcements are reached from tiles, not the bar. The old
    // code said `current={null}` for these; nothing should light up.
    for (const p of ["/stamps", "/plan", "/seat", "/announcements"]) {
      expect(activeNavHref(`${BASE}${p}`, BASE), p).toBeNull();
    }
  });

  it("ignores a query string", () => {
    // The agenda links to itself with ?day=2026-09-30 to switch days.
    expect(activeNavHref(`${BASE}/agenda?day=2026-09-30`, BASE)).toBe("/agenda");
  });

  it("marks the parent nav item for a deeper path under it", () => {
    expect(activeNavHref(`${BASE}/agenda/anything`, BASE)).toBe("/agenda");
  });

  it("returns null when the pathname is not under the base path at all", () => {
    expect(activeNavHref("/admin/events/123", BASE)).toBeNull();
  });
});
