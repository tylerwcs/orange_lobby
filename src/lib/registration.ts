import { z } from "zod";
import type { QuestionType, RegistrationQuestion } from "@/lib/types";
import { isQuestionShown } from "@/lib/show-when";

export { isQuestionShown };

/** What registration may ask. A file has no attendee row to attach to yet (D164). */
export const REGISTRATION_QUESTION_TYPES = ["text", "phone", "number", "select"] as const satisfies readonly QuestionType[];
/** What a form may ask. */
export const FORM_QUESTION_TYPES = ["text", "phone", "number", "select", "textarea", "file"] as const satisfies readonly QuestionType[];

const schemaFor = (allowed: readonly QuestionType[]) => z.object({
  key: z.string().regex(/^[a-z0-9_]+$/, "key must be lowercase letters, digits, underscores"),
  label: z.string().min(1, "label is required"),
  type: z.enum(allowed as unknown as [QuestionType, ...QuestionType[]]),
  required: z.boolean().default(false),
  options: z.array(z.string().min(1)).optional(),
  description: z.string().optional(),
  show_when: z.object({ key: z.string().min(1), includes: z.string().min(1) }).optional(),
}).refine((q) => q.type !== "select" || (q.options && q.options.length > 0), { message: "select questions need options" });

export function parseQuestions(
  input: string | unknown,
  allowed: readonly QuestionType[] = REGISTRATION_QUESTION_TYPES,
): RegistrationQuestion[] {
  let raw: unknown = input;
  if (typeof input === "string") {
    try { raw = JSON.parse(input); } catch { throw new Error("Registration questions must be valid JSON"); }
  }
  const res = z.array(schemaFor(allowed)).safeParse(raw);
  if (!res.success) {
    const i = res.error.issues[0];
    const field = i.path[i.path.length - 1] ?? i.path[0] ?? "?";
    throw new Error(`Question ${String(field)}: ${i.message}`);
  }
  return res.data;
}

/** The line under the Register heading when the organiser has not written their own (D229). */
export const DEFAULT_REGISTRATION_INTRO = "A few details, once. It takes about a minute.";

export type RegistrationData = { name: string; email: string; extra: Record<string, string> };
export type RegistrationResult = { ok: true; data: RegistrationData } | { ok: false; errors: Record<string, string> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AnswersResult =
  | { ok: true; answers: Record<string, string> }
  | { ok: false; errors: Record<string, string> };

/**
 * The question half of a submitted form: every answer trimmed, every rule checked.
 *
 * Lifted out of `validateRegistration` so a form submission and a registration are checked
 * by the same code rather than by two versions of it that agree until one is edited. What
 * stays in `validateRegistration` is only what is specific to registering: a name and an
 * email address.
 *
 * A question hidden by its `show_when` stores `""` rather than being skipped, which is what
 * clears an answer somebody gave before changing the answer above it.
 */
export function validateAnswers(
  input: Record<string, string>,
  questions: RegistrationQuestion[],
): AnswersResult {
  const errors: Record<string, string> = {};
  const answers: Record<string, string> = {};
  const get = (k: string) => (input[k] ?? "").trim();
  for (const q of questions) {
    const v = get(q.key);
    if (!isQuestionShown(q, input)) { answers[q.key] = ""; continue; }
    if (q.required && !v) errors[q.key] = `${q.label} is required`;
    else if (q.type === "select" && v && !q.options!.includes(v)) errors[q.key] = "Choose one of the listed options";
    answers[q.key] = v;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, answers };
}

export function validateRegistration(input: Record<string, string>, questions: RegistrationQuestion[]): RegistrationResult {
  const errors: Record<string, string> = {};
  const get = (k: string) => (input[k] ?? "").trim();
  const name = get("name");
  const email = get("email").toLowerCase();
  if (!name) errors.name = "Name is required";
  if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email";
  const answered = validateAnswers(input, questions);
  if (!answered.ok) Object.assign(errors, answered.errors);
  if (Object.keys(errors).length) return { ok: false, errors };
  // The ternary is not defensive: TypeScript cannot see that the early return above
  // ruled out the failure case, so this is how the union gets narrowed.
  return { ok: true, data: { name, email, extra: answered.ok ? answered.answers : {} } };
}

/**
 * Strips blank-valued answers from a re-registration's `extra` before it is merged into an
 * attendee who already exists. A blank answer there almost never means "clear this" — it means
 * the invitee skipped an optional question they'd already answered, or the masterlist import
 * set a value registration never asks about at all (e.g. phone) — so left in, it would overwrite
 * that value with "". Only call this for an existing attendee: a first-time registration's
 * blanks are genuinely blank and belong in `extra` as-is (including a show_when-hidden
 * question's deliberate "" to clear a stale answer).
 */
export function dropBlankAnswers(extra: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== ""));
}
