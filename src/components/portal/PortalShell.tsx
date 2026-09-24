import type { Event } from "@/lib/types";
import { isUnpublished, portalHasInfo } from "@/lib/portal";
import { PortalChrome } from "./PortalChrome";

/**
 * The portal's chrome, for the pages that still render it themselves.
 *
 * The personal portal does not: its chrome lives in `a/[token]/layout.tsx` so the header and
 * the bottom bar survive a navigation instead of being rebuilt by whichever page you land on.
 * The anonymous portal still calls this, because moving its chrome into a layout needs a route
 * group — `e/[slug]/layout.tsx` also wraps the personal pages and the register pages — and that
 * is a separate change (D113).
 *
 * `current`, `hero` and `dashboard` are accepted and ignored. PortalChrome reads the URL now,
 * which is the same answer these props were carrying by hand. They stay in the signature so
 * the anonymous pages did not all have to change for a refactor that is not about them; when
 * the anonymous portal moves too, this component and these props go together.
 */
export async function PortalShell({ event, basePath, personal, children }: {
  event: Event;
  basePath: string;
  personal: boolean;
  current?: "" | "/agenda" | "/me" | "/info" | null;
  hero?: boolean;
  dashboard?: boolean;
  children: React.ReactNode;
}) {
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
    <PortalChrome event={chromeEvent} basePath={basePath} personal={personal} hasInfo={await portalHasInfo(event.id)}>
      {/* A draft shows only PortalChrome's "Coming soon". Dropped here, on the server, because
          anything handed to that client component is sent to the browser even when it is not
          drawn (see isUnpublished). */}
      {isUnpublished(event) ? null : children}
    </PortalChrome>
  );
}
