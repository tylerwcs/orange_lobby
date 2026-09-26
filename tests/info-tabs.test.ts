import { describe, it, expect } from "vitest";
import { hasInfo, portalInfoTabs, pickInfoTab } from "@/lib/info-tabs";
import type { InfoTab } from "@/lib/types";

const tab = (id: string, sort_order: number, html: string | null = "<p>x</p>"): InfoTab =>
  ({ id, org_id: "o", event_id: "e", title: id, html, sort_order, categories: null });

describe("hasInfo", () => {
  it("needs at least one tab with content (D205)", () => {
    expect(hasInfo([], null)).toBe(false);
    expect(hasInfo([tab("a", 10, null), tab("b", 20, "   ")], null)).toBe(false);
    expect(hasInfo([tab("a", 10, null), tab("b", 20)], null)).toBe(true);
  });
});

describe("portalInfoTabs", () => {
  it("keeps tabs with content, in hand order", () => {
    const out = portalInfoTabs([tab("faq", 30), tab("travel", 10), tab("empty", 20, null), tab("blank", 40, "  ")], null);
    expect(out.map((t) => t.key)).toEqual(["travel", "faq"]);
    expect(out[0]).toEqual({ key: "travel", title: "travel", html: "<p>x</p>" });
  });
  it("has no fixed Venue tab: venue details are the organiser's own tab now", () => {
    expect(portalInfoTabs([tab("a", 10)], null).map((t) => t.key)).toEqual(["a"]);
    expect(portalInfoTabs([], null)).toEqual([]);
  });
});

describe("pickInfoTab", () => {
  const tabs = portalInfoTabs([tab("a", 10), tab("b", 20)], null);
  it("opens the requested tab", () => {
    expect(pickInfoTab(tabs, "b")?.key).toBe("b");
  });
  it("falls back to the first tab for a missing or unknown key", () => {
    expect(pickInfoTab(tabs, undefined)?.key).toBe("a");
    expect(pickInfoTab(tabs, "nope")?.key).toBe("a");
  });
  it("is null with no tabs", () => {
    expect(pickInfoTab([], "a")).toBeNull();
  });
});

describe("info tabs for one programme", () => {
  const yep = { ...tab("yep", 10), categories: ["YEP"] };
  const all = tab("all", 20);
  it("shows a tab only to the programmes it is for", () => {
    expect(portalInfoTabs([yep, all], "KOM, Wellness").map((t) => t.key)).toEqual(["all"]);
    expect(portalInfoTabs([yep, all], "YEP").map((t) => t.key)).toEqual(["yep", "all"]);
    expect(portalInfoTabs([yep, all], null).map((t) => t.key)).toEqual(["all"]);
  });
  it("hides the Info button from somebody with no tab for them", () => {
    expect(hasInfo([yep], "KOM")).toBe(false);
    expect(hasInfo([yep], "KOM + YEP")).toBe(true);
  });
});
