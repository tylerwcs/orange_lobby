import { MapPin, Users } from "lucide-react";
import { type PassportEntry } from "../../lib/portal-activity-entries";
import { PassportGrid } from "./PassportGrid";
import { RichSections } from "@/components/portal/RichSections";
import { block, note, forGroups, InfoRows } from "../../portal/detail-parts";

/**
 * A Booth Passport's body. No dialog and no button: the attendee does nothing here — a booth
 * scans their badge (D90). The page is the card, and the wayfinding the card gives (D102).
 */
export function PassportBody({ entry: { activity, passport }, attendeeName }: { entry: PassportEntry; attendeeName: string }) {
  const n = passport.cells.length;
  return (
    <>
      <InfoRows rows={[
        { icon: MapPin, text: n ? `${n} booth${n === 1 ? "" : "s"} to visit` : null },
        { icon: Users, text: forGroups(activity) },
      ]} />
      <RichSections html={activity.description} />
      <section className={`${block} flex flex-col gap-3`}>
        {!activity.is_open && !passport.complete && (
          <p className={note}>Stamping opens soon. The booths are below, so you know where to go.</p>
        )}
        <PassportGrid passport={passport} message={activity.reward_message} attendeeName={attendeeName} title={null} />
      </section>
    </>
  );
}
