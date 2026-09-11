"use client";
import { useRouter } from "next/navigation";

export type PickerOption = { id: string; label: string };

/**
 * Which checkpoint the summary is counting. Without it the card said "34 of 43" without
 * ever saying 34 of what — registration, dinner, or anyone scanned anywhere.
 *
 * Navigating on change keeps the choice in the URL, so the dashboard's own 15-second
 * refresh lands back on the same view rather than resetting to "any" under the reader.
 */
export function CheckpointPicker({ eventId, options, value }: {
  eventId: string;
  options: PickerOption[];
  value: string;
}) {
  const router = useRouter();
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="sr-only">Checkpoint to count</span>
      <select
        value={value}
        onChange={(e) => router.push(e.target.value ? `/admin/events/${eventId}?cp=${e.target.value}` : `/admin/events/${eventId}`)}
        className="min-h-11 w-full rounded-[var(--radius-control)] bg-canvas px-3 text-xs font-bold text-ink"
      >
        <option value="">Any checkpoint</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
}
