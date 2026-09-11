"use client";
import { useRouter } from "next/navigation";
import type { Checkpoint } from "@/lib/types";

/**
 * Day and checkpoint pickers for the arrivals chart. Selects rather than chips: a day
 * can hold four or five checkpoints, and a row of pills that long wraps under a 340px
 * column and stops reading as one control.
 *
 * Navigating on change keeps the choice in the URL, so a refresh — including the
 * dashboard's own auto-refresh — lands back on the same view.
 */
export function ArrivalsFilter({ eventId, days, dayLabels, day, checkpoints, checkpointId }: {
  eventId: string;
  days: string[];
  dayLabels: Record<string, string>;
  day: string;
  checkpoints: Checkpoint[];
  checkpointId?: string;
}) {
  const router = useRouter();
  const go = (next: { day?: string; cp?: string }) => {
    const p = new URLSearchParams();
    p.set("day", next.day ?? day);
    // Changing day drops the checkpoint: the server picks that day's first, because a
    // checkpoint from another date would show a chart with nothing in it.
    if (next.cp) p.set("cp", next.cp);
    router.push(`/admin/events/${eventId}?${p.toString()}`);
  };

  const select = "min-h-11 w-full rounded-[var(--radius-control)] bg-canvas px-3 text-xs font-bold text-ink";

  return (
    <div className="flex w-full flex-col gap-2">
      {days.length > 1 && (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Day</span>
          <select className={select} value={day} onChange={(e) => go({ day: e.target.value })}>
            {days.map((d) => <option key={d} value={d}>{dayLabels[d] ?? d}</option>)}
          </select>
        </label>
      )}
      {checkpoints.length > 1 && (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Checkpoint</span>
          <select className={select} value={checkpointId ?? ""} onChange={(e) => go({ day, cp: e.target.value })}>
            {checkpoints.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
