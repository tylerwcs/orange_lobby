import "server-only";
import { bookingsForAttendee, countBookingsBySession, getActivity, listSessions, seatsFor } from "@/features/activities";
import { nowInKL } from "@/lib/time";
import type { Activity, Attendee, Event } from "@/lib/types";
import { bookableAfterRegister } from "./lib/landing";

export type NextBooking = {
  activity: Activity;
  /** The days its bookable sessions fall on, for "Sat 8 Nov". */
  days: string[];
  /** Seats left across the sessions still to come. */
  left: number;
};

/**
 * D766, D799: the booking the done page offers as the next step - the activity the organiser set
 * to open after registering, when this person can book it now and has not already. Null, and the
 * page shows no next step, otherwise. A failed read is a null too: it never stands between
 * someone and their link.
 */
export async function nextBooking(event: Pick<Event, "id" | "after_register_activity_id">, attendee: Pick<Attendee, "id" | "category">): Promise<NextBooking | null> {
  if (!event.after_register_activity_id) return null;
  try {
    const [activity, sessions, counts, held] = await Promise.all([
      getActivity(event.after_register_activity_id, event.id),
      listSessions(event.id),
      countBookingsBySession(event.id),
      bookingsForAttendee(attendee.id),
    ]);
    if (!activity || held.some((b) => b.activity_id === activity.id)) return null;
    const now = nowInKL();
    if (!bookableAfterRegister({ activity, sessions, counts, category: attendee.category, now })) return null;
    const ahead = sessions.filter((s) => s.activity_id === activity.id && (s.day > now.date || (s.day === now.date && s.starts_at > now.time)));
    return {
      activity,
      days: [...new Set(ahead.map((s) => s.day))],
      left: ahead.reduce((n, s) => n + seatsFor(s, counts[s.id] ?? 0).left, 0),
    };
  } catch (e) {
    console.error("nextBooking: could not check the booking to offer", e);
    return null;
  }
}
