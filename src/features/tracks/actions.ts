"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { flashPath } from "@/lib/flash";
import { allow } from "@/lib/ratelimit";
import { getAttendee } from "@/lib/db/attendees";
import { portalTrackContext } from "./context";
import { setTrack } from "./db";
import { intendedTrack } from "./lib";
import type { TrackRefusal } from "./types";

const REFUSED: Record<TrackRefusal, string> = {
  not_allowed: "Only your captains can change tracks.",
  not_member: "They aren't in your team.",
  closed: "Tracks can't be changed right now.",
  missing: "That track no longer exists.",
};

/**
 * D724: a captain's A | B switch on My team. Tapping the other side moves the person; tapping the
 * side they were shown on takes them off their track - as the page showed it (`intendedTrack`). The page only offers it to captains;
 * `set_challenge_track` decides (D723); a refusal is the flash, back on My stats on the day that
 * was showing.
 */
export async function setMyTeamTrackAction(slug: string, token: string, activityId: string, attendeeId: string, side: "a" | "b", shownOnSide: boolean, day: string | null) {
  const page = `/e/${slug}/a/${token}/activities/${activityId}`;
  const back = day ? `${page}?day=${day}` : page;
  if (!allow(`track:${token}`, 30, 60_000)) redirect(flashPath(back, "Too many attempts. Try again in a minute.", "error"));
  const ctx = await portalTrackContext(slug, token, activityId);
  if (!ctx) redirect(flashPath(back, REFUSED.closed, "error"));
  const target = attendeeId === ctx.attendee.id ? ctx.attendee : await getAttendee(attendeeId);
  if (!target || target.event_id !== ctx.event.id) redirect(flashPath(back, REFUSED.not_member, "error"));
  const r = await setTrack({ pairId: ctx.pair.id, attendeeId: target.id, activityId: intendedTrack(ctx.pair, side, shownOnSide), actorId: ctx.attendee.id, admin: false });
  if (r !== "ok") redirect(flashPath(back, REFUSED[r], "error"));
  // No redirect on success: a captain places ten people in a row, and a redirect would send the
  // page back to the top each time. The refreshed My team, with the person moved, is the answer.
  revalidatePath(page);
}
