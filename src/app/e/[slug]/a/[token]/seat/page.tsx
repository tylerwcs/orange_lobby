import { loadPortalAttendee } from "@/lib/portal";
import { PortalShell } from "@/components/portal/PortalShell";

export default async function Seat({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  return (
    <PortalShell event={event} basePath={`/e/${slug}/a/${token}`} personal>
      <h1 className="mb-3 text-xl font-semibold">My seat</h1>
      {attendee.table_no ? (
        <div className="mb-4 rounded-lg p-6 text-center text-white" style={{ background: "var(--brand)" }}>
          <div className="text-sm uppercase opacity-80">Table</div><div className="text-5xl font-bold">{attendee.table_no}</div>
          {attendee.seat_no && <div className="mt-2 text-sm">Seat {attendee.seat_no}</div>}
        </div>
      ) : <p className="mb-4 text-gray-600">Your seat will be shown here once seating is confirmed.</p>}
      {event.floor_plan_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.floor_plan_url} alt="Floor plan" className="w-full rounded-lg border" />
      )}
    </PortalShell>
  );
}
