import { describe, expect, it } from "vitest";
import {
  parseGrouping, laneKeyFor, laneLabel, progressOf, standings, topTapper, tapAllowance, visibleLanes, OTHERS,
  type Grouping, type TapRow,
} from "@/lib/games/race";

const person = (over: Partial<{ id: string; category: string | null; extra: Record<string, string> }> = {}) =>
  ({ id: "a1", category: null, extra: {}, ...over });
const byTable: Grouping = { by: "field", key: "table_no", label: "Table" };

describe("parseGrouping", () => {
  it("reads each shape", () => {
    expect(parseGrouping({ by: "category" })).toEqual({ by: "category" });
    expect(parseGrouping({ by: "field", key: "table_no", label: "Table" })).toEqual(byTable);
  });
  it("falls back to solo for anything else", () => {
    expect([parseGrouping(null), parseGrouping({ by: "field" }), parseGrouping({ by: "team" })])
      .toEqual([{ by: "solo" }, { by: "solo" }, { by: "solo" }]);
  });
  it("labels a field by its key when it has no label", () => {
    expect(parseGrouping({ by: "field", key: "dept" })).toEqual({ by: "field", key: "dept", label: "dept" });
  });
});

describe("laneKeyFor", () => {
  it("is the attendee in solo", () => {
    expect(laneKeyFor(person({ id: "a9" }), { by: "solo" })).toBe("a9");
  });
  it("is the trimmed category", () => {
    expect(laneKeyFor(person({ category: " Sales " }), { by: "category" })).toBe("Sales");
  });
  it("is the first part of a multi-programme category, case kept", () => {
    expect(laneKeyFor(person({ category: "KOM, Wellness" }), { by: "category" })).toBe("KOM");
    expect(laneKeyFor(person({ category: " kom + Wellness" }), { by: "category" })).toBe("kom");
    expect(laneKeyFor(person({ category: "YEP/KOM" }), { by: "category" })).toBe("YEP");
  });
  it("is the field value", () => {
    expect(laneKeyFor(person({ extra: { table_no: "7" } }), byTable)).toBe("7");
  });
  it("puts people with no value in Others", () => {
    expect(laneKeyFor(person(), byTable)).toBe(OTHERS);
    expect(laneKeyFor(person({ category: "  " }), { by: "category" })).toBe(OTHERS);
  });
});

describe("laneLabel", () => {
  it("labels a bare number with its field (D263)", () => {
    expect(laneLabel("7", byTable)).toBe("Table 7");
  });
  it("uses any other value as it is", () => {
    expect(laneLabel("Sales", { by: "field", key: "dept", label: "Department" })).toBe("Sales");
  });
  it("names the Others lane", () => {
    expect(laneLabel(OTHERS, byTable)).toBe("Others");
  });
  it("names a solo lane by initials and first name", () => {
    expect(laneLabel("a1", { by: "solo" }, () => "Priya Ramasamy")).toBe("PR · Priya");
  });
});

describe("standings", () => {
  const rows: TapRow[] = [
    { attendee_id: "a", lane_key: "7", taps: 100 },
    { attendee_id: "b", lane_key: "7", taps: 50 },
    { attendee_id: "c", lane_key: "7", taps: 0 },
    { attendee_id: "d", lane_key: "12", taps: 90 },
  ];
  it("ranks by average taps per player who tapped (D267)", () => {
    expect(standings(rows).map((l) => [l.key, l.score, l.place])).toEqual([["12", 90, 1], ["7", 75, 2]]);
  });
  it("counts everyone who joined, and separately who tapped", () => {
    expect(standings(rows).find((l) => l.key === "7")).toMatchObject({ players: 3, active: 2, taps: 150 });
  });
  it("scores a lane where nobody tapped as zero", () => {
    expect(standings([{ attendee_id: "a", lane_key: "3", taps: 0 }])[0].score).toBe(0);
  });
  it("breaks a tied score by total taps", () => {
    const tie: TapRow[] = [
      { attendee_id: "a", lane_key: "A", taps: 10 },
      { attendee_id: "b", lane_key: "B", taps: 10 },
      { attendee_id: "c", lane_key: "B", taps: 10 },
    ];
    expect(standings(tie).map((l) => l.key)).toEqual(["B", "A"]);
  });
});

describe("topTapper", () => {
  it("finds the fastest individual", () => {
    expect(topTapper([{ attendee_id: "a", lane_key: "1", taps: 3 }, { attendee_id: "b", lane_key: "1", taps: 9 }])?.attendee_id).toBe("b");
  });
  it("is nobody when nobody tapped", () => {
    expect(topTapper([{ attendee_id: "a", lane_key: "1", taps: 0 }])).toBeNull();
  });
});

describe("tapAllowance", () => {
  it("allows 15 taps per second since the last batch", () => {
    expect(tapAllowance(100, 1000)).toBe(15);
  });
  it("accepts an honest batch whole", () => {
    expect(tapAllowance(9, 1000)).toBe(9);
  });
  it("caps the elapsed time at 3 s, so a quiet phone cannot bank taps", () => {
    expect(tapAllowance(500, 60_000)).toBe(45);
  });
  it("never goes negative", () => {
    expect([tapAllowance(-5, 1000), tapAllowance(5, -1000)]).toEqual([0, 0]);
  });
});

describe("visibleLanes", () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ key: String(i), players: 1, active: 1, taps: 1, score: 1, place: i + 1 }));
  it("shows up to 30 lanes, for teams and solo alike (D363)", () => {
    expect(visibleLanes(many, byTable)).toHaveLength(30);
    expect(visibleLanes(many, { by: "solo" })).toHaveLength(30);
  });
});

describe("progressOf (D303, D304)", () => {
  it("is the score over 110% of the leader, so the leader never looks finished", () => {
    expect(progressOf(100, 100)).toBeCloseTo(1 / 1.1);
    expect(progressOf(50, 100)).toBeCloseTo(0.5 / 1.1);
  });
  it("is 0 before anyone taps", () => {
    expect(progressOf(0, 0)).toBe(0);
  });
});
