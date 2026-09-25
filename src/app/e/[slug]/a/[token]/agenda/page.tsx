import { loadPortalAttendee, portalActivities, portalBookings, isUnpublished } from "@/lib/portal";
import { listAgenda, listAgendaDays } from "@/lib/db/agenda";
import { assignedItemIdsFor } from "@/lib/db/breakouts";
import { listSessions } from "@/lib/db/activities";
import { isBreakout } from "@/lib/breakouts";
import { dayTabs, pickDay } from "@/lib/agenda";
import { personalAgenda } from "@/lib/activities";
import { nowInKL } from "@/lib/time";
import { AgendaList } from "@/components/portal/AgendaList";

export default async function PersonalAgenda({ params, searchParams }: { params: Promise<{ slug: string; token: string }>; searchParams: Promise<{ day?: string }> }) {
  const { slug, token } = await params; const { day: requested } = await searchParams;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  // A draft shows only "Coming soon" (the layout's chrome); see isUnpublished.
  if (isUnpublished(event)) return null;
  const basePath = `/e/${slug}/a/${token}`;
  // Only touch the activity tables when this event actually runs activities - same guard
  // loadHomeData uses, so this page and the portal home never disagree about what a booked
  // session looks like. Same two round trips as loadHomeData, too: what decides the rest
  // first, then everything that depends on it together.
  const [allAgenda, agendaDays, activities] = await Promise.all([listAgenda(event.id), listAgendaDays(event.id), portalActivities(event.id)]);
  const [assignedItemIds, myBookings, sessions] = await Promise.all([
    allAgenda.some(isBreakout) ? assignedItemIdsFor(attendee.id) : new Set<string>(),
    activities.length ? portalBookings(attendee.id) : [],
    activities.length ? listSessions(event.id) : [],
  ]);
  const bookedSessions = sessions.filter((s) => myBookings.some((b) => b.session_id === s.id));
  // Same composition loadHomeData uses - see personalAgenda's own doc for the ordering.
  const items = personalAgenda(
    allAgenda,
    { category: attendee.category, assignedItemIds },
    bookedSessions,
    new Map(activities.map((a) => [a.id, a.name])),
  );
  // Each booked row links to its own calendar file, which is addressed by activity and session.
  const activityOf = new Map(bookedSessions.map((s) => [s.id, s.activity_id]));
  const calendarHref = (sessionId: string) => {
    const activityId = activityOf.get(sessionId);
    return activityId ? `${basePath}/activities/${activityId}/calendar.ics?session=${sessionId}` : null;
  };
  const days = dayTabs(agendaDays, items);
  const now = nowInKL();
  const day = pickDay(days.map((d) => d.date), requested, now.date);
  return (
    <>
      <h1 className="mb-3 text-xl font-extrabold">Agenda</h1>
      <AgendaList items={items} day={day} days={days} basePath={basePath} now={now} calendarHref={calendarHref} />
    </>
  );
}
