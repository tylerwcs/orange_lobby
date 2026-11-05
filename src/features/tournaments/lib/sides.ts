import type { SquadPerson, SquadRow } from "./squads";

/**
 * D821-D825: who a tournament plays with. A side is a group on its own (every tournament without
 * super teams) or a super team of two groups. A super team's side id is its lead group's id
 * (position 0), so pools, match slots and places keep storing a group id and the results rules
 * don't change. Squad rows keep each player's own group; `sideRows` keys them by side.
 */

/** A saved pair, its groups lead first (position 0, then 1). */
export type SuperTeam = { id: string; activity_id: string; name: string | null; groupIds: string[] };

/** What a tournament plays with: a group on its own, or a super team (id = its lead group's id). */
export type Side = { id: string; name: string; groupIds: string[]; superTeamId: string | null };

/** D822: the admin's name, or "Team 02 + Team 03" in lead-first order. */
export function superTeamLabel(team: Pick<SuperTeam, "name" | "groupIds">, groupNames: Map<string, string>): string {
  const own = team.name?.trim();
  if (own) return own;
  return team.groupIds.map((g) => groupNames.get(g) ?? "A team").join(" + ");
}

/**
 * The tournament's sides, in group order. `teams` null (the switch off): one per group. Otherwise
 * one per super team whose lead still exists, ordered by the lead; a group in no pair is out (D824).
 */
export function tournamentSides(groups: { id: string; name: string }[], teams: SuperTeam[] | null): Side[] {
  if (teams === null) return groups.map((g) => ({ id: g.id, name: g.name, groupIds: [g.id], superTeamId: null }));
  const index = new Map(groups.map((g, i) => [g.id, i]));
  const names = new Map(groups.map((g) => [g.id, g.name]));
  return teams
    .map((t) => ({ t, groupIds: t.groupIds.filter((g) => index.has(g)) }))
    .filter(({ groupIds }) => groupIds.length > 0)
    .sort((a, b) => index.get(a.groupIds[0])! - index.get(b.groupIds[0])!)
    .map(({ t, groupIds }) => ({ id: groupIds[0], name: superTeamLabel({ name: t.name, groupIds }, names), groupIds, superTeamId: t.id }));
}

export function sideOfGroup(sides: Side[], groupId: string | null): Side | null {
  if (!groupId) return null;
  return sides.find((s) => s.groupIds.includes(groupId)) ?? null;
}

/**
 * D643 + D825: the rows that count, keyed by side. A row counts while its person is registered and
 * still in the same side as the row's group (a move between the paired teams keeps them). With one
 * side per group this is exactly `countedRows`.
 */
export function sideRows(rows: SquadRow[], people: Map<string, SquadPerson>, sides: Side[]): SquadRow[] {
  const sideOf = new Map(sides.flatMap((s) => s.groupIds.map((g) => [g, s.id] as const)));
  return rows.flatMap((r) => {
    const p = people.get(r.attendee_id);
    const side = sideOf.get(r.group_id);
    if (!p || p.cancelled_at !== null || !side || !p.group_id || sideOf.get(p.group_id) !== side) return [];
    return [side === r.group_id ? r : { ...r, group_id: side }];
  });
}

/** D822: why these groups can't be a pair - not two different teams, or one already in another pair. */
export function pairProblem(teams: SuperTeam[], groupIds: string[], editingId: string | null): string | { clash: string } | null {
  if (groupIds.length !== 2 || groupIds[0] === groupIds[1] || groupIds.some((g) => !g)) return "Pick two different teams.";
  const taken = new Set(teams.filter((t) => t.id !== editingId).flatMap((t) => t.groupIds));
  const clash = groupIds.find((g) => taken.has(g));
  return clash ? { clash } : null;
}

/**
 * Review fix: the Super teams card shows unless the tournament is drawn and doesn't use them -
 * there it would only tell an admin to reset results for nothing (the Rally Cup).
 */
export function showSuperTeamsCard(input: { on: boolean; drawn: boolean }): boolean {
  return input.on || !input.drawn;
}

/** D824: whether this group takes part - any group with the switch off, only a paired one with it on. */
export function inTournament(activity: { id: string; super_teams?: boolean | null }, groupId: string | null, teams: SuperTeam[]): boolean {
  if (!groupId) return false;
  if (!activity.super_teams) return true;
  return teams.some((t) => t.activity_id === activity.id && t.groupIds.includes(groupId));
}
