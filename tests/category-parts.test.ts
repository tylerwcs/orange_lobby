import { describe, it, expect } from "vitest";
import { categoryMatches, categoryParts, dayTabs } from "@/lib/agenda";

describe("categoryParts", () => {
  it("reads several programmes from one category, whatever joins them", () => {
    expect(categoryParts("KOM, Wellness")).toEqual(["kom", "wellness"]);
    expect(categoryParts("KOM + Wellness")).toEqual(["kom", "wellness"]);
    expect(categoryParts("KOM/YEP/Wellness")).toEqual(["kom", "yep", "wellness"]);
    expect(categoryParts(" YEP ")).toEqual(["yep"]);
  });
  it("is empty for no category", () => {
    expect(categoryParts(null)).toEqual([]);
    expect(categoryParts("  ,  ")).toEqual([]);
  });
});

describe("categoryMatches with several programmes", () => {
  it("shows an item for any one of the attendee's programmes", () => {
    expect(categoryMatches(["KOM"], "KOM, Wellness")).toBe(true);
    expect(categoryMatches(["Wellness"], "KOM + Wellness")).toBe(true);
    expect(categoryMatches(["YEP"], "KOM, Wellness")).toBe(false);
  });
  it("still treats a single category, and no categories, as before", () => {
    expect(categoryMatches(["Staff"], "staff")).toBe(true);
    expect(categoryMatches(["Staff"], null)).toBe(false);
    expect(categoryMatches(null, null)).toBe(true);
    expect(categoryMatches([], "YEP")).toBe(true);
  });
  it("never matches half a name", () => {
    expect(categoryMatches(["KOM"], "KOMpany")).toBe(false);
  });
});

describe("dayTabs for somebody in one programme", () => {
  const days = [{ date: "2026-09-30", name: "KOM day" }, { date: "2026-10-01", name: "YEP day" }];
  it("hides a day with nothing on it for them", () => {
    expect(dayTabs(days, [{ day: "2026-09-30" }])).toEqual([{ date: "2026-09-30", name: "KOM day" }]);
  });
  it("shows every day while they can see nothing yet, so the agenda is not blank", () => {
    expect(dayTabs(days, [])).toHaveLength(2);
  });
});
