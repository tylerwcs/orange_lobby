import { loadPortalAttendee } from "@/lib/portal";
import { PortalShell } from "@/components/portal/PortalShell";
import { Card } from "@/components/ui/Card";

export default async function PlanPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  return (
    <PortalShell event={event} basePath={`/e/${slug}/a/${token}`} personal>
      <h1 className="mb-3 text-xl font-extrabold">Floor plan</h1>
      {event.floor_plan_url ? (
        <>
          {attendee.table_no && <div className="mb-3 rounded-[12px] bg-ink px-4 py-3 text-sm font-bold text-white">You are at Table {attendee.table_no}{attendee.seat_no ? `, Seat ${attendee.seat_no}` : ""}</div>}
          <div className="overflow-auto rounded-[var(--radius-card)] border border-line bg-surface p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={event.floor_plan_url} alt="Floor plan" loading="lazy" className="min-h-64 w-full" />
          </div>
        </>
      ) : (
        // A tile can be enabled before the plan image is uploaded; say so inside the
        // shell rather than dead-ending on a 404.
        <Card className="p-4"><p className="text-sm text-muted">The floor plan isn&apos;t available yet.</p></Card>
      )}
    </PortalShell>
  );
}
