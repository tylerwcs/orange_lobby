import { loadPortalAttendee } from "@/lib/portal";
import { attendeeManifest } from "@/lib/web-app";

/**
 * This attendee's web app manifest (D227), linked from the personal layout's metadata. The
 * token is the only authority, as on every portal page: an unknown one is a 404, so nothing
 * here says whether an event or a person exists. Not cached - it names an event that can be
 * renamed.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event } = await loadPortalAttendee(slug, token);
  return new Response(JSON.stringify(attendeeManifest(event, `/e/${slug}/a/${token}`)), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" },
  });
}
