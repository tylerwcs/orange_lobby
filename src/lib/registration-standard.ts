import type { QuestionType, RegistrationQuestion } from "@/lib/types";

/**
 * The four questions every registration form asks: name, email, mobile and department.
 *
 * They sit in the question list like any other so the organiser can reorder them and write
 * their help text, but they cannot be removed, and what makes them work is fixed. Name and
 * email are the attendee row's own columns, not answers in `extra`: they are stored in
 * `registration_questions` only for their place and wording, and `hydrate` lifts them out so
 * everything that reads the questions as answers never sees them (`answerQuestions`).
 */
export type StandardRule = {
  /** The types the organiser may switch between. One means the type is fixed. */
  types: readonly QuestionType[];
  /** What a fixed-type card says its type is. */
  typeLabel: string;
  /** The Required box is ticked and cannot be unticked. */
  alwaysRequired: boolean;
};

type Standard = StandardRule & { question: RegistrationQuestion; identity: boolean };

const STANDARD: Standard[] = [
  { question: { key: "name", label: "Full name", type: "text", required: true },
    types: ["text"], typeLabel: "Name", alwaysRequired: true, identity: true },
  // The badge link is shown on the next screen, not emailed — the address is how a second
  // registration finds the record it already has.
  { question: { key: "email", label: "Email", type: "text", required: true, description: "We use this to recognise you if you register twice." },
    types: ["text"], typeLabel: "Email", alwaysRequired: true, identity: true },
  { question: { key: "phone", label: "Mobile number", type: "phone", required: true },
    types: ["phone"], typeLabel: "Phone", alwaysRequired: false, identity: false },
  { question: { key: "department", label: "Department", type: "text", required: true },
    types: ["text", "select"], typeLabel: "Text", alwaysRequired: false, identity: false },
];

const IDENTITY = new Set(STANDARD.filter((s) => s.identity).map((s) => s.question.key));

/** The editor's locks, keyed by question key. Plain data, so a server page can hand it to a client component. */
export const STANDARD_RULES: Record<string, StandardRule> = Object.fromEntries(
  STANDARD.map(({ question, types, typeLabel, alwaysRequired }) => [question.key, { types, typeLabel, alwaysRequired }]),
);

/** How many of the form's questions are the standard ones, which do not count towards the organiser's own. */
export const STANDARD_COUNT = STANDARD.length;

export function isStandardKey(key: string): boolean {
  return key in STANDARD_RULES;
}

/** The questions whose answers land in `extra`: everything but name and email. */
export function answerQuestions(stored: RegistrationQuestion[]): RegistrationQuestion[] {
  return stored.filter((q) => !IDENTITY.has(q.key));
}

/**
 * Inserts any of `which` that `qs` lacks, at the top in standard order, behind whichever
 * standard questions came before them. An event saved before this existed has no name or
 * email entry, and may have no mobile or department.
 */
function withMissing(qs: RegistrationQuestion[], which: Standard[]): RegistrationQuestion[] {
  const out = [...qs];
  for (const s of which) {
    if (out.some((q) => q.key === s.question.key)) continue;
    // After the last standard question that is ahead of this one in STANDARD's order, else first.
    const before = STANDARD.slice(0, STANDARD.indexOf(s)).map((p) => p.question.key);
    const at = out.reduce((pos, q, i) => (before.includes(q.key) ? i + 1 : pos), 0);
    out.splice(at, 0, { ...s.question });
  }
  return out;
}

/** The form as the invitee sees it, in order: name and email always there, the rest as saved. */
export function registrationForm(stored: RegistrationQuestion[]): RegistrationQuestion[] {
  return withMissing(stored, STANDARD.filter((s) => s.identity));
}

/** The list the admin edits: the form, plus mobile and department if this event has not saved them yet. */
export function editorQuestions(stored: RegistrationQuestion[]): RegistrationQuestion[] {
  return withMissing(stored, STANDARD);
}

/**
 * What a save may store. The editor already keeps the standard questions in place; this is
 * what a hand-made POST meets. A missing one goes back in, its locks are reapplied, and two
 * questions that would write the same key are refused, which is how a custom question
 * labelled "Department" is told it collides rather than overwriting the real one.
 */
export function normaliseRegistrationForm(qs: RegistrationQuestion[]): RegistrationQuestion[] {
  const seen = new Map<string, string>();
  for (const q of qs) {
    const first = seen.get(q.key);
    if (first !== undefined) throw new Error(`“${first}” and “${q.label}” would save to the same answer. Rename one of them.`);
    seen.set(q.key, q.label);
  }
  return withMissing(qs, STANDARD).map((q) => {
    const s = STANDARD.find((x) => x.question.key === q.key);
    if (!s) return q;
    // Always asked, so never conditional; and a type the rule does not allow falls back to its default.
    const type = s.types.includes(q.type) ? q.type : s.question.type;
    return {
      key: q.key, label: q.label, type,
      required: s.alwaysRequired || q.required,
      ...(type === "select" && q.options ? { options: q.options } : {}),
      ...(q.description ? { description: q.description } : {}),
    };
  });
}
