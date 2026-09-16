import { describe, it, expect } from "vitest";
import { isBreakout, breakoutSlots } from "@/lib/breakouts";
import type { AgendaItem } from "@/lib/types";

const item = (over: Partial<AgendaItem>): AgendaItem => ({
  id: "i1", event_id: "e", day: "2026-09-30", starts_at: "13:30", ends_at: "15:00",
  title: "Breakout", description: null, location: null, categories: null,
  slot: null, code: null, sort_order: 0, ...over,
});

describe("isBreakout", () => {
  it("is a breakout when it carries a slot", () => {
    expect(isBreakout(item({ slot: "Breakout 1", code: "3A" }))).toBe(true);
  });

  it("is not a breakout without one, however it is titled", () => {
    // An ordinary agenda item must behave exactly as it did before this feature.
    expect(isBreakout(item({ title: "Breakout: regional teams" }))).toBe(false);
  });

  it("is not a breakout when the slot is blank", () => {
    expect(isBreakout(item({ slot: "   " }))).toBe(false);
  });
});

describe("breakoutSlots", () => {
  it("groups alternatives under one slot, in agenda order", () => {
    const slots = breakoutSlots([
      item({ id: "a", slot: "Breakout 1", code: "3A", starts_at: "13:30" }),
      item({ id: "x", title: "Lunch", starts_at: "12:15" }),
      item({ id: "b", slot: "Breakout 1", code: "3B", starts_at: "13:30" }),
      item({ id: "c", slot: "Breakout 2", code: "5A", starts_at: "15:30" }),
    ]);
    expect(slots.map((s) => s.slot)).toEqual(["Breakout 1", "Breakout 2"]);
    expect(slots[0].items.map((i) => i.code)).toEqual(["3A", "3B"]);
  });

  it("returns nothing for an event that runs no breakouts", () => {
    expect(breakoutSlots([item({ title: "Lunch" })])).toEqual([]);
  });
});
