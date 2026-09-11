import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { activeCheckpoint, checkpointsByDay } from "@/lib/checkpoints";
import { countCheckinsByCheckpoint } from "@/lib/db/checkins";
import { countAttendees } from "@/lib/db/attendees";
import { nowInKL } from "@/lib/time";
import { shortDate } from "@/lib/text";
import { Scanner } from "./Scanner";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/Badge";

export default async function ScanPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ cp?: string; pick?: string }> }) {
  const { eventId } = await params; const { cp, pick } = await searchParams;
  const { orgId } = await requireAdmin(); const ev = await requireEvent(eventId, orgId);
  const [cps, counts, total] = await Promise.all([listCheckpoints(ev.id), countCheckinsByCheckpoint(ev.id), countAttendees(ev.id)]);
  const today = nowInKL().date;
  // Crew open the scanner and start scanning: it lands on whatever Settings says the event
  // is running, and the chooser is one tap away for the second door. `?cp=` still wins, so
  // a link to a particular door keeps working.
  const active = cps.find((c) => c.id === cp)
    ?? (pick ? undefined : activeCheckpoint(ev.active_checkpoint_id, cps, today) ?? undefined);
  if (!active) {
    const grouped = checkpointsByDay(cps);
    return (
      <main className="mx-auto max-w-md p-4">
        <h1 className="text-xl font-extrabold">{ev.name}</h1>
        <p className="text-sm text-muted">Choose a checkpoint to start scanning</p>
        {grouped.length === 0 && <p className="mt-4 text-sm font-semibold text-danger-strong">No checkpoints configured. Add them in Settings.</p>}
        <div className="mt-4 flex flex-col gap-5">
          {grouped.map((g) => (
            <section key={g.day}>
              <h2 className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                {shortDate(g.day)}
                {/* The crew open this on the day; say which group is the one in front of them. */}
                {g.day === today && <Badge tone="ok" dot>Today</Badge>}
              </h2>
              <ul className="flex flex-col gap-2">
                {g.items.map((c) => (
                  <li key={c.id}>
                    <a href={`/scan/${ev.id}?cp=${c.id}`} className="flex min-h-14 items-center gap-3 rounded-[var(--radius-card)] bg-surface px-4 shadow-[var(--shadow-card)]">
                      <Icon name="flag" size={20} className="text-brand-ink" />
                      <span className="flex-1 text-[15px] font-bold">{c.name}</span>
                      <Badge tone="neutral">{counts[c.id] ?? 0}/{total}</Badge>
                      <Icon name="chevron" size={18} className="text-muted" />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
    );
  }
  return <Scanner eventId={ev.id} checkpoint={active} initialCount={counts[active.id] ?? 0} total={total} />;
}
