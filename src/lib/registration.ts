import { z } from "zod";
import type { RegistrationQuestion } from "@/lib/types";

const questionSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]+$/, "key must be lowercase letters, digits, underscores"),
  label: z.string().min(1, "label is required"),
  type: z.enum(["text", "select"]),
  required: z.boolean().default(false),
  options: z.array(z.string().min(1)).optional(),
}).refine((q) => q.type !== "select" || (q.options && q.options.length > 0), { message: "select questions need options" });

export function parseQuestions(json: string): RegistrationQuestion[] {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { throw new Error("Registration questions must be valid JSON"); }
  const res = z.array(questionSchema).safeParse(raw);
  if (!res.success) {
    const i = res.error.issues[0];
    const field = i.path[i.path.length - 1] ?? i.path[0] ?? "?";
    throw new Error(`Question ${String(field)}: ${i.message}`);
  }
  return res.data;
}

export type RegistrationData = { name: string; email: string; phone: string | null; company: string | null; extra: Record<string, string> };
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
    if (q.required && !v) errors[q.key] = `${q.label} is required`;
    else if (q.type === "select" && v && !q.options!.includes(v)) errors[q.key] = `Choose one of the listed options`;
    extra[q.key] = v;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, data: { name, email, phone: get("phone") || null, company: get("company") || null, extra } };
}
