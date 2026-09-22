import type { QuestionType, RegistrationQuestion } from "@/lib/types";

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Labels for every `QuestionType` the app knows. Which ones a given editor offers is decided by its `types` prop, not by this map (D164). */
const TYPE_LABELS: Record<QuestionType, string> = {
  text: "Text",
  phone: "Phone",
  number: "Number",
  select: "Choice",
  textarea: "Long text",
  file: "File",
};

/**
 * The question editor rows, extracted from the registration table's markup in the settings
 * page (search `q_${n}_` in `src/app/admin/events/[id]/settings/page.tsx`) so a form's
 * editor can offer more types than registration does. The `<select>` is built from `types`
 * alone, so a form can offer `file` and registration cannot (D164) — nothing here decides
 * that, the caller does.
 *
 * This is an extraction, not a shared implementation: the settings page still has its own
 * inline copy of this same table, hardcoded to `REGISTRATION_QUESTION_TYPES`'s four types,
 * because unifying it would mean touching a business-critical page with no test covering
 * its markup — out of scope for the task that added this component (Task 7). The two must
 * be kept in sync by hand until someone does that unification: a change to one of these
 * rows (a new column, a relabelled type, an aria-label tweak) needs the same change made in
 * settings/page.tsx, and nothing enforces that today.
 *
 * Reads exactly like the settings table: `q_${n}_label`, `q_${n}_key`, `q_${n}_type`,
 * `q_${n}_required`, `q_${n}_options`, `q_${n}_description`, `q_${n}_show_key` and
 * `q_${n}_show_value`, for `n` from 1 to `max`. `questionsFromForm` (src/lib/questions-form.ts)
 * is the reader that turns those fields back into `RegistrationQuestion[]`, for both copies.
 */
export function QuestionEditor({ questions, types, max }: {
  questions: RegistrationQuestion[];
  types: readonly QuestionType[];
  max: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              <th className="p-1.5">#</th><th className="p-1.5">Label</th><th className="p-1.5">Key</th><th className="p-1.5">Type</th><th className="p-1.5">Required</th><th className="p-1.5">Options (comma separated)</th><th className="p-1.5">Help text</th><th className="p-1.5">Show only when</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
              const q = questions[n - 1];
              return (
                <tr key={n} className="border-t border-border align-top">
                  <td className="p-1.5 pt-3 text-xs text-muted-foreground">{n}</td>
                  <td className="p-1.5"><input name={`q_${n}_label`} defaultValue={q?.label ?? ""} aria-label={`Question ${n} label`} className={input} /></td>
                  <td className="p-1.5"><input name={`q_${n}_key`} defaultValue={q?.key ?? ""} aria-label={`Question ${n} key`} placeholder="auto" className={`${input} font-mono text-xs`} /></td>
                  <td className="p-1.5">
                    <select name={`q_${n}_type`} defaultValue={q?.type ?? types[0]} aria-label={`Question ${n} type`} className={input}>
                      {types.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                    </select>
                  </td>
                  <td className="p-1.5 pt-3 text-center"><input type="checkbox" name={`q_${n}_required`} defaultChecked={q?.required ?? false} aria-label={`Question ${n} required`} className="size-4 accent-primary" /></td>
                  <td className="p-1.5"><input name={`q_${n}_options`} defaultValue={q?.options?.join(", ") ?? ""} aria-label={`Question ${n} options`} className={input} /></td>
                  <td className="p-1.5"><input name={`q_${n}_description`} defaultValue={q?.description ?? ""} aria-label={`Question ${n} help text`} className={input} /></td>
                  <td className="p-1.5">
                    <div className="flex gap-1">
                      <input name={`q_${n}_show_key`} defaultValue={q?.show_when?.key ?? ""} aria-label={`Question ${n} depends on key`} placeholder="key" className={`${input} font-mono text-xs`} />
                      <input name={`q_${n}_show_value`} defaultValue={q?.show_when?.includes ?? ""} aria-label={`Question ${n} depends on value`} placeholder="contains" className={input} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
