"use client";
import { useActionState, useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";
import { registerAction, type RegisterState } from "./actions";
import type { RegistrationQuestion } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/**
 * A select stays native. The rest of this form is shadcn's Field set, but the choices an
 * invitee makes here are made on a phone, where a native select is the OS picker — one
 * thumb, no popup to mis-tap, and it works when JavaScript is still catching up. It is
 * also what the admin's own forms use, so the two sides of the app agree.
 */
const selectClass = "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20";

// Only these two question types want a specialised keyboard; select has its own branch below,
// and plain text needs neither an overridden type nor an inputMode.
const INPUT_TYPE: Record<string, string> = { phone: "tel", number: "number" };
const INPUT_MODE: Record<string, React.HTMLAttributes<HTMLInputElement>["inputMode"]> = { phone: "tel", number: "decimal" };

function isShown(q: RegistrationQuestion, answers: Record<string, string>) {
  if (!q.show_when) return true;
  return (answers[q.show_when.key] ?? "").toLowerCase().includes(q.show_when.includes.toLowerCase());
}

export function RegisterForm({ slug, questions }: {
  slug: string;
  questions: RegistrationQuestion[];
}) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerAction.bind(null, slug), {});
  // Every field is controlled, the four fixed ones included. They used to be uncontrolled
  // with a defaultValue echoed back from the server, which React ignores on re-render: after
  // a rejected submit the value the invitee could see and the value the component believed
  // in had already parted company, and Base UI says so out loud.
  const [answers, setAnswers] = useState<Record<string, string>>(() => ({ ...(state.values ?? {}) }));
  const set = (k: string, val: string) => setAnswers((a) => ({ ...a, [k]: val }));
  const value = (k: string) => answers[k] ?? "";
  const errors = state.errors ?? {};
  const fieldErrors = Object.keys(errors).filter((k) => k !== "form");

  useEffect(() => {
    // React resets the <form> when a server action returns (React 19). A controlled <select>
    // does not survive that reset: React writes the DOM only when the prop changed, and the
    // answer did not change — so every size an invitee picked goes blank while state still
    // holds it, and the form they are being asked to correct is emptier than the one they
    // sent. Put the DOM back in agreement with state before anything else.
    for (const [k, val] of Object.entries(answers)) {
      const el = document.getElementById(`reg-${k}`);
      if ((el instanceof HTMLSelectElement || el instanceof HTMLInputElement) && el.value !== val) el.value = val ?? "";
    }

    // A rejected form is read from wherever the submit button was — the bottom, on a phone,
    // with the answer that needs fixing somewhere above the fold. Take the invitee to it
    // rather than leaving them to hunt for the red text.
    const first = fieldErrors[0];
    if (!first) return;
    const el = document.getElementById(`reg-${first}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus({ preventScroll: true });
    // `state` is a fresh object on every submit, so the same error twice still moves focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  /** Invalid marks the control AND keeps pointing at its help text, which a reader needs most when the answer was wrong. */
  const invalid = (k: string, help?: string) => (errors[k]
    ? { "aria-invalid": true as const, "aria-describedby": [help, `reg-${k}-error`].filter(Boolean).join(" ") }
    : help ? { "aria-describedby": help } : {});

  return (
    <form action={action} className="flex flex-col gap-6">
      {errors.form && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>That didn&apos;t go through</AlertTitle>
          <AlertDescription>{errors.form}</AlertDescription>
        </Alert>
      )}

      <FieldSet>
        <FieldLegend>About you</FieldLegend>
        <FieldGroup>
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="reg-name">Full name</FieldLabel>
            <Input id="reg-name" name="name" required autoComplete="name" enterKeyHint="next" value={value("name")} onChange={(e) => set("name", e.target.value)} className="h-11" {...invalid("name")} />
            <FieldError id="reg-name-error">{errors.name}</FieldError>
          </Field>
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="reg-email">Email</FieldLabel>
            <Input id="reg-email" name="email" type="email" required autoComplete="email" inputMode="email" enterKeyHint="next" value={value("email")} onChange={(e) => set("email", e.target.value)} className="h-11" {...invalid("email", "reg-email-help")} />
            {/* The badge link is emailed to nobody — it appears on the next screen — but the
                address is how a duplicate registration finds the record it already has. */}
            <FieldDescription id="reg-email-help">We use this to recognise you if you register twice.</FieldDescription>
            <FieldError id="reg-email-error">{errors.email}</FieldError>
          </Field>
        </FieldGroup>
      </FieldSet>

      {questions.length > 0 && (
        <FieldSet>
          <FieldLegend>Your details</FieldLegend>
          <FieldGroup>
            {questions.map((q) => {
              const id = `reg-${q.key}`;
              if (!isShown(q, answers)) return <input key={q.key} type="hidden" name={q.key} value="" />;
              return (
                <Field key={q.key} data-invalid={!!errors[q.key]}>
                  <FieldLabel htmlFor={id}>{q.label}{!q.required && <span className="font-normal text-muted-foreground">(optional)</span>}</FieldLabel>
                  {q.description && <FieldDescription id={`${id}-help`}>{q.description}</FieldDescription>}
                  {q.type === "select" ? (
                    <select id={id} name={q.key} required={q.required} value={value(q.key)} onChange={(e) => set(q.key, e.target.value)}
                      className={selectClass} {...invalid(q.key, q.description ? `${id}-help` : undefined)}>
                      <option value="">Select…</option>
                      {q.options!.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <Input id={id} name={q.key} type={INPUT_TYPE[q.type] ?? "text"} inputMode={INPUT_MODE[q.type]} required={q.required} value={value(q.key)} onChange={(e) => set(q.key, e.target.value)}
                      className="h-11" {...invalid(q.key, q.description ? `${id}-help` : undefined)} />
                  )}
                  <FieldError id={`${id}-error`}>{errors[q.key]}</FieldError>
                </Field>
              );
            })}
          </FieldGroup>
        </FieldSet>
      )}

      <Field>
        <Button type="submit" disabled={pending} className="h-12 w-full text-base font-bold">
          {pending && <Spinner data-icon="inline-start" />}
          {pending ? "Submitting…" : "Register"}
        </Button>
        <FieldDescription className="text-center">Your QR badge appears on the next screen.</FieldDescription>
      </Field>
    </form>
  );
}
