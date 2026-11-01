import "server-only";
import {
  bookingsForAttendee, countBookingsBySession, dayRange, entriesForAttendee, getActivity, listSessions, seatsFor, submitLabel,
} from "@/features/activities";
import { nowInKL } from "@/lib/time";
import type { Activity, Attendee, Event } from "@/lib/types";
import { bookableAfterRegister, stepOpenFor } from "./lib/landing";

export type NextStep = {
  activity: Activity;
  /** The button: "Book my slot", the form's own wording, or "Open it". */
  action: string;
  /** The line under the activity's name: what to do, and for a booking when and how many seats. */
  detail: string;
};

/**
 * D766, D799, D805: the activity the organiser set as the next step after registering, when this
 * person can do it now - a booking with a slot they can still take and none held, a form they have
 * not sent while it runs, anything else open to them. Null otherwise, and they land as usual. A
 * failed read is a null too: it never stands between someone and their link.
 */
export async function nextStep(event: Pick<Event, "id" | "after_register_activity_id">, attendee: Pick<Attendee, "id" | "category">): Promise<NextStep | null> {
  if (!event.after_register_activity_id) return null;
  try {
    const activity = await getActivity(event.after_register_activity_id, event.id);
    if (!activity) return null;
    const now = nowInKL();
    if (activity.kind === "booking") {
      const [sessions, counts, held] = await Promise.all([listSessions(event.id), countBookingsBySession(event.id), bookingsForAttendee(attendee.id)]);
      if (held.some((b) => b.activity_id === activity.id)) return null;
      if (!bookableAfterRegister({ activity, sessions, counts, category: attendee.category, now })) return null;
      const ahead = sessions.filter((s) => s.activity_id === activity.id && (s.day > now.date || (s.day === now.date && s.starts_at > now.time)));
      const left = ahead.reduce((n, s) => n + seatsFor(s, counts[s.id] ?? 0).left, 0);
      const when = dayRange([...new Set(ahead.map((s) => s.day))]);
      return { activity, action: "Book my slot", detail: ["Book your slot now", when, `${left} seat${left === 1 ? "" : "s"} left`].filter(Boolean).join(" · ") };
    }
    const done = activity.kind === "submission" && (await entriesForAttendee(activity.id, attendee.id)).length > 0;
    if (!stepOpenFor({ activity, category: attendee.category, done, today: now.date })) return null;
    return activity.kind === "submission"
      ? { activity, action: submitLabel(activity), detail: "Fill it in now" }
      : { activity, action: "Open it", detail: "Take a look now" };
  } catch (e) {
    console.error("nextStep: could not check the next step to offer", e);
    return null;
  }
}
