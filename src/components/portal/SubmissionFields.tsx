"use client";
import { useState } from "react";
import { UPLOAD_ACCEPT } from "@/lib/storage";
import { isQuestionShown } from "@/lib/show-when";
import type { RegistrationQuestion } from "@/lib/types";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";

const inputClass = "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

/**
 * One question, switched on `q.type`. `current` is the answer already given ("" on a fresh
 * form): the other types start from it, while a file input cannot be pre-filled, so a stored
 * file instead stops it being required - left empty, it keeps that file.
 */
function renderQuestion(q: RegistrationQuestion, current: string) {
  const id = `q-${q.key}`;
  if (q.type === "select") {
    return (
      <select id={id} name={q.key} required={q.required} defaultValue={current} className={inputClass}>
        <option value="">Select…</option>
        {q.options!.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (q.type === "textarea") {
    return <textarea id={id} name={q.key} required={q.required} rows={5} defaultValue={current} className={inputClass} />;
  }
  if (q.type === "file") {
    return (
      <input
        id={id}
        name={q.key}
        type="file"
        accept={UPLOAD_ACCEPT}
        required={q.required && !current}
        /* `flex items-center` is the fix for the button sitting high in the box. `inputClass`
           sets a 44px height with no vertical padding, and a file input lays its shadow button
           out on a baseline-aligned line box — unlike a text input, which browsers centre
           internally as a special case. Flex makes the centring explicit instead of hoping the
           line box lands in the middle. */
        className={`${inputClass} flex items-center file:mr-3 file:rounded-[8px] file:border-0 file:bg-foreground file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-white`}
      />
    );
  }
  const type = q.type === "phone" ? "tel" : q.type === "number" ? "number" : "text";
  return <input id={id} name={q.key} type={type} required={q.required} defaultValue={current} className={inputClass} />;
}

/**
 * A submission form's questions, hiding each one whose `show_when` is not met by the answers
 * given so far - the same rule `validateAnswers` applies when the form is sent.
 *
 * The only client part of the submission page: the page itself stays a server component, and
 * the fields stay uncontrolled. All this listens to is what has been typed or picked, read off
 * the change events that bubble up to the fieldset. A hidden question is not rendered at all,
 * so a required one cannot block the browser's own validation, and a file picked before its
 * question was hidden is never uploaded; the server stores "" for it either way.
 *
 * `defaults` pre-fills it with a submission's answers for an admin's edit (D337), and seeds the
 * `show_when` state too, so the questions those answers opened start open. `fileLinks` holds a
 * signed link to each stored file, minted by the server. The portal passes neither.
 */
export function SubmissionFields({ questions, defaults, fileLinks }: {
  questions: RegistrationQuestion[];
  /** Question key to answer, as stored. */
  defaults?: Record<string, string>;
  /** Question key to a signed link for its current file; null when it could not be signed. */
  fileLinks?: Record<string, string | null>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(defaults ?? {});
  const onChange = (e: React.FormEvent<HTMLFieldSetElement>) => {
    const t = e.target as HTMLInputElement;
    if (!t.name || t.type === "file") return;
    setAnswers((a) => ({ ...a, [t.name]: t.value }));
  };
  return (
    <FieldSet onChange={onChange}>
      <FieldGroup>
        {questions.filter((q) => isQuestionShown(q, answers)).map((q) => {
          const current = defaults?.[q.key] ?? "";
          const storedFile = q.type === "file" && current !== "";
          const link = fileLinks?.[q.key];
          return (
            <Field key={q.key}>
              <FieldLabel htmlFor={`q-${q.key}`}>
                {q.label}
                {!q.required && <span className="font-normal text-muted-foreground">(optional)</span>}
              </FieldLabel>
              {q.description && <FieldDescription>{q.description}</FieldDescription>}
              {storedFile && (
                <p className="text-sm">
                  Current file:{" "}
                  {link
                    ? <a href={link} target="_blank" rel="noreferrer" className="text-primary underline">View file</a>
                    : <span className="text-muted-foreground">Unavailable</span>}
                </p>
              )}
              {renderQuestion(q, current)}
              {storedFile && <FieldDescription>Choose a file only to replace it.</FieldDescription>}
            </Field>
          );
        })}
      </FieldGroup>
    </FieldSet>
  );
}
