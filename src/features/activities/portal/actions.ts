"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { loadPortalAttendee, isDraftPreview } from "@/lib/portal";
import {
  bookSession, bookWithAnswers, switchSession, cancelBooking, getActivity, listSessions, bookingsForAttendee,
  submitAnswers, submitAnswersPair, pairPartnerIds, getSubmission, updateOwnSubmissionAnswers, deleteOwnSubmission, entriesForAttendee, type SubmitCode,
} from "../db/activities";
import { listPassportBooths, stampsForAttendee, markStampsSeen } from "../db/booths";
import { buildPassport, revealsAfter, type Reveal } from "../lib/booths";
import { eligible } from "../lib/activities";
import { nextFileHashes, sharesFile } from "@/lib/file-hashes";
import { canEditOwn } from "../lib/submissions";
import { pairRefusal } from "../lib/pairs";
import { getAttendee } from "@/lib/db/attendees";
import { createRequest, withdrawRequest, requestsForAttendee } from "../db/activity-requests";
import { bookingArrivalsFor } from "@/lib/db/checkins";
import { readAnswers, discardUploads, saveOrDiscard, deleteReplacedFiles, deleteEntryFiles } from "../lib/submission-uploads";
import { nowInKL } from "@/lib/time";
import { flashPath } from "@/lib/flash";
import { memberTrackRefusal } from "@/features/tracks/client";
import { sessionLabel } from "../lib/activities";
import { sessionArrivals } from "../lib/booking-door";
import { bookingFormFor } from "../lib/booking-form";
import { sessionStarted } from "../lib/activity-requests";
import { allow } from "@/lib/ratelimit";
import { hasHealthConsent, recordHealthConsent } from "@/lib/db/health-consents";
import { healthConsentTicked } from "@/lib/privacy";
import { portalLang, t, type Dict } from "@/features/language";

/**
 * What the attendee is told when the database refuses (D134, D140).
 *
 * Losing the race is a normal outcome and reads as one: the counts on the page were true when
 * it rendered, somebody else was faster, here is the list again with fresh numbers.
 */


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
  // D741: what this action says back, in the language the page was read in.
  const lang = await portalLang(event);
  const d = t(lang);
  let path = listPathFor(slug, token);

  // A link into an archived event still resolves - only `draft` gets the portal's "coming
  // soon" screen - so this is the only thing stopping a direct POST from reserving a seat in
  // an event that is over. Draft is deliberately NOT blocked here: organisers test draft
  // events through the portal, and `is_open` is the designed control for whether a
  // *live* event's activity accepts bookings yet.
  if (event.status === "archived") redirect(flashPath(path, d.booking.archived, "error"));

  // The route is reachable by anyone holding a personal link, and a tight loop against it is
  // a denial of seats (D137). Keyed on the token, which is the identity being spent.
  if (!allow(`book:${token}`, 20, 60_000)) {
    redirect(flashPath(path, d.common.tooManyAttempts, "error"));
  }

  const sessions = await listSessions(event.id);
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) redirect(flashPath(path, d.booking.refused.missing, "error"));
  path = activityPathFor(slug, token, session.activity_id);

  // D842: a time that has passed is struck through on the sheet; this stops a stale page or a
  // direct POST. `book_session` refuses it too.
  if (sessionStarted(session, nowInKL())) redirect(flashPath(path, d.booking.refused.started, "error"));

  // A pending request on this activity means its meaning is no longer settled — taking a
  // second seat underneath it would hand the desk a request whose premise changed while it
  // sat in the queue. `controls.bookable` already hides Book for this case; this is what makes
  // that enforcement rather than decoration against a direct POST.
  const requests = await requestsForAttendee(attendee.id);
  const hasPending = requests.some((r) => r.activity_id === session.activity_id && r.status === "pending");
  if (hasPending) {
    redirect(flashPath(
      path,
      d.booking.pendingBlocks,
      "error",
    ));
  }

  // D898: a booking that asks a form first books only with the answers (bookWithAnswersAction).
  // The page sends them there; this stops a stale page or a direct POST taking the seat alone.
  const booking = await getActivity(session.activity_id, event.id);
  if (booking && await bookingFormFor(booking, attendee)) redirect(flashPath(path, d.booking.answerFirst, "error"));

  const result = await bookSession(session.id, attendee.id);
  // The Activities dot lives in the portal layout's header and on the home's launcher, which a
  // redirect back to this page does not re-render. A booking is the one thing an attendee does that can settle a required
  // activity, so it is the one place the layout has to be told its dot may be stale.
  if (result === "ok") revalidatePath(`/e/${slug}/a/${token}`, "layout");
  redirect(result === "ok"
    ? flashPath(path, d.booking.booked(sessionLabel(session, { lang })))
    : flashPath(path, d.booking.refused[result], "error"));
}


/**
 * D898: step 2 of a booking that asks a form first - the seat and the answers, saved together or
 * not at all. No seat is held while the form is open, so a time that filled meanwhile is refused
 * here like any other. A refusal is returned rather than redirected, so the answers stay on screen:
 * `back` sends the dialog to the times (the seat was the problem), otherwise it stays on the form.
 * Success redirects like `bookAction`.
 */
export async function bookWithAnswersAction(slug: string, token: string, sessionId: string, fd: FormData): Promise<{ error: string; back: boolean }> {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const lang = await portalLang(event);
  const d = t(lang);
  if (event.status === "archived") return { error: d.booking.archived, back: true };
  // The same budget as bookAction: both spend seats.
  if (!allow(`book:${token}`, 20, 60_000)) return { error: d.common.tooManyAttempts, back: false };

  const sessions = await listSessions(event.id);
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return { error: d.booking.refused.missing, back: true };
  if (sessionStarted(session, nowInKL())) return { error: d.booking.refused.started, back: true };
  const path = activityPathFor(slug, token, session.activity_id);

  const requests = await requestsForAttendee(attendee.id);
  if (requests.some((r) => r.activity_id === session.activity_id && r.status === "pending")) return { error: d.booking.pendingBlocks, back: true };

  const booking = await getActivity(session.activity_id, event.id);
  if (!booking) return { error: d.booking.refused.missing, back: true };
  const asked = await bookingFormFor(booking, attendee);
  // Nothing owed any more - answered in another tab, or the booking stopped asking: a plain booking.
  if (!asked) {
    const result = await bookSession(session.id, attendee.id);
    if (result !== "ok") return { error: d.booking.refused[result], back: true };
    revalidatePath(`/e/${slug}/a/${token}`, "layout");
    redirect(flashPath(path, d.booking.booked(sessionLabel(session, { lang }))));
  }

  // D412: consent from the person it is about, before any of their health answers are stored.
  if (asked.ask.needsConsent && !healthConsentTicked(fd)) return { error: d.submission.healthConsent, back: false };

  const form = await readAnswers(asked.form, fd, {}, lang);
  if (!form.ok) return { error: form.error, back: false };
  if (asked.ask.needsConsent) await recordHealthConsent(attendee, asked.form.id);

  const result = await saveOrDiscard(form.uploaded, () =>
    bookWithAnswers(session.id, attendee.id, asked.form.id, form.answers, nowInKL().date, form.hashes));
  if (result.code !== "ok") await discardUploads(form.uploaded);
  if (result.code === "ok") {
    // As bookAction: the layout's Activities dot may have been settled by this seat.
    revalidatePath(`/e/${slug}/a/${token}`, "layout");
    redirect(flashPath(path, d.booking.booked(sessionLabel(session, { lang }))));
  }
  if (result.step === "booking") return { error: `${d.booking.refused[result.code]} ${d.booking.answersKept}`, back: true };
  return { error: submitMessages(d)[result.code], back: false };
}

export async function requestSwitchAction(slug: string, token: string, fromSessionId: string, fd: FormData) {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  // D741: what this action says back, in the language the page was read in.
  const lang = await portalLang(event);
  const d = t(lang);
  let path = listPathFor(slug, token);
  if (event.status === "archived") redirect(flashPath(path, d.booking.archived, "error"));
  if (!allow(`book:${token}`, 20, 60_000)) {
    redirect(flashPath(path, d.common.tooManyAttempts, "error"));
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
    redirect(flashPath(path, d.booking.askRefused.missing, "error"));
  }
  path = activityPathFor(slug, token, from.activity_id);
  // D842: nobody asks to move into a time that has passed. Moving out of one is still the
  // committee's call, as before.
  if (sessionStarted(to, nowInKL())) redirect(flashPath(path, d.booking.refused.started, "error"));

  // Re-checked rather than trusted from the page: a second tab still has a live button.
  const holds = (await bookingsForAttendee(attendee.id)).some((b) => b.session_id === from.id);
  if (!holds) redirect(flashPath(path, d.booking.askRefused.notYours, "error"));

  // D336: a session they have attended is finished; a stale page must not reopen it.
  const arrived = sessionArrivals([from], event.check_in_enabled ? await bookingArrivalsFor(attendee.id) : []);
  if (arrived[from.id]) redirect(flashPath(path, d.booking.askRefused.checkedIn, "error"));

  const result = await createRequest({
    eventId: event.id, activityId: from.activity_id, attendeeId: attendee.id,
    fromSessionId: from.id, toSessionId: to.id,
  });
  redirect(result === "ok"
    ? flashPath(path, d.booking.askedMove(sessionLabel(to, { lang })))
    : flashPath(path, d.booking.askRefused.duplicate, "error"));
}

export async function requestCancelAction(slug: string, token: string, fromSessionId: string) {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  // D741: what this action says back, in the language the page was read in.
  const lang = await portalLang(event);
  const d = t(lang);
  let path = listPathFor(slug, token);
  if (event.status === "archived") redirect(flashPath(path, d.booking.archived, "error"));
  if (!allow(`book:${token}`, 20, 60_000)) {
    redirect(flashPath(path, d.common.tooManyAttempts, "error"));
  }

  const sessions = await listSessions(event.id);
  const from = sessions.find((s) => s.id === fromSessionId);
  if (!from) redirect(flashPath(path, d.booking.askRefused.missing, "error"));
  path = activityPathFor(slug, token, from.activity_id);

  const holds = (await bookingsForAttendee(attendee.id)).some((b) => b.session_id === from.id);
  if (!holds) redirect(flashPath(path, d.booking.askRefused.notYours, "error"));

  // D336: a session they have attended is finished; a stale page must not reopen it.
  const arrived = sessionArrivals([from], event.check_in_enabled ? await bookingArrivalsFor(attendee.id) : []);
  if (arrived[from.id]) redirect(flashPath(path, d.booking.askRefused.checkedIn, "error"));

  // D148: a required activity's cancel never reaches the queue. The control is hidden, and
  // this is the check that makes hiding it enforcement rather than decoration.
  const activity = await getActivity(from.activity_id, event.id);
  if (!activity) redirect(flashPath(path, d.booking.askRefused.missing, "error"));
  if (activity.required) redirect(flashPath(path, d.booking.askRefused.required, "error"));

  const result = await createRequest({
    eventId: event.id, activityId: activity.id, attendeeId: attendee.id,
    fromSessionId: from.id, toSessionId: null,
  });
  redirect(result === "ok"
    ? flashPath(path, d.booking.askedCancel(sessionLabel(from, { lang })))
    : flashPath(path, d.booking.askRefused.duplicate, "error"));
}

/**
 * D837: an attendee moves their own seat at once, where the organiser allows it (the activity's
 * `attendee_edit`) and booking is open. Every check `requestSwitchAction` makes, plus the start
 * time: neither the seat they leave nor the one they take may have started. `switch_session`
 * then decides capacity, open and eligibility under its row lock, in one transaction.
 */
export async function moveAction(slug: string, token: string, fromSessionId: string, fd: FormData) {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const lang = await portalLang(event);
  const d = t(lang);
  let path = listPathFor(slug, token);
  if (event.status === "archived") redirect(flashPath(path, d.booking.archived, "error"));
  if (!allow(`book:${token}`, 20, 60_000)) {
    redirect(flashPath(path, d.common.tooManyAttempts, "error"));
  }

  const toSessionId = String(fd.get("to") ?? "");
  const sessions = await listSessions(event.id);
  const from = sessions.find((s) => s.id === fromSessionId);
  const to = sessions.find((s) => s.id === toSessionId);
  if (!from || !to || from.activity_id !== to.activity_id || to.id === from.id) {
    redirect(flashPath(path, d.booking.askRefused.missing, "error"));
  }
  path = activityPathFor(slug, token, from.activity_id);

  const activity = await getActivity(from.activity_id, event.id);
  if (!activity) redirect(flashPath(path, d.booking.askRefused.missing, "error"));
  // Not allowed without asking, or booking has closed since the page drew: the committee decides.
  if (!activity.attendee_edit || !activity.is_open) redirect(flashPath(path, d.booking.refused.closed, "error"));

  const holds = (await bookingsForAttendee(attendee.id)).some((b) => b.session_id === from.id);
  if (!holds) redirect(flashPath(path, d.booking.askRefused.notYours, "error"));
  const requests = await requestsForAttendee(attendee.id);
  if (requests.some((r) => r.activity_id === activity.id && r.status === "pending")) {
    redirect(flashPath(path, d.booking.askRefused.duplicate, "error"));
  }
  const arrived = sessionArrivals([from], event.check_in_enabled ? await bookingArrivalsFor(attendee.id) : []);
  if (arrived[from.id]) redirect(flashPath(path, d.booking.askRefused.checkedIn, "error"));
  const now = nowInKL();
  if (sessionStarted(from, now) || sessionStarted(to, now)) redirect(flashPath(path, d.booking.askRefused.started, "error"));

  const result = await switchSession(from.id, to.id, attendee.id);
  if (result === "ok") revalidatePath(`/e/${slug}/a/${token}`, "layout");
  redirect(result === "ok"
    ? flashPath(path, d.booking.moved(sessionLabel(to, { lang })))
    : flashPath(path, d.booking.refused[result], "error"));
}

/**
 * D837: an attendee cancels their own seat at once, under the same rules as `moveAction`.
 * `cancel_booking` still refuses the last seat of a required activity (D129, D148).
 */
export async function cancelAction(slug: string, token: string, fromSessionId: string) {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const lang = await portalLang(event);
  const d = t(lang);
  let path = listPathFor(slug, token);
  if (event.status === "archived") redirect(flashPath(path, d.booking.archived, "error"));
  if (!allow(`book:${token}`, 20, 60_000)) {
    redirect(flashPath(path, d.common.tooManyAttempts, "error"));
  }

  const sessions = await listSessions(event.id);
  const from = sessions.find((s) => s.id === fromSessionId);
  if (!from) redirect(flashPath(path, d.booking.askRefused.missing, "error"));
  path = activityPathFor(slug, token, from.activity_id);

  const activity = await getActivity(from.activity_id, event.id);
  if (!activity) redirect(flashPath(path, d.booking.askRefused.missing, "error"));
  if (!activity.attendee_edit || !activity.is_open) redirect(flashPath(path, d.booking.refused.closed, "error"));
  if (activity.required) redirect(flashPath(path, d.booking.askRefused.required, "error"));

  const holds = (await bookingsForAttendee(attendee.id)).some((b) => b.session_id === from.id);
  if (!holds) redirect(flashPath(path, d.booking.askRefused.notYours, "error"));
  const requests = await requestsForAttendee(attendee.id);
  if (requests.some((r) => r.activity_id === activity.id && r.status === "pending")) {
    redirect(flashPath(path, d.booking.askRefused.duplicate, "error"));
  }
  const arrived = sessionArrivals([from], event.check_in_enabled ? await bookingArrivalsFor(attendee.id) : []);
  if (arrived[from.id]) redirect(flashPath(path, d.booking.askRefused.checkedIn, "error"));
  if (sessionStarted(from, nowInKL())) redirect(flashPath(path, d.booking.askRefused.started, "error"));

  const result = await cancelBooking(from.id, attendee.id);
  // The Activities dot may now be due again (a required activity can never get here, but an
  // optional one's "booked" tick on the home launcher still changes).
  if (result === "ok") revalidatePath(`/e/${slug}/a/${token}`, "layout");
  redirect(result === "ok"
    ? flashPath(path, d.booking.cancelled(sessionLabel(from, { lang })))
    : flashPath(path, result === "required" ? d.booking.askRefused.required : d.booking.askRefused.notYours, "error"));
}

export async function withdrawRequestAction(slug: string, token: string, requestId: string) {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const d = t(await portalLang(event));
  let path = listPathFor(slug, token);
  if (!allow(`book:${token}`, 20, 60_000)) {
    redirect(flashPath(path, d.common.tooManyAttempts, "error"));
  }
  // Read first only to know which activity's page to return to; the withdraw below is still
  // what decides, scoped by attendee inside the query, so a posted id belonging to somebody
  // else withdraws nothing and says so.
  const request = (await requestsForAttendee(attendee.id)).find((r) => r.id === requestId);
  if (request) path = activityPathFor(slug, token, request.activity_id);
  const gone = await withdrawRequest(requestId, attendee.id);
  redirect(gone
    ? flashPath(path, d.booking.withdrawn)
    : flashPath(path, d.booking.notWaiting, "error"));
}

/** D396: the same file is already in one of this person's live entries. */

/**
 * What the attendee is told for every `SubmitCode` the database can return (D167). `canSubmit`
 * draws the page and cannot return `missing` — it was handed an activity, so it always has one
 * — but `submit_answers` is asked for by id on every request and can find the activity gone by
 * the time it runs. Every code has an entry, `ok` included, so a result this action forgot to
 * think about is a compile error rather than a silently swallowed refusal.
 */
const submitMessages = (d: Dict): Record<SubmitCode, string> => d.submission.result;

/** Renamed from submitFormAction: there is no `forms` route left for it to be named after (D178). */
export async function submitAnswersAction(slug: string, token: string, activityId: string, fd: FormData) {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  // D741: what this action says back, in the language the page was read in.
  const lang = await portalLang(event);
  const d = t(lang);
  const listPath = `/e/${slug}/a/${token}/activities`;
  const path = `${listPath}/${activityId}`;

  // The route is reachable by anyone holding a personal link, keyed on the token, which is the
  // identity being spent, the same as `book:${token}` on the booking actions above.
  if (!allow(`form:${token}`, 20, 60_000)) {
    redirect(flashPath(path, d.common.tooManyAttempts, "error"));
  }

  // Re-loaded rather than trusted from a hidden field: the page's copy of this activity is
  // stale by definition, and a direct POST could name an activity from another event entirely.
  const activity = await getActivity(activityId, event.id);
  if (!activity) redirect(flashPath(listPath, submitMessages(d).missing, "error"));

  // D392: `:for` names the group member this is sent for (a colon, so no question key can be it).
  // Only checked to be in this event here; `submit_answers` decides whether they may, below.
  const forId = String(fd.get(":for") ?? "") || attendee.id;
  const member = forId === attendee.id ? attendee : await getAttendee(forId);
  // D581: a cancelled member is treated like a missing one; `getAttendee` still returns them.
  if (!member || member.event_id !== event.id || member.cancelled_at) redirect(flashPath(path, submitMessages(d).proxy, "error"));
  const onBehalf = member.id !== attendee.id;

  // D412: health data needs the explicit consent of the person it is about, had before any of
  // it is uploaded. Their own tick is recorded here, once; for a group member it must already
  // be on file, since a captain cannot consent for someone else.
  if (activity.health_data) {
    if (onBehalf) {
      if (!(await hasHealthConsent(member.id, activity.id))) {
        redirect(flashPath(path, `${member.name} needs to agree to the health-information consent on their own page before anyone can submit this for them.`, "error"));
      }
    } else if (!(await hasHealthConsent(attendee.id, activity.id))) {
      if (!healthConsentTicked(fd)) redirect(flashPath(path, d.submission.healthConsent, "error"));
      await recordHealthConsent(attendee, activity.id);
    }
  }

  // D526-D528: `:with` tags one person from another team. Only checked to be in this event here;
  // `submit_answers_pair` decides the pair rules. Their health consent must already be on file -
  // nobody consents for someone else (D412).
  const withId = String(fd.get(":with") ?? "");
  const partner = withId && activity.allow_pair ? await getAttendee(withId) : null;
  if (withId && activity.allow_pair && (!partner || partner.event_id !== event.id)) {
    redirect(flashPath(path, "That person isn't in this event.", "error"));
  }
  // D581: a cancelled partner cannot take part; `getAttendee` still returns them.
  if (partner?.cancelled_at) redirect(flashPath(path, `${partner.name} can't take part in this activity.`, "error"));
  if (partner && activity.health_data && !(await hasHealthConsent(partner.id, activity.id))) {
    redirect(flashPath(path, `${partner.name} needs to agree to the health-information consent on their own page first.`, "error"));
  }

  // Uploads, validation and cleaning up after a refusal are the one protocol the admin's edit
  // shares (src/features/activities/lib/submission-uploads.ts): a `file` answer stores the object path the upload
  // returns (D168), and anything this request uploaded that does not end up in a stored
  // submission is discarded by path — never by activity or by attendee, which could reach a
  // previous submission.
  const form = await readAnswers(activity, fd, {}, lang);
  if (!form.ok) redirect(flashPath(path, form.error, "error"));

  // `canSubmit` decided what the page drew; it is never consulted here. Only `submit_answers`
  // decides what is allowed, and it is asked regardless of what the stale page believed.
  const today = nowInKL().date;
  if (partner) {
    const { code, who } = await saveOrDiscard(form.uploaded, () =>
      submitAnswersPair(activity.id, member.id, partner.id, form.answers, today, onBehalf ? attendee.id : null, form.hashes));
    if (code !== "ok") await discardUploads(form.uploaded);
    const refused = pairRefusal(code, who, partner.name);
    const message = code === "ok"
      ? `Submitted${onBehalf ? ` for ${member.name}` : ""} with ${partner.name}. Thanks!`
      : refused ?? submitMessages(d)[code as SubmitCode] ?? submitMessages(d).missing;
    redirect(flashPath(path, message, code === "ok" ? "ok" : "error"));
  }
  const result = await saveOrDiscard(form.uploaded, () => submitAnswers(activity.id, member.id, form.answers, today, onBehalf ? attendee.id : null, form.hashes));
  if (result !== "ok") await discardUploads(form.uploaded);
  // D725: a captain refused for a member off this track is told about the member, not themselves.
  const message = result === "ok" && onBehalf ? `Submitted for ${member.name}. Thanks!`
    : (onBehalf && memberTrackRefusal(result, member.name)) || submitMessages(d)[result];
  redirect(flashPath(path, message, result === "ok" ? "ok" : "error"));
}

/**
 * D391: an attendee edits one of their own entries, where the organiser allows it. The admin's
 * edit (`editSubmissionAction`, D337) is the template: the same upload protocol, answers under
 * retired keys kept, a replaced file deleted only after the save. `canEditOwn` is asked against
 * fresh reads, and `updateOwnSubmissionAnswers` re-checks the row's own rules in its write.
 * `submitted_on` and `group_id` never change, so a day's score and a group's count stay put.
 */
export async function editMySubmissionAction(slug: string, token: string, activityId: string, submissionId: string, fd: FormData) {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  // D741: what this action says back, in the language the page was read in.
  const lang = await portalLang(event);
  const d = t(lang);
  const path = `/e/${slug}/a/${token}/activities/${activityId}`;
  const gone = d.submission.cantEdit;

  // Shares the submit action's budget: both spend the same token on the same kind of work.
  if (!allow(`form:${token}`, 20, 60_000)) {
    redirect(flashPath(path, d.common.tooManyAttempts, "error"));
  }

  const [activity, current] = await Promise.all([getActivity(activityId, event.id), getSubmission(submissionId)]);
  const today = nowInKL().date;
  if (!activity || activity.kind !== "submission" || !current || current.activity_id !== activity.id
    || !canEditOwn(activity, current, attendee.id, attendee.category, today)) {
    redirect(flashPath(path, gone, "error"));
  }

  // D412: an activity marked as health data after this entry was sent still asks before an edit
  // - of the entry's owner, who for an entry added for them (D392) is not the one editing.
  if (activity.health_data && !(await hasHealthConsent(current.attendee_id, activity.id))) {
    if (current.attendee_id !== attendee.id) {
      redirect(flashPath(path, "This member needs to agree to the health-information consent on their own page before their entry can be changed.", "error"));
    }
    if (!healthConsentTicked(fd)) redirect(flashPath(path, d.submission.healthConsent, "error"));
    await recordHealthConsent(attendee, activity.id);
  }

  // A paired entry's edit also rewrites the partner's row (D532), so the partner's consent must
  // already be on file. The partner is looked up once, and only when something needs them.
  let partnerLookup: Promise<string | undefined> | undefined;
  const partnerOf = () => (partnerLookup ??= current.pair_id
    ? pairPartnerIds([current]).then((m) => m.get(current.id))
    : Promise.resolve(undefined));
  if (activity.health_data && current.pair_id) {
    const partnerId = await partnerOf();
    if (partnerId && !(await hasHealthConsent(partnerId, activity.id))) {
      const name = (await getAttendee(partnerId))?.name ?? "Your partner";
      redirect(flashPath(path, `${name} needs to agree to the health-information consent on their own page before this entry can be changed.`, "error"));
    }
  }

  const form = await readAnswers(activity, fd, current.answers, lang);
  if (!form.ok) redirect(flashPath(path, form.error, "error"));

  const keys = new Set(activity.questions.map((q) => q.key));
  const retired = Object.fromEntries(Object.entries(current.answers).filter(([k]) => !keys.has(k)));
  const answers = { ...retired, ...form.answers };
  // D396/D532: a swapped-in photo may not be one already in another live entry of either owner.
  // The pair's own rows are the entry being edited, so they never count against it.
  if (Object.keys(form.hashes).length > 0) {
    const partnerId = await partnerOf();
    const owners = [current.attendee_id, ...(partnerId ? [partnerId] : [])];
    const others = (await Promise.all(owners.map((o) => entriesForAttendee(activity.id, o)))).flat()
      .filter((e) => e.id !== current.id && (!current.pair_id || e.pair_id !== current.pair_id));
    if (sharesFile(form.hashes, others)) {
      await discardUploads(form.uploaded);
      redirect(flashPath(path, d.submission.duplicatePhoto, "error"));
    }
  }
  const hashes = nextFileHashes(activity.questions, current.answers, current.file_hashes, answers, form.hashes);
  const saved = await saveOrDiscard(form.uploaded, () => updateOwnSubmissionAnswers(current.id, activity.id, attendee.id, today, answers, hashes));
  if (!saved) {
    await discardUploads(form.uploaded);
    redirect(flashPath(path, gone, "error"));
  }

  await deleteReplacedFiles(activity, current.answers, answers, form.uploaded);
  redirect(flashPath(path, d.submission.changesSaved));
}

/**
 * D398: an attendee deletes one of their own entries, under exactly the rules Edit has
 * (`canEditOwn`): theirs, live, sent today, while the form allows it. Gone for good - the row,
 * then its files - so the day's ring and points drop at once, and the same photo may be sent
 * again. `deleteOwnSubmission` re-checks the rules in the delete itself.
 */
export async function deleteMySubmissionAction(slug: string, token: string, activityId: string, submissionId: string) {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  // D741: what this action says back, in the language the page was read in.
  const lang = await portalLang(event);
  const d = t(lang);
  const path = `/e/${slug}/a/${token}/activities/${activityId}`;
  const gone = d.submission.cantDelete;

  if (!allow(`form:${token}`, 20, 60_000)) {
    redirect(flashPath(path, d.common.tooManyAttempts, "error"));
  }

  const [activity, current] = await Promise.all([getActivity(activityId, event.id), getSubmission(submissionId)]);
  const today = nowInKL().date;
  if (!activity || activity.kind !== "submission" || !current || current.activity_id !== activity.id
    || !canEditOwn(activity, current, attendee.id, attendee.category, today)) {
    redirect(flashPath(path, gone, "error"));
  }

  const removed = await deleteOwnSubmission(current.id, activity.id, attendee.id, today);
  if (!removed) redirect(flashPath(path, gone, "error"));

  await deleteEntryFiles(activity, removed.answers);
  redirect(flashPath(path, d.submission.entryDeleted));
}

/**
 * D846: what the open Show my QR dialog asks every couple of seconds - this attendee's stamps on
 * this passport newer than `after`. Empty, never an error, for a passport that is gone, closed or
 * not theirs: the dialog just keeps waiting, and the page says the rest when it next loads.
 */
export async function pollRevealsAction(slug: string, token: string, activityId: string, after: string | null): Promise<Reveal[]> {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  if (!allow(`passport-poll:${token}`, 90, 60_000)) return [];
  const passport = await getActivity(activityId, event.id);
  if (!passport || passport.kind !== "passport" || !passport.is_open || !eligible(passport, attendee.category)) return [];
  const [booths, stamps] = await Promise.all([listPassportBooths(passport.id), stampsForAttendee(attendee.id)]);
  return revealsAfter(buildPassport(booths, stamps, passport.stamps_required), after);
}

/**
 * D847: the reveals for these stamps have played. A draft preview writes nothing - staff looking
 * at someone's page must not use up that person's moment (the reveal still plays for them).
 */
export async function markStampsSeenAction(slug: string, token: string, stampIds: string[]): Promise<void> {
  const { attendee } = await loadPortalAttendee(slug, token);
  if (await isDraftPreview(slug)) return;
  await markStampsSeen(attendee.id, stampIds.filter((id) => typeof id === "string").slice(0, 50));
}

