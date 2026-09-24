import { describe, expect, it } from "vitest";
import { launcherItems } from "@/lib/launcher";
import type { Tile } from "@/lib/modules";

const BASE = "/e/kom/a/tok";

const tile = (id: string, over: Partial<Tile> = {}): Tile => ({
  id, label: id, subtitle: "", href: `https://x/${id}`, icon: "link", image: null, route: null, external: true, ...over,
});
const routeTile = (id: string, route: NonNullable<Tile["route"]>): Tile =>
  tile(id, { href: `${BASE}/${route}`, route, external: false });

const base = { basePath: BASE, personal: true, hasInfo: false, tiles: [] as Tile[] };

describe("launcherItems", () => {
  it("leads with Agenda, which becomes Info when the event has an info section", () => {
    expect(launcherItems(base)[0]).toMatchObject({ label: "Agenda", icon: "calendar", href: `${BASE}/agenda`, builtin: true });
    // The agenda is the first tab of the Info section, so Info still opens /agenda (D205).
    expect(launcherItems({ ...base, hasInfo: true })[0]).toMatchObject({ label: "Info", icon: "info", href: `${BASE}/agenda` });
  });

  it("offers Activities only when the attendee can see one, dotted when a choice is owed", () => {
    expect(launcherItems(base).map((i) => i.label)).toEqual(["Agenda", "Me"]);
    expect(launcherItems({ ...base, activities: { show: false, owed: false } }).map((i) => i.label)).toEqual(["Agenda", "Me"]);
    const shown = launcherItems({ ...base, activities: { show: true, owed: true } });
    expect(shown.map((i) => i.label)).toEqual(["Agenda", "Activities", "Me"]);
    expect(shown[1]).toMatchObject({ href: `${BASE}/activities`, icon: "ticket", dot: true });
    expect(launcherItems({ ...base, activities: { show: true, owed: false } })[1].dot).toBe(false);
  });

  it("gives the public portal only the agenda, whatever it is told about activities", () => {
    const items = launcherItems({ ...base, basePath: "/e/kom", personal: false, activities: { show: true, owed: true } });
    expect(items.map((i) => i.label)).toEqual(["Agenda"]);
  });

  it("follows the built-ins with the tiles, in their saved order", () => {
    const items = launcherItems({ ...base, tiles: [tile("b", { image: "https://x/b.png" }), tile("a")] });
    expect(items.map((i) => i.id)).toEqual(["builtin:agenda", "builtin:me", "b", "a"]);
    expect(items[2]).toMatchObject({ builtin: false, external: true, image: "https://x/b.png", dot: false });
  });

  it("drops a route tile that repeats a built-in it sits beside", () => {
    const tiles = [routeTile("ag", "agenda"), routeTile("in", "info"), routeTile("ac", "activities"), routeTile("me", "me"), routeTile("st", "stamps")];
    const items = launcherItems({ ...base, activities: { show: true, owed: false }, tiles });
    expect(items.map((i) => i.id)).toEqual(["builtin:agenda", "builtin:activities", "builtin:me", "st"]);
  });

  it("keeps a route tile whose built-in is not on screen", () => {
    // No Activities item for this attendee, and no Me item on the public portal: a tile the
    // organiser added is then the only way there, so it stays.
    const personal = launcherItems({ ...base, tiles: [routeTile("ac", "activities")] });
    expect(personal.map((i) => i.id)).toContain("ac");
    const pub = launcherItems({ ...base, basePath: "/e/kom", personal: false, tiles: [routeTile("me", "me")] });
    expect(pub.map((i) => i.id)).toContain("me");
  });
});
