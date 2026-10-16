"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEventAccess } from "@/lib/access";
import { flashPath } from "@/lib/flash";
import { getAttendee } from "@/lib/db/attendees";
import { requireFeature } from "@/features/catalogue";
import type { Activity, Event } from "@/lib/types";
import { addSquadMember, createSport, deleteSport, getTournamentActivity, listSports, moveSport, removeSquadMember, updateSport } from "../db/tournaments";
import { readSport } from "../lib/sports";
import { nameInEvent, refusalFlash, type TournamentSport } from "../lib/squads";

/**
 * The organiser's sport and squad writes (D638, D648). Every one is guarded like the activities'
 * own actions - event access, then the engagement add-on - and lands back on its tab with a flash.
 * Squad writes go through the same checked functions as the portal's, as the admin (D642).
 */

const tabPath = (eventId: string, activityId: string, tab: "sports" | "squads", sportId?: string) => {
  const qs = new URLSearchParams({ tab });
  if (sportId) qs.set("sport", sportId);
  return `/admin/events/${eventId}/activities/${activityId}?${qs}`;
};

async function tournament(eventId: string, activityId: string): Promise<{ ev: Event; cup: Activity }> {
  const { ev } = await requireEventAccess(eventId);
  const list = `/admin/events/${eventId}/activities`;
  await requireFeature(ev.id, "engagement", list);
  const cup = await getTournamentActivity(activityId, ev.id);
  if (!cup) redirect(flashPath(list, "That tournament no longer exists.", "error"));
  return { ev, cup };
}

const formOf = (fd: FormData) => ({
  text: (k: string) => String(fd.get(k) ?? "").trim(),
  checked: (k: string) => fd.get(k) !== null,
});

function done(eventId: string, activityId: string, back: string, message: string, tone?: "error"): never {
  revalidatePath(`/admin/events/${eventId}/activities`);
  revalidatePath(`/admin/events/${eventId}/activities/${activityId}`);
  redirect(flashPath(back, message, tone));
}

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
