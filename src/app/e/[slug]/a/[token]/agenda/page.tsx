import { loadPortalAttendee } from "@/lib/portal";
import { listAgenda } from "@/lib/db/agenda";
import { visibleTo } from "@/lib/agenda";
import { PortalShell } from "@/components/portal/PortalShell";
import { AgendaList } from "@/components/portal/AgendaList";

export default async function PersonalAgenda({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const items = visibleTo(await listAgenda(event.id), attendee.category);
  return <PortalShell event={event} basePath={`/e/${slug}/a/${token}`} personal><AgendaList items={items} /></PortalShell>;
}
