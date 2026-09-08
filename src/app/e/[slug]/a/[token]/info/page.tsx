import { loadPortalAttendee } from "@/lib/portal";
import { sanitizeHtml } from "@/lib/sanitize";
import { PortalShell } from "@/components/portal/PortalShell";
import { buttonClass } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";

export default async function PersonalInfo({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event } = await loadPortalAttendee(slug, token);
  return (
    <PortalShell event={event} basePath={`/e/${slug}/a/${token}`} personal>
      <h1 className="mb-3 text-xl font-extrabold">{event.info_page_title}</h1>
      <div className="mb-4 flex flex-col gap-3">
        {event.venue_name && (
          <div className="rounded-[14px] border border-line bg-surface p-3.5">
            <div className="text-[15px] font-bold">{event.venue_name}</div>
            {event.venue_address && <div className="mt-0.5 text-sm text-muted">{event.venue_address}</div>}
            {event.venue_map_url && (
              <div className="mt-2">
                {/* Plain anchor: the map is an external site, so it needs target/rel. */}
                <a href={event.venue_map_url} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}><Icon name="map" size={18} />Open map</a>
              </div>
            )}
          </div>
        )}
        {event.description && <p className="whitespace-pre-line text-sm text-muted">{event.description}</p>}
        {event.contact_name && (
          <p className="text-sm text-muted">
            Contact: {event.contact_name}
            {event.contact_phone && (
              <>
                {" · "}
                <a className="font-semibold text-brand-ink underline" href={`tel:${event.contact_phone}`}>{event.contact_phone}</a>
              </>
            )}
          </p>
        )}
      </div>
      <div className="prose prose-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(event.info_page_html ?? "") }} />
    </PortalShell>
  );
}
