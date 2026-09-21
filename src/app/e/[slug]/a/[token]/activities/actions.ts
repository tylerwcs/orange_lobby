"use server";
import { redirect } from "next/navigation";
import { loadPortalAttendee } from "@/lib/portal";
import { bookSession, getActivity, listSessions, bookingsForAttendee } from "@/lib/db/activities";
import { createRequest, withdrawRequest } from "@/lib/db/activity-requests";
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

const ASK_REFUSALS = {
  duplicate: "You already have a change waiting for approval. Withdraw it first.",
  missing: "That session is no longer on the programme.",
  notYours: "You are not booked on that session.",
  required: "This activity needs a choice. Ask to switch instead.",
} as const;

export async function requestSwitchAction(slug: string, token: string, fromSessionId: string, fd: FormData) {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const path = `/e/${slug}/a/${token}/activities`;
  if (event.status === "archived") redirect(flashPath(path, ARCHIVED, "error"));
  if (!allow(`book:${token}`, 20, 60_000)) {
    redirect(flashPath(path, "Too many attempts. Try again in a minute.", "error"));
  }

  // The target comes from the form's own select, not from a bound argument: a form action
  // receives FormData and nothing else.
  const toSessionId = String(fd.get("to") ?? "");
  const sessions = await listSessions(event.id);
  const from = sessions.find((s) => s.id === fromSessionId);
  const to = sessions.find((s) => s.id === toSessionId);
  // Both event-scoped, and both must belong to one activity — a switch across activities is
  // two decisions, not one, and the database would refuse it at approval time anyway.
  if (!from || !to || from.activity_id !== to.activity_id) {
    redirect(flashPath(path, ASK_REFUSALS.missing, "error"));
  }

  // Re-checked rather than trusted from the page: a second tab still has a live button.
  const holds = (await bookingsForAttendee(attendee.id)).some((b) => b.session_id === from.id);
  if (!holds) redirect(flashPath(path, ASK_REFUSALS.notYours, "error"));

  const result = await createRequest({
    eventId: event.id, activityId: from.activity_id, attendeeId: attendee.id,
    fromSessionId: from.id, toSessionId: to.id,
  });
  redirect(result === "ok"
    ? flashPath(path, `Asked to move to ${to.title}. The desk will confirm.`)
    : flashPath(path, ASK_REFUSALS.duplicate, "error"));
}

export async function requestCancelAction(slug: string, token: string, fromSessionId: string) {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const path = `/e/${slug}/a/${token}/activities`;
  if (event.status === "archived") redirect(flashPath(path, ARCHIVED, "error"));
  if (!allow(`book:${token}`, 20, 60_000)) {
    redirect(flashPath(path, "Too many attempts. Try again in a minute.", "error"));
  }

  const sessions = await listSessions(event.id);
  const from = sessions.find((s) => s.id === fromSessionId);
  if (!from) redirect(flashPath(path, ASK_REFUSALS.missing, "error"));

  const holds = (await bookingsForAttendee(attendee.id)).some((b) => b.session_id === from.id);
  if (!holds) redirect(flashPath(path, ASK_REFUSALS.notYours, "error"));

  // D148: a required activity's cancel never reaches the queue. The control is hidden, and
  // this is the check that makes hiding it enforcement rather than decoration.
  const activity = await getActivity(from.activity_id, event.id);
  if (!activity) redirect(flashPath(path, ASK_REFUSALS.missing, "error"));
  if (activity.required) redirect(flashPath(path, ASK_REFUSALS.required, "error"));

  const result = await createRequest({
    eventId: event.id, activityId: activity.id, attendeeId: attendee.id,
    fromSessionId: from.id, toSessionId: null,
  });
  redirect(result === "ok"
    ? flashPath(path, `Asked to cancel ${from.title}. The desk will confirm.`)
    : flashPath(path, ASK_REFUSALS.duplicate, "error"));
}

export async function withdrawRequestAction(slug: string, token: string, requestId: string) {
  const { attendee } = await loadPortalAttendee(slug, token);
  const path = `/e/${slug}/a/${token}/activities`;
  if (!allow(`book:${token}`, 20, 60_000)) {
    redirect(flashPath(path, "Too many attempts. Try again in a minute.", "error"));
  }
  // Scoped by attendee inside the query, so a posted id belonging to somebody else
  // withdraws nothing and says so.
  const gone = await withdrawRequest(requestId, attendee.id);
  redirect(gone
    ? flashPath(path, "Request withdrawn.")
    : flashPath(path, "That request is no longer waiting.", "error"));
}
