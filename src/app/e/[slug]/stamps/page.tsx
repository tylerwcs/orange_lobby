import { loadPortalEvent } from "@/lib/portal";
import { listActivities } from "@/lib/db/activities";
import { listPassportBooths } from "@/lib/db/booths";
import { buildPassport, firstPassport } from "@/lib/booths";
import { PortalShell } from "@/components/portal/PortalShell";
import { PassportGrid } from "@/components/portal/PassportGrid";

export const dynamic = "force-dynamic";

export default async function StampsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await loadPortalEvent(slug);
  // No attendee behind this link (it is the signage QR in the foyer), so there are no stamps to
  // fetch: PassportGrid renders locked whenever attendeeName is null, and still lists the booths
  // (D103). The first passport by sort order, as every kind-less link means (D191).
  const passport = firstPassport(await listActivities(event.id, "passport"));
  const booths = passport ? await listPassportBooths(passport.id) : [];
  return (
    <PortalShell event={event} basePath={`/e/${slug}`} personal={false}>
      <PassportGrid
        passport={buildPassport(booths, [], passport?.stamps_required ?? null)}
        message={passport?.reward_message ?? null}
        attendeeName={null}
        title={passport?.name ?? "Booth Passport"}
      />
    </PortalShell>
  );
}
