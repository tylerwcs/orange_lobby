import "server-only";
import { portalActivities, portalBookings } from "@/lib/portal";
import { listSessions, countBookingsBySession, submissionsForAttendee } from "@/lib/db/activities";
import { listBooths, stampsForAttendee } from "@/lib/db/booths";
import { requestsForAttendee } from "@/lib/db/activity-requests";
import { activityState, eligible, type ActivityState } from "@/lib/activities";
import { activityControls, pendingFor, lastDeclinedFor, type ActivityControls } from "@/lib/activity-requests";
import { canSubmit, type SubmitState } from "@/lib/submissions";
import { buildPassport, type Passport } from "@/lib/booths";
import { nowInKL } from "@/lib/time";
import type { Activity, ActivitySubmission, Attendee, Event } from "@/lib/types";

export type ActivityEntry = { state: ActivityState; controls: ActivityControls; pendingId: string | null };
export type SubmissionEntry = { form: Activity; state: SubmitState; mine: ActivitySubmission[] };
/** A passport this attendee may collect on, and their card for it. Ineligible ones are left out (D184). */
export type PassportEntry = { activity: Activity; passport: Passport };

/**
 * Every activity one attendee can see, with what they hold in it and what they may do next -
 * the Activities tab's list and each activity's own page read the same answers from here.
 *
 * Reads the whole event's activities even for one activity's page. An event has a handful,
 * and one shape for both pages is worth more than the rows it saves; `portalActivities` and
 * `portalBookings` are memoised, so the layout's nav dot costs nothing extra.
 */
export async function loadActivityEntries(event: Pick<Event, "id">, attendee: Pick<Attendee, "id" | "category">): Promise<{
  bookings: ActivityEntry[];
  submissions: SubmissionEntry[];
  passports: PassportEntry[];
}> {
  const [activities, sessions, counts, mine, requests, submissions, booths, stamps] = await Promise.all([
    portalActivities(event.id),
    listSessions(event.id),
    countBookingsBySession(event.id),
    portalBookings(attendee.id),
    requestsForAttendee(attendee.id),
    submissionsForAttendee(attendee.id),
    listBooths(event.id),
    stampsForAttendee(attendee.id),
  ]);

  const mineBySession = new Set(mine.map((b) => b.session_id));
  const bookings = activities.filter((a) => a.kind === "booking").map((activity) => {
    const state = activityState({
      activity,
      sessions: sessions.filter((s) => s.activity_id === activity.id),
      counts,
      mine: mineBySession,
      category: attendee.category,
    });
    const pending = pendingFor(requests, activity.id);
    const controls = activityControls(state, pending, lastDeclinedFor(requests, activity.id));
    // `PendingSummary` deliberately carries no id (it is for rendering, not addressing), so
    // the raw pending request's id travels alongside `controls` for `withdraw` to bind to.
    return { state, controls, pendingId: pending?.id ?? null };
  });

  const today = nowInKL().date;
  const forms = activities.filter((a) => a.kind === "submission").map((form) => {
    const sent = submissions.filter((s) => s.activity_id === form.id);
    return { form, state: canSubmit(form, sent, attendee.category, today), mine: sent };
  });

  // Hidden outright when ineligible, like a booking: the booth would refuse them anyway, so a
  // card they can never fill is not something to show them.
  const passports = activities
    .filter((a) => a.kind === "passport" && eligible(a, attendee.category))
    .map((activity) => ({
      activity,
      passport: buildPassport(booths.filter((b) => b.activity_id === activity.id), stamps, activity.stamps_required),
    }));

  return { bookings, submissions: forms, passports };
}
