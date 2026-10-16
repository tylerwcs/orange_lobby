"use server";
import { redirect } from "next/navigation";
import { flashPath } from "@/lib/flash";
import { getAttendee } from "@/lib/db/attendees";
import type { Activity } from "@/lib/types";
import { done, formOf, tabPath, tournament } from "./guard";
import { hasMatches } from "../db/results";
import { addSquadMember, createSport, deleteSport, listSports, moveSport, removeSquadMember, updateSport } from "../db/tournaments";
import { readSport } from "../lib/sports";
import { nameInEvent, refusalFlash, type TournamentSport } from "../lib/squads";

/**
 * The organiser's sport and squad writes (D638, D648). Every one is guarded like the activities'
 * own actions - event access, then the engagement add-on - and lands back on its tab with a flash.
 * Squad writes go through the same checked functions as the portal's, as the admin (D642).
 */



function readOrBack(fd: FormData, back: string) {
  try {
    return readSport(formOf(fd));
  } catch (e) {
    redirect(flashPath(back, (e as Error).message, "error"));
  }
}

export async function addSportAction(eventId: string, activityId: string, fd: FormData) {
  const { cup } = await tournament(eventId, activityId);
  const back = tabPath(eventId, cup.id, "sports");
  const sport = readOrBack(fd, back);
  if ((await createSport(cup.id, sport)) === "duplicate") redirect(flashPath(back, `There's already a sport called ${sport.name}.`, "error"));
  done(eventId, cup.id, back, "Sport added.");
}

export async function saveSportAction(eventId: string, activityId: string, sportId: string, fd: FormData) {
  const { cup } = await tournament(eventId, activityId);
  const back = tabPath(eventId, cup.id, "sports");
  const sport = readOrBack(fd, back);
  // D653: a sport with matches keeps its results settings until they're reset.
  const was = (await listSports(cup.id)).find((s) => s.id === sportId);
  const changed = !!was && (was.result_kind !== sport.result_kind || was.format !== sport.format || was.pool_size !== sport.pool_size);
  if (changed && (await hasMatches(sportId))) redirect(flashPath(back, "Reset this sport's matches to change its format.", "error"));
  if ((await updateSport(cup.id, sportId, sport)) === "duplicate") redirect(flashPath(back, `There's already a sport called ${sport.name}.`, "error"));
  done(eventId, cup.id, back, "Sport saved.");
}

export async function moveSportAction(eventId: string, activityId: string, sportId: string, dir: "up" | "down") {
  const { cup } = await tournament(eventId, activityId);
  await moveSport(cup.id, sportId, dir);
  done(eventId, cup.id, tabPath(eventId, cup.id, "sports"), "Sport moved.");
}

export async function deleteSportAction(eventId: string, activityId: string, sportId: string) {
  const { cup } = await tournament(eventId, activityId);
  await deleteSport(cup.id, sportId);
  done(eventId, cup.id, tabPath(eventId, cup.id, "sports"), "Sport deleted.");
}

/** The sport a posted id names in this tournament, or a flash back to Squads. */
async function sportOf(cup: Activity, eventId: string, sportId: string): Promise<TournamentSport> {
  const sport = (await listSports(cup.id)).find((s) => s.id === sportId);
  if (!sport) redirect(flashPath(tabPath(eventId, cup.id, "squads"), refusalFlash("missing", { sport: "" }), "error"));
  return sport;
}

/** Only this event's attendee is named: a posted id from another event gets "They" (review #3). */
async function nameOf(eventId: string, attendeeId: string): Promise<string> {
  return nameInEvent(await getAttendee(attendeeId), eventId);
}

/** D648: an organiser may add after the deadline and over max; only the group and category still apply. */
export async function adminAddPlayerAction(eventId: string, activityId: string, sportId: string, fd: FormData) {
  const { cup } = await tournament(eventId, activityId);
  const sport = await sportOf(cup, eventId, sportId);
  const back = tabPath(eventId, cup.id, "squads", sport.id);
  const attendeeId = String(fd.get("attendee") ?? "");
  if (!attendeeId) redirect(flashPath(back, "Pick someone to add.", "error"));
  const name = await nameOf(eventId, attendeeId);
  const r = await addSquadMember({ sportId: sport.id, attendeeId, actorId: null, admin: true });
  if (r !== "ok") redirect(flashPath(back, refusalFlash(r, { sport: sport.name, name }), "error"));
  done(eventId, cup.id, back, `${name} added to ${sport.name}.`);
}

export async function adminRemovePlayerAction(eventId: string, activityId: string, sportId: string, attendeeId: string) {
  const { cup } = await tournament(eventId, activityId);
  const sport = await sportOf(cup, eventId, sportId);
  const back = tabPath(eventId, cup.id, "squads", sport.id);
  const name = await nameOf(eventId, attendeeId);
  const r = await removeSquadMember({ sportId: sport.id, attendeeId, actorId: null, admin: true });
  if (r !== "ok") redirect(flashPath(back, refusalFlash(r, { sport: sport.name, name }), "error"));
  done(eventId, cup.id, back, `${name} removed from ${sport.name}.`);
}

/** Remove, then add; if the add is refused, the one taken out goes back in. */
export async function adminSwapPlayerAction(eventId: string, activityId: string, sportId: string, outId: string, fd: FormData) {
  const { cup } = await tournament(eventId, activityId);
  const sport = await sportOf(cup, eventId, sportId);
  const back = tabPath(eventId, cup.id, "squads", sport.id);
  const inId = String(fd.get("attendee") ?? "");
  if (!inId) redirect(flashPath(back, "Pick someone to swap in.", "error"));
  const [outName, inName] = await Promise.all([nameOf(eventId, outId), nameOf(eventId, inId)]);
  const out = await removeSquadMember({ sportId: sport.id, attendeeId: outId, actorId: null, admin: true });
  if (out !== "ok") redirect(flashPath(back, refusalFlash(out, { sport: sport.name, name: outName }), "error"));
  const r = await addSquadMember({ sportId: sport.id, attendeeId: inId, actorId: null, admin: true });
  if (r !== "ok") {
    await addSquadMember({ sportId: sport.id, attendeeId: outId, actorId: null, admin: true });
    redirect(flashPath(back, refusalFlash(r, { sport: sport.name, name: inName }), "error"));
  }
  done(eventId, cup.id, back, `Swapped ${outName} for ${inName}.`);
}
