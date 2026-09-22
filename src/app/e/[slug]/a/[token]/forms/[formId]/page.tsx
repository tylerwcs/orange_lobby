import { notFound } from "next/navigation";
import { loadPortalAttendee } from "@/lib/portal";
import { getForm, submissionsForAttendee } from "@/lib/db/forms";
import { canSubmit, type SubmitReason } from "@/lib/forms";
import { nowInKL } from "@/lib/time";
import type { RegistrationQuestion } from "@/lib/types";
import { submitFormAction } from "../actions";
import { SubmissionHistory } from "@/components/portal/SubmissionHistory";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";

export const dynamic = "force-dynamic";

const inputClass = "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

/** What the attendee reads in place of the submit button when `canSubmit` says no (D167). */
const REFUSAL: Record<Exclude<SubmitReason, "ok">, string> = {
  closed: "This form is closed.",
  ineligible: "This form is not open to your group.",
  limit: "You have sent all the entries this form takes.",
  today: "You have already submitted today. Come back tomorrow.",
};

/**
 * One question, switched on `q.type`. `file` is not wired yet (Task 9) — it renders disabled
 * with a note, rather than pretending an upload works.
 */
function renderQuestion(q: RegistrationQuestion) {
  const id = `q-${q.key}`;
  if (q.type === "select") {
    return (
      <select id={id} name={q.key} required={q.required} className={inputClass}>
        <option value="">Select…</option>
        {q.options!.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (q.type === "textarea") {
    return <textarea id={id} name={q.key} required={q.required} rows={5} className={inputClass} />;
  }
  if (q.type === "file") {
    return (
      <div className="flex flex-col gap-1.5">
        <input id={id} type="file" disabled className={inputClass} />
        <FieldDescription>File questions are not ready yet</FieldDescription>
      </div>
    );
  }
  const type = q.type === "phone" ? "tel" : q.type === "number" ? "number" : "text";
  return <input id={id} name={q.key} type={type} required={q.required} className={inputClass} />;
}

export default async function FormPage({ params }: { params: Promise<{ slug: string; token: string; formId: string }> }) {
  const { slug, token, formId } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const form = await getForm(formId, event.id);
  if (!form) notFound();

  const submissions = await submissionsForAttendee(attendee.id);
  const mine = submissions.filter((s) => s.form_id === form.id);
  const today = nowInKL().date;
  const state = canSubmit(form, mine, attendee.category, today);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-extrabold">{form.name}</h1>
        {form.description && <p className="text-sm text-muted-foreground">{form.description}</p>}
      </div>

      <Card>
        <CardContent className="pt-6">
          <form action={submitFormAction.bind(null, slug, token, form.id)} className="flex flex-col gap-6">
            {form.questions.length > 0 && (
              <FieldSet>
                <FieldGroup>
                  {form.questions.map((q) => (
                    <Field key={q.key}>
                      <FieldLabel htmlFor={`q-${q.key}`}>
                        {q.label}
                        {!q.required && <span className="font-normal text-muted-foreground">(optional)</span>}
                      </FieldLabel>
                      {q.description && <FieldDescription>{q.description}</FieldDescription>}
                      {renderQuestion(q)}
                    </Field>
                  ))}
                </FieldGroup>
              </FieldSet>
            )}
            {state.can ? (
              <Button type="submit" className="h-12 w-full text-base font-bold">Submit</Button>
            ) : (
              <p className="text-sm text-muted-foreground">{REFUSAL[state.reason as Exclude<SubmitReason, "ok">]}</p>
            )}
          </form>
        </CardContent>
      </Card>

      <SubmissionHistory submissions={mine} questions={form.questions} />
    </div>
  );
}
