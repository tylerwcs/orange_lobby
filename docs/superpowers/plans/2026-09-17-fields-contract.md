# Attendee Fields: Contract Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop `attendees.company`, `attendees.phone`, `attendees.table_no` and `events.collected_fields`, and delete the temporary fallback that existed only because they did.

**Architecture:** The contract half of an expand/backfill/contract migration. The expand half shipped and its migration (0014) is applied: every attendee's values are in `extra`, every read goes through `fieldValue`, and nothing writes the columns. What remains is deleting the columns and the code that knows they ever existed. Unlike expand, **both orders are safe** — the deployed code reads `extra` first and only falls back to a column when the key is absent, which it never is now. One exception governs the ordering (see Global Constraints).

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Supabase (Postgres + service-role client), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-attendee-fields-unification-design.md` (§Step 3 — Contract)

**Predecessor:** `docs/superpowers/plans/2026-09-17-fields-expand.md`, complete and deployed; migration 0014 applied 17 Sep 2026, all six verification counts zero.

## Global Constraints

- **Deploy the code before dropping the columns.** Either order is safe for every read path, but `purgeAttendeePersonalData` in the *currently deployed* build still names `phone` and `company` in its update; dropping the columns first breaks purge until the new code ships. Purge only runs on archived events, so the window is survivable — but there is no reason to open it.
- **This is the irreversible step.** The columns are the last copy of those values outside `extra`. The author accepted this scope knowing the pilot event is 30 Sep 2026.
- `fieldValue` survives — one accessor, one place that trims — but loses its fallback branch and its `Record<string, unknown>` escape hatch.
- The three keys keep a *presentation* meaning in two places (default column visibility, fixed export positions). That constant survives the columns it was named after and must be renamed to say what it now means.
- Tests first for every behaviour change; a deleted behaviour means a deleted test, not a weakened one.
- Every commit message ends with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- `npx vitest run`, `npx tsc --noEmit` and `npx eslint src tests` clean before each commit.
- Work on `main`, one commit per task.

---

### Task 1: The accessor loses its fallback, and the key list gets an honest name

**Files:**
- Modify: `src/lib/attendee-values.ts` (delete `LEGACY_COLUMN_KEYS`, the `LEGACY` set and the fallback branch)
- Modify: `src/lib/columns.ts` (define `FORMER_BUILTIN_KEYS` here; `EX_BUILTIN_KEYS` reads from it)
- Modify: `src/lib/exports.ts` (import the renamed constant from `columns.ts`)
- Test: `tests/attendee-values.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `fieldValue(a: Pick<Attendee, "extra">, key: string): string` — narrower parameter, no fallback. `FORMER_BUILTIN_KEYS: readonly string[]` exported from `src/lib/columns.ts`.

- [ ] **Step 1: Rewrite the tests to describe the new behaviour**

Replace the fallback tests in `tests/attendee-values.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { fieldValue } from "@/lib/attendee-values";

const attendee = (extra: Record<string, string>) => ({ extra });

describe("fieldValue", () => {
  it("reads the value out of extra", () => {
    expect(fieldValue(attendee({ company: "Ecopia" }), "company")).toBe("Ecopia");
  });

  it("trims what it returns", () => {
    expect(fieldValue(attendee({ phone: " 012 " }), "phone")).toBe("012");
  });

  it("is blank for a key the attendee has no answer for", () => {
    expect(fieldValue(attendee({}), "company")).toBe("");
  });

  it("no longer consults anything but extra", () => {
    // The columns are gone. A property shaped like the old column must not be read —
    // if this ever passes again, the fallback has crept back in.
    expect(fieldValue({ extra: {}, company: "Stale Co" } as never, "company")).toBe("");
  });

  it("tolerates an attendee whose extra is missing entirely", () => {
    expect(fieldValue({} as never, "company")).toBe("");
  });
});
```

Delete the `LEGACY_COLUMN_KEYS` test and its import.

- [ ] **Step 2: Run the tests to watch the right one fail**

Run: `npx vitest run tests/attendee-values.test.ts`
Expected: FAIL on "no longer consults anything but extra" — it returns `"Stale Co"` today, which is exactly the fallback this task deletes. The other four pass already; that is correct and expected, not a problem to fix.

- [ ] **Step 3: Delete the fallback**

```ts
import type { Attendee } from "@/lib/types";

/**
 * One field's value for one attendee, trimmed.
 *
 * Every fact an event collects beyond name, email and category lives in `extra`, so this
 * is the only place that needs to know how to read one. It used to fall back to the
 * columns `company`, `phone` and `table_no` while migration 0014 moved their values; those
 * columns are gone and so is the fallback.
 */
export function fieldValue(a: Pick<Attendee, "extra">, key: string): string {
  return (a.extra?.[key] ?? "").trim();
}
```

In `src/lib/columns.ts`, define the constant where its meaning now lives, and drop the `attendee-values` import:

```ts
/**
 * The three facts that used to be columns on the attendee row, before migration 0014 made
 * them ordinary fields. They are ordinary now in every respect but two: they are visible by
 * default like the built-ins they replaced, and the exports keep them in their old fixed
 * positions. Both of those are promises to people, not properties of the data.
 */
export const FORMER_BUILTIN_KEYS = ["company", "phone", "table_no"] as const;
```

and have `EX_BUILTIN_KEYS` read from it. In `src/lib/exports.ts`, import `FORMER_BUILTIN_KEYS` from `@/lib/columns` instead of `LEGACY_COLUMN_KEYS` from `@/lib/attendee-values`; the local `LEGACY` set keeps working, renamed to match.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src tests`
Expected: all pass. A type error at a `fieldValue` call site means that site was passing something wider than `Pick<Attendee, "extra">` — narrow the call, do not widen the signature back.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendee-values.ts src/lib/columns.ts src/lib/exports.ts tests/attendee-values.test.ts
git commit -m "$(cat <<'MSG'
refactor(fields): the accessor reads extra, and only extra

The fallback to the company/phone/table_no columns existed so the code and the
data could move in separate deploys. Migration 0014 moved the data, so it now
answers a question nobody asks: every key it would fall back for is present in
`extra` on every row.

LEGACY_COLUMN_KEYS outlives the columns it was named after, because two places
still treat those three specially — they are visible by default like the
built-ins they replaced, and the exports keep them in their old positions. That
is a promise to people rather than a property of the data, so the constant moves
to columns.ts as FORMER_BUILTIN_KEYS and says so.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: The types forget the columns

**Files:**
- Modify: `src/lib/types.ts` (`Attendee` loses `phone`, `company`, `table_no`)
- Modify: `src/lib/db/attendees.ts` (`AttendeeInput` loses the same three; `purgeAttendeePersonalData` stops naming them)
- Modify: whichever test files construct an attendee with those keys — `tests/checkins-stats.test.ts`, `tests/exports.test.ts`, `tests/pinned-fields.test.ts`, `tests/scan.test.ts`

**Interfaces:**
- Consumes: Task 1's `fieldValue` signature.
- Produces: an `Attendee` whose only per-event facts are `extra`.

- [ ] **Step 1: Delete the keys from both types**

In `src/lib/types.ts`, `Attendee` keeps `id, org_id, event_id, token, name, email, category, extra, source, status`. In `src/lib/db/attendees.ts`:

```ts
export type AttendeeInput = {
  name: string; email?: string | null; category?: string | null; extra?: Record<string, string>;
};
```

- [ ] **Step 2: Let the compiler find the rest**

Run: `npx tsc --noEmit`
Every error is a site still naming a dropped key. Expect one in `purgeAttendeePersonalData` (`src/lib/db/attendees.ts`), which sets `phone: null, company: null` — delete both; the `extra: {}` beside them already clears every field value, which is what those two lines were for. Expect the rest in test files constructing attendee fixtures.

Fix each by removing the key, not by casting. If a test asserted a value read from a column, move the value into `extra` — the behaviour it covers is real, only its storage changed.

- [ ] **Step 3: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src tests`
Expected: all pass, with no `as never` or `as unknown` added to make a fixture compile.

- [ ] **Step 4: Confirm nothing in src still names them**

Run: `grep -rnE "\.(company|phone|table_no)\b" src --include=*.ts --include=*.tsx`
Expected: only matches where the string is a *field key* (`fieldValue(a, "company")`, `extra.company`), never a property read off an attendee row. Paste what you find into your report either way.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/db/attendees.ts tests
git commit -m "$(cat <<'MSG'
refactor(fields): an attendee row has no company, phone or table

The type said an attendee had three facts that the database is about to stop
holding and that no code has read since the expand step. Deleting them from
Attendee and AttendeeInput makes the compiler the guard: a future edit that
reaches for a.company now fails to build instead of silently reading undefined.

purgeAttendeePersonalData loses its phone and company lines. They existed to
clear those two columns; `extra: {}` beside them already clears every fact the
attendee gave us, including the two that used to be columns.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: Migration 0015, and the runbook section that runs it

**Files:**
- Create: `supabase/migrations/0015_fields_contract.sql`
- Modify: `docs/runbook.md`

**Interfaces:**
- Consumes: nothing in code. This is the step the previous two make safe.

- [ ] **Step 1: Write the migration**

```sql
-- Contract step: the columns migration 0014 emptied into `extra` are dropped.
--
-- IRREVERSIBLE. Every value these columns held was copied into attendees.extra by 0014 and
-- verified there (see the runbook's six counting queries, all of which must return zero
-- before this runs). After this, `extra` is the only copy: recovering a mistake means a
-- database restore, not a re-read.
--
-- Run this AFTER the code that stops naming these columns is deployed. Every read path is
-- safe either way — nothing has read a column since the expand step — but
-- purgeAttendeePersonalData in the previous build still names phone and company in its
-- update, so dropping first breaks purge for archived events until the deploy lands.

alter table attendees
  drop column company,
  drop column phone,
  drop column table_no;

-- The concept that gated those three. Nothing has read it since the expand step.
alter table events drop column collected_fields;
```

- [ ] **Step 2: Write the runbook section**

Append a section to `docs/runbook.md` titled "Attendee fields: contract (migration 0015)" containing, in this order:

1. A sentence saying this is the irreversible half and that 0014's six verification queries must be re-run and all return zero **immediately before** running it — the data may have changed since they were last run.
2. Those six queries, copied from the 0014 section so the operator does not have to scroll.
3. The ordering, stated plainly: **deploy the code first, then run this.** Name the reason — purge in the older build still writes those two columns.
4. The SQL above.
5. This verification, which must return zero rows:

```sql
select column_name from information_schema.columns
where table_name = 'attendees' and column_name in ('company','phone','table_no')
union all
select column_name from information_schema.columns
where table_name = 'events' and column_name = 'collected_fields';
-- expect no rows
```

6. One sentence on what rollback means now: there is none for the data — restore the project from a Supabase backup taken before this ran. Say that a backup taken immediately before is the only safety net, because it is.

- [ ] **Step 3: Do not run it**

Applying this migration is the author's decision, taken with the verification queries in front of them. Write the file, write the runbook, commit, and report — run no SQL.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0015_fields_contract.sql docs/runbook.md
git commit -m "$(cat <<'MSG'
feat(db): migration 0015, fields contract

Drops attendees.company, attendees.phone, attendees.table_no and
events.collected_fields. Migration 0014 copied every value into `extra` and the
runbook's counting queries verified it; the code deployed since then reads
nothing else.

Irreversible, and the runbook says so: after this the only copy of those values
is `extra`, and the only way back is a restore. It also says to deploy before
running it — every read path is safe either way, but purge in the previous build
still names two of these columns.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Done when

- `grep -rn "LEGACY_COLUMN_KEYS\|collected_fields" src` returns nothing.
- No property read of `.company`, `.phone` or `.table_no` off an attendee row survives in `src` — only field-key strings.
- `npx vitest run`, `npx tsc --noEmit` and `npx eslint src tests` are clean.
- `supabase/migrations/0015_fields_contract.sql` exists and has **not** been applied; the runbook section tells the author how and in what order.

## Not in this plan

- Applying migration 0015. It is not a *task*, because no implementer may run it: it is the
  irreversible step, and it happens after these three tasks are reviewed and the code is
  deployed. The author has asked for it in this session, so the sequence is tasks →
  review → push → re-run 0014's six verification queries → apply 0015 → verify the columns
  are gone.
- The scanner field picker and raising the scan-card cap from 2 to 4 — still their own plan, still unwritten. The cap now holds exactly `company` and `table_no`, so an event wanting a third scan field has to drop one.
