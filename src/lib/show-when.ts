import type { RegistrationQuestion } from "@/lib/types";

/**
 * Whether a question is asked, given the answers so far: always, unless its `show_when`
 * names another question whose answer does not contain the value (ignoring case).
 *
 * D470: given the form's `questions`, a question whose parent is itself hidden is hidden too.
 * A branch's follow-ups close with the branch, though the browser still remembers the answer
 * the hidden parent was given (a phone user who picked "Treadmill" and then switched to a
 * watch is not asked for the treadmill photo). A `show_when` cycle hides its questions.
 *
 * Kept apart from registration.ts, which carries zod, so the two client forms can import it
 * without shipping a schema library to the attendee's phone.
 *
 * The one rule for this: `validateAnswers` on the server, and both forms that hide questions
 * as they are answered, read it here - so what is shown and what is required cannot disagree.
 */
export function isQuestionShown(
  q: RegistrationQuestion,
  answers: Record<string, string>,
  questions: RegistrationQuestion[] = [],
  seen: Set<string> = new Set(),
): boolean {
  if (!q.show_when) return true;
  if (seen.has(q.key)) return false;
  const matches = (answers[q.show_when.key] ?? "").trim().toLowerCase().includes(q.show_when.includes.toLowerCase());
  if (!matches) return false;
  const parent = questions.find((p) => p.key === q.show_when!.key);
  return !parent || isQuestionShown(parent, answers, questions, new Set(seen).add(q.key));
}
