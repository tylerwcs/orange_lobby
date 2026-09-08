import { describe, it, expect } from "vitest";
import { parseModules, defaultModules, resolveTiles } from "@/lib/modules";
import type { AgendaItem } from "@/lib/types";

const item = (p: Partial<AgendaItem>): AgendaItem => ({ id: "x", event_id: "e", day: "2026-09-30", starts_at: "10:30", ends_at: "11:15", title: "Year in Review", description: null, location: null, categories: null, sort_order: 0, ...p });

describe("parseModules", () => {
  it("accepts builtins and link tiles, rejects junk", () => {
    const mods = parseModules(JSON.stringify([
      { key: "agenda", enabled: true },
      { key: "link", id: "qa", enabled: true, label: "Q&A", url: "https://app.sli.do/x", icon: "chat" },
    ]));
    expect(mods).toHaveLength(2);
    expect(() => parseModules(JSON.stringify([{ key: "nope", enabled: true }]))).toThrow(/key/);
    expect(() => parseModules(JSON.stringify([{ key: "link", id: "a", enabled: true, label: "X", url: "javascript:alert(1)", icon: "chat" }]))).toThrow(/url/);
    expect(() => parseModules("{")).toThrow(/JSON/);
  });
  it("defaults enable the five builtins in order", () => {
    expect(defaultModules().map((m) => m.key)).toEqual(["agenda", "seat", "floor_plan", "info", "announcements"]);
  });
});

describe("resolveTiles", () => {
  const event = { floor_plan_url: "https://x/plan.png", info_page_html: "<p>hi</p>", info_page_title: "Info", modules: defaultModules() };
  it("shows seat only on personal links and fills subtitles", () => {
    const personal = resolveTiles({ event, personal: true, basePath: "/e/kom/a/tok", attendee: { table_no: "12", seat_no: "3" }, next: { item: item({}), status: "next" }, latestAnnouncement: "Breakouts moved" });
    expect(personal.map((t) => t.id)).toEqual(["agenda", "seat", "floor_plan", "info", "announcements"]);
    expect(personal[0].subtitle).toBe("Next: 10:30 Year in Review");
    expect(personal[1]).toMatchObject({ subtitle: "Table 12 · Seat 3", href: "/e/kom/a/tok/seat" });
    expect(personal[4].subtitle).toBe("Breakouts moved");
    const generic = resolveTiles({ event, personal: false, basePath: "/e/kom" });
    expect(generic.map((t) => t.id)).toEqual(["agenda", "floor_plan", "info"]); // no announcements yet, so no empty tile
    expect(generic[0].subtitle).toBe("Programme");
  });
  it("hides floor plan and info when the event has none, honours disabled and links", () => {
    const tiles = resolveTiles({
      event: { floor_plan_url: null, info_page_html: null, info_page_title: "Info", modules: [
        { key: "agenda", enabled: false }, { key: "floor_plan", enabled: true }, { key: "info", enabled: true },
        { key: "link", id: "qa", enabled: true, label: "Q&A", subtitle: "Ask away", url: "https://app.sli.do/x", icon: "chat" },
      ] },
      personal: true, basePath: "/e/kom/a/tok", attendee: { table_no: null, seat_no: null },
    });
    expect(tiles.map((t) => t.id)).toEqual(["link:qa"]);
    expect(tiles[0]).toMatchObject({ href: "https://app.sli.do/x", external: true, icon: "chat", subtitle: "Ask away" });
  });
  it("drops a link tile whose url is not http(s), even if it bypassed parseModules", () => {
    const tiles = resolveTiles({
      event: { floor_plan_url: null, info_page_html: null, info_page_title: "Info", modules: [
        { key: "link", id: "bad", enabled: true, label: "Tampered", url: "javascript:alert(1)", icon: "chat" },
      ] },
      personal: false, basePath: "/e/kom",
    });
    expect(tiles).toEqual([]);
  });
  it("labels the info tile with the event's info title and says when seat is unconfirmed", () => {
    const tiles = resolveTiles({ event: { ...event, info_page_title: "Handbook" }, personal: true, basePath: "/p", attendee: { table_no: null, seat_no: null } });
    expect(tiles.find((t) => t.id === "info")?.label).toBe("Handbook");
    expect(tiles.find((t) => t.id === "seat")?.subtitle).toBe("To be confirmed");
  });
});
