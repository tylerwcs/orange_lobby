import { notFound } from "next/navigation";
import { loadPortalAttendee, portalActivities, portalBookings } from "@/lib/portal";
import { listSessions } from "@/lib/db/activities";
import { appBaseUrl, attendeeLink } from "@/lib/links";
import { bookingIcs } from "@/lib/ics";

/**
 * One booked seat as a calendar file: `?session=<id>`. The attendee's token is the only
 * authority, as on every portal page, and the file is only ever for a seat they hold - a
 * session they have not booked is a 404, not an invitation to something they cannot attend.
 *
 * Served inline rather than as an attachment: iOS Safari then offers "Add to Calendar"
 * directly, and desktop browsers, which cannot render text/calendar, download it anyway.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; token: string; activityId: string }> }) {
  const { slug, token, activityId } = await params;
  const sessionId = new URL(req.url).searchParams.get("session");
  if (!sessionId) notFound();
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const [activities, sessions, mine] = await Promise.all([
    portalActivities(event.id),
    listSessions(event.id),
    portalBookings(attendee.id),
  ]);
  const activity = activities.find((a) => a.id === activityId && a.kind === "booking");
  const session = sessions.find((s) => s.id === sessionId && s.activity_id === activityId);
  const booking = mine.find((b) => b.session_id === sessionId);
  if (!activity || !session || !booking) notFound();

  const ics = bookingIcs({
    uid: booking.id,
    title: activity.name,
    day: session.day,
    startsAt: session.starts_at,
    endsAt: session.ends_at,
    location: session.location,
    description: event.name,
    url: `${attendeeLink(appBaseUrl(), slug, token)}/activities/${activityId}`,
    now: new Date(),
  });
  const filename = activity.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "session";
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${filename}.ics"`,
      // The URL carries the attendee's token; nothing between them and us should keep a copy.
      "Cache-Control": "private, no-store",
    },
  });
}
