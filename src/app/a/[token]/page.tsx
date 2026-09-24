import { notFound, redirect } from "next/navigation";
import { getEventByAttendeeToken } from "@/lib/db/events";
import { attendeePath } from "@/lib/links";
import { isValidToken } from "@/lib/tokens";

/**
 * The short link a WhatsApp template points at. Meta's dynamic URL button is a fixed prefix
 * plus one variable, and an approved template cannot be edited — so the link that goes out is
 * /a/<token> for every event, and the slug is resolved here instead of being baked in.
 *
 * Nothing renders: this segment only ever redirects or 404s.
 */

// Never cached, for the same reason the crew link is not: rotating a token has to stop the
// old one resolving immediately, and a cached redirect would keep answering for it.
export const dynamic = "force-dynamic";

export default async function AttendeeShortLink({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Shape first, so a scanned or mistyped link never reaches the database.
  if (!isValidToken(token)) notFound();
  const ev = await getEventByAttendeeToken(token);
  if (!ev) notFound();
  // Outside any try/catch: redirect() works by throwing.
  redirect(attendeePath(ev.slug, token));
}
