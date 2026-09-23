"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import {
  createActivity, updateActivity, deleteActivity, getActivity,
  createSession, updateSession, deleteSession, setSessionOrder, bookSession, listSessions,
  syncSubmissionPerDay, type NewActivity, type BookResult, type DecisionResult,
} from "@/lib/db/activities";
import { getRequest, decideRequest } from "@/lib/db/activity-requests";
import { readActivityPolicy, readNewActivity, describePlacement, type ActivityFormFields, sessionLabel } from "@/lib/activities";
import { listAttendees } from "@/lib/db/attendees";
import { parseIds } from "@/lib/bulk";
import { flashPath } from "@/lib/flash";
import { sweepSubmissionPrefix, nextImage, deleteEventImage, type ImageChange } from "@/lib/db/media";
import { questionsFromForm } from "@/lib/questions-form";
import { FORM_QUESTION_TYPES } from "@/lib/registration";
import { MAX_SUBMISSION_QUESTIONS } from "@/lib/submissions";
import { parseCategories } from "@/lib/agenda";
import { cleanRichText } from "@/lib/rich-text";

async function event(eventId: string) {
  const { orgId } = await requireAdmin();
  return requireEvent(eventId, orgId);
}

const listPath = (eventId: string) => `/admin/events/${eventId}/activities`;

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const checked = (fd: FormData, key: string) => fd.get(key) !== null;

/** The fields the add form and the settings form share. `readActivityPolicy` in @/lib/activities validates them. */
function policyFields(fd: FormData): ActivityFormFields {
  return {
    name: text(fd, "name"),
    description: text(fd, "description"),
    required: checked(fd, "required"),
    max_per_attendee: text(fd, "max_per_attendee"),
    categories: text(fd, "categories"),
  };
}

export async function addActivityAction(eventId: string, fd: FormData) {
  const ev = await event(eventId);
  const input = readNewActivity({ ...policyFields(fd), is_open: checked(fd, "is_open") });
  // After the fields are read, so a form refused for its text never leaves a picture behind.
  let image: ImageChange = { url: null, stale: null };
  try {
    image = await nextImage(fd, "image", null, { orgId: ev.org_id, eventId: ev.id, kind: "activity" });
  } catch (e) {
    redirect(flashPath(listPath(eventId), (e as Error).message, "error"));
  }
  await createActivity(ev, { ...input, image_url: image.url });
  revalidatePath(`/admin/events/${eventId}/activities`);
}

/**
 * Never touches `is_open` (see `readActivityPolicy`'s note): the settings form this
 * saves has no `is_open` field, so reading one from `fd` would read its absence as a
 * deliberate close and silently undo whatever `toggleOpenAction` last set.
 */
export async function saveActivityAction(eventId: string, activityId: string, fd: FormData) {
  const ev = await event(eventId);
  const back = `${listPath(eventId)}/${activityId}`;
  const policy = readActivityPolicy(policyFields(fd));
  const current = await getActivity(activityId, ev.id);
  if (!current) redirect(flashPath(listPath(eventId), "That activity no longer exists.", "error"));
  let image: ImageChange = { url: current.image_url, stale: null };
  try {
    image = await nextImage(fd, "image", current.image_url, { orgId: ev.org_id, eventId: ev.id, kind: "activity" });
  } catch (e) {
    redirect(flashPath(back, (e as Error).message, "error"));
  }
  await updateActivity(activityId, ev.id, { ...policy, image_url: image.url });
  // Only once the row names the new picture (or none) is the old one safe to throw away.
  await deleteEventImage(image.stale);
  revalidatePath(`/admin/events/${eventId}/activities`);
  revalidatePath(`/admin/events/${eventId}/activities/${activityId}`);
  redirect(flashPath(`/admin/events/${eventId}/activities/${activityId}`, "Activity saved."));
}

/**
 * The one control the desk/organiser uses during an event, so it is one click and its own
 * action rather than a field inside a settings form (D127). Replaces toggleBookingAction and
 * toggleFormOpenAction, which flipped the very same `is_open` column under two names before a
 * booking and a submission shared one table (D178).
 *
 * A booking activity's toggle lives in its detail page's header, and stays there after this
 * click; a submission activity's toggle is inline on its row in the list, exactly as it was on
 * the old forms list, and stays there. Rather than hard-code either destination, this redirects
 * to whichever one the activity's own kind says — so one action serves both callers without
 * either one landing somewhere it did not before the merge.
 */
export async function toggleOpenAction(eventId: string, activityId: string) {
  const ev = await event(eventId);
  const activity = await getActivity(activityId, ev.id);
  if (!activity) redirect(flashPath(listPath(eventId), "That activity no longer exists.", "error"));
  await updateActivity(activityId, ev.id, { is_open: !activity.is_open });
  const path = activity.kind === "booking" ? `${listPath(eventId)}/${activityId}` : listPath(eventId);
  revalidatePath(listPath(eventId));
  revalidatePath(`${listPath(eventId)}/${activityId}`);
  const opened = !activity.is_open;
  const label = activity.kind === "booking"
    ? (opened ? "Booking open." : "Booking closed.")
    : (opened ? "Form open." : "Form closed.");
  redirect(flashPath(path, label));
}

/** Cascades sessions and bookings (D135), so the confirm dialog says how many seats go with it. */
export async function deleteActivityAction(eventId: string, activityId: string) {
  const ev = await event(eventId);
  // Read before the delete, because afterwards there is no row to ask for its picture.
  const doomed = await getActivity(activityId, ev.id);
  await deleteActivity(activityId, ev.id);
  await deleteEventImage(doomed?.image_url);
  revalidatePath(listPath(eventId));
  redirect(flashPath(listPath(eventId), "Activity deleted."));
}

/**
 * True only when `e` is `activity_submissions_one_a_day` (0025_forms.sql, renamed by
 * 0029_merge_forms_into_activities.sql) refusing a write — never any other unique violation, and
 * never a network failure, an outage, or anything else `syncSubmissionPerDay` might throw.
 * Scoped to that one constraint by name, the same reasoning `submit_answers`'s exception handler
 * gives (0030_kind_aware_writes.sql): 23505 alone is not enough, because `activity_submissions_pkey`
 * fires the same error class, and reporting an unrelated failure as "someone already submitted
 * twice today" sends the organiser hunting for a duplicate that does not exist.
 *
 * supabase-js's `PostgrestError` carries `code`, `message`, `details` and `hint` — no separate
 * constraint-name field — so the constraint name is read out of `message`, which is Postgres's
 * own text (`duplicate key value violates unique constraint "…"`) forwarded verbatim by PostgREST.
 */
function isPerDayCollision(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const { code, message } = e as { code?: unknown; message?: unknown };
  return code === "23505" && typeof message === "string" && message.includes("activity_submissions_one_a_day");
}

/**
 * The fields the add-submission form and its edit form share — everything but `is_open` (owned
 * by `toggleOpenAction` alone, the same reason `readActivityPolicy` leaves it out) and
 * `required`: a submission activity carries that column (D178 shares it with booking), but
 * neither form has ever offered a control for it, so it is never read here and stays `false`
 * from creation onward. Throws on anything invalid; both actions below catch that and turn it
 * into a flash rather than a 500.
 */
function readSubmissionPolicy(fd: FormData): Pick<NewActivity, "name" | "description" | "categories" | "max_per_attendee" | "per_day" | "questions"> {
  const name = text(fd, "name");
  if (!name) throw new Error("A form needs a name");
  const maxRaw = text(fd, "max_per_attendee");
  let max_per_attendee: number | null = null;
  if (maxRaw) {
    max_per_attendee = Number.parseInt(maxRaw, 10);
    if (!Number.isFinite(max_per_attendee) || max_per_attendee < 1 || max_per_attendee > 366) {
      throw new Error("Submissions per attendee must be a whole number between 1 and 366, or left blank for no limit.");
    }
  }
  const questions = questionsFromForm(
    (k) => { const v = fd.get(k); return typeof v === "string" ? v : null; },
    FORM_QUESTION_TYPES,
    MAX_SUBMISSION_QUESTIONS,
  );
  return {
    name,
    description: cleanRichText(text(fd, "description")),
    categories: parseCategories(text(fd, "categories")),
    max_per_attendee,
    per_day: checked(fd, "per_day"),
    questions,
  };
}

export async function addSubmissionActivityAction(eventId: string, fd: FormData) {
  const ev = await event(eventId);
  let policy;
  try {
    policy = readSubmissionPolicy(fd);
  } catch (e) {
    redirect(flashPath(listPath(eventId), (e as Error).message, "error"));
  }
  // Uploaded only once everything typed has been accepted, so a refused form never leaves a
  // picture behind in the bucket.
  let image: ImageChange = { url: null, stale: null };
  try {
    image = await nextImage(fd, "image", null, { orgId: ev.org_id, eventId: ev.id, kind: "activity" });
  } catch (e) {
    redirect(flashPath(listPath(eventId), (e as Error).message, "error"));
  }
  await createActivity(ev, { ...policy, kind: "submission", required: false, is_open: checked(fd, "submissions_open"), image_url: image.url });
  revalidatePath(listPath(eventId));
  redirect(flashPath(listPath(eventId), "Form added."));
}

/**
 * Never touches `is_open`: see `readSubmissionPolicy`'s note.
 *
 * `syncSubmissionPerDay` rewrites every one of this activity's submissions' `per_day` BEFORE
 * `updateActivity` writes the activity row itself, so it can throw on the partial unique index
 * if somebody already submitted twice in one day. `isPerDayCollision` narrows that specific
 * throw to a sentence naming what to fix rather than a 500 (D165); anything else re-raises.
 */
export async function saveSubmissionActivityAction(eventId: string, activityId: string, fd: FormData) {
  const ev = await event(eventId);
  let policy;
  try {
    policy = readSubmissionPolicy(fd);
  } catch (e) {
    redirect(flashPath(listPath(eventId), (e as Error).message, "error"));
  }
  const current = await getActivity(activityId, ev.id);
  if (!current) redirect(flashPath(listPath(eventId), "That form no longer exists.", "error"));
  // Before syncSubmissionPerDay rather than after it: that call rewrites the submissions
  // themselves, so a picture refused after it would leave them out of step with the form.
  let image: ImageChange = { url: current.image_url, stale: null };
  try {
    image = await nextImage(fd, "image", current.image_url, { orgId: ev.org_id, eventId: ev.id, kind: "activity" });
  } catch (e) {
    redirect(flashPath(listPath(eventId), (e as Error).message, "error"));
  }
  try {
    await syncSubmissionPerDay(activityId, policy.per_day);
  } catch (e) {
    // Nothing is saved on either path below, so a picture uploaded for this save goes too.
    if (image.url !== current.image_url) await deleteEventImage(image.url);
    // The partial unique index refuses if somebody already submitted twice on one day. Say so
    // rather than showing a 500 (D165) — but only for that specific refusal. Anything else (an
    // outage, a network failure, some other constraint) re-throws, so it surfaces as a real
    // failure instead of a misleading flash the organiser cannot act on.
    if (!isPerDayCollision(e)) throw e;
    redirect(flashPath(listPath(eventId), "Someone has already submitted twice in one day, so this form cannot become once-a-day. Delete the extra submission first.", "error"));
  }
  await updateActivity(activityId, ev.id, { ...policy, image_url: image.url });
  // Only now that the row names the new picture (or none) is the old one safe to throw away.
  await deleteEventImage(image.stale);
  revalidatePath(listPath(eventId));
  redirect(flashPath(listPath(eventId), "Form saved."));
}

/**
 * Cascades its submissions (the same shape of decision `deleteActivityAction` makes), so the
 * confirm dialog says how many go with it.
 *
 * The submissions' uploaded files are swept from the bucket BEFORE the activity row is deleted:
 * the cascade takes `activity_submissions` with it, and once that has happened there is nothing
 * left in the database to ask which files were this activity's.
 *
 * Swept by PREFIX (`sweepSubmissionPrefix`, src/lib/db/media.ts), not by reading file answers
 * off the submissions' current keys: a question's key can be renamed in the editor after
 * attendees have already uploaded under the old one, which would leave those objects unnamed
 * by anything the database still remembers (the bug D169 exists to prevent). The prefix is
 * built only from `ev.org_id`, `ev.id` and `activityId` — the id `getActivity` already confirmed
 * belongs to this event — never from anything a caller could tamper with.
 */
export async function deleteSubmissionActivityAction(eventId: string, activityId: string) {
  const ev = await event(eventId);
  const activity = await getActivity(activityId, ev.id);
  if (!activity) redirect(flashPath(listPath(eventId), "That form no longer exists.", "error"));
  await sweepSubmissionPrefix(`${ev.org_id}/${ev.id}/${activity.id}`);
  await deleteActivity(activityId, ev.id);
  // After the row, like every other image here: a delete that failed must not leave the form
  // pointing at a picture that is already gone.
  await deleteEventImage(activity.image_url);
  revalidatePath(listPath(eventId));
  redirect(flashPath(listPath(eventId), "Form deleted."));
}

function readSession(fd: FormData) {
  const day = text(fd, "day");
  const starts_at = text(fd, "starts_at");
  if (!day || !starts_at) throw new Error("A session needs a day and a start time");
  const capacity = Number.parseInt(text(fd, "capacity") || "0", 10);
  if (!Number.isFinite(capacity) || capacity < 1) throw new Error("Capacity must be at least 1");
  return { day, starts_at, ends_at: text(fd, "ends_at") || null, location: text(fd, "location") || null, capacity };
}

export async function addSessionAction(eventId: string, activityId: string, fd: FormData) {
  const ev = await event(eventId);
  await createSession(ev.id, activityId, readSession(fd));
  revalidatePath(`/admin/events/${eventId}/activities/${activityId}`);
}

export async function saveSessionAction(eventId: string, activityId: string, sessionId: string, fd: FormData) {
  const ev = await event(eventId);
  await updateSession(sessionId, ev.id, readSession(fd));
  revalidatePath(`/admin/events/${eventId}/activities/${activityId}`);
}

/**
 * Deleting a session takes its bookings with it (D135). The confirm dialog in `SessionList`
 * names how many, because "delete this session" and "cancel 28 people's afternoon" are the
 * same click; this action itself has nothing left to say beyond confirming it happened.
 */
export async function deleteSessionAction(eventId: string, activityId: string, sessionId: string) {
  const ev = await event(eventId);
  await deleteSession(sessionId, ev.id);
  const path = `/admin/events/${eventId}/activities/${activityId}`;
  revalidatePath(path);
  redirect(flashPath(path, "Session deleted."));
}

/**
 * Stores this activity's sessions in the order a drag or a keyboard move left them.
 *
 * `setSessionOrder` is scoped by event id, not activity id, so a posted id from a sibling
 * activity in the same event would otherwise let one activity's reorder silently renumber
 * another's sessions. The posted list is filtered down to this activity's own sessions first —
 * the same guard `reorderCheckpointsAction` applies per day — and a partial list (one that
 * doesn't cover every session this activity has) is dropped rather than applied, so a stale
 * tab can't renumber the rest by accident.
 */
export async function reorderSessionsAction(eventId: string, activityId: string, ids: string[]) {
  const ev = await event(eventId);
  const mine = new Set((await listSessions(ev.id)).filter((s) => s.activity_id === activityId).map((s) => s.id));
  const ordered = ids.filter((id) => mine.has(id));
  if (ordered.length !== mine.size) return;
  await setSessionOrder(ev.id, ordered);
  revalidatePath(`/admin/events/${eventId}/activities/${activityId}`);
}

/**
 * Places the selected people in one session.
 *
 * Goes through `bookSession` like everything else, with `ignoreOpen` true: the desk works
 * after booking has closed, but a full session refuses an organiser exactly as it refuses an
 * attendee (D126, D130). `describePlacement` turns the outcomes into the sentence the
 * organiser needs — "12 placed, 3 refused" — rather than a bare "Placed."
 */
export async function placeAttendeesAction(eventId: string, activityId: string, fd: FormData) {
  const ev = await event(eventId);
  const path = `/admin/events/${eventId}/activities/${activityId}`;
  // The session comes from the form's own select, not from a bound argument: a form action
  // receives FormData and nothing else.
  const sessionId = String(fd.get("session_id") ?? "");
  // Never trust the posted list: it decides who gets written. `parseIds` filters it against
  // the attendees of THIS event, the same way the attendee bulk actions do. The field is a
  // comma-separated hidden input named "ids" (see BulkBar / UnbookedPanel).
  const attendees = await listAttendees(ev.id);
  const ids = parseIds(String(fd.get("ids") ?? ""), new Set(attendees.map((a) => a.id)));
  if (ids.length === 0) redirect(flashPath(path, "Nobody was selected.", "error"));

  const session = (await listSessions(ev.id)).find((s) => s.id === sessionId && s.activity_id === activityId);
  if (!session) redirect(flashPath(path, "That session no longer exists.", "error"));

  // Sequential, deliberately: `bookSession` takes `FOR UPDATE` on this session row and then
  // the activity row, so N concurrent calls would serialise inside Postgres anyway. Firing
  // them all at once buys no throughput and only means each one sits holding an HTTP
  // connection and a PostgREST pool slot while it waits its turn — a real stall risk for a
  // pool shared with the whole attendee portal when a desk places 200 people at once.
  // `setSessionOrder` (db/activities.ts) and the breakout bulk assign both write one at a time
  // for the same reason; this is the one place that used to differ. Do not "optimise" this
  // back into a `Promise.all` — the lock makes it free, and the pool makes it a liability.
  const outcomes: BookResult[] = [];
  for (const id of ids) {
    outcomes.push(await bookSession(session.id, id, true));
  }
  const { message, tone } = describePlacement(outcomes, sessionLabel(session));
  revalidatePath(path);
  redirect(flashPath(path, message, tone));
}

/**
 * Why an approval could not be carried out. Two of these six keys are dead today, kept only
 * because the map is typed against the full `DecisionResult` union rather than hand-picked
 * cases, so a future result added to either half of that union is a compile error here, not a
 * silently missing message:
 * - `closed` — the approval passes `ignoreOpen` (D156), so a closed activity never refuses.
 * - `limit` — only reachable via `BookResult`'s cap check, and neither `switch_session` (same
 *   activity in and out, so the per-attendee count never moves) nor `cancel_booking` (which
 *   only ever returns `CancelResult`) can produce it. `required` is the mirror case: it can
 *   only come from `cancel_booking`, if an optional activity was made required after a cancel
 *   request was raised.
 */
const APPROVE_REFUSALS: Record<Exclude<DecisionResult, "ok">, string> = {
  full: "That session is full now, so this cannot be approved. Decline it, or raise the capacity.",
  closed: "Booking is closed for this activity.",
  limit: "They already hold as many sessions as this activity allows.",
  ineligible: "They are no longer eligible for that session.",
  missing: "The session or the booking is gone.",
  required: "This activity is now required, so they cannot be left with no session.",
};

const REQUEST_GONE = "That request is no longer waiting.";

/**
 * Carries out a request, or explains why it cannot be.
 *
 * Approve and decline both resolve to one call to `decideRequest` (`decide_request` in
 * 0021_decide_request.sql), which locks the request row, applies it through the same locked
 * `switch_session`/`cancel_booking` functions, and stamps the decision — all inside one
 * transaction. That atomicity is what makes "somebody decided it first" and "refused, stays
 * pending" mutually exclusive outcomes rather than a race two desks could tear apart: the
 * earlier two-call version (apply, then a separately-scoped stamp) let an approve's booking
 * move while a concurrent decline's stamp won the row, leaving the record permanently reading
 * "declined" for a change that had actually happened (Task 7 review's Important finding).
 *
 * A refusal (anything the RPC returns other than `'ok'`) leaves the request PENDING. The desk
 * has not decided anything — they have been told they cannot do it yet, usually because the
 * target filled while the request waited (D144). Declining is the deliberate act and is a
 * separate control.
 *
 * `getRequest` runs first purely to scope the posted id to this event AND this activity before
 * it is ever acted on — neither `event_id` nor `activity_id` ever changes on a request row, so
 * this check races nothing `decide_request` itself guards (only the row's STATUS is racy, and
 * the RPC's own row lock is what serialises that). Without the event check, a posted
 * `requestId` belonging to a different event — even a different org's — would still be
 * decided, because `decide_request` itself takes no event id to scope by; only `event(eventId)`
 * stands between an admin and someone else's request. The activity check crosses no privilege
 * boundary (a sibling activity in the same event is this admin's to decide anyway), but it is
 * the same guard `reorderSessionsAction` applies for the same reason: a posted id belongs to
 * the page it was posted from, and deciding it through the wrong activity's page redirects and
 * revalidates the wrong path, so the desk watches a queue that did not change.
 *
 * `requireAdmin()` runs twice on this path: once inside `event()`, and again here for
 * `userId`, which `decideRequest` needs for `decided_by`. `event()` is kept to its existing
 * shape (just the event) rather than widened to return the whole `AdminContext`: nine other
 * actions in this file already destructure its return as the event alone, and this is the one
 * desk action that also needs "who decided" — it pays for one extra session lookup rather
 * than reshaping a helper every other call site shares unchanged.
 */
export async function approveRequestAction(eventId: string, activityId: string, requestId: string) {
  const ev = await event(eventId);
  const { userId } = await requireAdmin();
  const path = `/admin/events/${eventId}/activities/${activityId}`;
  const request = await getRequest(requestId, ev.id);
  if (!request || request.activity_id !== activityId) {
    revalidatePath(path);
    redirect(flashPath(path, REQUEST_GONE, "error"));
  }

  const result = await decideRequest(requestId, "approved", userId);
  if (result === "gone") {
    revalidatePath(path);
    redirect(flashPath(path, REQUEST_GONE, "error"));
  }
  if (result !== "ok") {
    revalidatePath(path);
    redirect(flashPath(path, APPROVE_REFUSALS[result], "error"));
  }

  revalidatePath(path);
  redirect(flashPath(path, "Request approved."));
}

export async function declineRequestAction(eventId: string, activityId: string, requestId: string) {
  const ev = await event(eventId);
  const { userId } = await requireAdmin();
  const path = `/admin/events/${eventId}/activities/${activityId}`;
  // Same event- and activity-scoping note as approveRequestAction: this exists so a posted id
  // from outside this event, or from a sibling activity in it, can't be decided through this
  // page at all, before decide_request's own row lock ever gets a chance to resolve its status.
  const request = await getRequest(requestId, ev.id);
  if (!request || request.activity_id !== activityId) {
    revalidatePath(path);
    redirect(flashPath(path, REQUEST_GONE, "error"));
  }

  const result = await decideRequest(requestId, "declined", userId);
  revalidatePath(path);
  redirect(flashPath(path, result === "ok" ? "Request declined." : REQUEST_GONE, result === "ok" ? "ok" : "error"));
}
