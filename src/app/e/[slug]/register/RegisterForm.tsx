"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { CircleAlert } from "lucide-react";
import { registerAction, type RegisterState } from "./actions";
import type { RegistrationQuestion } from "@/lib/types";
import { isQuestionShown } from "@/lib/show-when";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CONSENT_FIELD, PRIVACY_MS_PATH, PRIVACY_PATH, TERMS_FIELD } from "@/lib/privacy";
import { Spinner } from "@/components/ui/spinner";
import { EventTermsPanel } from "@/components/portal/EventTermsPanel";
import { problemsInFormOrder, registrationErrors } from "@/lib/registration-check";
import { checkPhone, phoneTypingError } from "@/lib/phone";
import { CARD_TITLE_INK } from "@/lib/ink";

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
/** D675: what a valid answer looks like, for types with a format. */
const PLACEHOLDER: Record<string, string> = { phone: "012-345 6789 or +65 9123 4567" };

/**
 * Autofill hints come from the question's type, the same as INPUT_TYPE above.
 *
 * Company used to be matched by key here and hinted as "organization" — the one question
 * whose key the form knew by name. A hint is cheap to lose and the special case was not:
 * a question type is the only thing this should read.
 */
function autoCompleteFor(q: RegistrationQuestion): string | undefined {
  return q.type === "phone" ? "tel" : undefined;
}

export function RegisterForm({ slug, questions, termsHtml = null, waitlist = false }: {
  slug: string;
  /** D678: the waiting-list form on a full event. Only the heading changes; the questions, ticks and checks are the same. */
  waitlist?: boolean;
  /** The whole form in order, name and email included (`Event.registration_form`). */
  questions: RegistrationQuestion[];
  /** D540: the event's own terms, already sanitised. Null: none, and no second tick. */
  termsHtml?: string | null;
}) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerAction.bind(null, slug, waitlist), {});
  // Every field is controlled, name and email included. They used to be uncontrolled
  // with a defaultValue echoed back from the server, which React ignores on re-render: after
  // a rejected submit the value the invitee could see and the value the component believed
  // in had already parted company, and Base UI says so out loud.
  const [answers, setAnswers] = useState<Record<string, string>>(() => ({ ...(state.values ?? {}) }));
  const [agreed, setAgreed] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const value = (k: string) => answers[k] ?? "";

  // D546: the problems on show. The form's own check on Register sets them, tied to the server
  // state it was made against: once the server answers, its errors are the ones shown.
  const [checked, setChecked] = useState<{ against: RegisterState; errors: Record<string, string> } | null>(null);
  const errors = checked && checked.against === state ? checked.errors : (state.errors ?? {});
  // D676: phone answers are judged as they are typed (only what no more typing can fix) and in
  // full when the field is left; Register's own check still names everything else.
  const [live, setLive] = useState<Record<string, string>>({});
  const shown: Record<string, string> = { ...live, ...errors };
  const judge = (k: string, err: string | null) => setLive((l) => {
    const next = { ...l };
    if (err) next[k] = err;
    else delete next[k];
    return next;
  });
  const problems = problemsInFormOrder(errors, questions);
  const summaryRef = useRef<HTMLDivElement>(null);
  const valuesWith = (a: Record<string, string>, consent: boolean, terms: boolean) =>
    ({ ...a, [CONSENT_FIELD]: consent ? "yes" : "", [TERMS_FIELD]: terms ? "yes" : "" });

  /**
   * Once problems are on show, each change re-checks them: a fixed answer drops off the list
   * there and then. Only problems already shown are kept, so the invitee is not scolded for a
   * field they have not reached yet.
   */
  const recheck = (a: Record<string, string>, consent: boolean, terms: boolean) => {
    if (problems.length === 0) return;
    const now = registrationErrors(valuesWith(a, consent, terms), questions, !!termsHtml);
    setChecked({ against: state, errors: Object.fromEntries(Object.entries(now).filter(([k]) => k in errors)) });
  };
  const set = (k: string, val: string) => {
    const next = { ...answers, [k]: val };
    setAnswers(next);
    recheck(next, agreed, agreedTerms);
    if (questions.find((q) => q.key === k)?.type === "phone") judge(k, phoneTypingError(val));
  };
  /** D676: leaving a phone field judges the whole number - an unfinished one is wrong by now. */
  const leavePhone = (k: string) => {
    const v = value(k).trim();
    const full = v ? checkPhone(v) : null;
    judge(k, full && !full.ok ? full.error : null);
  };

  /** Register with something missing: nothing is sent, and the list above the button says what is still needed. */
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const found = registrationErrors(valuesWith(answers, agreed, agreedTerms), questions, !!termsHtml);
    if (Object.keys(found).length === 0) { setChecked(null); return; }
    e.preventDefault();
    setChecked({ against: state, errors: found });
    // After React has drawn it. Focus reads it out to a screen reader and brings it into view.
    requestAnimationFrame(() => summaryRef.current?.focus());
  };

  /** A summary item takes the invitee to its field. */
  const jump = (k: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById(`reg-${k}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus({ preventScroll: true });
  };

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
    // The consent tick is reset the same way, and must not make the invitee agree twice.
    const box = document.getElementById(`reg-${CONSENT_FIELD}`);
    if (box instanceof HTMLInputElement) box.checked = agreed;
    const termsBox = document.getElementById(`reg-${TERMS_FIELD}`);
    if (termsBox instanceof HTMLInputElement) termsBox.checked = agreedTerms;

    // A rejected form is read from wherever the submit button was — the bottom, on a phone.
    // The list of what to fix sits right above that button (D546), so it is the one to show.
    if (Object.keys(state.errors ?? {}).some((k) => k !== "form")) summaryRef.current?.focus();
    // `state` is a fresh object on every submit, so the same error twice still moves focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  /** Invalid marks the control AND keeps pointing at its help text, which a reader needs most when the answer was wrong. */
  const invalid = (k: string, help?: string) => (shown[k]
    ? { "aria-invalid": true as const, "aria-describedby": [help, `reg-${k}-error`].filter(Boolean).join(" ") }
    : help ? { "aria-describedby": help } : {});

  return (
    // noValidate: the browser's own bubbles name one field at a time; the form's check names them all (D546).
    <form action={action} onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {waitlist && (
        <div className="flex flex-col gap-1">
          <h2 className={`text-lg font-extrabold ${CARD_TITLE_INK}`}>You&apos;re joining the waiting list</h2>
          <p className="text-sm text-muted-foreground">Every place has been taken. Send this form to join the waiting list: if a place opens up, people on it are next, in the order they joined.</p>
        </div>
      )}
      {errors.form && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>That didn&apos;t go through</AlertTitle>
          <AlertDescription>{errors.form}</AlertDescription>
        </Alert>
      )}

      {/* One list in the organiser's order. Name and email are in it like any question, but
          they are the attendee's own columns: their inputs are fixed here, only their place,
          wording and help text come from the event. */}
      <FieldSet>
        <FieldLegend className="font-extrabold">About you</FieldLegend>
        <FieldGroup>
          {questions.map((q) => {
            const id = `reg-${q.key}`;
            if (!isQuestionShown(q, answers, questions)) return <input key={q.key} type="hidden" name={q.key} value="" />;
            const help = q.description ? `${id}-help` : undefined;
            const identity = q.key === "name" || q.key === "email";
            return (
              <Field key={q.key} data-invalid={!!shown[q.key]}>
                <FieldLabel htmlFor={id}>{q.label}{!identity && !q.required && <span className="font-normal text-muted-foreground">(optional)</span>}</FieldLabel>
                {q.description && <FieldDescription id={help}>{q.description}</FieldDescription>}
                {q.key === "name" ? (
                  <Input id={id} name="name" required autoComplete="name" enterKeyHint="next" value={value("name")} onChange={(e) => set("name", e.target.value)} className="h-11" {...invalid("name", help)} />
                ) : q.key === "email" ? (
                  <Input id={id} name="email" type="email" required autoComplete="email" inputMode="email" enterKeyHint="next" value={value("email")} onChange={(e) => set("email", e.target.value)} className="h-11" {...invalid("email", help)} />
                ) : q.type === "select" ? (
                  <select id={id} name={q.key} required={q.required} value={value(q.key)} onChange={(e) => set(q.key, e.target.value)}
                    className={selectClass} {...invalid(q.key, help)}>
                    <option value="">Select…</option>
                    {q.options!.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <Input id={id} name={q.key} type={INPUT_TYPE[q.type] ?? "text"} inputMode={INPUT_MODE[q.type]} autoComplete={autoCompleteFor(q)} placeholder={PLACEHOLDER[q.type]} required={q.required} value={value(q.key)} onChange={(e) => set(q.key, e.target.value)}
                    onBlur={q.type === "phone" ? () => leavePhone(q.key) : undefined}
                    className="h-11" {...invalid(q.key, help)} />
                )}
                <FieldError id={`${id}-error`}>{shown[q.key]}</FieldError>
              </Field>
            );
          })}
        </FieldGroup>
      </FieldSet>

      {/* D540-D541: the event's own terms, read in place and agreed with a tick of their own. */}
      {termsHtml && (
        // min-w-0: a fieldset is otherwise as wide as its widest unbreakable word.
        <FieldSet className="min-w-0">
          {/* Bold like the consent screen's heading (ConsentGate): it is a clause they are signing up to. */}
          <FieldLegend className="font-extrabold">Event terms</FieldLegend>
          <EventTermsPanel html={termsHtml} />
          <Field orientation="horizontal" data-invalid={!!errors[TERMS_FIELD]}>
            <input id={`reg-${TERMS_FIELD}`} name={TERMS_FIELD} type="checkbox" value="yes" required
              checked={agreedTerms} onChange={(e) => { setAgreedTerms(e.target.checked); recheck(answers, agreed, e.target.checked); }}
              className="mt-0.5 size-5 shrink-0 accent-primary" {...invalid(TERMS_FIELD)} />
            <FieldContent>
              <FieldLabel htmlFor={`reg-${TERMS_FIELD}`} className="font-normal leading-snug">I have read and agree to the event terms above.</FieldLabel>
              <FieldError id={`reg-${TERMS_FIELD}-error`}>{errors[TERMS_FIELD]}</FieldError>
            </FieldContent>
          </Field>
        </FieldSet>
      )}

      {/* D410: PDPA consent, had before anything is stored. A native checkbox, like the select
          above, so it works before JavaScript arrives and posts "yes" only when ticked. */}
      <Field orientation="horizontal" data-invalid={!!errors[CONSENT_FIELD]}>
        <input id={`reg-${CONSENT_FIELD}`} name={CONSENT_FIELD} type="checkbox" value="yes" required
          checked={agreed} onChange={(e) => { setAgreed(e.target.checked); recheck(answers, e.target.checked, agreedTerms); }}
          className="mt-0.5 size-5 shrink-0 accent-primary" {...invalid(CONSENT_FIELD)} />
        <FieldContent>
          <FieldLabel htmlFor={`reg-${CONSENT_FIELD}`} className="flex-col items-start gap-1 font-normal leading-snug">
            <span>
              I agree to my personal data being used to run this event, as set out in the{" "}
              <a href={PRIVACY_PATH} target="_blank" rel="noopener" className="font-bold text-primary underline underline-offset-4">Privacy Notice</a>{" "}
              (<a href={PRIVACY_MS_PATH} lang="ms" hrefLang="ms" target="_blank" rel="noopener" className="font-bold text-primary underline underline-offset-4">Bahasa Malaysia</a>).
            </span>
            {/* D413: the same consent in Bahasa Malaysia, as the Act wants at the point it is given. */}
            <span lang="ms" className="text-muted-foreground">
              Saya bersetuju data peribadi saya digunakan untuk mengendalikan acara ini, seperti yang dinyatakan dalam Notis Privasi.
            </span>
          </FieldLabel>
          <FieldError id={`reg-${CONSENT_FIELD}-error`}>{errors[CONSENT_FIELD]}</FieldError>
        </FieldContent>
      </Field>

      <Field>
        {problems.length > 0 && (
          <Alert ref={summaryRef} tabIndex={-1} variant="destructive" className="outline-none">
            <CircleAlert />
            <AlertTitle>{problems.length === 1 ? "One thing to fix before you register" : `${problems.length} things to fix before you register`}</AlertTitle>
            <AlertDescription>
              <ul className="flex list-disc flex-col gap-1 pl-4">
                {problems.map((p) => (
                  <li key={p.key}><a href={`#reg-${p.key}`} onClick={jump(p.key)} className="underline underline-offset-4">{p.message}</a></li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={pending} className="h-12 w-full text-base font-bold">
          {pending && <Spinner data-icon="inline-start" />}
          {pending ? "Submitting…" : "Register"}
        </Button>
      </Field>
    </form>
  );
}
