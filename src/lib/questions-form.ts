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
    const key = slugify(keyRaw).replace(/-/g, "_");
    const typeRaw = t(`q_${n}_type`);
    const type: QuestionType = isQuestionType(typeRaw) ? typeRaw : "text";
    const options = t(`q_${n}_options`).split(",").map((s) => s.trim()).filter(Boolean);
    const showKey = t(`q_${n}_show_key`), showValue = t(`q_${n}_show_value`);
    raw.push({
      key, label, type, required: get(`q_${n}_required`) === "on",
      ...(type === "select" ? { options } : {}),
      ...(t(`q_${n}_description`) ? { description: t(`q_${n}_description`) } : {}),
      ...(showKey && showValue ? { show_when: { key: slugify(showKey).replace(/-/g, "_"), includes: showValue } } : {}),
    });
  }
  return parseQuestions(raw, allowed);
}
