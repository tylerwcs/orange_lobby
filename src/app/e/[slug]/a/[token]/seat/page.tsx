import { loadPortalAttendee } from "@/lib/portal";
import { PortalShell } from "@/components/portal/PortalShell";
import { ButtonLink } from "@/components/ui/Card";

export default async function Seat({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const basePath = `/e/${slug}/a/${token}`;
  return (
    <PortalShell event={event} basePath={basePath} personal>
      <h1 className="mb-3 text-xl font-extrabold">My seat</h1>
      {attendee.table_no ? (
        <div className="mb-4 rounded-[14px] bg-ink p-6 text-center text-white">
          <div className="text-xs font-bold uppercase tracking-[0.08em] text-gray-300">Table</div>
          <div className="text-6xl font-extrabold text-brand">{attendee.table_no}</div>
        </div>
      ) : (
        <p className="mb-4 text-sm text-muted">Your seat will be shown here once seating is confirmed.</p>
      )}
      {event.floor_plan_url && (
        <ButtonLink href={`${basePath}/plan`} variant="secondary">Open floor plan</ButtonLink>
      )}
    </PortalShell>
  );
}
