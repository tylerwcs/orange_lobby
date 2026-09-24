import "server-only";
import { cache } from "react";

/**
 * Whether the portal may show nothing but "Coming soon" - a draft event.
 *
 * PortalChrome draws that screen, but it is a client component and cannot un-send what the
 * server already rendered: a personal page is its own route segment, and Next puts every
 * segment's output in the page's flight data whether or not the layout places it. So every
 * portal page returns nothing for a draft, and PortalShell drops the children it would have
 * wrapped, so that nothing unpublished - the agenda, the attendee's badge - reaches the browser.
 */
export function isUnpublished(event: Pick<Event, "status">): boolean {
  return event.status === "draft";
}
import { notFound } from "next/navigation";
import { getEventBySlug } from "@/lib/db/events";
import { findByToken } from "@/lib/db/attendees";
import { listActivities, bookingsForAttendee } from "@/lib/db/activities";
import { listInfoTabs } from "@/lib/db/info-tabs";
import { isValidToken } from "@/lib/tokens";
import { hasInfo } from "@/lib/info-tabs";
import type { Attendee, Event } from "@/lib/types";

/**
 * Wrapped in `cache()` because the personal layout and the page it wraps both load the same
 * attendee on the same request: the layout needs the event for the header and nav, the page
 * needs the attendee for its body, and the App Router gives a layout no way to hand anything
 * to its children short of context — which would make every page a client component.
 *
 * This is a per-request memo, not a cross-request cache. Nothing goes stale, and the second
 * caller costs nothing.
 */
export const loadPortalEvent = cache(async (slug: string): Promise<Event> => {
  const ev = await getEventBySlug(slug);
  if (!ev) notFound();
  return ev;
});

/**
 * The same per-request memo for the two activity reads the layout's Activities slot and the
 * page below it both need: without it, every portal page paid for them twice.
 */
export const portalActivities = cache((eventId: string) => listActivities(eventId));
export const portalBookings = cache((attendeeId: string) => bookingsForAttendee(attendeeId));

/**
 * The Info tabs, memoised per request: the layout asks whether the Info section exists (for
 * the bar and the switch) and the Info page asks for the tabs themselves, on the same request.
 */
export const portalInfoTabsFor = cache((eventId: string) => listInfoTabs(eventId));
export const portalHasInfo = cache(async (eventId: string) => hasInfo(await portalInfoTabsFor(eventId)));

export const loadPortalAttendee = cache(
  async (slug: string, token: string): Promise<{ event: Event; attendee: Attendee }> => {
    const event = await loadPortalEvent(slug);
    if (!isValidToken(token)) notFound();
    const attendee = await findByToken(event.id, token);
    if (!attendee) notFound();
    return { event, attendee };
  },
);
