"use server";
import { redirect } from "next/navigation";
import { flashPath } from "@/lib/flash";
import { loadSportResults, saveLaneScores, swapLaneBowler, writeLaneDraw } from "../db/results";
import { addSquadMember, removeSquadMember, squadPeople, squadRows } from "../db/tournaments";
import { loadSides } from "../db/super-teams";
import { canSwapIn, drawLanes } from "../lib/lanes";
import { sideRows } from "../lib/sides";
import { nameInEvent, refusalFlash, squadMembers } from "../lib/squads";
import { done, tabPath, tournament } from "./guard";
import { markForfeitsIfDue } from "./forfeits";

/**
 * D861-D865: the organiser's lane-draw writes - draw, key a game's scores, swap a bowler. Each
 * lands back on the sport's Matches tab with a flash; totals and places are worked out on read.
 */

const fail = (back: string, message: string): never => redirect(flashPath(back, message, "error"));

async function laneSport(eventId: string, activityId: string, sportId: string) {
  const { ev, cup } = await tournament(eventId, activityId);
  const back = tabPath(eventId, cup.id, "matches", sportId);
  const [sr, { sides }] = await Promise.all([loadSportResults(cup.id, sportId), loadSides(cup)]);
  if (!sr) fail(back, "That sport no longer exists.");
  if (sr!.sport.format !== "lanes") fail(back, "This sport isn't a lane draw.");
  return { ev, cup, back, sr: sr!, sides };
}

/** D861-D863: the ticked sides' counted squad players, seated for every game. Refused once a score is in. */
export async function drawLanesAction(eventId: string, activityId: string, sportId: string, fd: FormData) {
  const { ev, cup, back, sr, sides } = await laneSport(eventId, activityId, sportId);
  const ticked = fd.getAll("groups").map(String).filter((id) => sides.some((s) => s.id === id));
  if (ticked.length === 0) fail(back, "Tick at least one squad to draw.");
  const rows = await squadRows(cup.id);
  const counted = sideRows(rows, await squadPeople(ev.id, rows.map((r) => r.attendee_id)), sides);
  const bowling = ticked.map((id) => ({ id, bowlers: squadMembers(counted, sportId, id) }));
  if (bowling.every((b) => b.bowlers.length === 0)) fail(back, "Nobody is in those squads yet.");
  const seats = drawLanes(bowling, sr.sport.lane_count, sr.sport.games).map((s) => ({ ...s, sport_id: sportId }));
  const forfeit = new Set(sr.pools.filter((p) => p.forfeit).map((p) => p.group_id));
  const r = await writeLaneDraw(sportId, ticked.map((group_id) => ({ group_id, forfeit: forfeit.has(group_id) })), seats, false);
  if (r === "has_scores") fail(back, "The lanes can't change once a score is in. Reset this sport's results first.");
  if (r === "missing") fail(back, "That sport no longer exists.");
  const fresh = await loadSportResults(cup.id, sportId);
  if (fresh) await markForfeitsIfDue(cup, fresh);
  done(ev.id, cup.id, back, "Lanes drawn.");
}

/** D865: one game's scores, whole numbers 0-300; a blank box is not keyed yet. */
export async function saveLaneGameAction(eventId: string, activityId: string, sportId: string, game: number, fd: FormData) {
  const { ev, cup, back, sr } = await laneSport(eventId, activityId, sportId);
  const seats = (sr.seats ?? []).filter((s) => s.game === game);
  if (seats.length === 0) fail(back, "That game has no lanes drawn.");
  const scores = seats.map((s) => {
    const text = String(fd.get(`score:${s.lane}:${s.seat}`) ?? "").trim();
    if (text === "") return { lane: s.lane, seat: s.seat, score: null };
    const n = Number(text);
    if (!/^\d{1,3}$/.test(text) || n > 300) fail(back, "Scores are whole numbers from 0 to 300.");
    return { lane: s.lane, seat: s.seat, score: n };
  });
  await saveLaneScores(sportId, game, scores);
  done(ev.id, cup.id, back, `Game ${game} saved.`);
}

/**
 * D864: another member of the same side takes every seat of a bowler, scores and all, and their
 * squad place too, so the squads, the bonus and the 2-sports count follow who bowled.
 */
export async function swapBowlerAction(eventId: string, activityId: string, sportId: string, outId: string, fd: FormData) {
  const { ev, cup, back, sr, sides } = await laneSport(eventId, activityId, sportId);
  const inId = String(fd.get("attendee") ?? "");
  if (!inId) fail(back, "Pick someone to swap in.");
  const seats = sr.seats ?? [];
  const seat = seats.find((s) => s.attendee_id === outId);
  if (!seat) fail(back, "They aren't bowling in this sport.");
  if (!canSwapIn(seats, sportId, inId)) fail(back, "They're already bowling.");
  const side = sides.find((s) => s.id === seat!.group_id);
  const people = await squadPeople(ev.id, [outId, inId]);
  const incoming = people.get(inId);
  if (!side || !incoming || incoming.cancelled_at !== null || !incoming.group_id || !side.groupIds.includes(incoming.group_id)) {
    fail(back, `They're not in ${side?.name ?? "that squad"}.`);
  }
  const outName = nameInEvent(people.get(outId) ? { name: people.get(outId)!.name, event_id: ev.id } : null, ev.id);
  const inName = incoming!.name;
  const inSquad = (await squadRows(cup.id)).some((r) => r.sport_id === sportId && r.attendee_id === outId);
  if (inSquad) {
    const out = await removeSquadMember({ sportId, attendeeId: outId, actorId: null, admin: true });
    if (out !== "ok") fail(back, refusalFlash(out, { sport: sr.sport.name, name: outName }));
  }
  const add = await addSquadMember({ sportId, attendeeId: inId, actorId: null, admin: true });
  if (add !== "ok") {
    if (inSquad) await addSquadMember({ sportId, attendeeId: outId, actorId: null, admin: true });
    fail(back, refusalFlash(add, { sport: sr.sport.name, name: inName }));
  }
  await swapLaneBowler(sportId, outId, inId);
  done(ev.id, cup.id, back, `Swapped ${outName} for ${inName}.`);
}
