import "server-only";
import { cache } from "react";
import { portalActivities, portalBookings } from "@/lib/portal";
import { bookingArrivalsFor } from "@/lib/db/checkins";
import { nowInKL } from "@/lib/time";
import { sanitizeHtml } from "@/lib/sanitize";
import { toRichHtml } from "@/lib/rich-text";
import { bookingCountsForActivities, listPopups, sessionsForActivities } from "./db";
import { pickPopup } from "./rules";
import type { PopupShown } from "./types";

/**
 * The popup this attendee sees on this open of the portal, or null (D752). The layout and the
 * home page both ask, so it is memoised per request - on plain strings, which is what `cache`
 * compares by.
 *
 * An event with no popup switched on pays the one popups read and nothing else. The rest is
 * read only for the on popups' activities, never `loadActivityEntries`' dozen reads; the
 * activities and bookings reads are the ones the layout's nav already made.
 */
export const portalPopupFor = cache(async (eventId: string, attendeeId: string, category: string | null): Promise<PopupShown | null> => {
  const popups = (await listPopups(eventId)).filter((p) => p.is_on);
  if (popups.length === 0) return null;
  const [activities, bookings, arrivals] = await Promise.all([portalActivities(eventId), portalBookings(attendeeId), bookingArrivalsFor(attendeeId)]);
  const held = new Set(bookings.map((b) => b.activity_id));
  const arrived = new Set(arrivals.map((a) => a.activity_id));
  const owed = [...new Set(popups.map((p) => p.activity_id))].filter((id) => !held.has(id) && !arrived.has(id));
  if (owed.length === 0) return null;
  const [sessions, counts] = await Promise.all([sessionsForActivities(owed), bookingCountsForActivities(owed)]);
  const picked = pickPopup({ popups, activities, category, held, arrived, sessions, counts, now: nowInKL() });
  if (!picked) return null;
  return {
    id: picked.id,
    heading: picked.heading,
    message_html: sanitizeHtml(toRichHtml(picked.message_html)),
    button_label: picked.button_label,
    activity_id: picked.activity_id,
  };
});
