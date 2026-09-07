import { loadPortalEvent } from "@/lib/portal";
import { listAgenda } from "@/lib/db/agenda";
import { visibleTo } from "@/lib/agenda";
import { PortalShell } from "@/components/portal/PortalShell";
import { AgendaList } from "@/components/portal/AgendaList";

export default async function GenericAgenda({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await loadPortalEvent(slug);
  const items = visibleTo(await listAgenda(event.id), null);
  return <PortalShell event={event} basePath={`/e/${slug}`} personal={false}><AgendaList items={items} /></PortalShell>;
}
