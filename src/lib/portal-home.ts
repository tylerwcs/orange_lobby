import "server-only";
import { listAgenda, listAgendaDays } from "@/lib/db/agenda";
import { listAnnouncements } from "@/lib/db/announcements";
import { assignedItemIdsFor } from "@/lib/db/breakouts";
import { listSessions } from "@/lib/db/activities";
import { portalActivities, portalBookings } from "@/lib/portal";
import { dayTabs, pickDay, type DayTab } from "@/lib/agenda";
import { isBreakout } from "@/lib/breakouts";
import { eligible, personalAgenda } from "@/lib/activities";
import { activityNav, type ActivityNav } from "@/lib/portal-activities";
import { nowInKL } from "@/lib/time";
import { resolveTiles, type Tile } from "@/lib/modules";
import type { AgendaItem, Announcement, Attendee, Event } from "@/lib/types";

export type HomeData = {
  tiles: Tile[];
  banner: Announcement | null;
  /** The whole programme this attendee may see, for the desktop home's agenda column. */
  agenda: AgendaItem[];
  /**
   * The unfiltered programme, including breakout rooms this attendee is not assigned to.
   * Kept because the breakouts card must see every room in a round to show what this
   * attendee is missing, not just the one (if any) they're assigned to.
   */
  allAgenda: AgendaItem[];
  /** The breakout items this attendee is assigned to, exposed so the home page's breakouts card can reuse it rather than re-querying. */
  assignedItemIds: ReadonlySet<string>;
  /** The day tabs (D199). */
  days: DayTab[];
  /** The day the desktop home is showing - today when the event is running, else the first. */
  day: string | null;
  announcements: Announcement[];
  now: { date: string; time: string };
};

export async function loadHomeData(
  event: Event,
  attendee: Attendee | null,
  basePath: string,
  requestedDay?: string,
): Promise<HomeData> {
  // Two round trips, not four: everything that decides what else to read goes in the first,
  // and every read that depends on it goes together in the second.
  const [allAgenda, agendaDays, announcements, activities] = await Promise.all([
    listAgenda(event.id),
    listAgendaDays(event.id),
    listAnnouncements(event.id),
    attendee ? portalActivities(event.id) : [],
  ]);
  // Only touch breakout_assignments when this event actually has breakout rows: every event
  // that exists today has none, and skipping the query keeps their portal working even before
  // the migration adding that table has been applied.
  const hasBreakouts = allAgenda.some(isBreakout);
  // Unlike hasBreakouts, there is no free signal for "this event has activities" - it takes a
  // real query to find out, and listActivities is written to answer "none" rather than throw
  // when migration 0016 has not landed yet. What this guard buys is skipping two queries
  // (every session, this attendee's bookings) for every event that has nothing to do with
  // this feature. Only the attendee's own booked sessions are needed here - they fold into
  // the agenda. Seat counts belong to the Activities tab, which loads its own.
  const hasActivities = activities.length > 0 && attendee !== null;
  const [assignedItemIds, sessions, myBookings] = await Promise.all([
    attendee && hasBreakouts ? assignedItemIdsFor(attendee.id) : new Set<string>(),
    hasActivities ? listSessions(event.id) : [],
    hasActivities ? portalBookings(attendee.id) : [],
  ]);
  const mineBySession = new Set(myBookings.map((b) => b.session_id));
  const bookedSessions = sessions.filter((s) => mineBySession.has(s.id));
  const { date, time } = nowInKL();
  // Computed once, here: everything downstream - the day tabs and the desktop
  // agenda column - must agree about what this attendee is allowed to see, bookings included.
  // See personalAgenda's own doc for why the filter-then-merge order is safe today and why it
  // is kept anyway.
  const agenda = personalAgenda(
    allAgenda,
    attendee ? { category: attendee.category, assignedItemIds } : null,
    bookedSessions,
    new Map(activities.map((a) => [a.id, a.name])),
  );
  const banner = announcements.find((a) => a.pinned) ?? announcements[0] ?? null;
  const tiles = resolveTiles({ event, basePath });
  const days = dayTabs(agendaDays, agenda);
  return {
    tiles, banner,
    agenda, allAgenda, assignedItemIds, days, day: pickDay(days.map((d) => d.date), requestedDay, date),
    announcements, now: { date, time },
  };
}

/**
 * The bar's Activities slot, for the personal layout (`activityNav` has the rules).
 *
 * Kept to the queries the answer needs: `listActivities` alone decides whether there is a tab,
 * and this attendee's bookings are fetched only when a required activity they can see might be
 * owed - the one case the dot depends on. Every event without activities pays one query, the
 * same one `loadHomeData` already guards on - and both reads are memoised with the page's, so
 * the slot costs the page below it nothing extra.
 */
export async function loadActivityNav(event: Pick<Event, "id">, attendee: Pick<Attendee, "id" | "category">): Promise<ActivityNav> {
  const activities = await portalActivities(event.id);
  const mayOwe = activities.some((a) => a.kind === "booking" && a.required && eligible(a, attendee.category));
  const held = mayOwe ? new Set((await portalBookings(attendee.id)).map((b) => b.activity_id)) : new Set<string>();
  return activityNav(activities, attendee.category, held);
}
