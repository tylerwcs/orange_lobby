import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarOff } from "lucide-react";
import { getEventBySlug } from "@/lib/db/events";
import { RegisterForm } from "./RegisterForm";
import { PortalHeader } from "@/components/portal/PortalHeader";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { brandStyle, HEADING_INK, PAGE_HEADING_INK, PAGE_TEXT_INK, registrationLook } from "@/lib/brand";
import { shortDateTime } from "@/lib/text";
import { DEFAULT_REGISTRATION_INTRO } from "@/lib/registration";
import { eventTermsHtml } from "@/lib/privacy";

export default async function RegisterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();
  const closed = !event.registration_open || (event.registration_closes_at && new Date(event.registration_closes_at) < new Date());
  return (
    // D620: the ground spans the window, so a chosen background is not a stripe on desktop; the
    // column inside keeps the phone width.
    <div className="min-h-screen bg-background"
      style={{ ...brandStyle(event.primary_color), ...registrationLook(event.registration_heading_color, event.registration_background_color) } as React.CSSProperties}>
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      {/* D621: with a chosen background the bar sits on it, so the event name shows in the heading colour. */}
      <PortalHeader event={event} onGround={!!event.registration_background_color} />
      {/* D618: the organiser's banner, straight under the event bar, as wide as the column at its own height. */}
      {event.registration_banner_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.registration_banner_url} alt="" className="block h-auto w-full" />
      )}
      <main className="flex-1 px-4 py-4">
        {closed ? (
          <>
            <h1 className="sr-only">Registration</h1>
            {/* A closed form used to be one grey sentence in an otherwise empty card. Say when
                it closed, and leave somewhere to go that is not the back button. */}
            <Empty className="border border-dashed bg-card">
              <EmptyHeader>
                <EmptyMedia variant="icon"><CalendarOff /></EmptyMedia>
                <EmptyTitle className={HEADING_INK}>Registration is closed</EmptyTitle>
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
            {/* A visible heading, not an sr-only one: an invitee arriving from a link needs to
                read what this page wants from them before they meet the first input. */}
            <h1 className={`text-2xl font-extrabold leading-tight ${PAGE_HEADING_INK}`}>Register</h1>
            <p className={`mt-1 text-sm ${PAGE_TEXT_INK}`}>{event.registration_intro || DEFAULT_REGISTRATION_INTRO}</p>
            <Card className="mt-4">
              <CardContent>
                <RegisterForm slug={slug} questions={event.registration_form} door={event.check_in_enabled} termsHtml={eventTermsHtml(event)} />
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
    </div>
  );
}
