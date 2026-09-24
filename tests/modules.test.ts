import { describe, it, expect } from "vitest";
import { parseModules, defaultModules, resolveTiles, floorPlanUrl, floorPlanShown, normalizeModules, TILE_ROUTES, TILE_ROUTE_LABELS } from "@/lib/modules";


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
  const event = { floor_plan_url: "https://x/plan.png", info_page_title: "Info", modules: defaultModules() };
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
      event: { floor_plan_url: null, info_page_title: "Info", modules: [
        { key: "agenda", enabled: false }, { key: "floor_plan", enabled: true }, { key: "info", enabled: true },
        { key: "link", id: "qa", enabled: true, label: "Q&A", subtitle: "Ask away", url: "https://app.sli.do/x", icon: "chat" },
      ] }, basePath: "/e/kom/a/tok",
    });
    expect(tiles.map((t) => t.id)).toEqual(["link:qa"]);
    expect(tiles[0]).toMatchObject({ href: "https://app.sli.do/x", external: true, icon: "chat", subtitle: "Ask away" });
  });
  it("drops a link tile whose url is not http(s), even if it bypassed parseModules", () => {
    const tiles = resolveTiles({
      event: { floor_plan_url: null, info_page_title: "Info", modules: [
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

describe("tile modules", () => {
  it("accepts a tile pointing at an internal route", () => {
    const mods = parseModules(JSON.stringify([
      { key: "tile", id: "t1", enabled: true, label: "Programme", icon: "calendar", target: { kind: "route", route: "agenda" } },
    ]));
    expect(mods[0]).toMatchObject({ key: "tile", id: "t1", target: { kind: "route", route: "agenda" } });
  });

  const base = { floor_plan_url: null, info_page_title: "Info" };
  const tile = (target: unknown) => ({ key: "tile" as const, id: "t1", enabled: true, label: "T", icon: "link" as const, target } as never);

  it("points a route tile at the path under basePath, not off-site", () => {
    const [t] = resolveTiles({ event: { ...base, modules: [tile({ kind: "route", route: "agenda" })] }, basePath: "/e/kom/a/tok" });
    expect(t).toMatchObject({ href: "/e/kom/a/tok/agenda", external: false });
  });

  it("opens a url tile off-site", () => {
    const [t] = resolveTiles({ event: { ...base, modules: [tile({ kind: "url", url: "https://sli.do/x" })] }, basePath: "/e/kom" });
    expect(t).toMatchObject({ href: "https://sli.do/x", external: true });
  });

  it("drops a url tile that is not http(s), even if it bypassed parseModules", () => {
    const tiles = resolveTiles({ event: { ...base, modules: [tile({ kind: "url", url: "javascript:alert(1)" })] }, basePath: "/e/kom" });
    expect(tiles).toEqual([]);
  });
});

describe("the passport tile", () => {
  it("accepts a tile pointing at the passport", () => {
    const [m] = parseModules([{ key: "tile", id: "passport", enabled: true, label: "Booth Passport", icon: "star", target: { kind: "route", route: "stamps" } }]);
    expect(m).toMatchObject({ key: "tile", target: { kind: "route", route: "stamps" } });
  });

  it("resolves that tile to the attendee's passport path", () => {
    const tiles = resolveTiles({
      event: { floor_plan_url: null, info_page_title: "Info", modules: [
        { key: "tile", id: "passport", enabled: true, label: "Booth Passport", icon: "star", target: { kind: "route", route: "stamps" } },
      ] },
      basePath: "/e/kom/a/abcdefghjkmn",
    });
    expect(tiles).toHaveLength(1);
    expect(tiles[0].href).toBe("/e/kom/a/abcdefghjkmn/stamps");
  });
});

describe("floor plan url on the tile", () => {
  const base = { info_page_title: "Info" };

  it("renders the floor plan from the tile when the column is empty", () => {
    const tiles = resolveTiles({
      event: { ...base, floor_plan_url: null, modules: [{ key: "floor_plan", enabled: true, url: "https://x/p.png" }] as never },
      basePath: "/e/kom",
    });
    expect(tiles.map((t) => t.id)).toEqual(["floor_plan"]);
  });

  it("prefers the tile's url over the column", () => {
    expect(floorPlanUrl({ floor_plan_url: "https://old/p.png", modules: [{ key: "floor_plan", enabled: true, url: "https://new/p.png" }] as never }))
      .toBe("https://new/p.png");
  });

  it("falls back to the column so already-deployed events keep their plan", () => {
    // The migration window: new code, rows not yet rewritten.
    expect(floorPlanUrl({ floor_plan_url: "https://old/p.png", modules: [{ key: "floor_plan", enabled: true }] as never }))
      .toBe("https://old/p.png");
  });
});

describe("normalizeModules", () => {
  const ev = (modules: unknown, floor_plan_url: string | null = null) => ({ floor_plan_url, modules } as never);

  it("turns a legacy link row into a tile with a url target, keeping its id", () => {
    const [m] = normalizeModules(ev([{ key: "link", id: "l1", enabled: true, label: "Q&A", subtitle: "Ask", url: "https://sli.do/x", icon: "chat" }]));
    expect(m).toEqual({ key: "tile", id: "l1", enabled: true, label: "Q&A", subtitle: "Ask", icon: "chat", target: { kind: "url", url: "https://sli.do/x" } });
  });

  it("lifts the floor plan url off the column so the editor can show it", () => {
    const [m] = normalizeModules(ev([{ key: "floor_plan", enabled: true }], "https://old/p.png"));
    expect(m).toMatchObject({ key: "floor_plan", url: "https://old/p.png" });
  });

  it("drops retired builtins rather than carrying them forward", () => {
    // They parse so the portal never 500s on old rows, but there is no reason to write
    // them back once an admin has saved.
    const out = normalizeModules(ev([{ key: "agenda", enabled: true }, { key: "seat", enabled: true }, { key: "floor_plan", enabled: true, url: "https://x/p.png" }]));
    expect(out.map((m) => m.key)).toEqual(["floor_plan"]);
  });

  it("seeds from the defaults when the event was never configured", () => {
    // resolveTiles already falls back to defaultModules() for an empty array. If the
    // editor did not agree, opening it on an untouched event would show an empty list and
    // saving would throw the floor plan away.
    const out = normalizeModules(ev([], "https://old/p.png"));
    expect(out).toEqual([{ key: "floor_plan", enabled: true, url: "https://old/p.png" }]);
  });

  it("preserves the order the admin arranged", () => {
    const out = normalizeModules(ev([
      { key: "link", id: "l2", enabled: true, label: "B", url: "https://b/", icon: "link" },
      { key: "floor_plan", enabled: true, url: "https://x/p.png" },
      { key: "link", id: "l1", enabled: true, label: "A", url: "https://a/", icon: "link" },
    ]));
    expect(out.map((m) => ("id" in m ? m.id : m.key))).toEqual(["l2", "floor_plan", "l1"]);
  });
});

describe("TILE_ROUTE_LABELS", () => {
  it("gives every TILE_ROUTES entry a human label", () => {
    for (const route of TILE_ROUTES) {
      expect(TILE_ROUTE_LABELS[route]).toBeTruthy();
    }
  });
});

describe("the rows actually stored on the live event", () => {
  // Copied verbatim from events.modules on the pilot event: five retired built-ins, a
  // floor plan with no image, and two pre-tile `link` rows. Everything here predates the
  // tile editor, so it is the shape the first admin to open that page will be handed.
  const live = [
    { key: "agenda", enabled: true }, { key: "seat", enabled: true }, { key: "floor_plan", enabled: true },
    { key: "info", enabled: true }, { key: "announcements", enabled: true },
    { id: "l1", key: "link", url: "https://app.sli.do/event/test", icon: "chat", label: "Q&A", enabled: true, subtitle: "Ask the directors" },
    { id: "l2", key: "link", url: "https://forms.office.com/r/test", icon: "check", label: "Feedback", enabled: true, subtitle: "2 minutes" },
  ] as never;

  it("still parses", () => {
    expect(parseModules(live)).toHaveLength(7);
  });

  it("draws only the two link tiles, because the plan has no image", () => {
    const tiles = resolveTiles({ event: { floor_plan_url: null, info_page_title: "Info", modules: live }, basePath: "/e/kom/a/tok" });
    expect(tiles.map((t) => t.label)).toEqual(["Q&A", "Feedback"]);
  });

  it("opens in the editor as a floor plan and two tiles, retired built-ins gone", () => {
    const out = normalizeModules({ floor_plan_url: null, modules: live });
    expect(out.map((m) => m.key)).toEqual(["floor_plan", "tile", "tile"]);
    expect(out[1]).toMatchObject({ id: "l1", label: "Q&A", target: { kind: "url", url: "https://app.sli.do/event/test" } });
  });
});

describe("icon_image", () => {
  const img = "https://x.supabase.co/storage/v1/object/public/event-media/o/e/tile-icon-a.png";
  it("parses on a tile and on the floor plan, and rejects a non-http(s) url", () => {
    const mods = parseModules([
      { key: "tile", id: "t1", enabled: true, label: "Passport", icon: "star", icon_image: img, target: { kind: "route", route: "stamps" } },
      { key: "floor_plan", enabled: true, icon_image: img },
    ]);
    expect(mods.map((m) => "icon_image" in m && m.icon_image)).toEqual([img, img]);
    expect(() => parseModules([{ key: "tile", id: "t1", enabled: true, label: "X", icon: "star", icon_image: "javascript:x", target: { kind: "route", route: "stamps" } }])).toThrow(/icon_image/);
  });

  it("is carried to the tile as `image`, null when there is none", () => {
    const tiles = resolveTiles({
      event: { floor_plan_url: "https://x/plan.png", info_page_title: "Info", modules: [
        { key: "floor_plan", enabled: true, icon_image: img },
        { key: "tile", id: "t1", enabled: true, label: "Passport", icon: "star", target: { kind: "route", route: "stamps" } },
      ] }, basePath: "/e/kom",
    });
    expect(tiles.map((t) => t.image)).toEqual([img, null]);
  });

  it("is dropped at render when it is not http(s), even if it bypassed parseModules", () => {
    const tiles = resolveTiles({
      event: { floor_plan_url: null, info_page_title: "Info", modules: [
        { key: "tile", id: "t1", enabled: true, label: "X", icon: "star", icon_image: "javascript:x", target: { kind: "url", url: "https://x/" } },
      ] }, basePath: "/e/kom",
    });
    expect(tiles[0].image).toBeNull();
  });
});

describe("Tile.route", () => {
  it("names the portal page a route tile opens, and is null for links and the floor plan", () => {
    const tiles = resolveTiles({
      event: { floor_plan_url: "https://x/plan.png", info_page_title: "Info", modules: [
        { key: "floor_plan", enabled: true },
        { key: "tile", id: "a", enabled: true, label: "Stamps", icon: "star", target: { kind: "route", route: "stamps" } },
        { key: "tile", id: "b", enabled: true, label: "Q&A", icon: "chat", target: { kind: "url", url: "https://sli.do/x" } },
      ] }, basePath: "/e/kom",
    });
    expect(tiles.map((t) => t.route)).toEqual([null, "stamps", null]);
  });
});

describe("floorPlanShown", () => {
  const plan = "https://x/plan.png";
  it("needs both a plan image and the floor plan switched on", () => {
    expect(floorPlanShown({ floor_plan_url: null, modules: [{ key: "floor_plan", enabled: true, url: plan }] })).toBe(true);
    expect(floorPlanShown({ floor_plan_url: null, modules: [{ key: "floor_plan", enabled: false, url: plan }] })).toBe(false);
    expect(floorPlanShown({ floor_plan_url: null, modules: [{ key: "floor_plan", enabled: true }] })).toBe(false);
  });

  it("treats an event with no stored modules as switched on, as the tiles do", () => {
    expect(floorPlanShown({ floor_plan_url: plan, modules: [] })).toBe(true);
  });
});

describe("floor plan picture", () => {
  it("draws the portal's own floor plan picture unless the organiser uploaded one", () => {
    const tiles = (icon_image?: string) => resolveTiles({
      event: { floor_plan_url: "https://x/plan.png", info_page_title: "Info", modules: [{ key: "floor_plan", enabled: true, ...(icon_image ? { icon_image } : {}) }] },
      basePath: "/e/kom",
    });
    expect(tiles()[0].image).toBe("/portal-icons/floor-plan.webp");
    expect(tiles("https://x/mine.png")[0].image).toBe("https://x/mine.png");
  });
});
