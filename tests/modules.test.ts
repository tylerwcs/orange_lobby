import { describe, it, expect } from "vitest";
import { parseModules, resolveTiles, normalizeModules, PICKABLE_TILE_ROUTES, TILE_ROUTES, TILE_ROUTE_LABELS } from "@/lib/modules";


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
  it("draws nothing for a retired builtin, however its row is stored (the floor plan last, D839)", () => {
    const stored = { modules: [
      { key: "agenda", enabled: true } as const,
      { key: "seat", enabled: true } as const,
      { key: "announcements", enabled: true } as const,
      { key: "info", enabled: true } as const,
      { key: "floor_plan", enabled: true, url: "https://x/plan.png" } as const,
    ] };
    expect(resolveTiles({ event: stored, basePath: "/e/kom/a/tok" })).toEqual([]);
    expect(resolveTiles({ event: stored, basePath: "/e/kom" })).toEqual([]);
  });
  it("honours disabled and draws links", () => {
    const tiles = resolveTiles({
      event: { modules: [
        { key: "agenda", enabled: false }, { key: "floor_plan", enabled: true }, { key: "info", enabled: true },
        { key: "link", id: "qa", enabled: true, label: "Q&A", subtitle: "Ask away", url: "https://app.sli.do/x", icon: "chat" },
      ] }, basePath: "/e/kom/a/tok",
    });
    expect(tiles.map((t) => t.id)).toEqual(["link:qa"]);
    expect(tiles[0]).toMatchObject({ href: "https://app.sli.do/x", external: true, icon: "chat", subtitle: "Ask away" });
  });
  it("drops a link tile whose url is not http(s), even if it bypassed parseModules", () => {
    const tiles = resolveTiles({
      event: { modules: [
        { key: "link", id: "bad", enabled: true, label: "Tampered", url: "javascript:alert(1)", icon: "chat" },
      ] }, basePath: "/e/kom",
    });
    expect(tiles).toEqual([]);
  });
  it("draws nothing for an event that never set up tiles", () => {
    expect(resolveTiles({ event: { modules: [] }, basePath: "/p" })).toEqual([]);
  });
});

describe("tile modules", () => {
  it("accepts a tile pointing at an internal route", () => {
    const mods = parseModules(JSON.stringify([
      { key: "tile", id: "t1", enabled: true, label: "Programme", icon: "calendar", target: { kind: "route", route: "agenda" } },
    ]));
    expect(mods[0]).toMatchObject({ key: "tile", id: "t1", target: { kind: "route", route: "agenda" } });
  });

  const base = {};
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

  it("draws the post-event picture for a Download tile with no upload, and the upload when there is one (D489)", () => {
    const download = (icon_image?: string) => ({ key: "tile" as const, id: "t1", enabled: true, label: "Recap", icon: "download" as const, ...(icon_image ? { icon_image } : {}), target: { kind: "url" as const, url: "https://x.co" } });
    expect(resolveTiles({ event: { ...base, modules: [download()] }, basePath: "/e/kom" })[0].image).toBe("/portal-icons/post-event.webp");
    expect(resolveTiles({ event: { ...base, modules: [download("https://cdn.x/mine.png")] }, basePath: "/e/kom" })[0].image).toBe("https://cdn.x/mine.png");
    // Any other icon with no upload is still the plain icon.
    expect(resolveTiles({ event: { ...base, modules: [tile({ kind: "url", url: "https://x.co" })] }, basePath: "/e/kom" })[0].image).toBeNull();
  });
});

describe("the passport tile", () => {
  it("accepts a tile pointing at the passport", () => {
    const [m] = parseModules([{ key: "tile", id: "passport", enabled: true, label: "Booth Passport", icon: "star", target: { kind: "route", route: "stamps" } }]);
    expect(m).toMatchObject({ key: "tile", target: { kind: "route", route: "stamps" } });
  });

  it("resolves that tile to the attendee's passport path", () => {
    const tiles = resolveTiles({
      event: { modules: [
        { key: "tile", id: "passport", enabled: true, label: "Booth Passport", icon: "star", target: { kind: "route", route: "stamps" } },
      ] },
      basePath: "/e/kom/a/abcdefghjkmn",
    });
    expect(tiles).toHaveLength(1);
    expect(tiles[0].href).toBe("/e/kom/a/abcdefghjkmn/stamps");
  });
});

describe("normalizeModules", () => {
  const ev = (modules: unknown) => ({ modules } as never);

  it("turns a legacy link row into a tile with a url target, keeping its id", () => {
    const [m] = normalizeModules(ev([{ key: "link", id: "l1", enabled: true, label: "Q&A", subtitle: "Ask", url: "https://sli.do/x", icon: "chat" }]));
    expect(m).toEqual({ key: "tile", id: "l1", enabled: true, label: "Q&A", subtitle: "Ask", icon: "chat", target: { kind: "url", url: "https://sli.do/x" } });
  });

  it("drops retired builtins rather than carrying them forward", () => {
    // They parse so the portal never 500s on old rows, but there is no reason to write
    // them back once an admin has saved.
    const out = normalizeModules(ev([{ key: "agenda", enabled: true }, { key: "seat", enabled: true }, { key: "floor_plan", enabled: true, url: "https://x/p.png" }]));
    expect(out).toEqual([]);
  });

  it("is empty when the event was never configured", () => {
    expect(normalizeModules(ev([]))).toEqual([]);
  });

  it("preserves the order the admin arranged", () => {
    const out = normalizeModules(ev([
      { key: "link", id: "l2", enabled: true, label: "B", url: "https://b/", icon: "link" },
      { key: "floor_plan", enabled: true, url: "https://x/p.png" },
      { key: "link", id: "l1", enabled: true, label: "A", url: "https://a/", icon: "link" },
    ]));
    expect(out.map((m) => ("id" in m ? m.id : m.key))).toEqual(["l2", "l1"]);
  });
});

describe("an old Typing qualifier tile (D770, D797)", () => {
  const base = {};
  const qualifier = { key: "tile", id: "qualifier", enabled: true, label: "Typing qualifier", icon: "star", target: { kind: "route", route: "qualifier" } };
  it("stays a valid, labelled route for tiles already saved, but the editor no longer offers it", () => {
    expect(TILE_ROUTES).toContain("qualifier");
    expect(TILE_ROUTE_LABELS.qualifier).toBe("Slime Splat (in Games)");
    expect(PICKABLE_TILE_ROUTES).not.toContain("qualifier");
    expect(PICKABLE_TILE_ROUTES).toContain("play");
    expect(PICKABLE_TILE_ROUTES).toHaveLength(TILE_ROUTES.length - 1);
  });
  it("opens the attendee's own page and is left off the public portal", () => {
    const event = { ...base, modules: parseModules([qualifier]) };
    expect(resolveTiles({ event, basePath: "/e/kom/a/abcdefghjkmn" })[0]).toMatchObject({ href: "/e/kom/a/abcdefghjkmn/qualifier", route: "qualifier" });
    expect(resolveTiles({ event, basePath: "/e/kom", personal: false })).toEqual([]);
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

  it("draws only the two link tiles", () => {
    const tiles = resolveTiles({ event: { modules: live }, basePath: "/e/kom/a/tok" });
    expect(tiles.map((t) => t.label)).toEqual(["Q&A", "Feedback"]);
  });

  it("opens in the editor as two tiles, retired built-ins gone", () => {
    const out = normalizeModules({ modules: live });
    expect(out.map((m) => m.key)).toEqual(["tile", "tile"]);
    expect(out[0]).toMatchObject({ id: "l1", label: "Q&A", target: { kind: "url", url: "https://app.sli.do/event/test" } });
  });
});

describe("icon_image", () => {
  const img = "https://x.supabase.co/storage/v1/object/public/event-media/o/e/tile-icon-a.png";
  it("parses on a tile and on an old floor plan row, and rejects a non-http(s) url", () => {
    const mods = parseModules([
      { key: "tile", id: "t1", enabled: true, label: "Passport", icon: "star", icon_image: img, target: { kind: "route", route: "stamps" } },
      { key: "floor_plan", enabled: true, icon_image: img },
    ]);
    expect(mods.map((m) => "icon_image" in m && m.icon_image)).toEqual([img, img]);
    expect(() => parseModules([{ key: "tile", id: "t1", enabled: true, label: "X", icon: "star", icon_image: "javascript:x", target: { kind: "route", route: "stamps" } }])).toThrow(/icon_image/);
  });

  it("is carried to the tile as `image`, null when there is none", () => {
    const tiles = resolveTiles({
      event: { modules: [
        { key: "tile", id: "t0", enabled: true, label: "Mine", icon: "star", icon_image: img, target: { kind: "route", route: "stamps" } },
        { key: "tile", id: "t1", enabled: true, label: "Passport", icon: "star", target: { kind: "route", route: "stamps" } },
      ] }, basePath: "/e/kom",
    });
    expect(tiles.map((t) => t.image)).toEqual([img, null]);
  });

  it("is dropped at render when it is not http(s), even if it bypassed parseModules", () => {
    const tiles = resolveTiles({
      event: { modules: [
        { key: "tile", id: "t1", enabled: true, label: "X", icon: "star", icon_image: "javascript:x", target: { kind: "url", url: "https://x/" } },
      ] }, basePath: "/e/kom",
    });
    expect(tiles[0].image).toBeNull();
  });
});

describe("Tile.route", () => {
  it("names the portal page a route tile opens, and is null for links", () => {
    const tiles = resolveTiles({
      event: { modules: [
        { key: "tile", id: "a", enabled: true, label: "Stamps", icon: "star", target: { kind: "route", route: "stamps" } },
        { key: "tile", id: "b", enabled: true, label: "Q&A", icon: "chat", target: { kind: "url", url: "https://sli.do/x" } },
      ] }, basePath: "/e/kom",
    });
    expect(tiles.map((t) => t.route)).toEqual(["stamps", null]);
  });
});

describe("tiles by category", () => {
  const event = (categories?: string[]) => ({
    modules: [
      { key: "tile" as const, id: "all", enabled: true, label: "All", icon: "link" as const, target: { kind: "url" as const, url: "https://x/" } },
      { key: "tile" as const, id: "yep", enabled: true, label: "YEP", icon: "link" as const, target: { kind: "url" as const, url: "https://x/" }, categories },
    ],
  });
  const ids = (category: string | null) => resolveTiles({ event: event(["YEP"]), basePath: "/e/x", category }).map((t) => t.id);
  it("shows a tile only to the programmes it is for", () => {
    expect(ids("KOM, Wellness")).toEqual(["tile:all"]);
    expect(ids("KOM + YEP")).toEqual(["tile:all", "tile:yep"]);
  });
  it("shows the public portal only tiles for everyone", () => {
    expect(ids(null)).toEqual(["tile:all"]);
  });
  it("shows a tile with no categories to everybody", () => {
    expect(resolveTiles({ event: event(undefined), basePath: "/e/x", category: null })).toHaveLength(2);
  });
});


describe("the Games tile", () => {
  const games = (categories?: string[]) => ({
    modules: [
      { key: "tile" as const, id: "games", enabled: true, label: "Games", icon: "star" as const, target: { kind: "route" as const, route: "play" as const }, ...(categories ? { categories } : {}) },
    ],
  });

  it("parses a tile pointing at the play page, labelled Games in the picker", () => {
    const [m] = parseModules([{ key: "tile", id: "games", enabled: true, label: "Games", icon: "star", target: { kind: "route", route: "play" } }]);
    expect(m).toMatchObject({ key: "tile", target: { kind: "route", route: "play" } });
    expect(TILE_ROUTE_LABELS.play).toBe("Games");
  });

  it("opens the attendee's own play page", () => {
    const [t] = resolveTiles({ event: games(), basePath: "/e/kom/a/abcdefghjkmn" });
    expect(t).toMatchObject({ id: "tile:games", href: "/e/kom/a/abcdefghjkmn/play", route: "play", external: false });
  });

  it("is left off the public portal, which has no play page (D253)", () => {
    expect(resolveTiles({ event: games(), basePath: "/e/kom", personal: false })).toEqual([]);
  });

  it("follows its Who can see it categories, one part of a multi-programme category being enough", () => {
    const ids = (category: string | null) => resolveTiles({ event: games(["KOM"]), basePath: "/e/kom/a/t", category }).map((t) => t.id);
    expect(ids("KOM, Wellness")).toEqual(["tile:games"]);
    expect(ids("YEP")).toEqual([]);
  });
});
