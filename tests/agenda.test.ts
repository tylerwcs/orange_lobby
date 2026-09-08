import { describe, it, expect } from "vitest";
import { visibleTo, groupByDay, parseCategories, nextSession, isNow } from "@/lib/agenda";
import type { AgendaItem } from "@/lib/types";

const mk = (p: Partial<AgendaItem>): AgendaItem => ({ id: "x", event_id: "e", day: "2026-09-30", starts_at: "09:00", ends_at: null, title: "t", description: null, location: null, categories: null, sort_order: 0, ...p });

describe("agenda", () => {
  it("shows unrestricted items to everyone, restricted only to matching category", () => {
    const items = [mk({ id: "a" }), mk({ id: "b", categories: ["VIP"] })];
    expect(visibleTo(items, null).map((i) => i.id)).toEqual(["a"]);
    expect(visibleTo(items, "Staff").map((i) => i.id)).toEqual(["a"]);
    expect(visibleTo(items, "vip").map((i) => i.id)).toEqual(["a", "b"]); // case-insensitive
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
