import "server-only";
import { getActivity } from "@/lib/db/activities";
import { signedSubmissionUrl } from "@/lib/db/media";
import { isOwnSubmissionPath } from "@/lib/storage";
import type { ActivitySubmission } from "@/lib/types";

/** Plain words, not an error page: it opens in a tab of its own. */
const gone = () => new Response("This file is no longer available.", {
  status: 404,
  headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
});

/**
 * D399: the redirect behind a "View file" link (src/lib/file-links.ts), once the caller has
 * decided this person may see this entry. Mints a fresh one-minute signed URL for the file the
 * entry holds under `key` and sends the browser to it. Only a file question's answer, and only a
 * path inside the activity's own folder, is ever signed; anything else is a 404. Never cached:
 * the next click must mint its own link.
 */
export async function submissionFileResponse(submission: ActivitySubmission, key: string): Promise<Response> {
  const activity = await getActivity(submission.activity_id, submission.event_id);
  const isFile = activity?.questions.some((q) => q.key === key && q.type === "file");
  const path = isFile && Object.hasOwn(submission.answers, key) ? submission.answers[key] : "";
  if (!activity || !path || !isOwnSubmissionPath({ orgId: activity.org_id, eventId: activity.event_id, formId: activity.id }, path)) return gone();
  const url = await signedSubmissionUrl(path);
  if (!url) return gone();
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "private, no-store" } });
}
