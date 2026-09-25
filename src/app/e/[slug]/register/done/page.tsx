import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarCheck } from "lucide-react";
import { getEventBySlug } from "@/lib/db/events";
import { findByToken } from "@/lib/db/attendees";
import { appBaseUrl, attendeeLink } from "@/lib/links";
import { qrDataUrl } from "@/lib/qr";
import { isValidToken } from "@/lib/tokens";
import { PortalHeader } from "@/components/portal/PortalHeader";
import { BadgeLink } from "./BadgeLink";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { brandStyle } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { displayName } from "@/lib/text";

export default async function Done({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> }) {
  const { slug } = await params;
  const { t } = await searchParams;
  const event = await getEventBySlug(slug);
  if (!event || !t || !isValidToken(t)) notFound();
  const attendee = await findByToken(event.id, t);
  if (!attendee) notFound();
  const link = attendeeLink(appBaseUrl(), slug, attendee.token);
  // No door, no code (D228): an event without check-in never scans anyone, so the page leads
  // with the event page instead of a QR there is no use for.
  const door = event.check_in_enabled;
  const qr = door ? await qrDataUrl(link) : null;
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background" style={brandStyle(event.primary_color) as React.CSSProperties}>
      <PortalHeader event={event} />
      <main className="flex-1 px-4 py-4">
        <h1 className="sr-only">Registered</h1>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 text-center">
            <Badge variant="success">Registered</Badge>
            {/* The greeting is a paragraph, not a second h1: the sr-only heading above names the page. */}
            <p className="text-2xl font-extrabold leading-tight text-balance">You&apos;re in, {displayName(attendee.name).split(" ")[0]}</p>
            {qr ? (
              <>
                {/* The code is the point of this page, so it is the largest thing on it. The crew
                    scan this at the door; everything else here exists to make sure it can be found
                    again tomorrow. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="Your QR code" width={224} height={224} className="size-56 rounded-xl" />
                <p className="text-sm text-muted-foreground text-balance">Show this at the door. It is also your event page — the agenda, your table, and anything the organiser posts.</p>
              </>
            ) : (
              <>
                <div aria-hidden className="flex size-20 items-center justify-center rounded-full bg-accent text-primary">
                  <CalendarCheck className="size-9" />
                </div>
                <p className="text-sm text-muted-foreground text-balance">
                  Your event page has the agenda, your details and anything the organiser posts. Keep it handy: open it and add it to your home screen.
                </p>
              </>
            )}
            <div className="flex w-full flex-col gap-2">
              {/* Styled as the primary button, but it is a link and stays one: this is the
                  address the invitee has to be able to keep, copy and open in a new tab. */}
              <Link href={link} className={cn(buttonVariants(), "h-12 w-full text-base font-bold")}>
                Open my event page
                <ArrowRight data-icon="inline-end" />
              </Link>
              <BadgeLink link={link} />
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
