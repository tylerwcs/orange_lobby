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
  it("leads with Agenda, and adds Info beside it when the event has an info section (D216)", () => {
    expect(launcherItems(base)[0]).toMatchObject({ label: "Agenda", icon: "calendar", href: `${BASE}/agenda`, builtin: true });
    const items = launcherItems({ ...base, hasInfo: true });
    expect(items.map((i) => i.label)).toEqual(["Agenda", "Info", "Me"]);
    expect(items[1]).toMatchObject({ icon: "info", href: `${BASE}/info`, builtin: true });
  });

  it("draws Agenda, Info and Me with the portal's own pictures", () => {
    const items = launcherItems({ ...base, hasInfo: true });
    expect(items.map((i) => i.image)).toEqual(["/portal-icons/agenda.webp", "/portal-icons/info.webp", "/portal-icons/me.webp"]);
  });

  it("has no Activities button: the home's activity cards are that section (D221)", () => {
    const items = launcherItems({ ...base, activities: { show: true, owed: true } });
    expect(items.map((i) => i.label)).toEqual(["Agenda", "Me"]);
    expect(items.some((i) => i.dot)).toBe(false);
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
    const items = launcherItems({ ...base, hasInfo: true, activities: { show: true, owed: false }, tiles });
    expect(items.map((i) => i.id)).toEqual(["builtin:agenda", "builtin:info", "builtin:me", "st"]);
  });

  it("keeps a route tile whose built-in is not on screen", () => {
    // No Activities item for this attendee, and no Me item on the public portal: a tile the
    // organiser added is then the only way there, so it stays.
    const personal = launcherItems({ ...base, tiles: [routeTile("ac", "activities"), routeTile("in", "info")] });
    expect(personal.map((i) => i.id)).toEqual(["builtin:agenda", "builtin:me", "ac", "in"]);
    const pub = launcherItems({ ...base, basePath: "/e/kom", personal: false, tiles: [routeTile("me", "me")] });
    expect(pub.map((i) => i.id)).toContain("me");
  });
});
