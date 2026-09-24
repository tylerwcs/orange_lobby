import type { Event, InfoTab } from "@/lib/types";

/** The fixed Venue tab's key in `?tab=` (D206). No stored tab can collide: those are uuids. */
export const VENUE_TAB = "venue";

/** The Settings fields the Venue tab draws (D204). */
export type VenueFields = Pick<Event, "venue_name" | "venue_address" | "venue_map_url" | "description" | "contact_name" | "contact_phone">;

/** One tab as an attendee sees it: the Venue tab (no HTML - it is drawn from Settings) or an organiser's tab. */
export type PortalInfoTab = { key: string; title: string; html: string | null };

/**
 * Whether the Venue tab has anything to draw. The same three things the Info page has always
 * shown at its top: the venue (its address and map live under its name), the description, and
 * the contact line - so an address with no venue name draws nothing, as before.
 */
export function hasVenue(e: VenueFields): boolean {
  return Boolean(e.venue_name || e.description || e.contact_name);
}

/**
 * Whether the event has an Info section at all (D205): at least one organiser tab with
 * content. Venue details alone do not make one - the desktop venue card already shows them.
 */
export function hasInfo(tabs: Pick<InfoTab, "html">[]): boolean {
  return tabs.some((t) => Boolean(t.html?.trim()));
}

/** The tabs attendees see (D204-D205): Venue first when there is one, then non-empty tabs in hand order. */
export function portalInfoTabs(event: VenueFields, tabs: InfoTab[]): PortalInfoTab[] {
  const out: PortalInfoTab[] = [];
  if (hasVenue(event)) out.push({ key: VENUE_TAB, title: "Venue", html: null });
  for (const t of [...tabs].sort((a, b) => a.sort_order - b.sort_order)) {
    if (t.html?.trim()) out.push({ key: t.id, title: t.title, html: t.html });
  }
  return out;
}

/** The tab `?tab=` names, else the first one - a stale or hand-typed link still lands somewhere. */
export function pickInfoTab(tabs: PortalInfoTab[], requested: string | undefined): PortalInfoTab | null {
  return tabs.find((t) => t.key === requested) ?? tabs[0] ?? null;
}
