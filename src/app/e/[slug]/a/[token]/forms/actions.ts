"use server";
import { redirect } from "next/navigation";
import { loadPortalAttendee } from "@/lib/portal";
import { getForm, submitForm, type SubmitCode } from "@/lib/db/forms";
import { uploadSubmissionFile } from "@/lib/db/media";
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
  // upload returns (D168), never the File itself, and a file we will not take must abort the
  // whole submission rather than let it through with some other answer stored around it.
  try {
    for (const q of form.questions) {
      if (q.type !== "file") continue;
      const file = fd.get(q.key);
      input[q.key] = file instanceof File && file.size > 0
        ? await uploadSubmissionFile({ orgId: form.org_id, eventId: form.event_id, formId: form.id, file })
        : "";
    }
  } catch (e) {
    redirect(flashPath(path, (e as Error).message, "error"));
  }

  const validated = validateAnswers(input, form.questions);
  if (!validated.ok) {
    const first = Object.values(validated.errors)[0];
    redirect(flashPath(path, first ?? "Check your answers and try again.", "error"));
  }

  // `canSubmit` decided what the page drew; it is never consulted here. Only `submit_form`
  // decides what is allowed, and it is asked regardless of what the stale page believed.
  const today = nowInKL().date;
  const result = await submitForm(form.id, attendee.id, validated.answers, today);
  redirect(flashPath(path, RESULT_MESSAGES[result], result === "ok" ? "ok" : "error"));
}
