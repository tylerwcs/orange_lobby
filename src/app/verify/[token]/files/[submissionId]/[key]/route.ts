import { notFound } from "next/navigation";
import { allow } from "@/lib/ratelimit";
import { getSubmission, submissionFileResponse, verifierByToken, resolveVerifier, belongsToLink } from "@/features/activities";

/**
 * D495/D496: one submitted file, for a verifier link of its event. The same checks as the
 * revoke action - link live, entry in the link's event - then the same signed redirect the
 * admin route uses (D399), so a thumbnail never outlives the link that opened it.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; submissionId: string; key: string }> }) {
  const { token, submissionId, key } = await params;
  const link = await resolveVerifier(token, verifierByToken);
  if (!link) notFound();
  if (!allow(`verify-file:${link.id}`, 600, 60_000)) {
    return new Response("Too many requests. Wait a moment and try again.", { status: 429, headers: { "Cache-Control": "private, no-store" } });
  }
  const submission = await getSubmission(submissionId);
  if (!belongsToLink(link, submission)) notFound();
  return submissionFileResponse(submission!, key);
}
