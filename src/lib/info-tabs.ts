import type { InfoTab } from "@/lib/types";
import { categoryMatches } from "@/lib/agenda";

/**
 * One tab as an attendee sees it.
 *
 * There used to be a fixed Venue tab first, drawn from the address, map link, description and
 * desk contact on Settings (D204). Those fields went, and the venue name alone already sits in
 * the portal header beside the dates, so the tab went with them: every tab is now one the
 * organiser wrote on the Info page, and venue details belong in one of those.
 */
export type PortalInfoTab = { key: string; title: string; html: string };

/**
 * Whether this viewer has an Info section at all (D205): at least one tab with content that is
 * for them (its categories, as on agenda rows). `category` is the attendee's, or null on the
 * public portal, which sees only tabs for everyone.
 */
export function hasInfo(tabs: Pick<InfoTab, "html" | "categories">[], category: string | null): boolean {
  return tabs.some((t) => Boolean(t.html?.trim()) && categoryMatches(t.categories, category));
}

/** The tabs this viewer sees (D205): non-empty tabs meant for them, in hand order. */
export function portalInfoTabs(tabs: InfoTab[], category: string | null): PortalInfoTab[] {
  return [...tabs]
    .sort((a, b) => a.sort_order - b.sort_order)
    .flatMap((t) => (t.html?.trim() && categoryMatches(t.categories, category) ? [{ key: t.id, title: t.title, html: t.html }] : []));
}

/** The tab `?tab=` names, else the first one - a stale or hand-typed link still lands somewhere. */
export function pickInfoTab(tabs: PortalInfoTab[], requested: string | undefined): PortalInfoTab | null {
  return tabs.find((t) => t.key === requested) ?? tabs[0] ?? null;
}
