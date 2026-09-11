import type { AttendeeField } from "@/lib/attendee-fields";

const control = "w-full min-h-11 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-sm";

/**
 * The event's own columns, rendered as real labelled inputs — the thing that replaced the
 * `Extra (JSON)` textarea. Each posts under `f_<key>`, which is what
 * `fieldValuesFromForm` reads back.
 */
export function FieldInputs({ fields, values }: { fields: AttendeeField[]; values?: Record<string, string> }) {
  return (
    <>
      {fields.map((f) => {
        const value = values?.[f.key] ?? "";
        return (
          <label key={f.key} className="block text-sm">
            <span className="mb-1 block font-bold">{f.label}</span>
            {f.type === "select" ? (
              <select name={`f_${f.key}`} defaultValue={value} className={control}>
                <option value="">—</option>
                {/* A value stored before the choices changed still shows, rather than
                    silently reverting to blank the moment the form is saved. */}
                {(f.options ?? []).concat(value && !f.options?.includes(value) ? [value] : []).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input
                name={`f_${f.key}`}
                defaultValue={value}
                type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                {...(f.type === "number" ? { step: "any", inputMode: "decimal" as const } : {})}
                className={control}
              />
            )}
          </label>
        );
      })}
    </>
  );
}
