"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { flashPath } from "@/lib/flash";
import { allow } from "@/lib/ratelimit";
import { getAttendee } from "@/lib/db/attendees";
import { portalTrackContext } from "./context";
import { setTrack, trackRows } from "./db";
import { trackLabel, trackOf } from "./lib";
import type { TrackRefusal } from "./types";

const REFUSED: Record<TrackRefusal, string> = {
  not_allowed: "Only your captains can change tracks.",
  not_member: "They aren't in your team.",
  closed: "Tracks can't be changed right now.",
  missing: "That track no longer exists.",
};

/**
 * D724: a captain's A | B switch on My team. Tapping the other side moves the person; tapping the
 * side they are already on takes them off their track. The page only offers it to captains;
 * `set_challenge_track` decides (D723), and its answer is the flash. Lands back on My stats, on
 * the day that was showing.
 */
export async function setMyTeamTrackAction(slug: string, token: string, activityId: string, attendeeId: string, side: "a" | "b", day: string | null) {
  const page = `/e/${slug}/a/${token}/activities/${activityId}`;
  const back = day ? `${page}?day=${day}` : page;
  if (!allow(`track:${token}`, 30, 60_000)) redirect(flashPath(back, "Too many attempts. Try again in a minute.", "error"));
  const ctx = await portalTrackContext(slug, token, activityId);
  if (!ctx) redirect(flashPath(back, REFUSED.closed, "error"));
  const target = attendeeId === ctx.attendee.id ? ctx.attendee : await getAttendee(attendeeId);
  if (!target || target.event_id !== ctx.event.id) redirect(flashPath(back, REFUSED.not_member, "error"));
  const wanted = side === "a" ? ctx.pair.a_activity_id : ctx.pair.b_activity_id;
  const current = trackOf(await trackRows(ctx.pair.id), target);
  const off = current === wanted;
  const r = await setTrack({ pairId: ctx.pair.id, attendeeId: target.id, activityId: off ? null : wanted, actorId: ctx.attendee.id, admin: false });
  if (r !== "ok") redirect(flashPath(back, REFUSED[r], "error"));
  revalidatePath(page);
  const label = trackLabel(ctx.pair, wanted);
  const self = target.id === ctx.attendee.id;
  const who = self ? "You're" : `${target.name} is`;
  redirect(flashPath(back, `${who} ${off ? "off" : "on"} ${label}.`));
}
