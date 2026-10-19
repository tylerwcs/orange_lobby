import { Suspense } from "react";
import Link from "next/link";
import { Mark } from "@/components/portal/PortalHeader";
import { TITLE_INK } from "@/lib/ink";
import { formatDateRange } from "@/lib/text";
import { buttonVariants } from "@/components/ui/button";
import type { Event, RegistrationEntry } from "@/lib/types";
import { registrationOpen } from "../lib/rules";
import { leaveQueueAction } from "./actions";
import { FilledWhileRegistering, QueueLeaveButton } from "./QueueLeave";

/**
 * D680, D681, D697, D700: every page on the link of someone who is not (or not yet) registered -
 * waiting, pending, declined, or off the list. No nav, no portal, no consent gate, drawn like the
 * cancelled card. The token is the same one they keep once they are in (D689).
 *
 * Whether the event filled up while they were registering (D695) is read from `?filled=1` in the
 * browser: the personal layout draws this card, and a layout is never given the query.
 */
export function QueueCard({ event, entry, position }: {
  event: Event;
  entry: RegistrationEntry;
  /** 1-based place on the waiting list (D680); null unless waiting. */
  position: number | null;
}) {
  const when = [formatDateRange(event.starts_on, event.ends_on), event.venue_name].filter(Boolean).join(" · ");
  const leave = leaveQueueAction.bind(null, event.slug, entry.token);
  const registerHref = registrationOpen(event, new Date()) ? `/e/${event.slug}/register` : null;

  let body: React.ReactNode;
  if (entry.state === "waiting") {
    body = (
      <>
        <h1 className={`text-xl font-extrabold text-balance ${TITLE_INK}`}>You&apos;re on the waiting list</h1>
        <Suspense fallback={null}><FilledWhileRegistering /></Suspense>
        {position !== null && <p className="mt-4 text-3xl font-extrabold tabular-nums">You&apos;re number {position}</p>}
        <EventLine name={event.name} when={when} />
        <p className="mt-4 text-sm text-muted-foreground text-balance">
          {event.registration_needs_approval
            ? "When a place opens up, the first person on the list goes to the organiser to confirm. Keep this link: it becomes your event page once you're in."
            : "When a place opens up, the first person on the list is registered. Keep this link: it becomes your event page once you're in."}
        </p>
        <QueueLeaveButton eventName={event.name} waiting action={leave} />
      </>
    );
  } else if (entry.state === "pending") {
    body = (
      <>
        <h1 className={`text-xl font-extrabold text-balance ${TITLE_INK}`}>Your registration is waiting for the organiser&apos;s approval</h1>
        <EventLine name={event.name} when={when} />
        <p className="mt-4 text-sm text-muted-foreground text-balance">
          Your place is held while they decide. Keep this link: it becomes your event page once they confirm.
        </p>
        <QueueLeaveButton eventName={event.name} waiting={false} action={leave} />
      </>
    );
  } else if (entry.state === "declined") {
    body = (
      <>
        <h1 className={`text-xl font-extrabold text-balance ${TITLE_INK}`}>The organiser couldn&apos;t confirm your place for this event.</h1>
        <EventLine name={event.name} when={when} />
        <p className="mt-4 text-sm text-muted-foreground">If you think this is a mistake, contact the organiser.</p>
      </>
    );
  } else {
    // left / removed (D681, D685): off the list, with a way back while registration is open.
    body = (
      <>
        <h1 className={`text-xl font-extrabold text-balance ${TITLE_INK}`}>You&apos;re no longer on the list for {event.name}.</h1>
        {entry.state === "removed" && <p className="mt-3 text-sm text-muted-foreground">The organiser has taken you off the waiting list.</p>}
        {registerHref ? (
          <Link href={registerHref} className={buttonVariants({ variant: "outline", className: "mt-5 h-11" })}>Register again</Link>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Registration is closed. If this was a mistake, contact the organiser.</p>
        )}
      </>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <div className="w-full rounded-xl border border-border bg-card p-6 text-center">
        <div className="mx-auto mb-4 w-fit"><Mark event={event} /></div>
        {body}
      </div>
    </main>
  );
}

function EventLine({ name, when }: { name: string; when: string }) {
  return (
    <p className="mt-3 text-sm">
      <span className="font-bold">{name}</span>
      {when && <span className="block text-muted-foreground">{when}</span>}
    </p>
  );
}
