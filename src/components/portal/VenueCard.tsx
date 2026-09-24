import Link from "next/link";
import { MapPin, Phone } from "lucide-react";
import type { Event } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { buttonVariants } from "@/components/ui/button";

const caption = "text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground";

/**
 * Where the event is and who to ask, for the desktop home's left column.
 *
 * Deliberately the STRUCTURED venue fields and not the Info tabs. That column is 300px and
 * the Info tabs are free-form HTML an organiser writes with a rich-text editor - a couple of
 * paragraphs would overflow it and a long one would dwarf the agenda beside it. So this
 * summarises, and links to the page when there is one.
 */
export function VenueCard({ event, basePath, hasInfo }: { event: Event; basePath: string; hasInfo: boolean }) {
  const hasVenue = event.venue_name || event.venue_address;
  const hasContact = event.contact_name || event.contact_phone;
  if (!hasVenue && !hasContact && !hasInfo) return null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {hasVenue && (
          <div className="flex flex-col gap-1.5">
            <div className={caption}>Venue</div>
            {event.venue_name && <div className="font-bold">{event.venue_name}</div>}
            {event.venue_address && (
              <div className="text-sm leading-relaxed text-muted-foreground">{event.venue_address}</div>
            )}
            {event.venue_map_url && (
              <a
                href={event.venue_map_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-1 self-start`}
              >
                <MapPin data-icon="inline-start" />
                Open map
              </a>
            )}
          </div>
        )}

        {hasVenue && hasContact && <Separator />}

        {hasContact && (
          <div className="flex flex-col gap-1">
            <div className={caption}>Event desk</div>
            {event.contact_name && <div className="font-bold">{event.contact_name}</div>}
            {event.contact_phone && (
              <a className="flex items-center gap-1.5 text-sm font-medium text-primary" href={`tel:${event.contact_phone}`}>
                <Phone className="size-3.5" />
                {event.contact_phone}
              </a>
            )}
          </div>
        )}

        {hasInfo && (
          <>
            <Separator />
            {/* The full page keeps its own route - see the note above. */}
            <Link href={`${basePath}/info`} className="text-sm font-bold text-primary">
              {event.info_page_title || "More information"} →
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
