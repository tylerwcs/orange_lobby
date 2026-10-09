"use client";
import { useState } from "react";
import { SubmitButton } from "@/components/admin/SubmitButton";

export type Placeable = { id: string; name: string; category: string | null };
export type SessionOption = { id: string; label: string; left: number };

/**
 * The people this activity still needs a choice from, and the one control that places them.
 *
 * Full sessions are not in the select. The database would refuse them anyway (D126), but a
 * dropdown that offers a choice and then rejects it is a worse way to learn that than not
 * offering it — and the counts here are a render old, so the refusal path still has to work.
 */
export function UnbookedPanel({ people, options, place }: {
  people: Placeable[];
  options: SessionOption[];
  place: (fd: FormData) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  if (people.length === 0) {
    return <p className="text-sm text-muted-foreground">Everyone who can book has booked.</p>;
  }

  return (
    <form action={place} className="flex flex-col gap-3">
      <input type="hidden" name="ids" value={selected.join(",")} />
      <ul className="divide-y divide-border">
        {people.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2.5">
            <input
              type="checkbox" className="size-4" checked={selected.includes(p.id)}
              onChange={() => toggle(p.id)} aria-label={`Select ${p.name}`}
            />
            <span className="min-w-0 flex-1 text-sm">{p.name}</span>
            {p.category && <span className="text-sm text-muted-foreground">{p.category}</span>}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="session_id" className="text-sm font-bold">Place in</label>
        <select id="session_id" name="session_id" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.label} — {o.left} left</option>
          ))}
        </select>
        <span className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {selected.length} selected
        </span>
        <SubmitButton>Place selected</SubmitButton>
      </div>
      {options.length === 0 && (
        <p className="text-sm text-muted-foreground">Every session is full. Raise a capacity or add a session.</p>
      )}
    </form>
  );
}
