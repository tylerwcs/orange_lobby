import { notFound } from "next/navigation";
import { loadPortalEvent } from "@/lib/portal";
import { PortalShell } from "@/components/portal/PortalShell";

export default async function PlanPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await loadPortalEvent(slug);
  if (!event.floor_plan_url) notFound();
  return (
    <PortalShell event={event} basePath={`/e/${slug}`} personal={false} current="">
      <h1 className="mb-3 text-xl font-extrabold">Floor plan</h1>
      <div className="overflow-auto rounded-[var(--radius-card)] border border-line bg-surface p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={event.floor_plan_url} alt="Floor plan" className="w-full" />
      </div>
    </PortalShell>
  );
}
