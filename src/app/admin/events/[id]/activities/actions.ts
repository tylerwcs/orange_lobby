"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import {
  createActivity, updateActivity, deleteActivity, deletePassportIfUnstamped, getActivity,
  createSessions, updateSession, deleteSession, deleteSessionsOnDay, bookSession, listSessions,
  syncSubmissionPerDay, submissionsForActivity, getSubmission, updateSubmissionAnswers, revokeSubmission,
  type NewActivity, type BookResult, type DecisionResult,
} from "@/lib/db/activities";
import { getRequest, decideRequest } from "@/lib/db/activity-requests";
import { notifyRequestDecision, decisionFlash } from "@/lib/request-notify";
import { readActivityPolicy, readNewActivity, describePlacement, type ActivityFormFields, sessionLabel } from "@/lib/activities";
import { listAttendees, getAttendee } from "@/lib/db/attendees";
import { parseIds } from "@/lib/bulk";
import { flashPath } from "@/lib/flash";
import { sweepSubmissionPrefix, nextImage, deleteEventImage, uploadEventImage, type ImageChange } from "@/lib/db/media";
import { readAnswers, discardUploads, saveOrDiscard, deleteReplacedFiles } from "@/lib/submission-uploads";
import { questionsFromForm } from "@/lib/questions-form";
import { FORM_QUESTION_TYPES } from "@/lib/registration";
import { MAX_SUBMISSION_QUESTIONS, readSubmissionDetails, perDayCollision, readGroupRule, groupRuleChangeBlocked, liveSubmissions } from "@/lib/submissions";
import { parseCategories } from "@/lib/agenda";
import { cleanRichText } from "@/lib/rich-text";
import { createBooth, updateBooth, setBoothOrder, deleteBoothIfUnstamped, listPassportBooths } from "@/lib/db/booths";
import { readPassportSettings } from "@/lib/booths";
import type { Activity, ActivitySubmission, ChallengeScoring, Event, GroupMode } from "@/lib/types";
import { readScoring } from "@/lib/challenge";
import { disqualify, undoDisqualify } from "@/lib/db/challenge";
import { generateSlots, readSlotForm, describeAdded } from "@/lib/session-slots";
import { activityHref, type ActivityTab } from "@/lib/activity-tabs";
import { shortDate } from "@/lib/text";

async function event(eventId: string) {
  const { orgId } = await requireAdmin();
  return requireEvent(eventId, orgId);
}

const listPath = (eventId: string) => `/admin/events/${eventId}/activities`;
const detailPath = (eventId: string, activityId: string) => `${listPath(eventId)}/${activityId}`;

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const checked = (fd: FormData, key: string) => fd.get(key) !== null;

/** The fields the add form and the settings form share. `readActivityPolicy` in @/lib/activities validates them. */
function policyFields(fd: FormData): ActivityFormFields {
  return {
    name: text(fd, "name"),
    description: text(fd, "description"),
    required: checked(fd, "required"),
    max_per_attendee: text(fd, "max_per_attendee"),
    categories: categoryValues(fd),
  };
}

/**
 * The ticked categories from the "Who can see it" picker (CategoryCombo), which posts one
 * `categories` value each. Joined with commas for `parseCategories`, which the policy readers
 * already use; no category name contains one (categoryParts splits on it).
 */
function categoryValues(fd: FormData): string {
  return fd.getAll("categories").map(String).join(",");
}

/**
 * The booking activity a posted id names, or a flash back to the list. Scopes
 * `saveActivityAction` and `deleteActivityAction` against a crafted id for the wrong kind — a
 * passport's id posted here would otherwise reach `updateActivity`/`deleteActivity` with fields
 * or a cascade that make no sense for it (deleting a stamped passport this way hits the
 * `23503` error boundary instead of the confirm dialog `deletePassportActivityAction` gives it).
 * The same guard `passportOf` below gives the passport actions (D180).
 */
async function bookingOf(ev: Event, activityId: string): Promise<Activity> {
  const activity = await getActivity(activityId, ev.id);
  if (!activity || activity.kind !== "booking") redirect(flashPath(listPath(ev.id), "That activity no longer exists.", "error"));
  return activity;
}

/**
 * Uploads one image for an activity description's editor and hands back its URL; the editor
 * puts it where the cursor was - the same contract as the Info page's `uploadInfoImageAction`.
 *
 * Returns rather than redirects: it is called while the description is still being written,
 * and a redirect would throw away everything typed and not yet saved. Nothing is written to
 * the activity here - the image only becomes part of it when the form is saved.
 */
export async function uploadActivityImageAction(eventId: string, formData: FormData): Promise<{ url: string } | { error: string }> {
  const { orgId } = await requireAdmin();
  await requireEvent(eventId, orgId);
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image first." };
  try {
    return { url: await uploadEventImage({ orgId, eventId, kind: "activity", file }) };
  } catch (e) {
    return { error: (e as Error).message };
  }
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
  const current = await bookingOf(ev, activityId);
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
 * Every kind carries the same switch in the same two places — its row on the list and its own
 * page's header — so `from` says which one was flipped (on the page, which tab) and the
 * organiser lands back there, rather than being carried off to a page they did not ask for.
 */
export async function toggleOpenAction(eventId: string, activityId: string, from: "list" | ActivityTab) {
  const ev = await event(eventId);
  const activity = await getActivity(activityId, ev.id);
  if (!activity) redirect(flashPath(listPath(eventId), "That activity no longer exists.", "error"));
  await updateActivity(activityId, ev.id, { is_open: !activity.is_open });
  const path = from === "list" ? listPath(eventId) : activityHref(eventId, activityId, from);
  revalidatePath(listPath(eventId));
  revalidatePath(detailPath(eventId, activityId));
  const opened = !activity.is_open;
  const LABELS: Record<Activity["kind"], [string, string]> = {
    booking: ["Booking open.", "Booking closed."],
    submission: ["Submissions open.", "Submissions closed."],
    passport: ["Stamping open.", "Stamping closed."],
  };
  redirect(flashPath(path, LABELS[activity.kind][opened ? 0 : 1]));
}

/**
 * Pins or unpins an activity (D387): a pinned one leads the attendee's home row and the
 * Activities tab. Its own action, like `toggleOpenAction`, so the settings form can never
 * clear it by leaving it out; the organiser lands back where they clicked.
 */
export async function togglePinAction(eventId: string, activityId: string, from: "list" | ActivityTab) {
  const ev = await event(eventId);
  const activity = await getActivity(activityId, ev.id);
  if (!activity) redirect(flashPath(listPath(eventId), "That activity no longer exists.", "error"));
  await updateActivity(activityId, ev.id, { pinned: !activity.pinned });
  const path = from === "list" ? listPath(eventId) : activityHref(eventId, activityId, from);
  revalidatePath(listPath(eventId));
  revalidatePath(detailPath(eventId, activityId));
  redirect(flashPath(path, activity.pinned ? "Unpinned." : "Pinned to the top of the attendee's activities."));
}

/** Cascades sessions and bookings (D135), so the confirm dialog says how many seats go with it. */
export async function deleteActivityAction(eventId: string, activityId: string) {
  const ev = await event(eventId);
  // Read before the delete, because afterwards there is no row to ask for its picture. Also the
  // kind guard (D180's reasoning): a passport's id posted here must not reach `deleteActivity`,
  // which cascades sessions and bookings a passport has none of, instead of the stamped-passport
  // refusal `deletePassportIfUnstamped` gives it.
  const doomed = await bookingOf(ev, activityId);
  await deleteActivity(activityId, ev.id);
  await deleteEventImage(doomed.image_url);
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
function readSubmissionPolicy(fd: FormData): Pick<NewActivity, "name" | "description" | "categories" | "max_per_attendee" | "per_day" | "questions" | "starts_on" | "ends_on" | "venue" | "action_label" | "attendee_edit" | "proxy_fields">
  & { group_mode: GroupMode; group_target: number | null; scoring: ChallengeScoring | null } {
  const name = text(fd, "name");
  if (!name) throw new Error("A submission needs a name");
  const details = readSubmissionDetails((k) => { const v = fd.get(k); return typeof v === "string" ? v : null; });
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
  const group = readGroupRule((k) => { const v = fd.get(k); return typeof v === "string" ? v : null; });
  // D372: read against the questions in this same post, so the score question can't be one being removed.
  const scoring = readScoring((k) => { const v = fd.get(k); return typeof v === "string" ? v : null; }, questions);
  return {
    name,
    description: cleanRichText(text(fd, "description")),
    categories: parseCategories(categoryValues(fd)),
    // D351: a group form carries no per-person rules - the group's own rule replaces them.
    max_per_attendee: group.group_mode === "off" ? max_per_attendee : null,
    per_day: group.group_mode === "off" ? checked(fd, "per_day") : false,
    attendee_edit: checked(fd, "attendee_edit"),
    // D392: field keys, as ticked. A key no attendee holds a Yes in simply makes nobody a proxy.
    proxy_fields: [...new Set(fd.getAll("proxy_fields").map((v) => String(v).trim()).filter(Boolean))].slice(0, 10),
    questions,
    ...details,
    ...group,
    scoring,
  };
}

/**
 * The submission activity a posted id names, or a flash back to the list. Same guard as
 * `bookingOf` above and `passportOf` below, for the same reason: a booking's or a passport's id
 * posted here must not reach `syncSubmissionPerDay`/`sweepSubmissionPrefix`, neither of which
 * means anything for the other kinds.
 */
async function submissionOf(ev: Event, activityId: string): Promise<Activity> {
  const activity = await getActivity(activityId, ev.id);
  if (!activity || activity.kind !== "submission") redirect(flashPath(listPath(ev.id), "That submission no longer exists.", "error"));
  return activity;
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
  redirect(flashPath(listPath(eventId), "Submission added."));
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
  // Its settings live on its own page now, like every other kind's, so every outcome lands there.
  const back = detailPath(eventId, activityId);
  let policy;
  try {
    policy = readSubmissionPolicy(fd);
  } catch (e) {
    redirect(flashPath(back, (e as Error).message, "error"));
  }
  const current = await submissionOf(ev, activityId);
  // D356: who submits is fixed while the form holds live entries - a group form's entries
  // mean nothing under another rule. Refused before any upload, so nothing is left behind.
  // F7: this count-then-update is not locked, so a submission landing between the count and the
  // save below lands under the new rule. Accepted as very unlikely while an admin is editing Setup.
  const blocked = groupRuleChangeBlocked(current, policy, liveSubmissions(await submissionsForActivity(activityId)).length);
  if (blocked) redirect(flashPath(back, blocked, "error"));
  // Before syncSubmissionPerDay rather than after it: that call rewrites the submissions
  // themselves, so a picture refused after it would leave them out of step with the form.
  let image: ImageChange = { url: current.image_url, stale: null };
  try {
    image = await nextImage(fd, "image", current.image_url, { orgId: ev.org_id, eventId: ev.id, kind: "activity" });
  } catch (e) {
    redirect(flashPath(back, (e as Error).message, "error"));
  }
  // Turning per_day on for the first time (D342): refuse up front, by name, when someone
  // already has two LIVE submissions on one day — revoked duplicates don't count (D339).
  // `syncSubmissionPerDay`'s own index below is the race backstop for the gap between this
  // check and that write, not the primary way this is caught.
  if (policy.per_day && !current.per_day) {
    const collision = perDayCollision(await submissionsForActivity(activityId));
    if (collision) {
      if (image.url !== current.image_url) await deleteEventImage(image.url);
      const attendee = await getAttendee(collision.attendeeId);
      redirect(flashPath(back, `${attendee?.name ?? "Someone"} submitted twice on ${shortDate(collision.day)}, so this can't become once a day. Revoke one of them first.`, "error"));
    }
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
    redirect(flashPath(back, "Someone has already submitted twice in one day, so this submission cannot become once-a-day. Revoke the extra submission first.", "error"));
  }
  await updateActivity(activityId, ev.id, { ...policy, image_url: image.url });
  // Only now that the row names the new picture (or none) is the old one safe to throw away.
  await deleteEventImage(image.stale);
  revalidatePath(listPath(eventId));
  revalidatePath(back);
  redirect(flashPath(back, "Submission saved."));
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
  const activity = await submissionOf(ev, activityId);
  await sweepSubmissionPrefix(`${ev.org_id}/${ev.id}/${activity.id}`);
  await deleteActivity(activityId, ev.id);
  // After the row, like every other image here: a delete that failed must not leave the form
  // pointing at a picture that is already gone.
  await deleteEventImage(activity.image_url);
  revalidatePath(listPath(eventId));
  redirect(flashPath(listPath(eventId), "Submission deleted."));
}

/**
 * Corrects one submission's answers (D337) through the same read/upload/validate protocol as the
 * portal's submit (`readAnswers`, src/lib/submission-uploads.ts). A file question left empty
 * keeps its file; the old file is deleted only once the row names its replacement, and only when
 * that replacement is a fresh upload from this request sitting in this activity's own folder - a
 * question a `show_when` change hid, whose answer went to "" with nothing uploaded, keeps its
 * stored file untouched. Answers under retired keys ride along untouched.
 *
 * `getSubmission` is scoped by id alone, so the row's `activity_id` is checked against the
 * activity `submissionOf` has already tied to this event: a posted id from another activity, or
 * another event, reads as gone. A revoked row cannot be edited (D340), and
 * `updateSubmissionAnswers` re-checks that in its own write, so a revoke landing mid-edit wins.
 */
export async function editSubmissionAction(eventId: string, activityId: string, submissionId: string, fd: FormData) {
  const { orgId, userId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const activity = await submissionOf(ev, activityId);
  const current = await getSubmission(submissionId);
  const back = submissionsBack(eventId, activity, current);
  if (!current || current.activity_id !== activity.id || current.status !== "submitted") {
    revalidatePath(detailPath(eventId, activityId));
    redirect(flashPath(back, "That submission can no longer be edited.", "error"));
  }

  const form = await readAnswers(activity, fd, current.answers);
  if (!form.ok) redirect(flashPath(back, form.error, "error"));

  const keys = new Set(activity.questions.map((q) => q.key));
  const retired = Object.fromEntries(Object.entries(current.answers).filter(([k]) => !keys.has(k)));
  const answers = { ...retired, ...form.answers };
  const saved = await saveOrDiscard(form.uploaded, () => updateSubmissionAnswers(submissionId, activity.id, answers, userId));
  if (!saved) {
    await discardUploads(form.uploaded);
    revalidatePath(detailPath(eventId, activityId));
    redirect(flashPath(back, "That submission was revoked while you were editing.", "error"));
  }

  await deleteReplacedFiles(activity, current.answers, answers, form.uploaded);
  revalidatePath(detailPath(eventId, activityId));
  redirect(flashPath(back, "Answers updated."));
}

/**
 * Revokes one submission (D338): a status, not a delete, so the row and its files stay and the
 * admin table keeps it, greyed (D340). It stops counting everywhere (D339), which is what lets
 * the attendee submit again. Scoped to this activity the same way `editSubmissionAction` is.
 */
export async function revokeSubmissionAction(eventId: string, activityId: string, submissionId: string) {
  const { orgId, userId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const activity = await submissionOf(ev, activityId);
  const current = await getSubmission(submissionId);
  const back = submissionsBack(eventId, activity, current);
  if (!current || current.activity_id !== activity.id) {
    revalidatePath(detailPath(eventId, activityId));
    redirect(flashPath(back, "That submission no longer exists.", "error"));
  }
  if (!(await revokeSubmission(submissionId, activity.id, userId))) {
    revalidatePath(detailPath(eventId, activityId));
    redirect(flashPath(back, "That submission was already revoked.", "error"));
  }
  const attendee = await getAttendee(current.attendee_id);
  const name = attendee?.name ?? "Someone";
  // The list page's "X of Y submitted" counts live rows, so it moved too.
  revalidatePath(listPath(eventId));
  revalidatePath(detailPath(eventId, activityId));
  redirect(flashPath(back, `${name}'s submission is revoked. They can submit again${activity.is_open ? "." : " once it's open."}`));
}

/**
 * Back to the Submissions tab - on the row's own day for a scored challenge, whose tab shows one
 * day at a time (D383), so a committee member auditing a past day keeps their place.
 */
function submissionsBack(eventId: string, activity: Activity, row: ActivitySubmission | null): string {
  const onDay = activity.scoring !== null && row && row.activity_id === activity.id;
  return activityHref(eventId, activity.id, "submissions", onDay ? { day: row.submitted_on } : {});
}

/** Back to the team grid on the same week it was posted from (D381). */
function leaderboardBack(eventId: string, activityId: string, fd: FormData): string {
  const week = text(fd, "week");
  return activityHref(eventId, activityId, "leaderboard", { team: text(fd, "team"), ...(/^\d+$/.test(week) ? { week } : {}) });
}

/**
 * D380: disqualify a person from a scored challenge. Their team shows Void everywhere and drops
 * out of the podium; their entries stay for the record. Undo is the delete below.
 */
export async function disqualifyAction(eventId: string, activityId: string, attendeeId: string, fd: FormData) {
  const { orgId, userId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const activity = await submissionOf(ev, activityId);
  const back = leaderboardBack(eventId, activityId, fd);
  const reason = text(fd, "reason");
  if (!activity.scoring) redirect(flashPath(back, "This activity isn't scored.", "error"));
  if (!reason) redirect(flashPath(back, "Add a reason for the record.", "error"));
  const attendee = await getAttendee(attendeeId);
  if (!attendee || attendee.event_id !== ev.id) redirect(flashPath(back, "That person is no longer in this event.", "error"));
  await disqualify(ev, activity.id, attendeeId, reason.slice(0, 500), userId);
  revalidatePath(detailPath(eventId, activityId));
  redirect(flashPath(back, `${attendee.name} disqualified. Their team now shows Void.`));
}

export async function undoDisqualifyAction(eventId: string, activityId: string, attendeeId: string, fd: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const activity = await submissionOf(ev, activityId);
  const back = leaderboardBack(eventId, activityId, fd);
  await undoDisqualify(activity.id, attendeeId);
  revalidatePath(detailPath(eventId, activityId));
  redirect(flashPath(back, "Disqualification undone."));
}

function readSession(fd: FormData) {
  const day = text(fd, "day");
  const starts_at = text(fd, "starts_at");
  if (!day || !starts_at) throw new Error("A session needs a day and a start time");
  const capacity = Number.parseInt(text(fd, "capacity") || "0", 10);
  if (!Number.isFinite(capacity) || capacity < 1) throw new Error("Capacity must be at least 1");
  return { day, starts_at, ends_at: text(fd, "ends_at") || null, location: text(fd, "location") || null, capacity };
}

/**
 * Adds every session the bulk dialog describes (D241). A single session is the same dialog with
 * one slot, so this is the only way sessions are added. Slots this activity already has are
 * skipped and counted rather than duplicated.
 */
export async function addSessionsAction(eventId: string, activityId: string, fd: FormData) {
  const ev = await event(eventId);
  await bookingOf(ev, activityId);
  const back = activityHref(eventId, activityId);
  const existing = (await listSessions(ev.id)).filter((s) => s.activity_id === activityId);
  const plan = generateSlots(readSlotForm(fd), existing);
  if (!plan.ok) redirect(flashPath(back, plan.error, "error"));
  await createSessions(ev.id, activityId, plan.slots);
  revalidatePath(listPath(eventId));
  revalidatePath(detailPath(eventId, activityId));
  redirect(flashPath(back, describeAdded(plan.slots.length, plan.skipped)));
}

export async function saveSessionAction(eventId: string, activityId: string, sessionId: string, fd: FormData) {
  const ev = await event(eventId);
  await updateSession(sessionId, ev.id, readSession(fd));
  revalidatePath(`/admin/events/${eventId}/activities/${activityId}`);
  redirect(flashPath(activityHref(eventId, activityId), "Session saved."));
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

/** A whole day's sessions, and their bookings with them (D242, D135). The confirm dialog says how many. */
export async function deleteSessionDayAction(eventId: string, activityId: string, day: string) {
  const ev = await event(eventId);
  await bookingOf(ev, activityId);
  const removed = await deleteSessionsOnDay(ev.id, activityId, day);
  revalidatePath(listPath(eventId));
  revalidatePath(detailPath(eventId, activityId));
  redirect(flashPath(activityHref(eventId, activityId), `Deleted ${removed} session${removed === 1 ? "" : "s"} on ${shortDate(day)}.`));
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
  const path = activityHref(eventId, activityId, "not-booked");
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
  // The breakout bulk assign writes one at a time for the same reason; this is the one place
  // that used to differ. Do not "optimise" this
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
 * the same guard the session actions apply for the same reason: a posted id belongs to
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
  const path = activityHref(eventId, activityId, "bookings");
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

  // After the decision is saved, never before: nobody hears "approved" about a change that did
  // not happen. notifyRequestDecision never throws, so WhatsApp cannot undo a good approve.
  const notice = await notifyRequestDecision(ev, request, "approved");
  revalidatePath(path);
  redirect(flashPath(path, decisionFlash("Request approved.", notice)));
}

export async function declineRequestAction(eventId: string, activityId: string, requestId: string) {
  const ev = await event(eventId);
  const { userId } = await requireAdmin();
  const path = activityHref(eventId, activityId, "bookings");
  // Same event- and activity-scoping note as approveRequestAction: this exists so a posted id
  // from outside this event, or from a sibling activity in it, can't be decided through this
  // page at all, before decide_request's own row lock ever gets a chance to resolve its status.
  const request = await getRequest(requestId, ev.id);
  if (!request || request.activity_id !== activityId) {
    revalidatePath(path);
    redirect(flashPath(path, REQUEST_GONE, "error"));
  }

  const result = await decideRequest(requestId, "declined", userId);
  if (result !== "ok") {
    revalidatePath(path);
    redirect(flashPath(path, REQUEST_GONE, "error"));
  }
  const notice = await notifyRequestDecision(ev, request, "declined");
  revalidatePath(path);
  redirect(flashPath(path, decisionFlash("Request declined.", notice)));
}

/**
 * The fields the add-passport form and its settings form share. No `required` and no cap
 * (D183): a passport is never owed and every booth stamps once. `is_open` is the add form's
 * alone; after that it belongs to `toggleOpenAction`, for the reason `readActivityPolicy` gives.
 */
function readPassportPolicy(fd: FormData, boothCount: number | null) {
  const name = text(fd, "name");
  if (!name) throw new Error("A passport needs a name");
  return {
    name,
    description: cleanRichText(text(fd, "description")),
    categories: parseCategories(categoryValues(fd)),
    ...readPassportSettings({ stamps_required: text(fd, "stamps_required"), reward_message: text(fd, "reward_message") }, boothCount),
  };
}

/** The passport a posted id names, or a flash back to the list. Scopes every booth action (D180). */
async function passportOf(ev: Event, activityId: string): Promise<Activity> {
  const passport = await getActivity(activityId, ev.id);
  if (!passport || passport.kind !== "passport") redirect(flashPath(listPath(ev.id), "That passport no longer exists.", "error"));
  return passport;
}

export async function addPassportActivityAction(eventId: string, fd: FormData) {
  const ev = await event(eventId);
  let policy;
  try {
    policy = readPassportPolicy(fd, null);
  } catch (e) {
    redirect(flashPath(listPath(eventId), (e as Error).message, "error"));
  }
  let image: ImageChange = { url: null, stale: null };
  try {
    image = await nextImage(fd, "image", null, { orgId: ev.org_id, eventId: ev.id, kind: "activity" });
  } catch (e) {
    redirect(flashPath(listPath(eventId), (e as Error).message, "error"));
  }
  const id = await createActivity(ev, {
    ...policy, kind: "passport", required: false, is_open: checked(fd, "is_open"),
    max_per_attendee: null, questions: [], per_day: false, image_url: image.url,
  });
  revalidatePath(listPath(eventId));
  // Straight to its page: a passport with no booths is the one thing an organiser cannot use.
  redirect(flashPath(detailPath(eventId, id), "Passport added. Add its booths next."));
}

/** Never touches `is_open`: see `readPassportPolicy`. */
export async function savePassportActivityAction(eventId: string, activityId: string, fd: FormData) {
  const ev = await event(eventId);
  const back = detailPath(eventId, activityId);
  const current = await passportOf(ev, activityId);
  const booths = await listPassportBooths(activityId);
  let policy;
  try {
    policy = readPassportPolicy(fd, booths.length);
  } catch (e) {
    redirect(flashPath(back, (e as Error).message, "error"));
  }
  let image: ImageChange = { url: current.image_url, stale: null };
  try {
    image = await nextImage(fd, "image", current.image_url, { orgId: ev.org_id, eventId: ev.id, kind: "activity" });
  } catch (e) {
    redirect(flashPath(back, (e as Error).message, "error"));
  }
  await updateActivity(activityId, ev.id, { ...policy, image_url: image.url });
  await deleteEventImage(image.stale);
  revalidatePath(listPath(eventId));
  revalidatePath(back);
  redirect(flashPath(back, "Passport saved."));
}

/** Refused by the database once anyone is stamped (D188), so the button needs no count check of its own. */
export async function deletePassportActivityAction(eventId: string, activityId: string) {
  const ev = await event(eventId);
  const doomed = await passportOf(ev, activityId);
  const removed = await deletePassportIfUnstamped(activityId, ev.id);
  if (!removed) {
    redirect(flashPath(detailPath(eventId, activityId), "Somebody has already been stamped on this passport, so it can't be deleted. Close stamping instead.", "error"));
  }
  await deleteEventImage(doomed.image_url);
  revalidatePath(listPath(eventId));
  redirect(flashPath(listPath(eventId), "Passport deleted."));
}

export async function addBoothAction(eventId: string, activityId: string, fd: FormData) {
  const ev = await event(eventId);
  const passport = await passportOf(ev, activityId);
  const name = text(fd, "name");
  if (!name) throw new Error("A booth needs a name");
  await createBooth(passport, name, text(fd, "location") || null);
  revalidatePath(detailPath(eventId, activityId));
}

/** Always allowed, stamped or not: stamps point at the row, not its name (D94). */
export async function renameBoothAction(eventId: string, activityId: string, boothId: string, fd: FormData) {
  const ev = await event(eventId);
  const name = text(fd, "name");
  if (!name) throw new Error("A booth needs a name");
  await updateBooth(boothId, ev.id, activityId, { name, location: text(fd, "location") || null });
  revalidatePath(detailPath(eventId, activityId));
}

export async function reorderBoothsAction(eventId: string, activityId: string, ids: string[]) {
  const ev = await event(eventId);
  await setBoothOrder(ev.id, activityId, ids);
  revalidatePath(detailPath(eventId, activityId));
}

/** Checked again in the database (D94): a second tab opened before the first stamp still has a live button. */
export async function deleteBoothAction(eventId: string, activityId: string, boothId: string) {
  const ev = await event(eventId);
  const removed = await deleteBoothIfUnstamped(boothId, ev.id, activityId);
  const path = detailPath(eventId, activityId);
  revalidatePath(path);
  redirect(removed
    ? flashPath(path, "Booth deleted.")
    : flashPath(path, "That booth has stamped somebody, so it can't be deleted. Rename it, or lower the stamps needed.", "error"));
}
