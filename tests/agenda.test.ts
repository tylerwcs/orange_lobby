import { describe, it, expect } from "vitest";
import { visibleTo, groupByDay, parseCategories, nextSession, isNow, categoriesFromValues } from "@/lib/agenda";
import type { AgendaItem } from "@/lib/types";

const mk = (p: Partial<AgendaItem>): AgendaItem => ({ id: "x", event_id: "e", day: "2026-09-30", starts_at: "09:00", ends_at: null, title: "t", description: null, location: null, categories: null, slot: null, code: null, color: null, image_url: null, sort_order: 0, ...p });

describe("agenda", () => {
  it("shows unrestricted items to everyone, restricted only to matching category", () => {
    const items = [mk({ id: "a" }), mk({ id: "b", categories: ["VIP"] })];
    expect(visibleTo(items, null).map((i) => i.id)).toEqual(["a"]);
    expect(visibleTo(items, { category: "Staff", assignedItemIds: new Set() }).map((i) => i.id)).toEqual(["a"]);
    expect(visibleTo(items, { category: "vip", assignedItemIds: new Set() }).map((i) => i.id)).toEqual(["a", "b"]); // case-insensitive
  });
  it("groups by day sorted by time then sort_order", () => {
    const items = [mk({ id: "1", day: "2026-10-01", starts_at: "10:00" }), mk({ id: "2", starts_at: "09:30" }), mk({ id: "3", starts_at: "09:00", sort_order: 1 }), mk({ id: "4", starts_at: "09:00", sort_order: 0 })];
    const g = groupByDay(items);
    expect(g.map((d) => d.day)).toEqual(["2026-09-30", "2026-10-01"]);
    expect(g[0].items.map((i) => i.id)).toEqual(["4", "3", "2"]);
  });
  it("parses categories csv", () => {
    expect(parseCategories("")).toBeNull();
    expect(parseCategories(" VIP, Staff ,")).toEqual(["VIP", "Staff"]);
  });
});

describe("nextSession", () => {
  const items = [
    mk({ id: "a", day: "2026-09-30", starts_at: "09:00", ends_at: "09:45" }),
    mk({ id: "b", day: "2026-09-30", starts_at: "10:30", ends_at: "11:15" }),
    mk({ id: "c", day: "2026-10-01", starts_at: "09:00", ends_at: null }),
  ];
  it("returns the running session as now", () => {
    expect(nextSession(items, "2026-09-30", "10:40")).toMatchObject({ item: { id: "b" }, status: "now" });
    expect(isNow(items[1], "2026-09-30", "10:40")).toBe(true);
  });
  it("returns the next upcoming session across days", () => {
    expect(nextSession(items, "2026-09-30", "09:50")).toMatchObject({ item: { id: "b" }, status: "next" });
    expect(nextSession(items, "2026-09-30", "12:00")).toMatchObject({ item: { id: "c" }, status: "next" });
  });
  it("treats a session without end time as one hour long and returns null after the last one", () => {
    expect(nextSession(items, "2026-10-01", "09:30")?.status).toBe("now");
    expect(nextSession(items, "2026-10-01", "10:30")).toBeNull();
  });
});

describe("endOf edge", () => {
  it("treats a 23:xx session without end as running until 23:59", () => {
    const late = mk({ id: "z", day: "2026-09-30", starts_at: "23:30", ends_at: null });
    expect(isNow(late, "2026-09-30", "23:45")).toBe(true);
    expect(nextSession([late], "2026-09-30", "23:00")).toMatchObject({ item: { id: "z" }, status: "next" });
    expect(nextSession([late], "2026-09-30", "23:59")).toBeNull();
  });
});

import { pickDay } from "@/lib/agenda";
describe("pickDay", () => {
  const days = ["2026-09-30", "2026-10-01"];
  it("prefers the requested day, then today, then the first", () => {
    expect(pickDay(days, "2026-10-01", "2026-09-30")).toBe("2026-10-01");
    expect(pickDay(days, "2026-12-25", "2026-10-01")).toBe("2026-10-01");
    expect(pickDay(days, undefined, "2026-01-01")).toBe("2026-09-30");
    expect(pickDay([], undefined, "2026-01-01")).toBeNull();
  });
});

describe("visibleTo with breakouts", () => {
  const lunch = mk({ id: "lunch", title: "Lunch" });
  const a = mk({ id: "a", slot: "Breakout 1", code: "3A" });
  const b = mk({ id: "b", slot: "Breakout 1", code: "3B" });
  const mgmtRoom = mk({ id: "m", slot: "Breakout 1", code: "5A", categories: ["Management"] });

  it("shows the room this attendee is assigned to and hides the others", () => {
    const seen = visibleTo([lunch, a, b], { category: null, assignedItemIds: new Set(["a"]) });
    expect(seen.map((i) => i.id)).toEqual(["lunch", "a"]);
  });

  it("hides every room from an attendee assigned to none", () => {
    // Fails closed: showing nothing is recoverable, showing someone else's room is not.
    const seen = visibleTo([lunch, a, b], { category: null, assignedItemIds: new Set() });
    expect(seen.map((i) => i.id)).toEqual(["lunch"]);
  });

  it("hides every room from the anonymous portal", () => {
    expect(visibleTo([lunch, a, b], null).map((i) => i.id)).toEqual(["lunch"]);
  });

  it("requires BOTH filters to pass when an item carries a slot and a category", () => {
    expect(visibleTo([mgmtRoom], { category: "Staff", assignedItemIds: new Set(["m"]) })).toEqual([]);
    expect(visibleTo([mgmtRoom], { category: "Management", assignedItemIds: new Set(["m"]) }).map((i) => i.id)).toEqual(["m"]);
  });

  it("leaves an ordinary categorised item behaving exactly as before", () => {
    const vipOnly = mk({ id: "v", categories: ["VIP"] });
    expect(visibleTo([vipOnly], { category: "VIP", assignedItemIds: new Set() }).map((i) => i.id)).toEqual(["v"]);
    expect(visibleTo([vipOnly], { category: "Staff", assignedItemIds: new Set() })).toEqual([]);
  });
});

describe("categoriesFromValues", () => {
  it("keeps the ticked categories, in order", () => {
    expect(categoriesFromValues(["Management", "Speaker"])).toEqual(["Management", "Speaker"]);
  });

  it("is null when nothing is ticked, which means everyone", () => {
    // Null rather than [] because `visibleTo` treats an empty list as "for everyone" too,
    // and the column is nullable — one representation is enough.
    expect(categoriesFromValues([])).toBeNull();
    expect(categoriesFromValues(["", "  "])).toBeNull();
  });

  it("drops blanks and repeats", () => {
    expect(categoriesFromValues([" Staff ", "Staff", ""])).toEqual(["Staff"]);
  });
});
