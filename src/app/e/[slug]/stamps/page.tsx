import { loadPortalEvent } from "@/lib/portal";
import { listActivities } from "@/lib/db/activities";
import { listPassportBooths } from "@/lib/db/booths";
import { buildPassport, firstPublicPassport } from "@/lib/booths";
import { PortalShell } from "@/components/portal/PortalShell";
import { PassportGrid } from "@/components/portal/PassportGrid";

export const dynamic = "force-dynamic";

export default async function StampsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await loadPortalEvent(slug);
  // No attendee behind this link (it is the signage QR in the foyer), so there are no stamps to
  // fetch: PassportGrid renders locked whenever attendeeName is null, and still lists the booths
  // (D103). But also no category to check anyone against, so only a passport with no categories
  // may show here (D184, D191) — a restricted one is skipped even if it sorts first, and if
  // every passport is restricted this renders the same locked, booth-less card as no passport.
  const passport = firstPublicPassport(await listActivities(event.id, "passport"));
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
