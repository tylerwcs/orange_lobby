import { loadPortalAttendee, isUnpublished } from "@/lib/portal";
import { phoneState, PlayClient } from "@/features/games";
import type { Attendee, Event } from "@/lib/types";

export const dynamic = "force-dynamic";

/** The phone's first view, built at the moment of the request (outside render, which must stay pure). */
const firstView = (event: Event, attendee: Attendee) => phoneState({ event, attendee }, null, Date.now());

export default async function Play({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  // A draft shows only "Coming soon" (the layout's chrome); see isUnpublished.
  if (isUnpublished(event)) return null;
  // The play endpoints refuse an archived event (playContext), so its page does not start polling.
  if (event.status === "archived") {
    return (
      <>
        <h1 className="mb-4 text-xl font-extrabold">Games</h1>
        <p className="text-base text-muted-foreground">Games are closed for this event.</p>
      </>
    );
  }
  return (
    <>
      <h1 className="mb-4 text-xl font-extrabold">Games</h1>
      <PlayClient token={token} initial={await firstView(event, attendee)} />
    </>
  );
}
