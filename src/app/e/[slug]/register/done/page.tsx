import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, CircleCheck } from "lucide-react";
import { getEventBySlug } from "@/lib/db/events";
import { findByToken } from "@/lib/db/attendees";
import { findEntryByToken, nextStep } from "@/features/registration-queue";
import { eventAddress } from "@/features/domains";
import { attendeeLink } from "@/lib/links";
import { qrDataUrl } from "@/lib/qr";
import { isValidToken } from "@/lib/tokens";
import { PortalHeader } from "@/components/portal/PortalHeader";
import { BadgeLink } from "./BadgeLink";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeStyle } from "@/features/theme";
import { TITLE_INK } from "@/lib/ink";
import { cn } from "@/lib/utils";
import { doneCopy, showsDonePage, showsDoneQr } from "@/lib/registration-done";

export default async function Done({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> }) {
  const { slug } = await params;
  const { t } = await searchParams;
  const event = await getEventBySlug(slug);
  if (!event || !t || !isValidToken(t)) notFound();
  const attendee = await findByToken(event.id, t);
  // D690: a waiting or pending person never sees "Registered"; their link shows where they stand.
  if (!attendee) {
    if (await findEntryByToken(event.id, t)) redirect(attendeeLink(await eventAddress(event), t));
    notFound();
  }
  const link = attendeeLink(await eventAddress(event), attendee.token);
  // D581: a cancelled registration is not "Registered"; their personal link shows the cancelled card.
  // D634: with the page switched off (an old bookmark, say), the same - their event page is the answer.
  if (attendee.cancelled_at || !showsDonePage(event)) redirect(link);
  // D799, D805: the next step the organiser set, while they can still do it; gone once done.
  const next = await nextStep(event, attendee);
  // No door, no code (D228): an event without check-in never scans anyone, so the page leads
  // with the event page instead of a QR there is no use for. D804: the organiser can also leave it off.
  const qr = showsDoneQr(event) ? await qrDataUrl(link) : null;
  // D537: the organiser's own words, or the defaults this page always had.
  const copy = doneCopy(event, attendee.name);
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <ThemeStyle event={event} />
      <PortalHeader event={event} />
      <main className="flex-1 px-4 py-4">
        <h1 className="sr-only">Registered</h1>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 text-center">
            <Badge variant="success">Registered</Badge>
            {/* The greeting is a paragraph, not a second h1: the sr-only heading above names the page. */}
            <p className={`text-2xl font-extrabold leading-tight text-balance ${TITLE_INK}`}>{copy.title}</p>
            {qr ? (
              <>
                {/* The code is the point of this page, so it is the largest thing on it. The crew
                    scan this at the door; everything else here exists to make sure it can be found
                    again tomorrow. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="Your QR code" width={224} height={224} /* theme-fixed: QR on white (D627) */ className="box-content size-56 rounded-xl bg-white p-3" />
                <p className="text-sm text-muted-foreground text-balance whitespace-pre-line">{copy.message}</p>
              </>
            ) : (
              <>
                <div aria-hidden className="flex size-20 items-center justify-center rounded-full bg-accent text-primary">
                  <CircleCheck className="size-9" />
                </div>
                <p className="text-sm text-muted-foreground text-balance whitespace-pre-line">{copy.message}</p>
              </>
            )}
            {next ? (
              // D799: the next step takes the primary button; the event page steps back to a quiet
              // link for someone who would rather do it later.
              <div className="flex w-full flex-col gap-3">
                <div className="flex flex-col gap-1 rounded-xl border border-primary/30 bg-accent px-4 py-3 text-left">
                  <span className="text-xs font-bold tracking-[0.06em] text-primary uppercase">One more step</span>
                  <span className="font-extrabold leading-snug text-balance">{next.activity.name}</span>
                  {next.detail && <span className="text-sm text-muted-foreground">{next.detail}</span>}
                </div>
                <Link href={`${link}/activities/${next.activity.id}`} className={cn(buttonVariants(), "h-12 w-full text-base font-bold")}>
                  {next.action}
                  <ArrowRight data-icon="inline-end" />
                </Link>
                <Link href={link} className={cn(buttonVariants({ variant: "ghost" }), "h-11 w-full text-sm font-semibold text-muted-foreground")}>
                  I&apos;ll do it later
                </Link>
                {/* D806: no link box here - the page is about the next step, and "I'll do it
                    later" already opens the event page. It stays below when there is no step. */}
              </div>
            ) : (
              <div className="flex w-full flex-col gap-2">
                {/* Styled as the primary button, but it is a link and stays one: this is the
                    address the invitee has to be able to keep, copy and open in a new tab. */}
                <Link href={link} className={cn(buttonVariants(), "h-12 w-full text-base font-bold")}>
                  Open my event page
                  <ArrowRight data-icon="inline-end" />
                </Link>
                <BadgeLink link={link} />
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
