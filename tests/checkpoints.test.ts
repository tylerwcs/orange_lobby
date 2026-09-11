import { describe, it, expect } from "vitest";
import { activeCheckpoint, checkpointOptions, checkpointsByDay, pickCheckpoint } from "@/lib/checkpoints";
import type { Checkpoint } from "@/lib/types";

const cp = (id: string, name: string, day: string, sort_order = 0): Checkpoint =>
  ({ id, event_id: "e1", name, day, sort_order });

describe("checkpointsByDay", () => {
  it("returns nothing for no checkpoints", () => {
    expect(checkpointsByDay([])).toEqual([]);
  });

  it("groups by day, days ascending", () => {
    const rows = [cp("c3", "Dinner", "2026-10-01"), cp("c1", "Registration", "2026-09-30"), cp("c2", "Lunch", "2026-09-30", 1)];
    expect(checkpointsByDay(rows).map((g) => [g.day, g.items.map((i) => i.name)])).toEqual([
      ["2026-09-30", ["Registration", "Lunch"]],
      ["2026-10-01", ["Dinner"]],
    ]);
  });

  it("orders within a day by sort_order, then name, so two zeros are still stable", () => {
    const rows = [cp("c2", "Zebra", "2026-09-30", 0), cp("c1", "Apple", "2026-09-30", 0), cp("c3", "First", "2026-09-30", -1)];
    expect(checkpointsByDay(rows)[0].items.map((i) => i.name)).toEqual(["First", "Apple", "Zebra"]);
  });
});

describe("pickCheckpoint", () => {
  const rows = [
    cp("c1", "Registration", "2026-09-30"),
    cp("c2", "Lunch", "2026-09-30", 1),
    cp("c3", "Dinner", "2026-10-01"),
  ];

  it("keeps the requested checkpoint when it falls on the chosen day", () => {
    expect(pickCheckpoint(rows, "2026-09-30", "c2")?.id).toBe("c2");
  });

  it("ignores a requested checkpoint from another day and takes that day's first", () => {
    expect(pickCheckpoint(rows, "2026-09-30", "c3")?.id).toBe("c1");
  });

  it("takes the day's first when nothing is requested", () => {
    expect(pickCheckpoint(rows, "2026-10-01", undefined)?.id).toBe("c3");
  });

  it("returns null for a day with no checkpoints", () => {
    expect(pickCheckpoint(rows, "2026-10-02", undefined)).toBeNull();
    expect(pickCheckpoint([], "2026-09-30", "c1")).toBeNull();
  });
});

describe("activeCheckpoint", () => {
  // Explicit running order: without it these two tie on sort_order and fall back to the
  // name, which would make "Lunch" the morning's first checkpoint.
  const reg = cp("c1", "Registration", "2026-09-30", 0);
  const lunch = cp("c2", "Lunch", "2026-09-30", 1);
  const day2 = cp("c3", "Day 2", "2026-10-01", 0);
  const all = [reg, lunch, day2];

  it("returns the checkpoint the organiser marked as running", () => {
    expect(activeCheckpoint("c2", all, "2026-09-30")).toEqual(lunch);
  });

  it("follows the choice even onto another day — an organiser running tomorrow's door means it", () => {
    expect(activeCheckpoint("c3", all, "2026-09-30")).toEqual(day2);
  });

  it("falls back to today's first when nothing is marked", () => {
    expect(activeCheckpoint(null, all, "2026-10-01")).toEqual(day2);
  });

  it("falls back to today's first when the marked one was deleted", () => {
    // `on delete set null` should prevent this, but a stale id must not empty the dashboard.
    expect(activeCheckpoint("gone", all, "2026-09-30")).toEqual(reg);
  });

  it("falls back to the very first when today has no checkpoint at all", () => {
    expect(activeCheckpoint(null, all, "2026-12-25")).toEqual(reg);
  });

  it("returns nothing when the event has no checkpoints", () => {
    expect(activeCheckpoint(null, [], "2026-09-30")).toBeNull();
    expect(activeCheckpoint("c1", [], "2026-09-30")).toBeNull();
  });

  it("respects the running order within a day, not insertion order", () => {
    const late = cp("c9", "Aardvark", "2026-09-30", 5);
    expect(activeCheckpoint(null, [late, reg], "2026-09-30")).toEqual(reg);
  });
});

describe("checkpointOptions", () => {
  it("dates every label when the event runs more than a day", () => {
    expect(checkpointOptions([cp("c1", "Registration", "2026-09-30"), cp("c2", "Day 2", "2026-10-01")]))
      .toEqual([{ id: "c1", label: "Registration · Wed 30 Sep" }, { id: "c2", label: "Day 2 · Thu 1 Oct" }]);
  });

  it("leaves labels undated on a single-day event, where the date says nothing", () => {
    expect(checkpointOptions([cp("c1", "Registration", "2026-09-30", 0), cp("c2", "Lunch", "2026-09-30", 1)]))
      .toEqual([{ id: "c1", label: "Registration" }, { id: "c2", label: "Lunch" }]);
  });

  it("lists them in running order, days first", () => {
    const rows = [cp("c3", "Day 2", "2026-10-01"), cp("c2", "Lunch", "2026-09-30", 1), cp("c1", "Registration", "2026-09-30", 0)];
    expect(checkpointOptions(rows).map((o) => o.id)).toEqual(["c1", "c2", "c3"]);
  });

  it("has nothing to offer when there are no checkpoints", () => {
    expect(checkpointOptions([])).toEqual([]);
  });
});
