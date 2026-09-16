import { describe, it, expect } from "vitest";
import { isBreakout, breakoutSlots, myBreakouts, matchAssignments, rosters } from "@/lib/breakouts";
import type { AgendaItem, Attendee } from "@/lib/types";

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

  it("sorts breakout items by day, then starts_at, regardless of input order", () => {
    // Supply items out of chronological order to test that sort actually runs
    const slots = breakoutSlots([
      item({ id: "c", slot: "Breakout 1", code: "3C", starts_at: "15:30" }),
      item({ id: "a", slot: "Breakout 1", code: "3A", starts_at: "13:30" }),
      item({ id: "b", slot: "Breakout 1", code: "3B", starts_at: "14:30" }),
    ]);
    // If .sort() were removed, items would appear in input order: 3C, 3A, 3B
    // With sort, they must appear in chronological order: 3A, 3B, 3C
    expect(slots[0].items.map((i) => i.code)).toEqual(["3A", "3B", "3C"]);
  });

  it("returns nothing for an event that runs no breakouts", () => {
    expect(breakoutSlots([item({ title: "Lunch" })])).toEqual([]);
  });
});

describe("myBreakouts", () => {
  const a = item({ id: "a", slot: "Breakout 1", code: "3A", starts_at: "13:30", ends_at: "15:00" });
  const b = item({ id: "b", slot: "Breakout 1", code: "3B", starts_at: "13:30", ends_at: "15:00" });
  const c = item({ id: "c", slot: "Breakout 2", code: "5A", starts_at: "15:30", ends_at: "17:00" });

  it("gives one row per round, carrying the room this attendee has", () => {
    const mine = myBreakouts([a, b, c], new Set(["b", "c"]));
    expect(mine.map((m) => [m.slot, m.item?.code])).toEqual([["Breakout 1", "3B"], ["Breakout 2", "5A"]]);
  });

  it("keeps a row with no item when the attendee is not assigned", () => {
    // A silently missing ninety-minute block is worse than an honest "not assigned yet".
    const mine = myBreakouts([a, b, c], new Set(["c"]));
    expect(mine[0]).toMatchObject({ slot: "Breakout 1", item: null, starts_at: "13:30", ends_at: "15:00" });
  });

  it("takes the placeholder's time from the round's rooms, which share it", () => {
    expect(myBreakouts([a, b], new Set())[0]).toMatchObject({ day: "2026-09-30", starts_at: "13:30", ends_at: "15:00" });
  });

  it("is empty for an event that runs no breakouts", () => {
    expect(myBreakouts([item({ title: "Lunch" })], new Set())).toEqual([]);
  });

  it("takes the assigned room's time, not the first room's time", () => {
    // A hand-typed agenda may have rooms with conflicting times.
    // An attendee assigned to the second room must see that room's hours, not the first room's.
    const rooms = [
      item({ id: "a", slot: "Breakout 1", code: "3A", starts_at: "13:30", ends_at: "15:00" }),
      item({ id: "b", slot: "Breakout 1", code: "3B", starts_at: "14:00", ends_at: "15:30" }),
    ];
    const mine = myBreakouts(rooms, new Set(["b"]));
    expect(mine[0]).toMatchObject({ item: expect.objectContaining({ id: "b" }), starts_at: "14:00", ends_at: "15:30" });
  });
});

describe("matchAssignments", () => {
  const slot = { slot: "Breakout 1", items: [
    item({ id: "a", slot: "Breakout 1", code: "3A" }),
    item({ id: "b", slot: "Breakout 1", code: "3B" }),
  ] };
  const who = (id: string, value?: string): Pick<Attendee, "id" | "extra"> =>
    ({ id, extra: value === undefined ? {} : { "Breakout 1": value } });

  it("matches a cell value to the room with that code", () => {
    const r = matchAssignments([who("p1", "3A"), who("p2", "3B")], slot);
    expect(r.matched).toEqual([
      { attendeeId: "p1", itemId: "a", slot: "Breakout 1" },
      { attendeeId: "p2", itemId: "b", slot: "Breakout 1" },
    ]);
  });

  it("forgives the spreadsheet's casing and padding", () => {
    expect(matchAssignments([who("p1", " 3a ")], slot).matched[0].itemId).toBe("a");
  });

  it("reports a value that matches no room, with how many people wrote it", () => {
    // This report is the typo detector the join table exists to make possible (D79/D83).
    const r = matchAssignments([who("p1", "Room 3B"), who("p2", "Room 3B"), who("p3", "9Z")], slot);
    expect(r.matched).toEqual([]);
    expect(r.unmatched).toEqual([{ value: "Room 3B", count: 2 }, { value: "9Z", count: 1 }]);
  });

  it("counts people whose cell is empty separately from people who typed something wrong", () => {
    const r = matchAssignments([who("p1"), who("p2", "  "), who("p3", "3A")], slot);
    expect(r.blank).toBe(2);
    expect(r.unmatched).toEqual([]);
    expect(r.matched).toHaveLength(1);
  });
});

describe("rosters", () => {
  const a = item({ id: "a", slot: "Breakout 1", code: "3A", location: "Room 3A" });
  const b = item({ id: "b", slot: "Breakout 1", code: "3B", location: "Room 3B" });

  it("puts each attendee in their room", () => {
    const [r] = rosters([a, b], ["p1", "p2", "p3"], [
      { agenda_item_id: "a", attendee_id: "p1" },
      { agenda_item_id: "b", attendee_id: "p2" },
    ]);
    expect(r.rooms.map((x) => [x.code, x.attendeeIds])).toEqual([["3A", ["p1"]], ["3B", ["p2"]]]);
  });

  it("names everyone who has no room in this round", () => {
    // The number the desk needs at breakfast, not at 13:29.
    const [r] = rosters([a, b], ["p1", "p2", "p3"], [{ agenda_item_id: "a", attendee_id: "p1" }]);
    expect(r.unassignedIds).toEqual(["p2", "p3"]);
  });

  it("counts a round separately from the others", () => {
    const c = item({ id: "c", slot: "Breakout 2", code: "5A" });
    const out = rosters([a, c], ["p1"], [{ agenda_item_id: "a", attendee_id: "p1" }]);
    expect(out.map((s) => [s.slot, s.unassignedIds.length])).toEqual([["Breakout 1", 0], ["Breakout 2", 1]]);
  });
});
