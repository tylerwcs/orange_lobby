import { Card } from "@/components/ui/Card";
import { Meter } from "@/components/ui/Meter";
import type { ArrivalBucket } from "@/lib/checkins-stats";
import type { Checkpoint } from "@/lib/types";

/** A lone scan against a peak of 1 draws a full-height bar, which reads as a busy door. */
const MIN_PEAK = 4;

export function CheckInPanel({ checkedIn, registered, buckets, checkpoints, chartLabel, emptyChartLabel, controls }: {
  checkedIn: number; registered: number; buckets: ArrivalBucket[];
  checkpoints: { checkpoint: Checkpoint; count: number }[];
  chartLabel: string; emptyChartLabel: string; controls?: React.ReactNode;
}) {
  const peak = Math.max(MIN_PEAK, ...buckets.map((b) => b.count));
  const peakIndex = buckets.findIndex((b) => b.count === peak);
  return (
    <Card className="flex flex-col gap-5 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[17px] font-extrabold">Check-in</h2>
        {controls && <div className="ml-auto flex flex-wrap items-center gap-2">{controls}</div>}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-baseline gap-2">
            <span className="text-[52px] font-extrabold leading-none tabular-nums">{checkedIn}</span>
            <span className="text-base font-bold text-muted tabular-nums">of {registered} registered</span>
          </div>
          <div className="ml-auto text-right">
            <div className="text-[22px] font-extrabold leading-none tabular-nums">{Math.max(0, registered - checkedIn)}</div>
            <div className="mt-1 text-xs font-semibold text-muted">still to arrive</div>
          </div>
        </div>
        <Meter value={checkedIn} max={registered} label={`${checkedIn} of ${registered} attendees checked in`} />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{chartLabel}</h3>
        {buckets.length === 0 ? (
          // An empty window is a real answer. A flat axis of zeroes looks like a broken chart.
          <p className="rounded-[var(--radius-control)] bg-canvas px-4 py-6 text-center text-sm font-semibold text-muted">{emptyChartLabel}</p>
        ) : (
          /* One series, so one hue and no legend; only the peak bucket is labelled. */
          <div className="overflow-x-auto">
            <div className="min-w-[520px]">
              <div className="flex h-[104px] items-end gap-3.5 pt-4">
                {buckets.map((b, i) => (
                  <div key={b.label} className="flex flex-1 flex-col items-center">
                    {i === peakIndex && b.count > 0 && <div className="mb-1 text-xs font-extrabold tabular-nums">{b.count}</div>}
                    <div className="flex h-[68px] w-full items-end">
                      <div className="w-full rounded-t bg-brand-strong" style={{ height: `${(b.count / peak) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="h-px bg-line" />
              <div className="flex gap-3.5">
                {buckets.map((b) => <div key={b.label} className="flex-1 text-center text-[11px] font-semibold text-muted tabular-nums">{b.label}</div>)}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2.5 border-t border-line pt-4">
        {checkpoints.map(({ checkpoint, count }) => (
          <div key={checkpoint.id} className="flex items-center gap-3">
            <span className="w-32 shrink-0 text-sm font-bold">{checkpoint.name}</span>
            <span className="flex-1"><Meter value={count} max={registered} label={`${checkpoint.name}: ${count} of ${registered}`} /></span>
            <span className="w-16 shrink-0 text-right text-xs font-bold text-muted tabular-nums">{count} / {registered}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
