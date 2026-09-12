import { loadPortalEvent } from "@/lib/portal";
import { PortalShell } from "@/components/portal/PortalShell";
import { Card, CardContent } from "@/components/ui/card";

export default async function PlanPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await loadPortalEvent(slug);
  return (
    <PortalShell event={event} basePath={`/e/${slug}`} personal={false}>
      <h1 className="mb-3 text-xl font-extrabold">Floor plan</h1>
      {event.floor_plan_url ? (
        <div className="overflow-auto rounded-xl border border-border bg-card p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={event.floor_plan_url} alt="Floor plan" loading="lazy" className="min-h-64 w-full" />
        </div>
      ) : (
        // A tile can be enabled before the plan image is uploaded; say so inside the
        // shell rather than dead-ending on a 404.
        <Card><CardContent><p className="text-sm text-muted-foreground">The floor plan isn&apos;t available yet.</p></CardContent></Card>
      )}
    </PortalShell>
  );
}
