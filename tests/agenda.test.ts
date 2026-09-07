import { describe, it, expect } from "vitest";
import { visibleTo, groupByDay, parseCategories } from "@/lib/agenda";
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
