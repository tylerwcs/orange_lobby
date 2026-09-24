import type { Event } from "@/lib/types";
import { sanitizeHtml } from "@/lib/sanitize";
import { VENUE_TAB, type PortalInfoTab, type VenueFields } from "@/lib/info-tabs";
import { buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeletons";
import { PendingScope, PendingSwap } from "@/components/PendingNav";
import { AgendaInfoSwitch } from "./AgendaInfoSwitch";
import { PortalTabStrip } from "./PortalTabStrip";

/**
 * The Info page, for both portals (D206): the section's heading, the tab strip, and the
 * chosen tab - the Venue tab drawn from Settings (D204), or an organiser's tab.
 */
export function InfoPage({ event, tabs, selected, basePath, hasInfo }: {
  event: VenueFields & Pick<Event, "info_page_title">;
  tabs: PortalInfoTab[];
  selected: PortalInfoTab | null;
  basePath: string;
  /** Whether the Agenda | Info switch is drawn - the same answer the launcher and header use (D205). */
  hasInfo: boolean;
}) {
  return (
    <>
      {hasInfo && <AgendaInfoSwitch basePath={basePath} current="info" />}
      <h1 className="mb-3 text-xl font-extrabold">{event.info_page_title}</h1>
      {!selected ? (
        <p className="text-sm text-muted-foreground">More information will be published soon.</p>
      ) : (
        // `?tab=` changes no route segment, so no loading.tsx sees it; the scope moves the
        // underline at once and swaps the content for a skeleton until the tab arrives.
        <PendingScope>
          <div className="flex flex-col gap-4">
            <PortalTabStrip
              tabs={tabs.map((t) => ({ key: t.key, href: `${basePath}/info?tab=${t.key}`, label: t.title }))}
              selected={selected.key}
            />
            <PendingSwap fallback={<Skeleton className="h-40 rounded-[14px]" />}>
              {selected.key === VENUE_TAB
                ? <VenueDetails event={event} />
                : <div className="rich-text prose prose-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(selected.html ?? "") }} />}
            </PendingSwap>
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
