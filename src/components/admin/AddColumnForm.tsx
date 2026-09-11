"use client";
import { useState } from "react";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ATTENDEE_FIELD_TYPES, FIELD_TYPE_LABELS, type AttendeeFieldType } from "@/lib/attendee-fields";

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
 */
export function AddColumnForm({ addColumn }: { addColumn: (formData: FormData) => void | Promise<void> }) {
  const [type, setType] = useState<AttendeeFieldType>("text");

  return (
    <form action={addColumn} className="grid gap-4">
      <label className="block text-sm">
        <span className="mb-1 block font-bold">Column name</span>
        <input name="label" required maxLength={40} autoFocus placeholder="Room no" className={control} />
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
