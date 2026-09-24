import { describe, it, expect } from "vitest";
import { hasVenue, hasInfo, portalInfoTabs, pickInfoTab, VENUE_TAB, type VenueFields } from "@/lib/info-tabs";
import type { InfoTab } from "@/lib/types";

const noVenue: VenueFields = { venue_name: null, venue_address: null, venue_map_url: null, description: null, contact_name: null, contact_phone: null };
const tab = (id: string, sort_order: number, html: string | null = "<p>x</p>"): InfoTab =>
  ({ id, org_id: "o", event_id: "e", title: id, html, sort_order });

describe("hasVenue", () => {
  it("is true when Settings shows anything the Venue tab would draw (D204)", () => {
    expect(hasVenue({ ...noVenue, venue_name: "Marriott" })).toBe(true);
    expect(hasVenue({ ...noVenue, description: "Two days" })).toBe(true);
    expect(hasVenue({ ...noVenue, contact_name: "Aina" })).toBe(true);
  });
  it("is false with none of them", () => {
    expect(hasVenue(noVenue)).toBe(false);
  });
});

describe("hasInfo", () => {
  it("needs at least one tab with content (D205)", () => {
    expect(hasInfo([])).toBe(false);
    expect(hasInfo([tab("a", 10, null), tab("b", 20, "   ")])).toBe(false);
    expect(hasInfo([tab("a", 10, null), tab("b", 20)])).toBe(true);
  });
});

describe("portalInfoTabs", () => {
  it("puts the Venue tab first, then tabs with content in hand order", () => {
    const out = portalInfoTabs({ ...noVenue, venue_name: "Marriott" }, [tab("faq", 30), tab("travel", 10), tab("empty", 20, null)]);
    expect(out.map((t) => t.key)).toEqual([VENUE_TAB, "travel", "faq"]);
    expect(out[0]).toEqual({ key: VENUE_TAB, title: "Venue", html: null });
  });
  it("has no Venue tab without venue data", () => {
    expect(portalInfoTabs(noVenue, [tab("a", 10)]).map((t) => t.key)).toEqual(["a"]);
  });
});

describe("pickInfoTab", () => {
  const tabs = portalInfoTabs(noVenue, [tab("a", 10), tab("b", 20)]);
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
