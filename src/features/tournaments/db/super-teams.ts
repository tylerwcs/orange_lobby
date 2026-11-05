import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { selectAll } from "@/lib/db/select-all";
import { listGroups } from "@/lib/db/groups";
import type { Activity, EventGroup } from "@/lib/types";
import { tournamentSides, type Side, type SuperTeam } from "../lib/sides";

/** D822: a tournament's pairs (migration 0126). Writes are the organiser's only, through the service client. */

type GroupRow = { super_team_id: string; activity_id: string; group_id: string; position: number };
type TeamRow = { id: string; activity_id: string; name: string | null; created_at: string };

function assemble(teams: TeamRow[], groups: GroupRow[]): SuperTeam[] {
  return teams.map((t) => ({
    id: t.id, activity_id: t.activity_id, name: t.name,
    groupIds: groups.filter((g) => g.super_team_id === t.id).sort((a, b) => a.position - b.position).map((g) => g.group_id),
  }));
}

export async function listSuperTeamsFor(activityIds: string[]): Promise<SuperTeam[]> {
  if (activityIds.length === 0) return [];
  const db = serviceClient();
  const [teams, groups] = await Promise.all([
    selectAll<TeamRow>((from, to) => db.from("tournament_super_teams").select("id, activity_id, name, created_at")
      .in("activity_id", activityIds).order("created_at").order("id").range(from, to)),
    selectAll<GroupRow>((from, to) => db.from("tournament_super_team_groups").select("super_team_id, activity_id, group_id, position")
      .in("activity_id", activityIds).order("activity_id").order("group_id").range(from, to)),
  ]);
  return assemble(teams, groups);
}

/** One tournament's pairs, each with its groups lead first. */
export async function listSuperTeams(activityId: string): Promise<SuperTeam[]> {
  return listSuperTeamsFor([activityId]);
}

/** The tournament's groups and its sides (D821): one per group with the switch off, one per pair with it on. */
export async function loadSides(activity: Pick<Activity, "id" | "event_id" | "super_teams">, groups?: EventGroup[]): Promise<{ groups: EventGroup[]; sides: Side[] }> {
  const [all, teams] = await Promise.all([
    groups ? Promise.resolve(groups) : listGroups(activity.event_id),
    activity.super_teams ? listSuperTeams(activity.id) : Promise.resolve(null),
  ]);
  return { groups: all, sides: tournamentSides(all, teams) };
}

/** D821/D823: whether any of the tournament's sports has pools or matches - then pairs and the switch are fixed. */
export async function anyDrawn(activityId: string): Promise<boolean> {
  const db = serviceClient();
  const { data: sports, error } = await db.from("tournament_sports").select("id").eq("activity_id", activityId);
  if (error) throw error;
  const ids = (sports ?? []).map((s) => s.id as string);
  if (ids.length === 0) return false;
  const [pools, matches] = await Promise.all([
    db.from("tournament_pool_groups").select("sport_id", { count: "exact", head: true }).in("sport_id", ids),
    db.from("tournament_matches").select("id", { count: "exact", head: true }).in("sport_id", ids),
  ]);
  if (pools.error) throw pools.error;
  if (matches.error) throw matches.error;
  return (pools.count ?? 0) + (matches.count ?? 0) > 0;
}

export async function setSuperTeamsOn(activityId: string, on: boolean): Promise<void> {
  const { error } = await serviceClient().from("activities").update({ super_teams: on }).eq("id", activityId).eq("kind", "tournament");
  if (error) throw error;
}

/**
 * D822: adds or edits a pair. The lead (position 0) is whichever group comes first in group order,
 * so an unnamed pair reads as the admin's group list does. `taken` when a group is already in another pair.
 */
export async function saveSuperTeam(
  activity: Pick<Activity, "id" | "event_id">,
  input: { id: string | null; name: string | null; groupIds: [string, string] },
): Promise<"ok" | "taken"> {
  const db = serviceClient();
  const order = new Map((await listGroups(activity.event_id)).map((g, i) => [g.id, i]));
  const [lead, other] = [...input.groupIds].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  let teamId = input.id;
  let previous: GroupRow[] = [];
  if (teamId) {
    const { data: old, error: read } = await db.from("tournament_super_team_groups").select("super_team_id, activity_id, group_id, position").eq("super_team_id", teamId);
    if (read) throw read;
    previous = (old ?? []) as GroupRow[];
    const { error } = await db.from("tournament_super_teams").update({ name: input.name }).eq("id", teamId).eq("activity_id", activity.id);
    if (error) throw error;
    const { error: clear } = await db.from("tournament_super_team_groups").delete().eq("super_team_id", teamId);
    if (clear) throw clear;
  } else {
    const { data, error } = await db.from("tournament_super_teams").insert({ activity_id: activity.id, name: input.name }).select("id").single();
    if (error) throw error;
    teamId = data.id as string;
  }
  const { error } = await db.from("tournament_super_team_groups").insert([
    { super_team_id: teamId, activity_id: activity.id, group_id: lead, position: 0 },
    { super_team_id: teamId, activity_id: activity.id, group_id: other, position: 1 },
  ]);
  if (error?.code === "23505") {
    // Another admin took a group meanwhile: a new pair goes again; an edited one gets its old groups back.
    if (!input.id) await db.from("tournament_super_teams").delete().eq("id", teamId);
    else if (previous.length) await db.from("tournament_super_team_groups").insert(previous);
    return "taken";
  }
  if (error) throw error;
  return "ok";
}

/** A pair goes; its squad rows stay, each with its player's own group (D825). */
export async function deleteSuperTeam(activityId: string, superTeamId: string): Promise<void> {
  const { error } = await serviceClient().from("tournament_super_teams").delete().eq("activity_id", activityId).eq("id", superTeamId);
  if (error) throw error;
}
