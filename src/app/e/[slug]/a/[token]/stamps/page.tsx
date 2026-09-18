import { loadPortalAttendee } from "@/lib/portal";
import { listBooths, stampsForAttendee } from "@/lib/db/booths";
import { buildPassport } from "@/lib/booths";
import { PassportGrid } from "@/components/portal/PassportGrid";

export const dynamic = "force-dynamic";

export default async function StampsPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const [booths, stamps] = await Promise.all([listBooths(event.id), stampsForAttendee(attendee.id)]);
  const passport = buildPassport(booths, stamps, event.stamps_required);
  return (
    <>
      <PassportGrid passport={passport} message={event.stamps_message} attendeeName={attendee.name} />
    </>
  );
}
