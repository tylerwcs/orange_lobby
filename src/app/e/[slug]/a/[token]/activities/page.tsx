import { loadPortalAttendee } from "@/lib/portal";
import { listActivities, listSessions, countBookingsBySession, bookingsForAttendee } from "@/lib/db/activities";
import { activityState } from "@/lib/activities";
import { ActivityList } from "@/components/portal/ActivityList";
import { bookAction, switchAction, cancelAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ActivitiesPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const [activities, sessions, counts, mine] = await Promise.all([
    listActivities(event.id),
    listSessions(event.id),
    countBookingsBySession(event.id),
    bookingsForAttendee(attendee.id),
  ]);
  const mineBySession = new Set(mine.map((b) => b.session_id));
  const states = activities.map((activity) => activityState({
    activity,
    sessions: sessions.filter((s) => s.activity_id === activity.id),
    counts,
    mine: mineBySession,
    category: attendee.category,
  }));
  return (
    <>
      <h1 className="mb-3 text-xl font-extrabold">Activities</h1>
      <ActivityList
        states={states}
        book={bookAction.bind(null, slug, token)}
        switchTo={switchAction.bind(null, slug, token)}
        cancel={cancelAction.bind(null, slug, token)}
      />
    </>
  );
}
