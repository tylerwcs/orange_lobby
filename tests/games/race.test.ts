import { describe, expect, it } from "vitest";
import {
  parseGrouping, laneKeyFor, laneLabel, progressOf, standings, topTapper, tapAllowance, lobbyLanes, heldLanes, OTHERS,
  type Grouping, type TapRow,
} from "@/features/games/race";

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
  it("names a solo lane by the player's LED name (D365)", () => {
    expect(laneLabel("a1", { by: "solo" }, () => "Cai Shen")).toBe("Cai Shen");
    expect(laneLabel("a1", { by: "solo" })).toBe("?");
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

describe("lobbyLanes (D364)", () => {
  const lane = (i: number) => ({ key: `p${String(i).padStart(2, "0")}`, players: 1, active: 0, taps: 0, score: 0, place: i + 1 });
  const joined = (n: number) => Array.from({ length: n }, (_, i) => ({
    attendee_id: lane(i).key, lane_key: lane(i).key, taps: 0, joined_at: `2026-09-30T10:00:${String(i).padStart(2, "0")}Z`,
  }));
  it("shows every lane up to 30", () => {
    const list = Array.from({ length: 30 }, (_, i) => lane(i));
    expect(lobbyLanes(list, joined(30))).toEqual(list);
  });
  it("past 30, shows the 30 newest joiners in the list's order", () => {
    const list = Array.from({ length: 50 }, (_, i) => lane(i));
    const shown = lobbyLanes(list, joined(50));
    expect(shown.map((l) => l.key)).toEqual(list.slice(20).map((l) => l.key));
  });
  it("counts a group lane by its newest joiner", () => {
    const list = Array.from({ length: 31 }, (_, i) => lane(i));
    const rows = [...joined(31), { attendee_id: "late", lane_key: "p00", taps: 0, joined_at: "2026-09-30T11:00:00Z" }];
    const keys = lobbyLanes(list, rows).map((l) => l.key);
    expect(keys).toContain("p00");
    expect(keys).not.toContain("p01");
  });
});

describe("heldLanes (D364)", () => {
  const ranked = (order: string[]) => order.map((key, i) => ({ key, place: i + 1 }));
  const keys = Array.from({ length: 50 }, (_, i) => `k${i}`);
  it("holds the top 30 when nothing is held", () => {
    expect(heldLanes(null, ranked(keys))).toEqual(keys.slice(0, 30));
  });
  it("keeps the held lanes as places change below the podium", () => {
    const held = keys.slice(0, 30);
    const now = [...keys.slice(0, 3), ...keys.slice(40), ...keys.slice(3, 40)];
    expect(heldLanes(held, ranked(now))).toEqual(held);
  });
  it("swaps a podium lane in for the held lane placed lowest", () => {
    const held = keys.slice(0, 30);
    const now = ["k45", ...keys.filter((k) => k !== "k45")];
    const out = heldLanes(held, ranked(now));
    expect(out).toContain("k45");
    expect(out).not.toContain("k29");
    expect(out).toHaveLength(30);
  });
  it("returns what it holds unchanged once settled", () => {
    const now = ranked(["k45", "k46", ...keys.filter((k) => k !== "k45" && k !== "k46")]);
    const once = heldLanes(keys.slice(0, 30), now);
    expect(heldLanes(once, now)).toEqual(once);
  });
  it("holds everyone when 30 or fewer race", () => {
    expect(heldLanes(null, ranked(keys.slice(0, 8)))).toEqual(keys.slice(0, 8));
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
