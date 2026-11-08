import { Users } from "lucide-react";
import { type PassportEntry } from "../../lib/portal-activity-entries";
import { asShown, latestStampAt, qrButtonShown, unseenReveals } from "../../lib/booths";
import { PassportGrid } from "./PassportGrid";
import { PassportLive } from "./PassportLive";
import { RichSections } from "@/components/portal/RichSections";
import { block, note, forGroups, InfoRows } from "../../portal/detail-parts";

/**
 * A Booth Passport's body. The attendee's part is one button: Show my QR, which waits for the
 * booth's scan and plays the stamp's arrival (D852). A stamp collected without it - a badge
 * scanned, a saved QR - plays on the next visit, and its slot shows "?" until then. A draft
 * preview replays nothing on load and marks nothing seen (D847). The page is still the card and
 * the wayfinding it gives (D102).
 */
export function PassportBody({ entry: { activity, passport }, attendeeName, slug, token, qr, preview, brand }: {
  entry: PassportEntry;
  attendeeName: string;
  slug: string;
  token: string;
  /** The attendee's QR as a data URL (qrDataUrl), as the badge dialog gets it. */
  qr: string;
  preview: boolean;
  /** The event's colour (`primary_color`), for the plain chop on the paper (D856). */
  brand: string | null;
}) {
  const initial = preview ? [] : unseenReveals(passport);
  const shown = asShown(passport, new Set(initial.map((r) => r.stampId)));
  return (
    <PassportLive
      slug={slug} token={token} activityId={activity.id} qr={qr}
      initial={initial} cursor={latestStampAt(passport)} showButton={qrButtonShown(passport, activity.is_open)}
    >
      <InfoRows rows={[
        { icon: Users, text: forGroups(activity) },
      ]} />
      <RichSections html={activity.description} />
      <section className={`${block} flex flex-col gap-3`}>
        {!activity.is_open && !passport.complete && (
          <p className={note}>Stamping opens soon. The booths are below, so you know where to go.</p>
        )}
        <PassportGrid passport={shown} message={activity.reward_message} attendeeName={attendeeName} title={null} brand={brand} />
      </section>
    </PassportLive>
  );
}
