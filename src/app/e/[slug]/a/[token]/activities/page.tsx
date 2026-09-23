import { loadPortalAttendee, portalActivities, portalBookings } from "@/lib/portal";
import { listSessions, countBookingsBySession, submissionsForAttendee } from "@/lib/db/activities";
import { requestsForAttendee } from "@/lib/db/activity-requests";
import { activityState } from "@/lib/activities";
import { activityControls, pendingFor, lastDeclinedFor } from "@/lib/activity-requests";
import { canSubmit } from "@/lib/submissions";
import { nowInKL } from "@/lib/time";
import { ActivitiesTab } from "@/components/portal/ActivitiesTab";
import { bookAction, requestSwitchAction, requestCancelAction, withdrawRequestAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * The bar's Activities tab: both kinds of activity on one page (D178), sorted into To choose,
 * Booked and Open to you by `ActivitiesTab`. A booking activity opens its sessions in a sheet
 * and books from there through the same server actions as before; a submission activity links
 * out to its own page, as it always has.
 */
export default async function ActivitiesPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const [activities, sessions, counts, mine, requests, submissions] = await Promise.all([
    portalActivities(event.id),
    listSessions(event.id),
    countBookingsBySession(event.id),
    portalBookings(attendee.id),
    requestsForAttendee(attendee.id),
    submissionsForAttendee(attendee.id),
  ]);
  const bookingActivities = activities.filter((a) => a.kind === "booking");
  const submissionActivities = activities.filter((a) => a.kind === "submission");

  const mineBySession = new Set(mine.map((b) => b.session_id));
  const bookingEntries = bookingActivities.map((activity) => {
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
  const submissionEntries = submissionActivities.map((form) => {
    const mine = submissions.filter((s) => s.activity_id === form.id);
    return { form, state: canSubmit(form, mine, attendee.category, today) };
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-extrabold">Activities</h1>
      <ActivitiesTab
        bookings={bookingEntries}
        submissions={submissionEntries}
        basePath={`/e/${slug}/a/${token}`}
        actions={{
          book: bookAction.bind(null, slug, token),
          requestSwitch: requestSwitchAction.bind(null, slug, token),
          requestCancel: requestCancelAction.bind(null, slug, token),
          withdraw: withdrawRequestAction.bind(null, slug, token),
        }}
      />
    </div>
  );
}
