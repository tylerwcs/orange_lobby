import { getSessionMapLink } from "@/features/activities";

/**
 * The WhatsApp "View map" button (D835). Like /a/<token>, Meta's dynamic URL button is a fixed
 * prefix plus one variable, so the button cannot carry a Google Maps, Waze or short link as it
 * is: it carries the booked session's id, and this forwards to that session's map link.
 *
 * A session id gives away only where the session is, which its map link is for anyway.
 * Never cached: a map link corrected after the message went out should be the one it opens.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ session: string }> }) {
  const { session } = await params;
  const link = UUID.test(session) ? await getSessionMapLink(session) : null;
  // Checked again on the way out (the form already allows only these), so this never
  // forwards anywhere but an ordinary web link.
  let url: URL | null = null;
  try { url = link ? new URL(link) : null; } catch { url = null; }
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) {
    return new Response("This map link is no longer available.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  // 307: the link can change, and a browser keeps a 308 for good.
  return Response.redirect(url.href, 307);
}
