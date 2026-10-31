import { describe, it, expect } from "vitest";
import { rememberedTab, tabCookieName } from "@/lib/remembered-tab";

const jar = (cookies: Record<string, string>) => ({
  get: (name: string) => (name in cookies ? { value: cookies[name] } : undefined),
});

describe("rememberedTab", () => {
  it("reads the tab remembered for this page of this event", () => {
    expect(rememberedTab(jar({ [tabCookieName("settings:e1")]: "checkin" }), "settings:e1", ["event", "checkin"])).toBe("checkin");
  });
  it("ignores another event's page", () => {
    expect(rememberedTab(jar({ [tabCookieName("settings:e2")]: "checkin" }), "settings:e1", ["event", "checkin"])).toBeNull();
  });
  it("ignores a tab the page no longer has — a deleted day, a closed danger zone", () => {
    expect(rememberedTab(jar({ [tabCookieName("agenda:e1")]: "gone" }), "agenda:e1", ["d1", "d2"])).toBeNull();
  });
  it("decodes what the browser encoded", () => {
    expect(rememberedTab(jar({ [tabCookieName("s")]: encodeURIComponent("a b") }), "s", ["a b"])).toBe("a b");
  });
});
