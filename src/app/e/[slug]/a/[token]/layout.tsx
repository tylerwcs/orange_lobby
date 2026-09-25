import { Suspense } from "react";
import type { Metadata } from "next";
import { loadPortalAttendee, portalHasInfo } from "@/lib/portal";
import { loadActivityNav } from "@/lib/portal-home";
import { PortalChrome } from "@/components/portal/PortalChrome";
import { Toaster } from "@/components/ui/toaster";
import { Flash } from "@/components/admin/Flash";

/**
 * Home-screen install (D227): this attendee's own manifest, so the icon opens their page, and
 * the iOS tags that make it open full screen under the event's name. No database read beyond
 * the one the layout already makes - `loadPortalAttendee` is memoised per request.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string; token: string }> }): Promise<Metadata> {
  const { slug, token } = await params;
  const { event } = await loadPortalAttendee(slug, token);
  return {
    manifest: `/e/${slug}/a/${token}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: event.name, statusBarStyle: "default" },
  };
}

/**
 * The personal portal's chrome lives here rather than in each page, so the header is rendered
 * once and stays put. A page below only renders its own body.
 *
 * `loadPortalAttendee` is memoised per request, so this costs nothing that the page below was
 * not already paying (D118).
 */
export default async function PersonalLayout({ children, params }: {
  children: React.ReactNode;
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const [activities, hasInfo] = await Promise.all([loadActivityNav(event, attendee), portalHasInfo(event.id)]);
  const chromeEvent = {
    name: event.name,
    logo_url: event.logo_url,
    starts_on: event.starts_on,
    ends_on: event.ends_on,
    venue_name: event.venue_name,
    status: event.status,
    primary_color: event.primary_color,
    banner_url: event.banner_url,
  };
  return (
    <>
      <PortalChrome event={chromeEvent} basePath={`/e/${slug}/a/${token}`} personal activities={activities} hasInfo={hasInfo}>
        {children}
      </PortalChrome>
      {/* This is the only part of the portal that announces results through flashPath() today
          (registration writes too, but from a page outside this layout), so it is the only
          portal layout that needs to turn a flashPath() redirect into something on screen.
          Kept a sibling of PortalChrome, not nested inside its children, because PortalChrome's
          draft-event branch does not render children at all - nesting here would silently stop
          announcing anything for a draft event. `useSearchParams` needs a boundary it can
          suspend at; the toast stack itself is not tied to the URL and mounts outside it. */}
      <Suspense fallback={null}><Flash /></Suspense>
      <Toaster />
    </>
  );
}
