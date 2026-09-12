import { describe, it, expect } from "vitest";
import { parseModules, defaultModules, resolveTiles } from "@/lib/modules";


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
  it("defaults enable only the builtins that are still tiles", () => {
    // Agenda and Info are in the bottom nav, Announcements is the home banner and the
    // table number is on the badge card, so tiles for them were a second route to
    // something already on screen.
    expect(defaultModules().map((m) => m.key)).toEqual(["floor_plan"]);
  });

  it("still PARSES a stored row for a retired builtin", () => {
    // events.modules is jsonb and builtinSchema validates against BUILTIN_MODULES, so
    // narrowing that enum would make every event still carrying an "agenda" row fail to
    // parse - a 500, not a missing tile.
    const stored = parseModules(JSON.stringify([
      { key: "agenda", enabled: true },
      { key: "seat", enabled: true },
      { key: "floor_plan", enabled: true },
    ]));
    expect(stored.map((m) => m.key)).toEqual(["agenda", "seat", "floor_plan"]);
  });
});

describe("resolveTiles", () => {
  const event = { floor_plan_url: "https://x/plan.png", info_page_html: "<p>hi</p>", info_page_title: "Info", modules: defaultModules() };
  it("draws nothing for a retired builtin, however its row is stored", () => {
    const stored = { ...event, modules: [
      { key: "agenda", enabled: true } as const,
      { key: "seat", enabled: true } as const,
      { key: "announcements", enabled: true } as const,
      { key: "info", enabled: true } as const,
      { key: "floor_plan", enabled: true } as const,
    ] };
    const personal = resolveTiles({ event: stored, basePath: "/e/kom/a/tok" });
    expect(personal.map((t) => t.id)).toEqual(["floor_plan"]);

    const generic = resolveTiles({ event: stored, basePath: "/e/kom" });
    expect(generic.map((t) => t.id)).toEqual(["floor_plan"]);
  });
  it("hides floor plan and info when the event has none, honours disabled and links", () => {
    const tiles = resolveTiles({
      event: { floor_plan_url: null, info_page_html: null, info_page_title: "Info", modules: [
        { key: "agenda", enabled: false }, { key: "floor_plan", enabled: true }, { key: "info", enabled: true },
        { key: "link", id: "qa", enabled: true, label: "Q&A", subtitle: "Ask away", url: "https://app.sli.do/x", icon: "chat" },
      ] }, basePath: "/e/kom/a/tok",
    });
    expect(tiles.map((t) => t.id)).toEqual(["link:qa"]);
    expect(tiles[0]).toMatchObject({ href: "https://app.sli.do/x", external: true, icon: "chat", subtitle: "Ask away" });
  });
  it("drops a link tile whose url is not http(s), even if it bypassed parseModules", () => {
    const tiles = resolveTiles({
      event: { floor_plan_url: null, info_page_html: null, info_page_title: "Info", modules: [
        { key: "link", id: "bad", enabled: true, label: "Tampered", url: "javascript:alert(1)", icon: "chat" },
      ] }, basePath: "/e/kom",
    });
    expect(tiles).toEqual([]);
  });
  it("keeps the floor plan out when the event has no plan image", () => {
    const tiles = resolveTiles({ event: { ...event, floor_plan_url: null }, basePath: "/p" });
    expect(tiles.map((t) => t.id)).toEqual([]);
  });
});
