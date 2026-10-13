"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getEvent } from "@/lib/db/events";
import { flashPath } from "@/lib/flash";
import { allow } from "@/lib/ratelimit";
import { getActivity, getSubmission, revokeSubmission } from "../db/activities";
import { openVerifierLink } from "../db/verifiers";
import { belongsToLink, verifyQuery, verifyQueryString } from "../lib/verifier";
import { parseRevokeReason, reasonsOf } from "../lib/revoke";

const INVALID = "This link isn't valid. Ask the organiser for the right one.";

/**
 * D495/D496: a verifier's revoke. Everything is re-checked here - the link (removed or
 * replaced since the page loaded), the entry's event, its kind - and `query` is rebuilt
 * through `verifyQuery` rather than trusted, so it can only ever add filters to this page.
 */
export async function revokeAsVerifierAction(token: string, query: string, submissionId: string, fd: FormData) {
  const back = `/verify/${token}${verifyQueryString(verifyQuery(Object.fromEntries(new URLSearchParams(query))))}`;
  const link = await openVerifierLink(token);
  if (!link) redirect(flashPath(back, INVALID, "error"));
  if (!allow(`verify:${link.id}`, 60, 60_000)) redirect(flashPath(back, "Too many actions at once. Wait a moment and try again.", "error"));

  const submission = await getSubmission(submissionId);
  if (!submission || !belongsToLink(link, submission)) redirect(flashPath(back, "That entry no longer exists.", "error"));
  const [activity, ev] = await Promise.all([getActivity(submission.activity_id, link.event_id), getEvent(link.event_id)]);
  if (!activity || activity.kind !== "submission" || !ev) redirect(flashPath(back, "That entry no longer exists.", "error"));

  const parsed = parseRevokeReason(fd, reasonsOf(ev));
  if ("error" in parsed) redirect(flashPath(back, parsed.error, "error"));
  if (!(await revokeSubmission(submission.id, activity.id, parsed.reason, { verifierId: link.id }))) {
    redirect(flashPath(back, "Someone already revoked this entry.", "error"));
  }
  // The admin's activity pages count live rows; they moved.
  revalidatePath(`/admin/events/${link.event_id}/activities`, "layout");
  revalidatePath(`/verify/${token}`);
  redirect(flashPath(back, "Revoked. They'll see the reason and can send a new one."));
}
