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
 * The one question editor, used by both the registration form in Settings and a form's own
 * editor (D174).
 *
 * What differs between the two is only which types the `<select>` offers, and that is the
 * `types` prop, not a decision made here: registration passes `REGISTRATION_QUESTION_TYPES`
 * and cannot offer `file`, a form passes `FORM_QUESTION_TYPES` and can (D164). Everything
 * else — the columns, the field names, the aria labels — is necessarily identical for both,
 * because `questionsFromForm` is the single reader that parses what either one posts.
 *
 * That shared reader is why this had to stop being two copies. The fields are a contract
 * between the markup and the parser, and a contract written out twice is one an edit can
 * break on one side only: a renamed input here and the questions silently stop saving
 * there, with nothing failing to say so.
 *
 * Emits `q_${n}_label`, `q_${n}_key`, `q_${n}_type`, `q_${n}_required`, `q_${n}_options`,
 * `q_${n}_description`, `q_${n}_show_key` and `q_${n}_show_value`, for `n` from 1 to `max`.
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
