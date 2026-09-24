import { describe, it, expect } from "vitest";
import { activeNavHref, isPortalHome, suffix } from "@/lib/portal-nav";

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
    expect(activeNavHref(`${BASE}/activities`, BASE)).toBe("/activities");
    expect(activeNavHref(`${BASE}/me`, BASE)).toBe("/me");
  });

  it("marks Info on the info page - its own item since the two were split (D216)", () => {
    expect(activeNavHref(`${BASE}/info`, BASE)).toBe("/info");
    expect(activeNavHref(`${BASE}/info?tab=venue`, BASE)).toBe("/info");
  });

  it("marks Activities on one activity's own page", () => {
    expect(activeNavHref(`${BASE}/activities/0b7c2f`, BASE)).toBe("/activities");
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

  it("does not match a nav href by prefix alone", () => {
    // "/informationpack" starts with "/info" but is not "/info" or "/info/...".
    expect(activeNavHref(`${BASE}/informationpack`, BASE)).toBeNull();
  });

  it("requires a segment boundary after the base path, not just a string prefix", () => {
    // `${BASE}x` merely starts with BASE; it is a sibling path, not something under it.
    // Every NAV_HREFS entry starts with "/", so this alone cannot fail on a `suffix` that
    // dropped its "/" boundary check (a `rest` lacking a leading "/" never matches anyway) -
    // the direct `suffix` test right below is what actually exercises that guard.
    expect(activeNavHref(`${BASE}x/agenda`, BASE)).toBeNull();
  });
});

describe("suffix", () => {
  it("requires a segment boundary, not just a string prefix", () => {
    // `${BASE}x/agenda` starts with BASE as a raw string, but the character right after BASE
    // is "x", not "/" - it is a sibling path (e.g. a different, longer token), not something
    // under BASE. This is the guard `activeNavHref`/`isPortalHome` cannot exercise on their
    // own (see the test above): dropping the "/" here only changes `suffix`'s own return
    // value, from null to "x/agenda", which happens not to match any nav href regardless.
    expect(suffix(`${BASE}x/agenda`, BASE)).toBeNull();
  });
});
