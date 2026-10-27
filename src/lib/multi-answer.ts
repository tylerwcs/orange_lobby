/**
 * D732: a tick-box question's answer is the ticked choices in one string, in the question's own
 * order, joined with ", ". One string keeps it an answer like any other: the export shows it as
 * written, the attendee table edits it as text, and `show_when` matches a choice inside it.
 *
 * A choice can never hold a comma - the admin editor posts choices comma-joined and splits them
 * again (`questionsFromForm`) - so splitting on commas gives the choices back exactly.
 *
 * Kept apart from registration.ts, which carries zod, so the registration form can import it.
 */
export function multiParts(answer: string): string[] {
  return answer.split(",").map((s) => s.trim()).filter(Boolean);
}

/** The answer with `choice` ticked or unticked, in the order `options` lists them. */
export function toggleMulti(answer: string, choice: string, on: boolean, options: string[]): string {
  const ticked = new Set(multiParts(answer));
  if (on) ticked.add(choice);
  else ticked.delete(choice);
  return options.filter((o) => ticked.has(o)).join(", ");
}
