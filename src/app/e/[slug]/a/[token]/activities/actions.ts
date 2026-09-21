"use server";
import { redirect } from "next/navigation";
import { loadPortalAttendee } from "@/lib/portal";
import { bookSession, switchSession, cancelBooking, getActivity, listSessions } from "@/lib/db/activities";
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

const ARCHIVED = "This event is archived, so booking is closed.";

export async function bookAction(slug: string, token: string, sessionId: string) {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const path = `/e/${slug}/a/${token}/activities`;

  // A link into an archived event still resolves - only `draft` gets the portal's "coming
  // soon" screen - so this is the only thing stopping a direct POST from reserving a seat in
  // an event that is over. Draft is deliberately NOT blocked here: organisers test draft
  // events through the portal, and `booking_open` is the designed control for whether a
  // *live* event's activity accepts bookings yet.
  if (event.status === "archived") redirect(flashPath(path, ARCHIVED, "error"));

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
  if (event.status === "archived") redirect(flashPath(path, ARCHIVED, "error"));
  if (!allow(`book:${token}`, 20, 60_000)) {
    redirect(flashPath(path, "Too many attempts. Try again in a minute.", "error"));
  }

  const sessions = await listSessions(event.id);
  // Both ends are posted values and neither is trusted at face value: `switch_session` closes
  // the hole either way (it refuses a `fromSessionId` this attendee does not hold), but that
  // makes this file's safety depend on a guarantee two files away rather than checking the
  // session list it already has in hand.
  const source = sessions.find((s) => s.id === fromSessionId);
  if (!source) redirect(flashPath(path, REFUSALS.missing, "error"));
  const target = sessions.find((s) => s.id === toSessionId);
  if (!target) redirect(flashPath(path, REFUSALS.missing, "error"));

  const result = await switchSession(source.id, target.id, attendee.id);
  redirect(result === "ok"
    ? flashPath(path, `Moved to ${target.title}.`)
    : flashPath(path, REFUSALS[result], "error"));
}

// Deliberately no archived-event guard here, unlike bookAction and switchAction: cancelling
// releases a commitment rather than creating one, and trapping somebody in a booking they
// cannot leave once an event is archived is the worse failure.
export async function cancelAction(slug: string, token: string, sessionId: string) {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const path = `/e/${slug}/a/${token}/activities`;
  if (!allow(`book:${token}`, 20, 60_000)) {
    redirect(flashPath(path, "Too many attempts. Try again in a minute.", "error"));
  }

  const sessions = await listSessions(event.id);
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) redirect(flashPath(path, REFUSALS.missing, "error"));

  // `cancel_booking` is the enforcement (D129, under the same row lock `book_session` and
  // `switch_session` use, so the read of "how many does this attendee hold" and the delete
  // cannot be pulled apart by two overlapping requests). `canCancel` in ActivityList only
  // decides whether to show the button - the affordance, not the guarantee - so a stale
  // second tab with a live Cancel button still gets re-checked here, in the database, not in
  // this file.
  const result = await cancelBooking(session.id, attendee.id);
  if (result === "ok") redirect(flashPath(path, `Cancelled: ${session.title}.`));
  if (result === "missing") {
    // A stale second tab re-cancelling a booking the first tab already cancelled, or a posted
    // session id this attendee never held - either way nothing happened, and saying so beats
    // claiming a cancellation that did not occur.
    redirect(flashPath(path, "You were not booked on that session.", "error"));
  }

  // result === "required": fetched only to name the activity in the message, never to decide
  // anything - the decision already happened inside cancel_booking.
  const activity = await getActivity(session.activity_id, event.id);
  redirect(flashPath(
    path,
    `${activity?.name ?? "That activity"} needs a choice. Switch to another session instead.`,
    "error",
  ));
}
