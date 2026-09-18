import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getEventBySlug } from "@/lib/db/events";
import { findByToken } from "@/lib/db/attendees";
import { isValidToken } from "@/lib/tokens";
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

export const loadPortalAttendee = cache(
  async (slug: string, token: string): Promise<{ event: Event; attendee: Attendee }> => {
    const event = await loadPortalEvent(slug);
    if (!isValidToken(token)) notFound();
    const attendee = await findByToken(event.id, token);
    if (!attendee) notFound();
    return { event, attendee };
  },
);
