import { loadPortalAttendee } from "@/lib/portal";
import { listAgenda } from "@/lib/db/agenda";
import { visibleTo, groupByDay, pickDay } from "@/lib/agenda";
import { nowInKL } from "@/lib/time";
import { PortalShell } from "@/components/portal/PortalShell";
import { AgendaList } from "@/components/portal/AgendaList";

export default async function PersonalAgenda({ params, searchParams }: { params: Promise<{ slug: string; token: string }>; searchParams: Promise<{ day?: string }> }) {
  const { slug, token } = await params; const { day: requested } = await searchParams;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const basePath = `/e/${slug}/a/${token}`;
  const items = visibleTo(await listAgenda(event.id), attendee.category);
  const days = groupByDay(items).map((d) => d.day);
  const now = nowInKL();
  const day = pickDay(days, requested, now.date);
  return (
    <PortalShell event={event} basePath={basePath} personal current="/agenda">
      <h1 className="mb-3 text-xl font-extrabold">Agenda</h1>
      <AgendaList items={items} day={day} days={days} basePath={basePath} now={now} />
    </PortalShell>
  );
}
