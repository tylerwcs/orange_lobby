import { loadPortalAttendee } from "@/lib/portal";
import { listActivities, listSessions, countBookingsBySession, bookingsForAttendee } from "@/lib/db/activities";
import { requestsForAttendee } from "@/lib/db/activity-requests";
import { activityState } from "@/lib/activities";
import { activityControls, pendingFor, lastDeclinedFor } from "@/lib/activity-requests";
import { ActivityList } from "@/components/portal/ActivityList";
import { bookAction, requestSwitchAction, requestCancelAction, withdrawRequestAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ActivitiesPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const [activities, sessions, counts, mine, requests] = await Promise.all([
    listActivities(event.id),
    listSessions(event.id),
    countBookingsBySession(event.id),
    bookingsForAttendee(attendee.id),
    requestsForAttendee(attendee.id),
  ]);
  const mineBySession = new Set(mine.map((b) => b.session_id));
  const entries = activities.map((activity) => {
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
  return (
    <>
      <h1 className="mb-3 text-xl font-extrabold">Activities</h1>
      <ActivityList
        entries={entries}
        book={bookAction.bind(null, slug, token)}
        requestSwitch={requestSwitchAction.bind(null, slug, token)}
        requestCancel={requestCancelAction.bind(null, slug, token)}
        withdraw={withdrawRequestAction.bind(null, slug, token)}
      />
    </>
  );
}
