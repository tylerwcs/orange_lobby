import "server-only";
import { uploadSubmissionFile, deleteSubmissionFiles } from "@/lib/db/media";
import { validateAnswers } from "@/lib/registration";
import { isQuestionShown } from "@/lib/show-when";
import { submissionFolder } from "@/lib/storage";
import type { Activity } from "@/lib/types";

/**
 * How one submission form's answers are read, uploaded and cleaned up. There is one protocol
 * for the attendee's submit (the portal) and the organiser's edit (D337), so the two cannot drift.
 *
 * A server-only module rather than part of either "use server" file on purpose: everything
 * exported from one of those is a Server Action a browser can call, and `discardUploads` deletes
 * whatever paths it is given.
 */

type FormActivity = Pick<Activity, "id" | "org_id" | "event_id" | "questions">;

export type ReadAnswers =
  | { ok: true; answers: Record<string, string>; uploaded: string[] }
  | { ok: false; error: string };

/**
 * Removes files this request uploaded when the answers they belonged to did not end up stored:
 * an upload that failed alongside another that succeeded, a validation error, a refusal, or a
 * write that threw. Only ever handed this request's own uploads (`ReadAnswers.uploaded`), so a
 * stored answer's file is never touched.
 *
 * Swallows its own failure on purpose: the person is already on their way to being told the
 * real outcome, and a stray object left behind on a bad day for storage is a cost, not a reason
 * to turn that outcome into a crash instead.
 */
export async function discardUploads(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await deleteSubmissionFiles(paths);
  } catch {
    // Left behind; see the comment above.
  }
}

/**
 * Reads one submission form: typed answers as posted, each `file` answer uploaded first (D168 -
 * it stores the object path, never the File), then `validateAnswers`, exactly as on submit.
 *
 * `stored` is an edit's current answers: a file question left empty keeps its stored path.
 * The portal's submit has none. Only paths uploaded by THIS call are ever in `uploaded`, so a
 * kept file is never discarded with them; a file answer is only ever a stored path or a path
 * uploaded here, never a posted string.
 *
 * A file posted for a question its `show_when` hides is not uploaded: `validateAnswers` would
 * store "" for it, and the object would sit in the bucket with nothing naming it. Judged on the
 * typed answers, which is all the form itself reacts to.
 *
 * Uploads run together rather than one at a time (one round trip for several file questions)
 * and with allSettled, so a throw from one never hides that another already landed. On any
 * refusal the fresh uploads are discarded here, and the first reason comes back.
 */
export async function readAnswers(activity: FormActivity, fd: FormData, stored: Record<string, string> = {}): Promise<ReadAnswers> {
  const input: Record<string, string> = {};
  for (const q of activity.questions) {
    if (q.type !== "file") input[q.key] = String(fd.get(q.key) ?? "");
  }
  const fileQuestions = activity.questions.filter((q) => q.type === "file");
  const typed = { ...input };
  const uploads = await Promise.allSettled(fileQuestions.map(async (q) => {
    const file = fd.get(q.key);
    const kept = { key: q.key, path: stored[q.key] ?? "", fresh: false };
    if (!(file instanceof File) || file.size === 0 || !isQuestionShown(q, typed)) return kept;
    const path = await uploadSubmissionFile({ orgId: activity.org_id, eventId: activity.event_id, formId: activity.id, file });
    return { key: q.key, path, fresh: true };
  }));
  const uploaded: string[] = [];
  let uploadError: string | null = null;
  for (const r of uploads) {
    if (r.status === "fulfilled") {
      input[r.value.key] = r.value.path;
      if (r.value.fresh) uploaded.push(r.value.path);
    } else {
      uploadError ??= (r.reason as Error).message;
    }
  }
  if (uploadError) {
    await discardUploads(uploaded);
    return { ok: false, error: uploadError };
  }

  const validated = validateAnswers(input, activity.questions);
  if (!validated.ok) {
    await discardUploads(uploaded);
    return { ok: false, error: Object.values(validated.errors)[0] ?? "Check your answers and try again." };
  }
  return { ok: true, answers: validated.answers, uploaded };
}

/**
 * Runs the write that stores the answers. If it throws (an outage, a network failure), this
 * request's uploads go before the error is re-raised, so they are not left behind with no row
 * naming them. A write that returns a refusal instead is the caller's to clean up after.
 */
export async function saveOrDiscard<T>(uploaded: string[], write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (e) {
    await discardUploads(uploaded);
    throw e;
  }
}

/**
 * The stored files an edit replaced: each file question's old path that the saved answers no
 * longer name. Only a path directly inside this activity's own folder (`submissionFolder`) is
 * ever returned - anything else is left alone, whatever an answer holds. That is defence in
 * depth: a file answer only ever holds an upload's path, but a question that was text before
 * it became a file question holds whatever was typed.
 */
export function replacedFiles(activity: FormActivity, before: Record<string, string>, after: Record<string, string>): string[] {
  const folder = submissionFolder({ orgId: activity.org_id, eventId: activity.event_id, formId: activity.id });
  return activity.questions.filter((q) => q.type === "file").flatMap((q) => {
    const old = before[q.key] ?? "";
    const name = old.slice(folder.length);
    const ours = old.startsWith(folder) && name !== "" && !name.includes("/");
    return ours && old !== after[q.key] ? [old] : [];
  });
}

/**
 * Deletes the files an edit replaced, once the row naming their replacements is saved - never
 * before, so a failed save still has its old files. A leftover object costs storage; the answers
 * are already saved, so a failure here is swallowed rather than reported as a failed edit.
 */
export async function deleteReplacedFiles(activity: FormActivity, before: Record<string, string>, after: Record<string, string>): Promise<void> {
  try {
    await deleteSubmissionFiles(replacedFiles(activity, before, after));
  } catch {
    // Left behind; see above.
  }
}
