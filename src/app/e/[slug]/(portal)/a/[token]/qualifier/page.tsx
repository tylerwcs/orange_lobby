import { loadPortalAttendee, isUnpublished } from "@/lib/portal";
import { qualifierView, QualifierClient } from "@/features/qualifier";
import type { Attendee, Event } from "@/lib/types";
import { TITLE_INK } from "@/lib/ink";

export const dynamic = "force-dynamic";

/** The page's first view, read at the moment of the request (outside render, which must stay pure). */
const firstView = (event: Event, attendee: Attendee) => qualifierView({ event, attendee }, Date.now());

const title = <h1 className={`mb-4 text-xl font-extrabold ${TITLE_INK}`}>Typing qualifier</h1>;

/**
 * The typing qualifier (D772): the ready screen, the run, the result and the board, all in
 * QualifierClient. Personal only (the tile route is, D770); the token is the identity.
 */
export default async function Qualifier({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  // A draft shows only "Coming soon" (the layout's chrome); see isUnpublished.
  if (isUnpublished(event)) return null;
  // The start and submit endpoints refuse an archived event (playContext).
  if (event.status === "archived") {
    return (
      <>
        {title}
        <p className="text-base text-muted-foreground">The qualifier is closed for this event.</p>
      </>
    );
  }
  const view = await firstView(event, attendee);
  if (view.ineligible) {
    return (
      <>
        {title}
        <p className="text-base text-muted-foreground">This challenge isn&apos;t open to you.</p>
      </>
    );
  }
  return (
    <>
      {title}
      <QualifierClient token={token} slug={slug} initial={view} />
    </>
  );
}
