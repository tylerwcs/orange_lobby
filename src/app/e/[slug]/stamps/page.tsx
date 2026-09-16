import { loadPortalEvent } from "@/lib/portal";
import { listBooths } from "@/lib/db/booths";
import { buildPassport } from "@/lib/booths";
import { PortalShell } from "@/components/portal/PortalShell";
import { PassportGrid } from "@/components/portal/PassportGrid";

export const dynamic = "force-dynamic";

export default async function StampsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await loadPortalEvent(slug);
  // No attendee behind this link (it's the signage QR in the foyer), so there are no
  // stamps to fetch - PassportGrid renders locked whenever attendeeName is null, and the
  // booth list still comes from the same cells buildPassport produces from an empty
  // stamp list.
  const booths = await listBooths(event.id);
  const passport = buildPassport(booths, [], event.stamps_required);
  return (
    <PortalShell event={event} basePath={`/e/${slug}`} personal={false}>
      <PassportGrid passport={passport} message={event.stamps_message} attendeeName={null} />
    </PortalShell>
  );
}
