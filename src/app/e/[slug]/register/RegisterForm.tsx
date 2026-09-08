"use client";
import { useActionState } from "react";
import { registerAction, type RegisterState } from "./actions";
import type { RegistrationQuestion } from "@/lib/types";
import { Button } from "@/components/ui/Card";

export function RegisterForm({ slug, questions }: { slug: string; questions: RegistrationQuestion[] }) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerAction.bind(null, slug), {});
  const v = state.values ?? {};
  const err = (k: string) => state.errors?.[k] && <p className="mt-1 text-xs text-red-600">{state.errors[k]}</p>;
  const cls = "w-full min-h-11 rounded-[var(--radius-control)] border border-line bg-surface px-3.5 text-base";
  return (
    <form action={action} className="space-y-4">
      {state.errors?.form && <p className="rounded-[var(--radius-control)] bg-red-50 p-3 text-sm text-red-700">{state.errors.form}</p>}
      <div><input name="name" placeholder="Full name *" defaultValue={v.name} className={cls} />{err("name")}</div>
      <div><input name="email" type="email" placeholder="Email *" defaultValue={v.email} className={cls} />{err("email")}</div>
      <div><input name="phone" type="tel" placeholder="Mobile" defaultValue={v.phone} className={cls} /></div>
      <div><input name="company" placeholder="Company / Department" defaultValue={v.company} className={cls} /></div>
      {questions.map((q) => (
        <div key={q.key}>
          <label className="mb-1 block text-sm font-bold">{q.label}{q.required && " *"}</label>
          {q.description && <p className="mb-2 text-xs text-muted">{q.description}</p>}
          {q.type === "select" ? (
            <select name={q.key} defaultValue={v[q.key] ?? ""} className={cls}>
              <option value="">Select…</option>
              {q.options!.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : <input name={q.key} defaultValue={v[q.key]} className={cls} />}
          {err(q.key)}
        </div>
      ))}
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? "Submitting…" : "Register"}
      </Button>
    </form>
  );
}
