import { loadPortalEvent } from "@/lib/portal";
import { listAgenda, listAgendaDays } from "@/lib/db/agenda";
import { visibleTo, dayTabs, pickDay } from "@/lib/agenda";
import { nowInKL } from "@/lib/time";
import { PortalShell } from "@/components/portal/PortalShell";
import { AgendaList } from "@/components/portal/AgendaList";

export default async function GenericAgenda({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ day?: string }> }) {
  const { slug } = await params; const { day: requested } = await searchParams;
  const event = await loadPortalEvent(slug);
  const basePath = `/e/${slug}`;
  const [all, agendaDays] = await Promise.all([listAgenda(event.id), listAgendaDays(event.id)]);
  const items = visibleTo(all, null);
  const days = dayTabs(agendaDays, items);
  const now = nowInKL();
  const day = pickDay(days.map((d) => d.date), requested, now.date);
  return (
    <PortalShell event={event} basePath={basePath} personal={false} current="/agenda">
      <h1 className="mb-3 text-xl font-extrabold">Agenda</h1>
      <AgendaList items={items} day={day} days={days} basePath={basePath} now={now} />
    </PortalShell>
  );
}
