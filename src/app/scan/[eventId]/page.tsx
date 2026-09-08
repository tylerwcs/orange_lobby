import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { countCheckinsByCheckpoint } from "@/lib/db/checkins";
import { countAttendees } from "@/lib/db/attendees";
import { Scanner } from "./Scanner";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Card";

export default async function ScanPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ cp?: string }> }) {
  const { eventId } = await params; const { cp } = await searchParams;
  const { orgId } = await requireAdmin(); const ev = await requireEvent(eventId, orgId);
  const [cps, counts, total] = await Promise.all([listCheckpoints(ev.id), countCheckinsByCheckpoint(ev.id), countAttendees(ev.id)]);
  const active = cps.find((c) => c.id === cp);
  if (!active) {
    return (
      <main className="mx-auto max-w-md p-4">
        <h1 className="text-xl font-extrabold">{ev.name}</h1>
        <p className="text-sm text-muted">Choose a checkpoint to start scanning</p>
        <ul className="mt-4 flex flex-col gap-2">
          {cps.map((c) => (
            <li key={c.id}>
              <a href={`/scan/${ev.id}?cp=${c.id}`} className="flex min-h-14 items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4">
                <Icon name="flag" size={20} className="text-brand-ink" />
                <span className="flex-1 text-[15px] font-bold">{c.name}</span>
                <Pill tone="muted">{counts[c.id] ?? 0}/{total}</Pill>
                <Icon name="chevron" size={18} className="text-muted" />
              </a>
            </li>
          ))}
          {cps.length === 0 && <li className="text-sm text-red-700">No checkpoints configured. Add them in admin.</li>}
        </ul>
      </main>
    );
  }
  return <Scanner eventId={ev.id} checkpoint={active} initialCount={counts[active.id] ?? 0} total={total} />;
}
