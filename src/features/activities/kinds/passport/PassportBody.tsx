import { Users } from "lucide-react";
import { savePassportResultAction } from "@/features/passport-test";
import { type PassportEntry } from "../../lib/portal-activity-entries";
import { latestStampAt, qrButtonShown } from "../../lib/booths";
import { PassportLive } from "./PassportLive";
import { PassportBook } from "./book/PassportBook";
import { heldReveals } from "./book/flow";
import { RichSections } from "@/components/portal/RichSections";
import { forGroups, InfoRows } from "../../portal/detail-parts";

/**
 * A Booth Passport's page (D870): the whole screen is the guest's passport. With a personality
 * test on (D884) they take it page by page first; either way the stamps sit on the page above the
 * holder page, and a booth's scan plays its arrival (D852). Stamps given before the test wait for
 * the reveal (D880). A draft preview replays nothing on load and saves no result (goal 22, D847).
 */
export function PassportBody({ entry: { activity, passport, test, result }, attendeeId, attendeeName, eventName, slug, token, qr, preview, brand }: {
  entry: PassportEntry;
  attendeeId: string;
  attendeeName: string;
  eventName: string;
  slug: string;
  token: string;
  /** The attendee's QR as a data URL (qrDataUrl), as the badge dialog gets it. */
  qr: string;
  preview: boolean;
  /** The event's colour (`primary_color`): the cover's default (D885) and the plain chop (D856). */
  brand: string | null;
}) {
  const hasResult = test.on && result !== null;
  const held = heldReveals(passport, { testOn: test.on, hasResult, preview });
  const groups = forGroups(activity);
  return (
    <PassportLive slug={slug} token={token} initial={held.now} cursor={latestStampAt(passport)} brand={brand}>
      <PassportBook
        // A test switched on or off while the page is open starts the book again.
        key={String(test.on)}
        slug={slug} token={token} activityId={activity.id} eventName={eventName} brand={brand} qr={qr}
        showQr={qrButtonShown(passport, activity.is_open)} passport={passport} test={test}
        result={hasResult ? { personalityId: result!.personality_id, holderName: result!.holder_name } : null}
        registeredName={attendeeName} isOpen={activity.is_open} afterTest={held.afterTest}
        reward={activity.reward_message} seed={`${activity.id}:${attendeeId}`}
        save={savePassportResultAction.bind(null, slug, token, activity.id)}
        about={(groups || activity.description) ? (
          <>
            {groups && <InfoRows rows={[{ icon: Users, text: groups }]} />}
            <RichSections html={activity.description} />
          </>
        ) : null}
      />
    </PassportLive>
  );
}
