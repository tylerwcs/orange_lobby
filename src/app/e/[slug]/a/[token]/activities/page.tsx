import { loadPortalAttendee } from "@/lib/portal";
import { listActivities, listSessions, countBookingsBySession, bookingsForAttendee, submissionsForAttendee } from "@/lib/db/activities";
import { requestsForAttendee } from "@/lib/db/activity-requests";
import { activityState } from "@/lib/activities";
import { activityControls, pendingFor, lastDeclinedFor } from "@/lib/activity-requests";
import { canSubmit } from "@/lib/submissions";
import { nowInKL } from "@/lib/time";
import { ActivityList } from "@/components/portal/ActivityList";
import { SubmissionList } from "@/components/portal/SubmissionList";
import { bookAction, requestSwitchAction, requestCancelAction, withdrawRequestAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Both kinds of activity, on the one page an attendee has always had (D178). A booking activity
 * still books inline through `ActivityList`, exactly as before the merge; a submission activity
 * renders through `SubmissionList` (was `FormList`) and links out to its own page, also exactly
 * as before — the merge only put both lists behind one route instead of two.
 */
export default async function ActivitiesPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const [activities, sessions, counts, mine, requests, submissions] = await Promise.all([
    listActivities(event.id),
    listSessions(event.id),
    countBookingsBySession(event.id),
    bookingsForAttendee(attendee.id),
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
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-extrabold">Activities</h1>
      {bookingActivities.length > 0 && (
        <ActivityList
          entries={bookingEntries}
          book={bookAction.bind(null, slug, token)}
          requestSwitch={requestSwitchAction.bind(null, slug, token)}
          requestCancel={requestCancelAction.bind(null, slug, token)}
          withdraw={withdrawRequestAction.bind(null, slug, token)}
        />
      )}
      {submissionActivities.length > 0 && (
        <SubmissionList entries={submissionEntries} basePath={`/e/${slug}/a/${token}/activities`} />
      )}
      {bookingActivities.length === 0 && submissionActivities.length === 0 && (
        <p className="text-sm text-muted-foreground">There is nothing here for this event yet.</p>
      )}
    </div>
  );
}
