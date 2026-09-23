import { loadPortalEvent } from "@/lib/portal";
import { PortalShell } from "@/components/portal/PortalShell";
import { InfoPage } from "@/components/portal/InfoPage";

export default async function GenericInfo({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await loadPortalEvent(slug);
  return (
    <PortalShell event={event} basePath={`/e/${slug}`} personal={false} current="/info">
      <InfoPage event={event} basePath={`/e/${slug}`} />
    </PortalShell>
  );
}
