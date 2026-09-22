import { z } from "zod";
import type { QuestionType, RegistrationQuestion } from "@/lib/types";

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

export type RegistrationData = { name: string; email: string; extra: Record<string, string> };
export type RegistrationResult = { ok: true; data: RegistrationData } | { ok: false; errors: Record<string, string> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRegistration(input: Record<string, string>, questions: RegistrationQuestion[]): RegistrationResult {
  const errors: Record<string, string> = {};
  const get = (k: string) => (input[k] ?? "").trim();
  const name = get("name");
  const email = get("email").toLowerCase();
  if (!name) errors.name = "Name is required";
  if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email";
  const extra: Record<string, string> = {};
  for (const q of questions) {
    const v = get(q.key);
    const shown = !q.show_when || get(q.show_when.key).toLowerCase().includes(q.show_when.includes.toLowerCase());
    if (!shown) { extra[q.key] = ""; continue; }
    if (q.required && !v) errors[q.key] = `${q.label} is required`;
    else if (q.type === "select" && v && !q.options!.includes(v)) errors[q.key] = `Choose one of the listed options`;
    extra[q.key] = v;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, data: { name, email, extra } };
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
