import { loadPortalAttendee, portalActivities, portalBookings, portalHasInfo } from "@/lib/portal";
import { listAgenda, listAgendaDays } from "@/lib/db/agenda";
import { assignedItemIdsFor } from "@/lib/db/breakouts";
import { listSessions } from "@/lib/db/activities";
import { isBreakout } from "@/lib/breakouts";
import { dayTabs, pickDay } from "@/lib/agenda";
import { personalAgenda } from "@/lib/activities";
import { nowInKL } from "@/lib/time";
import { AgendaList } from "@/components/portal/AgendaList";
import { AgendaInfoSwitch } from "@/components/portal/AgendaInfoSwitch";

export default async function PersonalAgenda({ params, searchParams }: { params: Promise<{ slug: string; token: string }>; searchParams: Promise<{ day?: string }> }) {
  const { slug, token } = await params; const { day: requested } = await searchParams;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const basePath = `/e/${slug}/a/${token}`;
  // Only touch the activity tables when this event actually runs activities - same guard
  // loadHomeData uses, so this page and the portal home never disagree about what a booked
  // session looks like. Same two round trips as loadHomeData, too: what decides the rest
  // first, then everything that depends on it together.
  const [allAgenda, agendaDays, activities, hasInfo] = await Promise.all([listAgenda(event.id), listAgendaDays(event.id), portalActivities(event.id), portalHasInfo(event.id)]);
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
  const days = dayTabs(agendaDays, items);
  const now = nowInKL();
  const day = pickDay(days.map((d) => d.date), requested, now.date);
  return (
    <>
      {hasInfo && <AgendaInfoSwitch basePath={basePath} current="agenda" />}
      {/* With an info page the switch names this tab, so the heading only needs to be heard. */}
      <h1 className={hasInfo ? "sr-only" : "mb-3 text-xl font-extrabold"}>Agenda</h1>
      <AgendaList items={items} day={day} days={days} basePath={basePath} now={now} />
    </>
  );
}
