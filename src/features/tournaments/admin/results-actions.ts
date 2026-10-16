"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { flashPath } from "@/lib/flash";
import { listGroups } from "@/lib/db/groups";
import type { Activity, Event } from "@/lib/types";
import {
  addManualMatch, deleteMatch, loadSportResults, resetSport, saveSlots, setForfeit, setManualPlaces, setShowOverall, setSlotGroups, writePlan,
} from "../db/results";
import {
  blockedBy, drawPools, formatProblem, planPools, readResult, resolveSport, withChange, withForfeit, type MatchPlan, type SportResults,
} from "../lib/results";
import { done, formOf, tabPath, tournament } from "./guard";
import { markForfeitsIfDue } from "./forfeits";

/**
 * The organiser's results writes (D655-D665). Each lands back on the sport's Matches tab with a
 * flash. Nothing here works out a standing or a place: the pure rules do that on the next read.
 */

type Ctx = { ev: Event; cup: Activity; sr: SportResults; names: Map<string, string>; back: string };

async function sportOf(eventId: string, activityId: string, sportId: string): Promise<Ctx> {
  const { ev, cup } = await tournament(eventId, activityId);
  const [sr, groups] = await Promise.all([loadSportResults(cup.id, sportId), listGroups(ev.id)]);
  if (!sr) redirect(flashPath(tabPath(eventId, cup.id, "matches"), "That sport no longer exists.", "error"));
  return { ev, cup, sr, names: new Map(groups.map((g) => [g.id, g.name])), back: tabPath(eventId, cup.id, "matches", sportId) };
}

const fail = (back: string, message: string): never => redirect(flashPath(back, message, "error"));

/** D655: writes the pools and their matches, keeping any forfeit already set, then marks forfeits if due. */
async function savePlan(c: Ctx, pools: string[][], message: string): Promise<never> {
  const problem = formatProblem(pools.flat().length, c.sr.sport.pool_size, c.sr.sport.result_kind);
  if (problem) fail(c.back, problem);
  const plan: MatchPlan = planPools(c.sr.sport, pools, randomUUID);
  const forfeit = new Set(c.sr.pools.filter((p) => p.forfeit).map((p) => p.group_id));
  plan.pools = plan.pools.map((p) => ({ ...p, forfeit: forfeit.has(p.group_id) }));
  const r = await writePlan(c.sr.sport.id, plan, false);
  if (r === "has_results") fail(c.back, "Pools can't change once a result is in. Reset this sport's matches first.");
  if (r === "missing") fail(c.back, "That sport no longer exists.");
  const fresh = await loadSportResults(c.cup.id, c.sr.sport.id);
  if (fresh) await markForfeitsIfDue(c.cup, fresh);
  done(c.ev.id, c.cup.id, c.back, message);
}

export async function drawPoolsAction(eventId: string, activityId: string, sportId: string, fd: FormData) {
  const c = await sportOf(eventId, activityId, sportId);
  if (c.sr.sport.format !== "pools") fail(c.back, "This sport's matches are added by hand.");
  const ticked = [...new Set(fd.getAll("groups").map(String))].filter((g) => c.names.has(g));
  const problem = formatProblem(ticked.length, c.sr.sport.pool_size, c.sr.sport.result_kind);
  if (problem) fail(c.back, problem);
  await savePlan(c, drawPools(ticked, c.sr.sport.pool_size), "Pools drawn.");
}

/** D655: Edit pools - each group's pool, or "" to sit the sport out. Every pool must be full. */
export async function savePoolsAction(eventId: string, activityId: string, sportId: string, fd: FormData) {
  const c = await sportOf(eventId, activityId, sportId);
  const pools: string[][] = [];
  for (const g of c.names.keys()) {
    const v = String(fd.get(`pool:${g}`) ?? "");
    if (v === "") continue;
    const i = Number(v);
    if (!Number.isInteger(i) || i < 0 || i > 25) fail(c.back, "Pick a pool for each group, or Sits out.");
    (pools[i] ??= []).push(g);
  }
  const filled = pools.filter(Boolean);
  if (filled.length !== pools.length || filled.some((p) => p.length !== c.sr.sport.pool_size)) {
    fail(c.back, `Each pool needs ${c.sr.sport.pool_size} groups, with no pool skipped.`);
  }
  await savePlan(c, filled, "Pools saved.");
}

export async function resetSportAction(eventId: string, activityId: string, sportId: string) {
  const c = await sportOf(eventId, activityId, sportId);
  await resetSport(sportId);
  done(c.ev.id, c.cup.id, c.back, `${c.sr.sport.name} reset: no pools, no results.`);
}

/** D660: Mark / Lift forfeit for one group in this sport. */
export async function setForfeitAction(eventId: string, activityId: string, sportId: string, groupId: string, forfeit: boolean) {
  const c = await sportOf(eventId, activityId, sportId);
  if (!c.sr.pools.some((p) => p.group_id === groupId)) fail(c.back, "That group isn't playing this sport.");
  guard(c, withForfeit(c.sr, groupId, forfeit));
  await setForfeit(sportId, [groupId], forfeit);
  done(c.ev.id, c.cup.id, c.back, `${c.names.get(groupId) ?? "That group"} ${forfeit ? "marked forfeit" : "no longer forfeits"} in ${c.sr.sport.name}.`);
}

/** D658: refuses a change that would swap the teams of a match that already has a result. */
function guard(c: Ctx, after: SportResults) {
  const label = blockedBy(c.sr, after, c.names);
  if (label) fail(c.back, `Clear the ${label} result first: its teams would change.`);
}

function matchOf(c: Ctx, matchId: string) {
  const r = resolveSport(c.sr, c.names).find((x) => x.match.id === matchId);
  if (!r) fail(c.back, "That match no longer exists.");
  return r!;
}

export async function saveResultAction(eventId: string, activityId: string, sportId: string, matchId: string, fd: FormData) {
  let c = await sportOf(eventId, activityId, sportId);
  if (await markForfeitsIfDue(c.cup, c.sr)) c = await sportOf(eventId, activityId, sportId);
  const r = matchOf(c, matchId);
  if (r.entries.some((e) => !e.groupId)) fail(c.back, "Pick both teams first.");
  const read = readResult(r, c.sr.sport.result_kind, formOf(fd).text);
  if (!read.ok) fail(c.back, read.error);
  if (read.ok) {
    const change = { slots: read.slots, walkover_to: null, went_through: read.went_through };
    guard(c, withChange(c.sr, matchId, change));
    await saveSlots(matchId, read.slots, { walkover_to: null, went_through: read.went_through });
  }
  done(c.ev.id, c.cup.id, c.back, `Result saved: ${r.label}.`);
}

const blank = (c: Ctx, matchId: string) => c.sr.slots.filter((s) => s.match_id === matchId).map((s) => ({ slot: s.slot, score: null, time_ms: null, dnf: false }));

/** D658: a no-show on the day - the other group wins, no points either way. */
export async function walkoverAction(eventId: string, activityId: string, sportId: string, matchId: string, groupId: string) {
  const c = await sportOf(eventId, activityId, sportId);
  const r = matchOf(c, matchId);
  if (!r.entries.some((e) => e.groupId === groupId)) fail(c.back, "That group isn't in this match.");
  const slots = blank(c, matchId);
  guard(c, withChange(c.sr, matchId, { slots, walkover_to: groupId, went_through: null }));
  await saveSlots(matchId, slots, { walkover_to: groupId, went_through: null });
  done(c.ev.id, c.cup.id, c.back, `Walkover to ${c.names.get(groupId) ?? "that group"}: ${r.label}.`);
}

export async function clearResultAction(eventId: string, activityId: string, sportId: string, matchId: string) {
  const c = await sportOf(eventId, activityId, sportId);
  const r = matchOf(c, matchId);
  const slots = blank(c, matchId);
  guard(c, withChange(c.sr, matchId, { slots, walkover_to: null, went_through: null }));
  await saveSlots(matchId, slots, { walkover_to: null, went_through: null });
  done(c.ev.id, c.cup.id, c.back, `Result cleared: ${r.label}.`);
}

/** D657: who plays in a bracket match's own slots (a semi, a final race). Pointer slots fill themselves. */
export async function pickTeamsAction(eventId: string, activityId: string, sportId: string, matchId: string, fd: FormData) {
  const c = await sportOf(eventId, activityId, sportId);
  const r = matchOf(c, matchId);
  const playing = new Set(c.sr.pools.map((p) => p.group_id));
  const fixed = c.sr.slots.filter((s) => s.match_id === matchId && !s.source_match_id);
  const groups = fixed.map((s) => {
    const v = String(fd.get(`slot:${s.slot}`) ?? "");
    return { slot: s.slot, group_id: v && playing.has(v) ? v : null };
  });
  const picked = groups.map((g) => g.group_id).filter((g): g is string => !!g);
  if (new Set(picked).size !== picked.length) fail(c.back, "Pick different groups.");
  const elsewhere = new Map<string, string>();
  for (const x of resolveSport(c.sr, c.names)) {
    if (x.match.stage !== "bracket" || x.match.id === matchId) continue;
    for (const s of c.sr.slots) if (s.match_id === x.match.id && !s.source_match_id && s.group_id) elsewhere.set(s.group_id, x.label);
  }
  const clash = picked.find((g) => elsewhere.has(g));
  if (clash) fail(c.back, `${c.names.get(clash)} is already in ${elsewhere.get(clash)}.`);
  guard(c, withChange(c.sr, matchId, { groups }));
  await setSlotGroups(matchId, groups);
  done(c.ev.id, c.cup.id, c.back, `Teams saved: ${r.label}.`);
}

/** D665: a match added by hand - a round name, then two groups (scores) or two or more (times). */
export async function addMatchAction(eventId: string, activityId: string, sportId: string, fd: FormData) {
  const c = await sportOf(eventId, activityId, sportId);
  if (c.sr.sport.format !== "manual") fail(c.back, "This sport's matches come from its pools.");
  const round = formOf(fd).text("round");
  if (!round || round.length > 60) fail(c.back, "Name the round, in up to 60 characters.");
  const groups = [...new Set(fd.getAll("groups").map(String))].filter((g) => c.names.has(g));
  if (c.sr.sport.result_kind === "score" && groups.length !== 2) fail(c.back, "Pick two different groups.");
  if (c.sr.sport.result_kind === "time" && groups.length < 2) fail(c.back, "Pick at least two groups.");
  await addManualMatch(sportId, round, groups);
  done(c.ev.id, c.cup.id, c.back, `Match added: ${round}.`);
}

export async function deleteMatchAction(eventId: string, activityId: string, sportId: string, matchId: string) {
  const c = await sportOf(eventId, activityId, sportId);
  await deleteMatch(sportId, matchId);
  done(c.ev.id, c.cup.id, c.back, "Match deleted.");
}

/** D665: a by-hand sport's places (ties allowed) and forfeits, typed by the organiser. */
export async function savePlacesAction(eventId: string, activityId: string, sportId: string, fd: FormData) {
  const c = await sportOf(eventId, activityId, sportId);
  if (c.sr.sport.format !== "manual") fail(c.back, "This sport's places come from its brackets.");
  const rows = [...c.names.keys()].map((group_id) => {
    const v = String(fd.get(`place:${group_id}`) ?? "").trim();
    if (v && !/^\d{1,3}$/.test(v)) fail(c.back, "Places are whole numbers, from 1.");
    const place = v ? Number(v) : null;
    if (place === 0) fail(c.back, "Places are whole numbers, from 1.");
    return { group_id, place, forfeit: fd.get(`forfeit:${group_id}`) !== null };
  });
  await setManualPlaces(sportId, rows);
  done(c.ev.id, c.cup.id, c.back, "Places saved.");
}

/** D662: the reveal switch. */
export async function toggleOverallAction(eventId: string, activityId: string, show: boolean) {
  const { ev, cup } = await tournament(eventId, activityId);
  await setShowOverall(cup.id, show);
  done(ev.id, cup.id, tabPath(ev.id, cup.id, "leaderboard"), show ? "Attendees can see the overall leaderboard." : "The overall leaderboard is hidden from attendees.");
}
