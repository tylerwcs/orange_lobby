import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { countCheckinsByCheckpoint } from "@/lib/db/checkins";
import { countAttendees } from "@/lib/db/attendees";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Card, buttonClass } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { addCheckpointAction, deleteCheckpointAction } from "../actions";

export const metadata = { title: "Checkpoints · Orange Lobby" };

export default async function CheckpointsAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const [cps, counts, total] = await Promise.all([listCheckpoints(ev.id), countCheckinsByCheckpoint(ev.id), countAttendees(ev.id)]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-extrabold">Checkpoints</h1>
        <p className="text-sm text-muted">Crew pick one when they open the scanner. One per day, or per door, meal or session.</p>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card>
          <ul className="divide-y divide-line text-sm">
            {cps.map((c) => {
              const n = counts[c.id] ?? 0;
              const pct = total ? Math.round((n / total) * 100) : 0;
              return (
                <li key={c.id} className="flex items-center gap-4 p-4">
                  <Icon name="flag" size={20} className="shrink-0 text-brand-ink" />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">{c.name}</div>
                    <div className="mt-1 flex items-center gap-3">
                      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} /></div>
                      <span className="text-xs text-muted tabular-nums">{n} of {total} checked in</span>
                    </div>
                  </div>
                  <a href={`/scan/${ev.id}?cp=${c.id}`} className={buttonClass("secondary")}><Icon name="scan" size={18} />Open scanner</a>
                  <form action={deleteCheckpointAction.bind(null, ev.id, c.id)}><ConfirmButton message={`Delete "${c.name}" and its ${n} check-in${n === 1 ? "" : "s"}?`}>Delete</ConfirmButton></form>
                </li>
              );
            })}
            {cps.length === 0 && <li className="p-6 text-muted">No checkpoints yet. Add &ldquo;Day 1&rdquo; and &ldquo;Day 2&rdquo; for a two-day event.</li>}
          </ul>
        </Card>

        <form action={addCheckpointAction.bind(null, ev.id)} className="grid gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 xl:sticky xl:top-6">
          <h2 className="text-base font-extrabold">Add a checkpoint</h2>
          <Field label="Name" name="name" placeholder="Day 1" />
          <Field label="Position in the list (lower first)" name="sort_order" type="number" defaultValue="0" />
          <SubmitButton>Add checkpoint</SubmitButton>
        </form>
      </div>
    </div>
  );
}
