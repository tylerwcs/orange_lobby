import { notFound } from "next/navigation";
import { getEventBySlug } from "@/lib/db/events";
import { findByToken } from "@/lib/db/attendees";
import { appBaseUrl, attendeeLink } from "@/lib/links";
import { qrDataUrl } from "@/lib/qr";
import { isValidToken } from "@/lib/tokens";
import { PortalHeader } from "@/components/portal/PortalHeader";
import { Card, ButtonLink } from "@/components/ui/Card";
import { brandStyle } from "@/lib/brand";

export default async function Done({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> }) {
  const { slug } = await params;
  const { t } = await searchParams;
  const event = await getEventBySlug(slug);
  if (!event || !t || !isValidToken(t)) notFound();
  const attendee = await findByToken(event.id, t);
  if (!attendee) notFound();
  const link = attendeeLink(appBaseUrl(), slug, attendee.token);
  const qr = await qrDataUrl(link);
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-canvas" style={brandStyle(event.primary_color) as React.CSSProperties}>
      <PortalHeader event={event} />
      <main className="flex-1 px-4 py-4">
        <h1 className="sr-only">Registered</h1>
        <Card className="p-5 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Your QR code" width={208} height={208} className="mx-auto h-52 w-52 rounded-[10px]" />
          {/* The greeting is a paragraph, not a second h1: the sr-only heading above names the page. */}
          <p className="mt-4 text-xl font-extrabold">You&apos;re registered, {attendee.name.split(" ")[0]}!</p>
          <p className="mt-1 text-sm text-muted">This is your personal event link. Bookmark it or save this page.</p>
          <a href={link} className="mt-4 block break-all rounded-[var(--radius-control)] border border-line bg-canvas p-3 text-xs text-brand-ink">{link}</a>
          <ButtonLink href={link} variant="primary" className="mt-4 w-full" icon="chevron">Open my event page</ButtonLink>
        </Card>
      </main>
    </div>
  );
}
