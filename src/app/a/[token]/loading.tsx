import { PortalShellSkeleton } from "@/components/portal/PortalShellSkeleton";

/**
 * What an attendee sees for the one database round trip between tapping the WhatsApp link and
 * being redirected into their portal. The same shell the destination draws, so the redirect is
 * a continuation rather than a second loading state.
 */
export default function AttendeeShortLinkLoading() {
  return <PortalShellSkeleton />;
}
