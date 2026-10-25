"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEventAccess } from "@/lib/access";
import { flashPath } from "@/lib/flash";
import { getAttendee } from "@/lib/db/attendees";
import { requireFeature } from "@/features/catalogue";
import { pairForActivity, setTrack } from "../db";
import { trackLabel } from "../lib";

/**
 * D723: the committee places anyone on a track, or takes them off, from either track's Tracks
 * tab - no captain fields, no open switch. `track` is "a", "b" or "" for no track.
 */
export async function setTrackAdminAction(eventId: string, activityId: string, attendeeId: string, fd: FormData) {
  const { ev } = await requireEventAccess(eventId);
  const list = `/admin/events/${ev.id}/activities`;
  await requireFeature(ev.id, "engagement", list);
  const back = `${list}/${activityId}?tab=tracks`;
  const pair = await pairForActivity(activityId);
  if (!pair || pair.event_id !== ev.id) redirect(flashPath(list, "Those tracks no longer exist.", "error"));
  const person = await getAttendee(attendeeId);
  if (!person || person.event_id !== ev.id) redirect(flashPath(back, "That person isn't in this event.", "error"));
  const side = String(fd.get("track") ?? "");
  const target = side === "a" ? pair.a_activity_id : side === "b" ? pair.b_activity_id : null;
  const r = await setTrack({ pairId: pair.id, attendeeId: person.id, activityId: target, actorId: null, admin: true });
  if (r !== "ok") redirect(flashPath(back, r === "not_member" ? `${person.name} needs a group, and mustn't be cancelled, to be on a track.` : "Those tracks no longer exist.", "error"));
  revalidatePath(`${list}/${pair.a_activity_id}`);
  revalidatePath(`${list}/${pair.b_activity_id}`);
  redirect(flashPath(back, target ? `${person.name} is on ${trackLabel(pair, target)}.` : `${person.name} has no track now.`));
}
