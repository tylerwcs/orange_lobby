"use client";
import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Meter } from "@/components/ui/Meter";
import { SummaryStatsSkeleton } from "@/components/admin/SummaryCardSkeleton";

export type CheckpointOption = { id: string; label: string };

/**
 * The counts as a vertical list, which packs into a narrow column better than a
 * horizontal band. The progress meter lives here too, so the check-in figure is stated
 * once on the page rather than twice in two treatments.
 *
 * The scope line is load-bearing: "34 of 43" never said 34 of what — through the door, at
 * dinner, or anyone scanned anywhere.
 *
 * The pending state is the component's own, not a Suspense boundary. A boundary never
 * showed: the page awaits its data before it reaches the boundary, so by the time anything
 * streams the numbers are ready too, and React had nothing to fall back to. A transition
 * knows the navigation is in flight from the moment the reader picks something.
 */
export function SummaryCard({ eventId, options, checkpointId, checkedIn, registered }: {
  eventId: string;
  options: CheckpointOption[];
  checkpointId: string;
  checkedIn: number;
  registered: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Optimistic rather than local state: the select moves the moment it is used, and snaps
  // back to whatever the URL actually holds once the navigation settles — including on a
  // back button, which local state would ignore.
  const [chosen, setChosen] = useOptimistic(checkpointId);

  const change = (next: string) => {
    startTransition(() => {
      setChosen(next);
      router.push(next ? `/admin/events/${eventId}?cp=${next}` : `/admin/events/${eventId}`);
    });
  };

  const scope = options.find((o) => o.id === chosen)?.label;
  const rows: { label: string; value: number; lead?: boolean }[] = [
    { label: "Checked in", value: checkedIn, lead: true },
    { label: "Not yet in", value: Math.max(0, registered - checkedIn) },
    { label: "Registered", value: registered },
  ];
  const pct = registered > 0 ? Math.round((checkedIn / registered) * 100) : 0;

  return (
    <Card className="p-5">
      <h2 className="text-[17px] font-extrabold">Summary</h2>

      {options.length > 0 && (
        <label className="mt-3 block">
          <span className="sr-only">Checkpoint to count</span>
          <select value={chosen} onChange={(e) => change(e.target.value)}
            className="min-h-11 w-full rounded-[var(--radius-control)] bg-canvas px-3 text-xs font-bold text-ink">
            <option value="">Any checkpoint</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
      )}

      {/* Everything below the picker depends on the choice, so all of it waits together —
          a stale caption over fresh numbers would be worse than a moment of nothing. */}
      {pending ? <div className="mt-3"><SummaryStatsSkeleton /></div> : (
        <>
          <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
            {scope ? `At ${scope}` : "Across every checkpoint"}
          </p>
          <dl className="mt-1">
            {rows.map((r, i) => (
              <div key={r.label} className={`flex items-baseline justify-between py-3 ${i < rows.length - 1 ? "border-b border-line" : ""}`}>
                <dt className="text-[13px] font-bold text-muted">{r.label}</dt>
                <dd className={`text-[26px] font-extrabold leading-none tabular-nums ${r.lead ? "text-ok-strong" : "text-ink"}`}>{r.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex flex-col gap-2">
            <Meter value={checkedIn} max={registered} label={`${checkedIn} of ${registered} attendees checked in${scope ? ` at ${scope}` : ""}`} />
            <p className="text-xs font-semibold text-muted tabular-nums">{pct}% of the room is in</p>
          </div>
        </>
      )}
    </Card>
  );
}
