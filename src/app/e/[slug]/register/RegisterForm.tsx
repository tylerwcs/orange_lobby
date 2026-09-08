"use client";
import { useActionState, useState } from "react";
import { registerAction, type RegisterState } from "./actions";
import type { RegistrationQuestion } from "@/lib/types";
import { Button } from "@/components/ui/Card";

const control = "w-full min-h-11 rounded-[var(--radius-control)] border border-line bg-surface px-3.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
const labelCls = "mb-1 block text-sm font-bold";

function isShown(q: RegistrationQuestion, answers: Record<string, string>) {
  if (!q.show_when) return true;
  return (answers[q.show_when.key] ?? "").toLowerCase().includes(q.show_when.includes.toLowerCase());
}

export function RegisterForm({ slug, questions }: { slug: string; questions: RegistrationQuestion[] }) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerAction.bind(null, slug), {});
  const v = state.values ?? {};
  const [answers, setAnswers] = useState<Record<string, string>>(() => Object.fromEntries(questions.map((q) => [q.key, v[q.key] ?? ""])));
  const err = (k: string) => state.errors?.[k] && <p id={`${k}-error`} className="mt-1 text-xs text-red-600">{state.errors[k]}</p>;
  const invalid = (k: string) => (state.errors?.[k] ? { "aria-invalid": true, "aria-describedby": `${k}-error` } : {});
  const set = (k: string, val: string) => setAnswers((a) => ({ ...a, [k]: val }));

  return (
    <form action={action} className="space-y-6">
      {state.errors?.form && <p role="alert" className="rounded-[var(--radius-control)] bg-red-50 p-3 text-sm text-red-700">{state.errors.form}</p>}

      <fieldset className="space-y-4">
        <legend className="mb-1 text-base font-extrabold">About you</legend>
        <div><label htmlFor="reg-name" className={labelCls}>Full name</label><input id="reg-name" name="name" required autoComplete="name" defaultValue={v.name} className={control} {...invalid("name")} />{err("name")}</div>
        <div><label htmlFor="reg-email" className={labelCls}>Email</label><input id="reg-email" name="email" type="email" required autoComplete="email" inputMode="email" defaultValue={v.email} className={control} {...invalid("email")} />{err("email")}</div>
        <div><label htmlFor="reg-phone" className={labelCls}>Mobile number <span className="font-normal text-muted">(optional)</span></label><input id="reg-phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" defaultValue={v.phone} className={control} /></div>
        <div><label htmlFor="reg-company" className={labelCls}>Department or company <span className="font-normal text-muted">(optional)</span></label><input id="reg-company" name="company" autoComplete="organization" defaultValue={v.company} className={control} /></div>
      </fieldset>

      {questions.length > 0 && (
        <fieldset className="space-y-4">
          <legend className="mb-1 text-base font-extrabold">Your details</legend>
          {questions.map((q) => {
            const id = `reg-${q.key}`;
            const shown = isShown(q, answers);
            if (!shown) return <input key={q.key} type="hidden" name={q.key} value="" />;
            return (
              <div key={q.key}>
                <label htmlFor={id} className={labelCls}>{q.label}{!q.required && <span className="font-normal text-muted"> (optional)</span>}</label>
                {q.description && <p id={`${id}-help`} className="mb-2 text-xs text-muted">{q.description}</p>}
                {q.type === "select" ? (
                  <select id={id} name={q.key} required={q.required} value={answers[q.key] ?? ""} onChange={(e) => set(q.key, e.target.value)}
                    aria-describedby={q.description ? `${id}-help` : undefined} className={control} {...invalid(q.key)}>
                    <option value="">Select…</option>
                    {q.options!.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input id={id} name={q.key} required={q.required} value={answers[q.key] ?? ""} onChange={(e) => set(q.key, e.target.value)}
                    aria-describedby={q.description ? `${id}-help` : undefined} className={control} {...invalid(q.key)} />
                )}
                {err(q.key)}
              </div>
            );
          })}
        </fieldset>
      )}

      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? "Submitting…" : "Register"}
      </Button>
    </form>
  );
}
