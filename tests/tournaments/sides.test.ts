import { describe, expect, it } from "vitest";
import { countedRows, type SquadPerson, type SquadRow } from "@/features/tournaments/lib/squads";
import { inTournament, pairProblem, showSuperTeamsCard, sideOfGroup, sideRows, superTeamLabel, tournamentSides, type SuperTeam } from "@/features/tournaments/lib/sides";

const R = (sport_id: string, group_id: string, attendee_id: string): SquadRow => ({ sport_id, group_id, attendee_id, added_by: null, added_at: "2026-11-05T00:00:00Z" });
const P = (id: string, group_id: string | null, cancelled_at: string | null = null): SquadPerson => ({ id, name: id, group_id, cancelled_at });
const people = (...ps: SquadPerson[]) => new Map(ps.map((p) => [p.id, p]));
const groups = ["g01", "g02", "g03", "g04"].map((id, i) => ({ id, name: `Team ${i + 1}` }));
const names = new Map(groups.map((g) => [g.id, g.name]));
const T = (id: string, groupIds: string[], name: string | null = null): SuperTeam => ({ id, activity_id: "act", name, groupIds });

describe("tournamentSides (D821, D822, D824)", () => {
  it("is one side per group with the switch off", () => {
    expect(tournamentSides(groups, null)).toEqual(groups.map((g) => ({ id: g.id, name: g.name, groupIds: [g.id], superTeamId: null })));
  });

  it("is one side per super team, lead first, unpaired groups left out", () => {
    const sides = tournamentSides(groups.slice(0, 3), [T("st1", ["g03", "g02"])]);
    expect(sides).toEqual([{ id: "g03", name: "Team 3 + Team 2", groupIds: ["g03", "g02"], superTeamId: "st1" }]);
    expect(tournamentSides(groups, [T("st1", ["g01", "g02"], "Red Dragons")])[0].name).toBe("Red Dragons");
  });

  it("orders sides by their lead group and drops a team whose groups are gone", () => {
    const sides = tournamentSides(groups, [T("b", ["g03", "g04"]), T("a", ["g01", "g02"]), T("gone", ["g99"])]);
    expect(sides.map((s) => s.id)).toEqual(["g01", "g03"]);
  });

  it("finds a group's side", () => {
    const sides = tournamentSides(groups, [T("a", ["g01", "g02"])]);
    expect(sideOfGroup(sides, "g02")?.id).toBe("g01");
    expect(sideOfGroup(sides, "g03")).toBeNull();
    expect(sideOfGroup(sides, null)).toBeNull();
  });

  it("labels an unnamed super team by its groups", () => {
    expect(superTeamLabel({ name: null, groupIds: ["g01", "g02"] }, names)).toBe("Team 1 + Team 2");
    expect(superTeamLabel({ name: "  ", groupIds: ["g01", "g02"] }, names)).toBe("Team 1 + Team 2");
  });
});

describe("sideRows (D825, D643)", () => {
  const rows = [R("s1", "g01", "a"), R("s1", "g01", "b"), R("s1", "g02", "c"), R("s1", "g02", "d"), R("s1", "g03", "e")];
  const ps = people(P("a", "g01"), P("b", "g01", "2026-11-01T00:00:00Z"), P("c", "g01"), P("d", "g03"), P("e", "g03"));

  it("is exactly countedRows with one side per group", () => {
    expect(sideRows(rows, ps, tournamentSides(groups, null))).toEqual(countedRows(rows, ps));
  });

  it("keys rows by side, keeps moves within the pair and drops the rest", () => {
    const out = sideRows(rows, ps, tournamentSides(groups, [T("a", ["g01", "g02"])]));
    // a counts; b is cancelled; c moved g02 -> g01 (same pair) and counts as the side; d moved out; e is unpaired.
    expect(out).toEqual([{ ...rows[0] }, { ...rows[2], group_id: "g01" }]);
  });
});

describe("pairProblem (D822)", () => {
  const teams = [T("st1", ["g01", "g02"])];
  it("needs two different teams", () => {
    expect(pairProblem(teams, ["g03", "g03"], null)).toBe("Pick two different teams.");
    expect(pairProblem(teams, ["g03"], null)).toBe("Pick two different teams.");
  });
  it("names a team already in another pair, but not in the one being edited", () => {
    expect(pairProblem(teams, ["g01", "g04"], null)).toEqual({ clash: "g01" });
    expect(pairProblem(teams, ["g01", "g04"], "st1")).toBeNull();
    expect(pairProblem(teams, ["g03", "g04"], null)).toBeNull();
  });
});

describe("review fixes", () => {
  it("hides the Super teams card on a drawn tournament that doesn't use them (no reset prompt)", () => {
    expect(showSuperTeamsCard({ on: false, drawn: true })).toBe(false);
    expect(showSuperTeamsCard({ on: false, drawn: false })).toBe(true);
    expect(showSuperTeamsCard({ on: true, drawn: true })).toBe(true);
  });
  it("counts a group in a tournament only when it has a pair, with super teams on (D824)", () => {
    const teams = [T("st1", ["g01", "g02"])];
    expect(inTournament({ id: "act", super_teams: true }, "g01", teams)).toBe(true);
    expect(inTournament({ id: "act", super_teams: true }, "g03", teams)).toBe(false);
    expect(inTournament({ id: "other", super_teams: true }, "g01", teams)).toBe(false);
    expect(inTournament({ id: "act", super_teams: false }, "g03", [])).toBe(true);
    expect(inTournament({ id: "act", super_teams: false }, null, [])).toBe(false);
  });
});
