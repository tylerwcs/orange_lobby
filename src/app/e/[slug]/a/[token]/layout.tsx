import { Suspense } from "react";
import { loadPortalAttendee } from "@/lib/portal";
import { loadActivityNav } from "@/lib/portal-home";
import { PortalChrome } from "@/components/portal/PortalChrome";
import { Toaster } from "@/components/ui/toaster";
import { Flash } from "@/components/admin/Flash";

/**
 * The personal portal's chrome lives here rather than in each page, so the header and the
 * bottom bar are rendered once and stay put. A page below only renders its own body; tapping
 * a nav item swaps that body and leaves the bar it was tapped on alone.
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
  const activities = await loadActivityNav(event, attendee);
  const chromeEvent = {
    name: event.name,
    logo_url: event.logo_url,
    starts_on: event.starts_on,
    ends_on: event.ends_on,
    venue_name: event.venue_name,
    status: event.status,
    primary_color: event.primary_color,
    banner_url: event.banner_url,
    info_page_html: event.info_page_html,
  };
  return (
    <>
      <PortalChrome event={chromeEvent} basePath={`/e/${slug}/a/${token}`} personal activities={activities}>
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
      {/* PortalChrome's mobile nav (PortalChrome.tsx:130-133) is fixed to the bottom and
          visible below `md`, the same breakpoint the nav itself hides at (`md:hidden`). The
          toast's own default `bottom-4` sits underneath it there, so this attendee's only
          channel for "that booking was refused" would be covered by the very bar they might
          reach for next. `bottom-24` matches the clearance <main> already gives the page body
          for this exact nav (`pb-24 ... md:pb-10` above), rather than a new guessed value; it
          collapses back to the default at `md`, where the nav is hidden and nothing needs
          clearing. Admin passes no className, so its toast is unaffected (see Toaster.tsx). */}
      <Toaster className="bottom-24 md:bottom-4" />
    </>
  );
}
