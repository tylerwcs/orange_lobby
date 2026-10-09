import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { getSubmission, submissionFileResponse } from "@/features/activities";

/**
 * D399: one submitted file, for an admin of its event - "View file" in the Submissions table and
 * in its edit dialog. Signed at the click, not when the table rendered, so the link works however
 * long the page has been open. Revoked entries too: the table still lists them (D340).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; submissionId: string; key: string }> }) {
  const { id, submissionId, key } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const submission = await getSubmission(submissionId);
  if (!submission || submission.event_id !== ev.id) notFound();
  return submissionFileResponse(submission, key);
}
