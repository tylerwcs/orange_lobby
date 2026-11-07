import { describe, it, expect } from "vitest";
import { moduleFromForm, upsertModule, removeModule, reorderModules, MAX_TILES } from "@/lib/modules-form";
import type { EventModule } from "@/lib/modules";

const form = (o: Record<string, string>) => (k: string) => o[k] ?? null;
const tile = (id: string): EventModule => ({ key: "tile", id, enabled: true, label: id, icon: "link", target: { kind: "url", url: "https://x/" } });

describe("moduleFromForm", () => {
  it("reads a tile pointing at an external url", () => {
    const m = moduleFromForm(form({ preset: "tile", label: "Q&A", subtitle: "Ask away", icon: "chat", target_kind: "url", url: "https://sli.do/x", enabled: "on" }), "t9");
    expect(m).toEqual({ key: "tile", id: "t9", enabled: true, label: "Q&A", subtitle: "Ask away", icon: "chat", target: { kind: "url", url: "https://sli.do/x" } });
  });

  it("reads a tile pointing at an internal route, ignoring a stale url field", () => {
    // The form keeps both inputs mounted so switching kind does not lose what was typed;
    // only the chosen one may reach the stored row.
    const m = moduleFromForm(form({ preset: "tile", label: "Programme", icon: "calendar", target_kind: "route", route: "agenda", url: "https://leftover/", enabled: "on" }), "t1");
    expect(m).toMatchObject({ target: { kind: "route", route: "agenda" } });
  });

  it("treats an old floor plan preset as an ordinary tile (D839)", () => {
    // A form opened before the floor plan was retired posts preset=floor_plan; it must not
    // write a floor plan row back. With no label it is simply rejected like any tile.
    expect(() => moduleFromForm(form({ preset: "floor_plan", url: "https://x/p.png", enabled: "on" }), "x")).toThrow();
  });

  it("keeps an uploaded icon image", () => {
    const img = "https://x/icon.png";
    expect(moduleFromForm(form({ preset: "tile", label: "Q&A", icon: "chat", icon_image: img, target_kind: "url", url: "https://sli.do/x", enabled: "on" }), "t9")).toMatchObject({ icon_image: img });
  });

  it("leaves icon_image off the row when there is none", () => {
    const m = moduleFromForm(form({ preset: "tile", label: "Q&A", icon: "chat", icon_image: "", target_kind: "url", url: "https://sli.do/x", enabled: "on" }), "t9");
    expect("icon_image" in m).toBe(false);
  });

  it("rejects a url that is not http(s)", () => {
    expect(() => moduleFromForm(form({ preset: "tile", label: "Bad", icon: "link", target_kind: "url", url: "javascript:alert(1)", enabled: "on" }), "t1")).toThrow(/url/);
  });

  it("rejects a tile with no label", () => {
    expect(() => moduleFromForm(form({ preset: "tile", label: "", icon: "link", target_kind: "url", url: "https://x/", enabled: "on" }), "t1")).toThrow();
  });
});

describe("upsertModule", () => {
  it("replaces the module with the same id, in place", () => {
    const next = upsertModule([tile("a"), tile("b")], { ...tile("a"), label: "Renamed" });
    expect(next.map((m) => ("id" in m ? m.id : m.key))).toEqual(["a", "b"]);
    expect(next[0]).toMatchObject({ label: "Renamed" });
  });

  it("appends a module whose id is new", () => {
    const next = upsertModule([tile("a")], tile("b"));
    expect(next).toHaveLength(2);
  });

  it("refuses to go past the cap", () => {
    const full = Array.from({ length: MAX_TILES }, (_, i) => tile(`t${i}`));
    expect(() => upsertModule(full, tile("one-more"))).toThrow(/most/i);
  });
});

describe("removeModule", () => {
  it("drops the named module and leaves the rest in order", () => {
    expect(removeModule([tile("a"), tile("b"), tile("c")], "b").map((m) => ("id" in m ? m.id : m.key))).toEqual(["a", "c"]);
  });
});

describe("reorderModules", () => {
  it("rearranges to the given order", () => {
    const out = reorderModules([tile("a"), tile("b"), tile("c")], ["c", "a", "b"]);
    expect(out.map((m) => ("id" in m ? m.id : m.key))).toEqual(["c", "a", "b"]);
  });

  it("keeps a module the posted order forgot rather than deleting it", () => {
    // A reorder is a rearrangement, never a delete: a stale list from a tab opened before
    // another tile was added must not silently drop it.
    const out = reorderModules([tile("a"), tile("b")], ["b"]);
    expect(out.map((m) => ("id" in m ? m.id : m.key))).toEqual(["b", "a"]);
  });
});

describe("tile categories", () => {
  const base = { preset: "tile", label: "YEP forms", icon: "file", target_kind: "url", url: "https://x/", enabled: "on" };
  it("keeps the ticked categories, once each", () => {
    expect(moduleFromForm(form({ ...base, categories: "YEP,Wellness,YEP" }), "t1")).toMatchObject({ categories: ["YEP", "Wellness"] });
  });
  it("stores no categories when none are ticked, which means everyone", () => {
    expect(moduleFromForm(form({ ...base, categories: "" }), "t1")).not.toHaveProperty("categories");
    expect(moduleFromForm(form(base), "t1")).not.toHaveProperty("categories");
  });
});
