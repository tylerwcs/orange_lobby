import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPortalLink, portalHasInfo } from "@/lib/portal";
import { hasAnyCheckin } from "@/lib/db/checkins";
import { CancelRequestNote, CancelSection, CancelledCard, canSelfCancel, klDayTime, registrationOpenNow, requestCancelAction, withdrawCancelRequestAction } from "@/features/cancel";
import { loadActivityNav } from "@/lib/portal-home";
import { PortalChrome } from "@/components/portal/PortalChrome";
import { ConsentGate } from "@/components/portal/ConsentGate";
import { consentAction } from "./consent-actions";
import { eventTermsHtml, portalAsks } from "@/lib/privacy";
import { Toaster } from "@/components/ui/toaster";
import { Flash } from "@/components/admin/Flash";
import { ThemeStyle } from "@/features/theme";
import { QueueCard, resolveTokenView } from "@/features/registration-queue";

/**
 * Home-screen install (D227): this attendee's own manifest, so the icon opens their page, and
 * the iOS tags that make it open full screen under the event's name. No database read beyond
 * the one the layout already makes - `loadPortalLink` is memoised per request.
 * It resolves every link the layout does (D585, D689): a cancelled attendee's, and a waiting or
 * pending person's, so their card is not a 404.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string; token: string }> }): Promise<Metadata> {
  const { slug, token } = await params;
  const { event } = await loadPortalLink(slug, token);
  return {
    manifest: `/e/${slug}/a/${token}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: event.name, statusBarStyle: "default" },
  };
}

/**
 * The personal portal's chrome lives here rather than in each page, so the header is rendered
 * once and stays put. A page below only renders its own body.
 *
 * `loadPortalLink` is memoised per request and shares its attendee read with the page's
 * `loadPortalAttendee`, so this costs nothing that the page below was not already paying (D118).
 *
 * D689: what the link shows, in order - an active attendee gets the portal; else a waiting-list
 * or pending entry (or one that was declined, left or removed) gets the queue card; else a
 * cancelled attendee gets the cancelled card; else 404 (`resolveTokenView`). The entry comes
 * before the cancelled card because a returning cancelled person shares one token with their
 * entry (D695). Neither card renders the children, and every page and action below still gates
 * on `loadPortalAttendee`, which refuses anyone but an active attendee.
 */
export default async function PersonalLayout({ children, params }: {
  children: React.ReactNode;
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  const { event, attendee: linkAttendee, entry } = await loadPortalLink(slug, token);
  const view = resolveTokenView(linkAttendee, entry);
  if (view.kind === "missing") notFound();
  if (view.kind === "queue") {
    return (
      <>
        <ThemeStyle event={event} />
        <QueueCard event={event} entry={view.entry} />
        {/* Leave / Withdraw lands back here with a flash (D681). */}
        <Suspense fallback={null}><Flash /></Suspense>
        <Toaster />
      </>
    );
  }
  const attendee = view.attendee;
  const chromeEvent = {
    name: event.name,
    logo_url: event.logo_url,
    starts_on: event.starts_on,
    ends_on: event.ends_on,
    venue_name: event.venue_name,
    status: event.status,
    primary_color: event.primary_color,
    banner_url: event.banner_url,
    coming_soon_message: event.coming_soon_message ?? null,
    display_name: event.display_name ?? null,
    display_name_in_bar: event.display_name_in_bar ?? false,
  };
  // D585: a cancelled registration sees only this, on every page under the link - before the
  // consent gate, which has nothing to ask them.
  if (view.kind === "cancelled") {
    return (
      <>
        <ThemeStyle event={event} />
        <CancelledCard event={chromeEvent} registerHref={registrationOpenNow(event, new Date()) ? `/e/${slug}/register` : null} />
      </>
    );
  }
  // PDPA consent first (D410), for every page under the link, before anything personal is
  // shown; and the event's terms, for anyone the registration form never asked (D543).
  const asks = portalAsks(event, attendee);
  if (asks.consent || asks.terms) {
    return (
      <>
        <ThemeStyle event={event} />
        <ConsentGate event={event} consent={asks.consent} termsHtml={asks.terms ? eventTermsHtml(event) : null} agree={consentAction.bind(null, slug, token)} />
      </>
    );
  }
  const [activities, hasInfo] = await Promise.all([loadActivityNav(event, attendee), portalHasInfo(event.id, attendee.category)]);
  // D585: a draft shows only Coming soon, so the cancel link rides in under it. Built here on
  // the server (the chrome is a client component). D595/D596: a waiting request shows its note with
  // Withdraw instead of the link; a decline shows its note above the link. The check-in read happens
  // only when the link might show.
  const draftCancel = event.status === "draft" && event.self_cancel && !attendee.cancel_requested_at
    && canSelfCancel(event, attendee, await hasAnyCheckin(attendee.id), new Date()).ok
    ? <CancelSection variant="draft" eventName={event.name} until={event.self_cancel_closes_at ? klDayTime(event.self_cancel_closes_at) : null} action={requestCancelAction.bind(null, slug, token)} />
    : null;
  // The decline note shows only while the link below does (they could ask again); the waiting note always shows.
  const draftNote = event.status === "draft" && (attendee.cancel_requested_at || (attendee.cancel_declined_at && draftCancel))
    ? <CancelRequestNote variant="draft" requestedAt={attendee.cancel_requested_at} declinedAt={attendee.cancel_declined_at}
        withdraw={withdrawCancelRequestAction.bind(null, slug, token)} />
    : null;
  const draftExtra = draftNote || draftCancel
    ? <div className="flex flex-col items-center gap-2 text-center">{draftNote}{draftCancel}</div>
    : undefined;
  return (
    <>
      <ThemeStyle event={event} />
      <PortalChrome event={chromeEvent} basePath={`/e/${slug}/a/${token}`} personal activities={activities} hasInfo={hasInfo} draftExtra={draftExtra}>
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
