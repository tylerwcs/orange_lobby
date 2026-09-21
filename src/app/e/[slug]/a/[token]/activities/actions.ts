"use server";
import { redirect } from "next/navigation";
import { loadPortalAttendee } from "@/lib/portal";
import { bookSession, switchSession, cancelBooking, getActivity, listSessions, bookingsForAttendee } from "@/lib/db/activities";
import { canCancel } from "@/lib/activities";
import { flashPath } from "@/lib/flash";
import { allow } from "@/lib/ratelimit";
import type { BookResult } from "@/lib/db/activities";

/**
 * What the attendee is told when the database refuses (D134, D140).
 *
 * Losing the race is a normal outcome and reads as one: the counts on the page were true when
 * it rendered, somebody else was faster, here is the list again with fresh numbers.
 */
const REFUSALS: Record<Exclude<BookResult, "ok">, string> = {
  full: "That session filled up while you were looking. Pick another one.",
  closed: "Booking for this activity is closed. Speak to the registration desk.",
  limit: "You already have as many sessions of this activity as you can take.",
  ineligible: "That session is not open to you.",
  missing: "That session is no longer on the programme.",
};

export async function bookAction(slug: string, token: string, sessionId: string) {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const path = `/e/${slug}/a/${token}/activities`;

  // The route is reachable by anyone holding a personal link, and a tight loop against it is
  // a denial of seats (D137). Keyed on the token, which is the identity being spent.
  if (!allow(`book:${token}`, 20, 60_000)) {
    redirect(flashPath(path, "Too many attempts. Try again in a minute.", "error"));
  }

  const sessions = await listSessions(event.id);
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) redirect(flashPath(path, REFUSALS.missing, "error"));

  const result = await bookSession(session.id, attendee.id);
  redirect(result === "ok"
    ? flashPath(path, `Booked: ${session.title}.`)
    : flashPath(path, REFUSALS[result], "error"));
}

/**
 * Moves one booking to another session of the same activity.
 *
 * Its own action rather than a cancel then a book, because a required activity with a cap of
 * one refuses the cancel (D129) and would otherwise be unchangeable — and because a target
 * that fills in between must not leave this attendee with nothing.
 */
export async function switchAction(slug: string, token: string, fromSessionId: string, toSessionId: string) {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const path = `/e/${slug}/a/${token}/activities`;
  if (!allow(`book:${token}`, 20, 60_000)) {
    redirect(flashPath(path, "Too many attempts. Try again in a minute.", "error"));
  }

  const sessions = await listSessions(event.id);
  const target = sessions.find((s) => s.id === toSessionId);
  if (!target) redirect(flashPath(path, REFUSALS.missing, "error"));

  const result = await switchSession(fromSessionId, target.id, attendee.id);
  redirect(result === "ok"
    ? flashPath(path, `Moved to ${target.title}.`)
    : flashPath(path, REFUSALS[result], "error"));
}

export async function cancelAction(slug: string, token: string, sessionId: string) {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const path = `/e/${slug}/a/${token}/activities`;
  if (!allow(`book:${token}`, 20, 60_000)) {
    redirect(flashPath(path, "Too many attempts. Try again in a minute.", "error"));
  }

  const sessions = await listSessions(event.id);
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) redirect(flashPath(path, REFUSALS.missing, "error"));

  // Re-checked here rather than trusted from the page: the button is hidden on a required
  // activity's last booking, but a second tab opened before the other one was cancelled
  // still has a live one.
  const activity = await getActivity(session.activity_id, event.id);
  if (!activity) redirect(flashPath(path, REFUSALS.missing, "error"));
  const held = (await bookingsForAttendee(attendee.id)).filter((b) => b.activity_id === activity.id).length;
  if (!canCancel(activity, held)) {
    redirect(flashPath(path, `${activity.name} needs a choice. Switch to another session instead.`, "error"));
  }

  await cancelBooking(session.id, attendee.id);
  redirect(flashPath(path, `Cancelled: ${session.title}.`));
}
