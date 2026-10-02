# Project Mileage — scored challenge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the 9-week Project Mileage walking challenge in the live `ecphub` event. Each team
member logs one entry per workout (km plus photo proof) on a tracker page. ECP Hub scores the
three tiers live from those entries and shows a points-only team table to attendees and a full
leaderboard to the committee.

**Architecture:** Mileage is an ordinary submission activity (`activities.kind = 'submission'`).
It gains two things:
- a new "who submits" mode, `members`, which tags each entry with the submitter's team
- a `scoring jsonb` setting, which turns on the tracker page and the leaderboards

Points are never stored. Two pure, unit-tested modules work everything out from live entries:
`src/lib/challenge.ts` (dates, weeks, points steps) and `src/lib/challenge-score.ts` (the three
tiers). A SQL function hands them per-person daily totals. Phase 1 (Tasks 1–7) must be live on
Mon 5 Oct 2026. Phase 2 (Tasks 8–13) must be live by Sun 11 Oct 2026.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, Supabase Postgres (migrations
applied through the Supabase MCP `apply_migration`), zod, vitest, Tailwind and shadcn/ui
components in `src/components/ui`, lucide-react icons, ExcelJS.

**Spec:** `docs/superpowers/specs/2026-10-02-project-mileage-design.md` (D368–D383). Read it first.

## Global Constraints

- `AGENTS.md`: this Next.js has breaking changes. Read the matching guide in
  `node_modules/next/dist/docs/` before writing route, page or Server Action code.
- `ecphub` is the live event. Build and test on another event (the test data lives in `ecpkom`).
  Never create, submit, revoke or disqualify anything in `ecphub` except in Task 7 Step 4, and only
  after the user says yes in chat.
- Work on `main`. Don't create worktrees, because the user declines them. Other sessions push to
  `main` too, so `git pull --rebase` before each push.
- Days are Malaysian calendar days, `YYYY-MM-DD`, from `nowInKL().date` (`src/lib/time.ts`).
  Never use a UTC date.
- Copy: write plain sentences with no exclamation marks, except the existing "Submitted. Thanks!".
  The words "team" and "group" both appear: say "team" on Mileage screens and keep "group" for
  existing group-form copy.
- Comments follow the surrounding style: explain why, and cite the decision number (D368–D383).
- Commit messages: `feat(mileage): … (D3xx)`, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Checks before every commit: `npx vitest run <the touched test files>`, then `npx tsc --noEmit`.
  Run the full suite with `npm test` at the end of each phase.
- Admin screens follow the approved admin style: capped and centred, actions in the header, tabs,
  table-style lists with ⋯ menus, sticky save bar.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/lib/types.ts` | modify | `RegistrationQuestion.min/max/decimals`; `GroupMode` adds `members`; `ChallengeScoring`, `DailyStep`; `Activity.scoring` |
| `src/lib/number-answer.ts` | create | `checkNumber`: number limits and normalisation (D370). Client-safe, with no zod |
| `src/lib/registration.ts` | modify | Schema accepts the limits; `validateAnswers` calls `checkNumber` |
| `src/lib/questions-form.ts` | modify | Posts and reads `q_n_min/max/decimals` |
| `src/components/admin/QuestionCards.tsx` | modify | Min, max and decimals inputs on number questions |
| `src/components/portal/SubmissionFields.tsx` | modify | `inputMode="decimal"`, `step`, `min`, `max` on limited number questions |
| `supabase/migrations/0057_scored_challenges.sql` | create | `members` mode, `activities.scoring`, `submit_answers` update |
| `src/lib/challenge.ts` | create | Dates, weeks, week labels, step points, `readScoring` (D372, D376, D378) |
| `src/lib/submissions.ts` | modify | `isGroupForm`; `canSubmit` handles `members` mode and the challenge dates; `readGroupRule`, `capSummary` |
| `src/components/admin/WhoSubmitsFields.tsx` | modify | Fourth "who submits" option |
| `src/components/admin/ScoringFields.tsx` | create | The Scoring section of Setup |
| `src/components/admin/ActivityRows.tsx` | modify | Renders `ScoringFields` |
| `src/app/admin/events/[id]/activities/actions.ts` | modify | `readSubmissionPolicy` reads scoring; Disqualify and Undo actions (Phase 2) |
| `src/lib/db/activities.ts` | modify | `NewActivity.scoring`; `entriesForAttendee` |
| `src/app/admin/events/[id]/activities/[activityId]/page.tsx` | modify | `isGroupForm` split, Team column, daily chasing for scored activities, Leaderboard tab (Phase 2) |
| `src/app/admin/events/[id]/activities/page.tsx`, `src/lib/activity-row.ts`, `src/app/admin/events/[id]/export/submissions.xlsx/route.ts` | modify | `isGroupForm` instead of `!== "off"` |
| `src/lib/portal-activity-entries.ts` | modify | `members` mode passes the team id to `canSubmit` |
| `src/lib/tracker.ts` | create | `buildTracker`: week strip, ring, streak, the day's entries (D374) |
| `src/components/portal/tracker/*.tsx` | create | `WeekStrip`, `DayRing`, `EntryTimeline`, `EntryPhotos` |
| `src/app/e/[slug]/a/[token]/activities/[activityId]/page.tsx` | modify | `TrackerBody` for scored activities |
| `supabase/migrations/0058_challenge_scores.sql` | create | `challenge_disqualifications`, `challenge_daily_totals()` |
| `src/lib/challenge-score.ts` | create | `scoreChallenge`: Tier 1, 2 and 3, standings, Void (D375, D377, D380) |
| `src/lib/db/challenge.ts` | create | Daily totals RPC and disqualification reads and writes |
| `src/lib/challenge-data.ts` | create | `loadChallenge`: one server read shared by the portal, admin and export |
| `src/components/portal/tracker/TeamTable.tsx`, `MyTeam.tsx` | create | Phase 2 attendee views (D379) |
| `src/components/admin/LeaderboardPanel.tsx`, `TeamGrid.tsx` | create | Committee Leaderboard tab (D381) |
| `src/lib/activity-tabs.ts` | modify | `leaderboard` tab |
| `src/lib/exports.ts` | modify | `leaderboardRows`, `addLeaderboardSheet` |
| `tests/number-answer.test.ts`, `tests/challenge.test.ts`, `tests/tracker.test.ts`, `tests/challenge-score.test.ts` | create | Unit tests |
| `tests/submissions.test.ts`, `tests/questions-form.test.ts`, `tests/registration.test.ts`, `tests/activity-tabs.test.ts`, `tests/exports.test.ts` | modify | Extended unit tests |

---

# Phase 1 — live Mon 5 Oct

### Task 1: Number limits on questions (D370)

**Files:**
- Modify: `src/lib/types.ts` (the `RegistrationQuestion` type, around lines 9–25)
- Create: `src/lib/number-answer.ts`
- Modify: `src/lib/registration.ts` (`schemaFor`, `validateAnswers`)
- Modify: `src/lib/questions-form.ts`
- Modify: `src/components/admin/QuestionCards.tsx`
- Modify: `src/components/portal/SubmissionFields.tsx` (`renderQuestion`)
- Test: `tests/number-answer.test.ts` (create), `tests/registration.test.ts`, `tests/questions-form.test.ts`

**Interfaces:**
- Produces:
  - `RegistrationQuestion` gains `min?: number; max?: number; decimals?: number`.
  - `hasNumberLimits(q): boolean`.
  - `checkNumber(q, raw): { ok: true; value: string } | { ok: false; error: string }`.
  - `numberInputAttrs(q): { inputMode: "decimal"; step: string; min?: number; max?: number } | null`.
  - `QuestionDraft` gains `min: string; max: string; decimals: string`.

- [ ] **Step 1: Add the fields to the type**

In `src/lib/types.ts`, inside `RegistrationQuestion`, after `show_when`:

```ts
  /**
   * D370: number questions only, all optional. With any of the three set, an answer must be a
   * plain decimal number inside them; with none set, a number question behaves as it always has.
   */
  min?: number;
  max?: number;
  /** Most digits after the point; 0 means a whole number. */
  decimals?: number;
```

- [ ] **Step 2: Write the failing tests for `checkNumber`**

Create `tests/number-answer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checkNumber, hasNumberLimits, numberInputAttrs } from "@/lib/number-answer";

const km = { label: "Distance (km)", min: 1, max: 50, decimals: 2 };

describe("checkNumber", () => {
  it("accepts a number inside the limits and normalises it", () => {
    expect(checkNumber(km, "2.50")).toEqual({ ok: true, value: "2.5" });
    expect(checkNumber(km, " 10 ")).toEqual({ ok: true, value: "10" });
    expect(checkNumber(km, "1")).toEqual({ ok: true, value: "1" });
    expect(checkNumber(km, "50")).toEqual({ ok: true, value: "50" });
  });

  it("refuses below the minimum", () => {
    expect(checkNumber(km, "0.8")).toEqual({ ok: false, error: "Distance (km) must be at least 1" });
  });

  it("refuses above the maximum", () => {
    expect(checkNumber(km, "50.01")).toEqual({ ok: false, error: "Distance (km) must be 50 or less" });
  });

  it("refuses too many decimal places, ignoring trailing zeros", () => {
    expect(checkNumber(km, "2.345")).toEqual({ ok: false, error: "Distance (km) can have at most 2 decimal places" });
    expect(checkNumber(km, "2.300")).toEqual({ ok: true, value: "2.3" });
  });

  it("asks for a whole number when decimals is 0", () => {
    expect(checkNumber({ label: "Steps", decimals: 0 }, "2.5")).toEqual({ ok: false, error: "Steps must be a whole number" });
  });

  it("refuses anything that is not a plain decimal number", () => {
    for (const bad of ["abc", "1,5", "-2", "1e3", "2.", ".5", "RM 5"]) {
      expect(checkNumber(km, bad)).toEqual({ ok: false, error: "Distance (km) must be a number, like 2.5" });
    }
  });
});

describe("hasNumberLimits", () => {
  it("is false for a number question with no limits", () => {
    expect(hasNumberLimits({})).toBe(false);
    expect(hasNumberLimits({ decimals: 0 })).toBe(true);
    expect(hasNumberLimits({ min: 1 })).toBe(true);
  });
});

describe("numberInputAttrs", () => {
  it("gives the phone a decimal keypad and a step from decimals", () => {
    expect(numberInputAttrs(km)).toEqual({ inputMode: "decimal", step: "0.01", min: 1, max: 50 });
    expect(numberInputAttrs({ decimals: 0 })).toEqual({ inputMode: "decimal", step: "1" });
    expect(numberInputAttrs({ min: 1 })).toEqual({ inputMode: "decimal", step: "any", min: 1 });
  });

  it("is null without limits, so old forms render as before", () => {
    expect(numberInputAttrs({})).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `npx vitest run tests/number-answer.test.ts`
Expected: FAIL, because `@/lib/number-answer` cannot be resolved.

- [ ] **Step 4: Implement `src/lib/number-answer.ts`**

```ts
import type { RegistrationQuestion } from "@/lib/types";

type Limits = Pick<RegistrationQuestion, "min" | "max" | "decimals">;
const PLAIN_DECIMAL = /^\d+(\.\d+)?$/;

/** D370: limits are opt-in, so a number question nobody configured keeps its old, loose behaviour. */
export function hasNumberLimits(q: Limits): boolean {
  return q.min !== undefined || q.max !== undefined || q.decimals !== undefined;
}

/**
 * One answer to a number question with limits: a plain decimal (no sign, no exponent, no
 * thousands separator), inside min and max, with no more places than `decimals` once trailing
 * zeros are dropped. The value comes back normalised ("2.50" → "2.5"), which is the string
 * stored (D161 keeps answers as strings).
 *
 * Kept free of zod so the portal's client form can import `numberInputAttrs` from here.
 */
export function checkNumber(q: Pick<RegistrationQuestion, "label"> & Limits, raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = raw.trim();
  if (!PLAIN_DECIMAL.test(v)) return { ok: false, error: `${q.label} must be a number, like 2.5` };
  const n = Number(v);
  const places = (v.split(".")[1] ?? "").replace(/0+$/, "").length;
  if (q.decimals !== undefined && places > q.decimals) {
    return { ok: false, error: q.decimals === 0 ? `${q.label} must be a whole number` : `${q.label} can have at most ${q.decimals} decimal places` };
  }
  if (q.min !== undefined && n < q.min) return { ok: false, error: `${q.label} must be at least ${q.min}` };
  if (q.max !== undefined && n > q.max) return { ok: false, error: `${q.label} must be ${q.max} or less` };
  return { ok: true, value: String(n) };
}

/** What the portal's <input> carries for a limited number question; null leaves it as it always was. */
export function numberInputAttrs(q: Limits): { inputMode: "decimal"; step: string; min?: number; max?: number } | null {
  if (!hasNumberLimits(q)) return null;
  const step = q.decimals === undefined ? "any" : q.decimals === 0 ? "1" : (1 / 10 ** q.decimals).toFixed(q.decimals);
  return {
    inputMode: "decimal",
    step,
    ...(q.min !== undefined ? { min: q.min } : {}),
    ...(q.max !== undefined ? { max: q.max } : {}),
  };
}
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `npx vitest run tests/number-answer.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing tests for the schema and `validateAnswers`**

Append to `tests/registration.test.ts`. The file already imports `validateAnswers` and
`parseQuestions`; add any import that's missing.

```ts
describe("number limits (D370)", () => {
  const km = { key: "km", label: "Distance (km)", type: "number" as const, required: true, min: 1, max: 50, decimals: 2 };

  it("keeps min, max and decimals through parseQuestions", () => {
    expect(parseQuestions([km], FORM_QUESTION_TYPES)[0]).toMatchObject({ min: 1, max: 50, decimals: 2 });
  });

  it("refuses a min above the max", () => {
    expect(() => parseQuestions([{ ...km, min: 60 }], FORM_QUESTION_TYPES)).toThrow(/smallest/);
  });

  it("validates and normalises a limited number answer", () => {
    expect(validateAnswers({ km: "2.50" }, [km])).toEqual({ ok: true, answers: { km: "2.5" } });
    expect(validateAnswers({ km: "0.8" }, [km])).toEqual({ ok: false, errors: { km: "Distance (km) must be at least 1" } });
  });

  it("leaves an unlimited number question exactly as before", () => {
    const age = { key: "age", label: "Age", type: "number" as const, required: false };
    expect(validateAnswers({ age: "about 30" }, [age])).toEqual({ ok: true, answers: { age: "about 30" } });
  });

  it("does not check a blank optional limited answer", () => {
    expect(validateAnswers({ km: "" }, [{ ...km, required: false }])).toEqual({ ok: true, answers: { km: "" } });
  });
});
```

- [ ] **Step 7: Run them to confirm they fail**

Run: `npx vitest run tests/registration.test.ts`
Expected: FAIL. zod strips the unknown keys, so `toMatchObject` fails, and the answer isn't
normalised.

- [ ] **Step 8: Implement in `src/lib/registration.ts`**

Add `import { checkNumber, hasNumberLimits } from "@/lib/number-answer";` to the imports.

In `schemaFor`, add three keys after `show_when`, and chain a second refine after the existing one:

```ts
  min: z.number().optional(),
  max: z.number().optional(),
  decimals: z.number().int().min(0).max(4).optional(),
}).refine((q) => q.type !== "select" || (q.options && q.options.length > 0), { message: "select questions need options" })
  .refine((q) => q.min === undefined || q.max === undefined || q.min <= q.max, { message: "the smallest number allowed is above the largest" });
```

In `validateAnswers`, replace the two lines that set the error and the answer:

```ts
    if (q.required && !v) errors[q.key] = `${q.label} is required`;
    else if (q.type === "select" && v && !q.options!.includes(v)) errors[q.key] = "Choose one of the listed options";
    answers[q.key] = v;
```

with:

```ts
    if (q.required && !v) errors[q.key] = `${q.label} is required`;
    else if (q.type === "select" && v && !q.options!.includes(v)) errors[q.key] = "Choose one of the listed options";
    else if (q.type === "number" && v && hasNumberLimits(q)) {
      // D370: checked and normalised here, server-side, for the portal's submit and the admin's edit alike.
      const n = checkNumber(q, v);
      if (!n.ok) errors[q.key] = n.error;
      else { answers[q.key] = n.value; continue; }
    }
    answers[q.key] = v;
```

- [ ] **Step 9: Run them to confirm they pass**

Run: `npx vitest run tests/registration.test.ts tests/number-answer.test.ts`
Expected: PASS.

- [ ] **Step 10: Write the failing test for the question editor round-trip**

Append to `tests/questions-form.test.ts`. It already imports `questionsFromForm`, `draftFrom` and
`questionFormEntries`; add any import that's missing, plus `FORM_QUESTION_TYPES` from
`@/lib/registration`.

```ts
describe("number limits in the editor (D370)", () => {
  const fields = (entries: [string, string][]) => { const m = new Map(entries); return (k: string) => m.get(k) ?? null; };

  it("reads min, max and decimals for a number question", () => {
    const q = questionsFromForm(fields([
      ["q_1_label", "Distance (km)"], ["q_1_key", "km"], ["q_1_type", "number"], ["q_1_required", "on"],
      ["q_1_min", "1"], ["q_1_max", "50"], ["q_1_decimals", "2"],
    ]), FORM_QUESTION_TYPES, 20);
    expect(q[0]).toMatchObject({ key: "km", min: 1, max: 50, decimals: 2 });
  });

  it("ignores limits on a question that is not a number", () => {
    const q = questionsFromForm(fields([["q_1_label", "Name"], ["q_1_type", "text"], ["q_1_min", "1"]]), FORM_QUESTION_TYPES, 20);
    expect(q[0].min).toBeUndefined();
  });

  it("round-trips through the card draft", () => {
    const original = { key: "km", label: "Distance (km)", type: "number" as const, required: true, min: 1, max: 50, decimals: 2 };
    const back = questionsFromForm(fields(questionFormEntries([draftFrom(original)])), FORM_QUESTION_TYPES, 20);
    expect(back[0]).toMatchObject({ min: 1, max: 50, decimals: 2 });
  });
});
```

- [ ] **Step 11: Run it to confirm it fails**

Run: `npx vitest run tests/questions-form.test.ts`
Expected: FAIL.

- [ ] **Step 12: Implement in `src/lib/questions-form.ts`**

In `questionsFromForm`, after the `showKey` / `showValue` line, add:

```ts
    // D370: a limit is only a number question's; blank means unset, and anything not a number
    // reaches parseQuestions as NaN so the organiser reads zod's refusal instead of a silent drop.
    const limit = (k: string) => (t(`q_${n}_${k}`) === "" ? undefined : Number(t(`q_${n}_${k}`)));
    const limits = type === "number"
      ? Object.fromEntries((["min", "max", "decimals"] as const).map((k) => [k, limit(k)]).filter(([, v]) => v !== undefined))
      : {};
```

and spread `...limits,` into the pushed object after the `show_when` spread.

In `QuestionDraft`, add:

```ts
  /** D370, number questions only: each as typed, "" for unset. */
  min: string;
  max: string;
  decimals: string;
```

In `draftFrom`, add `min: q.min?.toString() ?? "", max: q.max?.toString() ?? "", decimals: q.decimals?.toString() ?? ""`.

In `questionFormEntries`, after the show-key push, add:
`out.push([`q_${n}_min`, d.min], [`q_${n}_max`, d.max], [`q_${n}_decimals`, d.decimals]);`

- [ ] **Step 13: Add the inputs to `QuestionCards`**

In `src/components/admin/QuestionCards.tsx`:
- Extend `blank()` with `min: "", max: "", decimals: ""`.
- After the `{c.type === "select" && (...)}` block, add:

```tsx
                  {c.type === "number" && (
                    <div className="flex flex-wrap gap-4">
                      {([["min", "Smallest allowed"], ["max", "Largest allowed"], ["decimals", "Decimal places"]] as const).map(([k, label]) => (
                        <label key={k} className="grid gap-1.5 text-sm"><span className="font-bold">{label}</span>
                          <input inputMode="decimal" value={c[k]} placeholder="Any" onChange={(e) => update(c.id, { [k]: e.target.value })}
                            className={`${input} w-28 tabular-nums`} /></label>
                      ))}
                    </div>
                  )}
```

- [ ] **Step 14: Use the limits on the portal input**

In `src/components/portal/SubmissionFields.tsx`, add `import { numberInputAttrs } from "@/lib/number-answer";`.
Replace the last two lines of `renderQuestion`:

```tsx
  const type = q.type === "phone" ? "tel" : q.type === "number" ? "number" : "text";
  return <input id={id} name={q.key} type={type} required={q.required} defaultValue={current} className={inputClass} />;
```

with:

```tsx
  const type = q.type === "phone" ? "tel" : q.type === "number" ? "number" : "text";
  // D370: a limited number question opens the decimal keypad and lets the browser say "at least 1" first.
  const limits = q.type === "number" ? numberInputAttrs(q) : null;
  return <input id={id} name={q.key} type={type} required={q.required} defaultValue={current} className={inputClass} {...limits} />;
```

- [ ] **Step 15: Run the tests and the type check**

Run: `npx vitest run tests/number-answer.test.ts tests/registration.test.ts tests/questions-form.test.ts tests/questions-allowlist.test.ts && npx tsc --noEmit`
Expected: PASS, and no type errors.

- [ ] **Step 16: Commit**

```bash
git add src/lib/types.ts src/lib/number-answer.ts src/lib/registration.ts src/lib/questions-form.ts src/components/admin/QuestionCards.tsx src/components/portal/SubmissionFields.tsx tests/number-answer.test.ts tests/registration.test.ts tests/questions-form.test.ts
git commit -m "feat(mileage): min, max and decimals on number questions (D370)"
```

---

### Task 2: Migration — `members` mode, `scoring`, `submit_answers` (D369, D372, D373)

**Files:**
- Create: `supabase/migrations/0057_scored_challenges.sql`

**Interfaces:**
- Produces:
  - `activities.group_mode` accepts `'members'`.
  - `activities.scoring jsonb` (nullable, submission kind only).
  - `submit_answers` refuses `nogroup` in `members` mode and stamps `group_id`. It applies no
    per-person limit in that mode, and returns `closed` outside `scoring.starts_on..ends_on`.

- [ ] **Step 1: Look up the auto-named check constraint**

Use the Supabase MCP `execute_sql` on project `wfmqwwcolfigjylkgrsv`:

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'activities'::regclass and pg_get_constraintdef(oid) ilike '%group_mode%';
```

Expected: a row whose definition is `CHECK (group_mode = ANY (ARRAY['off'::text, 'entries'::text, 'everyone'::text]))`.
Its name is most likely `activities_group_mode_check`. Use whatever name the query returns in Step 2.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/0057_scored_challenges.sql`:

```sql
-- D369, D372, D373 — scored challenges (Project Mileage).
-- 'members': each member submits their own entries, stamped with their team; no group target.
-- scoring: the setting that turns a submission activity into a scored challenge. Null is off.

alter table activities drop constraint activities_group_mode_check;
alter table activities add constraint activities_group_mode_check
  check (group_mode in ('off', 'entries', 'everyone', 'members'));
-- activities_group_per_day_check (0055) already refuses per_day for every mode but 'off'.

alter table activities add column scoring jsonb;
alter table activities add constraint activities_scoring_kind_check
  check (scoring is null or kind = 'submission');

-- As 0055, plus: 'members' needs a group and has no per-person limit (D369), and a scored
-- activity refuses days outside its challenge dates with 'closed' (D373).
create or replace function submit_answers(
  p_activity_id uuid,
  p_attendee_id uuid,
  p_answers jsonb,
  p_today date
) returns text
language plpgsql
as $$
declare
  a activities%rowtype;
  att attendees%rowtype;
  used int;
  v_constraint text;
begin
  select * into a from activities where id = p_activity_id for update;
  if not found then return 'missing'; end if;
  if a.kind <> 'submission' then return 'missing'; end if;

  select * into att from attendees where id = p_attendee_id;
  if not found or att.event_id <> a.event_id then return 'missing'; end if;

  if not a.is_open then return 'closed'; end if;

  if a.scoring is not null and (
    p_today < (a.scoring->>'starts_on')::date or p_today > (a.scoring->>'ends_on')::date
  ) then
    return 'closed';
  end if;

  if not category_matches(a.categories, att.category) then return 'ineligible'; end if;

  if a.group_mode <> 'off' then
    if att.group_id is null then return 'nogroup'; end if;
    if a.group_mode = 'entries' then
      select count(*) into used from activity_submissions
       where activity_id = a.id and group_id = att.group_id and status = 'submitted';
      if used >= a.group_target then return 'groupdone'; end if;
    elsif a.group_mode = 'everyone' and exists (
      select 1 from activity_submissions
       where activity_id = a.id and attendee_id = p_attendee_id
         and group_id = att.group_id and status = 'submitted'
    ) then
      return 'limit';
    end if;
    -- 'members': no limit at all - one entry per workout (D368).
  else
    if a.max_per_attendee is not null then
      select count(*) into used from activity_submissions
       where activity_id = a.id and attendee_id = p_attendee_id and status = 'submitted';
      if used >= a.max_per_attendee then return 'limit'; end if;
    end if;

    if a.per_day and exists (
      select 1 from activity_submissions
       where activity_id = a.id and attendee_id = p_attendee_id and submitted_on = p_today and status = 'submitted'
    ) then
      return 'today';
    end if;
  end if;

  insert into activity_submissions (event_id, activity_id, attendee_id, group_id, answers, submitted_on, per_day)
  values (
    a.event_id, a.id, p_attendee_id,
    case when a.group_mode <> 'off' then att.group_id end,
    coalesce(p_answers, '{}'::jsonb), p_today, a.per_day
  );

  return 'ok';
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'activity_submissions_one_a_day' then
      return 'today';
    end if;
    raise;
end;
$$;

revoke execute on function submit_answers(uuid, uuid, jsonb, date) from public, anon, authenticated;
grant execute on function submit_answers(uuid, uuid, jsonb, date) to service_role;
```

- [ ] **Step 3: Apply it**

Use the Supabase MCP `apply_migration` with project `wfmqwwcolfigjylkgrsv`, name
`0057_scored_challenges`, and the file's contents as the query. The migration only adds things, and
existing rows keep `scoring = null`, so live events are unaffected.

- [ ] **Step 4: Check it**

Use `execute_sql`:

```sql
select column_name from information_schema.columns where table_name = 'activities' and column_name = 'scoring';
select prosrc ilike '%members%' as has_members from pg_proc where proname = 'submit_answers';
```

Expected: one `scoring` row, and `has_members = true`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0057_scored_challenges.sql
git commit -m "feat(mileage): members mode, scoring column and challenge dates in submit_answers (D369, D372, D373)"
```

---

### Task 3: Challenge rules — `src/lib/challenge.ts` and `canSubmit` (D369, D372, D376, D378)

**Files:**
- Modify: `src/lib/types.ts` (`GroupMode`, new `DailyStep` and `ChallengeScoring`, `Activity.scoring`)
- Create: `src/lib/challenge.ts`
- Modify: `src/lib/submissions.ts`
- Modify: `src/lib/db/activities.ts` (`NewActivity.scoring`)
- Test: `tests/challenge.test.ts` (create), `tests/submissions.test.ts`

**Interfaces:**
- Consumes: the `scoring` column from Task 2.
- Produces:
  - Types:
    - `type GroupMode = "off" | "entries" | "everyone" | "members"`
    - `type DailyStep = { at: number; pts: number }`
    - `type ChallengeScoring = { metric_key: string; daily_min: number; starts_on: string; ends_on: string; daily_steps?: DailyStep[]; team_bonus?: number; podium?: number[] }`
    - `Activity.scoring: ChallengeScoring | null`
    - `type ChallengeWeek = { number: number; days: string[] }`
  - From `challenge.ts`:
    - `addDays(day, n)`, `mondayOf(day)`, `inChallenge(s, day)`, `round2(n)`
    - `challengeWeeks(s, eventStartsOn): ChallengeWeek[]`, `weekFor(weeks, day)`, `weekLabel(week)`
    - `stepPoints(km, steps)`, `nextStep(km, steps)`
    - `parseSteps(text)`, `stepsText(steps)`, `readScoring(get, questions)`
  - From `submissions.ts`:
    - `isGroupForm(mode)`
    - `canSubmit(activity, mine, category, today, group, teamId?)`

- [ ] **Step 1: Add the types**

In `src/lib/types.ts`, change `export type GroupMode = "off" | "entries" | "everyone";` to:

```ts
/** D350, D369: `members` is each member submitting their own entries, stamped with their team. */
export type GroupMode = "off" | "entries" | "everyone" | "members";

/** D376: a daily total at or above `at` km earns `pts`. Kept ascending by `at`. */
export type DailyStep = { at: number; pts: number };

/**
 * D372/D376: what makes a submission activity a scored challenge. `metric_key` names the number
 * question whose answers are summed per person per day. Dates are Malaysian days, inclusive.
 * The three optional fields switch Tier 1, Tier 2 and Tier 3 on.
 */
export type ChallengeScoring = {
  metric_key: string;
  daily_min: number;
  starts_on: string;
  ends_on: string;
  daily_steps?: DailyStep[];
  team_bonus?: number;
  podium?: number[];
};
```

In `Activity`, after `group_target`, add:

```ts
  /** Submission kind only (D372). Null is an ordinary form; set, it is a scored challenge. */
  scoring: ChallengeScoring | null;
```

In `src/lib/db/activities.ts` `NewActivity`, after `group_target?`, add:

```ts
  /** Submission kind only (D372). Left out, the column's null stands. */
  scoring?: ChallengeScoring | null;
```

and add `ChallengeScoring` to that file's `import type` from `@/lib/types`.

Run `npx tsc --noEmit`. It fails wherever a full `Activity` literal is built, mostly test
fixtures. Add `scoring: null` to each one. Find them with
`grep -rln "group_target: null" tests src`.

- [ ] **Step 2: Write the failing tests for `challenge.ts`**

Create `tests/challenge.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  addDays, mondayOf, inChallenge, challengeWeeks, weekFor, weekLabel,
  stepPoints, nextStep, parseSteps, stepsText, readScoring,
} from "@/lib/challenge";
import type { ChallengeScoring, RegistrationQuestion } from "@/lib/types";

const MILEAGE: ChallengeScoring = {
  metric_key: "km", daily_min: 1, starts_on: "2026-10-05", ends_on: "2026-12-04",
  daily_steps: [{ at: 1, pts: 1 }, { at: 3, pts: 2 }, { at: 5, pts: 4 }, { at: 8, pts: 6 }, { at: 10, pts: 8 }],
  team_bonus: 20, podium: [20, 12, 6],
};

describe("dates", () => {
  it("adds days across a month end", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-10-05", -1)).toBe("2026-10-04");
  });

  it("finds the Monday of a week", () => {
    expect(mondayOf("2026-10-05")).toBe("2026-10-05");
    expect(mondayOf("2026-10-11")).toBe("2026-10-05");
    expect(mondayOf("2026-12-04")).toBe("2026-11-30");
  });

  it("knows the challenge's days, inclusive", () => {
    expect(inChallenge(MILEAGE, "2026-10-04")).toBe(false);
    expect(inChallenge(MILEAGE, "2026-10-05")).toBe(true);
    expect(inChallenge(MILEAGE, "2026-12-04")).toBe(true);
    expect(inChallenge(MILEAGE, "2026-12-05")).toBe(false);
  });
});

describe("challengeWeeks (D378)", () => {
  const weeks = challengeWeeks(MILEAGE, "2026-09-28");

  it("numbers weeks from the event's first week, so Mileage runs Week 2 to Week 10", () => {
    expect(weeks.map((w) => w.number)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("gives full Mon–Sun weeks and a Mon–Fri last week", () => {
    expect(weeks[0].days).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
    expect(weeks[8].days).toEqual(["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04"]);
  });

  it("counts from the challenge's own start when the event has no start date", () => {
    expect(challengeWeeks(MILEAGE, null)[0].number).toBe(1);
  });

  it("finds the week of a day, and labels it", () => {
    expect(weekFor(weeks, "2026-10-08")?.number).toBe(2);
    expect(weekFor(weeks, "2026-12-06")).toBeNull();
    expect(weekLabel(weeks[0])).toBe("Week 2 · 5–11 Oct");
    expect(weekLabel(weeks[3])).toBe("Week 5 · 26 Oct – 1 Nov");
    expect(weekLabel(weeks[8])).toBe("Week 10 · 30 Nov – 4 Dec");
  });
});

describe("points steps (D377)", () => {
  const steps = MILEAGE.daily_steps!;

  it("maps a daily total to the highest step at or below it", () => {
    expect(stepPoints(0.99, steps)).toBe(0);
    expect(stepPoints(1, steps)).toBe(1);
    expect(stepPoints(6, steps)).toBe(4);
    expect(stepPoints(9.99, steps)).toBe(6);
    expect(stepPoints(10, steps)).toBe(8);
    expect(stepPoints(42, steps)).toBe(8);
  });

  it("names the next step, or null at the top", () => {
    expect(nextStep(4.2, steps)).toEqual({ at: 5, pts: 4 });
    expect(nextStep(10, steps)).toBeNull();
  });

  it("parses and prints the organiser's text", () => {
    expect(parseSteps("1=1, 3=2, 5=4, 8=6, 10=8")).toEqual(steps);
    expect(stepsText(steps)).toBe("1=1, 3=2, 5=4, 8=6, 10=8");
    expect(parseSteps("  ")).toEqual([]);
    expect(() => parseSteps("1=1, 1=2")).toThrow(/smallest first/);
    expect(() => parseSteps("one=1")).toThrow(/km=points/);
  });
});

describe("readScoring (D372)", () => {
  const questions: RegistrationQuestion[] = [
    { key: "method", label: "How", type: "select", required: true, options: ["Watch", "Treadmill"] },
    { key: "km", label: "Distance (km)", type: "number", required: true, min: 1 },
  ];
  const form = (over: Record<string, string> = {}) => {
    const m = new Map(Object.entries({
      scoring_on: "on", scoring_metric: "km", scoring_daily_min: "1",
      scoring_starts_on: "2026-10-05", scoring_ends_on: "2026-12-04",
      scoring_steps: "1=1, 3=2, 5=4, 8=6, 10=8", scoring_team_bonus: "20", scoring_podium: "20, 12, 6",
      ...over,
    }));
    return (k: string) => m.get(k) ?? null;
  };

  it("reads the whole Mileage setting", () => {
    expect(readScoring(form(), questions)).toEqual(MILEAGE);
  });

  it("is null when scoring is off", () => {
    expect(readScoring(form({ scoring_on: "" }), questions)).toBeNull();
  });

  it("leaves out the tiers that are blank", () => {
    expect(readScoring(form({ scoring_steps: "", scoring_team_bonus: "", scoring_podium: "" }), questions))
      .toEqual({ metric_key: "km", daily_min: 1, starts_on: "2026-10-05", ends_on: "2026-12-04" });
  });

  it("refuses a score question that is not a number question", () => {
    expect(() => readScoring(form({ scoring_metric: "method" }), questions)).toThrow(/number question/);
  });

  it("refuses dates that cannot be right", () => {
    expect(() => readScoring(form({ scoring_ends_on: "2026-10-01" }), questions)).toThrow(/before/);
    expect(() => readScoring(form({ scoring_starts_on: "" }), questions)).toThrow(/start and an end/);
  });

  it("refuses a daily minimum that is not above zero", () => {
    expect(() => readScoring(form({ scoring_daily_min: "0" }), questions)).toThrow(/daily minimum/);
  });
});
```

- [ ] **Step 3: Run them to confirm they fail**

Run: `npx vitest run tests/challenge.test.ts`
Expected: FAIL, because the module isn't found.

- [ ] **Step 4: Implement `src/lib/challenge.ts`**

```ts
import { daysBetween } from "@/lib/time";
import type { ChallengeScoring, DailyStep, RegistrationQuestion } from "@/lib/types";

/**
 * The calendar and points arithmetic of a scored challenge (D372, D376, D378). Pure: every day is
 * a Malaysian `YYYY-MM-DD` already, stepped at UTC midnight the way `lastDays` does, so nothing
 * here depends on the server's timezone.
 */

export type ChallengeWeek = { number: number; days: string[] };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** A runaway date range is bad data; a year of weeks is far beyond any challenge. */
const MAX_WEEKS = 60;

export function addDays(day: string, n: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
}

export function mondayOf(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((dow + 6) % 7));
}

export function inChallenge(s: Pick<ChallengeScoring, "starts_on" | "ends_on">, day: string): boolean {
  return day >= s.starts_on && day <= s.ends_on;
}

/** Km sums are shown and compared to two places; floating point must not make 2.9999 out of 3. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * D378: Mon–Sun weeks, cut to the challenge's dates (Mileage's last week is Mon–Fri), numbered
 * from the week the EVENT starts in, so the EDM's "Week 2 to Week 10" falls out of the dates
 * rather than being typed in.
 */
export function challengeWeeks(s: Pick<ChallengeScoring, "starts_on" | "ends_on">, eventStartsOn: string | null): ChallengeWeek[] {
  const origin = mondayOf(eventStartsOn && eventStartsOn <= s.starts_on ? eventStartsOn : s.starts_on);
  const weeks: ChallengeWeek[] = [];
  for (let mon = mondayOf(s.starts_on); mon <= s.ends_on && weeks.length < MAX_WEEKS; mon = addDays(mon, 7)) {
    const days = Array.from({ length: 7 }, (_, k) => addDays(mon, k)).filter((d) => inChallenge(s, d));
    weeks.push({ number: Math.round(daysBetween(origin, mon) / 7) + 1, days });
  }
  return weeks;
}

export function weekFor(weeks: ChallengeWeek[], day: string): ChallengeWeek | null {
  return weeks.find((w) => w.days.includes(day)) ?? null;
}

/** "Week 2 · 5–11 Oct", or "Week 5 · 26 Oct – 1 Nov" when the week crosses a month. */
export function weekLabel(w: ChallengeWeek): string {
  const [first, last] = [w.days[0], w.days[w.days.length - 1]];
  const d = (s: string) => Number(s.slice(8, 10));
  const m = (s: string) => MONTHS[Number(s.slice(5, 7)) - 1];
  const range = m(first) === m(last) ? `${d(first)}–${d(last)} ${m(last)}` : `${d(first)} ${m(first)} – ${d(last)} ${m(last)}`;
  return `Week ${w.number} · ${range}`;
}

/** D377: the highest step at or below the total; steps are ascending (`parseSteps` makes sure). */
export function stepPoints(km: number, steps: DailyStep[]): number {
  let pts = 0;
  for (const s of steps) if (km >= s.at) pts = s.pts;
  return pts;
}

export function nextStep(km: number, steps: DailyStep[]): DailyStep | null {
  return steps.find((s) => km < s.at) ?? null;
}

const STEPS_HELP = "Write the points steps as km=points, separated by commas, like 1=1, 3=2, 5=4.";

export function parseSteps(text: string): DailyStep[] {
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  const steps = parts.map((p) => {
    const m = /^(\d+(?:\.\d+)?)\s*=\s*(\d+)$/.exec(p);
    if (!m) throw new Error(STEPS_HELP);
    return { at: Number(m[1]), pts: Number(m[2]) };
  });
  steps.forEach((s, i) => {
    if (i > 0 && s.at <= steps[i - 1].at) throw new Error("List the points steps smallest first, each km once.");
  });
  return steps;
}

export function stepsText(steps: DailyStep[] | undefined): string {
  return (steps ?? []).map((s) => `${s.at}=${s.pts}`).join(", ");
}

/**
 * The Setup tab's Scoring section (D372, D376). Null when it is switched off. Throws the
 * sentence the organiser reads. `questions` is the list being saved in the same post, so a
 * number question added in this very save can already be picked.
 */
export function readScoring(get: (key: string) => string | null, questions: RegistrationQuestion[]): ChallengeScoring | null {
  if (get("scoring_on") !== "on") return null;
  const val = (k: string) => get(k)?.trim() ?? "";
  const metric_key = val("scoring_metric");
  const metric = questions.find((q) => q.key === metric_key);
  if (!metric || metric.type !== "number") throw new Error("Pick the number question that holds the score.");
  const starts_on = val("scoring_starts_on"), ends_on = val("scoring_ends_on");
  if (!DAY.test(starts_on) || !DAY.test(ends_on)) throw new Error("Scoring needs a start and an end date.");
  if (ends_on < starts_on) throw new Error("The scoring end date is before its start date.");
  const daily_min = Number(val("scoring_daily_min"));
  if (!Number.isFinite(daily_min) || daily_min <= 0) throw new Error("The daily minimum must be a number above 0.");
  const daily_steps = parseSteps(val("scoring_steps"));
  const bonusRaw = val("scoring_team_bonus");
  const team_bonus = bonusRaw === "" ? null : Number(bonusRaw);
  if (team_bonus !== null && (!Number.isInteger(team_bonus) || team_bonus < 0)) throw new Error("The team bonus must be a whole number.");
  const podium = val("scoring_podium").split(",").map((p) => p.trim()).filter(Boolean).map(Number);
  if (podium.some((p) => !Number.isInteger(p) || p < 0)) throw new Error("Write the podium points as whole numbers, like 20, 12, 6.");
  return {
    metric_key, daily_min, starts_on, ends_on,
    ...(daily_steps.length ? { daily_steps } : {}),
    ...(team_bonus ? { team_bonus } : {}),
    ...(podium.length ? { podium } : {}),
  };
}
```

- [ ] **Step 5: Run them to confirm they pass**

Run: `npx vitest run tests/challenge.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing tests for `canSubmit`, `readGroupRule`, `capSummary` and `isGroupForm`**

In `tests/submissions.test.ts`, add `isGroupForm` to the import list, then append:

```ts
describe("members mode and challenge dates (D369, D373)", () => {
  const scoring = { metric_key: "km", daily_min: 1, starts_on: "2026-10-05", ends_on: "2026-12-04" };
  const mileage = form({ group_mode: "members", scoring });

  it("lets a team member submit as often as they like", () => {
    expect(canSubmit(mileage, [sub("2026-10-06"), sub("2026-10-06")], null, "2026-10-06", null, "g1"))
      .toEqual({ can: true, reason: "ok", used: 2 });
  });

  it("refuses someone with no team", () => {
    expect(canSubmit(mileage, [], null, "2026-10-06", null, null).reason).toBe("nogroup");
  });

  it("is closed before and after the challenge dates", () => {
    expect(canSubmit(mileage, [], null, "2026-10-04", null, "g1").reason).toBe("closed");
    expect(canSubmit(mileage, [], null, "2026-12-05", null, "g1").reason).toBe("closed");
  });

  it("reads and summarises the new mode", () => {
    expect(readGroupRule((k) => (k === "group_mode" ? "members" : null))).toEqual({ group_mode: "members", group_target: null });
    expect(capSummary(mileage)).toBe("Each member, counted by team");
  });

  it("only calls entries and everyone group forms", () => {
    expect(isGroupForm("entries")).toBe(true);
    expect(isGroupForm("everyone")).toBe(true);
    expect(isGroupForm("members")).toBe(false);
    expect(isGroupForm("off")).toBe(false);
  });
});
```

Also add `scoring: null,` to the `form()` fixture at the top of the file, if Step 1 didn't
already.

- [ ] **Step 7: Run them to confirm they fail**

Run: `npx vitest run tests/submissions.test.ts`
Expected: FAIL on the new block.

- [ ] **Step 8: Implement in `src/lib/submissions.ts`**

Add `import { inChallenge } from "@/lib/challenge";`.

Add near the top, after `liveSubmissions`:

```ts
/**
 * D369: the two modes where submitting is the GROUP's job (a target, or every member once).
 * `members` is not one of them: each person submits for themselves, and the team is only
 * stamped on the entry. Every "is this a group form" branch asks this, not `!== "off"`.
 */
export function isGroupForm(mode: GroupMode): boolean {
  return mode === "entries" || mode === "everyone";
}
```

Change `canSubmit`'s signature and its first lines:

```ts
export function canSubmit(
  activity: Activity,
  mine: ActivitySubmission[],
  category: string | null,
  today: string,
  group: GroupProgress | null = null,
  /** D369: the attendee's current team, for `members` mode. */
  teamId: string | null = null,
): SubmitState {
  const used = mine.length;
  if (!activity.is_open) return { can: false, reason: "closed", used };
  // D373: a scored challenge takes entries only on its own days - the same 'closed' submit_answers gives.
  if (activity.scoring && !inChallenge(activity.scoring, today)) return { can: false, reason: "closed", used };
  if (!categoryMatches(activity.categories, category)) return { can: false, reason: "ineligible", used };
  if (activity.group_mode === "members") {
    return teamId ? { can: true, reason: "ok", used } : { can: false, reason: "nogroup", used };
  }
  if (activity.group_mode !== "off") {
```

and leave the rest of the function as it is.

In `capSummary`, add before the `entries` line:
`if (activity.group_mode === "members") return "Each member, counted by team";`

In `readGroupRule`, add after the `everyone` line:
`if (mode === "members") return { group_mode: "members", group_target: null };`

- [ ] **Step 9: Run them to confirm they pass**

Run: `npx vitest run tests/submissions.test.ts tests/challenge.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/types.ts src/lib/challenge.ts src/lib/submissions.ts src/lib/db/activities.ts tests/challenge.test.ts tests/submissions.test.ts
git add -u tests
git commit -m "feat(mileage): challenge weeks, points steps and members-mode submit rules (D369, D372, D376, D378)"
```

---

### Task 4: Admin — "who submits", the Scoring section, and the group-form split (D369, D372)

**Files:**
- Modify: `src/components/admin/WhoSubmitsFields.tsx`
- Create: `src/components/admin/ScoringFields.tsx`
- Modify: `src/components/admin/ActivityRows.tsx` (`SubmissionFields`)
- Modify: `src/app/admin/events/[id]/activities/actions.ts` (`readSubmissionPolicy`)
- Modify: `src/app/admin/events/[id]/activities/[activityId]/page.tsx` (`SubmissionDetail`)
- Modify: `src/app/admin/events/[id]/activities/page.tsx` (line 55), `src/lib/activity-row.ts` (line 54), `src/app/admin/events/[id]/export/submissions.xlsx/route.ts` (line 71)

**Interfaces:**
- Consumes: `readScoring`, `stepsText` (Task 3); `isGroupForm` (Task 3).
- Produces: a saved `activities.scoring`, and a Setup tab that edits it.

- [ ] **Step 1: Add the fourth mode**

In `WhoSubmitsFields.tsx`, add to `MODES` after `everyone`:

```ts
  { value: "members", label: "Each member, counted by team", hint: "Every team member submits their own entries, as often as they like. Each entry counts for their team." },
```

The per-person fields stay under `mode === "off"` only, so `members` shows nothing extra.

- [ ] **Step 2: Create `src/components/admin/ScoringFields.tsx`**

```tsx
"use client";
import { useState } from "react";
import { stepsText } from "@/lib/challenge";
import type { Activity } from "@/lib/types";

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * D372/D376: the setting that makes this form a scored challenge, with its tracker page and
 * leaderboards. Off by default. The fields are not rendered while it is off, so a save never
 * reads stale scoring off an ordinary form. Only number questions that are already saved can
 * be picked; a question added in this same edit appears after the next save.
 */
export function ScoringFields({ activity }: { activity?: Activity }) {
  const s = activity?.scoring ?? null;
  const [on, setOn] = useState(s !== null);
  const numbers = (activity?.questions ?? []).filter((q) => q.type === "number");
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-extrabold">Scoring</legend>
      <label className="flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" name="scoring_on" checked={on} onChange={(e) => setOn(e.target.checked)} className="size-4" />
        Score this as a challenge
      </label>
      {on && (
        <>
          <label className="grid gap-1.5 text-sm"><span className="font-bold">Score question</span>
            <select name="scoring_metric" defaultValue={s?.metric_key ?? numbers[0]?.key ?? ""} className={input} required>
              {numbers.length === 0 && <option value="">Save a number question first</option>}
              {numbers.map((q) => <option key={q.key} value={q.key}>{q.label}</option>)}
            </select></label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1.5 text-sm"><span className="font-bold">Starts</span>
              <input type="date" name="scoring_starts_on" defaultValue={s?.starts_on ?? ""} className={input} required /></label>
            <label className="grid gap-1.5 text-sm"><span className="font-bold">Ends</span>
              <input type="date" name="scoring_ends_on" defaultValue={s?.ends_on ?? ""} className={input} required /></label>
            <label className="grid gap-1.5 text-sm"><span className="font-bold">Daily minimum</span>
              <input name="scoring_daily_min" inputMode="decimal" defaultValue={s?.daily_min ?? 1} className={`${input} tabular-nums`} required /></label>
          </div>
          <label className="grid gap-1.5 text-sm"><span className="font-bold">Daily points steps (optional)</span>
            <input name="scoring_steps" defaultValue={stepsText(s?.daily_steps)} placeholder="1=1, 3=2, 5=4, 8=6, 10=8" className={input} />
            <span className="text-xs text-muted-foreground">Total=points for a person&apos;s day, smallest first.</span></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm"><span className="font-bold">Weekly team bonus (optional)</span>
              <input name="scoring_team_bonus" inputMode="numeric" defaultValue={s?.team_bonus ?? ""} placeholder="20" className={`${input} tabular-nums`} />
              <span className="text-xs text-muted-foreground">When every member logs the daily minimum on every day of the week.</span></label>
            <label className="grid gap-1.5 text-sm"><span className="font-bold">Weekly podium points (optional)</span>
              <input name="scoring_podium" defaultValue={(s?.podium ?? []).join(", ")} placeholder="20, 12, 6" className={`${input} tabular-nums`} />
              <span className="text-xs text-muted-foreground">For the teams with the most total in the week, 1st first.</span></label>
          </div>
        </>
      )}
    </fieldset>
  );
}
```

- [ ] **Step 3: Render it in `SubmissionFields`**

In `src/components/admin/ActivityRows.tsx`, import `ScoringFields`, and render
`<ScoringFields activity={activity} />` right after `<WhoSubmitsFields activity={activity} />`.

- [ ] **Step 4: Read scoring on save**

In `actions.ts`, import `readScoring` from `@/lib/challenge` and `ChallengeScoring` from
`@/lib/types`. Extend `readSubmissionPolicy`'s return type to
`& { group_mode: GroupMode; group_target: number | null; scoring: ChallengeScoring | null }`.
After `const group = readGroupRule(...)`, add:

```ts
  // D372: read against the questions in this same post, so the score question can't be one being removed.
  const scoring = readScoring((k) => { const v = fd.get(k); return typeof v === "string" ? v : null; }, questions);
```

and add `scoring,` to the returned object. `createActivity` and `updateActivity` already spread
`policy`, and `NewActivity.scoring` exists from Task 3, so both persist it.

- [ ] **Step 5: Split "group form" from "has a team" on the admin pages**

Each `group_mode !== "off"` in the files below means "group form", so change it to
`isGroupForm(...)`, imported from `@/lib/submissions`:
- `src/app/admin/events/[id]/activities/page.tsx:55`: `a.group_mode === "off" ? null : …` becomes `!isGroupForm(a.group_mode) ? null : …`
- `src/lib/activity-row.ts:54`: `if (form.group_mode !== "off")` becomes `if (isGroupForm(form.group_mode))`
- `src/app/admin/events/[id]/export/submissions.xlsx/route.ts:71`: `f.group_mode !== "off"` becomes `isGroupForm(f.group_mode)`

Leave the export's line 55 (`"Deleted group"`) as `!== "off"`, because a `members` entry is
stamped too.

In `SubmissionDetail` (`[activityId]/page.tsx`), replace
`const grouped = activity.group_mode !== "off";` with:

```ts
  const grouped = isGroupForm(activity.group_mode);
  // D369: a members-mode entry carries its team, so the table shows it, but chasing stays per person.
  const teamed = activity.group_mode !== "off";
  // D373: a scored challenge is chased day by day, like a per-day form, and only among team members.
  const daily = activity.per_day || activity.scoring !== null;
  const chased = activity.group_mode === "members" ? attendees.filter((a) => a.group_id) : attendees;
```

Then make these changes in the same function:
- `const day = activity.per_day ? (requestedDay || today) : null;` becomes `const day = daily ? (requestedDay || today) : null;`
- In the `missingFrom(...)` call, `attendees.map((a) => a.id)` becomes `chased.map((a) => a.id)`.
- `const drifting = activity.per_day ? participation(... attendees.map((a) => a.id) ...)` becomes `daily ? participation(... chased.map((a) => a.id) ...)`.
- `activityTabs("submission", { …, perDay: activity.per_day, grouped })` becomes `perDay: daily`.
- The `SubmissionTable`'s `groupFor={grouped ? …}` becomes `groupFor={teamed ? …}`.

- [ ] **Step 6: Type-check and run the related tests**

Run: `npx tsc --noEmit && npx vitest run tests/activity-row.test.ts tests/activity-tabs.test.ts tests/submissions.test.ts tests/groups.test.ts`
Expected: PASS.

- [ ] **Step 7: Check it in the browser on the test event**

Start the dev server with `preview_start {name: "dev"}`. Sign in as the user's admin session (if
the pane isn't signed in, ask the user to sign in), and open the `ecpkom` event's Activities.
Add a submission called "ZZ Mileage test" with these questions:
- `method`: Choice "Watch / phone GPS — synced to Strava" / "Treadmill — logged manually on Strava", required
- `km`: Number, required, smallest 1, largest 50, decimal places 2
- `strava`: File, required
- `treadmill`: File, required, show only when method contains "Treadmill"
- `timestamp`: File, required, show only when method contains "Treadmill"

Set Who submits to "Each member, counted by team" and save. Then tick Scoring and set: score
question Distance (km), starts today, ends today + 60 days, daily minimum 1, steps
`1=1, 3=2, 5=4, 8=6, 10=8`, bonus 20, podium `20, 12, 6`. Save again.

Use `execute_sql` to confirm the row's `scoring` and `group_mode = 'members'`. Expected: the toast
says "Submission saved.", and the Setup tab shows the settings again after a reload.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/WhoSubmitsFields.tsx src/components/admin/ScoringFields.tsx src/components/admin/ActivityRows.tsx "src/app/admin/events/[id]/activities/actions.ts" "src/app/admin/events/[id]/activities/[activityId]/page.tsx" "src/app/admin/events/[id]/activities/page.tsx" src/lib/activity-row.ts "src/app/admin/events/[id]/export/submissions.xlsx/route.ts"
git commit -m "feat(mileage): Scoring section and each-member-by-team mode in admin Setup (D369, D372)"
```

---

### Task 5: Tracker data — `src/lib/tracker.ts` (D374)

**Files:**
- Create: `src/lib/tracker.ts`
- Modify: `src/lib/db/activities.ts` (add `entriesForAttendee`)
- Modify: `src/lib/portal-activity-entries.ts` (pass `teamId`)
- Test: `tests/tracker.test.ts` (create)

**Interfaces:**
- Consumes: `challengeWeeks`, `weekFor`, `stepPoints`, `nextStep`, `inChallenge`, `addDays`, `round2` (Task 3).
- Produces:
  - `type DayState = "logged" | "today" | "missed" | "future"`
  - `type TrackerDay = { day: string; label: string; state: DayState; logged: boolean }`
  - `type Tracker = { week: ChallengeWeek; prev: string | null; next: string | null; days: TrackerDay[]; selected: string; isToday: boolean; km: number; pts: number | null; goal: { at: number; pts: number; gap: number } | null; marks: number[]; full: number; streak: number; weekPts: number | null; entries: ActivitySubmission[] }`
  - `metricKm(s, key): number`
  - `dailyKm(entries, key): Map<string, number>`, counting live rows only
  - `buildTracker({ scoring, eventStartsOn, entries, today, requested }): Tracker | null`
  - `entriesForAttendee(activityId, attendeeId): Promise<ActivitySubmission[]>`, including revoked rows

- [ ] **Step 1: Write the failing tests**

Create `tests/tracker.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildTracker, dailyKm } from "@/lib/tracker";
import type { ActivitySubmission, ChallengeScoring } from "@/lib/types";

const S: ChallengeScoring = {
  metric_key: "km", daily_min: 1, starts_on: "2026-10-05", ends_on: "2026-12-04",
  daily_steps: [{ at: 1, pts: 1 }, { at: 3, pts: 2 }, { at: 5, pts: 4 }, { at: 8, pts: 6 }, { at: 10, pts: 8 }],
};
let n = 0;
const e = (day: string, km: string, over: Partial<ActivitySubmission> = {}): ActivitySubmission => ({
  id: `s${++n}`, event_id: "e", activity_id: "m", attendee_id: "a1", group_id: "g1", answers: { km },
  // A zero-padded counter, so created_at sorts in the order the fixtures were made.
  submitted_on: day, status: "submitted", per_day: false, created_at: `${day}T00:00:00.${String(n).padStart(6, "0")}Z`,
  revoked_at: null, revoked_by: null, edited_at: null, edited_by: null, ...over,
});
const build = (entries: ActivitySubmission[], today: string, requested: string | null = null) =>
  buildTracker({ scoring: S, eventStartsOn: "2026-09-28", entries, today, requested })!;

describe("dailyKm", () => {
  it("sums live entries per day and ignores revoked ones", () => {
    const m = dailyKm([e("2026-10-06", "3"), e("2026-10-06", "3.2"), e("2026-10-06", "9", { status: "revoked" })], "km");
    expect(m.get("2026-10-06")).toBe(6.2);
  });
});

describe("buildTracker (D374)", () => {
  it("draws the week strip states", () => {
    const t = build([e("2026-10-05", "2"), e("2026-10-07", "0.5"), e("2026-10-08", "1")], "2026-10-08");
    expect(t.week.number).toBe(2);
    expect(t.days.map((d) => d.state)).toEqual(["logged", "missed", "missed", "today", "future", "future", "future"]);
    expect(t.days[3].logged).toBe(true);
    expect(t.days.map((d) => d.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });

  it("shows today's km, points and the next goal", () => {
    const t = build([e("2026-10-06", "3"), e("2026-10-06", "1.2")], "2026-10-06");
    expect(t.km).toBe(4.2);
    expect(t.pts).toBe(2);
    expect(t.goal).toEqual({ at: 5, pts: 4, gap: 0.8 });
    expect(t.marks).toEqual([1, 3, 5, 8, 10]);
    expect(t.full).toBe(10);
  });

  it("has no goal once the top step is reached", () => {
    expect(build([e("2026-10-06", "12")], "2026-10-06").goal).toBeNull();
  });

  it("counts the streak back from today, or from yesterday while today is not logged yet", () => {
    const entries = [e("2026-10-05", "1"), e("2026-10-06", "1"), e("2026-10-07", "1")];
    expect(build(entries, "2026-10-07").streak).toBe(3);
    expect(build(entries, "2026-10-08").streak).toBe(3);
    expect(build(entries, "2026-10-09").streak).toBe(0);
  });

  it("adds up this week's points to today", () => {
    expect(build([e("2026-10-05", "6"), e("2026-10-06", "3")], "2026-10-06").weekPts).toBe(6);
  });

  it("opens a requested day, with that day's entries oldest first, revoked ones included", () => {
    const t = build([e("2026-10-05", "2"), e("2026-10-05", "4", { status: "revoked" }), e("2026-10-06", "1")], "2026-10-06", "2026-10-05");
    expect(t.selected).toBe("2026-10-05");
    expect(t.isToday).toBe(false);
    expect(t.km).toBe(2);
    expect(t.entries.map((x) => x.answers.km)).toEqual(["2", "4"]);
  });

  it("clamps a day outside the challenge, and ignores junk", () => {
    expect(build([], "2026-10-02").selected).toBe("2026-10-05");
    expect(build([], "2026-12-20").selected).toBe("2026-12-04");
    expect(build([], "2026-10-06", "nonsense").selected).toBe("2026-10-06");
  });

  it("links to the previous week, and to the next one only once it has started", () => {
    const t = build([], "2026-10-13");
    expect(t.week.number).toBe(3);
    expect(t.prev).toBe("2026-10-05");
    expect(t.next).toBeNull();
    expect(build([], "2026-10-13", "2026-10-05").next).toBe("2026-10-12");
  });

  it("shows only Mon–Fri in the last week", () => {
    expect(build([], "2026-12-02").days.map((d) => d.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  });

  it("works without points steps: the ring marks the daily minimum and points are hidden", () => {
    const t = buildTracker({ scoring: { ...S, daily_steps: undefined }, eventStartsOn: null, entries: [e("2026-10-06", "0.5")], today: "2026-10-06", requested: null })!;
    expect(t.pts).toBeNull();
    expect(t.weekPts).toBeNull();
    expect(t.marks).toEqual([1]);
    expect(t.goal).toEqual({ at: 1, pts: 0, gap: 0.5 });
  });
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `npx vitest run tests/tracker.test.ts`
Expected: FAIL, because the module isn't found.

- [ ] **Step 3: Implement `src/lib/tracker.ts`**

```ts
import { addDays, challengeWeeks, inChallenge, nextStep, round2, stepPoints, weekFor, type ChallengeWeek } from "@/lib/challenge";
import type { ActivitySubmission, ChallengeScoring } from "@/lib/types";

/**
 * Everything the attendee's tracker page draws (D374), from their own entries alone. Pure;
 * the page fetches, this decides. Team points are Phase 2's `scoreChallenge`, not this.
 */

export type DayState = "logged" | "today" | "missed" | "future";
export type TrackerDay = { day: string; label: string; state: DayState; logged: boolean };
export type Tracker = {
  week: ChallengeWeek;
  /** First day of the previous / next week to link to; null at the ends, and for a week not yet begun. */
  prev: string | null;
  next: string | null;
  days: TrackerDay[];
  selected: string;
  isToday: boolean;
  /** The selected day's live total. */
  km: number;
  /** Null when the challenge has no points steps. */
  pts: number | null;
  goal: { at: number; pts: number; gap: number } | null;
  /** Where the ring's ticks go, and the total that fills it. */
  marks: number[];
  full: number;
  streak: number;
  weekPts: number | null;
  /** The selected day's entries, oldest first, revoked ones included so the attendee sees what was removed. */
  entries: ActivitySubmission[];
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function metricKm(s: Pick<ActivitySubmission, "answers">, key: string): number {
  const n = Number(s.answers[key]);
  return Number.isFinite(n) ? n : 0;
}

/** Live entries only (D339): a revoked workout never counts toward a day. */
export function dailyKm(entries: Pick<ActivitySubmission, "answers" | "status" | "submitted_on">[], key: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of entries) {
    if (s.status !== "submitted") continue;
    m.set(s.submitted_on, round2((m.get(s.submitted_on) ?? 0) + metricKm(s, key)));
  }
  return m;
}

export function buildTracker(input: {
  scoring: ChallengeScoring;
  eventStartsOn: string | null;
  entries: ActivitySubmission[];
  today: string;
  requested: string | null;
}): Tracker | null {
  const { scoring, entries, today } = input;
  const weeks = challengeWeeks(scoring, input.eventStartsOn);
  if (weeks.length === 0) return null;
  const first = weeks[0].days[0];
  const last = weeks[weeks.length - 1].days[weeks[weeks.length - 1].days.length - 1];
  const clamp = (d: string) => (d < first ? first : d > last ? last : d);
  const selected = clamp(input.requested && DAY.test(input.requested) ? input.requested : today);
  const week = weekFor(weeks, selected)!;
  const i = weeks.indexOf(week);

  const km = dailyKm(entries, scoring.metric_key);
  const logged = (d: string) => (km.get(d) ?? 0) >= scoring.daily_min;
  const days = week.days.map((day): TrackerDay => ({
    day,
    label: WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()],
    logged: logged(day),
    state: day === today ? "today" : day < today ? (logged(day) ? "logged" : "missed") : "future",
  }));

  const steps = scoring.daily_steps ?? [];
  const selKm = km.get(selected) ?? 0;
  const step = steps.length ? nextStep(selKm, steps) : selKm < scoring.daily_min ? { at: scoring.daily_min, pts: 0 } : null;
  const marks = steps.length ? steps.map((s) => s.at) : [scoring.daily_min];

  // D374: the streak ends today, or yesterday while today is still to be logged - an evening
  // walker should not see their streak read 0 every morning.
  let streak = 0;
  for (let d = logged(today) ? today : addDays(today, -1); inChallenge(scoring, d) && logged(d); d = addDays(d, -1)) streak++;

  return {
    week,
    prev: i > 0 ? weeks[i - 1].days[0] : null,
    next: i < weeks.length - 1 && weeks[i + 1].days[0] <= today ? weeks[i + 1].days[0] : null,
    days,
    selected,
    isToday: selected === today,
    km: selKm,
    pts: steps.length ? stepPoints(selKm, steps) : null,
    goal: step ? { at: step.at, pts: step.pts, gap: round2(step.at - selKm) } : null,
    marks,
    full: marks[marks.length - 1],
    streak,
    weekPts: steps.length ? week.days.filter((d) => d <= today).reduce((t, d) => t + stepPoints(km.get(d) ?? 0, steps), 0) : null,
    entries: entries.filter((s) => s.submitted_on === selected).sort((a, b) => a.created_at.localeCompare(b.created_at)),
  };
}
```

- [ ] **Step 4: Run them to confirm they pass**

Run: `npx vitest run tests/tracker.test.ts`
Expected: PASS.

- [ ] **Step 5: Add `entriesForAttendee` to `src/lib/db/activities.ts`**

Add it after `submissionsForAttendee`:

```ts
/**
 * D374: one attendee's entries to one scored activity, revoked ones INCLUDED - the tracker shows a
 * removed workout faded with "Removed by the organiser", where `submissionsForAttendee` hides it.
 */
export async function entriesForAttendee(activityId: string, attendeeId: string): Promise<ActivitySubmission[]> {
  const { data, error } = await serviceClient().from("activity_submissions").select("*")
    .eq("activity_id", activityId).eq("attendee_id", attendeeId).order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ActivitySubmission[];
}
```

- [ ] **Step 6: Pass the team to `canSubmit` in the portal loader**

In `src/lib/portal-activity-entries.ts`, import `isGroupForm` from `@/lib/submissions`, then:
- `const hasGroupForm = … a.group_mode !== "off");` becomes `… isGroupForm(a.group_mode));`
- `const group = form.group_mode !== "off" && attendee.group_id ? groupProgress(…) : null;` becomes `isGroupForm(form.group_mode) && attendee.group_id ? groupProgress(…) : null;`
- `canSubmit(form, sent, attendee.category, today, group)` becomes `canSubmit(form, sent, attendee.category, today, group, attendee.group_id)`

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc --noEmit && npx vitest run tests/tracker.test.ts tests/submissions.test.ts`
Expected: PASS.

```bash
git add src/lib/tracker.ts src/lib/db/activities.ts src/lib/portal-activity-entries.ts tests/tracker.test.ts
git commit -m "feat(mileage): tracker data - week strip, ring, streak, the day's entries (D374)"
```

---

### Task 6: Tracker page in the portal (D374)

**Files:**
- Create: `src/components/portal/tracker/WeekStrip.tsx`, `DayRing.tsx`, `EntryTimeline.tsx`, `EntryPhotos.tsx`
- Modify: `src/app/e/[slug]/a/[token]/activities/[activityId]/page.tsx`

**Interfaces:**
- Consumes: `buildTracker`, `Tracker`, `metricKm` (Task 5); `weekLabel` (Task 3); `entriesForAttendee` (Task 5); `signedSubmissionUrl` from `@/lib/db/media`; `ActivityActionDialog`; `SubmissionFields`; `submitAnswersAction`.
- Produces: the page shows `TrackerBody` whenever `form.scoring` is set. The URL takes `?day=YYYY-MM-DD`.

Design note: this page takes its purpose from the user's reference mock-up, not its pixels. Use
ECP Hub's tokens and components (`bg-success-soft`, `text-success-strong`, `bg-muted`, `Card`,
`rounded-xl`). Don't add new colours. Every control needs a tap target of at least 44 px. Before
finishing, check it at 375 px wide and in dark mode.

- [ ] **Step 1: Read the Next 16 docs for `searchParams` and `Link`**

Read the App Router page guide in `node_modules/next/dist/docs/` (search it for `searchParams`).
The existing page already awaits `searchParams` as a Promise. Follow that.

- [ ] **Step 2: Create `WeekStrip.tsx`**

```tsx
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Flame, X } from "lucide-react";
import { weekLabel } from "@/lib/challenge";
import type { Tracker } from "@/lib/tracker";

/**
 * D374: the day picker and the week as chips - the team bonus at a glance, since one missed day
 * sinks it. Links, not state: a day is a URL (`?day=`), so Back works and the server draws it.
 */
export function WeekStrip({ t, href }: { t: Tracker; href: (day: string) => string }) {
  const nav = "flex size-11 items-center justify-center rounded-full bg-muted text-foreground disabled:opacity-40";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        {t.prev ? <Link href={href(t.prev)} aria-label="Previous week" className={nav}><ChevronLeft className="size-5" /></Link> : <span className="size-11" />}
        <div className="text-center">
          <div className="text-base font-extrabold">{t.isToday ? "Today" : shortDay(t.selected)}</div>
          <div className="text-xs text-muted-foreground">{weekLabel(t.week)}</div>
        </div>
        {t.next ? <Link href={href(t.next)} aria-label="Next week" className={nav}><ChevronRight className="size-5" /></Link> : <span className="size-11" />}
      </div>
      <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${t.days.length}, minmax(0, 1fr))` }}>
        {t.days.map((d) => {
          const selected = d.day === t.selected;
          return (
            <li key={d.day}>
              <Link
                href={href(d.day)}
                aria-current={selected ? "date" : undefined}
                aria-label={`${d.label} ${shortDay(d.day)}: ${d.state === "future" ? "to come" : d.logged ? "logged" : d.state === "today" ? "not logged yet" : "missed"}`}
                className={`flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border text-xs font-bold ${selected ? "border-primary bg-primary/5" : "border-border bg-card"}`}
              >
                <span className="text-muted-foreground">{d.label}</span>
                <DayMark state={d.state} logged={d.logged} />
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function DayMark({ state, logged }: { state: Tracker["days"][number]["state"]; logged: boolean }) {
  const dot = "flex size-7 items-center justify-center rounded-full";
  if (state === "today") return <span className={`${dot} ${logged ? "bg-success-soft text-success-strong" : "bg-primary/10 text-primary"}`}><Flame className="size-4" /></span>;
  if (state === "logged") return <span className={`${dot} bg-success-soft text-success-strong`}><Check className="size-4" /></span>;
  if (state === "missed") return <span className={`${dot} bg-muted text-muted-foreground/60`}><X className="size-4" /></span>;
  return <span className={`${dot} bg-muted`} />;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDay(day: string): string {
  return `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
}
```

- [ ] **Step 3: Create `DayRing.tsx`**

```tsx
import { Flame, Trophy } from "lucide-react";
import type { Tracker } from "@/lib/tracker";

const R = 52, C = 2 * Math.PI * R;

/** D374: the day's km against the points steps, the next goal in words, the streak and the week. */
export function DayRing({ t, unit = "km" }: { t: Tracker; unit?: string }) {
  const filled = Math.min(t.km / t.full, 1);
  const angle = (at: number) => (Math.min(at / t.full, 1) * 360 - 90) * (Math.PI / 180);
  return (
    <section className="flex items-center gap-4 rounded-2xl border border-success/30 bg-success-soft p-4">
      <svg viewBox="0 0 120 120" className="size-28 shrink-0" role="img" aria-label={`${t.km} ${unit} of ${t.full}`}>
        <circle cx="60" cy="60" r={R} fill="none" strokeWidth="10" className="stroke-success/15" />
        <circle cx="60" cy="60" r={R} fill="none" strokeWidth="10" strokeLinecap="round" className="stroke-success-strong"
          strokeDasharray={C} strokeDashoffset={C * (1 - filled)} transform="rotate(-90 60 60)" />
        {t.marks.map((m) => (
          <circle key={m} cx={60 + R * Math.cos(angle(m))} cy={60 + R * Math.sin(angle(m))} r="2.5"
            className={t.km >= m ? "fill-white" : "fill-success-strong/40"} />
        ))}
        <text x="60" y="58" textAnchor="middle" className="fill-foreground text-[26px] font-extrabold tabular-nums">{t.km}</text>
        <text x="60" y="78" textAnchor="middle" className="fill-muted-foreground text-[12px] font-bold">{unit}</text>
      </svg>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="text-lg font-extrabold leading-tight text-success-strong">
          {t.km} {unit} {t.isToday ? "today" : ""}{t.pts !== null ? ` · ${t.pts} pt${t.pts === 1 ? "" : "s"}` : ""}
        </div>
        <div className="text-sm text-foreground/80">
          {t.goal
            ? t.goal.pts > 0 ? `${t.goal.gap} ${unit} more for ${t.goal.pts} pts` : `${t.goal.gap} ${unit} more to log the day`
            : t.pts !== null ? "Top score reached" : "Day logged"}
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1 text-xs font-bold">
          <span className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-1"><Flame className="size-3.5" />{t.streak} day{t.streak === 1 ? "" : "s"} in a row</span>
          {t.weekPts !== null && <span className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-1"><Trophy className="size-3.5" />This week · {t.weekPts} pts</span>}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Create `EntryPhotos.tsx` (a client dialog behind the ⋯ button)**

```tsx
"use client";
import { MoreHorizontal } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** D374: an entry's ⋯ offers its photos only - attendees cannot edit or delete (D368). */
export function EntryPhotos({ title, photos }: { title: string; photos: { label: string; url: string | null }[] }) {
  return (
    <Dialog>
      <DialogTrigger render={<button type="button" aria-label={`View photos for ${title}`} className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" />}>
        <MoreHorizontal className="size-5" />
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogTitle className="text-lg font-extrabold">{title}</DialogTitle>
        <div className="flex flex-col gap-4">
          {photos.map((p) => (
            <figure key={p.label} className="flex flex-col gap-1.5">
              <figcaption className="text-sm font-bold">{p.label}</figcaption>
              {p.url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={p.url} alt={p.label} className="w-full rounded-lg border border-border" />
                : <span className="text-sm text-muted-foreground">Unavailable</span>}
            </figure>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Create `EntryTimeline.tsx` (a server component)**

```tsx
import { Footprints } from "lucide-react";
import { signedSubmissionUrl } from "@/lib/db/media";
import { metricKm } from "@/lib/tracker";
import { MY_TZ } from "@/lib/time";
import type { ActivitySubmission, RegistrationQuestion } from "@/lib/types";
import { EntryPhotos } from "./EntryPhotos";

const time = new Intl.DateTimeFormat("en-MY", { timeZone: MY_TZ, hour: "numeric", minute: "2-digit" });

/**
 * D374: the selected day's workouts, oldest first. Each line shows its time, km, the first
 * choice answered (how it was recorded) and the first photo as a thumbnail. A revoked entry
 * stays, faded and not counted (D339), so the attendee can see why their total dropped.
 */
export async function EntryTimeline({ entries, questions, metricKey, unit = "km", empty }: {
  entries: ActivitySubmission[];
  questions: RegistrationQuestion[];
  metricKey: string;
  unit?: string;
  empty: string;
}) {
  if (entries.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  const files = questions.filter((q) => q.type === "file");
  const choice = questions.find((q) => q.type === "select");
  return (
    <ol className="flex flex-col">
      {await Promise.all(entries.map(async (s, i) => {
        const revoked = s.status === "revoked";
        const photos = await Promise.all(files.filter((q) => s.answers[q.key]).map(async (q) => ({ label: q.label, url: await signedSubmissionUrl(s.answers[q.key]) })));
        const at = time.format(new Date(s.created_at));
        return (
          <li key={s.id} className={`relative flex gap-3 py-3 ${revoked ? "opacity-50" : ""}`}>
            {i < entries.length - 1 && <span aria-hidden className="absolute left-[21px] top-14 bottom-0 border-l-2 border-dashed border-border" />}
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Footprints className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="font-extrabold tabular-nums">{metricKm(s, metricKey)} {unit}</div>
              {choice && s.answers[choice.key] && <div className="truncate text-sm text-muted-foreground">{s.answers[choice.key]}</div>}
              <div className="text-xs text-muted-foreground">{at}{revoked ? " · Removed by the organiser" : s.edited_at ? " · Updated by the organiser" : ""}</div>
            </div>
            {photos[0]?.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photos[0].url} alt="" className="size-12 shrink-0 rounded-lg border border-border object-cover" />
            )}
            {photos.length > 0 && <EntryPhotos title={`${metricKm(s, metricKey)} ${unit} at ${at}`} photos={photos} />}
          </li>
        );
      }))}
    </ol>
  );
}
```

- [ ] **Step 6: Wire `TrackerBody` into the activity page**

In `src/app/e/[slug]/a/[token]/activities/[activityId]/page.tsx`:
- Widen `searchParams` to `Promise<{ new?: string; day?: string }>` and read `day`.
- Load the event's `starts_on`. `loadPortalAttendee` returns `event`; check that it carries
  `starts_on`, and add it to that function's select if it doesn't.
- In the body switch, render `TrackerBody` for a submission whose `scoring` is set:

```tsx
        : form
          ? form.form.scoring
            ? <TrackerBody entry={form} slug={slug} token={token} attendeeId={attendee.id} eventStartsOn={event.starts_on} day={day ?? null} />
            : <SubmissionBody … unchanged … />
```

Add the component:

```tsx
/**
 * D374: a scored challenge's page - week strip, ring, the day's workouts, and "Add a new entry".
 * Phase 2 adds My team and the team table below the entries.
 */
async function TrackerBody({ entry: { form: f, state }, slug, token, attendeeId, eventStartsOn, day }: {
  entry: SubmissionEntry; slug: string; token: string; attendeeId: string; eventStartsOn: string | null; day: string | null;
}) {
  const scoring = f.scoring!;
  const today = nowInKL().date;
  const t = buildTracker({ scoring, eventStartsOn, entries: await entriesForAttendee(f.id, attendeeId), today, requested: day });
  const path = `/e/${slug}/a/${token}/activities/${f.id}`;
  if (!t) return <p className={note}>This challenge has no days set yet.</p>;
  return (
    <>
      <RichSections html={f.description} />
      <section className={`${block} flex flex-col gap-4`}>
        <WeekStrip t={t} href={(d) => (d === today ? path : `${path}?day=${d}`)} />
        <DayRing t={t} />
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-extrabold">{t.isToday ? "Today's entries" : "Entries"}</h2>
          <span className="text-xs text-muted-foreground">{t.entries.filter((e) => e.status === "submitted").length} workout{t.entries.filter((e) => e.status === "submitted").length === 1 ? "" : "s"}</span>
        </div>
        <EntryTimeline entries={t.entries} questions={f.questions} metricKey={scoring.metric_key}
          empty={t.isToday ? "Nothing logged yet today." : "Nothing logged this day."} />
        {state.reason === "nogroup" && <p className={note}>You&apos;re not in a team for this challenge.</p>}
        {state.reason === "closed" && <p className={note}>{today < scoring.starts_on ? "The challenge hasn't started yet." : "Entries for this are closed."}</p>}
      </section>
      {state.can && (
        <ActivityActionDialog key={t.entries.length} label="Add a new entry" title={f.name}>
          <form action={submitAnswersAction.bind(null, slug, token, f.id)} className="flex flex-col gap-6">
            <SubmissionFields questions={f.questions} />
            <SubmitButton className="h-12 w-full text-base font-bold">Submit</SubmitButton>
          </form>
        </ActivityActionDialog>
      )}
    </>
  );
}
```

Imports to add: `nowInKL` from `@/lib/time`, `buildTracker` from `@/lib/tracker`,
`entriesForAttendee` from `@/lib/db/activities`, and `WeekStrip`, `DayRing` and `EntryTimeline`
from `@/components/portal/tracker/…`.

`submitAnswersAction` redirects back to `path` with no `?day`, so after a submit the attendee
lands on today with the new entry showing. The `key` changes, so the dialog remounts closed.

- [ ] **Step 7: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/components/portal/tracker "src/app/e/[slug]/a/[token]/activities/[activityId]/page.tsx"`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/portal/tracker "src/app/e/[slug]/a/[token]/activities/[activityId]/page.tsx"
git commit -m "feat(mileage): tracker page - week strip, km ring, entries timeline, add entry (D374)"
```

---

### Task 7: Phase 1 browser check and go-live

**Files:** none, unless a defect is found. Fix it in the task's own files and commit it as `fix(mileage): …`.

- [ ] **Step 1: Run the full suite**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: everything passes.

- [ ] **Step 2: Browser run on the test event (`ecpkom`, the "ZZ Mileage test" activity from Task 4)**

Pick a ZZ test attendee in a group, and one with no group. Use `execute_sql` to find their
`/a/<token>` links:

```sql
select a.name, a.token, a.group_id from attendees a join events e on e.id = a.event_id
 where e.slug = 'ecpkom' and a.name ilike 'zz%' order by a.group_id nulls last limit 5;
```

The column may not be called `token`. If not, look at `src/lib/tokens.ts` for how the link is
built. Then, in the browser pane at 375 px wide (`resize_window` preset mobile):
1. Open the activity as the grouped attendee. Expect the week strip with today highlighted, a ring
   at 0 km, "1 km more to log the day", and an "Add a new entry" button.
2. Add an entry: Watch, 3.2 km, any small image as the Strava screenshot. Expect a toast saying
   "Submitted. Thanks!", the ring at 3.2 km · 2 pts, "1.8 km more for 4 pts", and one timeline
   line with a thumbnail. ⋯ opens the photo.
3. Add a second entry: Treadmill. The two treadmill photo fields appear. Enter 0.8 km. Expect it
   refused with "Distance (km) must be at least 1", and nothing saved.
4. Submit the treadmill entry properly at 2 km. Expect 5.2 km · 4 pts and a flame on today's chip.
5. As admin, revoke the 2 km entry. Back on the portal, expect it faded with "Removed by the
   organiser" and the ring back at 3.2 km.
6. Open the attendee with no group. Expect "You're not in a team for this challenge." and no add
   button.
7. On the admin Submissions tab, expect the Team column to be filled in. The Not submitted tab
   shows today's missing team members only.
8. Switch to dark mode (`resize_window colorScheme: dark`) and take a screenshot. Check the ring
   and chips stay readable.

Take a screenshot after steps 2 and 4 to show the user.

- [ ] **Step 3: Push**

```bash
git pull --rebase && git push
```

Wait for the Vercel deploy of `main` to finish. Ask the user to confirm, or check
`https://ecphub.vercel.app` responds with the new build.

- [ ] **Step 4: Go-live in `ecphub`, only after the user says yes in chat**

Ask the user: "Create the Project Mileage activity in ecphub now, with the D371 questions and
scoring 5 Oct – 4 Dec?" Once they say yes, in the admin UI for `ecphub`:
- **Create the activity:**
  - Name "Project Mileage 🏃", with the EDM rules as its description.
  - Who submits: "Each member, counted by team".
  - Questions as in Task 4 Step 7.
  - Scoring:
    - score question: Distance (km)
    - starts 2026-10-05, ends 2026-12-04, daily minimum 1
    - steps `1=1, 3=2, 5=4, 8=6, 10=8`, bonus 20, podium `20, 12, 6`
- **Open it:** set it open. It refuses entries until 5 Oct anyway, because of the challenge dates.
- **Check one real attendee's page:** open the portal page as one real `ecphub` team member, read
  it only, and don't submit. Expect "The challenge hasn't started yet." before 5 Oct.

- [ ] **Step 5: Tell the user Phase 1 is live, and record it in memory**

Update `project-mileage.md` in the memory folder: Phase 1 is live, plus the activity's id.

---

# Phase 2 — by Sun 11 Oct

### Task 8: Migration — daily totals and disqualifications (D375, D380)

**Files:**
- Create: `supabase/migrations/0058_challenge_scores.sql`

**Interfaces:**
- Produces:
  - Table `challenge_disqualifications(id, event_id, activity_id, attendee_id, reason, created_by, created_at)`, unique on `(activity_id, attendee_id)`.
  - Function `challenge_daily_totals(p_activity_id uuid) returns table (attendee_id uuid, group_id uuid, day date, km numeric)`.

- [ ] **Step 1: Write the migration**

```sql
-- D375: the one read scoring needs - live km per person, team and day, inside the challenge
-- dates. Summed in Postgres so the app gets ~7,400 small rows, not every entry's answers.
-- D380: disqualifications, one row per person per challenge; Undo deletes the row.

create table challenge_disqualifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (activity_id, attendee_id)
);
alter table challenge_disqualifications enable row level security;

create or replace function challenge_daily_totals(p_activity_id uuid)
returns table (attendee_id uuid, group_id uuid, day date, km numeric)
language sql
stable
as $$
  select s.attendee_id, s.group_id, s.submitted_on,
         sum(case when s.answers->>(a.scoring->>'metric_key') ~ '^\d+(\.\d+)?$'
                  then (s.answers->>(a.scoring->>'metric_key'))::numeric else 0 end)
    from activity_submissions s
    join activities a on a.id = s.activity_id
   where s.activity_id = p_activity_id
     and s.status = 'submitted'
     and a.scoring is not null
     and s.submitted_on between (a.scoring->>'starts_on')::date and (a.scoring->>'ends_on')::date
   group by s.attendee_id, s.group_id, s.submitted_on
$$;

revoke execute on function challenge_daily_totals(uuid) from public, anon, authenticated;
grant execute on function challenge_daily_totals(uuid) to service_role;
```

- [ ] **Step 2: Apply it and check it**

Use `apply_migration` with name `0058_challenge_scores`. Then run, with `execute_sql`:
`select * from challenge_daily_totals('<ZZ Mileage test activity id>');`
Expected: one row per (attendee, team, day) from the Task 7 test entries, with the revoked 2 km
left out.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0058_challenge_scores.sql
git commit -m "feat(mileage): daily totals function and disqualifications table (D375, D380)"
```

---

### Task 9: `scoreChallenge` — the three tiers (D375, D377, D380)

**Files:**
- Create: `src/lib/challenge-score.ts`
- Test: `tests/challenge-score.test.ts` (create)

**Interfaces:**
- Consumes: `ChallengeWeek`, `stepPoints`, `round2` (Task 3); `ChallengeScoring`.
- Produces:
  - `type DailyTotal = { attendeeId: string; groupId: string | null; day: string; km: number }`
  - `type Team = { id: string; name: string; memberIds: string[] }`
  - `type TeamWeek = { km: number; tier1: number; bonus: number; podium: number; onTrack: number; members: number }`
  - `type WeekResult = { week: ChallengeWeek; ended: boolean; teams: Record<string, TeamWeek> }`
  - `type Standing = { id: string; name: string; km: number; tier1: number; bonus: number; podium: number; total: number; void: boolean; rank: number | null }`
  - `type ChallengeScore = { weeks: WeekResult[]; standings: Standing[]; personKm: (attendeeId: string, day: string) => number }`
  - `scoreChallenge(input: { totals: DailyTotal[]; teams: Team[]; disqualified: Set<string>; scoring: ChallengeScoring; weeks: ChallengeWeek[]; today: string }): ChallengeScore`

- [ ] **Step 1: Write the failing tests**

Create `tests/challenge-score.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scoreChallenge, type DailyTotal, type Team } from "@/lib/challenge-score";
import { challengeWeeks } from "@/lib/challenge";
import type { ChallengeScoring } from "@/lib/types";

const S: ChallengeScoring = {
  metric_key: "km", daily_min: 1, starts_on: "2026-10-05", ends_on: "2026-12-04",
  daily_steps: [{ at: 1, pts: 1 }, { at: 3, pts: 2 }, { at: 5, pts: 4 }, { at: 8, pts: 6 }, { at: 10, pts: 8 }],
  team_bonus: 20, podium: [20, 12, 6],
};
const WEEKS = challengeWeeks(S, "2026-09-28");
const WEEK2 = WEEKS[0].days; // 5–11 Oct
const t = (attendeeId: string, groupId: string | null, day: string, km: number): DailyTotal => ({ attendeeId, groupId, day, km });
const everyDay = (a: string, g: string, km = 1, days = WEEK2) => days.map((d) => t(a, g, d, km));

const TEAMS: Team[] = [
  { id: "A", name: "Group 01", memberIds: ["a1", "a2"] },
  { id: "B", name: "Group 02", memberIds: ["b1", "b2"] },
  { id: "C", name: "Group 03", memberIds: ["c1"] },
  { id: "D", name: "Group 04", memberIds: ["d1"] },
];
const score = (totals: DailyTotal[], today = "2026-10-12", disqualified = new Set<string>(), teams = TEAMS) =>
  scoreChallenge({ totals, teams, disqualified, scoring: S, weeks: WEEKS, today });

describe("Tier 1 — daily points (D377)", () => {
  it("scores each person-day on the steps and sums them per team", () => {
    const s = score([t("a1", "A", "2026-10-05", 6), t("a2", "A", "2026-10-05", 0.99), t("a2", "A", "2026-10-06", 10)], "2026-10-06");
    expect(s.weeks[0].teams.A.tier1).toBe(4 + 0 + 8);
    expect(s.weeks[0].teams.A.km).toBe(16.99);
  });

  it("counts Tier 1 straight away, before the week ends", () => {
    expect(score([t("a1", "A", "2026-10-05", 3)], "2026-10-05").standings.find((x) => x.id === "A")!.total).toBe(2);
  });
});

describe("Tier 2 — team bonus (D377)", () => {
  it("awards the bonus when every current member logged every day, once the week has ended", () => {
    const totals = [...everyDay("a1", "A"), ...everyDay("a2", "A")];
    expect(score(totals, "2026-10-12").weeks[0].teams.A.bonus).toBe(20);
    expect(score(totals, "2026-10-11").weeks[0].teams.A.bonus).toBe(0);
  });

  it("withholds it when one member misses one day", () => {
    const totals = [...everyDay("a1", "A"), ...everyDay("a2", "A").filter((x) => x.day !== "2026-10-09")];
    expect(score(totals).weeks[0].teams.A.bonus).toBe(0);
  });

  it("shows progress during the week as members on track", () => {
    const totals = [...everyDay("a1", "A").slice(0, 3), t("a2", "A", "2026-10-05", 1)];
    const w = score(totals, "2026-10-08").weeks[0].teams.A;
    expect(w.onTrack).toBe(1);
    expect(w.members).toBe(2);
  });

  it("uses the five days of the last week", () => {
    const last = WEEKS[8].days;
    const totals = [...everyDay("a1", "A", 1, last), ...everyDay("a2", "A", 1, last)];
    expect(score(totals, "2026-12-05").weeks[8].teams.A.bonus).toBe(20);
  });

  it("judges current members, wherever their km was stamped", () => {
    const moved: Team[] = [{ id: "A", name: "Group 01", memberIds: ["a1", "x"] }, ...TEAMS.slice(1)];
    const totals = [...everyDay("a1", "A"), ...everyDay("x", "B").slice(0, 3), ...everyDay("x", "A").slice(3)];
    expect(score(totals, "2026-10-12", new Set(), moved).weeks[0].teams.A.bonus).toBe(20);
  });
});

describe("Tier 3 — podium (D377)", () => {
  it("gives 20, 12 and 6 to the top three km once the week ends", () => {
    const totals = [t("a1", "A", "2026-10-05", 30), t("b1", "B", "2026-10-05", 20), t("c1", "C", "2026-10-05", 10), t("d1", "D", "2026-10-05", 5)];
    const w = score(totals).weeks[0].teams;
    expect([w.A.podium, w.B.podium, w.C.podium, w.D.podium]).toEqual([20, 12, 6, 0]);
    expect(score(totals, "2026-10-11").weeks[0].teams.A.podium).toBe(0);
  });

  it("shares a tied place and skips the next one", () => {
    const totals = [t("a1", "A", "2026-10-05", 20), t("b1", "B", "2026-10-05", 20), t("c1", "C", "2026-10-05", 10)];
    const w = score(totals).weeks[0].teams;
    expect([w.A.podium, w.B.podium, w.C.podium]).toEqual([20, 20, 6]);
  });

  it("gives nothing to a team with no km", () => {
    expect(score([t("a1", "A", "2026-10-05", 3)]).weeks[0].teams.B.podium).toBe(0);
  });
});

describe("standings and Void (D380)", () => {
  it("ranks teams by total, ties sharing a rank", () => {
    const s = score([t("a1", "A", "2026-10-05", 3), t("b1", "B", "2026-10-05", 3), t("c1", "C", "2026-10-05", 1)], "2026-10-05");
    expect(s.standings.map((x) => [x.id, x.total, x.rank])).toEqual([["A", 2, 1], ["B", 2, 1], ["C", 1, 3], ["D", 0, 4]]);
  });

  it("voids a team with a disqualified member, puts it last and takes it off the podium", () => {
    const totals = [t("a1", "A", "2026-10-05", 30), t("b1", "B", "2026-10-05", 20), t("c1", "C", "2026-10-05", 10), t("d1", "D", "2026-10-05", 5)];
    const s = score(totals, "2026-10-12", new Set(["a2"]));
    const last = s.standings[s.standings.length - 1];
    expect(last).toMatchObject({ id: "A", void: true, rank: null });
    const w = s.weeks[0].teams;
    expect([w.B.podium, w.C.podium, w.D.podium]).toEqual([20, 12, 6]);
  });

  it("knows a person's km on a day, across teams", () => {
    expect(score([t("a1", "A", "2026-10-05", 2), t("a1", "B", "2026-10-05", 1.5)]).personKm("a1", "2026-10-05")).toBe(3.5);
  });
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `npx vitest run tests/challenge-score.test.ts`
Expected: FAIL, because the module isn't found.

- [ ] **Step 3: Implement `src/lib/challenge-score.ts`**

```ts
import { round2, stepPoints, type ChallengeWeek } from "@/lib/challenge";
import type { ChallengeScoring } from "@/lib/types";

/**
 * D375/D377/D380: every point in a scored challenge, worked out from live daily totals. Nothing
 * is stored, so a revoke, an edit or a disqualification shows on the next load, and a week
 * scored after it ended comes out exactly as one scored live.
 *
 * Whose km is it: Tier 1 and Tier 3 go to the team STAMPED on the entry (D369 - moving teams
 * does not carry km along). Tier 2 asks about the team's CURRENT members, wherever their km
 * was stamped, because "every member logged every day" is about the people on the team now.
 */

export type DailyTotal = { attendeeId: string; groupId: string | null; day: string; km: number };
export type Team = { id: string; name: string; memberIds: string[] };
export type TeamWeek = { km: number; tier1: number; bonus: number; podium: number; onTrack: number; members: number };
export type WeekResult = { week: ChallengeWeek; ended: boolean; teams: Record<string, TeamWeek> };
export type Standing = { id: string; name: string; km: number; tier1: number; bonus: number; podium: number; total: number; void: boolean; rank: number | null };
export type ChallengeScore = {
  weeks: WeekResult[];
  standings: Standing[];
  personKm: (attendeeId: string, day: string) => number;
};

/** Standard competition ranking: 1 + how many are strictly ahead, so a tie for 1st is 1, 1, 3. */
function rankOf<T>(items: T[], value: (x: T) => number, item: T): number {
  return 1 + items.filter((o) => value(o) > value(item)).length;
}

export function scoreChallenge(input: {
  totals: DailyTotal[];
  teams: Team[];
  disqualified: Set<string>;
  scoring: ChallengeScoring;
  weeks: ChallengeWeek[];
  today: string;
}): ChallengeScore {
  const { totals, teams, disqualified, scoring, weeks, today } = input;
  const steps = scoring.daily_steps ?? [];

  const byPersonDay = new Map<string, number>();
  for (const t of totals) {
    const k = `${t.attendeeId}|${t.day}`;
    byPersonDay.set(k, round2((byPersonDay.get(k) ?? 0) + t.km));
  }
  const personKm = (attendeeId: string, day: string) => byPersonDay.get(`${attendeeId}|${day}`) ?? 0;
  const logged = (attendeeId: string, day: string) => personKm(attendeeId, day) >= scoring.daily_min;
  const isVoid = new Set(teams.filter((t) => t.memberIds.some((id) => disqualified.has(id))).map((t) => t.id));

  const weekResults = weeks.map((week): WeekResult => {
    const ended = week.days[week.days.length - 1] < today;
    const inWeek = new Set(week.days);
    const elapsed = week.days.filter((d) => d < today);
    const result: Record<string, TeamWeek> = {};
    for (const team of teams) {
      let km = 0, tier1 = 0;
      for (const t of totals) {
        if (t.groupId !== team.id || !inWeek.has(t.day)) continue;
        km += t.km;
        tier1 += stepPoints(t.km, steps);
      }
      const allLogged = team.memberIds.length > 0 && team.memberIds.every((id) => week.days.every((d) => logged(id, d)));
      result[team.id] = {
        km: round2(km),
        tier1,
        bonus: ended && allLogged ? scoring.team_bonus ?? 0 : 0,
        podium: 0,
        onTrack: team.memberIds.filter((id) => elapsed.every((d) => logged(id, d))).length,
        members: team.memberIds.length,
      };
    }
    if (ended && scoring.podium?.length) {
      // D380: a Void team is out of the race, so the teams behind it move up.
      const racing = teams.filter((t) => !isVoid.has(t.id) && result[t.id].km > 0);
      for (const t of racing) {
        const rank = rankOf(racing, (x) => result[x.id].km, t);
        result[t.id].podium = scoring.podium[rank - 1] ?? 0;
      }
    }
    return { week, ended, teams: result };
  });

  const rows = teams.map((team) => {
    const sum = (k: "km" | "tier1" | "bonus" | "podium") => weekResults.reduce((n, w) => n + w.teams[team.id][k], 0);
    const [tier1, bonus, podium] = [sum("tier1"), sum("bonus"), sum("podium")];
    return { id: team.id, name: team.name, km: round2(sum("km")), tier1, bonus, podium, total: tier1 + bonus + podium, void: isVoid.has(team.id), rank: null as number | null };
  });
  const live = rows.filter((r) => !r.void).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  for (const r of live) r.rank = rankOf(live, (x) => x.total, r);
  const voided = rows.filter((r) => r.void).sort((a, b) => a.name.localeCompare(b.name));

  return { weeks: weekResults, standings: [...live, ...voided], personKm };
}
```

- [ ] **Step 4: Run them to confirm they pass**

Run: `npx vitest run tests/challenge-score.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/challenge-score.ts tests/challenge-score.test.ts
git commit -m "feat(mileage): scoreChallenge - daily points, team bonus, podium, Void (D375, D377, D380)"
```

---

### Task 10: Data layer and the attendee's team views (D379)

**Files:**
- Create: `src/lib/db/challenge.ts`
- Create: `src/lib/challenge-data.ts`
- Create: `src/components/portal/tracker/TeamTable.tsx`, `src/components/portal/tracker/MyTeam.tsx`
- Modify: `src/app/e/[slug]/a/[token]/activities/[activityId]/page.tsx` (`TrackerBody`)

**Interfaces:**
- Consumes: `scoreChallenge`, `ChallengeScore`, `Team` (Task 9); `challengeWeeks`, `weekFor`, `stepPoints` (Task 3); `listGroups`; `listAttendees`.
- Produces:
  - `type Disqualification = { attendee_id: string; reason: string; created_at: string; created_by: string | null }`
  - From `db/challenge.ts`:
    - `dailyTotals(activityId): Promise<DailyTotal[]>`
    - `listDisqualifications(activityId): Promise<Disqualification[]>`
    - `disqualify(ev, activityId, attendeeId, reason, userId): Promise<void>`
    - `undoDisqualify(activityId, attendeeId): Promise<void>`
  - From `challenge-data.ts`:
    - `loadChallenge(event, activity, today): Promise<{ score: ChallengeScore; teams: Team[]; weeks: ChallengeWeek[]; names: Map<string, string>; disqualifications: Disqualification[] }>`

- [ ] **Step 1: Create `src/lib/db/challenge.ts`**

```ts
import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { DailyTotal } from "@/lib/challenge-score";
import type { Event } from "@/lib/types";

export type Disqualification = { attendee_id: string; reason: string; created_at: string; created_by: string | null };

/** D375: live km per person, team and day, summed by `challenge_daily_totals` (0058). */
export async function dailyTotals(activityId: string): Promise<DailyTotal[]> {
  const { data, error } = await serviceClient().rpc("challenge_daily_totals", { p_activity_id: activityId });
  if (error) throw error;
  return ((data ?? []) as { attendee_id: string; group_id: string | null; day: string; km: number | string }[])
    .map((r) => ({ attendeeId: r.attendee_id, groupId: r.group_id, day: r.day, km: Number(r.km) }));
}

export async function listDisqualifications(activityId: string): Promise<Disqualification[]> {
  const { data, error } = await serviceClient().from("challenge_disqualifications")
    .select("attendee_id, reason, created_at, created_by").eq("activity_id", activityId);
  if (error) throw error;
  return (data ?? []) as Disqualification[];
}

/** D380. Upsert: disqualifying twice just updates the reason. */
export async function disqualify(ev: Pick<Event, "id">, activityId: string, attendeeId: string, reason: string, userId: string): Promise<void> {
  const { error } = await serviceClient().from("challenge_disqualifications")
    .upsert({ event_id: ev.id, activity_id: activityId, attendee_id: attendeeId, reason, created_by: userId }, { onConflict: "activity_id,attendee_id" });
  if (error) throw error;
}

export async function undoDisqualify(activityId: string, attendeeId: string): Promise<void> {
  const { error } = await serviceClient().from("challenge_disqualifications").delete().eq("activity_id", activityId).eq("attendee_id", attendeeId);
  if (error) throw error;
}
```

- [ ] **Step 2: Create `src/lib/challenge-data.ts`**

```ts
import "server-only";
import { challengeWeeks, type ChallengeWeek } from "@/lib/challenge";
import { scoreChallenge, type ChallengeScore, type Team } from "@/lib/challenge-score";
import { dailyTotals, listDisqualifications, type Disqualification } from "@/lib/db/challenge";
import { listGroups } from "@/lib/db/groups";
import { listAttendees } from "@/lib/db/attendees";
import type { Activity, Event } from "@/lib/types";

/**
 * D375: the one read behind every leaderboard - the portal's team table and My team, the admin
 * tab and the export all score from here, so they cannot disagree. Four queries; the event's
 * attendee list (~160 rows) is what tells Tier 2 who is on each team now.
 */
export async function loadChallenge(event: Pick<Event, "id" | "starts_on">, activity: Activity, today: string): Promise<{
  score: ChallengeScore;
  teams: Team[];
  weeks: ChallengeWeek[];
  names: Map<string, string>;
  disqualifications: Disqualification[];
}> {
  const scoring = activity.scoring!;
  const [totals, groups, attendees, disqualifications] = await Promise.all([
    dailyTotals(activity.id), listGroups(event.id), listAttendees(event.id), listDisqualifications(activity.id),
  ]);
  const teams = groups.map((g) => ({
    id: g.id, name: g.name,
    memberIds: attendees.filter((a) => a.group_id === g.id).map((a) => a.id),
  }));
  const weeks = challengeWeeks(scoring, event.starts_on);
  const score = scoreChallenge({ totals, teams, disqualified: new Set(disqualifications.map((d) => d.attendee_id)), scoring, weeks, today });
  return { score, teams, weeks, names: new Map(attendees.map((a) => [a.id, a.name])), disqualifications };
}
```

- [ ] **Step 3: Create `TeamTable.tsx` (points only, D379)**

```tsx
import type { Standing } from "@/lib/challenge-score";

/** D379: every team's rank and points - never km, so the weekly podium stays a surprise. */
export function TeamTable({ standings, mine }: { standings: Standing[]; mine: string | null }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-extrabold">Team table</h2>
      <ol className="flex flex-col overflow-hidden rounded-xl border border-border">
        {standings.map((s) => (
          <li key={s.id} className={`flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0 ${s.id === mine ? "bg-primary/5 font-extrabold" : ""}`}>
            <span className="w-6 text-right text-sm tabular-nums text-muted-foreground">{s.rank ?? "–"}</span>
            <span className="min-w-0 flex-1 truncate text-sm">{s.name}{s.id === mine ? " (your team)" : ""}</span>
            <span className="text-sm font-bold tabular-nums">{s.void ? "Void" : `${s.total} pts`}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 4: Create `MyTeam.tsx`**

```tsx
import { stepPoints } from "@/lib/challenge";
import type { ChallengeScore, Team, TeamWeek } from "@/lib/challenge-score";
import type { ChallengeScoring } from "@/lib/types";

/**
 * D379: the viewer's own team - who has logged today (the ones still to log first, so teammates
 * can nudge), Tier 2 progress, and the team's own km for the week.
 */
export function MyTeam({ team, week, score, scoring, day, selfId, names }: {
  team: Team; week: TeamWeek; score: ChallengeScore; scoring: ChallengeScoring; day: string; selfId: string; names: Map<string, string>;
}) {
  const steps = scoring.daily_steps ?? [];
  const rows = team.memberIds
    .map((id) => ({ id, name: names.get(id) ?? "Unknown", km: score.personKm(id, day) }))
    .sort((a, b) => Number(a.km >= scoring.daily_min) - Number(b.km >= scoring.daily_min) || a.name.localeCompare(b.name));
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-extrabold">{team.name}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{week.km} km this week</span>
      </div>
      {scoring.team_bonus ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">
          <span className="font-bold">{week.onTrack} of {week.members}</span> logged every day so far this week. Everyone on track by Sunday earns +{scoring.team_bonus}.
        </p>
      ) : null}
      <ul className="flex flex-col overflow-hidden rounded-xl border border-border">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 border-b border-border px-3 py-2.5 text-sm last:border-b-0">
            <span className="min-w-0 flex-1 truncate">{r.name}{r.id === selfId ? " (you)" : ""}</span>
            {r.km >= scoring.daily_min
              ? <span className="tabular-nums text-muted-foreground">{r.km} km{steps.length ? ` · ${stepPoints(r.km, steps)} pts` : ""}</span>
              : <span className="font-bold text-warning">Not logged</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 5: Add both views to `TrackerBody`**

In `TrackerBody`, after `buildTracker`, load the challenge, and render the two sections after the
`EntryTimeline` (inside the same `<section>`, after the notes). The attendee's `group_id` must
reach `TrackerBody`, so pass `attendee.group_id` as a new `teamId` prop.

```tsx
  const challenge = await loadChallenge({ id: f.event_id, starts_on: eventStartsOn }, f, today);
  const myTeam = teamId ? challenge.teams.find((x) => x.id === teamId) ?? null : null;
  const thisWeek = challenge.score.weeks.find((w) => w.week.number === t.week.number);
```

```tsx
        {myTeam && thisWeek && (
          <MyTeam team={myTeam} week={thisWeek.teams[myTeam.id]} score={challenge.score} scoring={scoring}
            day={t.selected} selfId={attendeeId} names={challenge.names} />
        )}
        <TeamTable standings={challenge.score.standings} mine={teamId} />
```

Add the matching imports.

- [ ] **Step 6: Type-check, lint and commit**

Run: `npx tsc --noEmit && npx eslint src/lib/db/challenge.ts src/lib/challenge-data.ts src/components/portal/tracker`
Expected: no errors.

```bash
git add src/lib/db/challenge.ts src/lib/challenge-data.ts src/components/portal/tracker "src/app/e/[slug]/a/[token]/activities/[activityId]/page.tsx"
git commit -m "feat(mileage): My team and the points-only team table on the tracker (D379)"
```

---

### Task 11: Committee Leaderboard tab, team grid, Disqualify and Undo (D380, D381)

**Files:**
- Modify: `src/lib/activity-tabs.ts`
- Test: `tests/activity-tabs.test.ts`
- Create: `src/components/admin/LeaderboardPanel.tsx`, `src/components/admin/TeamGrid.tsx`
- Modify: `src/app/admin/events/[id]/activities/actions.ts` (two actions)
- Modify: `src/app/admin/events/[id]/activities/[activityId]/page.tsx` (`SubmissionDetail`)

**Interfaces:**
- Consumes: `loadChallenge` (Task 10); `weekLabel` (Task 3); `disqualify`, `undoDisqualify` (Task 10).
- Produces:
  - `ActivityTab` gains `"leaderboard"`; `TabCounts.scored?: boolean`.
  - `disqualifyAction(eventId, activityId, attendeeId, fd)` and `undoDisqualifyAction(eventId, activityId, attendeeId, fd)`. Both are bound to the three ids and posted from a form that carries a hidden `team` field.

- [ ] **Step 1: Write the failing tab test**

Append to `tests/activity-tabs.test.ts`:

```ts
it("adds a Leaderboard tab to a scored submission (D381)", () => {
  const tabs = activityTabs("submission", { submissions: 3, notSubmitted: 1, perDay: true, scored: true });
  expect(tabs.map((t) => t.tab)).toEqual(["setup", "submissions", "not-submitted", "participation", "leaderboard"]);
});
```

- [ ] **Step 2: Run it to confirm it fails, then implement**

Run: `npx vitest run tests/activity-tabs.test.ts`. Expected: FAIL.

In `src/lib/activity-tabs.ts`:
- Add `"leaderboard"` to the `ActivityTab` union.
- Add `scored?: boolean;` to `TabCounts`, with the doc comment `/** D381: a scored challenge has a Leaderboard tab. */`.
- In the submission branch, replace the last return with:

```ts
    const withDaily = c.perDay ? [...tabs, item("participation", "Participation")] : tabs;
    return c.scored ? [...withDaily, item("leaderboard", "Leaderboard")] : withDaily;
```

Run it again. Expected: PASS.

- [ ] **Step 3: Add the two actions to `actions.ts`**

```ts
/**
 * D380: disqualify a person from a scored challenge. Their team shows Void everywhere and drops
 * out of the podium; their entries stay for the record. Undo is the delete below.
 */
export async function disqualifyAction(eventId: string, activityId: string, attendeeId: string, fd: FormData) {
  const { orgId, userId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const activity = await submissionOf(ev, activityId);
  const back = activityHref(eventId, activityId, "leaderboard", { team: String(fd.get("team") ?? "") });
  const reason = text(fd, "reason");
  if (!activity.scoring) redirect(flashPath(back, "This activity isn't scored.", "error"));
  if (!reason) redirect(flashPath(back, "Add a reason for the record.", "error"));
  const attendee = await getAttendee(attendeeId);
  if (!attendee || attendee.event_id !== ev.id) redirect(flashPath(back, "That person is no longer in this event.", "error"));
  await disqualify(ev, activity.id, attendeeId, reason.slice(0, 500), userId);
  revalidatePath(detailPath(eventId, activityId));
  redirect(flashPath(back, `${attendee.name} disqualified. Their team now shows Void.`));
}

export async function undoDisqualifyAction(eventId: string, activityId: string, attendeeId: string, fd: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const activity = await submissionOf(ev, activityId);
  const back = activityHref(eventId, activityId, "leaderboard", { team: String(fd.get("team") ?? "") });
  await undoDisqualify(activity.id, attendeeId);
  revalidatePath(detailPath(eventId, activityId));
  redirect(flashPath(back, "Disqualification undone."));
}
```

Import `disqualify` and `undoDisqualify` from `@/lib/db/challenge`. Check that `getAttendee`
returns `event_id`. If it doesn't, compare against `listAttendees(ev.id)` the way the other
actions in this file do.

- [ ] **Step 4: Create `LeaderboardPanel.tsx`**

```tsx
import Link from "next/link";
import { weekLabel } from "@/lib/challenge";
import type { ChallengeScore } from "@/lib/challenge-score";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * D381: the committee's full view - km and every tier, for all weeks or one. Teams link to their
 * member × day grid. "Week" here is the EDM's numbering (D378).
 */
export function LeaderboardPanel({ score, week, today, href }: {
  score: ChallengeScore;
  /** Null is every week so far. */
  week: number | null;
  /** `nowInKL().date` from the page - weeks not yet begun get no chip. */
  today: string;
  href: (extra: Record<string, string>) => string;
}) {
  const picked = week === null ? null : score.weeks.find((w) => w.week.number === week) ?? null;
  const rows = score.standings.map((s) => {
    const w = picked?.teams[s.id];
    return w ? { ...s, km: w.km, tier1: w.tier1, bonus: w.bonus, podium: w.podium, total: w.tier1 + w.bonus + w.podium } : s;
  });
  const chip = (active: boolean) => `rounded-full border px-3 py-1 text-xs font-bold ${active ? "border-primary bg-primary/10 text-primary" : "border-border"}`;
  return (
    <div className="flex flex-col gap-3">
      <nav className="flex flex-wrap gap-1.5" aria-label="Week">
        <Link href={href({})} className={chip(week === null)}>All weeks</Link>
        {score.weeks.filter((w) => w.week.days[0] <= today).map((w) => (
          <Link key={w.week.number} href={href({ week: String(w.week.number) })} className={chip(week === w.week.number)}>
            Week {w.week.number}{w.ended ? "" : " (live)"}
          </Link>
        ))}
      </nav>
      {picked && <p className="text-sm text-muted-foreground">{weekLabel(picked.week)}{picked.ended ? "" : ". Bonus and podium are added once the week ends."}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead><TableHead>Team</TableHead>
            <TableHead className="text-right">km</TableHead><TableHead className="text-right">Daily</TableHead>
            <TableHead className="text-right">Bonus</TableHead><TableHead className="text-right">Podium</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="tabular-nums text-muted-foreground">{r.rank ?? "–"}</TableCell>
              <TableCell><Link href={href({ ...(week ? { week: String(week) } : {}), team: r.id })} className="font-bold text-primary underline-offset-2 hover:underline">{r.name}</Link></TableCell>
              <TableCell className="text-right tabular-nums">{r.km}</TableCell>
              <TableCell className="text-right tabular-nums">{r.tier1}</TableCell>
              <TableCell className="text-right tabular-nums">{r.bonus}</TableCell>
              <TableCell className="text-right tabular-nums">{r.podium}</TableCell>
              <TableCell className="text-right font-extrabold tabular-nums">{r.void ? "Void" : r.total}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 5: Create `TeamGrid.tsx`**

```tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ChallengeScore, Team } from "@/lib/challenge-score";
import type { ChallengeWeek } from "@/lib/challenge";
import type { Disqualification } from "@/lib/db/challenge";
import { Button } from "@/components/ui/button";

/** D381: one team's members against the week's days, km in each cell, with Disqualify and Undo (D380). */
export function TeamGrid({ team, week, score, names, dq, dailyMin, back, disqualify, undo }: {
  team: Team; week: ChallengeWeek; score: ChallengeScore; names: Map<string, string>; dq: Disqualification[]; dailyMin: number;
  back: string;
  disqualify: (attendeeId: string) => (fd: FormData) => Promise<void>;
  undo: (attendeeId: string) => (fd: FormData) => Promise<void>;
}) {
  const dqBy = new Map(dq.map((d) => [d.attendee_id, d]));
  const short = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
  return (
    <div className="flex flex-col gap-3">
      <Link href={back} className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />All teams</Link>
      <h3 className="text-base font-extrabold">{team.name}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3">Member</th>
            {week.days.map((d) => <th key={d} className="px-1.5 py-2 text-right tabular-nums">{short(d)}</th>)}
            <th className="py-2 pl-3" />
          </tr></thead>
          <tbody>
            {team.memberIds.map((id) => {
              const d = dqBy.get(id);
              return (
                <tr key={id} className="border-t border-border align-top">
                  <td className="py-2 pr-3 font-bold">{names.get(id) ?? "Unknown"}{d && <span className="block text-xs font-normal text-destructive">Disqualified: {d.reason}</span>}</td>
                  {week.days.map((day) => {
                    const km = score.personKm(id, day);
                    return <td key={day} className={`px-1.5 py-2 text-right tabular-nums ${km >= dailyMin ? "" : "text-muted-foreground/60"}`}>{km || "–"}</td>;
                  })}
                  <td className="py-2 pl-3">
                    {d ? (
                      <form action={undo(id)}><input type="hidden" name="team" value={team.id} /><Button type="submit" size="sm" variant="outline">Undo</Button></form>
                    ) : (
                      <form action={disqualify(id)} className="flex gap-1.5">
                        <input type="hidden" name="team" value={team.id} />
                        <input name="reason" required placeholder="Reason" aria-label={`Reason to disqualify ${names.get(id) ?? ""}`} className="h-8 w-32 rounded-md border border-input bg-transparent px-2 text-xs" />
                        <Button type="submit" size="sm" variant="destructive">Disqualify</Button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

The Disqualify button voids a whole team. If `src/components/admin/` has a confirm-dialog
component (look for `ConfirmButton`, which is covered by `tests/confirm-button.test.ts`), use it
for Disqualify, with the text "Disqualify {name}? {team} will show Void on every leaderboard."

- [ ] **Step 6: Wire the tab into `SubmissionDetail`**

- Add `week?: string; team?: string` to the page's `searchParams` and pass them down. Follow how
  `requestedDay` is threaded through `ActivityDetail`.
- Set `const scored = activity.scoring !== null;`, and pass `scored` into `activityTabs(…)`.
- When `current === "leaderboard"`, `await loadChallenge(ev, activity, today)` and render:

```tsx
      {current === "leaderboard" && challenge && (
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Leaderboard</CardTitle></CardHeader>
          <CardContent>
            {teamId && challenge.teams.find((x) => x.id === teamId) ? (
              <TeamGrid
                team={challenge.teams.find((x) => x.id === teamId)!}
                week={(challenge.weeks.find((w) => w.number === Number(week)) ?? weekFor(challenge.weeks, today) ?? challenge.weeks[0])}
                score={challenge.score} names={challenge.names} dq={challenge.disqualifications}
                dailyMin={activity.scoring!.daily_min}
                back={activityHref(ev.id, activity.id, "leaderboard", week ? { week } : {})}
                disqualify={(aid) => disqualifyAction.bind(null, ev.id, activity.id, aid)}
                undo={(aid) => undoDisqualifyAction.bind(null, ev.id, activity.id, aid)}
              />
            ) : (
              <LeaderboardPanel score={challenge.score} week={week ? Number(week) : null} today={today}
                href={(extra) => activityHref(ev.id, activity.id, "leaderboard", extra)} />
            )}
          </CardContent>
        </Card>
      )}
```

Only load `challenge` when `current === "leaderboard"`:
`const challenge = current === "leaderboard" && scored ? await loadChallenge(ev, activity, today) : null;`

- [ ] **Step 7: Type-check, test and commit**

Run: `npx tsc --noEmit && npx vitest run tests/activity-tabs.test.ts tests/challenge-score.test.ts`
Expected: PASS.

```bash
git add src/lib/activity-tabs.ts tests/activity-tabs.test.ts src/components/admin/LeaderboardPanel.tsx src/components/admin/TeamGrid.tsx "src/app/admin/events/[id]/activities/actions.ts" "src/app/admin/events/[id]/activities/[activityId]/page.tsx"
git commit -m "feat(mileage): committee Leaderboard tab, team grid, Disqualify and Undo (D380, D381)"
```

---

### Task 12: Leaderboard sheet in the export (D381)

**Files:**
- Modify: `src/lib/exports.ts`
- Modify: `src/app/admin/events/[id]/export/submissions.xlsx/route.ts`
- Test: `tests/exports.test.ts`

**Interfaces:**
- Consumes: `ChallengeScore` (Task 9); `loadChallenge` (Task 10).
- Produces:
  - `leaderboardRows(score): (string | number)[][]`, with the header row first
  - `addLeaderboardSheet(wb, title, rows): void`

- [ ] **Step 1: Write the failing test**

Append to `tests/exports.test.ts`:

```ts
import { leaderboardRows } from "@/lib/exports";
import { scoreChallenge } from "@/lib/challenge-score";
import { challengeWeeks } from "@/lib/challenge";

describe("leaderboardRows (D381)", () => {
  it("lists every week's tiers per team, then the totals", () => {
    const scoring = { metric_key: "km", daily_min: 1, starts_on: "2026-10-05", ends_on: "2026-10-11", daily_steps: [{ at: 1, pts: 1 }], podium: [20] };
    const score = scoreChallenge({
      totals: [{ attendeeId: "a1", groupId: "A", day: "2026-10-05", km: 2 }],
      teams: [{ id: "A", name: "Group 01", memberIds: ["a1"] }],
      disqualified: new Set(), scoring, weeks: challengeWeeks(scoring, "2026-09-28"), today: "2026-10-12",
    });
    expect(leaderboardRows(score)).toEqual([
      ["Week", "Team", "km", "Daily points", "Team bonus", "Podium", "Total"],
      ["Week 2 · 5–11 Oct", "Group 01", 2, 1, 0, 20, 21],
      ["All weeks", "Group 01", 2, 1, 0, 20, 21],
    ]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails, then implement in `src/lib/exports.ts`**

Run: `npx vitest run tests/exports.test.ts`. Expected: FAIL.

```ts
import { weekLabel } from "@/lib/challenge";
import type { ChallengeScore } from "@/lib/challenge-score";

/** D381: one row per team per week that has begun, then each team's totals ("Void" for a voided team). */
export function leaderboardRows(score: ChallengeScore): (string | number)[][] {
  const header = ["Week", "Team", "km", "Daily points", "Team bonus", "Podium", "Total"];
  const weekly = score.weeks
    .filter((w) => Object.values(w.teams).some((t) => t.km > 0) || w.ended)
    .flatMap((w) => score.standings.map((s) => {
      const t = w.teams[s.id];
      return [weekLabel(w.week), s.name, t.km, t.tier1, t.bonus, t.podium, t.tier1 + t.bonus + t.podium];
    }));
  const totals = score.standings.map((s) => ["All weeks", s.name, s.km, s.tier1, s.bonus, s.podium, s.void ? "Void" : s.total]);
  return [header, ...weekly, ...totals];
}

export function addLeaderboardSheet(wb: ExcelJS.Workbook, title: string, rows: (string | number)[][]): void {
  const ws = wb.addWorksheet(uniqueSheetName(sanitizeSheetNamePart(title), new Set(wb.worksheets.map((w) => w.name))));
  for (const r of rows) ws.addRow(r);
  ws.getRow(1).font = { bold: true };
  ws.columns = [{ width: 26 }, { width: 22 }, { width: 10 }, { width: 13 }, { width: 12 }, { width: 10 }, { width: 10 }];
}
```

`uniqueSheetName` and `sanitizeSheetNamePart` are already in this file. Check their signatures
and adapt the call if `uniqueSheetName` mutates the set or wants it typed differently.

Run it again. Expected: PASS.

- [ ] **Step 3: Add the sheet in the route**

In `submissions.xlsx/route.ts`, import `loadChallenge`, `nowInKL`, `leaderboardRows` and
`addLeaderboardSheet`. After `const wb = buildFormsWorkbook(sheets, columns);` (split the
existing one-liner so `wb` is a variable), add:

```ts
  // D381: a scored challenge also gets its leaderboard, scored by the same read the tab uses.
  for (const f of forms.filter((x) => x.scoring)) {
    const { score } = await loadChallenge(ev, f, nowInKL().date);
    addLeaderboardSheet(wb, `${f.name} leaderboard`, leaderboardRows(score));
  }
  const buf = await wb.xlsx.writeBuffer();
```

- [ ] **Step 4: Type-check, test and commit**

Run: `npx tsc --noEmit && npx vitest run tests/exports.test.ts`
Expected: PASS.

```bash
git add src/lib/exports.ts "src/app/admin/events/[id]/export/submissions.xlsx/route.ts" tests/exports.test.ts
git commit -m "feat(mileage): Leaderboard sheet in the submissions export (D381)"
```

---

### Task 13: Phase 2 browser check and release

- [ ] **Step 1: Full suite**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: everything passes.

- [ ] **Step 2: Seed scores on the test activity only (`ecpkom`, "ZZ Mileage test")**

Use `execute_sql` to insert backdated entries for two ZZ teams, so that a whole week has ended:
- Team 1: every member logs 1–6 km every day of a past week.
- Team 2: one member misses a day.

The `scoring.starts_on` date has to be at least a week in the past, so temporarily set the test
activity's `starts_on` back. Insert rows directly into `activity_submissions`
(`status = 'submitted'`, `group_id` = the team, `answers = {"method": "Watch / phone GPS — synced to Strava", "km": "<n>", "strava": ""}`).
Remember: never seed `ecphub`.

- [ ] **Step 3: Check the screens**

1. **Portal, as a Team 1 member at 375 px:**
   - My team lists teammates, with the people who haven't logged first.
   - The "x of y" progress line shows.
   - The team table shows points only, with no km anywhere, and Team 1 is highlighted.
2. **Admin Leaderboard tab:**
   - With "All weeks", the totals match a hand calculation: Team 1 got +20 bonus, Team 2 didn't,
     and the podium matches.
   - Open Team 2's grid; the missed day shows "–".
3. **Disqualify** a Team 1 member with the reason "test":
   - Team 1 shows Void at the bottom of both tables.
   - Team 2 takes the podium points.
   - Undo restores it.
4. **Download the export:** it has a "ZZ Mileage test leaderboard" sheet with the same numbers.

Then delete the seeded rows and restore the test activity's dates.

- [ ] **Step 4: Push, then check one real `ecphub` page, read-only**

```bash
git pull --rebase && git push
```

After the deploy finishes, open `ecphub`'s Leaderboard tab and one real member's tracker. Look
only, without changing anything. Then update the memory file `project-mileage.md`: Phase 2 is
live.
