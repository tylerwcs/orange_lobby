import type { Event } from "@/lib/types";
import { sanitizeHtml } from "@/lib/sanitize";
import { VENUE_TAB, type PortalInfoTab, type VenueFields } from "@/lib/info-tabs";
import { buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeletons";
import { PendingScope, PendingSwap, PendingSwipe } from "@/components/PendingNav";
import { PortalTabStrip } from "./PortalTabStrip";

/**
 * The Info page, for both portals (D206): the section's heading, the tab strip, and the
 * chosen tab - the Venue tab drawn from Settings (D204), or an organiser's tab.
 */
export function InfoPage({ event, tabs, selected, basePath }: {
  event: VenueFields & Pick<Event, "info_page_title">;
  tabs: PortalInfoTab[];
  selected: PortalInfoTab | null;
  basePath: string;
}) {
  const href = (key: string) => `${basePath}/info?tab=${key}`;
  // The tabs either side, for a swipe across the content (D234).
  const at = selected ? tabs.findIndex((t) => t.key === selected.key) : -1;
  const prevHref = at > 0 ? href(tabs[at - 1].key) : null;
  const nextHref = at >= 0 && at < tabs.length - 1 ? href(tabs[at + 1].key) : null;
  return (
    <>
      <h1 className="mb-3 text-xl font-extrabold">{event.info_page_title}</h1>
      {!selected ? (
        <p className="text-sm text-muted-foreground">More information will be published soon.</p>
      ) : (
        // `?tab=` changes no route segment, so no loading.tsx sees it; the scope moves the
        // underline at once and swaps the content for a skeleton until the tab arrives.
        <PendingScope>
          <div className="flex flex-col gap-4">
            <PortalTabStrip
              tabs={tabs.map((t) => ({ key: t.key, href: href(t.key), label: t.title }))}
              selected={selected.key}
            />
            <PendingSwipe prevHref={prevHref} nextHref={nextHref}>
              <PendingSwap fallback={<Skeleton className="h-40 rounded-[14px]" />}>
                {selected.key === VENUE_TAB
                  ? <VenueDetails event={event} />
                  : <div className="rich-text prose prose-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(selected.html ?? "") }} />}
              </PendingSwap>
            </PendingSwipe>
          </div>
        </PendingScope>
      )}
    </>
  );
}

/** Where, what and who to ask - the block the Info page always opened with, now its own tab. */
function VenueDetails({ event }: { event: VenueFields }) {
  return (
    <div className="flex flex-col gap-3">
      {event.venue_name && (
        <div>
          <div className="text-[15px] font-bold">{event.venue_name}</div>
          {event.venue_address && <div className="mt-0.5 text-sm text-muted-foreground">{event.venue_address}</div>}
          {event.venue_map_url && (
            <div className="mt-2">
              {/* Plain anchor: the map is an external site, so it needs target/rel. */}
              <a href={event.venue_map_url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}><Icon name="map" size={18} />Open map</a>
            </div>
          )}
        </div>
      )}
      {event.description && <p className="whitespace-pre-line text-sm text-muted-foreground">{event.description}</p>}
      {event.contact_name && (
        <p className="text-sm text-muted-foreground">
          Contact: {event.contact_name}
          {event.contact_phone && (
            <>
              {" · "}
              <a className="font-semibold text-primary underline" href={`tel:${event.contact_phone}`}>{event.contact_phone}</a>
            </>
          )}
        </p>
      )}
    </div>
  );
}
