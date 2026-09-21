import { categoryMatches } from "@/lib/agenda";
import type { Activity, ActivitySession, AgendaItem } from "@/lib/types";

/**
 * Everything about one session that a screen needs and a database row does not carry: how
 * many seats are gone, how many are left, whether it is full.
 *
 * These numbers were true when the page rendered and are stale by definition (D134).
 * `book_session` is the only authority; this decides what to draw, never what to allow.
 */
export type SessionSeats = { session: ActivitySession; booked: number; left: number; full: boolean };

export function seatsFor(session: ActivitySession, booked: number): SessionSeats {
  // An organiser may lower a capacity below the bookings already taken. Clamping at zero
  // keeps "minus two seats left" off the card and keeps `full` honest.
  const left = Math.max(0, session.capacity - booked);
  return { session, booked, left, full: left === 0 };
}

export function eligible(activity: Pick<Activity, "categories">, category: string | null): boolean {
  return categoryMatches(activity.categories, category);
}

export type SeatsForViewer = SessionSeats & { mine: boolean };

export type StateInput = {
  activity: Activity;
  sessions: ActivitySession[];
  /** Bookings per session id. A session absent from this map has none. */
  counts: Record<string, number>;
  /** The sessions of this activity this attendee already holds. */
  mine: ReadonlySet<string>;
  category: string | null;
};

export type ActivityState = {
  activity: Activity;
  sessions: SeatsForViewer[];
  eligible: boolean;
  closed: boolean;
  /** How many sessions of this activity the attendee holds. */
  held: number;
  canBookMore: boolean;
  /** A required activity they hold nothing in. Satisfied by one booking, never by the cap (D129). */
  mustPick: boolean;
};

export function activityState(input: StateInput): ActivityState {
  const { activity, sessions, counts, mine, category } = input;
  const seats = sessions.map((s) => ({ ...seatsFor(s, counts[s.id] ?? 0), mine: mine.has(s.id) }));
  const held = seats.filter((s) => s.mine).length;
  const isEligible = eligible(activity, category);
  const closed = !activity.booking_open;
  return {
    activity,
    sessions: seats,
    eligible: isEligible,
    closed,
    held,
    canBookMore: isEligible && !closed && held < activity.max_per_attendee,
    mustPick: activity.required && isEligible && held === 0,
  };
}

/**
 * Whether this attendee may drop the booking they are looking at.
 *
 * Cancelling out of a required activity would put them in the state the activity exists to
 * prevent, and the portal has somewhere better to send them — the other sessions (D129).
 */
export function canCancel(activity: Pick<Activity, "required">, held: number): boolean {
  return !activity.required || held > 1;
}

/**
 * The people the desk has to chase: eligible, and holding nothing.
 *
 * Order is the caller's, which is `listAttendees` order — already alphabetical, which is what
 * a list somebody reads down wants.
 */
export function unbookedIds(
  attendeeIds: string[],
  eligibleFor: (attendeeId: string) => boolean,
  bookedIds: ReadonlySet<string>,
): string[] {
  return attendeeIds.filter((id) => eligibleFor(id) && !bookedIds.has(id));
}

/** Marks an agenda row that came from a booking rather than from `agenda_items`. */
export const BOOKING_ROW_PREFIX = "booking:";

export function isBookedRow(item: AgendaItem): boolean {
  return item.id.startsWith(BOOKING_ROW_PREFIX);
}

/**
 * A booked session, shaped as an agenda row (D133).
 *
 * Derived at read time and never written to `agenda_items`, so the organiser's timetable
 * stays the organiser's. The prefixed id is the same trick `resolveTiles` uses for `tile:`
 * ids: it keeps the row inside the existing type while staying recognisable to the one
 * component that renders it differently.
 */
export function bookedAgendaRows(sessions: ActivitySession[]): AgendaItem[] {
  return sessions.map((s) => ({
    id: `${BOOKING_ROW_PREFIX}${s.id}`,
    event_id: s.event_id,
    day: s.day,
    starts_at: s.starts_at,
    ends_at: s.ends_at,
    title: s.title,
    description: null,
    location: s.location,
    // Already personal: these rows are this attendee's bookings, so no filter may remove them.
    categories: null,
    slot: null,
    code: null,
    color: null,
    sort_order: s.sort_order,
  }));
}

/** The agenda with the attendee's bookings folded in, in the order the day runs. */
export function mergeAgenda(items: AgendaItem[], derived: AgendaItem[]): AgendaItem[] {
  if (derived.length === 0) return items;
  return [...items, ...derived].sort((a, b) =>
    a.day.localeCompare(b.day) || a.starts_at.localeCompare(b.starts_at) || a.sort_order - b.sort_order);
}
