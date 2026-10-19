import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarOff, UsersRound } from "lucide-react";
import { getEventBySlug } from "@/lib/db/events";
import { RegisterForm } from "./RegisterForm";
import { PortalHeader } from "@/components/portal/PortalHeader";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { CARD_TITLE_INK } from "@/lib/ink";
import { ThemeStyle } from "@/features/theme";
import { shortDateTime } from "@/lib/text";
import { DEFAULT_REGISTRATION_INTRO } from "@/lib/registration";
import { eventTermsHtml } from "@/lib/privacy";
import { getPlaces, registrationOpen } from "@/features/registration-queue";

export default async function RegisterPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ waitlist?: string | string[] }>;
}) {
  const { slug } = await params;
  const { waitlist } = await searchParams;
  const event = await getEventBySlug(slug);
  if (!event) notFound();
  const closed = !registrationOpen(event, new Date());
  // D678, D691: full (every place taken, or anyone already waiting) shows "Registration is full"
  // until they choose the waiting list. Only a full event shows the waiting-list form: once a place
  // is free, ?waitlist=1 is just the form, and sending it registers them (D695).
  const full = !closed && (await getPlaces(event.id)).full;
  const joining = full && waitlist === "1";
  return (
    // D625: the theme is written on :root (ThemeStyle), so body's bg-background fills the window
    // and the column inside keeps the phone width.
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <ThemeStyle event={event} />
      <PortalHeader event={event} />
      {/* D618: the organiser's banner, straight under the event bar, as wide as the column at its own height. */}
      {event.registration_banner_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.registration_banner_url} alt="" className="block h-auto w-full" />
      )}
      <main className="flex-1 px-4 py-4">
        {full && !joining ? (
          <>
            <h1 className="sr-only">Registration</h1>
            <Empty className="border border-dashed bg-card">
              <EmptyHeader>
                <EmptyMedia variant="icon"><UsersRound /></EmptyMedia>
                <EmptyTitle className={CARD_TITLE_INK}>Registration is full</EmptyTitle>
                <EmptyDescription>
                  Every place for this event has been taken. Join the waiting list to be next in line if a place opens up.
                  {" "}If you have already registered, open the link you were sent.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Link href="?waitlist=1" className={buttonVariants()}>Join the waiting list</Link>
              </EmptyContent>
            </Empty>
          </>
        ) : closed ? (
          <>
            <h1 className="sr-only">Registration</h1>
            {/* A closed form used to be one grey sentence in an otherwise empty card. Say when
                it closed, and leave somewhere to go that is not the back button. */}
            <Empty className="border border-dashed bg-card">
              <EmptyHeader>
                <EmptyMedia variant="icon"><CalendarOff /></EmptyMedia>
                <EmptyTitle className={CARD_TITLE_INK}>Registration is closed</EmptyTitle>
                <EmptyDescription>
                  {event.registration_closes_at && new Date(event.registration_closes_at) < new Date()
                    ? `It closed on ${shortDateTime(event.registration_closes_at)}.`
                    : "The organiser has stopped taking registrations for this event."}
                  {" "}If you have already registered, open the link you were sent.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Link href={`/e/${slug}`} className={buttonVariants({ variant: "outline" })}>See the event</Link>
              </EmptyContent>
            </Empty>
          </>
        ) : (
          <>
            {/* Screen readers only, at the organiser's request: the intro line and the form say what
                the page wants, and the event bar already names the event. */}
            <h1 className="sr-only">{joining ? "Join the waiting list" : "Register"}</h1>
            <p className="text-sm text-muted-foreground">{event.registration_intro || DEFAULT_REGISTRATION_INTRO}</p>
            <Card className="mt-4">
              <CardContent>
                <RegisterForm slug={slug} questions={event.registration_form} termsHtml={eventTermsHtml(event)} waitlist={joining} />
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
