import { describe, expect, it } from "vitest";
import {
  alsoIn, countedRows, isLocked, namesLine, notInAnySport, refusalFlash, shortCount, sizeLabel, squadExportRows, squadMembers, squadState,
  type SquadPerson, type SquadRow, type TournamentSport,
} from "@/features/tournaments/lib/squads";

const sport = (min: number, max: number) => ({ min_size: min, max_size: max });
const S = (id: string, name: string, position: number, min = 2, max = 2): TournamentSport => ({ id, activity_id: "act", name, min_size: min, max_size: max, position });
const R = (sport_id: string, group_id: string, attendee_id: string, added_at = "2026-10-16T00:00:00Z"): SquadRow => ({ sport_id, group_id, attendee_id, added_by: null, added_at });
const P = (id: string, name: string, group_id: string | null, cancelled_at: string | null = null): SquadPerson => ({ id, name, group_id, cancelled_at });
const people = (...ps: SquadPerson[]) => new Map(ps.map((p) => [p.id, p]));

describe("sizeLabel", () => {
  it("labels sizes", () => {
    expect(sizeLabel(1, sport(2, 2))).toBe("1 of 2");
    expect(sizeLabel(2, sport(2, 2))).toBe("2 of 2 ✓");
    expect(sizeLabel(5, sport(5, 7))).toBe("5 of 5–7 ✓");
    expect(sizeLabel(3, sport(5, 7))).toBe("3 of 5–7");
    expect(sizeLabel(3, sport(2, 2))).toBe("Over · 1 too many");
  });
});

describe("squadState (D646)", () => {
  it("names states either side of the deadline", () => {
    expect(squadState(1, sport(2, 2), false)).toEqual({ key: "short", label: "1 short" });
    expect(squadState(2, sport(2, 2), false).key).toBe("full");
    expect(squadState(6, sport(5, 7), false).key).toBe("full");
    expect(squadState(3, sport(2, 2), false)).toEqual({ key: "over", label: "Over · 1 too many" });
    expect(squadState(3, sport(2, 2), true).key).toBe("over");
    expect(squadState(0, sport(2, 2), true)).toEqual({ key: "forfeit", label: "Forfeit" });
    expect(squadState(2, sport(2, 2), true)).toEqual({ key: "ready", label: "Ready" });
  });
});

describe("isLocked (D641)", () => {
  it("locks at the deadline, not before", () => {
    const at = "2026-10-24T10:00:00.000Z";
    expect(isLocked(at, new Date("2026-10-24T09:59:59Z"))).toBe(false);
    expect(isLocked(at, new Date(at))).toBe(true);
    expect(isLocked(null, new Date())).toBe(false);
    expect(isLocked(undefined, new Date())).toBe(false);
  });
});

describe("countedRows (D643)", () => {
  it("drops a cancelled person and one who moved group", () => {
    const rows = [R("s1", "g1", "a"), R("s1", "g1", "b"), R("s1", "g1", "c"), R("s1", "g1", "gone")];
    const ps = people(P("a", "A", "g1"), P("b", "B", "g1", "2026-10-15T00:00:00Z"), P("c", "C", "g2"));
    expect(countedRows(rows, ps).map((r) => r.attendee_id)).toEqual(["a"]);
  });
});

describe("squadMembers", () => {
  it("lists one squad's attendees in the order they were added", () => {
    const rows = [R("s1", "g1", "b", "2026-10-16T02:00:00Z"), R("s1", "g1", "a", "2026-10-16T01:00:00Z"), R("s2", "g1", "c"), R("s1", "g2", "d")];
    expect(squadMembers(rows, "s1", "g1")).toEqual(["a", "b"]);
  });
});

describe("notInAnySport", () => {
  it("lists members with no counted squad place", () => {
    const rows = countedRows([R("s1", "g1", "a"), R("s1", "g1", "b")], people(P("a", "A", "g1"), P("b", "B", "g2")));
    expect(notInAnySport(["a", "b", "c"], rows)).toEqual(["b", "c"]);
  });
});

describe("alsoIn", () => {
  it("names the other sports in the organiser's order", () => {
    const sports = [S("s3", "Futsal", 2), S("s1", "Badminton", 0), S("s2", "Basketball", 1)];
    const rows = [R("s3", "g1", "a"), R("s1", "g1", "a"), R("s2", "g1", "a"), R("s2", "g1", "b")];
    expect(alsoIn("a", rows, sports, "s1")).toEqual(["Basketball", "Futsal"]);
    expect(alsoIn("c", rows, sports, "s1")).toEqual([]);
  });
});

describe("namesLine", () => {
  it("joins a few names in plain English", () => {
    expect(namesLine(["A"])).toBe("A");
    expect(namesLine(["A", "B"])).toBe("A and B");
    expect(namesLine(["A", "B", "C"])).toBe("A, B and C");
  });
  it("stops at ten and counts the rest", () => {
    const names = Array.from({ length: 12 }, (_, i) => `N${i + 1}`);
    expect(namesLine(names)).toBe("N1, N2, N3, N4, N5, N6, N7, N8, N9, N10 … and 2 more");
  });
});

describe("shortCount", () => {
  it("counts the groups below the sport's minimum", () => {
    const rows = [R("s1", "g1", "a"), R("s1", "g1", "b"), R("s1", "g2", "c")];
    expect(shortCount(S("s1", "Badminton", 0), ["g1", "g2", "g3"], rows)).toBe(2);
  });
});

describe("refusalFlash (D642)", () => {
  it("says each refusal in the organiser's words", () => {
    expect(refusalFlash("full", { sport: "Badminton" })).toBe("Badminton is full.");
    expect(refusalFlash("already", { sport: "Futsal", name: "Aina" })).toBe("Aina is already in Futsal.");
    expect(refusalFlash("locked", { sport: "Futsal" })).toBe("Squads are locked. Ask the organisers to make changes.");
    expect(refusalFlash("not_allowed", { sport: "Futsal" })).toBe("Only your captain can change squads.");
    expect(refusalFlash("not_member", { sport: "Futsal" })).toBe("They're not in your group.");
    expect(refusalFlash("missing", { sport: "Futsal" })).toBe("That squad no longer exists.");
    expect(refusalFlash("closed", { sport: "Futsal" })).toBe("This tournament is closed.");
  });
});

describe("squadExportRows (D649)", () => {
  const sports = [S("s2", "Futsal", 1, 1, 1), S("s1", "Badminton", 0)];
  const groups = [{ id: "g2", name: "Group 02" }, { id: "g1", name: "Group 01" }];
  const ps = people(P("a", "Zed", "g1"), P("b", "Aina", "g1"), P("c", "Cai", "g2"), P("x", "Gone", "g2", "2026-10-15T00:00:00Z"));
  const rows = [R("s1", "g1", "a"), R("s1", "g1", "b"), R("s1", "g2", "c"), R("s1", "g2", "x"), R("s2", "g1", "a")];

  it("orders by sport, group, then name, with a blank row for each short squad", () => {
    expect(squadExportRows({ sports, groups, rows, people: ps, locked: false })).toEqual([
      { sport: "Badminton", group: "Group 01", attendeeId: "b", state: "" },
      { sport: "Badminton", group: "Group 01", attendeeId: "a", state: "" },
      { sport: "Badminton", group: "Group 02", attendeeId: "c", state: "" },
      { sport: "Badminton", group: "Group 02", attendeeId: null, state: "Short" },
      { sport: "Futsal", group: "Group 01", attendeeId: "a", state: "" },
      { sport: "Futsal", group: "Group 02", attendeeId: null, state: "Short" },
    ]);
  });
  it("says Forfeit once squads are locked", () => {
    const out = squadExportRows({ sports, groups, rows, people: ps, locked: true });
    expect(out.filter((r) => r.attendeeId === null).map((r) => r.state)).toEqual(["Forfeit", "Forfeit"]);
  });
});
