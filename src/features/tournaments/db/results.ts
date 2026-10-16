import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { selectAll } from "@/lib/db/select-all";
import { listSports } from "./tournaments";
import type { Match, MatchPlan, PoolGroup, Slot, SportResults } from "../lib/results";

/**
 * The results rows (D669): pools, matches and slots. Everything else is worked out from them by
 * `lib/results.ts` (D670). Writes are the organiser's only (D668), through the service client.
 */

const MATCH_COLUMNS = "id, sport_id, stage, pool, bracket, round, position, walkover_to, went_through";
const SLOT_COLUMNS = "match_id, slot, group_id, source_match_id, source_outcome, score, time_ms, dnf";

/** Every sport of a tournament with its pools, matches and slots, in the organiser's order. */
export async function loadResults(activityId: string): Promise<SportResults[]> {
  const sports = await listSports(activityId);
  if (sports.length === 0) return [];
  const ids = sports.map((s) => s.id);
  const db = serviceClient();
  const [pools, matches] = await Promise.all([
    selectAll<PoolGroup>((from, to) => db.from("tournament_pool_groups").select("sport_id, group_id, pool, forfeit, manual_place")
      .in("sport_id", ids).order("sport_id").order("group_id").range(from, to)),
    selectAll<Match>((from, to) => db.from("tournament_matches").select(MATCH_COLUMNS)
      .in("sport_id", ids).order("position").order("id").range(from, to)),
  ]);
  const slots: Slot[] = [];
  const matchIds = matches.map((m) => m.id);
  for (let i = 0; i < matchIds.length; i += 200) {
    const chunk = matchIds.slice(i, i + 200);
    slots.push(...await selectAll<Slot>((from, to) => db.from("tournament_match_slots").select(SLOT_COLUMNS)
      .in("match_id", chunk).order("match_id").order("slot").range(from, to)));
  }
  return sports.map((sport) => {
    const mine = matches.filter((m) => m.sport_id === sport.id);
    const own = new Set(mine.map((m) => m.id));
    return { sport, pools: pools.filter((p) => p.sport_id === sport.id), matches: mine, slots: slots.filter((s) => own.has(s.match_id)) };
  });
}

/** One sport's results, or null if it isn't this tournament's. */
export async function loadSportResults(activityId: string, sportId: string): Promise<SportResults | null> {
  return (await loadResults(activityId)).find((r) => r.sport.id === sportId) ?? null;
}

/** D655: the whole plan in one transaction. `has_results` once any result is in, unless forced. */
export async function writePlan(sportId: string, plan: MatchPlan, force: boolean): Promise<"ok" | "has_results" | "missing"> {
  const { data, error } = await serviceClient().rpc("set_sport_plan", { p_sport_id: sportId, p_plan: plan, p_force: force });
  if (error) throw error;
  return data as "ok" | "has_results" | "missing";
}

/** D655: Reset - no pools, no matches, and forfeits marked afresh after the next draw. */
export async function resetSport(sportId: string): Promise<void> {
  await writePlan(sportId, { pools: [], matches: [] }, true);
  const { error } = await serviceClient().from("tournament_sports").update({ forfeits_marked_at: null }).eq("id", sportId);
  if (error) throw error;
}

export async function hasMatches(sportId: string): Promise<boolean> {
  const { count, error } = await serviceClient().from("tournament_matches").select("id", { count: "exact", head: true }).eq("sport_id", sportId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** D658: a match's scores or times, and its walkover / went-through. Last save wins. */
export async function saveSlots(matchId: string, slots: Pick<Slot, "slot" | "score" | "time_ms" | "dnf">[], match: Pick<Match, "walkover_to" | "went_through">): Promise<void> {
  const db = serviceClient();
  for (const s of slots) {
    const { error } = await db.from("tournament_match_slots").update({ score: s.score, time_ms: s.time_ms, dnf: s.dnf }).eq("match_id", matchId).eq("slot", s.slot);
    if (error) throw error;
  }
  const { error } = await db.from("tournament_matches").update(match).eq("id", matchId);
  if (error) throw error;
}

/** D657: who plays in a bracket match's fixed slots. Pointer slots are never written here. */
export async function setSlotGroups(matchId: string, groups: { slot: number; group_id: string | null }[]): Promise<void> {
  const db = serviceClient();
  for (const g of groups) {
    const { error } = await db.from("tournament_match_slots").update({ group_id: g.group_id })
      .eq("match_id", matchId).eq("slot", g.slot).is("source_match_id", null);
    if (error) throw error;
  }
}

/** D660: Mark / Lift forfeit for one group in one sport. */
export async function setForfeit(sportId: string, groupIds: string[], forfeit: boolean): Promise<void> {
  if (groupIds.length === 0) return;
  const { error } = await serviceClient().from("tournament_pool_groups").update({ forfeit }).eq("sport_id", sportId).in("group_id", groupIds);
  if (error) throw error;
}

/**
 * D660: true for exactly one caller, the first to mark this sport's forfeits; every later caller
 * (and a second admin racing it) gets false and leaves the flags alone.
 */
export async function claimForfeitMarking(sportId: string): Promise<boolean> {
  const { data, error } = await serviceClient().from("tournament_sports").update({ forfeits_marked_at: new Date().toISOString() })
    .eq("id", sportId).is("forfeits_marked_at", null).select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** D665: the admin's places, a number (ties allowed) or null per group. */
export async function setManualPlaces(sportId: string, places: { group_id: string; place: number | null }[]): Promise<void> {
  const db = serviceClient();
  for (const p of places) {
    const { error } = await db.from("tournament_pool_groups").update({ manual_place: p.place }).eq("sport_id", sportId).eq("group_id", p.group_id);
    if (error) throw error;
  }
}

/** D665: a match added by hand, last; each group becomes one of the sport's players. */
export async function addManualMatch(sportId: string, round: string, groupIds: string[]): Promise<void> {
  const db = serviceClient();
  const { data: last } = await db.from("tournament_matches").select("position").eq("sport_id", sportId)
    .order("position", { ascending: false }).limit(1).maybeSingle();
  const { error: poolError } = await db.from("tournament_pool_groups")
    .upsert(groupIds.map((group_id) => ({ sport_id: sportId, group_id, pool: 0 })), { onConflict: "sport_id,group_id", ignoreDuplicates: true });
  if (poolError) throw poolError;
  const { data: match, error } = await db.from("tournament_matches")
    .insert({ sport_id: sportId, stage: "manual", round, position: (last?.position ?? -1) + 1 }).select("id").single();
  if (error) throw error;
  const { error: slotError } = await db.from("tournament_match_slots").insert(groupIds.map((group_id, slot) => ({ match_id: match.id, slot, group_id })));
  if (slotError) throw slotError;
}

/** D665: a by-hand match goes; its groups stay in the sport (their places may still stand). */
export async function deleteMatch(sportId: string, matchId: string): Promise<void> {
  const { error } = await serviceClient().from("tournament_matches").delete().eq("sport_id", sportId).eq("id", matchId).eq("stage", "manual");
  if (error) throw error;
}

/** D662: the reveal switch. */
export async function setShowOverall(activityId: string, show: boolean): Promise<void> {
  const { error } = await serviceClient().from("activities").update({ show_overall: show }).eq("id", activityId).eq("kind", "tournament");
  if (error) throw error;
}
