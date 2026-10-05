import { notFound } from "next/navigation";
import { loadPortalAttendee } from "@/lib/portal";
import { getSubmission } from "@/lib/db/activities";
import { canViewFile } from "@/lib/submissions";
import { submissionFileResponse } from "@/lib/submission-file";

/**
 * D399: one submitted file, for an attendee allowed to see its entry (`canViewFile`) - "View
 * file" in their submission history, their group's entries, and the edit dialog. The personal
 * link's token is the only authority, as on every portal page; signed at the click, so the link
 * never goes stale.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; token: string; submissionId: string; key: string }> }) {
  const { slug, token, submissionId, key } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const submission = await getSubmission(submissionId);
  if (!submission || submission.event_id !== event.id || !canViewFile(submission, attendee)) notFound();
  return submissionFileResponse(submission, key);
}
