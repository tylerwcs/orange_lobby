"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { loadPortalAttendee } from "@/lib/portal";
import {
  bookSession, getActivity, listSessions, bookingsForAttendee,
  submitAnswers, type BookResult, type SubmitCode,
} from "@/lib/db/activities";
import { createRequest, withdrawRequest, requestsForAttendee } from "@/lib/db/activity-requests";
import { uploadSubmissionFile, deleteSubmissionFiles } from "@/lib/db/media";
import { validateAnswers } from "@/lib/registration";
import { nowInKL } from "@/lib/time";
import { flashPath } from "@/lib/flash";
import { sessionLabel } from "@/lib/activities";
import { allow } from "@/lib/ratelimit";

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

/**
 * Where a booking action sends the attendee back to: the activity's own page once the session
 * (or request) it acted on says which activity that is, the Activities tab before then.
 * Worked out here from rows the database returned, never taken from the form, so a posted
 * value cannot send anybody anywhere else.
 */
const listPathFor = (slug: string, token: string) => `/e/${slug}/a/${token}/activities`;
const activityPathFor = (slug: string, token: string, activityId: string) => `${listPathFor(slug, token)}/${activityId}`;

export async function bookAction(slug: string, token: string, sessionId: string) {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  let path = listPathFor(slug, token);

  // A link into an archived event still resolves - only `draft` gets the portal's "coming
  // soon" screen - so this is the only thing stopping a direct POST from reserving a seat in
  // an event that is over. Draft is deliberately NOT blocked here: organisers test draft
  // events through the portal, and `is_open` is the designed control for whether a
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
  path = activityPathFor(slug, token, session.activity_id);

  // A pending request on this activity means its meaning is no longer settled — taking a
  // second seat underneath it would hand the desk a request whose premise changed while it
  // sat in the queue. `controls.bookable` already hides Book for this case; this is what makes
  // that enforcement rather than decoration against a direct POST.
  const requests = await requestsForAttendee(attendee.id);
  const hasPending = requests.some((r) => r.activity_id === session.activity_id && r.status === "pending");
  if (hasPending) {
    redirect(flashPath(
      path,
      "You have a change waiting for approval, so you cannot book another session of this activity yet.",
      "error",
    ));
  }

  const result = await bookSession(session.id, attendee.id);
  // The bar's Activities dot lives in the portal layout, which a redirect back to this page
  // does not re-render. A booking is the one thing an attendee does that can settle a required
  // activity, so it is the one place the layout has to be told its dot may be stale.
  if (result === "ok") revalidatePath(`/e/${slug}/a/${token}`, "layout");
  redirect(result === "ok"
    ? flashPath(path, `Booked: ${sessionLabel(session)}.`)
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
  let path = listPathFor(slug, token);
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
  // two decisions, not one, and the database would refuse it at approval time anyway. A
  // self-targeting switch (to === from) is refused here too: it is not the same as a full
  // target, which we deliberately let through for approval to refuse — this one would sit in
  // the attendee's one open-request slot forever doing nothing, and block their real request
  // as a duplicate until somebody withdrew the nonsense one.
  if (!from || !to || from.activity_id !== to.activity_id || to.id === from.id) {
    redirect(flashPath(path, ASK_REFUSALS.missing, "error"));
  }
  path = activityPathFor(slug, token, from.activity_id);

  // Re-checked rather than trusted from the page: a second tab still has a live button.
  const holds = (await bookingsForAttendee(attendee.id)).some((b) => b.session_id === from.id);
  if (!holds) redirect(flashPath(path, ASK_REFUSALS.notYours, "error"));

  const result = await createRequest({
    eventId: event.id, activityId: from.activity_id, attendeeId: attendee.id,
    fromSessionId: from.id, toSessionId: to.id,
  });
  redirect(result === "ok"
    ? flashPath(path, `Asked to move to ${sessionLabel(to)}. The desk will decide.`)
    : flashPath(path, ASK_REFUSALS.duplicate, "error"));
}

export async function requestCancelAction(slug: string, token: string, fromSessionId: string) {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  let path = listPathFor(slug, token);
  if (event.status === "archived") redirect(flashPath(path, ARCHIVED, "error"));
  if (!allow(`book:${token}`, 20, 60_000)) {
    redirect(flashPath(path, "Too many attempts. Try again in a minute.", "error"));
  }

  const sessions = await listSessions(event.id);
  const from = sessions.find((s) => s.id === fromSessionId);
  if (!from) redirect(flashPath(path, ASK_REFUSALS.missing, "error"));
  path = activityPathFor(slug, token, from.activity_id);

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
    ? flashPath(path, `Asked to cancel ${sessionLabel(from)}. The desk will decide.`)
    : flashPath(path, ASK_REFUSALS.duplicate, "error"));
}

export async function withdrawRequestAction(slug: string, token: string, requestId: string) {
  const { attendee } = await loadPortalAttendee(slug, token);
  let path = listPathFor(slug, token);
  if (!allow(`book:${token}`, 20, 60_000)) {
    redirect(flashPath(path, "Too many attempts. Try again in a minute.", "error"));
  }
  // Read first only to know which activity's page to return to; the withdraw below is still
  // what decides, scoped by attendee inside the query, so a posted id belonging to somebody
  // else withdraws nothing and says so.
  const request = (await requestsForAttendee(attendee.id)).find((r) => r.id === requestId);
  if (request) path = activityPathFor(slug, token, request.activity_id);
  const gone = await withdrawRequest(requestId, attendee.id);
  redirect(gone
    ? flashPath(path, "Request withdrawn.")
    : flashPath(path, "That request is no longer waiting.", "error"));
}

/**
 * What the attendee is told for every `SubmitCode` the database can return (D167). `canSubmit`
 * draws the page and cannot return `missing` — it was handed an activity, so it always has one
 * — but `submit_answers` is asked for by id on every request and can find the activity gone by
 * the time it runs. Every code has an entry, `ok` included, so a result this action forgot to
 * think about is a compile error rather than a silently swallowed refusal.
 */
const SUBMIT_RESULT_MESSAGES: Record<SubmitCode, string> = {
  ok: "Submitted. Thanks!",
  missing: "This form is no longer available.",
  closed: "This form is closed.",
  ineligible: "This form is not open to your group.",
  limit: "You have sent all the entries this form takes.",
  today: "You have already submitted today. Come back tomorrow.",
};

/**
 * Removes files this request uploaded when the submission they belonged to did not end up
 * stored — an upload that failed alongside another that succeeded, a validation error, or a
 * `submit_answers` refusal (closed, limit, ineligible, today) reached after the upload already
 * landed. Never called with anything but paths uploaded in this same request, so a previous,
 * already-stored submission's file is never touched.
 *
 * Swallows its own failure on purpose: the attendee is already on their way to being told the
 * real outcome (their answer was rejected, or accepted), and a stray object left behind on a
 * bad day for storage is a cost, not a reason to turn that outcome into a crash instead.
 */
async function cleanupUploads(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await deleteSubmissionFiles(paths);
  } catch {
    // Left behind; see the comment above.
  }
}

/** Renamed from submitFormAction: there is no `forms` route left for it to be named after (D178). */
export async function submitAnswersAction(slug: string, token: string, activityId: string, fd: FormData) {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const listPath = `/e/${slug}/a/${token}/activities`;
  const path = `${listPath}/${activityId}`;

  // The route is reachable by anyone holding a personal link, keyed on the token, which is the
  // identity being spent, the same as `book:${token}` on the booking actions above.
  if (!allow(`form:${token}`, 20, 60_000)) {
    redirect(flashPath(path, "Too many attempts. Try again in a minute.", "error"));
  }

  // Re-loaded rather than trusted from a hidden field: the page's copy of this activity is
  // stale by definition, and a direct POST could name an activity from another event entirely.
  const activity = await getActivity(activityId, event.id);
  if (!activity) redirect(flashPath(listPath, SUBMIT_RESULT_MESSAGES.missing, "error"));

  const input: Record<string, string> = {};
  for (const q of activity.questions) {
    if (q.type === "file") continue; // a posted `file` question is a File, not a string — handled below
    input[q.key] = String(fd.get(q.key) ?? "");
  }

  // Uploaded before validateAnswers ever runs: a `file` answer stores the object path the
  // upload returns (D168), never the File itself. Run together rather than one at a time — an
  // activity with several file questions should cost the attendee one round trip, not several —
  // and with allSettled rather than Promise.all so a throw from one upload never hides that
  // another has already landed in the bucket: every path this request actually wrote is
  // tracked in `uploaded`, and anything that does not end up in a stored submission (this
  // catch, a validateAnswers rejection, or a non-`ok` submitAnswers result below) is cleaned up
  // through that list — never by activity or by attendee, which could reach a previous submission.
  const fileQuestions = activity.questions.filter((q) => q.type === "file");
  const uploads = await Promise.allSettled(
    fileQuestions.map(async (q) => {
      const file = fd.get(q.key);
      if (!(file instanceof File) || file.size === 0) return { key: q.key, path: "" };
      const objectPath = await uploadSubmissionFile({ orgId: activity.org_id, eventId: activity.event_id, formId: activity.id, file });
      return { key: q.key, path: objectPath };
    }),
  );
  const uploaded: string[] = [];
  let uploadError: string | null = null;
  for (const r of uploads) {
    if (r.status === "fulfilled") {
      input[r.value.key] = r.value.path;
      if (r.value.path) uploaded.push(r.value.path);
    } else {
      uploadError ??= (r.reason as Error).message;
    }
  }
  if (uploadError) {
    await cleanupUploads(uploaded);
    redirect(flashPath(path, uploadError, "error"));
  }

  const validated = validateAnswers(input, activity.questions);
  if (!validated.ok) {
    await cleanupUploads(uploaded);
    const first = Object.values(validated.errors)[0];
    redirect(flashPath(path, first ?? "Check your answers and try again.", "error"));
  }

  // `canSubmit` decided what the page drew; it is never consulted here. Only `submit_answers`
  // decides what is allowed, and it is asked regardless of what the stale page believed.
  const today = nowInKL().date;
  const result = await submitAnswers(activity.id, attendee.id, validated.answers, today);
  if (result !== "ok") await cleanupUploads(uploaded);
  redirect(flashPath(path, SUBMIT_RESULT_MESSAGES[result], result === "ok" ? "ok" : "error"));
}
