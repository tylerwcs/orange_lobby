import "server-only";
import { listAgenda } from "@/lib/db/agenda";
import { listAnnouncements } from "@/lib/db/announcements";
import { assignedItemIdsFor } from "@/lib/db/breakouts";
import { listActivities, listSessions, countBookingsBySession, bookingsForAttendee } from "@/lib/db/activities";
import { nextSession, groupByDay, pickDay } from "@/lib/agenda";
import { isBreakout } from "@/lib/breakouts";
import { activityState, personalAgenda, type ActivityState } from "@/lib/activities";
import { nowInKL } from "@/lib/time";
import { resolveTiles, type Tile } from "@/lib/modules";
import type { AgendaItem, Announcement, Attendee, Event } from "@/lib/types";

export type HomeData = {
  tiles: Tile[];
  banner: Announcement | null;
  next: { item: AgendaItem; status: "now" | "next" } | null;
  today: string;
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
  /**
   * Every activity of the event, from this attendee's point of view - eligible or not, held
   * or not. Drives `ActivitiesCard`, which needs more than "what must be picked" (D129: an
   * attendee may switch freely, so it also has to surface what they already hold and any
   * optional activity still open to them, or they would have no way back to the page after
   * their first booking).
   */
  activities: ActivityState[];
  days: string[];
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
  const [allAgenda, announcements] = await Promise.all([listAgenda(event.id), listAnnouncements(event.id)]);
  // Only touch breakout_assignments when this event actually has breakout rows: every event
  // that exists today has none, and skipping the query keeps their portal working even before
  // the migration adding that table has been applied.
  const hasBreakouts = allAgenda.some(isBreakout);
  const assignedItemIds = attendee && hasBreakouts ? await assignedItemIdsFor(attendee.id) : new Set<string>();
  // Unlike hasBreakouts above, there is no free signal for "this event has activities" - it
  // takes a real query to find out, and listActivities is written to answer "none" rather than
  // throw when migration 0016 has not landed yet. What this guard buys is skipping the three
  // heavier queries below (every session, every booking, this attendee's bookings) for every
  // event that has nothing to do with this feature, which today is all of them.
  const activities = attendee ? await listActivities(event.id) : [];
  const [sessions, counts, myBookings] = activities.length && attendee
    ? await Promise.all([listSessions(event.id), countBookingsBySession(event.id), bookingsForAttendee(attendee.id)])
    : [[], {} as Record<string, number>, []];
  const mineBySession = new Set(myBookings.map((b) => b.session_id));
  const states = attendee ? activities.map((activity) => activityState({
    activity,
    sessions: sessions.filter((s) => s.activity_id === activity.id),
    counts,
    mine: mineBySession,
    category: attendee.category,
  })) : [];
  const bookedSessions = sessions.filter((s) => mineBySession.has(s.id));
  const { date, time } = nowInKL();
  // Computed once, here: everything downstream - the next card, the day tabs and the desktop
  // agenda column - must agree about what this attendee is allowed to see, bookings included.
  // See personalAgenda's own doc for why the filter-then-merge order is safe today and why it
  // is kept anyway.
  const agenda = personalAgenda(allAgenda, attendee ? { category: attendee.category, assignedItemIds } : null, bookedSessions);
  const next = nextSession(agenda, date, time);
  const banner = announcements.find((a) => a.pinned) ?? announcements[0] ?? null;
  const tiles = resolveTiles({ event, basePath });
  const days = groupByDay(agenda).map((g) => g.day);
  return {
    tiles, banner, next, today: date,
    agenda, allAgenda, assignedItemIds, activities: states, days, day: pickDay(days, requestedDay, date),
    announcements, now: { date, time },
  };
}
