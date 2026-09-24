import { loadPortalAttendee, portalInfoTabsFor, isUnpublished } from "@/lib/portal";
import { hasInfo, pickInfoTab, portalInfoTabs } from "@/lib/info-tabs";
import { InfoPage } from "@/components/portal/InfoPage";

export default async function PersonalInfo({ params, searchParams }: {
  params: Promise<{ slug: string; token: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug, token } = await params;
  const { tab } = await searchParams;
  const { event } = await loadPortalAttendee(slug, token);
  // A draft shows only "Coming soon" (the layout's chrome); see isUnpublished.
  if (isUnpublished(event)) return null;
  const stored = await portalInfoTabsFor(event.id);
  const tabs = portalInfoTabs(event, stored);
  return <InfoPage event={event} tabs={tabs} selected={pickInfoTab(tabs, tab)} basePath={`/e/${slug}/a/${token}`} hasInfo={hasInfo(stored)} />;
}
