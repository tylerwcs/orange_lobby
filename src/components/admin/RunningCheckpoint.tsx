"use client";
import { useOptimistic, useTransition } from "react";
import type { CheckpointOption } from "@/lib/checkpoints";

/**
 * Which door the event is on, chosen where an organiser is already looking — beside Open
 * scanner, on the screen they watch all day. Everything follows it: the figures under it,
 * the checkpoint the scanner opens on, and what a bulk check-in writes to.
 *
 * Optimistic rather than local state, so the select moves on the click and snaps back to
 * what the server actually stored if the write fails.
 */
export function RunningCheckpoint({ options, value, setActive }: {
  options: CheckpointOption[];
  value: string;
  setActive: (formData: FormData) => void | Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useOptimistic(value);
  if (options.length === 0) return null;

  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="hidden text-[11px] font-bold uppercase tracking-[0.08em] text-muted sm:inline">Running</span>
      <select
        value={chosen}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          startTransition(async () => {
            setChosen(id);
            const body = new FormData();
            body.set("checkpoint_id", id);
            await setActive(body);
          });
        }}
        className="min-h-11 max-w-56 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-sm font-bold text-ink disabled:opacity-60"
      >
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
}
