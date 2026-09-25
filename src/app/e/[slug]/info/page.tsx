import { loadPortalEvent, portalInfoTabsFor } from "@/lib/portal";
import { pickInfoTab, portalInfoTabs } from "@/lib/info-tabs";
import { PortalShell } from "@/components/portal/PortalShell";
import { InfoPage } from "@/components/portal/InfoPage";

export default async function GenericInfo({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  const { tab } = await searchParams;
  const event = await loadPortalEvent(slug);
  const stored = await portalInfoTabsFor(event.id);
  const tabs = portalInfoTabs(stored);
  return (
    <PortalShell event={event} basePath={`/e/${slug}`} personal={false} current="/info">
      <InfoPage event={event} tabs={tabs} selected={pickInfoTab(tabs, tab)} basePath={`/e/${slug}`} />
    </PortalShell>
  );
}
