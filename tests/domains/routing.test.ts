import { describe, expect, it } from "vitest";
import { redirectTarget, routeEventPath } from "@/features/domains/routing";

const r = (p: string) => routeEventPath(p, "sk2summit");

describe("routeEventPath (D425)", () => {
  it("shows the event at the root and at its short public paths", () => {
    expect(r("/")).toEqual({ kind: "rewrite", path: "/e/sk2summit" });
    expect(r("/register")).toEqual({ kind: "rewrite", path: "/e/sk2summit/register" });
    expect(r("/register/done")).toEqual({ kind: "rewrite", path: "/e/sk2summit/register/done" });
    for (const s of ["agenda", "info", "plan", "stamps", "announcements"]) expect(r(`/${s}`)).toEqual({ kind: "rewrite", path: `/e/sk2summit/${s}` });
  });

  it("opens an attendee's portal from the short link, and below it", () => {
    expect(r("/a/abcdefghjkmn")).toEqual({ kind: "rewrite", path: "/e/sk2summit/a/abcdefghjkmn" });
    expect(r("/a/abcdefghjkmn/activities")).toEqual({ kind: "rewrite", path: "/e/sk2summit/a/abcdefghjkmn/activities" });
    expect(r("/a")).toEqual({ kind: "main" });
  });

  it("passes the event's own /e paths, and refuses another event's", () => {
    expect(r("/e/sk2summit/a/abcdefghjkmn/agenda")).toEqual({ kind: "pass" });
    expect(r("/e/sk2summit")).toEqual({ kind: "pass" });
    expect(r("/e/ecphub/a/abcdefghjkmn")).toEqual({ kind: "notFound" });
    expect(r("/e")).toEqual({ kind: "notFound" });
  });

  it("passes what attendee pages call or link to", () => {
    expect(r("/api/play/abcdefghjkmn/state")).toEqual({ kind: "pass" });
    expect(r("/privacy")).toEqual({ kind: "pass" });
    expect(r("/privacy/ms")).toEqual({ kind: "pass" });
    expect(r("/portal-icons/agenda.svg")).toEqual({ kind: "pass" });
    expect(r("/brand/logo.png")).toEqual({ kind: "pass" });
    expect(r("/app-icons/192.png")).toEqual({ kind: "pass" });
    expect(r("/globe.svg")).toEqual({ kind: "pass" });
  });

  it("sends every staff and admin path to the main address", () => {
    for (const p of ["/admin", "/admin/events/x/export/links.xlsx", "/login", "/scan/x", "/crew/x", "/host/x", "/display/x", "/booth/x", "/setup/x", "/api/cron/committee-reminders", "/api/whatsapp/webhook", "/api/display/x/state", "/anything"]) {
      expect(r(p), p).toEqual({ kind: "main" });
    }
  });
});

describe("redirectTarget (proxy 308s never leave the base origin)", () => {
  it("keeps the base's origin whatever the path looks like", () => {
    for (const p of ["//evil.com/x", "/\\evil.com/x", "///evil.com", "/\\/evil.com"]) {
      const to = redirectTarget("https://ecphub.app", p, "");
      expect(to.origin, p).toBe("https://ecphub.app");
    }
    expect(redirectTarget("https://sk2.com:3000", "//evil.com/x", "?a=1").origin).toBe("https://sk2.com:3000");
  });
  it("round-trips a normal path and query", () => {
    expect(redirectTarget("https://ecphub.app", "/agenda", "?x=1").href).toBe("https://ecphub.app/agenda?x=1");
    expect(redirectTarget("https://ecphub.app", "/", "").href).toBe("https://ecphub.app/");
  });
});
