import { notFound } from "next/navigation";
import { loadPortalAttendee } from "@/lib/portal";
import { PortalShell } from "@/components/portal/PortalShell";

export default async function PlanPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  if (!event.floor_plan_url) notFound();
  return (
    <PortalShell event={event} basePath={`/e/${slug}/a/${token}`} personal current="">
      <h1 className="mb-3 text-xl font-extrabold">Floor plan</h1>
      {attendee.table_no && <div className="mb-3 rounded-[12px] bg-ink px-4 py-3 text-sm font-bold text-white">You are at Table {attendee.table_no}{attendee.seat_no ? `, Seat ${attendee.seat_no}` : ""}</div>}
      <div className="overflow-auto rounded-[var(--radius-card)] border border-line bg-surface p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={event.floor_plan_url} alt="Floor plan" className="w-full" />
      </div>
    </PortalShell>
  );
}
