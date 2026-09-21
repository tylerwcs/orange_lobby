import { loadPortalAttendee } from "@/lib/portal";
import { listAgenda } from "@/lib/db/agenda";
import { assignedItemIdsFor } from "@/lib/db/breakouts";
import { listActivities, listSessions, bookingsForAttendee } from "@/lib/db/activities";
import { isBreakout } from "@/lib/breakouts";
import { groupByDay, pickDay } from "@/lib/agenda";
import { personalAgenda } from "@/lib/activities";
import { nowInKL } from "@/lib/time";
import { AgendaList } from "@/components/portal/AgendaList";

export default async function PersonalAgenda({ params, searchParams }: { params: Promise<{ slug: string; token: string }>; searchParams: Promise<{ day?: string }> }) {
  const { slug, token } = await params; const { day: requested } = await searchParams;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const basePath = `/e/${slug}/a/${token}`;
  const allAgenda = await listAgenda(event.id);
  const assignedItemIds = allAgenda.some(isBreakout) ? await assignedItemIdsFor(attendee.id) : new Set<string>();
  // Only touch the activity tables when this event actually runs activities - same guard
  // loadHomeData uses, so this page and the portal home never disagree about what a booked
  // session looks like. `listSessions` does not depend on `myBookings`, so the two run
  // together rather than one after the other.
  const activities = await listActivities(event.id);
  const [myBookings, sessions] = activities.length
    ? await Promise.all([bookingsForAttendee(attendee.id), listSessions(event.id)])
    : [[], []];
  const bookedSessions = sessions.filter((s) => myBookings.some((b) => b.session_id === s.id));
  // Same composition loadHomeData uses - see personalAgenda's own doc for the ordering.
  const items = personalAgenda(allAgenda, { category: attendee.category, assignedItemIds }, bookedSessions);
  const days = groupByDay(items).map((d) => d.day);
  const now = nowInKL();
  const day = pickDay(days, requested, now.date);
  return (
    <>
      <h1 className="mb-3 text-xl font-extrabold">Agenda</h1>
      <AgendaList items={items} day={day} days={days} basePath={basePath} now={now} />
    </>
  );
}
