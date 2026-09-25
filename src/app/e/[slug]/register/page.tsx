import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarOff } from "lucide-react";
import { getEventBySlug } from "@/lib/db/events";
import { RegisterForm } from "./RegisterForm";
import { PortalHeader } from "@/components/portal/PortalHeader";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { brandStyle } from "@/lib/brand";
import { shortDateTime } from "@/lib/text";
import { DEFAULT_REGISTRATION_INTRO } from "@/lib/registration";

export default async function RegisterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();
  const closed = !event.registration_open || (event.registration_closes_at && new Date(event.registration_closes_at) < new Date());
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background" style={brandStyle(event.primary_color) as React.CSSProperties}>
      <PortalHeader event={event} />
      <main className="flex-1 px-4 py-4">
        {closed ? (
          <>
            <h1 className="sr-only">Registration</h1>
            {/* A closed form used to be one grey sentence in an otherwise empty card. Say when
                it closed, and leave somewhere to go that is not the back button. */}
            <Empty className="border border-dashed bg-card">
              <EmptyHeader>
                <EmptyMedia variant="icon"><CalendarOff /></EmptyMedia>
                <EmptyTitle>Registration is closed</EmptyTitle>
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
            <h1 className="text-2xl font-extrabold leading-tight">Register</h1>
            <p className="mt-1 text-sm text-muted-foreground">{event.registration_intro || DEFAULT_REGISTRATION_INTRO}</p>
            <Card className="mt-4">
              <CardContent>
                <RegisterForm slug={slug} questions={event.registration_questions} door={event.check_in_enabled} />
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
