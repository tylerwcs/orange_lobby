# Form Submissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an organiser publish a form that an eligible attendee can submit to repeatedly — a daily wellness check-in, a photo entry — with the submissions readable in admin and exportable to Excel.

**Architecture:** Two new tables (`forms`, `form_submissions`) mirroring the *policy* shape of `activities` but none of its seat mechanics. The question schema, validation and editor are the ones `registration_questions` already uses, narrowed per context by an allowlist. Writes go through a single database function so the per-attendee cap cannot be raced, exactly as `book_session` does for bookings.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Supabase (Postgres + Storage), zod, vitest, ExcelJS, Tailwind + shadcn/Base UI.

**Spec:** `docs/superpowers/specs/2026-09-23-form-submissions-design.md` — read it first. Every decision reference below (D161–D173) is defined there.

## Global Constraints

- **Read `node_modules/next/dist/docs/` before writing any route, page or action.** `AGENTS.md` requires it; this Next.js has breaking changes from training data. `params` and `searchParams` are `Promise`s and must be awaited.
- **Never use `Bash` to run a dev server.** Use the preview tooling.
- Run `npm test`, `npm run lint` and `npx tsc --noEmit` before every commit. All three must be clean.
- Tests live in `tests/<name>.test.ts`, import via the `@/` alias, and use `describe`/`it`/`expect` from `vitest`.
- Migrations are `supabase/migrations/NNNN_name.sql`, applied with the Supabase MCP `apply_migration`. The next free number is **0025**.
- New tables get `alter table <t> enable row level security;` and **no policies** — only the service role touches data. Every table since `0001_init.sql` does this.
- Server-side DB access goes through `serviceClient()` from `@/lib/supabase/service`, in a file starting with `import "server-only";`.
- Category matching is trimmed and case-folded, and null/empty means everyone. Reuse `categoryMatches` from `@/lib/agenda`; never hand-roll it.
- Dates are Malaysian. Use `nowInKL()` from `@/lib/time`. Never `new Date()` for a calendar day.
- Comments explain *why*, not *what*, and name the decision (e.g. `(D165)`) when one applies. Match the density of the file you are editing.
- Commit messages: conventional prefix, a blank line, then prose explaining the reasoning. End with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File Structure

**Created**
- `supabase/migrations/0025_forms.sql` — both tables, indexes, RLS
- `supabase/migrations/0026_submit_form.sql` — the `submit_form` function
- `src/lib/forms.ts` — pure form logic: `canSubmit`, `capSummary`, `MAX_FORM_QUESTIONS`
- `src/lib/db/forms.ts` — all Supabase access for forms and submissions
- `src/components/admin/FormList.tsx`, `src/components/admin/QuestionEditor.tsx`
- `src/app/admin/events/[id]/forms/page.tsx`, `.../forms/[formId]/page.tsx`, `.../forms/actions.ts`
- `src/components/portal/FormList.tsx`, `src/components/portal/SubmissionHistory.tsx`
- `src/app/e/[slug]/a/[token]/forms/page.tsx`, `.../forms/[formId]/page.tsx`, `.../forms/actions.ts`
- `src/app/admin/events/[id]/export/forms.xlsx/route.ts`
- `scripts/submit-concurrency.mjs`
- Tests: `tests/questions-allowlist.test.ts`, `tests/answers.test.ts`, `tests/forms.test.ts`, `tests/forms-export.test.ts`

**Modified**
- `src/lib/registration.ts` — extract `validateAnswers`; `parseQuestions` takes an allowlist
- `src/lib/types.ts` — `Form`, `FormSubmission`, widened `RegistrationQuestion["type"]`
- `src/lib/questions-form.ts` — editor reads the allowlist
- `src/lib/storage.ts` — `submissionObjectPath`, `acceptUpload`
- `src/lib/db/media.ts` — `uploadSubmissionFile`, `signedSubmissionUrl`, `deleteSubmissionFiles`
- `src/lib/db/attendees.ts` + `0028_purge_submissions.sql` — purge takes submissions too
- `src/lib/exports.ts` — `buildFormsWorkbook`
- `src/components/admin/nav.ts` — Forms under *Portal*
- `src/lib/modules.ts` — `TILE_ROUTES` + `TILE_ROUTE_LABELS` gain `forms`
- `src/app/admin/events/[id]/exports/page.tsx` — the new download

---

### Task 1: Question types become per-context

**Files:**
- Modify: `src/lib/types.ts`, `src/lib/registration.ts`, `src/lib/questions-form.ts`
- Test: `tests/questions-allowlist.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `REGISTRATION_QUESTION_TYPES`, `FORM_QUESTION_TYPES` (both `readonly QuestionType[]`); `parseQuestions(input: string | unknown, allowed: readonly QuestionType[]): RegistrationQuestion[]`; type `QuestionType = "text" | "phone" | "number" | "select" | "textarea" | "file"`.

- [ ] **Step 1: Write the failing test**

Create `tests/questions-allowlist.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parseQuestions, REGISTRATION_QUESTION_TYPES, FORM_QUESTION_TYPES } from "@/lib/registration";

const q = (over: Record<string, unknown> = {}) => ({ key: "k", label: "L", type: "text", required: false, ...over });

describe("parseQuestions allowlist", () => {
  it("accepts the four types registration has always had", () => {
    for (const type of ["text", "phone", "number", "select"]) {
      const input = [q({ type, ...(type === "select" ? { options: ["a"] } : {}) })];
      expect(parseQuestions(input, REGISTRATION_QUESTION_TYPES)).toHaveLength(1);
    }
  });

  // D164: there is no attendee row yet at registration to hang a file on, and the
  // registration page is public. The narrowing is the point of the allowlist.
  it("refuses a file question on the registration form", () => {
    expect(() => parseQuestions([q({ type: "file" })], REGISTRATION_QUESTION_TYPES)).toThrow();
  });

  it("refuses a textarea on the registration form", () => {
    expect(() => parseQuestions([q({ type: "textarea" })], REGISTRATION_QUESTION_TYPES)).toThrow();
  });

  it("accepts file and textarea on a form", () => {
    expect(parseQuestions([q({ type: "file" }), q({ key: "k2", type: "textarea" })], FORM_QUESTION_TYPES)).toHaveLength(2);
  });

  it("still requires options on a select, whichever list is in force", () => {
    expect(() => parseQuestions([q({ type: "select" })], FORM_QUESTION_TYPES)).toThrow(/options/);
  });

  it("names the offending field in the message", () => {
    expect(() => parseQuestions([q({ key: "Bad Key!" })], FORM_QUESTION_TYPES)).toThrow(/key/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/questions-allowlist.test.ts`
Expected: FAIL — `REGISTRATION_QUESTION_TYPES` is not exported, so the import is undefined.

- [ ] **Step 3: Widen the type**

In `src/lib/types.ts`, replace the `type` line of `RegistrationQuestion`:

```typescript
export type QuestionType = "text" | "phone" | "number" | "select" | "textarea" | "file";

export type RegistrationQuestion = {
  key: string;
  label: string;
  /**
   * Which of these a given context actually allows is decided by the allowlist
   * `parseQuestions` is called with, not by this union (D164). Registration keeps the
   * original four; forms add textarea and file.
   */
  type: QuestionType;
  required: boolean;
  options?: string[];
  description?: string;
  /** Show (and require) this question only when another answer contains a phrase. */
  show_when?: { key: string; includes: string };
};
```

- [ ] **Step 4: Make `parseQuestions` take the allowlist**

In `src/lib/registration.ts`, replace the schema and `parseQuestions`:

```typescript
import type { QuestionType } from "@/lib/types";

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
```

The default keeps every existing caller working unchanged; forms pass `FORM_QUESTION_TYPES` explicitly.

- [ ] **Step 5: Let the editor take the allowlist too**

In `src/lib/questions-form.ts`, change the guard and the signature:

```typescript
import { parseQuestions, REGISTRATION_QUESTION_TYPES } from "@/lib/registration";
import type { QuestionType, RegistrationQuestion } from "@/lib/types";

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
```

- [ ] **Step 6: Run the whole suite**

Run: `npx vitest run && npm run lint && npx tsc --noEmit`
Expected: all green, including the pre-existing `tests/questions-form.test.ts` and `tests/registration.test.ts`, which must not have needed edits.

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/registration.ts src/lib/questions-form.ts tests/questions-allowlist.test.ts
git commit -m "refactor(questions): make the allowed types a per-context argument

Forms need textarea and file; registration must not offer either. One
schema, narrowed where it is used, rather than a second engine that
drifts from this one (D164).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Extract `validateAnswers` from `validateRegistration`

**Files:**
- Modify: `src/lib/registration.ts`
- Test: `tests/answers.test.ts`

**Interfaces:**
- Consumes: Task 1's `QuestionType`.
- Produces: `type AnswersResult = { ok: true; answers: Record<string, string> } | { ok: false; errors: Record<string, string> }`; `validateAnswers(input: Record<string, string>, questions: RegistrationQuestion[]): AnswersResult`.

- [ ] **Step 1: Write the failing test**

Create `tests/answers.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { validateAnswers } from "@/lib/registration";
import type { RegistrationQuestion } from "@/lib/types";

const q = (over: Partial<RegistrationQuestion> = {}): RegistrationQuestion =>
  ({ key: "mood", label: "Mood", type: "text", required: false, ...over });

describe("validateAnswers", () => {
  it("returns the trimmed answers when everything is fine", () => {
    const r = validateAnswers({ mood: "  good  " }, [q()]);
    expect(r).toEqual({ ok: true, answers: { mood: "good" } });
  });

  it("names the question that was required and blank", () => {
    const r = validateAnswers({ mood: "" }, [q({ required: true })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.mood).toBe("Mood is required");
  });

  it("rejects a select answer that is not one of its options", () => {
    const r = validateAnswers({ mood: "Elated" }, [q({ type: "select", options: ["Good", "Bad"] })]);
    expect(r.ok).toBe(false);
  });

  it("accepts a select answer that is one of its options", () => {
    expect(validateAnswers({ mood: "Good" }, [q({ type: "select", options: ["Good", "Bad"] })]).ok).toBe(true);
  });

  // A hidden question is not merely skipped: it stores "" so a stale answer is cleared.
  it("blanks a question its show_when is hiding, and does not require it", () => {
    const questions = [
      q({ key: "unwell", type: "select", options: ["Yes", "No"] }),
      q({ key: "symptoms", required: true, show_when: { key: "unwell", includes: "Yes" } }),
    ];
    const r = validateAnswers({ unwell: "No", symptoms: "" }, questions);
    expect(r).toEqual({ ok: true, answers: { unwell: "No", symptoms: "" } });
  });

  it("requires a shown question even when it is conditional", () => {
    const questions = [
      q({ key: "unwell", type: "select", options: ["Yes", "No"] }),
      q({ key: "symptoms", required: true, show_when: { key: "unwell", includes: "Yes" } }),
    ];
    expect(validateAnswers({ unwell: "Yes", symptoms: "" }, questions).ok).toBe(false);
  });

  it("carries a textarea answer through unchanged apart from trimming", () => {
    const r = validateAnswers({ mood: " line one\nline two " }, [q({ type: "textarea" })]);
    expect(r.ok && r.answers.mood).toBe("line one\nline two");
  });

  it("treats a file answer as the stored object path it is given", () => {
    const r = validateAnswers({ mood: "org/event/submission-abc.png" }, [q({ type: "file" })]);
    expect(r.ok && r.answers.mood).toBe("org/event/submission-abc.png");
  });

  it("reports every bad question at once rather than stopping at the first", () => {
    const r = validateAnswers({ a: "", b: "" }, [
      q({ key: "a", label: "A", required: true }),
      q({ key: "b", label: "B", required: true }),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/answers.test.ts`
Expected: FAIL — `validateAnswers is not a function`.

- [ ] **Step 3: Extract it, and have `validateRegistration` call it**

In `src/lib/registration.ts`, replace `validateRegistration` with:

```typescript
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
    const shown = !q.show_when || get(q.show_when.key).toLowerCase().includes(q.show_when.includes.toLowerCase());
    if (!shown) { answers[q.key] = ""; continue; }
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
```

- [ ] **Step 4: Run the suite**

Run: `npx vitest run && npm run lint && npx tsc --noEmit`
Expected: all green. `tests/registration.test.ts` must pass **unchanged** — that is the proof the extraction preserved behaviour.

- [ ] **Step 5: Commit**

```bash
git add src/lib/registration.ts tests/answers.test.ts
git commit -m "refactor(registration): split the answer rules out of validateRegistration

A form submission and a registration ask the same questions and must
judge the answers the same way. One tested function now does it for
both; validateRegistration keeps only what is specific to registering,
which is the name and the email.

tests/registration.test.ts passes unchanged, which is the point.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The tables

**Files:**
- Create: `supabase/migrations/0025_forms.sql`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Consumes: Task 1's `RegistrationQuestion`.
- Produces: tables `forms`, `form_submissions`; types `Form`, `FormSubmission`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0025_forms.sql` with exactly the SQL in **§3 of the spec**, including its comments. Copy the decision references (D164, D165, D167, D170, D171) across — they are why the columns are shaped this way.

- [ ] **Step 2: Apply it**

Apply with the Supabase MCP `apply_migration`, name `forms`, against project `wfmqwwcolfigjylkgrsv`.

- [ ] **Step 3: Verify the index is partial**

Run this through `execute_sql`:

```sql
select indexname, indexdef from pg_indexes
where tablename = 'form_submissions' order by indexname;
```

Expected: `form_submissions_one_a_day` exists and its definition **ends in `WHERE per_day`**. A non-partial unique index here would silently forbid a second submission on unlimited forms.

- [ ] **Step 4: Add the types**

Append to `src/lib/types.ts`:

```typescript
/**
 * A set of questions an eligible attendee may answer, possibly more than once (D161).
 *
 * The policy fields mirror `activities` — categories, an open flag, a per-attendee cap —
 * because that is the half of activities forms actually branch from. There is no session
 * and no capacity: a submission is not a seat.
 */
export type Form = {
  id: string;
  org_id: string;
  event_id: string;
  name: string;
  description: string | null;
  questions: RegistrationQuestion[];
  submissions_open: boolean;
  /** Null or empty means everyone, exactly as on an agenda item or an activity. */
  categories: string[] | null;
  /** The total one attendee may ever submit. Null means no total limit (D171). */
  max_per_attendee: number | null;
  /** At most one submission per Malaysian calendar day, on top of any total (D171). */
  per_day: boolean;
  sort_order: number;
};

export type FormSubmission = {
  id: string;
  event_id: string;
  form_id: string;
  attendee_id: string;
  /** Question key to answer. A `file` answer holds an object path, never a URL (D167). */
  answers: Record<string, string>;
  /** The Malaysian calendar day this counts against (D165). */
  submitted_on: string;
  /** Room for a review queue that is not built yet; nothing branches on it (D170). */
  status: string;
  /** Denormalised from the form so the partial unique index needs no join (D165). */
  per_day: boolean;
  created_at: string;
};
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0025_forms.sql src/lib/types.ts
git commit -m "feat(forms): add the forms and form_submissions tables

The policy shape of activities without its seat mechanics (D161). The
partial unique index is what makes a once-a-day form once a day, which
is why per_day is denormalised onto the submission: an index cannot join.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `canSubmit` — the decision the portal and the database must agree on

**Files:**
- Create: `src/lib/forms.ts`, `tests/forms.test.ts`

**Interfaces:**
- Consumes: `Form`, `FormSubmission` (Task 3).
- Produces: `type SubmitState = { can: boolean; reason: "ok" | "closed" | "ineligible" | "limit" | "today"; used: number }`; `canSubmit(form: Form, mine: FormSubmission[], category: string | null, today: string): SubmitState`.

- [ ] **Step 1: Write the failing test**

Create `tests/forms.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { canSubmit } from "@/lib/forms";
import type { Form, FormSubmission } from "@/lib/types";

const form = (over: Partial<Form> = {}): Form => ({
  id: "f1", org_id: "o", event_id: "e", name: "Daily check-in", description: null,
  questions: [], submissions_open: true, categories: null,
  max_per_attendee: null, per_day: false, sort_order: 0, ...over,
});
const sub = (day: string): FormSubmission => ({
  id: `s-${day}`, event_id: "e", form_id: "f1", attendee_id: "a1", answers: {},
  submitted_on: day, status: "submitted", per_day: true, created_at: `${day}T01:00:00Z`,
});
const TODAY = "2026-09-28";

describe("canSubmit", () => {
  it("lets an eligible attendee submit to an open form", () => {
    expect(canSubmit(form(), [], null, TODAY)).toEqual({ can: true, reason: "ok", used: 0 });
  });

  it("refuses a closed form", () => {
    expect(canSubmit(form({ submissions_open: false }), [], null, TODAY).reason).toBe("closed");
  });

  it("refuses an attendee outside the form's categories", () => {
    expect(canSubmit(form({ categories: ["VIP"] }), [], "Delegate", TODAY).reason).toBe("ineligible");
  });

  it("lets a matching category in, ignoring case and spaces", () => {
    expect(canSubmit(form({ categories: ["VIP"] }), [], " vip ", TODAY).can).toBe(true);
  });

  it("treats no categories as everyone", () => {
    expect(canSubmit(form({ categories: [] }), [], null, TODAY).can).toBe(true);
  });

  it("refuses once the total cap is reached", () => {
    const r = canSubmit(form({ max_per_attendee: 2 }), [sub("2026-09-26"), sub("2026-09-27")], null, TODAY);
    expect(r).toEqual({ can: false, reason: "limit", used: 2 });
  });

  it("allows the last one under the cap", () => {
    expect(canSubmit(form({ max_per_attendee: 2 }), [sub("2026-09-26")], null, TODAY).can).toBe(true);
  });

  // D171: per_day is a second dial, not a scoping of the cap.
  it("refuses a second submission on the same day to a per_day form", () => {
    const r = canSubmit(form({ per_day: true }), [sub(TODAY)], null, TODAY);
    expect(r).toEqual({ can: false, reason: "today", used: 1 });
  });

  it("allows tomorrow's submission to a per_day form", () => {
    expect(canSubmit(form({ per_day: true }), [sub("2026-09-27")], null, TODAY).can).toBe(true);
  });

  it("applies the total cap to a per_day form as well", () => {
    const r = canSubmit(form({ per_day: true, max_per_attendee: 2 }), [sub("2026-09-26"), sub("2026-09-27")], null, TODAY);
    expect(r.reason).toBe("limit");
  });

  // Closed beats everything: an organiser who shut the form is not asking about caps.
  it("reports closed before any other reason", () => {
    const r = canSubmit(form({ submissions_open: false, categories: ["VIP"] }), [sub(TODAY)], "Delegate", TODAY);
    expect(r.reason).toBe("closed");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/forms.test.ts`
Expected: FAIL — cannot find module `@/lib/forms`.

- [ ] **Step 3: Implement**

Create `src/lib/forms.ts`:

```typescript
import { categoryMatches } from "@/lib/agenda";
import type { Form, FormSubmission } from "@/lib/types";

export type SubmitReason = "ok" | "closed" | "ineligible" | "limit" | "today";
export type SubmitState = { can: boolean; reason: SubmitReason; used: number };

/**
 * Whether this attendee may submit to this form right now, and if not, why.
 *
 * Every reason here has a counterpart returned by the `submit_form` function, deliberately:
 * this decides what the page draws, and the database decides what is allowed (D167). These
 * numbers were true when the page rendered and are stale by definition — the same contract
 * `seatsFor` carries for activities.
 *
 * Order matters. A closed form is reported as closed even when the attendee is also
 * ineligible and also at their cap, because "the desk shut this" is the useful sentence.
 */
export function canSubmit(
  form: Form,
  mine: FormSubmission[],
  category: string | null,
  today: string,
): SubmitState {
  const used = mine.length;
  if (!form.submissions_open) return { can: false, reason: "closed", used };
  if (!categoryMatches(form.categories, category)) return { can: false, reason: "ineligible", used };
  if (form.max_per_attendee !== null && used >= form.max_per_attendee) return { can: false, reason: "limit", used };
  if (form.per_day && mine.some((s) => s.submitted_on === today)) return { can: false, reason: "today", used };
  return { can: true, reason: "ok", used };
}
```

- [ ] **Step 4: Run and commit**

Run: `npx vitest run && npm run lint && npx tsc --noEmit`
Expected: all green.

```bash
git add src/lib/forms.ts tests/forms.test.ts
git commit -m "feat(forms): decide whether an attendee may submit, in one tested place

Every reason it returns has a counterpart in the submit_form function,
so the button and the database cannot disagree about why something is
refused. Closed is reported ahead of the other reasons because that is
the sentence worth showing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `submit_form`, and proof it cannot be raced

**Files:**
- Create: `supabase/migrations/0026_submit_form.sql`, `scripts/submit-concurrency.mjs`
- Modify: `package.json` (add `check:submit`)

**Interfaces:**
- Consumes: Task 3's tables.
- Produces: `submit_form(p_form_id uuid, p_attendee_id uuid, p_answers jsonb, p_today date) returns text` — one of `ok | missing | closed | ineligible | limit | duplicate`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0026_submit_form.sql`:

```sql
-- The only thing allowed to create a submission.
--
-- `count(*)` then `insert` is two statements and supabase-js has no transaction, so two
-- phones one short of the cap both read "one short" and both get in. This locks the FORM row,
-- re-counts under that lock and inserts or refuses — the same shape, and the same reasoning,
-- as book_session (D125, D167).
--
-- The form is the right row to lock: the cap is counted across the whole form, so two
-- submissions by one attendee have to serialise against each other, and they only both touch
-- this one row.
--
-- Returns a reason code rather than a boolean (D140): the portal says different things for a
-- form the desk closed and one this person has already filled in today.
--
-- p_today is passed in rather than read from current_date, so which Malaysian day it is gets
-- decided in one place (nowInKL) instead of depending on the database server's timezone (D165).
create or replace function submit_form(
  p_form_id uuid,
  p_attendee_id uuid,
  p_answers jsonb,
  p_today date
) returns text
language plpgsql
as $$
declare
  f forms%rowtype;
  att attendees%rowtype;
  used int;
begin
  select * into f from forms where id = p_form_id for update;
  if not found then return 'missing'; end if;

  select * into att from attendees where id = p_attendee_id;
  -- An attendee from another event is not a submission, it is a posted id from elsewhere.
  if not found or att.event_id <> f.event_id then return 'missing'; end if;

  if not f.submissions_open then return 'closed'; end if;

  -- The same rule as categoryMatches in src/lib/agenda.ts: empty means everyone, and the
  -- comparison is trimmed and case-folded because these values are typed by hand.
  if f.categories is not null and array_length(f.categories, 1) > 0 then
    if att.category is null or not exists (
      select 1 from unnest(f.categories) c
      where lower(btrim(c)) = lower(btrim(att.category))
    ) then
      return 'ineligible';
    end if;
  end if;

  if f.max_per_attendee is not null then
    select count(*) into used from form_submissions
     where form_id = f.id and attendee_id = p_attendee_id;
    if used >= f.max_per_attendee then return 'limit'; end if;
  end if;

  if f.per_day and exists (
    select 1 from form_submissions
     where form_id = f.id and attendee_id = p_attendee_id and submitted_on = p_today
  ) then
    return 'duplicate';
  end if;

  insert into form_submissions (event_id, form_id, attendee_id, answers, submitted_on, per_day)
  values (f.event_id, f.id, p_attendee_id, coalesce(p_answers, '{}'::jsonb), p_today, f.per_day);

  return 'ok';
exception
  -- The partial unique index is the real authority on one-a-day. The check above is the
  -- fast, friendly path; this is what catches the race the check cannot.
  when unique_violation then return 'duplicate';
end;
$$;
```

- [ ] **Step 2: Apply it**

Apply with `apply_migration`, name `submit_form`.

- [ ] **Step 3: Write the concurrency check**

Create `scripts/submit-concurrency.mjs`, modelled on `scripts/booking-concurrency.mjs` — read that file first and follow its structure, logging and cleanup. It must:

1. Create a throwaway archived event, one form with `max_per_attendee: 1`, and one attendee.
2. Fire **20 simultaneous** `submit_form` RPCs via `Promise.all`.
3. Assert exactly **one** returns `ok` and the rest return `limit`, and that exactly one row exists.
4. Repeat with a `per_day: true`, `max_per_attendee: null` form: 20 simultaneous calls for the same day, exactly one `ok`, the rest `duplicate`.
5. Delete the throwaway event, then print `PASS` or `FAIL` and exit non-zero on failure.

- [ ] **Step 4: Register the script**

In `package.json`, beside `check:booking`:

```json
"check:submit": "node --env-file=.env.local scripts/submit-concurrency.mjs"
```

- [ ] **Step 5: Run it**

Run: `npm run check:submit`
Expected: `PASS`. If more than one `ok` comes back, the lock is on the wrong row — do not weaken the test.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0026_submit_form.sql scripts/submit-concurrency.mjs package.json
git commit -m "feat(forms): make submit_form the only way a submission is written

Two phones one short of the cap both read one short and both get in,
unless the count happens under a lock. Same race, same shape and same
reasoning as book_session (D125).

The unique_violation handler is not belt and braces: the partial index
is the real authority on one-a-day, and the explicit check above it is
only the fast path that gives a friendlier answer.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The database layer

**Files:**
- Create: `src/lib/db/forms.ts`

**Interfaces:**
- Consumes: Tasks 3 and 5.
- Produces: `listForms(eventId)`, `getForm(id, eventId)`, `createForm(eventId, orgId, input)`, `updateForm(id, eventId, patch)`, `deleteForm(id, eventId)`, `listSubmissions(eventId)`, `submissionsForForm(formId)`, `submissionsForAttendee(attendeeId)`, `submitForm(formId, attendeeId, answers, today): Promise<SubmitCode>`, `type NewForm`, `type SubmitCode = "ok" | "missing" | "closed" | "ineligible" | "limit" | "duplicate"`.

- [ ] **Step 1: Write the module**

Create `src/lib/db/forms.ts`, following `src/lib/db/activities.ts` exactly for style, ordering and error handling:

```typescript
import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { Form, FormSubmission } from "@/lib/types";

export type NewForm = Omit<Form, "id" | "org_id" | "event_id">;
export type SubmitCode = "ok" | "missing" | "closed" | "ineligible" | "limit" | "duplicate";

export async function listForms(eventId: string): Promise<Form[]> {
  const { data, error } = await serviceClient().from("forms").select("*")
    .eq("event_id", eventId).order("sort_order").order("name");
  if (error) throw error;
  return (data ?? []) as Form[];
}

export async function getForm(id: string, eventId: string): Promise<Form | null> {
  const { data } = await serviceClient().from("forms").select("*")
    .eq("id", id).eq("event_id", eventId).maybeSingle();
  return (data as Form) ?? null;
}

export async function createForm(eventId: string, orgId: string, input: NewForm): Promise<void> {
  const { data: last } = await serviceClient().from("forms").select("sort_order")
    .eq("event_id", eventId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await serviceClient().from("forms")
    .insert({ event_id: eventId, org_id: orgId, ...input, sort_order: (last?.sort_order ?? -1) + 1 });
  if (error) throw error;
}

/**
 * Sends every column including nulls, so clearing a description or a cap actually clears it
 * — the same contract `updateSession` carries, and the same trap: a caller that omits a
 * field is asking for it to be nulled, not left alone.
 *
 * Turning `per_day` on rewrites the form's existing submissions, because the flag is
 * denormalised onto them (D165). That write can violate the partial unique index if somebody
 * already submitted twice in a day, which is why the caller must handle the throw rather
 * than assume it cannot happen.
 */
export async function updateForm(id: string, eventId: string, patch: NewForm): Promise<void> {
  const db = serviceClient();
  const { error } = await db.from("forms").update(patch).eq("id", id).eq("event_id", eventId);
  if (error) throw error;
  const { error: syncError } = await db.from("form_submissions")
    .update({ per_day: patch.per_day }).eq("form_id", id);
  if (syncError) throw syncError;
}

export async function deleteForm(id: string, eventId: string): Promise<void> {
  const { error } = await serviceClient().from("forms").delete().eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

export async function listSubmissions(eventId: string): Promise<FormSubmission[]> {
  const { data, error } = await serviceClient().from("form_submissions").select("*")
    .eq("event_id", eventId).order("submitted_on", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FormSubmission[];
}

export async function submissionsForForm(formId: string): Promise<FormSubmission[]> {
  const { data, error } = await serviceClient().from("form_submissions").select("*")
    .eq("form_id", formId).order("submitted_on", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FormSubmission[];
}

export async function submissionsForAttendee(attendeeId: string): Promise<FormSubmission[]> {
  const { data, error } = await serviceClient().from("form_submissions").select("*")
    .eq("attendee_id", attendeeId).order("submitted_on", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FormSubmission[];
}

/** The only write path. Everything it can refuse is a reason code, never an exception (D167). */
export async function submitForm(
  formId: string, attendeeId: string, answers: Record<string, string>, today: string,
): Promise<SubmitCode> {
  const { data, error } = await serviceClient().rpc("submit_form", {
    p_form_id: formId, p_attendee_id: attendeeId, p_answers: answers, p_today: today,
  });
  if (error) throw error;
  return (data as SubmitCode) ?? "missing";
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit && npm run lint`

```bash
git add src/lib/db/forms.ts
git commit -m "feat(forms): add the database layer

updateForm rewrites its submissions' per_day because the flag is
denormalised onto them for the partial index (D165) — and can therefore
fail on a form that already has two submissions in one day, which the
caller has to handle rather than wish away.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Admin — list, create, edit questions

**Files:**
- Create: `src/app/admin/events/[id]/forms/page.tsx`, `src/app/admin/events/[id]/forms/actions.ts`, `src/components/admin/QuestionEditor.tsx`
- Modify: `src/components/admin/nav.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 4, 6.
- Produces: `addFormAction`, `saveFormAction`, `deleteFormAction`, `toggleFormOpenAction`, all bound as `(eventId, ...)`.

- [ ] **Step 1: Read the pattern first**

Read `src/app/admin/events/[id]/activities/page.tsx` and `.../activities/actions.ts` end to end. This task mirrors them: a list page with a create modal, per-row edit, an open/close toggle, and a `ConfirmButton` delete naming what goes with it.

Read the registration question editor rows in `src/app/admin/events/[id]/settings/page.tsx` (search `q_${n}_`) — `QuestionEditor` is that markup lifted into a component that takes its type list as a prop.

- [ ] **Step 2: Build `QuestionEditor`**

Create `src/components/admin/QuestionEditor.tsx`, a server component rendering `max` numbered rows (`q_1_*` … `q_N_*`) with label, key, type `<select>`, required checkbox, options, description and the two `show_when` inputs. Props:

```typescript
export function QuestionEditor({ questions, types, max }: {
  questions: RegistrationQuestion[];
  types: readonly QuestionType[];
  max: number;
}) { /* ... */ }
```

The `<select>` must be built from `types`, so a form offers `file` and registration cannot.

- [ ] **Step 3: Write the actions**

Create `src/app/admin/events/[id]/forms/actions.ts`. Every action starts `const { orgId } = await requireAdmin(); const ev = await requireEvent(eventId, orgId);` and ends with `revalidatePath` then `redirect(flashPath(...))`, matching the activities actions.

`saveFormAction` must catch the `per_day` collision explicitly:

```typescript
try {
  await updateForm(formId, ev.id, patch);
} catch {
  // updateForm rewrites its submissions' per_day; the partial unique index refuses if
  // somebody already submitted twice on one day. Say so rather than showing a 500 (D165).
  redirect(flashPath(back, "Someone has already submitted twice in one day, so this form cannot become once-a-day. Delete the extra submission first.", "error"));
}
```

Questions are read with `questionsFromForm((k) => { const v = formData.get(k); return typeof v === "string" ? v : null; }, FORM_QUESTION_TYPES, MAX_FORM_QUESTIONS)`. Define `export const MAX_FORM_QUESTIONS = 20;` in `src/lib/forms.ts`.

- [ ] **Step 4: Add `capSummary`, test first**

`capSummary` is pure logic and gets the same treatment as `canSubmit`. Add to
`tests/forms.test.ts`, run it, watch it fail, then implement in `src/lib/forms.ts`:

```typescript
describe("capSummary", () => {
  it("says unlimited when there is no cap and no daily rule", () => {
    expect(capSummary(form())).toBe("Unlimited");
  });
  it("says once a day for a per_day form with no total", () => {
    expect(capSummary(form({ per_day: true }))).toBe("Once a day");
  });
  it("names both dials when a per_day form also has a total", () => {
    expect(capSummary(form({ per_day: true, max_per_attendee: 5 }))).toBe("Once a day, up to 5");
  });
  it("says once for a form capped at one", () => {
    expect(capSummary(form({ max_per_attendee: 1 }))).toBe("Once");
  });
  it("names the total for a capped form", () => {
    expect(capSummary(form({ max_per_attendee: 5 }))).toBe("Up to 5");
  });
});
```

- [ ] **Step 5: Build the page**

Create the list page: `AdminHeader` with a count subtitle, a "New form" `Modal`, and one `Card` per form showing its name, whether it is open, its cap in words (use a helper `capSummary(form)` in `src/lib/forms.ts` returning e.g. `"Once a day"`, `"Up to 5"`, `"Unlimited"`), an open/close `SubmitButton`, an edit `Modal`, and a `ConfirmButton` delete naming the submission count.

- [ ] **Step 6: Add the nav entry**

In `src/components/admin/nav.ts`, in the *Portal* group after Activities:

```typescript
{ href: `${b}/forms`, label: "Forms", icon: "file" },
```

`tests/nav.test.ts` asserts the Scanner is the only conditional item — check it still passes.

- [ ] **Step 7: Verify in the browser**

Start the preview, create a form with one `select` and one `textarea` question, toggle it open, reload, confirm it persisted. Screenshot it.

- [ ] **Step 8: Commit**

```bash
git add src/app/admin/events/\[id\]/forms src/components/admin/QuestionEditor.tsx src/components/admin/nav.ts src/lib/forms.ts
git commit -m "feat(admin): create and edit forms

The question editor is the registration one, lifted into a component
that takes its type list as a prop — so a form can offer file and
registration still cannot (D164).

Turning on once-a-day rewrites the form's submissions and can collide
with the partial unique index. That is answered with a sentence naming
what to fix, not a 500.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Portal — fill it in, and see your history

**Files:**
- Create: `src/app/e/[slug]/a/[token]/forms/page.tsx`, `.../forms/[formId]/page.tsx`, `.../forms/actions.ts`, `src/components/portal/FormList.tsx`, `src/components/portal/SubmissionHistory.tsx`
- Modify: `src/lib/modules.ts`

**Interfaces:**
- Consumes: Tasks 2, 4, 6.
- Produces: `submitFormAction(slug, token, formId, formData)`.

- [ ] **Step 1: Add the route to the tile system**

In `src/lib/modules.ts`, add `"forms"` to `TILE_ROUTES` and `forms: "Forms"` to `TILE_ROUTE_LABELS`. The label map is typed `Record<TileRoute, string>` precisely so forgetting the second edit is a compile error, not a blank option.

- [ ] **Step 2: Build the list page**

`/forms` loads the event's forms, this attendee's submissions, and `nowInKL().date`, then renders one card per form the attendee is eligible for — name, description, `capSummary`, how many they have sent, and a link to the form. Use `canSubmit` for the state; never re-derive it.

- [ ] **Step 3: Build the form page**

`/forms/[formId]` renders the questions through a shared renderer that switches on `q.type`:

- `text`, `phone`, `number` → `<input>` with the matching `type`
- `select` → `<select>` of `q.options`
- `textarea` → `<textarea rows={5}>`
- `file` → `<input type="file">` (wired in Task 9; until then render it disabled with "File questions are not ready yet")

Below the form, `SubmissionHistory` lists this attendee's own submissions newest first, each showing `shortDate(submitted_on)` and its answers. When `canSubmit` says no, replace the submit button with the reason:

```typescript
const REFUSAL: Record<Exclude<SubmitReason, "ok">, string> = {
  closed: "This form is closed.",
  ineligible: "This form is not open to your group.",
  limit: "You have sent all the entries this form takes.",
  today: "You have already submitted today. Come back tomorrow.",
};
```

- [ ] **Step 4: Write the action**

`submitFormAction` loads the attendee via `loadPortalAttendee`, validates with `validateAnswers`, and on success calls `submitForm(...)` with `nowInKL().date`. Map every `SubmitCode` to a flash message — including `ok`. Never trust `canSubmit` alone: it decides what to draw, the function decides what is allowed.

- [ ] **Step 5: Verify in the browser**

Submit to a `per_day` form twice in a row. The second must be refused with "You have already submitted today", and only one row must exist in the database. Screenshot both states.

- [ ] **Step 6: Commit**

```bash
git add src/app/e src/components/portal src/lib/modules.ts
git commit -m "feat(portal): fill in a form, and see what you have sent

canSubmit decides what the page draws; submit_form decides what is
allowed. The action maps every reason code the function can return,
because a page that only handled the happy path would silently swallow
a refusal it had not thought of.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: File answers

**Files:**
- Create: `supabase/migrations/0027_form_uploads.sql`
- Modify: `src/lib/storage.ts`, `src/lib/db/media.ts`, the portal form page and action, the admin submissions view

**Interfaces:**
- Consumes: Task 8.
- Produces: `SUBMISSION_BUCKET`, `MAX_UPLOAD_BYTES`, `UPLOAD_ACCEPT`, `acceptUpload(file)`, `submissionObjectPath(input, id)`, `uploadSubmissionFile(...)`, `signedSubmissionUrl(path, seconds)`, `deleteSubmissionFiles(paths)`.

- [ ] **Step 1: Create the private bucket**

`supabase/migrations/0027_form_uploads.sql`:

```sql
-- Attendee-submitted files, in a bucket of their own — PRIVATE, unlike event-media (D168).
--
-- event-media is public on purpose: a logo and a floor plan are public by nature and render
-- in plain <img> tags on a portal anyone with a link can open. A photograph or a receipt an
-- attendee uploaded is not that, and "nobody will guess the filename" is not access control.
-- Reads go through short-lived signed URLs instead.
--
-- No policies, as everywhere else: uploads travel through a Server Action using the service
-- role, so the anon key can never write here and never read here either.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'form-uploads', 'form-uploads', false,
  10485760, -- 10 MB, the same cap src/lib/storage.ts enforces before the upload starts
  array['image/png','image/jpeg','image/jpg','image/webp','application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
```

Apply it with `apply_migration`, name `form_uploads`.

- [ ] **Step 2: Add the storage rules with tests**

Add to `tests/storage.test.ts` (read it first and match its style):

```typescript
describe("acceptUpload", () => {
  it("takes a PDF, which acceptImage must not", () => {
    expect(acceptUpload({ type: "application/pdf", size: 1000 })).toBe("pdf");
    expect(() => acceptImage({ type: "application/pdf", size: 1000 })).toThrow();
  });

  it("refuses a file over 10 MB", () => {
    expect(() => acceptUpload({ type: "image/png", size: 10 * 1024 * 1024 + 1 })).toThrow(/10 MB/);
  });

  it("refuses an empty file", () => {
    expect(() => acceptUpload({ type: "image/png", size: 0 })).toThrow();
  });

  it("puts a submission's file under its own event and form", () => {
    const path = submissionObjectPath({ orgId: "o", eventId: "e", formId: "f", ext: "png" }, "abc123");
    expect(path).toBe("o/e/f/submission-abc123.png");
  });
});
```

Run it, watch it fail, then implement `acceptUpload` and `submissionObjectPath` in `src/lib/storage.ts` beside their image equivalents. Keep the two accept lists **separate** — widening `acceptImage` to take PDFs would let somebody upload a PDF as an event logo.

- [ ] **Step 3: Add the media functions**

In `src/lib/db/media.ts`, add `uploadSubmissionFile` (mirrors `uploadEventImage`, using `SUBMISSION_BUCKET`), plus:

```typescript
/**
 * A link to one submitted file, good for a minute.
 *
 * Short on purpose. The bucket is private (D168) and this URL is the only way in, so its
 * lifetime is the window in which a leaked address is useful. A minute is plenty to click
 * a link on a page you are already looking at.
 */
export async function signedSubmissionUrl(path: string, seconds = 60): Promise<string | null> {
  const { data } = await serviceClient().storage.from(SUBMISSION_BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

export async function deleteSubmissionFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await serviceClient().storage.from(SUBMISSION_BUCKET).remove(paths);
}
```

- [ ] **Step 4: Wire the portal**

In `submitFormAction`, before calling `submitForm`, upload every `file` question's posted `File` and replace that answer with the returned **object path**. A failed upload must abort before anything is written.

- [ ] **Step 5: Wire the admin view**

In the admin submissions table, render a `file` answer as a link whose href comes from `signedSubmissionUrl`. Generate it at render time — a stored URL would be dead a minute later.

- [ ] **Step 6: Verify in the browser**

Upload a PNG to a form, confirm the admin link opens it, then confirm the raw bucket URL **without** a signature is refused. That refusal is the whole point of D168.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0027_form_uploads.sql src/lib/storage.ts src/lib/db/media.ts src/app tests/storage.test.ts
git commit -m "feat(forms): accept file answers, into a private bucket

event-media is public by design; an attendee's photo or receipt is not a
logo, and a guessable URL is not access control (D168). Reads go through
signed URLs good for a minute, generated at render time — a stored one
would be dead before the page was.

The upload accept list is deliberately separate from acceptImage rather
than a widening of it: an event logo still must not be a PDF.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Deleting and purging take the files with them

**Files:**
- Create: `supabase/migrations/0028_purge_submissions.sql`
- Modify: `src/lib/db/forms.ts`, `src/lib/db/attendees.ts`, `src/app/admin/events/[id]/forms/actions.ts`

**Interfaces:**
- Consumes: Tasks 6 and 9.
- Produces: `purge_event_personal_data(p_event_id uuid, p_tokens text[])` extended; `deleteForm` removes objects first.

- [ ] **Step 1: Make `deleteFormAction` clear the bucket**

The row cascade takes the submissions; the objects need removing explicitly, **before** the delete, because afterwards there is nothing left to ask which files were ours:

```typescript
const subs = await submissionsForForm(formId);
const form = await getForm(formId, ev.id);
const fileKeys = (form?.questions ?? []).filter((q) => q.type === "file").map((q) => q.key);
await deleteSubmissionFiles(subs.flatMap((s) => fileKeys.map((k) => s.answers[k]).filter(Boolean)));
await deleteForm(formId, ev.id);
```

- [ ] **Step 2: Extend the purge**

`supabase/migrations/0028_purge_submissions.sql` replaces `purge_event_personal_data`, adding — **inside the same function**, before the attendee update, so D172's all-or-nothing guarantee is not given back:

```sql
  delete from form_submissions where event_id = p_event_id;
```

Copy the rest of the function from `0024_purge_atomic.sql` unchanged, and extend its header comment to say submissions go too, and why (D169).

- [ ] **Step 3: Delete the files first, in TypeScript**

In `purgeAttendeePersonalData`, before the RPC, gather every `file` answer for the event and call `deleteSubmissionFiles`. Objects live in Storage, not in the table, so the function cannot reach them.

- [ ] **Step 4: Update the purge card copy**

In the settings danger card, add that submissions and their uploads go too. The card is the promise; it must stay true.

- [ ] **Step 5: Verify against a throwaway event**

Create a temporary archived event with a form, a submission and an uploaded file. Purge it. Assert: zero `form_submissions` rows, zero objects under that event's prefix in `form-uploads`, attendees anonymised. **Delete the throwaway event afterwards.** Never run this against a real event.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0028_purge_submissions.sql src/lib/db src/app
git commit -m "fix(purge): take form submissions and their uploads too

A purge that leaves the personal data in a second table is not a purge
(D169). The delete is inside the same function as the attendee update,
so the all-or-nothing guarantee D172 bought is not handed straight back.

Files go first and from TypeScript, because they live in Storage where
the function cannot reach them.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Admin submissions table and the export

**Files:**
- Create: `src/app/admin/events/[id]/forms/[formId]/page.tsx`, `src/app/admin/events/[id]/export/forms.xlsx/route.ts`, `tests/forms-export.test.ts`
- Modify: `src/lib/exports.ts`, `src/app/admin/events/[id]/exports/page.tsx`

**Interfaces:**
- Consumes: Tasks 6 and 9.
- Produces: `buildFormsWorkbook(forms: FormSheet[]): ExcelJS.Workbook`; `type FormSheet = { formName: string; questions: { key: string; label: string }[]; rows: FormExportRow[] }`; `type FormExportRow = { name: string; email: string | null; category: string | null; submittedOn: string; answers: Record<string, string> }`.

- [ ] **Step 1: Write the failing export test**

Create `tests/forms-export.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildFormsWorkbook } from "@/lib/exports";

const sheet = {
  formName: "Daily check-in",
  questions: [{ key: "mood", label: "Mood" }, { key: "note", label: "Note" }],
  rows: [{ name: "Tan Wei Ming", email: "t@example.com", category: "Delegate", submittedOn: "2026-09-28", answers: { mood: "Good", note: "" } }],
};

describe("buildFormsWorkbook", () => {
  it("gives each form its own sheet, named after it", () => {
    const wb = buildFormsWorkbook([sheet]);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Daily check-in"]);
  });

  it("puts one column per question after the fixed columns", () => {
    const ws = buildFormsWorkbook([sheet]).worksheets[0];
    expect(ws.getRow(1).values).toEqual([undefined, "Name", "Email", "Category", "Submitted", "Mood", "Note"]);
  });

  it("writes an answer under its own question, not by position", () => {
    const ws = buildFormsWorkbook([{ ...sheet, rows: [{ ...sheet.rows[0], answers: { note: "Only a note" } }] }]).worksheets[0];
    expect(ws.getRow(2).getCell(5).value).toBe("");
    expect(ws.getRow(2).getCell(6).value).toBe("Only a note");
  });

  it("says so rather than writing an empty file when there are no forms", () => {
    const wb = buildFormsWorkbook([]);
    expect(wb.worksheets).toHaveLength(1);
    expect(wb.worksheets[0].getRow(1).getCell(1).value).toMatch(/no forms/i);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/forms-export.test.ts`
Expected: FAIL — `buildFormsWorkbook is not a function`.

- [ ] **Step 3: Implement it**

Add `buildFormsWorkbook` to `src/lib/exports.ts`, following `buildActivityRostersWorkbook` — including `uniqueSheetName` so two forms with the same name do not collide. Answers are looked up **by key**, never by position.

- [ ] **Step 4: Build the route and the detail page**

The route mirrors `export/activities.xlsx/route.ts`. A `file` answer exports as a signed URL good for **seven days**, and its column header reads `"<Label> (link expires in 7 days)"` — a spreadsheet worked today should open its photographs, and a link that dies silently is worse than one that says when.

The detail page lists submissions newest first with the day, the attendee, the answers and any file as a signed link, plus the export button.

- [ ] **Step 5: Add it to the Exports page**

In `src/app/admin/events/[id]/exports/page.tsx`, add a conditional entry in the same style as the others:

```typescript
...(forms.length > 0 ? [{
  href: `${b}/forms.xlsx`, icon: "file" as IconName, name: "Form submissions",
  what: "One sheet per form: who submitted, when, and every answer. File answers are links that expire after seven days.",
}] : []),
```

- [ ] **Step 6: Verify and commit**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build && npm run check:submit`
Download the file from the running preview and open it.

```bash
git add src/lib/exports.ts src/app tests/forms-export.test.ts
git commit -m "feat(forms): read submissions in admin, and export them

Answers are looked up by question key, never by column position: a form
whose questions were reordered would otherwise file every answer under
the wrong heading, and the spreadsheet would look perfectly fine.

File answers export as a signed URL good for seven days, and the column
header says so, because a link that dies silently next month is worse
than one that tells you when.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage.** D161 → Task 3. D162 → Tasks 1–2. D163 → no code; identity is structural (`attendee_id` is `not null`). D164 → Task 1. D165 → Tasks 3, 6 (`updateForm` sync), 7 (collision message). D166 → structural: no update or delete path is built for an attendee, and Task 8 exposes none. D167 → Tasks 5, 6. D168 → Task 9. D169 → Task 10. D170 → Task 3 (column only, nothing reads it). D171 → Tasks 3, 4. Spec §6 surfaces → Tasks 7, 8, 11. Spec §7 testing → Tasks 1, 2, 4, 5, 9, 11.

**Gap found and closed:** the spec's §6 mentions `TILE_ROUTES` gaining `forms`; that is Task 8 Step 1.

**Type consistency.** `SubmitReason` (Task 4) and `SubmitCode` (Task 6) are deliberately different types: `canSubmit` cannot return `missing`, because it was handed a form. Task 8 maps `SubmitCode`, and its `REFUSAL` map is keyed on `SubmitReason` for the page's own state. `parseQuestions`' second parameter is `readonly QuestionType[]` in Tasks 1 and 7 alike. `submissionObjectPath` takes `{ orgId, eventId, formId, ext }` in Task 9 and is used nowhere else.

**Placeholder scan.** Tasks 7, 8 and 11 describe some markup in prose rather than complete JSX. That is deliberate: they are page layouts following named existing files that the step tells the implementer to read first, and transcribing four hundred lines of near-duplicate markup into a plan would be less accurate than pointing at the file it copies. Every non-obvious rule in those tasks — the collision message, the refusal map, the export header, the by-key lookup — is written out in full.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-23-form-submissions.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — a fresh subagent per task, reviewed between tasks, fast iteration.

**2. Inline Execution** — tasks executed in this session with checkpoints for review.

**Which approach?**
