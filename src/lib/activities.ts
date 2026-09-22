import { categoryMatches, parseCategories, visibleTo, type AgendaViewer } from "@/lib/agenda";
import type { Activity, ActivityBooking, ActivitySession, AgendaItem } from "@/lib/types";
import type { BookResult } from "@/lib/db/activities";
import type { FlashTone } from "@/lib/flash";

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

/**
 * Every session's booked attendee ids, sorted into `attendeeIds`' own order rather than the
 * order bookings happen to arrive in (`listBookings` has no `ORDER BY`). The same trick
 * `rosters()` in `src/lib/breakouts.ts` plays for breakout rooms: `attendeeIds` is expected to
 * already be alphabetical (`listAttendees`'s order), so ranking bookings into it makes every
 * session's list both deterministic and printable as-is.
 *
 * Every id in `sessionIds` gets an entry, even one with zero bookings — an empty room is still
 * a room the door list has to name, not one this function is entitled to drop from the map.
 */
export function sessionRosters(
  sessionIds: string[],
  bookings: Pick<ActivityBooking, "session_id" | "attendee_id">[],
  attendeeIds: string[],
): Map<string, string[]> {
  const rank = new Map(attendeeIds.map((id, i) => [id, i]));
  const bySession = new Map<string, string[]>(sessionIds.map((id) => [id, []]));
  for (const b of bookings) {
    const list = bySession.get(b.session_id);
    if (list) list.push(b.attendee_id);
  }
  for (const list of bySession.values()) list.sort((x, y) => (rank.get(x) ?? Infinity) - (rank.get(y) ?? Infinity));
  return bySession;
}

export type ActivityUnbooked = { activityId: string; attendeeIds: string[] };

/**
 * The not-booked list for every activity (D130) — required or optional alike, since the desk
 * chases an optional tour too, even though only a required activity's empty seat is a problem
 * the desk actually has to solve before the event runs. Computed one activity at a time rather
 * than pooled across them: an attendee who has booked activity A but not B still needs to show
 * up on B's list, so "already booked something" is never grounds to drop them from a different
 * activity's list.
 */
export function unbookedByActivity(
  activities: Pick<Activity, "id" | "required" | "categories">[],
  bookings: Pick<ActivityBooking, "activity_id" | "attendee_id">[],
  attendeeIds: string[],
  categoryOf: (attendeeId: string) => string | null,
): ActivityUnbooked[] {
  return activities.map((activity) => {
    const bookedIds = new Set(bookings.filter((b) => b.activity_id === activity.id).map((b) => b.attendee_id));
    return {
      activityId: activity.id,
      attendeeIds: unbookedIds(attendeeIds, (id) => eligible(activity, categoryOf(id)), bookedIds),
    };
  });
}

export type ActivitySummary = {
  activityId: string;
  name: string;
  required: boolean;
  sessions: number;
  capacity: number;
  booked: number;
  left: number;
  /** Eligible attendees holding nothing in this activity. */
  unbooked: number;
};

/**
 * One line per activity for the Overview an event without check-in shows instead of
 * arrivals (D159).
 *
 * Every number here comes from `seatsFor` and `unbookedByActivity` rather than from
 * arithmetic of its own, for the reason the activity detail page already gives about
 * counting the unbooked: two implementations of the same count are how they end up
 * disagreeing. This function only groups and adds.
 *
 * An activity with no sessions yet keeps its row, showing zeros. It is exactly the
 * activity an organiser most needs to see from the Overview — the one nobody can book.
 */
export function activitySummaries(
  activities: Activity[],
  sessions: ActivitySession[],
  counts: Record<string, number>,
  bookings: Pick<ActivityBooking, "activity_id" | "attendee_id">[],
  attendeeIds: string[],
  categoryOf: (attendeeId: string) => string | null,
): ActivitySummary[] {
  const unbooked = new Map(
    unbookedByActivity(activities, bookings, attendeeIds, categoryOf).map((u) => [u.activityId, u.attendeeIds.length]),
  );
  return activities.map((activity) => {
    const seats = sessions
      .filter((s) => s.activity_id === activity.id)
      .map((s) => seatsFor(s, counts[s.id] ?? 0));
    return {
      activityId: activity.id,
      name: activity.name,
      required: activity.required,
      sessions: seats.length,
      capacity: seats.reduce((n, s) => n + s.session.capacity, 0),
      booked: seats.reduce((n, s) => n + s.booked, 0),
      left: seats.reduce((n, s) => n + s.left, 0),
      unbooked: unbooked.get(activity.id) ?? 0,
    };
  });
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
    // Not an agenda item: the picture belongs to `agenda_items`, and this row was built
    // from an `activity_sessions` row that has no column for one (D160).
    image_url: null,
    sort_order: s.sort_order,
  }));
}

/** The agenda with the attendee's bookings folded in, in the order the day runs. */
export function mergeAgenda(items: AgendaItem[], derived: AgendaItem[]): AgendaItem[] {
  if (derived.length === 0) return items;
  return [...items, ...derived].sort((a, b) =>
    a.day.localeCompare(b.day) || a.starts_at.localeCompare(b.starts_at) || a.sort_order - b.sort_order);
}

/**
 * The one agenda this attendee is shown: the organiser's programme filtered to them, with
 * their own booked sessions folded in. The portal home and the personal agenda page both call
 * this rather than each composing `visibleTo` and `mergeAgenda` themselves, so the ordering
 * decision below lives in exactly one place.
 *
 * A derived row is immune to both of `visibleTo`'s filters by construction, not as a side
 * effect of running this filter-then-merge: `bookedAgendaRows` sets `categories: null`, so
 * `categoryMatches` always passes it, and `slot: null`, so `isBreakout` is always false for it.
 * Filtering before merging therefore changes nothing about today's output — merging first would
 * produce the same result. It is still done in this order on purpose: it means a future filter
 * dimension that is *not* immune the same way runs before the merge too, and so cannot silently
 * drop somebody's own booking just because it was added after the merge already happened.
 */
export function personalAgenda(allAgenda: AgendaItem[], viewer: AgendaViewer, bookedSessions: ActivitySession[]): AgendaItem[] {
  return mergeAgenda(visibleTo(allAgenda, viewer), bookedAgendaRows(bookedSessions));
}

/** The raw fields both the add form and the settings form post, already pulled out of FormData. */
export type ActivityFormFields = {
  name: string;
  description: string;
  required: boolean;
  max_per_attendee: string;
  categories: string;
};

/** Everything the add form and the settings form agree on. See the note below for what is left out and why. */
export type ActivityPolicy = {
  name: string;
  description: string | null;
  required: boolean;
  max_per_attendee: number;
  categories: string[] | null;
};

/**
 * Validates and shapes the fields the add form and the settings form share. Deliberately does
 * NOT touch `booking_open`: that column is owned by `toggleBookingAction` alone (D127), which
 * is the one control the desk uses mid-event and must not need a Save. The settings form
 * (Task 9) has no `booking_open` checkbox at all, so if this reader's output were fed straight
 * into `updateActivity` with a `booking_open` key, its absence from that form would read as a
 * deliberate "no" — the moment an organiser edits an activity's name and hits Save, booking
 * would silently close for everyone, undoing whatever the toggle button last set. Keeping this
 * reader's return type without a `booking_open` field at all makes that mistake impossible to
 * reintroduce by accident; `readNewActivity` below is the one place that ever adds it back, for
 * the one form that is allowed to set an initial value.
 */
export function readActivityPolicy(fields: ActivityFormFields): ActivityPolicy {
  const name = fields.name.trim();
  if (!name) throw new Error("An activity needs a name");
  const raw = fields.max_per_attendee.trim() || "1";
  const max = Number.parseInt(raw, 10);
  if (!Number.isFinite(max) || max < 1 || max > 10) {
    throw new Error("Sessions per person must be a whole number between 1 and 10");
  }
  return {
    name,
    description: fields.description.trim() || null,
    required: fields.required,
    max_per_attendee: max,
    categories: parseCategories(fields.categories),
  };
}

/**
 * The full create payload: the shared policy plus `booking_open`, which only the create form
 * may set — it is choosing an initial value for a column nothing has toggled yet, not
 * overwriting one the desk may have changed since the page loaded. `saveActivityAction` must
 * call `readActivityPolicy` directly instead, never this.
 */
export function readNewActivity(fields: ActivityFormFields & { booking_open: boolean }): ActivityPolicy & { booking_open: boolean } {
  return { ...readActivityPolicy(fields), booking_open: fields.booking_open };
}

/**
 * Turns the desk's placement batch into the sentence the organiser needs.
 *
 * Follows `describeAssignment` in `@/lib/breakouts.ts`: the outcome is counted, not assumed.
 * "12 placed, 3 refused — the session is full" is what tells the organiser three people still
 * need somewhere to go; "Placed." would hide that. `bookSession` (with `ignoreOpen`) is the
 * only thing that can refuse a placement (capacity, D126/D130) — every outcome that is not
 * "ok" or "full" is grouped as "could not be placed" rather than named individually, because
 * "closed"/"limit"/"ineligible"/"missing" would only ever be a race against something the page
 * had no way to warn about a render ago.
 */
export function describePlacement(outcomes: BookResult[], sessionTitle: string): { message: string; tone: FlashTone } {
  const placed = outcomes.filter((o) => o === "ok").length;
  const full = outcomes.filter((o) => o === "full").length;
  const other = outcomes.length - placed - full;
  const message = [
    `${placed} placed in ${sessionTitle}`,
    full ? `${full} refused — the session is full` : "",
    other ? `${other} could not be placed` : "",
  ].filter(Boolean).join(", ") + ".";
  return { message, tone: full || other ? "error" : "ok" };
}
