"use client";
import { useState } from "react";
import { MAX_UPLOAD_BYTES, UPLOAD_ACCEPT, UPLOAD_TOO_BIG } from "@/lib/storage";
import { shrinkImage } from "@/lib/shrink-image";
import { isQuestionShown } from "@/lib/show-when";
import { numberInputAttrs } from "@/lib/number-answer";
import type { RegistrationQuestion } from "@/lib/types";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const inputClass = "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

/**
 * Swaps a picked photo for a shrunk copy (src/lib/shrink-image.ts) in the input itself, so the
 * form posts the small one. Until that is done the input is invalid, which stops a quick tap on
 * Submit sending the full-size original; a file that is still too big afterwards (a large PDF)
 * stays invalid with the server's own sentence, instead of reaching Vercel's 413 and the error
 * page. A browser without DataTransfer keeps the original, and the size check still applies.
 */
async function prepareFile(input: HTMLInputElement) {
  const picked = input.files?.[0];
  input.setCustomValidity("");
  if (!picked) return;
  input.setCustomValidity("Preparing your file… try again in a moment.");
  const file = await shrinkImage(picked);
  // Picked again while this one was shrinking: that newer change owns the input now.
  if (input.files?.[0] !== picked) return;
  if (file !== picked) {
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
    } catch {
      // Left as picked.
    }
  }
  const sent = input.files?.[0] ?? picked;
  input.setCustomValidity(sent.size > MAX_UPLOAD_BYTES ? UPLOAD_TOO_BIG : "");
  if (sent.size > MAX_UPLOAD_BYTES) input.reportValidity();
}

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
        onChange={(e) => void prepareFile(e.currentTarget)}
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
  // D370: a limited number question opens the decimal keypad and lets the browser say "at least 1" first.
  const limits = q.type === "number" ? numberInputAttrs(q) : null;
  return <input id={id} name={q.key} type={type} required={q.required} defaultValue={current} className={inputClass} {...limits} />;
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
          const current = defaults && Object.hasOwn(defaults, q.key) ? defaults[q.key] : "";
          const storedFile = q.type === "file" && current !== "";
          const link = fileLinks && Object.hasOwn(fileLinks, q.key) ? fileLinks[q.key] : undefined;
          return (
            <Field key={q.key}>
              <FieldLabel htmlFor={`q-${q.key}`}>
                {q.label}
                {!q.required && <span className="font-normal text-muted-foreground">(optional)</span>}
              </FieldLabel>
              {q.description && <FieldDescription>{q.description}</FieldDescription>}
              {q.type === "file" && q.sample_url && <SampleLink src={q.sample_url} label={q.label} />}
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

/**
 * A file question's sample picture (D395), opened in place so the person can look and come back
 * to the form without losing what they typed. A button rather than a plain link for that reason:
 * a new tab on a phone is easy to lose, and leaving the page loses an uncontrolled form.
 */
function SampleLink({ src, label }: { src: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-fit items-center gap-2 rounded-md text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="size-9 shrink-0 rounded-md border border-border bg-muted object-cover" />
        See a sample
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[min(92vw,900px)] p-2">
          <DialogTitle className="px-2 pt-1 text-sm">Sample: {label}</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`A sample of what to upload for ${label}`} className="max-h-[80vh] w-full rounded-[10px] object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}
