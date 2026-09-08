import { parseQuestions } from "@/lib/registration";
import type { RegistrationQuestion } from "@/lib/types";
import { slugify } from "@/lib/slug";

export const MAX_QUESTIONS = 10;

/** Builds the registration questions from the settings form's numbered rows (q_<n>_*). */
export function questionsFromForm(get: (key: string) => string | null): RegistrationQuestion[] {
  const t = (k: string) => (get(k) ?? "").trim();
  const raw: unknown[] = [];
  for (let n = 1; n <= MAX_QUESTIONS; n++) {
    const label = t(`q_${n}_label`), keyRaw = t(`q_${n}_key`) || label;
    if (!label && !keyRaw) continue;
    const key = slugify(keyRaw).replace(/-/g, "_");
    const type = t(`q_${n}_type`) === "select" ? "select" : "text";
    const options = t(`q_${n}_options`).split(",").map((s) => s.trim()).filter(Boolean);
    const showKey = t(`q_${n}_show_key`), showValue = t(`q_${n}_show_value`);
    raw.push({
      key, label, type, required: get(`q_${n}_required`) === "on",
      ...(type === "select" ? { options } : {}),
      ...(t(`q_${n}_description`) ? { description: t(`q_${n}_description`) } : {}),
      ...(showKey && showValue ? { show_when: { key: slugify(showKey).replace(/-/g, "_"), includes: showValue } } : {}),
    });
  }
  return parseQuestions(raw);
}
