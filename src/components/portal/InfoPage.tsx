import type { Event } from "@/lib/types";
import { sanitizeHtml } from "@/lib/sanitize";
import { buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { AgendaInfoSwitch } from "./AgendaInfoSwitch";

/**
 * The info tab, for both portals. The personal and anonymous pages carried identical copies
 * of this body; they differ only in the chrome around it and in `basePath`.
 */
export function InfoPage({ event, basePath }: {
  event: Pick<Event, "info_page_title" | "info_page_html" | "venue_name" | "venue_address" | "venue_map_url" | "description" | "contact_name" | "contact_phone">;
  basePath: string;
}) {
  return (
    <>
      {event.info_page_html && <AgendaInfoSwitch basePath={basePath} current="info" />}
      <h1 className="mb-3 text-xl font-extrabold">{event.info_page_title}</h1>
      <div className="mb-4 flex flex-col gap-3">
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
      <div className="prose prose-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(event.info_page_html ?? "") }} />
    </>
  );
}
