import { ANSWERS, MAX_PERSONALITIES, MAX_QUESTIONS, MIN_PERSONALITIES, MIN_QUESTIONS, TICKED, TRAITS, type PassportTest } from "./settings";

/**
 * D884: what stops a test being switched on (or saved while on), as sentences an organiser
 * reads. Empty means it is ready. Item rules (four answers each pointing at someone, unique
 * names, three ticked traits) are here too, so a saved test is never half-valid.
 */
export function testProblems(t: PassportTest): string[] {
  const out: string[] = [];
  if (t.questions.length < MIN_QUESTIONS || t.questions.length > MAX_QUESTIONS) {
    out.push(`A personality test needs ${MIN_QUESTIONS} to ${MAX_QUESTIONS} questions; this one has ${t.questions.length}.`);
  }
  if (t.personalities.length < MIN_PERSONALITIES || t.personalities.length > MAX_PERSONALITIES) {
    out.push(`A personality test needs ${MIN_PERSONALITIES} to ${MAX_PERSONALITIES} personalities; this one has ${t.personalities.length}.`);
  }
  const known = new Set(t.personalities.map((p) => p.id));
  t.questions.forEach((q, i) => {
    const n = i + 1;
    if (!q.text) out.push(`Question ${n} has no question.`);
    if (q.answers.length !== ANSWERS) out.push(`Question ${n} needs exactly ${ANSWERS} answers.`);
    if (q.answers.some((a) => !a.text)) out.push(`Question ${n} has an answer with no words.`);
    if (q.answers.some((a) => !known.has(a.personality))) out.push(`An answer in question ${n} points to a personality that isn't there.`);
  });
  const seen = new Set<string>();
  for (const p of t.personalities) {
    const label = p.name || "A personality";
    if (!p.name) out.push("Every personality needs a name.");
    const key = p.name.toLowerCase();
    if (p.name && seen.has(key)) out.push(`Two personalities are called ${p.name}.`);
    seen.add(key);
    if (p.traits.length !== TRAITS || p.traits.some((x) => !x)) out.push(`${label} needs ${TRAITS} traits.`);
    const ticked = new Set(p.ticked.filter((i) => i < TRAITS));
    if (ticked.size !== TICKED || p.ticked.length !== TICKED) out.push(`${label} needs exactly ${TICKED} ticked traits.`);
  }
  return out;
}

/**
 * D887: once guests have results, the parts their results were worked out from are fixed:
 * which personality each answer points to, the list of questions, and the personalities that
 * exist. Words, pictures, colours, traits and labels stay editable. Null is "this edit is fine".
 */
export function lockedChange(before: PassportTest, after: PassportTest, results: number): string | null {
  if (results <= 0) return null;
  const why = lockReason(before, after);
  if (!why) return null;
  return `${results} ${results === 1 ? "guest has" : "guests have"} taken this test. ${why}`;
}

function lockReason(before: PassportTest, after: PassportTest): string | null {
  const was = before.questions.map((q) => q.id);
  const now = after.questions.map((q) => q.id);
  if (now.some((id) => !was.includes(id))) return "Questions can't be added now.";
  if (was.some((id) => !now.includes(id))) return "Questions can't be removed now.";
  if (was.join() !== now.join()) return "Questions can't be moved now.";
  const kept = new Set(after.personalities.map((p) => p.id));
  if (before.personalities.some((p) => !kept.has(p.id))) return "Personalities can't be removed now.";
  for (const q of before.questions) {
    const next = after.questions.find((x) => x.id === q.id)!;
    const pointing = (x: typeof q) => x.answers.map((a) => `${a.id}:${a.personality}`).join();
    if (pointing(q) !== pointing(next)) return "Which personality an answer points to can't change now.";
  }
  return null;
}
