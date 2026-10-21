import { NextResponse } from "next/server";
import { getEventBySlug } from "@/lib/db/events";
import { isValidToken } from "@/lib/tokens";
import { getAttendee } from "@/lib/db/attendees";
import { PREVIEW_COOKIE, PREVIEW_COOKIE_MAX_AGE, previewCookieMatches, previewLanding } from "@/lib/preview-link";

// Never cached: replacing or turning off the link has to stop it working at once.
export const dynamic = "force-dynamic";

/**
 * D715: the preview link a client opens to see their draft portal as it will look live. A good
 * link leaves the cookie on this event's portal path and lands on the portal (or the chosen
 * attendee's page, D716); anything else -
 * a mistyped, replaced or turned-off link - lands on the portal without it, which for a draft
 * is "Coming soon". Nothing renders here.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const portal = new URL(`/e/${slug}`, req.url);
  // Shape first, so a scanned or mistyped link never reaches the database.
  const event = isValidToken(token) ? await getEventBySlug(slug) : null;
  if (!event || !previewCookieMatches(event.preview_token, token)) return NextResponse.redirect(portal, 307);
  // D716: the attendee it opens as, when one is chosen. The cookie's path covers their page too.
  const attendee = event.preview_attendee_id ? await getAttendee(event.preview_attendee_id) : null;
  const res = NextResponse.redirect(new URL(previewLanding(event, attendee), req.url), 307);
  res.cookies.set(PREVIEW_COOKIE, token, {
    path: `/e/${event.slug}`,
    maxAge: PREVIEW_COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: "lax",
    secure: portal.protocol === "https:",
  });
  return res;
}
