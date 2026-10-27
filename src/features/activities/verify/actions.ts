"use server";
import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getEvent } from "@/lib/db/events";
import { flashPath } from "@/lib/flash";
import { allow } from "@/lib/ratelimit";
import { approveSubmission, getActivity, getSubmission, restoreSubmission, revokeSubmission, unapproveSubmission } from "../db/activities";
import { openVerifierLink } from "../db/verifiers";
import { belongsToLink, verifyQuery, verifyQueryString } from "../lib/verifier";
import { parseRevokeReason, reasonsOf, restoreRefusal } from "../lib/revoke";

const INVALID = "This link isn't valid. Ask the organiser for the right one.";

/**
 * D495/D496: what every verifier action checks first - the link (removed or replaced since the
 * page loaded), the rate, the entry's event and its kind. `query` is rebuilt through
 * `verifyQuery` rather than trusted, so it can only ever add filters to this page.
 */
async function verifierEntry(token: string, query: string, submissionId: string) {
  const back = `/verify/${token}${verifyQueryString(verifyQuery(Object.fromEntries(new URLSearchParams(query))))}`;
  const link = await openVerifierLink(token);
  if (!link) redirect(flashPath(back, INVALID, "error"));
  if (!allow(`verify:${link.id}`, 60, 60_000)) redirect(flashPath(back, "Too many actions at once. Wait a moment and try again.", "error"));

  const submission = await getSubmission(submissionId);
  if (!submission || !belongsToLink(link, submission)) redirect(flashPath(back, "That entry no longer exists.", "error"));
  const [activity, ev] = await Promise.all([getActivity(submission.activity_id, link.event_id), getEvent(link.event_id)]);
  if (!activity || activity.kind !== "submission" || !ev) redirect(flashPath(back, "That entry no longer exists.", "error"));
  return { back, link, submission, activity, ev };
}

export async function revokeAsVerifierAction(token: string, query: string, submissionId: string, fd: FormData) {
  const { back, link, submission, activity, ev } = await verifierEntry(token, query, submissionId);
  const parsed = parseRevokeReason(fd, reasonsOf(ev));
  if ("error" in parsed) redirect(flashPath(back, parsed.error, "error"));
  if (!(await revokeSubmission(submission.id, activity.id, parsed.reason, { verifierId: link.id }))) {
    redirect(flashPath(back, "Someone already revoked this entry.", "error"));
  }
  // The admin's activity pages count live rows; they moved.
  revalidatePath(`/admin/events/${link.event_id}/activities`, "layout");
  revalidatePath(`/verify/${token}`);
  // D523: redrawn in place like Approve (D522), so the verifier keeps their spot. The dialog
  // closes with it: its Revoke button only renders on a live entry's card, so the redraw
  // unmounts it - the card leaves To check, or turns Revoked under All.
  refresh();
}

/**
 * D735: Undo revoke after an appeal - any of the event's verifiers, any revoke, as with Undo
 * approval (D521). It comes back approved in this link's name, and redraws in place like Revoke.
 */
export async function restoreAsVerifierAction(token: string, query: string, submissionId: string) {
  const { back, link, submission, activity } = await verifierEntry(token, query, submissionId);
  const code = await restoreSubmission(submission.id, activity.id, { verifierId: link.id });
  if (code !== "ok") redirect(flashPath(back, restoreRefusal(code), "error"));
  revalidatePath(`/admin/events/${link.event_id}/activities`, "layout");
  revalidatePath(`/verify/${token}`);
  refresh();
}

/** D518: a note for the committee that this entry's proof was checked. Nothing else changes. D522: no jump to the top. */
export async function approveAsVerifierAction(token: string, query: string, submissionId: string) {
  const { back, link, submission, activity } = await verifierEntry(token, query, submissionId);
  if (!(await approveSubmission(submission.id, activity.id, link.id))) {
    redirect(flashPath(back, "That entry was already approved or revoked.", "error"));
  }
  // No redirect on success: a redirect lands back at the top of the list, and a verifier works
  // down it. `refresh` redraws the page where they are, and the card leaving To check (or
  // showing its badge) is the confirmation.
  revalidatePath(`/verify/${token}`);
  refresh();
}

/** D521: Undo for a mis-tap; the entry goes back to To check. */
export async function unapproveAsVerifierAction(token: string, query: string, submissionId: string) {
  const { back, submission, activity } = await verifierEntry(token, query, submissionId);
  if (!(await unapproveSubmission(submission.id, activity.id))) {
    redirect(flashPath(back, "That entry isn't approved any more.", "error"));
  }
  // As Approve: redrawn in place, so the verifier keeps their spot in the list.
  revalidatePath(`/verify/${token}`);
  refresh();
}
