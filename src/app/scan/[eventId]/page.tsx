import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { countCheckinsByCheckpoint } from "@/lib/db/checkins";
import { countAttendees } from "@/lib/db/attendees";
import { Scanner } from "./Scanner";

export default async function ScanPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ cp?: string }> }) {
  const { eventId } = await params; const { cp } = await searchParams;
  const { orgId } = await requireAdmin(); const ev = await requireEvent(eventId, orgId);
  const [cps, counts, total] = await Promise.all([listCheckpoints(ev.id), countCheckinsByCheckpoint(ev.id), countAttendees(ev.id)]);
  const active = cps.find((c) => c.id === cp);
  if (!active) {
    return (
      <main className="mx-auto max-w-md p-4">
        <h1 className="mb-4 text-xl font-semibold">{ev.name} · Scanner</h1>
        <p className="mb-3 text-sm text-gray-600">Choose a checkpoint</p>
        <ul className="space-y-2">
          {cps.map((c) => <li key={c.id}><a href={`/scan/${ev.id}?cp=${c.id}`} className="block rounded-lg border bg-white p-4">{c.name} <span className="float-right text-gray-500">{counts[c.id] ?? 0}/{total}</span></a></li>)}
          {cps.length === 0 && <li className="text-sm text-red-600">No checkpoints configured. Add them in admin.</li>}
        </ul>
      </main>
    );
  }
  return <Scanner eventId={ev.id} checkpoint={active} initialCount={counts[active.id] ?? 0} total={total} />;
}
