"use server";
import { redirect } from "next/navigation";
import { loadPortalAttendee } from "@/lib/portal";
import { getForm, submitForm, type SubmitCode } from "@/lib/db/forms";
import { uploadSubmissionFile, deleteSubmissionFiles } from "@/lib/db/media";
import { validateAnswers } from "@/lib/registration";
import { nowInKL } from "@/lib/time";
import { flashPath } from "@/lib/flash";
import { allow } from "@/lib/ratelimit";

/**
 * What the attendee is told for every `SubmitCode` the database can return (D167). `canSubmit`
 * draws the page and cannot return `missing` — it was handed a form, so it always has one — but
 * `submit_form` is asked for by id on every request and can find the form gone by the time it
 * runs. Every code has an entry, `ok` included, so a result this action forgot to think about is
 * a compile error rather than a silently swallowed refusal.
 */
const RESULT_MESSAGES: Record<SubmitCode, string> = {
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
 * `submit_form` refusal (closed, limit, ineligible, today) reached after the upload already
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

export async function submitFormAction(slug: string, token: string, formId: string, fd: FormData) {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const listPath = `/e/${slug}/a/${token}/forms`;
  const path = `${listPath}/${formId}`;

  // The route is reachable by anyone holding a personal link; keyed on the token, which is the
  // identity being spent, the same as `book:${token}` on the activities actions.
  if (!allow(`form:${token}`, 20, 60_000)) {
    redirect(flashPath(path, "Too many attempts. Try again in a minute.", "error"));
  }

  // Re-loaded rather than trusted from a hidden field: the page's copy of this form is stale by
  // definition, and a direct POST could name a form from another event entirely.
  const form = await getForm(formId, event.id);
  if (!form) redirect(flashPath(listPath, RESULT_MESSAGES.missing, "error"));

  const input: Record<string, string> = {};
  for (const q of form.questions) {
    if (q.type === "file") continue; // a posted `file` question is a File, not a string — handled below
    input[q.key] = String(fd.get(q.key) ?? "");
  }

  // Uploaded before validateAnswers ever runs: a `file` answer stores the object path the
  // upload returns (D168), never the File itself. Run together rather than one at a time — a
  // form with several file questions should cost the attendee one round trip, not several —
  // and with allSettled rather than Promise.all so a throw from one upload never hides that
  // another has already landed in the bucket: every path this request actually wrote is
  // tracked in `uploaded`, and anything that does not end up in a stored submission (this
  // catch, a validateAnswers rejection, or a non-`ok` submitForm result below) is cleaned up
  // through that list — never by form or by attendee, which could reach a previous submission.
  const fileQuestions = form.questions.filter((q) => q.type === "file");
  const uploads = await Promise.allSettled(
    fileQuestions.map(async (q) => {
      const file = fd.get(q.key);
      if (!(file instanceof File) || file.size === 0) return { key: q.key, path: "" };
      const objectPath = await uploadSubmissionFile({ orgId: form.org_id, eventId: form.event_id, formId: form.id, file });
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

  const validated = validateAnswers(input, form.questions);
  if (!validated.ok) {
    await cleanupUploads(uploaded);
    const first = Object.values(validated.errors)[0];
    redirect(flashPath(path, first ?? "Check your answers and try again.", "error"));
  }

  // `canSubmit` decided what the page drew; it is never consulted here. Only `submit_form`
  // decides what is allowed, and it is asked regardless of what the stale page believed.
  const today = nowInKL().date;
  const result = await submitForm(form.id, attendee.id, validated.answers, today);
  if (result !== "ok") await cleanupUploads(uploaded);
  redirect(flashPath(path, RESULT_MESSAGES[result], result === "ok" ? "ok" : "error"));
}
