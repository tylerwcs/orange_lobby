import { Card } from "@/components/ui/Card";
import { Meter } from "@/components/ui/Meter";
import { shortDate } from "@/lib/text";
import type { Checkpoint } from "@/lib/types";

/**
 * How far each door has got. This is the thing an organiser checks on event day — not the
 * shape of the morning, which is what the arrivals chart drew and nobody read.
 *
 * Every checkpoint on every day, grouped by date, rather than one day at a time behind a
 * filter: with three or four doors the whole picture fits, and a filter you have to change
 * to see the rest is a filter you forget to change.
 */
export function CheckpointProgress({ days, registered }: {
  days: { day: string; items: { checkpoint: Checkpoint; count: number }[] }[];
  registered: number;
}) {
  const multiDay = days.length > 1;
  return (
    <Card className="flex flex-col gap-4 p-5">
      <h2 className="text-[17px] font-extrabold">Check-in</h2>

      {days.length === 0 ? (
        <p className="text-sm text-muted">No checkpoints yet. Add them in Settings.</p>
      ) : (
        days.map(({ day, items }) => (
          <div key={day} className="flex flex-col gap-3">
            {multiDay && <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted">{shortDate(day)}</p>}
            {items.map(({ checkpoint, count }) => (
              <div key={checkpoint.id}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs font-bold">
                  <span className={count > 0 ? "text-ink" : "text-muted"}>{checkpoint.name}</span>
                  <span className="text-muted tabular-nums">{count > 0 ? `${count} / ${registered}` : "no scans yet"}</span>
                </div>
                <Meter value={count} max={registered} label={`${checkpoint.name}: ${count} of ${registered}`} />
              </div>
            ))}
          </div>
        ))
      )}
    </Card>
  );
}
