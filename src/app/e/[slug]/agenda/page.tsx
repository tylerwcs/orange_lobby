import { loadPortalEvent } from "@/lib/portal";
import { listAgenda } from "@/lib/db/agenda";
import { visibleTo, groupByDay, pickDay } from "@/lib/agenda";
import { nowInKL } from "@/lib/time";
import { PortalShell } from "@/components/portal/PortalShell";
import { AgendaList } from "@/components/portal/AgendaList";

export default async function GenericAgenda({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ day?: string }> }) {
  const { slug } = await params; const { day: requested } = await searchParams;
  const event = await loadPortalEvent(slug);
  const basePath = `/e/${slug}`;
  const items = visibleTo(await listAgenda(event.id), null);
  const days = groupByDay(items).map((d) => d.day);
  const now = nowInKL();
  const day = pickDay(days, requested, now.date);
  return (
    <PortalShell event={event} basePath={basePath} personal={false} current="/agenda">
      {/* The public agenda gets the same masthead as the personal one — it is the event's
          agenda either way, and an attendee who has not opened their link yet should see
          the same page dressed the same (D160). */}
      {event.agenda_banner_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.agenda_banner_url}
          alt=""
          className="mb-3 h-28 w-full rounded-[14px] border border-border object-cover sm:h-36"
        />
      )}
      <h1 className="mb-3 text-xl font-extrabold">Agenda</h1>
      <AgendaList items={items} day={day} days={days} basePath={basePath} now={now} />
    </PortalShell>
  );
}
