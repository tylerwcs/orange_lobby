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
 * A staff preview never gets here as a draft: `findPortalEvent` already reads it as live (D714).
 */
export function isUnpublished(event: Pick<Event, "status">): boolean {
  return event.status === "draft";
}
import { notFound } from "next/navigation";
import { getEventBySlug } from "@/lib/db/events";
import { findByToken } from "@/lib/db/attendees";
import { listActivities, bookingsForAttendee, shownToAttendees, comingSoonForAttendees } from "@/features/activities";
import { listInfoTabs } from "@/lib/db/info-tabs";
import { isValidToken } from "@/lib/tokens";
import { hasInfo } from "@/lib/info-tabs";
import { findEntryByToken } from "@/features/registration-queue";
import { canPreviewDraft } from "@/lib/access";
import type { Attendee, Event, RegistrationEntry } from "@/lib/types";

const portalEventRow = cache((slug: string) => getEventBySlug(slug));

/**
 * D714: this request is an admin or committee member of a draft event, so its portal shows as it
 * will look live (with a banner saying so). Attendees still get "Coming soon". Only a draft pays
 * for the session read; a live event never touches it.
 */
export const isDraftPreview = cache(async (slug: string): Promise<boolean> => {
  const ev = await portalEventRow(slug);
  return !!ev && ev.status === "draft" && (await canPreviewDraft(ev));
});

/**
 * The same memo without the 404, for the event layout's metadata (D487), which shares its read with the page.
 * A staff preview reads the draft as live (D714), so every page, action and check below treats it as it will be.
 */
export const findPortalEvent = cache(async (slug: string): Promise<Event | null> => {
  const ev = await portalEventRow(slug);
  return ev && (await isDraftPreview(slug)) ? { ...ev, status: "live" } : ev;
});

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
  const ev = await findPortalEvent(slug);
  if (!ev) notFound();
  return ev;
});

/**
 * The same per-request memo for the two activity reads the layout's Activities slot and the
 * page below it both need: without it, every portal page paid for them twice. Closed
 * activities are already gone from what this returns (D384).
 */
const eventActivities = cache((eventId: string) => listActivities(eventId));
export const portalActivities = cache(async (eventId: string) => shownToAttendees(await eventActivities(eventId)));
/** D603: the scheduled ones, for the cards and the nav's `show` only. Same read as `portalActivities`. */
export const portalComingSoon = cache(async (eventId: string) => comingSoonForAttendees(await eventActivities(eventId)));
export const portalBookings = cache((attendeeId: string) => bookingsForAttendee(attendeeId));

/**
 * The Info tabs, memoised per request: the layout asks whether the Info section exists (for
 * the bar and the switch) and the Info page asks for the tabs themselves, on the same request.
 */
export const portalInfoTabsFor = cache((eventId: string) => listInfoTabs(eventId));
/** Whether the Info button shows for this viewer: their category, or null on the public portal. */
export const portalHasInfo = cache(async (eventId: string, category: string | null) => hasInfo(await portalInfoTabsFor(eventId), category));

/** One attendee read per request for the token, shared by the layout's loader and the page's (D118). */
const portalFindByToken = cache((eventId: string, token: string) => findByToken(eventId, token));

/** D585: a cancelled attendee too (the cancelled card). The personal layout now uses loadPortalLink; everything else uses loadPortalAttendee. */
export const loadPortalAttendeeAny = cache(
  async (slug: string, token: string): Promise<{ event: Event; attendee: Attendee }> => {
    const event = await loadPortalEvent(slug);
    if (!isValidToken(token)) notFound();
    const attendee = await portalFindByToken(event.id, token);
    if (!attendee) notFound();
    return { event, attendee };
  },
);

/**
 * D689: the personal layout and its metadata only - whatever the token is: an attendee (active or
 * cancelled), a waiting-list or pending entry, or both (a returning cancelled person shares one
 * token, D695). The entry is read only when no active attendee holds the token. 404 when neither.
 * Every portal page and action still goes through loadPortalAttendee, which refuses all of these
 * but an active attendee.
 */
export const loadPortalLink = cache(
  async (slug: string, token: string): Promise<{ event: Event; attendee: Attendee | null; entry: RegistrationEntry | null }> => {
    const event = await loadPortalEvent(slug);
    if (!isValidToken(token)) notFound();
    const attendee = await portalFindByToken(event.id, token);
    const entry = attendee && !attendee.cancelled_at ? null : await findEntryByToken(event.id, token);
    if (!attendee && !entry) notFound();
    return { event, attendee, entry };
  },
);

/**
 * Every portal page and action. A cancelled registration is refused here (D581), so no portal
 * write - booking, entry, game, polaroid - can run for them, whatever is POSTed.
 */
export const loadPortalAttendee = cache(
  async (slug: string, token: string): Promise<{ event: Event; attendee: Attendee }> => {
    const loaded = await loadPortalAttendeeAny(slug, token);
    if (loaded.attendee.cancelled_at) notFound();
    return loaded;
  },
);
