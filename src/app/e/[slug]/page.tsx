import { loadPortalEvent } from "@/lib/portal";
import { PortalShell } from "@/components/portal/PortalShell";
import { EventInfoCard } from "@/components/portal/EventInfoCard";

export default async function GenericHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await loadPortalEvent(slug);
  return <PortalShell event={event} basePath={`/e/${slug}`} personal={false}><EventInfoCard event={event} /></PortalShell>;
}
