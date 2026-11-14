"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { flashPath } from "@/lib/flash";
import { allow } from "@/lib/ratelimit";
import { getAttendee } from "@/lib/db/attendees";
import { portalTrackContext } from "./context";
import { moveTrack, setSkipDay } from "./db";
import { intendedTrack, trackLabel } from "./lib";
import { shortDate } from "@/lib/text";
import { nowInKL } from "@/lib/time";
import type { SkipRefusal, TrackRefusal } from "./types";

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
  const r = await moveTrack({ pair: ctx.pair, orgId: ctx.attendee.org_id, attendeeId: target.id, activityId: intendedTrack(ctx.pair, side, shownOnSide), actorId: ctx.attendee.id, admin: false });
  if (r !== "ok") redirect(flashPath(back, REFUSED[r], "error"));
  // No redirect on success: a captain places ten people in a row, and a redirect would send the
  // page back to the top each time. The refreshed My team, with the person moved, is the answer.
  revalidatePath(page);
}

/**
 * D904: a member picks their own track - or moves to the other one - from either track's page.
 * The move removes what they logged today on the track they leave (D726); the page asks first.
 * Success lands on the picked track's page, where their Add button now is.
 */
export async function pickMyTrackAction(slug: string, token: string, activityId: string, side: "a" | "b") {
  const page = `/e/${slug}/a/${token}/activities/${activityId}`;
  if (!allow(`track:${token}`, 30, 60_000)) redirect(flashPath(page, "Too many attempts. Try again in a minute.", "error"));
  const ctx = await portalTrackContext(slug, token, activityId);
  if (!ctx) redirect(flashPath(page, REFUSED.closed, "error"));
  const target = side === "a" ? ctx.pair.a_activity_id : ctx.pair.b_activity_id;
  const r = await moveTrack({ pair: ctx.pair, orgId: ctx.attendee.org_id, attendeeId: ctx.attendee.id, activityId: target, actorId: ctx.attendee.id, admin: false });
  if (r !== "ok") redirect(flashPath(page, REFUSED[r], "error"));
  revalidatePath(`/e/${slug}/a/${token}/activities/${ctx.pair.a_activity_id}`);
  revalidatePath(`/e/${slug}/a/${token}/activities/${ctx.pair.b_activity_id}`);
  redirect(flashPath(`/e/${slug}/a/${token}/activities/${target}`, `You're on ${trackLabel(ctx.pair, target)} now.`));
}

const SKIP_REFUSED: Record<SkipRefusal, string> = {
  missing: "That challenge no longer exists.",
  off: "Days off aren't part of this challenge.",
  not_member: "You need to be in a team to take a day off.",
  closed: "Days off can't be changed right now.",
  past: "That day is over, so it can't be changed.",
  outside: "That day isn't part of the challenge.",
  used: "You've used your days off for that week.",
};

/** D906: take the shown day off (`skip`), or take it back. `set_skip_day` decides; the answer is the flash, on the same day. */
export async function setSkipDayAction(slug: string, token: string, activityId: string, day: string, skip: boolean) {
  const page = `/e/${slug}/a/${token}/activities/${activityId}`;
  const today = nowInKL().date;
  const back = day === today ? page : `${page}?day=${day}`;
  if (!allow(`skip:${token}`, 20, 60_000)) redirect(flashPath(back, "Too many attempts. Try again in a minute.", "error"));
  const ctx = await portalTrackContext(slug, token, activityId);
  if (!ctx) redirect(flashPath(back, SKIP_REFUSED.closed, "error"));
  const r = await setSkipDay({ pairId: ctx.pair.id, attendeeId: ctx.attendee.id, day, skip });
  if (r !== "ok") redirect(flashPath(back, SKIP_REFUSED[r], "error"));
  revalidatePath(`/e/${slug}/a/${token}/activities/${ctx.pair.a_activity_id}`);
  revalidatePath(`/e/${slug}/a/${token}/activities/${ctx.pair.b_activity_id}`);
  const when = day === today ? "Today" : shortDate(day);
  redirect(flashPath(back, skip ? `${when} is your day off.` : `${when} is a normal day again.`));
}
