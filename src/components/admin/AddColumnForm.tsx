"use client";
import { useState } from "react";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ATTENDEE_FIELD_TYPES, FIELD_TYPE_LABELS, labelFromKey, type AttendeeFieldType } from "@/lib/attendee-fields";

const control = "min-h-11 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 text-sm";

const HINTS: Record<AttendeeFieldType, string> = {
  text: "Anything typed — a room number, a flight, a note.",
  number: "Digits only, so the column adds up in Excel.",
  date: "A date picker, stored as a real date.",
  select: "A fixed list, so everyone spells it the same way.",
};

/**
 * Adds one organiser-defined column. The type is asked for up front because it decides
 * what the field looks like everywhere afterwards — in the attendee panel, and in what
 * lands in the export.
 *
 * `suggestions` are values already sitting on the attendees that no column has claimed:
 * answers from the registration form, or headers an import kept. Naming a column after
 * one fills it on creation, which is the difference between one click and a hundred.
 */
export function AddColumnForm({ addColumn, suggestions = [] }: {
  addColumn: (formData: FormData) => void | Promise<void>;
  suggestions?: { key: string; count: number }[];
}) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<AttendeeFieldType>("text");

  return (
    <form action={addColumn} className="grid gap-4">
      {suggestions.length > 0 && (
        <div>
          <p className="text-sm font-bold">Already on your attendees</p>
          <p className="mt-0.5 text-xs text-muted">Name a column after one of these and it arrives filled in.</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.key} type="button" onClick={() => setLabel(labelFromKey(s.key))}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-sm font-bold text-ink transition-colors duration-150 hover:bg-canvas"
              >
                {labelFromKey(s.key)}
                <span className="text-xs font-semibold tabular-nums text-muted">{s.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="block text-sm">
        <span className="mb-1 block font-bold">Column name</span>
        <input name="label" value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={40} placeholder="Room no" className={control} />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-bold">Type</span>
        <select name="type" value={type} onChange={(e) => setType(e.target.value as AttendeeFieldType)} className={control}>
          {ATTENDEE_FIELD_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>)}
        </select>
        <span className="mt-1 block text-xs text-muted">{HINTS[type]}</span>
      </label>

      {type === "select" && (
        <label className="block text-sm">
          <span className="mb-1 block font-bold">Choices</span>
          <input name="options" required placeholder="Halal, Vegetarian, No preference" className={control} />
          <span className="mt-1 block text-xs text-muted">Separated by commas.</span>
        </label>
      )}

      <SubmitButton>Add column</SubmitButton>
    </form>
  );
}
