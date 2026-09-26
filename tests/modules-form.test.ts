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

  it("reads the floor plan preset, which carries its image url", () => {
    const m = moduleFromForm(form({ preset: "floor_plan", label: "Seating", url: "https://x/p.png", enabled: "on" }), "ignored");
    expect(m).toEqual({ key: "floor_plan", enabled: true, label: "Seating", url: "https://x/p.png" });
  });

  it("keeps an uploaded icon image, on a tile and on the floor plan", () => {
    const img = "https://x/icon.png";
    expect(moduleFromForm(form({ preset: "tile", label: "Q&A", icon: "chat", icon_image: img, target_kind: "url", url: "https://sli.do/x", enabled: "on" }), "t9")).toMatchObject({ icon_image: img });
    expect(moduleFromForm(form({ preset: "floor_plan", url: "https://x/p.png", icon_image: img, enabled: "on" }), "x")).toMatchObject({ icon_image: img });
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

  it("replaces the floor plan rather than adding a second one", () => {
    const plan = { key: "floor_plan", enabled: true, url: "https://x/p.png" } as EventModule;
    const next = upsertModule([plan], { key: "floor_plan", enabled: true, url: "https://y/p.png" } as EventModule);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ url: "https://y/p.png" });
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
  it("lets the floor plan be for some programmes too", () => {
    expect(moduleFromForm(form({ preset: "floor_plan", url: "https://x/p.png", enabled: "on", categories: "KOM" }), "x")).toMatchObject({ key: "floor_plan", categories: ["KOM"] });
  });
});
