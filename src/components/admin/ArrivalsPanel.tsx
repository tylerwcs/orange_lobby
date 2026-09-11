import { Card } from "@/components/ui/Card";
import { Meter } from "@/components/ui/Meter";
import type { ArrivalBucket } from "@/lib/checkins-stats";
import type { Checkpoint } from "@/lib/types";

/** A lone scan against a peak of 1 draws a full-height bar, which reads as a busy door. */
const MIN_PEAK = 4;

export function ArrivalsPanel({ buckets, registered, checkpoints, chartLabel, emptyChartLabel, controls }: {
  buckets: ArrivalBucket[];
  registered: number;
  checkpoints: { checkpoint: Checkpoint; count: number }[];
  chartLabel: string;
  emptyChartLabel: string;
  controls?: React.ReactNode;
}) {
  const peak = Math.max(MIN_PEAK, ...buckets.map((b) => b.count));
  const peakIndex = buckets.findIndex((b) => b.count === peak);
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[17px] font-extrabold">Arrivals</h2>
        {controls && <div className="ml-auto flex flex-wrap items-center gap-2">{controls}</div>}
      </div>

      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{chartLabel}</p>
      {buckets.length === 0 ? (
        // An empty window is a real answer. A flat axis of zeroes looks like a broken chart.
        <p className="rounded-[var(--radius-control)] bg-canvas px-4 py-6 text-center text-sm font-semibold text-muted">{emptyChartLabel}</p>
      ) : (
        /* One series, so one hue and no legend; only the peak bucket is labelled. */
        <div className="overflow-x-auto">
          <div className="min-w-[280px]">
            <div className="flex h-[96px] items-end gap-2.5 pt-4">
              {buckets.map((b, i) => (
                <div key={b.label} className="flex flex-1 flex-col items-center">
                  {i === peakIndex && b.count > 0 && <div className="mb-1 text-xs font-extrabold tabular-nums">{b.count}</div>}
                  <div className="flex h-[60px] w-full items-end">
                    <div className="w-full rounded-t bg-brand-strong" style={{ height: `${(b.count / peak) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="h-px bg-line" />
            <div className="flex gap-2.5 pt-1.5">
              {buckets.map((b) => <div key={b.label} className="flex-1 text-center text-[10px] font-semibold text-muted tabular-nums">{b.label}</div>)}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        {checkpoints.map(({ checkpoint, count }) => (
          <div key={checkpoint.id}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs font-bold">
              <span className={count > 0 ? "text-ink" : "text-muted"}>{checkpoint.name}</span>
              <span className="text-muted tabular-nums">{count > 0 ? `${count} / ${registered}` : "no scans yet"}</span>
            </div>
            <Meter value={count} max={registered} label={`${checkpoint.name}: ${count} of ${registered}`} />
          </div>
        ))}
        {checkpoints.length === 0 && <p className="text-sm text-muted">No checkpoints yet. Add them in Settings.</p>}
      </div>
    </Card>
  );
}
