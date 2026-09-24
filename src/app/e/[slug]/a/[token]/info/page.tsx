import { loadPortalAttendee, portalInfoTabsFor } from "@/lib/portal";
import { hasInfo, pickInfoTab, portalInfoTabs } from "@/lib/info-tabs";
import { InfoPage } from "@/components/portal/InfoPage";

export default async function PersonalInfo({ params, searchParams }: {
  params: Promise<{ slug: string; token: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug, token } = await params;
  const { tab } = await searchParams;
  const { event } = await loadPortalAttendee(slug, token);
  const stored = await portalInfoTabsFor(event.id);
  const tabs = portalInfoTabs(event, stored);
  return <InfoPage event={event} tabs={tabs} selected={pickInfoTab(tabs, tab)} basePath={`/e/${slug}/a/${token}`} hasInfo={hasInfo(stored)} />;
}
