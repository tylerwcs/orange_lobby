import { loadPortalAttendee } from "@/lib/portal";
import { PortalShell } from "@/components/portal/PortalShell";
import { Card, CardContent } from "@/components/ui/card";
import { floorPlanUrl } from "@/lib/modules";
import { fieldValue } from "@/lib/attendee-values";

export default async function PlanPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const plan = floorPlanUrl(event);
  const table = fieldValue(attendee, "table_no");
  return (
    <PortalShell event={event} basePath={`/e/${slug}/a/${token}`} personal>
      <h1 className="mb-3 text-xl font-extrabold">Floor plan</h1>
      {plan ? (
        <>
          {table && <div className="mb-3 rounded-[12px] bg-foreground px-4 py-3 text-sm font-bold text-white">You are at Table {table}</div>}
          <div className="overflow-auto rounded-xl border border-border bg-card p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={plan} alt="Floor plan" loading="lazy" className="min-h-64 w-full" />
          </div>
        </>
      ) : (
        // A tile can be enabled before the plan image is uploaded; say so inside the
        // shell rather than dead-ending on a 404.
        <Card><CardContent><p className="text-sm text-muted-foreground">The floor plan isn&apos;t available yet.</p></CardContent></Card>
      )}
    </PortalShell>
  );
}
