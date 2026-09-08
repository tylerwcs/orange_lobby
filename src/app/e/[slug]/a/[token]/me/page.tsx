import { loadPortalAttendee } from "@/lib/portal";
import { PortalShell } from "@/components/portal/PortalShell";
import { appBaseUrl, attendeeLink } from "@/lib/links";
import { qrDataUrl } from "@/lib/qr";
import { Pill } from "@/components/ui/Card";

export default async function MePage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const basePath = `/e/${slug}/a/${token}`;
  const qr = await qrDataUrl(attendeeLink(appBaseUrl(), slug, attendee.token));
  return (
    <PortalShell event={event} basePath={basePath} personal current="/me">
      <div className="flex flex-col gap-3.5">
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Your QR code" className="mx-auto w-52 rounded-[10px]" />
          <div className="mt-3 text-xl font-extrabold">{attendee.name}</div>
          {attendee.company && <div className="text-sm text-muted">{attendee.company}</div>}
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {attendee.category && <Pill tone="muted">{attendee.category}</Pill>}
            {attendee.table_no && <Pill>Table {attendee.table_no}{attendee.seat_no ? ` · Seat ${attendee.seat_no}` : ""}</Pill>}
          </div>
          <p className="mt-3 text-xs text-muted">Show this at check-in if you do not have your badge.</p>
        </div>
        {(event.contact_name || event.contact_phone) && (
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4 text-sm">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Need help?</div>
            <div className="mt-1 font-bold">{event.contact_name}</div>
            {event.contact_phone && <a className="text-brand-ink" href={`tel:${event.contact_phone}`}>{event.contact_phone}</a>}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
