import { describe, it, expect } from "vitest";
import { checkpointsByDay, pickCheckpoint } from "@/lib/checkpoints";
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
