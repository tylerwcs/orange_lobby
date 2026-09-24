import { loadPortalEvent, portalHasInfo } from "@/lib/portal";
import { listAgenda, listAgendaDays } from "@/lib/db/agenda";
import { visibleTo, dayTabs, pickDay } from "@/lib/agenda";
import { nowInKL } from "@/lib/time";
import { PortalShell } from "@/components/portal/PortalShell";
import { AgendaList } from "@/components/portal/AgendaList";
import { AgendaInfoSwitch } from "@/components/portal/AgendaInfoSwitch";

export default async function GenericAgenda({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ day?: string }> }) {
  const { slug } = await params; const { day: requested } = await searchParams;
  const event = await loadPortalEvent(slug);
  const basePath = `/e/${slug}`;
  const [all, agendaDays, hasInfo] = await Promise.all([listAgenda(event.id), listAgendaDays(event.id), portalHasInfo(event.id)]);
  const items = visibleTo(all, null);
  const days = dayTabs(agendaDays, items);
  const now = nowInKL();
  const day = pickDay(days.map((d) => d.date), requested, now.date);
  return (
    <PortalShell event={event} basePath={basePath} personal={false} current="/agenda">
      {hasInfo && <AgendaInfoSwitch basePath={basePath} current="agenda" />}
      {/* With an info page the switch names this tab, so the heading only needs to be heard. */}
      <h1 className={hasInfo ? "sr-only" : "mb-3 text-xl font-extrabold"}>Agenda</h1>
      <AgendaList items={items} day={day} days={days} basePath={basePath} now={now} />
    </PortalShell>
  );
}
