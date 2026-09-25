import { parseQuestions, REGISTRATION_QUESTION_TYPES } from "@/lib/registration";
import type { QuestionType, RegistrationQuestion } from "@/lib/types";
import { slugify } from "@/lib/slug";

export const MAX_QUESTIONS = 10;

export function questionsFromForm(
  get: (key: string) => string | null,
  allowed: readonly QuestionType[] = REGISTRATION_QUESTION_TYPES,
  max = MAX_QUESTIONS,
): RegistrationQuestion[] {
  const allowedSet = new Set<string>(allowed);
  const isQuestionType = (v: string): v is QuestionType => allowedSet.has(v);
  const t = (k: string) => (get(k) ?? "").trim();
  const raw: unknown[] = [];
  for (let n = 1; n <= max; n++) {
    const label = t(`q_${n}_label`), keyRaw = t(`q_${n}_key`) || label;
    if (!label && !keyRaw) continue;
    const key = keyFor(keyRaw);
    const typeRaw = t(`q_${n}_type`);
    const type: QuestionType = isQuestionType(typeRaw) ? typeRaw : "text";
    const options = t(`q_${n}_options`).split(",").map((s) => s.trim()).filter(Boolean);
    const showKey = t(`q_${n}_show_key`), showValue = t(`q_${n}_show_value`);
    raw.push({
      key, label, type, required: get(`q_${n}_required`) === "on",
      ...(type === "select" ? { options } : {}),
      ...(t(`q_${n}_description`) ? { description: t(`q_${n}_description`) } : {}),
      ...(showKey && showValue ? { show_when: { key: keyFor(showKey), includes: showValue } } : {}),
    });
  }
  return parseQuestions(raw, allowed);
}

/** How a key is derived: from a typed key, or from the label when there is none. One rule, shared with the question cards. */
export function keyFor(keyOrLabel: string): string {
  return slugify(keyOrLabel).replace(/-/g, "_");
}

/** A question as the card editor holds it: every field a string, choices as a list, the condition split in two. */
export type QuestionDraft = {
  /** The saved key, or "" for a question that has never been saved. */
  key: string;
  label: string;
  type: QuestionType;
  required: boolean;
  options: string[];
  description: string;
  showKey: string;
  showValue: string;
};

export function draftFrom(q: RegistrationQuestion): QuestionDraft {
  return {
    key: q.key, label: q.label, type: q.type, required: q.required, options: q.options ?? [],
    description: q.description ?? "", showKey: q.show_when?.key ?? "", showValue: q.show_when?.includes ?? "",
  };
}

/**
 * The fields the card editor posts, numbered 1…n in on-screen order: exactly the contract the
 * table posted, so `questionsFromForm` and both forms' actions stay as they are (D247). A
 * never-saved question posts an empty key and gets one from its label on the server, as a
 * blank key always has; a saved one posts its own, so a new label never orphans its answers (D244).
 */
export function questionFormEntries(drafts: QuestionDraft[]): [string, string][] {
  const out: [string, string][] = [];
  drafts.forEach((d, i) => {
    const n = i + 1;
    out.push([`q_${n}_label`, d.label], [`q_${n}_key`, d.key], [`q_${n}_type`, d.type]);
    if (d.required) out.push([`q_${n}_required`, "on"]);
    out.push([`q_${n}_options`, d.options.join(", ")], [`q_${n}_description`, d.description]);
    out.push([`q_${n}_show_key`, d.showKey], [`q_${n}_show_value`, d.showValue]);
  });
  return out;
}
