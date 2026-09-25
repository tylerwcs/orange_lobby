import { describe, it, expect } from "vitest";
import { hasInfo, portalInfoTabs, pickInfoTab } from "@/lib/info-tabs";
import type { InfoTab } from "@/lib/types";

const tab = (id: string, sort_order: number, html: string | null = "<p>x</p>"): InfoTab =>
  ({ id, org_id: "o", event_id: "e", title: id, html, sort_order });

describe("hasInfo", () => {
  it("needs at least one tab with content (D205)", () => {
    expect(hasInfo([])).toBe(false);
    expect(hasInfo([tab("a", 10, null), tab("b", 20, "   ")])).toBe(false);
    expect(hasInfo([tab("a", 10, null), tab("b", 20)])).toBe(true);
  });
});

describe("portalInfoTabs", () => {
  it("keeps tabs with content, in hand order", () => {
    const out = portalInfoTabs([tab("faq", 30), tab("travel", 10), tab("empty", 20, null), tab("blank", 40, "  ")]);
    expect(out.map((t) => t.key)).toEqual(["travel", "faq"]);
    expect(out[0]).toEqual({ key: "travel", title: "travel", html: "<p>x</p>" });
  });
  it("has no fixed Venue tab: venue details are the organiser's own tab now", () => {
    expect(portalInfoTabs([tab("a", 10)]).map((t) => t.key)).toEqual(["a"]);
    expect(portalInfoTabs([])).toEqual([]);
  });
});

describe("pickInfoTab", () => {
  const tabs = portalInfoTabs([tab("a", 10), tab("b", 20)]);
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
