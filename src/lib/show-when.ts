import type { RegistrationQuestion } from "@/lib/types";

/**
 * Whether a question is asked, given the answers so far: always, unless its `show_when`
 * names another question whose answer does not contain the value (ignoring case).
 *
 * Kept apart from registration.ts, which carries zod, so the two client forms can import it
 * without shipping a schema library to the attendee's phone.
 *
 * The one rule for this: `validateAnswers` on the server, and both forms that hide questions
 * as they are answered, read it here - so what is shown and what is required cannot disagree.
 */
export function isQuestionShown(q: RegistrationQuestion, answers: Record<string, string>): boolean {
  if (!q.show_when) return true;
  return (answers[q.show_when.key] ?? "").trim().toLowerCase().includes(q.show_when.includes.toLowerCase());
}
