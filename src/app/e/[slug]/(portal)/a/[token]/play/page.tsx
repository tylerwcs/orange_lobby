import { loadPortalAttendee, isUnpublished } from "@/lib/portal";
import { eventFeatures, gameKindsFor, has } from "@/features/catalogue";
import { phoneState, PlayClient } from "@/features/games";
import { GAME_NAME, getSettings, qualifierView, QualifierClient } from "@/features/qualifier";
import type { Attendee, Event } from "@/lib/types";
import { TITLE_INK } from "@/lib/ink";

export const dynamic = "force-dynamic";

/** The phone's first view, built at the moment of the request (outside render, which must stay pure). */
const firstView = (event: Event, attendee: Attendee) => phoneState({ event, attendee }, null, Date.now());
/** Slime Splat's first view, read the same way. */
const firstSlimeView = (event: Event, attendee: Attendee) => qualifierView({ event, attendee }, Date.now());

const title = <h1 className={`mb-4 text-xl font-extrabold ${TITLE_INK}`}>Games</h1>;

/**
 * The portal's Games (D797): Slime Splat, the typing game played any time it is open, with its
 * leaderboard, once it is added to the event's games (its settings row, D809); then the live
 * stage game, when the event has live games or draws (under Slime Splat only while one is on, D817). Personal only (the tile route is, D253): the token is the identity.
 */
export default async function Play({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  // A draft shows only "Coming soon" (the layout's chrome); see isUnpublished.
  if (isUnpublished(event)) return null;
  // The play, start and submit endpoints refuse an archived event (playContext), so nothing here polls.
  if (event.status === "archived") {
    return (
      <>
        {title}
        <p className="text-base text-muted-foreground">Games are closed for this event.</p>
      </>
    );
  }
  const features = await eventFeatures(event.id);
  const slime = has(features, "typing_qualifier") && (await getSettings(event.id)) !== null;
  const live = gameKindsFor(features).length > 0;
  const [slimeView, liveView] = await Promise.all([
    slime ? firstSlimeView(event, attendee) : null,
    live ? firstView(event, attendee) : null,
  ]);
  return (
    <>
      {title}
      <div className="flex flex-col gap-8">
        {slimeView && (
          <section aria-label={GAME_NAME} className="flex flex-col gap-3">
            <h2 className="text-lg font-extrabold">{GAME_NAME}</h2>
            {slimeView.ineligible
              ? <p className="text-base text-muted-foreground">This game isn&apos;t open to you.</p>
              : <QualifierClient token={token} initial={slimeView} />}
          </section>
        )}
        {/* Under Slime Splat, the stage game shows only while one is on (D817). */}
        {liveView && <PlayClient token={token} initial={liveView} heading={slimeView ? "On stage" : undefined} />}
        {!slimeView && !liveView && <p className="text-base text-muted-foreground">No games here yet.</p>}
      </div>
    </>
  );
}
