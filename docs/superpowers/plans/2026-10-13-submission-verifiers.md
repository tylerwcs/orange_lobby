# Submission Verifiers and Revoke Reasons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- **Verifier links.** Each verifier gets their own per-person token link. It opens only one event's submissions, and lets them revoke an entry with a reason.
- **Revoke reasons.** Every revoke, by an admin or a verifier, carries a reason. The reason is picked from per-event templates, or typed under "Other". Attendees see it.

**Architecture:**
- **Pure rules** live in `src/features/activities/lib/revoke.ts` (reasons, credit lines, labels; client-safe).
- **Token resolution** lives in `src/features/activities/lib/verifier.ts`.
- **Database reads and writes** live in `src/features/activities/db/verifiers.ts` and the existing `db/activities.ts`.
- **The verifier's page** is `src/features/activities/verify/`, with thin route files under `src/app/verify/`.
- **Admin** gets a new **Verification** tab in Settings and a reason dialog on the Submissions tab's Revoke.
- **Attendees** get a read-only "Removed by the organiser" list. It sits beside the history, which still shows only live entries.

**Tech Stack:**
- Next.js 16 App Router: server components, server actions, one route handler. Read `node_modules/next/dist/docs/` before using any Next API not already used in this repo. `params` and `searchParams` are Promises.
- React 19, TypeScript, Tailwind v4, shadcn `base-nova` (Base UI).
- Supabase: service-role client; RLS on with no policies; the Supabase MCP `apply_migration`.
- Vitest: node environment, `tests/**/*.test.ts`, no DOM.

**Spec:** `docs/superpowers/specs/2026-10-13-submission-verifiers-design.md` (D492–D502). Read it first; this plan argues from it.

**Where this plan differs from the spec, on purpose:**
- **Revoke reasons are edited as one reason per line in a textarea, with a Save button**, like Committee alerts. The spec described add, edit, delete and move-up/down controls that save as you go. A textarea does all four with no new list component, and reordering means moving a line.
- **The Verification tab sits outside the big Settings form, with its own small forms**, as the Committee alerts tab already does. So nothing in it can blank another tab's fields.
- **The Excel export is unchanged.** `listSubmissions` exports live entries only (`status = 'submitted'`), so "Revoke reason" and "Revoked by" columns would always be empty.
- **The admin tooltip keeps today's wording** and appends the reason: `Revoked by Aisyah (verifier) on 13 Oct, 3:42 pm · Duplicate entry`.

## Global Constraints

- **Decision numbers:** D492–D502, as the spec assigns them. Cite them in comments the way the codebase does, e.g. `// D499: a copy of the wording, not a pointer.`
- **Revoke reason (D498, D499):**
  - Required on every revoke.
  - 1–300 characters after whitespace collapses to single spaces, counted by code points (`[...s].length`).
  - Stored as a copy of the wording in `activity_submissions.revoke_reason`.
- **Templates (D497):**
  - `events.revoke_reasons text[]`, at most **12**, each 1–300 characters, with no case-insensitive duplicates.
  - "Other" is never stored. Its radio value is the constant `OTHER = "__other"`, and its label is `"Other (type a reason)"`.
  - The defaults, verbatim, in this order: `Photo or file is unclear`, `Duplicate entry`, `Doesn't meet the activity's requirements`, `Submitted to the wrong activity`, `Inappropriate content`.
- **Verifier name:** 1–60 characters after whitespace collapses.
- **Tokens:** `generateToken()` and `isValidToken()` from `src/lib/tokens.ts`.
- **Rate limits** use `allow()` from `src/lib/ratelimit.ts`:
  - revokes: `verify:<linkId>`, 60 a minute
  - files: `verify-file:<linkId>`, 600 a minute
  - page loads: `verify-page:<linkId>`, 120 a minute
- **Routes:**
  - page: `/verify/[token]`
  - files: `/verify/[token]/files/[submissionId]/[key]`
- **Copy, verbatim:**
  - invalid link: title `"This link isn't valid"`, body `"Ask the organiser for the right one."`
  - missing reason: `"Pick a reason, or choose Other and type one."`
  - too long: `"Keep the reason to 300 characters or fewer."`
  - double revoke (verifier): `"Someone already revoked this entry."`
  - rate limited: `"Too many actions at once. Wait a moment and try again."`
  - attendee history label: `"Removed: <reason>"`
  - tracker label: `"Removed by the organiser: <reason>"`
  - with no reason, both labels read `"Removed by the organiser"`
- **New type fields are optional**, so the existing fixtures that spell out a full `ActivitySubmission` (in `tests/activities/tracker.test.ts`, `tests/activities/submissions.test.ts` and `tests/groups.test.ts`) keep compiling:
  - `ActivitySubmission.revoke_reason?`
  - `ActivitySubmission.revoked_by_verifier?`
  - `Event.revoke_reasons?`
- **Features are imported only through their entry:**
  - `@/features/activities` on the server, `@/features/activities/client` in the browser
  - inside the feature, imports are relative
  - `src/lib` never imports a feature
  - tests in `tests/activities/` may import internals directly
- **Never test on the event with slug `ecphub`:** it is a real event. Use `ecpkom` (id `4e64a90c-728c-4a08-af62-8c8046afa0c9`).
- **Supabase project:** `wfmqwwcolfigjylkgrsv`. Load the MCP tools with ToolSearch: `select:mcp__0687aa52-4553-40db-b867-72024a86f547__apply_migration,mcp__0687aa52-4553-40db-b867-72024a86f547__execute_sql,mcp__0687aa52-4553-40db-b867-72024a86f547__get_advisors`.
- **Git:**
  - Work on `main`.
  - Run `git pull --rebase --autostash` before each commit. Never push.
  - Never stage `docs/superpowers/specs/2026-09-27-intro-video-design.md` or `docs/image-guide/`.
  - Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Checks before every commit:** `npx tsc --noEmit`, `npm run lint` and `npm test` must all pass. `npm run build` also runs in Task 8.
- **Copy style:** sentence case, no exclamation marks.

## Review Focus

Five failure modes the spec implies, but no obvious test covers. Each has its test in the task that owns the code.

1. **A link removed or replaced while its page is open.**
   - The next revoke must be refused, and so must the next file open.
   - A replaced token must never resolve to the row's new token.
   - Pinned by: `resolveVerifier` tests (Task 2). The browser steps in Task 8.
2. **A verifier on event A forging a submission id from event B**, in the revoke action or in the file route. It must be refused as "no longer exists" or a 404.
   - Pinned by: `belongsToLink` tests (Task 2). Its use in both the action and the route (Tasks 6 and 7).
3. **An admin edits the templates while someone has the dialog open.**
   - A posted template that is no longer in the list is refused with the "pick a reason" copy. It is never saved as if it were free text.
   - Pinned by: the `parseRevokeReason` stale-template test (Task 2).
4. **Free text that is all whitespace, or 301 emoji.**
   - Whitespace-only counts as empty.
   - Length is counted in code points, matching Postgres `char_length`, so the DB check never throws.
   - Pinned by: the `parseRevokeReason` tests (Task 2).
5. **A revoked entry leaking into counting.**
   - Showing revoked rows to attendees must not change `canSubmit`, group progress or the tracker totals.
   - `submissionsForAttendee` and `submissionsForGroup` stay unchanged, and revoked rows travel in a separate `revoked` field.
   - Pinned by: the `revokedFor` test (Task 3), which proves the split keeps the live lists free of revoked rows.

## File map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/0077_submission_verifiers.sql` | create | `verifier_links`, two submission columns, `events.revoke_reasons` |
| `src/lib/types.ts` | modify | `VerifierLink`, new optional fields |
| `src/lib/db/events.ts` | modify | `hydrate` normalises `revoke_reasons` |
| `src/features/activities/lib/revoke.ts` | create | `OTHER`, limits, `reasonsOf`, `parseRevokeReason`, `parseReasonList`, `revokeCredit`, `attendeeRevokeLabel` |
| `src/features/activities/lib/verifier.ts` | create | `parseVerifierName`, `resolveVerifier`, `belongsToLink`, `verifyQuery` |
| `src/features/activities/db/verifiers.ts` | create | Verifier link CRUD, lookups, names, verify-page query |
| `src/features/activities/db/activities.ts` | modify | `revokeSubmission` takes a reason and who; `revokedForAttendee`, `revokedForGroup` |
| `src/features/activities/lib/portal-activity-entries.ts` | modify | `SubmissionEntry.revoked` |
| `src/components/admin/RowActions.tsx` | modify | New `dialog` prop: a menu item that opens a server-rendered form |
| `src/features/activities/kinds/submission/RevokeForm.tsx` | create | Reason radios + Other textarea (client) |
| `src/features/activities/kinds/submission/SubmissionTable.tsx`, `SubmissionDetail.tsx` | modify | Revoke opens `RevokeForm`; tooltip via `revokeCredit` |
| `src/features/activities/admin/actions.ts` | modify | `revokeSubmissionAction` reads the reason |
| `src/features/activities/admin/verifier-actions.ts` | create | Add, replace, remove verifier; save reasons |
| `src/features/activities/admin/VerificationTab.tsx` | create | Settings tab: Verifier links + Revoke reasons |
| `src/app/admin/events/[id]/settings/page.tsx` | modify | Verification tab |
| `src/lib/links.ts`, `src/lib/file-links.ts` | modify | `verifierLink`, `verifyFileHref`, `isImagePath` |
| `src/features/activities/verify/VerifyPage.tsx`, `VerifyCard.tsx`, `actions.ts` | create | The verifier's page and its revoke action |
| `src/app/verify/layout.tsx`, `src/app/verify/[token]/page.tsx`, `src/app/verify/[token]/files/[submissionId]/[key]/route.ts` | create | Routes |
| `src/features/activities/kinds/submission/RevokedList.tsx`, `SubmissionBody.tsx` | create/modify | Attendee's removed entries |
| `src/features/activities/kinds/submission/scoring/tracker/EntryTimeline.tsx` | modify | Tracker line with reason |
| `src/features/activities/index.ts`, `client.ts` | modify | Barrel exports |
| `tests/activities/revoke.test.ts`, `tests/activities/verifier.test.ts`, `tests/activities/revoked-entries.test.ts`, `tests/links.test.ts`, `tests/file-links.test.ts` | create/modify | Tests |

## Task order

1. Database and types.
2. Pure rules (`revoke.ts`, `verifier.ts`).
3. Database layer.
4. Admin revoke with a reason (RowActions `dialog`, `RevokeForm`, table, action).
5. Settings → Verification tab.
6. The verify page and its action.
7. The verify file route.
8. What attendees see, then the end-to-end check.

Each task leaves the app building and working. After Task 1 and before Task 4, admin revokes still work, with `revoke_reason` null.

---

### Task 1: Database: migration 0077 and types

**Files:**
- Create: `supabase/migrations/0077_submission_verifiers.sql`
- Modify: `src/lib/types.ts` (the `Event` type near `committee_alert_numbers: string[];` at line 78; `ActivitySubmission` ending at `file_hashes` near line 422)
- Modify: `src/lib/db/events.ts` (`hydrate`, lines 18–40)

**Interfaces:**
- Produces:
  - table `verifier_links(id, event_id, name, token, created_by, created_at, removed_at)`
  - columns `activity_submissions.revoke_reason`, `activity_submissions.revoked_by_verifier` and `events.revoke_reasons`
  - type `VerifierLink`
  - optional fields `ActivitySubmission.revoke_reason`, `ActivitySubmission.revoked_by_verifier` and `Event.revoke_reasons`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0077_submission_verifiers.sql`:

```sql
-- Submission verifiers and revoke reasons (spec 2026-10-13-submission-verifiers-design.md,
-- D492–D502). One table, two submission columns, one event column; no existing row changes
-- except that every event gets the default reason templates.

-- D492/D493: one link per person. Removing stamps removed_at so past revokes still name them;
-- replacing issues a new token on the same row.
create table if not exists public.verifier_links (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  token       text not null unique,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  removed_at  timestamptz
);
create index if not exists verifier_links_event_idx on public.verifier_links (event_id);
-- No policies: only the service role reads or writes, as on every table (0001).
alter table public.verifier_links enable row level security;

-- D499: a copy of the wording, so editing a template never rewrites what an attendee was told.
-- A verifier's revoke sets revoked_by_verifier and leaves revoked_by (an auth user) null.
alter table public.activity_submissions
  add column if not exists revoke_reason text
    check (revoke_reason is null or char_length(revoke_reason) between 1 and 300),
  add column if not exists revoked_by_verifier uuid references public.verifier_links (id) on delete set null;

-- D497: the templates, per event. Existing events get the defaults too.
alter table public.events
  add column if not exists revoke_reasons text[] not null default array[
    'Photo or file is unclear',
    'Duplicate entry',
    'Doesn''t meet the activity''s requirements',
    'Submitted to the wrong activity',
    'Inappropriate content'
  ]::text[];
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` with project `wfmqwwcolfigjylkgrsv`, name `0077_submission_verifiers`, and the file's SQL as the query.

- [ ] **Step 3: Check the database**

Use the Supabase MCP `execute_sql`:

```sql
select
  (select count(*) from information_schema.columns where table_name = 'verifier_links') as link_cols,
  (select count(*) from information_schema.columns where table_name = 'activity_submissions' and column_name in ('revoke_reason', 'revoked_by_verifier')) as sub_cols,
  (select revoke_reasons from events where slug = 'ecpkom') as ecpkom_reasons,
  (select count(*) from events where array_length(revoke_reasons, 1) = 5) as events_with_defaults,
  (select count(*) from events) as events;
```

Expected:
- `link_cols = 7`
- `sub_cols = 2`
- `ecpkom_reasons` lists the five defaults
- `events_with_defaults = events`

Then run `get_advisors` (type `security`). Expected: no new warning that names `verifier_links`. ("RLS enabled, no policy" is the same INFO every table has.)

- [ ] **Step 4: Add the types**

In `src/lib/types.ts`, add to `Event` directly after `committee_alert_numbers: string[];`:

```ts
  /** D497: the reasons offered when revoking a submission. Optional so old fixtures compile; hydrate always fills it. */
  revoke_reasons?: string[];
```

Add to `ActivitySubmission` directly after `file_hashes: Record<string, string>;`:

```ts
  /** D499: why it was revoked, a copy of the wording picked or typed; null on revokes before 0077. Optional so old fixtures compile. */
  revoke_reason?: string | null;
  /** D492: the verifier link that revoked it; null for an admin's revoke (see `revoked_by`). */
  revoked_by_verifier?: string | null;
```

Add after the `ActivitySubmission` type:

```ts
/** D492: one verifier's own link to an event's submissions. `removed_at` set means it no longer opens (D493). */
export type VerifierLink = {
  id: string;
  event_id: string;
  name: string;
  token: string;
  created_by: string | null;
  created_at: string;
  removed_at: string | null;
};
```

- [ ] **Step 5: Normalise in `hydrate`**

In `src/lib/db/events.ts`:
- Widen the `raw` cast type in `hydrate` with `revoke_reasons?: unknown`.
- Add this to the returned object, directly after the `export_fields` line:

```ts
    // Absent on a database that predates 0077 (D497); no templates leaves only "Other".
    revoke_reasons: Array.isArray(raw.revoke_reasons) ? raw.revoke_reasons.filter((r): r is string => typeof r === "string") : [],
```

- [ ] **Step 6: Run the checks**

Run: `npx tsc --noEmit; npm run lint; npm test`. Expected: all pass, and the tests are unchanged.

- [ ] **Step 7: Commit**

```bash
git pull --rebase --autostash
git add supabase/migrations/0077_submission_verifiers.sql src/lib/types.ts src/lib/db/events.ts
git commit -m "feat(db): verifier links and revoke reasons (D492, D497, D499)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Pure rules: `revoke.ts` and `verifier.ts`

**Files:**
- Create: `src/features/activities/lib/revoke.ts`
- Create: `src/features/activities/lib/verifier.ts`
- Modify: `src/features/activities/client.ts` (add `export * from "./lib/revoke";` after `export * from "./lib/tracker";`)
- Modify: `src/features/activities/index.ts` (add `export * from "./lib/verifier";` after `export * from "./lib/submission-uploads";`)
- Test: `tests/activities/revoke.test.ts`, `tests/activities/verifier.test.ts`

**Interfaces:**
- Consumes: `VerifierLink`, `ActivitySubmission`, `Event` (Task 1); `isValidToken` (`src/lib/tokens.ts`); `shortDateTime` (`src/lib/text.ts`).
- Produces:
  - `OTHER: "__other"`, `REASON_MAX = 300`, `MAX_REASONS = 12`, `NAME_MAX = 60`
  - `PICK_ERROR`, `TOO_LONG_ERROR`
  - `reasonsOf(ev: { revoke_reasons?: string[] }): string[]`
  - `parseRevokeReason(fd: { get(name: string): FormDataEntryValue | null }, templates: string[]): { reason: string } | { error: string }`
  - `parseReasonList(raw: string): { reasons: string[] } | { error: string }`
  - `revokeCredit(s: RevokeStamp, names: { admins: Record<string, string>; verifiers: Record<string, string> }): string`
  - `attendeeRevokeLabel(reason: string | null | undefined, where: "history" | "tracker"): string`
  - `parseVerifierName(raw: string): { name: string } | { error: string }`
  - `resolveVerifier(token: string, lookup: (token: string) => Promise<VerifierLink | null>): Promise<VerifierLink | null>`
  - `belongsToLink(link: Pick<VerifierLink, "event_id">, s: Pick<ActivitySubmission, "event_id"> | null): boolean`
  - `verifyQuery(raw: Record<string, string | undefined>): VerifyQuery`, with `type VerifyQuery = { activity: string | null; status: "submitted" | "revoked" | "all"; q: string; page: number }`
  - `verifyQueryString(q: VerifyQuery, patch?: Partial<VerifyQuery>): string`

- [ ] **Step 1: Write the failing tests for `revoke.ts`**

Create `tests/activities/revoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  OTHER, PICK_ERROR, TOO_LONG_ERROR, reasonsOf, parseRevokeReason, parseReasonList, revokeCredit, attendeeRevokeLabel,
} from "@/features/activities/lib/revoke";

const T = ["Photo or file is unclear", "Duplicate entry"];
const fd = (entries: Record<string, string>) => ({ get: (k: string) => entries[k] ?? null });

describe("reasonsOf (D497)", () => {
  it("is the event's list", () => expect(reasonsOf({ revoke_reasons: T })).toEqual(T));
  it("is empty when the column is missing", () => expect(reasonsOf({})).toEqual([]));
});

describe("parseRevokeReason (D498)", () => {
  it("accepts a template", () => {
    expect(parseRevokeReason(fd({ reason: "Duplicate entry" }), T)).toEqual({ reason: "Duplicate entry" });
  });

  it("accepts Other with text, whitespace collapsed", () => {
    expect(parseRevokeReason(fd({ reason: OTHER, other: "  Selfie   is\nmissing " }), T)).toEqual({ reason: "Selfie is missing" });
  });

  it("refuses nothing picked", () => {
    expect(parseRevokeReason(fd({}), T)).toEqual({ error: PICK_ERROR });
  });

  it("refuses Other left empty or all whitespace", () => {
    expect(parseRevokeReason(fd({ reason: OTHER, other: "   \n " }), T)).toEqual({ error: PICK_ERROR });
  });

  // Review Focus 3: the admin edited the list while the dialog was open.
  it("refuses a template that is no longer in the list, rather than saving it as free text", () => {
    expect(parseRevokeReason(fd({ reason: "Blurry photo" }), T)).toEqual({ error: PICK_ERROR });
  });

  // Review Focus 4: Postgres char_length counts code points, so this must too.
  it("counts code points, not UTF-16 units", () => {
    expect(parseRevokeReason(fd({ reason: OTHER, other: "🏃".repeat(300) }), T)).toEqual({ reason: "🏃".repeat(300) });
    expect(parseRevokeReason(fd({ reason: OTHER, other: "🏃".repeat(301) }), T)).toEqual({ error: TOO_LONG_ERROR });
  });
});

describe("parseReasonList (D497)", () => {
  it("reads one reason per line, skipping blank lines", () => {
    expect(parseReasonList("Duplicate entry\n\n  Photo  unclear \r\n")).toEqual({ reasons: ["Duplicate entry", "Photo unclear"] });
  });

  it("allows an empty list (only Other is offered)", () => {
    expect(parseReasonList("  \n ")).toEqual({ reasons: [] });
  });

  it("refuses a duplicate, ignoring case", () => {
    expect(parseReasonList("Duplicate entry\nduplicate ENTRY")).toEqual({ error: "\"duplicate ENTRY\" is in the list twice." });
  });

  it("refuses more than 12", () => {
    const lines = Array.from({ length: 13 }, (_, i) => `Reason ${i + 1}`).join("\n");
    expect(parseReasonList(lines)).toEqual({ error: "Keep it to 12 reasons or fewer." });
  });

  it("refuses a line over 300 characters", () => {
    expect(parseReasonList("x".repeat(301))).toEqual({ error: "Keep each reason to 300 characters or fewer." });
  });
});

describe("revokeCredit (D492)", () => {
  const names = { admins: { u1: "cs.wong@ecopiaevents.com" }, verifiers: { v1: "Aisyah" } };
  const at = "2026-10-13T07:42:00Z";

  it("names a verifier and the reason", () => {
    expect(revokeCredit({ revoked_at: at, revoked_by: null, revoked_by_verifier: "v1", revoke_reason: "Duplicate entry" }, names))
      .toMatch(/^Revoked by Aisyah \(verifier\) on .+ · Duplicate entry$/);
  });

  it("names an admin by email, and keeps today's wording with no reason", () => {
    expect(revokeCredit({ revoked_at: at, revoked_by: "u1", revoked_by_verifier: null, revoke_reason: null }, names))
      .toMatch(/^Revoked by cs\.wong@ecopiaevents\.com on [^·]+$/);
  });

  it("falls back when a name can't be resolved", () => {
    expect(revokeCredit({ revoked_at: null, revoked_by: "gone", revoked_by_verifier: null }, names)).toBe("Revoked by an admin");
    expect(revokeCredit({ revoked_at: null, revoked_by: null, revoked_by_verifier: "gone" }, names)).toBe("Revoked by a verifier");
  });
});

describe("attendeeRevokeLabel (D500)", () => {
  it("says why in the history and the tracker", () => {
    expect(attendeeRevokeLabel("Duplicate entry", "history")).toBe("Removed: Duplicate entry");
    expect(attendeeRevokeLabel("Duplicate entry", "tracker")).toBe("Removed by the organiser: Duplicate entry");
  });

  it("keeps the old wording for revokes with no reason", () => {
    expect(attendeeRevokeLabel(null, "history")).toBe("Removed by the organiser");
    expect(attendeeRevokeLabel(undefined, "tracker")).toBe("Removed by the organiser");
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/activities/revoke.test.ts`. Expected: FAIL, because the module `@/features/activities/lib/revoke` can't be resolved.

- [ ] **Step 3: Write `revoke.ts`**

Create `src/features/activities/lib/revoke.ts`:

```ts
import { shortDateTime } from "@/lib/text";
import type { ActivitySubmission } from "@/lib/types";

/**
 * Revoke reasons (spec 2026-10-13, D497–D500). Pure and client-safe: the admin table, the
 * verifier's page and the attendee's history all read their wording from here, so the three
 * can't drift on what a revoke says.
 */

/** The radio value for "Other". Never stored: "Other" is always offered, so it is not a template. */
export const OTHER = "__other";
/** Matches the `revoke_reason` check in 0077, which counts characters (code points). */
export const REASON_MAX = 300;
export const MAX_REASONS = 12;
export const NAME_MAX = 60;

export const PICK_ERROR = "Pick a reason, or choose Other and type one.";
export const TOO_LONG_ERROR = `Keep the reason to ${REASON_MAX} characters or fewer.`;

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();
const length = (s: string) => [...s].length;

/** D497: the event's templates. A database that predates 0077 has none, which leaves only "Other". */
export function reasonsOf(ev: { revoke_reasons?: string[] }): string[] {
  return ev.revoke_reasons ?? [];
}

/**
 * D498: the reason posted with a revoke. A template must still be in the event's list: one an
 * admin deleted while this dialog was open is refused, not quietly saved as if typed.
 */
export function parseRevokeReason(fd: { get(name: string): FormDataEntryValue | null }, templates: string[]): { reason: string } | { error: string } {
  const picked = String(fd.get("reason") ?? "");
  if (picked === OTHER) {
    const text = tidy(String(fd.get("other") ?? ""));
    if (!text) return { error: PICK_ERROR };
    if (length(text) > REASON_MAX) return { error: TOO_LONG_ERROR };
    return { reason: text };
  }
  return templates.includes(picked) ? { reason: picked } : { error: PICK_ERROR };
}

/** D497: the Settings textarea, one reason per line. */
export function parseReasonList(raw: string): { reasons: string[] } | { error: string } {
  const reasons = raw.split(/\r?\n/).map(tidy).filter(Boolean);
  if (reasons.length > MAX_REASONS) return { error: `Keep it to ${MAX_REASONS} reasons or fewer.` };
  if (reasons.some((r) => length(r) > REASON_MAX)) return { error: `Keep each reason to ${REASON_MAX} characters or fewer.` };
  const seen = new Set<string>();
  for (const r of reasons) {
    const key = r.toLowerCase();
    if (seen.has(key)) return { error: `"${r}" is in the list twice.` };
    seen.add(key);
  }
  return { reasons };
}

export type RevokeStamp = Pick<ActivitySubmission, "revoked_at" | "revoked_by" | "revoked_by_verifier" | "revoke_reason">;

/** D492: the admin table's tooltip. Today's "Revoked by X on <when>", plus the reason when there is one. */
export function revokeCredit(s: RevokeStamp, names: { admins: Record<string, string>; verifiers: Record<string, string> }): string {
  const who = s.revoked_by_verifier
    ? (names.verifiers[s.revoked_by_verifier] ? `${names.verifiers[s.revoked_by_verifier]} (verifier)` : "a verifier")
    : (s.revoked_by ? names.admins[s.revoked_by] : undefined) ?? "an admin";
  return `Revoked by ${who}${s.revoked_at ? ` on ${shortDateTime(s.revoked_at)}` : ""}${s.revoke_reason ? ` · ${s.revoke_reason}` : ""}`;
}

/** D500: what the attendee reads on a revoked entry. A revoke from before 0077 has no reason and keeps the old line. */
export function attendeeRevokeLabel(reason: string | null | undefined, where: "history" | "tracker"): string {
  if (!reason) return "Removed by the organiser";
  return where === "history" ? `Removed: ${reason}` : `Removed by the organiser: ${reason}`;
}
```

Check: `PICK_ERROR` and `TOO_LONG_ERROR` match the Global Constraints copy exactly.

- [ ] **Step 4: Run them and see them pass**

Run: `npx vitest run tests/activities/revoke.test.ts`. Expected: PASS.

- [ ] **Step 5: Write the failing tests for `verifier.ts`**

Create `tests/activities/verifier.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseVerifierName, resolveVerifier, belongsToLink, verifyQuery, verifyQueryString } from "@/features/activities/lib/verifier";
import type { VerifierLink } from "@/lib/types";

const link = (over: Partial<VerifierLink> = {}): VerifierLink => ({
  id: "v1", event_id: "e1", name: "Aisyah", token: "k7m2xq9rt4bd", created_by: null,
  created_at: "2026-10-13T00:00:00Z", removed_at: null, ...over,
});

describe("parseVerifierName", () => {
  it("collapses whitespace", () => expect(parseVerifierName("  Aisyah   Rahman ")).toEqual({ name: "Aisyah Rahman" }));
  it("refuses empty", () => expect(parseVerifierName("   ")).toEqual({ error: "Add their name." }));
  it("refuses over 60", () => expect(parseVerifierName("x".repeat(61))).toEqual({ error: "Keep the name to 60 characters or fewer." }));
});

// Review Focus 1: removed and replaced links stop at once.
describe("resolveVerifier (D496)", () => {
  const db = new Map<string, VerifierLink>();
  const lookup = async (t: string) => db.get(t) ?? null;

  it("refuses a malformed token without asking the database", async () => {
    let asked = false;
    expect(await resolveVerifier("nope", async () => { asked = true; return link(); })).toBeNull();
    expect(asked).toBe(false);
  });

  it("finds a live link", async () => {
    db.set("k7m2xq9rt4bd", link());
    expect((await resolveVerifier("k7m2xq9rt4bd", lookup))?.name).toBe("Aisyah");
  });

  it("refuses a removed link", async () => {
    db.set("k7m2xq9rt4bd", link({ removed_at: "2026-10-14T00:00:00Z" }));
    expect(await resolveVerifier("k7m2xq9rt4bd", lookup)).toBeNull();
  });

  it("refuses a replaced token: the row now carries another one", async () => {
    db.clear();
    db.set("k7m2xq9rt4bd", link({ token: "abcdefghjkmn" })); // a stale cache returning the row under its old key
    expect(await resolveVerifier("k7m2xq9rt4bd", lookup)).toBeNull();
  });

  it("refuses an unknown token", async () => {
    expect(await resolveVerifier("zzzzzzzzzzzz", lookup)).toBeNull();
  });
});

// Review Focus 2: a submission from another event is never theirs.
describe("belongsToLink", () => {
  it("is true only for the link's own event", () => {
    expect(belongsToLink(link(), { event_id: "e1" })).toBe(true);
    expect(belongsToLink(link(), { event_id: "e2" })).toBe(false);
    expect(belongsToLink(link(), null)).toBe(false);
  });
});

describe("verifyQuery", () => {
  it("defaults to To check, page 0", () => {
    expect(verifyQuery({})).toEqual({ activity: null, status: "submitted", q: "", page: 0 });
  });

  it("keeps known values and drops junk", () => {
    expect(verifyQuery({ activity: "a1", status: "revoked", q: " Ali ", page: "2" })).toEqual({ activity: "a1", status: "revoked", q: "Ali", page: 2 });
    expect(verifyQuery({ status: "deleted", page: "-1" })).toEqual({ activity: null, status: "submitted", q: "", page: 0 });
  });

  it("writes back only what differs from the defaults", () => {
    expect(verifyQueryString(verifyQuery({}))).toBe("");
    expect(verifyQueryString(verifyQuery({ status: "all", q: "Ali" }), { page: 1 })).toBe("?status=all&q=Ali&page=1");
  });
});
```

- [ ] **Step 6: Run them and see them fail**

Run: `npx vitest run tests/activities/verifier.test.ts`. Expected: FAIL, because the module can't be resolved.

- [ ] **Step 7: Write `verifier.ts`**

Create `src/features/activities/lib/verifier.ts`:

```ts
import { isValidToken } from "@/lib/tokens";
import type { ActivitySubmission, VerifierLink } from "@/lib/types";
import { NAME_MAX } from "./revoke";

/**
 * Verifier links (D492–D496). Server-side rules, kept apart from `revoke.ts` because
 * `isValidToken` comes from a module that imports node:crypto.
 */

export function parseVerifierName(raw: string): { name: string } | { error: string } {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return { error: "Add their name." };
  if ([...name].length > NAME_MAX) return { error: `Keep the name to ${NAME_MAX} characters or fewer.` };
  return { name };
}

/**
 * D496: every page load, action and file asks this. A malformed token never reaches the
 * database; a removed link, or a row whose token has since been replaced, is no link at all.
 */
export async function resolveVerifier(token: string, lookup: (token: string) => Promise<VerifierLink | null>): Promise<VerifierLink | null> {
  if (!isValidToken(token)) return null;
  const link = await lookup(token);
  return link && link.removed_at === null && link.token === token ? link : null;
}

/** D495: a verifier sees their link's event and nothing else - an id from another event is not theirs. */
export function belongsToLink(link: Pick<VerifierLink, "event_id">, s: Pick<ActivitySubmission, "event_id"> | null): boolean {
  return s !== null && s.event_id === link.event_id;
}

export type VerifyStatus = "submitted" | "revoked" | "all";
export type VerifyQuery = { activity: string | null; status: VerifyStatus; q: string; page: number };

/** The verify page's filters from its search params. Anything unrecognised reads as the default. */
export function verifyQuery(raw: Record<string, string | undefined>): VerifyQuery {
  const status = raw.status === "revoked" || raw.status === "all" ? raw.status : "submitted";
  const page = /^\d+$/.test(raw.page ?? "") ? Number(raw.page) : 0;
  return { activity: raw.activity || null, status, q: (raw.q ?? "").trim(), page };
}

/** Back to a query string, `?`-prefixed, or "" when everything is the default. */
export function verifyQueryString(q: VerifyQuery, patch: Partial<VerifyQuery> = {}): string {
  const v = { ...q, ...patch };
  const p = new URLSearchParams();
  if (v.activity) p.set("activity", v.activity);
  if (v.status !== "submitted") p.set("status", v.status);
  if (v.q) p.set("q", v.q);
  if (v.page > 0) p.set("page", String(v.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}
```

- [ ] **Step 8: Add the barrel exports**

- In `src/features/activities/client.ts`, add `export * from "./lib/revoke";` after `export * from "./lib/tracker";`.
- In `src/features/activities/index.ts`, add `export * from "./lib/verifier";` after `export * from "./lib/submission-uploads";`.

- [ ] **Step 9: Run the checks**

Run: `npx vitest run tests/activities/revoke.test.ts tests/activities/verifier.test.ts`, then `npx tsc --noEmit; npm run lint; npm test`. Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git pull --rebase --autostash
git add src/features/activities/lib/revoke.ts src/features/activities/lib/verifier.ts src/features/activities/client.ts src/features/activities/index.ts tests/activities/revoke.test.ts tests/activities/verifier.test.ts
git commit -m "feat(activities): revoke reason and verifier link rules (D492-D500)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Database layer

**Files:**
- Create: `src/features/activities/db/verifiers.ts`
- Modify: `src/features/activities/db/activities.ts`:
  - `revokeSubmission`, lines 451–457
  - add `revokedForAttendee` and `revokedForGroup` after `submissionsForGroup`, line ~393
- Modify: `src/features/activities/admin/actions.ts:402`, the only caller of `revokeSubmission`. It keeps working, with a temporary reason (see Step 3).
- Modify: `src/features/activities/lib/portal-activity-entries.ts`
- Modify: `src/features/activities/index.ts` (add `export * from "./db/verifiers";` after `export * from "./db/doors";`)
- Create: `src/features/activities/lib/revoked-entries.ts` (the pure split)
- Test: `tests/activities/revoked-entries.test.ts`

**Interfaces:**
- Consumes: `VerifierLink` (Task 1), `generateToken`, `serviceClient`, `selectAll`.
- Produces:
  - `listVerifierLinks(eventId: string): Promise<VerifierLink[]>` (live only, oldest first)
  - `verifierByToken(token: string): Promise<VerifierLink | null>`
  - `addVerifierLink(eventId: string, name: string, userId: string): Promise<VerifierLink>`
  - `replaceVerifierToken(eventId: string, id: string): Promise<boolean>`
  - `removeVerifierLink(eventId: string, id: string): Promise<boolean>`
  - `verifierNames(ids: (string | null | undefined)[]): Promise<Record<string, string>>` (removed links included)
  - `VERIFY_PAGE_SIZE = 30`
  - `submissionsForVerify(o: { eventId: string; activityIds: string[]; status: VerifyStatus; attendeeIds: string[] | null; page: number }): Promise<{ rows: ActivitySubmission[]; more: boolean }>`
  - `type RevokedBy = { userId: string } | { verifierId: string }`
  - `revokeSubmission(id: string, activityId: string, reason: string, by: RevokedBy): Promise<boolean>`
  - `revokedForAttendee(attendeeId: string): Promise<ActivitySubmission[]>` and `revokedForGroup(groupId: string): Promise<ActivitySubmission[]>`, both newest revoke first
  - `revokedFor(form: Pick<Activity, "id" | "group_mode">, mine: ActivitySubmission[], group: ActivitySubmission[]): ActivitySubmission[]`
  - `SubmissionEntry.revoked: ActivitySubmission[]`

- [ ] **Step 1: Write the failing test for the split**

Create `tests/activities/revoked-entries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { revokedFor } from "@/features/activities/lib/revoked-entries";
import type { ActivitySubmission } from "@/lib/types";

const s = (id: string, activity_id: string, status: "submitted" | "revoked" = "revoked") =>
  ({ id, activity_id, status }) as ActivitySubmission;

// Review Focus 5: revoked rows reach the attendee only through this list, never through the
// live lists that canSubmit and group progress read.
describe("revokedFor (D501)", () => {
  const mine = [s("m1", "f1"), s("m2", "f2")];
  const group = [s("g1", "f1"), s("m1", "f1")];

  it("a personal form shows the attendee's own revoked rows for that form", () => {
    expect(revokedFor({ id: "f1", group_mode: "off" }, mine, group).map((x) => x.id)).toEqual(["m1"]);
  });

  it("members mode is personal too (D369)", () => {
    expect(revokedFor({ id: "f2", group_mode: "members" }, mine, group).map((x) => x.id)).toEqual(["m2"]);
  });

  it("a group form shows the group's revoked rows, including the attendee's own", () => {
    expect(revokedFor({ id: "f1", group_mode: "entries" }, mine, group).map((x) => x.id)).toEqual(["g1", "m1"]);
  });

  it("never passes a live row through", () => {
    expect(revokedFor({ id: "f1", group_mode: "off" }, [s("x", "f1", "submitted")], [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/activities/revoked-entries.test.ts`. Expected: FAIL, because the module can't be resolved.

- [ ] **Step 3: Write the code**

Create `src/features/activities/lib/revoked-entries.ts`:

```ts
import type { Activity, ActivitySubmission } from "@/lib/types";
import { isGroupForm } from "./submissions";

/**
 * D500/D501: which revoked entries one form shows an attendee. For display only - canSubmit,
 * group progress and every count keep reading the live lists, which never hold a revoked row.
 */
export function revokedFor(form: Pick<Activity, "id" | "group_mode">, mine: ActivitySubmission[], group: ActivitySubmission[]): ActivitySubmission[] {
  const pool = isGroupForm(form.group_mode) ? group : mine;
  return pool.filter((s) => s.activity_id === form.id && s.status === "revoked");
}
```

In `src/features/activities/db/activities.ts`, replace `revokeSubmission` (lines 450–457) with:

```ts
/** D492: an admin (an auth user) or a verifier link; exactly one of the two stamps is set. */
export type RevokedBy = { userId: string } | { verifierId: string };

/**
 * D338. Status, not a delete: the row and its files stay. False when already revoked or gone.
 * D498/D499: always with a reason, stored as the wording itself.
 */
export async function revokeSubmission(id: string, activityId: string, reason: string, by: RevokedBy): Promise<boolean> {
  const { data, error } = await serviceClient().from("activity_submissions")
    .update({
      status: "revoked", revoked_at: new Date().toISOString(), revoke_reason: reason,
      revoked_by: "userId" in by ? by.userId : null,
      revoked_by_verifier: "verifierId" in by ? by.verifierId : null,
    })
    .eq("id", id).eq("activity_id", activityId).eq("status", "submitted").select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
```

Add after `submissionsForGroup`:

```ts
/** D500: an attendee's revoked entries, for display beside their history. Never counted (D501). */
export async function revokedForAttendee(attendeeId: string): Promise<ActivitySubmission[]> {
  const { data, error } = await serviceClient().from("activity_submissions").select("*")
    .eq("attendee_id", attendeeId).eq("status", "revoked").order("revoked_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ActivitySubmission[];
}

/** D500: a group's revoked entries, which every member of a group form sees. */
export async function revokedForGroup(groupId: string): Promise<ActivitySubmission[]> {
  const { data, error } = await serviceClient().from("activity_submissions").select("*")
    .eq("group_id", groupId).eq("status", "revoked").order("revoked_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ActivitySubmission[];
}
```

In `src/features/activities/admin/actions.ts:402`, keep the build green until Task 4 replaces this line:

```ts
  if (!(await revokeSubmission(submissionId, activity.id, "Revoked by the organiser", { userId }))) {
```

Create `src/features/activities/db/verifiers.ts`:

```ts
import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { generateToken } from "@/lib/tokens";
import type { ActivitySubmission, VerifierLink } from "@/lib/types";
import type { VerifyStatus } from "../lib/verifier";

const links = () => serviceClient().from("verifier_links");

/** D493: the live links, oldest first. Removed ones stay in the table for the record, not here. */
export async function listVerifierLinks(eventId: string): Promise<VerifierLink[]> {
  const { data, error } = await links().select("*").eq("event_id", eventId).is("removed_at", null).order("created_at");
  if (error) throw error;
  return (data ?? []) as VerifierLink[];
}

/** Raw lookup; `resolveVerifier` decides whether it still opens anything (D496). */
export async function verifierByToken(token: string): Promise<VerifierLink | null> {
  const { data, error } = await links().select("*").eq("token", token).maybeSingle();
  if (error) throw error;
  return (data as VerifierLink | null) ?? null;
}

export async function addVerifierLink(eventId: string, name: string, userId: string): Promise<VerifierLink> {
  const { data, error } = await links().insert({ event_id: eventId, name, token: generateToken(), created_by: userId }).select("*").single();
  if (error) throw error;
  return data as VerifierLink;
}

/** D493: a new token on the same row - same name, same history; every copy of the old URL stops. */
export async function replaceVerifierToken(eventId: string, id: string): Promise<boolean> {
  const { data, error } = await links().update({ token: generateToken() })
    .eq("id", id).eq("event_id", eventId).is("removed_at", null).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** D493: stamped, not deleted, so "Revoked by Aisyah (verifier)" keeps its name. */
export async function removeVerifierLink(eventId: string, id: string): Promise<boolean> {
  const { data, error } = await links().update({ removed_at: new Date().toISOString() })
    .eq("id", id).eq("event_id", eventId).is("removed_at", null).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** Link ids to names for revoke credits, removed links included. Unresolvable ids are absent. */
export async function verifierNames(ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return {};
  const { data, error } = await links().select("id, name").in("id", unique);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r: { id: string; name: string }) => [r.id, r.name]));
}

export const VERIFY_PAGE_SIZE = 30;

/**
 * D495: one page of the verify list, newest first, across the given submission activities.
 * Reads one row past the page to know whether there is another. `attendeeIds` null means
 * everyone; an empty list (a name search that matched nobody) means no rows.
 */
export async function submissionsForVerify(o: {
  eventId: string; activityIds: string[]; status: VerifyStatus; attendeeIds: string[] | null; page: number;
}): Promise<{ rows: ActivitySubmission[]; more: boolean }> {
  if (o.activityIds.length === 0 || (o.attendeeIds && o.attendeeIds.length === 0)) return { rows: [], more: false };
  let q = serviceClient().from("activity_submissions").select("*").eq("event_id", o.eventId).in("activity_id", o.activityIds);
  if (o.status !== "all") q = q.eq("status", o.status);
  if (o.attendeeIds) q = q.in("attendee_id", o.attendeeIds);
  const from = o.page * VERIFY_PAGE_SIZE;
  const { data, error } = await q.order("created_at", { ascending: false }).order("id").range(from, from + VERIFY_PAGE_SIZE);
  if (error) throw error;
  const rows = (data ?? []) as ActivitySubmission[];
  return { rows: rows.slice(0, VERIFY_PAGE_SIZE), more: rows.length > VERIFY_PAGE_SIZE };
}
```

In `src/features/activities/index.ts`:
- Add `export * from "./db/verifiers";` after `export * from "./db/doors";`.
- Add `export * from "./lib/revoked-entries";` after the `./lib/verifier` line.

In `src/features/activities/lib/portal-activity-entries.ts`:
1. Change the import to also bring in `revokedForAttendee, revokedForGroup` from `"../db/activities"`, and add `import { revokedFor } from "./revoked-entries";`.
2. Change the type to `export type SubmissionEntry = { form: Activity; state: SubmitState; mine: ActivitySubmission[]; group: GroupProgress | null; revoked: ActivitySubmission[] };`.
3. Extend the `Promise.all` destructuring with `revokedMine, revokedGroup`, and add two entries at the end of its array:

```ts
    revokedForAttendee(attendee.id),
    hasGroupForm ? revokedForGroup(attendee.group_id!) : Promise.resolve([]),
```

4. In the `forms` map, return `{ form, state: ..., mine: sent, group, revoked: revokedFor(form, revokedMine, revokedGroup) }`.

Then run `npx tsc --noEmit`. Fix every place that builds a `SubmissionEntry` literal by adding `revoked: []`. The ones in `tests/` count as well; search with `grep -rn "mine:" tests src | grep -i "group:"`.

- [ ] **Step 4: Run the checks**

Run: `npx vitest run tests/activities/revoked-entries.test.ts`, then `npx tsc --noEmit; npm run lint; npm test`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git pull --rebase --autostash
git add src/features/activities/db/verifiers.ts src/features/activities/db/activities.ts src/features/activities/admin/actions.ts src/features/activities/lib/revoked-entries.ts src/features/activities/lib/portal-activity-entries.ts src/features/activities/index.ts tests/activities/revoked-entries.test.ts
git commit -m "feat(activities): verifier links store, revokes carry a reason and who (D492, D499, D501)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Admin revoke with a reason

**Files:**
- Modify: `src/components/admin/RowActions.tsx` (props at lines 36–48; the menu at lines 73–110; the dialogs after line 110)
- Create: `src/features/activities/kinds/submission/RevokeForm.tsx`
- Modify: `src/features/activities/kinds/submission/SubmissionTable.tsx`
- Modify: `src/features/activities/kinds/submission/SubmissionDetail.tsx` (the `adminNames` line ~48; the `SubmissionTable` props ~line 157)
- Modify: `src/features/activities/admin/actions.ts` (`revokeSubmissionAction`, lines 386–412)
- Modify: `src/features/activities/index.ts` (add `export * from "./kinds/submission/RevokeForm";`)

**Interfaces:**
- Consumes: `OTHER`, `REASON_MAX`, `reasonsOf`, `parseRevokeReason`, `revokeCredit` (Task 2); `revokeSubmission`, `verifierNames` (Task 3).
- Produces:
  - `RowActions` prop `dialog?: { label: string; title: string; hint?: string; form: React.ReactNode; destructive?: boolean }`
  - `RevokeForm({ action, reasons }: { action: (fd: FormData) => Promise<void>; reasons: string[] })`
  - `revokeSubmissionAction(eventId: string, activityId: string, submissionId: string, fd: FormData)`

- [ ] **Step 1: Add the `dialog` prop to `RowActions`**

In `src/components/admin/RowActions.tsx`:

1. Add a prop to the destructured list and the type, after `remove`:

```ts
  /**
   * D498: an action that needs a few words before it runs (Revoke with its reason, Replace link).
   * Opens a dialog holding `form`, rendered by the server like `edit.form`; the form's action
   * redirects, and the URL changing closes it. `destructive` puts it in the red section, above Delete.
   */
  dialog?: { label: string; title: string; hint?: string; form: React.ReactNode; destructive?: boolean };
```

2. Add state beside `confirming`: `const [dialogOpen, setDialogOpen] = useState(false);`. In the existing address effect, add `setDialogOpen(false);` directly after `setEditing(false);`.
3. Change `hasTop` to `Boolean(edit || actions.length || links.length || (dialog && !dialog.destructive))`.
4. In the top `DropdownMenuGroup`, after the `links.map(...)` block, add:

```tsx
              {dialog && !dialog.destructive && <DropdownMenuItem onClick={() => setDialogOpen(true)}>{dialog.label}</DropdownMenuItem>}
```

5. Replace the `{remove && (...)}` menu block with one that also carries a destructive dialog:

```tsx
          {(remove || dialog?.destructive) && (
            <>
              {(hasTop || hasMove) && <DropdownMenuSeparator />}
              {dialog?.destructive && <DropdownMenuItem variant="destructive" onClick={() => setDialogOpen(true)}><Trash2 />{dialog.label}</DropdownMenuItem>}
              {remove && <DropdownMenuItem variant="destructive" disabled={Boolean(remove.blocked)} onClick={() => setConfirming(true)}><Trash2 />{removeLabel}</DropdownMenuItem>}
              {remove?.blocked && <p className="px-2 pb-1.5 text-xs text-muted-foreground">{remove.blocked}</p>}
            </>
          )}
```

6. After the `{edit && (<Dialog ...>)}` block, add:

```tsx
      {dialog && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{dialog.title}</DialogTitle>
              {dialog.hint && <DialogDescription>{dialog.hint}</DialogDescription>}
            </DialogHeader>
            <div className="max-h-[70vh] overflow-y-auto">{dialog.form}</div>
          </DialogContent>
        </Dialog>
      )}
```

- [ ] **Step 2: Create `RevokeForm`**

Create `src/features/activities/kinds/submission/RevokeForm.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { OTHER, REASON_MAX } from "../../lib/revoke";

/**
 * D498: the reason picker every revoke goes through - the admin's Submissions table and the
 * verifier's page alike. The event's templates as radios, then "Other", whose box appears
 * only once it is picked. `required` on the radios stops an empty post in the browser;
 * `parseRevokeReason` is what actually decides.
 */
export function RevokeForm({ action, reasons }: { action: (fd: FormData) => Promise<void>; reasons: string[] }) {
  const [picked, setPicked] = useState("");
  return (
    <form action={action} className="flex flex-col gap-4 p-1">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-bold">Reason</legend>
        {[...reasons, OTHER].map((r) => (
          <label key={r} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input type="radio" name="reason" value={r} required checked={picked === r} onChange={() => setPicked(r)} className="size-4 shrink-0 accent-primary" />
            {r === OTHER ? "Other (type a reason)" : r}
          </label>
        ))}
      </fieldset>
      {picked === OTHER && (
        <Textarea name="other" required maxLength={REASON_MAX} rows={3} autoFocus aria-label="Your reason" placeholder="What should they fix?" />
      )}
      <SubmitButton variant="destructive">Revoke</SubmitButton>
    </form>
  );
}
```

Add `export * from "./kinds/submission/RevokeForm";` to `src/features/activities/index.ts`, next to the other `kinds/submission` exports.

- [ ] **Step 3: Read the reason in the action**

In `src/features/activities/admin/actions.ts`:
- Import `parseRevokeReason, reasonsOf` from `"../lib/revoke"`.
- Replace `revokeSubmissionAction` with:

```ts
/**
 * Revokes one submission (D338): a status, not a delete, so the row and its files stay and the
 * admin table keeps it, greyed (D340). It stops counting everywhere (D339), which is what lets
 * the attendee submit again. Scoped to this activity the same way `editSubmissionAction` is.
 * D498: always with a reason, from the event's templates or typed under Other.
 */
export async function revokeSubmissionAction(eventId: string, activityId: string, submissionId: string, fd: FormData) {
  const { orgId, userId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const activity = await submissionOf(ev, activityId);
  const current = await getSubmission(submissionId);
  const back = submissionsBack(eventId, activity, current);
  if (!current || current.activity_id !== activity.id) {
    revalidatePath(detailPath(eventId, activityId));
    redirect(flashPath(back, "That submission no longer exists.", "error"));
  }
  const parsed = parseRevokeReason(fd, reasonsOf(ev));
  if ("error" in parsed) redirect(flashPath(back, parsed.error, "error"));
  if (!(await revokeSubmission(submissionId, activity.id, parsed.reason, { userId }))) {
    revalidatePath(detailPath(eventId, activityId));
    redirect(flashPath(back, "That submission was already revoked.", "error"));
  }
  const attendee = await getAttendee(current.attendee_id);
  const name = attendee?.name ?? "Someone";
  // The list page's "X of Y submitted" counts live rows, so it moved too.
  revalidatePath(listPath(eventId));
  revalidatePath(detailPath(eventId, activityId));
  redirect(flashPath(back, `${name}'s submission is revoked. They'll see why, and can submit again${activity.is_open ? "." : " once it's open."}`));
}
```

- [ ] **Step 4: Wire the table**

In `src/features/activities/kinds/submission/SubmissionTable.tsx`:

1. Imports: add `import { RevokeForm } from "./RevokeForm";` and `import { revokeCredit } from "../../lib/revoke";`.
2. Props: change `revoke` to `revoke: (submissionId: string, fd: FormData) => Promise<void>;`, and add:

```ts
  /** D497: the event's templates for the revoke dialog. */
  reasons: string[];
  /** D492: `revoked_by_verifier` resolved to the link's name. */
  verifierNames: Record<string, string>;
```

   Add `reasons` and `verifierNames` to the destructuring.
3. The Revoked badge: `title={revokeCredit(submission, { admins: adminNames, verifiers: verifierNames })}`.
4. In `RowActions`, replace the `remove={{ ... }}` prop with:

```tsx
                    dialog={{
                      label: "Revoke",
                      title: `Revoke ${who.name}'s submission?`,
                      hint: "It stops counting and they can submit again. They'll see the reason you pick. It stays here, marked Revoked.",
                      destructive: true,
                      form: <RevokeForm action={revoke.bind(null, submission.id)} reasons={reasons} />,
                    }}
```

5. Update the doc comment's last paragraph: "A live row's ⋯ menu edits its answers in the portal's own fields (D337) or revokes it with a reason (D498)."

In `src/features/activities/kinds/submission/SubmissionDetail.tsx`:
- Import `verifierNames` from `"../../db/verifiers"` and `reasonsOf` from `"../../lib/revoke"`.
- After the `adminNames` line, add:

```ts
  // D492: a verifier's revoke names the link, not an auth user.
  const verifiers = await verifierNames(submissions.map((s) => s.revoked_by_verifier));
```

- Pass `reasons={reasonsOf(ev)} verifierNames={verifiers}` to `<SubmissionTable>`. The existing `revoke={revokeSubmissionAction.bind(null, ev.id, activity.id)}` now binds to a function that takes `(submissionId, fd)`, which matches.

- [ ] **Step 5: Run the checks**

Run: `npx tsc --noEmit; npm run lint; npm test`. Expected: all pass.

- [ ] **Step 6: Check it in the browser**

- Start the dev server: `preview_start` with the project's dev configuration. Create `.claude/launch.json` running `npm run dev` on port 3000 if none exists.
- Sign in as admin and open an `ecpkom` submission activity's Submissions tab (`/admin/events/4e64a90c-728c-4a08-af62-8c8046afa0c9/activities` → a submission activity → Submissions). If it has no live entries, create one through the portal as an `ecpkom` ZZ test attendee.
- On one row: ⋯ → Revoke.
  - Expected: a dialog with the five reasons plus "Other (type a reason)".
- Pressing Revoke with nothing picked: the browser blocks it.
- Pick Other: the textarea appears. Type `Selfie missing` and press Revoke.
  - Expected: the dialog closes, the flash says "…They'll see why…", and the row turns grey.
  - The Revoked badge's title reads `Revoked by <your email> on … · Selfie missing`.
- Confirm with `execute_sql`: `select revoke_reason, revoked_by, revoked_by_verifier from activity_submissions where id = '<id>'` returns `Selfie missing`, your user id, and null.

- [ ] **Step 7: Commit**

```bash
git pull --rebase --autostash
git add src/components/admin/RowActions.tsx src/features/activities/kinds/submission/RevokeForm.tsx src/features/activities/kinds/submission/SubmissionTable.tsx src/features/activities/kinds/submission/SubmissionDetail.tsx src/features/activities/admin/actions.ts src/features/activities/index.ts
git commit -m "feat(activities): revoking a submission asks for a reason (D498)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Settings → Verification tab

**Files:**
- Modify: `src/lib/links.ts` (add `verifierLink` after `hostLink`)
- Modify: `tests/links.test.ts` (add the import and one `describe`)
- Create: `src/features/activities/admin/verifier-actions.ts`
- Create: `src/features/activities/admin/VerificationTab.tsx`
- Modify: `src/features/activities/index.ts` (export the tab and the actions)
- Modify: `src/app/admin/events/[id]/settings/page.tsx` (lines 80–125 and after the alerts `TabsContent`)

**Interfaces:**
- Consumes: `listVerifierLinks`, `addVerifierLink`, `replaceVerifierToken`, `removeVerifierLink` (Task 3); `parseVerifierName` (Task 2); `parseReasonList`, `reasonsOf` (Task 2); `RowActions` `dialog` (Task 4).
- Produces:
  - `verifierLink(base: string, token: string): string`, giving `<base>/verify/<token>`
  - `addVerifierAction(eventId: string, fd: FormData)`
  - `replaceVerifierLinkAction(eventId: string, linkId: string)`
  - `removeVerifierAction(eventId: string, linkId: string)`
  - `saveRevokeReasonsAction(eventId: string, fd: FormData)`
  - `VerificationTab({ ev }: { ev: Event })`

- [ ] **Step 1: Write the failing link test**

In `tests/links.test.ts`, add `verifierLink` to the import from `@/lib/links`, and append:

```ts
describe("verifierLink (D492)", () => {
  it("is staff-facing, on the app's address, by token alone", () => {
    expect(verifierLink("https://events.example.com/", "k7m2xq9rt4bd")).toBe("https://events.example.com/verify/k7m2xq9rt4bd");
  });
});
```

Run: `npx vitest run tests/links.test.ts`. Expected: FAIL, because `verifierLink` is not exported.

- [ ] **Step 2: Add `verifierLink`**

In `src/lib/links.ts`, after `hostLink`:

```ts
/** D492: one verifier's own link to an event's submissions. Staff-facing like the crew link, looked up by token alone. */
export function verifierLink(base: string, token: string) {
  return `${trimSlash(base)}/verify/${token}`;
}
```

Run: `npx vitest run tests/links.test.ts`. Expected: PASS.

- [ ] **Step 3: Write the actions**

Create `src/features/activities/admin/verifier-actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent, updateEvent } from "@/lib/db/events";
import { flashPath } from "@/lib/flash";
import { featureForActivityKind, requireFeature } from "@/features/catalogue";
import { addVerifierLink, replaceVerifierToken, removeVerifierLink } from "../db/verifiers";
import { parseVerifierName } from "../lib/verifier";
import { parseReasonList } from "../lib/revoke";

const settingsPath = (eventId: string) => `/admin/events/${eventId}/settings`;

/** D502: the Verification tab's writes. Submissions are part of the Engagement add-on, so each one checks it. */
async function guard(eventId: string) {
  const { orgId, userId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  await requireFeature(ev.id, featureForActivityKind("submission"), settingsPath(eventId));
  return { ev, userId };
}

export async function addVerifierAction(eventId: string, fd: FormData) {
  const { ev, userId } = await guard(eventId);
  const parsed = parseVerifierName(String(fd.get("name") ?? ""));
  if ("error" in parsed) redirect(flashPath(settingsPath(eventId), parsed.error, "error"));
  await addVerifierLink(ev.id, parsed.name, userId);
  revalidatePath(settingsPath(eventId));
  redirect(flashPath(settingsPath(eventId), `Link made for ${parsed.name}. Copy it and send it to them.`));
}

/** D493: same name and history, new token; the old URL stops at once. */
export async function replaceVerifierLinkAction(eventId: string, linkId: string) {
  const { ev } = await guard(eventId);
  const ok = await replaceVerifierToken(ev.id, linkId);
  revalidatePath(settingsPath(eventId));
  redirect(flashPath(settingsPath(eventId), ok ? "New link ready. The old one has stopped working." : "That verifier was already removed.", ok ? "ok" : "error"));
}

/** D493: stamped, not deleted, so their past revokes keep their name. */
export async function removeVerifierAction(eventId: string, linkId: string) {
  const { ev } = await guard(eventId);
  const ok = await removeVerifierLink(ev.id, linkId);
  revalidatePath(settingsPath(eventId));
  redirect(flashPath(settingsPath(eventId), ok ? "Verifier removed. Their link has stopped working." : "That verifier was already removed.", ok ? "ok" : "error"));
}

/** D497: the templates, one per line. Past revokes keep their own wording (D499). */
export async function saveRevokeReasonsAction(eventId: string, fd: FormData) {
  const { ev } = await guard(eventId);
  const parsed = parseReasonList(String(fd.get("revoke_reasons") ?? ""));
  if ("error" in parsed) redirect(flashPath(settingsPath(eventId), `${parsed.error} Nothing was saved.`, "error"));
  await updateEvent(ev.id, { revoke_reasons: parsed.reasons });
  revalidatePath(settingsPath(eventId));
  redirect(flashPath(settingsPath(eventId), "Revoke reasons saved."));
}
```

- [ ] **Step 4: Write the tab**

Create `src/features/activities/admin/VerificationTab.tsx`:

```tsx
import { appBaseUrl, verifierLink } from "@/lib/links";
import { shortDate } from "@/lib/text";
import type { Event } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/admin/Modal";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { CopyLink } from "@/components/admin/CopyLink";
import { RowActions } from "@/components/admin/RowActions";
import { listVerifierLinks } from "../db/verifiers";
import { reasonsOf, MAX_REASONS } from "../lib/revoke";
import { addVerifierAction, replaceVerifierLinkAction, removeVerifierAction, saveRevokeReasonsAction } from "./verifier-actions";

/**
 * D502: Settings → Verification. Outside the big Settings form, like Committee alerts: each
 * card posts its own small form, so nothing here can blank another tab's fields.
 */
export async function VerificationTab({ ev }: { ev: Event }) {
  const links = await listVerifierLinks(ev.id);
  const base = appBaseUrl();
  const reasons = reasonsOf(ev);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Verifier links</CardTitle>
          <CardDescription>
            Each person gets their own link. It opens this event&apos;s submissions and nothing else: they can look through
            entries and revoke one with a reason. Their revokes carry the name you give here. A link works until you remove or replace it.
          </CardDescription>
          <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
            <Modal title="Add a verifier" hint="Their name is shown to admins on every entry they revoke." trigger="Add verifier" icon="plus">
              <form action={addVerifierAction.bind(null, ev.id)} className="grid gap-4">
                <Field label="Name" name="name" placeholder="Aisyah" />
                <SubmitButton>Make their link</SubmitButton>
              </form>
            </Modal>
          </div>
        </CardHeader>
        <CardContent>
          {links.length === 0 ? (
            <p className="text-sm text-muted-foreground">No verifiers yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((l) => {
                  const url = verifierLink(base, l.token);
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-semibold">{l.name}</TableCell>
                      <TableCell><CopyLink link={url} /></TableCell>
                      <TableCell className="text-muted-foreground">{shortDate(l.created_at.slice(0, 10))}</TableCell>
                      <TableCell className="text-right">
                        <RowActions
                          name={l.name}
                          links={[{ label: "Open link", href: url, newTab: true }]}
                          dialog={{
                            label: "Replace link",
                            title: `Replace ${l.name}'s link?`,
                            hint: "The old link stops working at once, including on a page they already have open. Send them the new one.",
                            form: <form action={replaceVerifierLinkAction.bind(null, ev.id, l.id)}><SubmitButton>Replace link</SubmitButton></form>,
                          }}
                          remove={{
                            action: removeVerifierAction.bind(null, ev.id, l.id),
                            label: "Remove",
                            message: "Their link stops working at once. Entries they already revoked stay revoked, and still show their name.",
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Revoke reasons</CardTitle>
          <CardDescription>
            What admins and verifiers pick from when they revoke an entry. One per line, up to {MAX_REASONS}, in the order they
            should appear. &ldquo;Other&rdquo;, with their own words, is always offered too. The attendee sees the reason.
            Changing this list never changes what earlier revokes said.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form key={reasons.join("\n")} action={saveRevokeReasonsAction.bind(null, ev.id)} className="flex max-w-xl flex-col items-start gap-3">
            <label htmlFor="revoke_reasons" className="sr-only">Revoke reasons</label>
            <Textarea id="revoke_reasons" name="revoke_reasons" rows={Math.max(6, reasons.length + 1)} defaultValue={reasons.join("\n")} />
            <SubmitButton>Save reasons</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
```

`shortDate` (`src/lib/text.ts`) takes `YYYY-MM-DD`, which is why `created_at` is sliced.

Add both of these to `src/features/activities/index.ts`, after `export * from "./admin/actions";`:

```ts
export * from "./admin/VerificationTab";
export * from "./admin/verifier-actions";
```

- [ ] **Step 5: Add the tab to Settings**

In `src/app/admin/events/[id]/settings/page.tsx`:

1. Imports:
   - Add `activityKindsFor` to the `@/features/catalogue` import.
   - Add `VerificationTab` to the `@/features/activities` import.
2. Replace `const hiddenTabs = hiddenSettingsTabs(await eventFeatures(ev.id));` with:

```ts
  const features = await eventFeatures(ev.id);
  const hiddenTabs = hiddenSettingsTabs(features);
  // D502: Verification is about submissions, so it shows only when the event can run them.
  const verifying = activityKindsFor(features).includes("submission");
```

3. Change the `tabs` line to include `"verification"` before `"danger"`, and filter it out when `!verifying`:

```ts
  const tabs = (["features", "details", "registration", "checkpoints", "address", "alerts", "verification", "danger"] as const)
    .filter((t) => !(hiddenTabs as readonly string[]).includes(t) && (t !== "verification" || verifying));
```

4. In `TabsList`, after the alerts trigger:

```tsx
          {verifying && <TabsTrigger value="verification">Verification</TabsTrigger>}
```

5. After the alerts `</TabsContent>`, add:

```tsx
      {verifying && (
        <TabsContent value="verification" className="flex flex-col gap-4">
          <VerificationTab ev={ev} />
        </TabsContent>
      )}
```

- [ ] **Step 6: Run the checks**

Run: `npx tsc --noEmit; npm run lint; npm test`. Expected: all pass.

- [ ] **Step 7: Check it in the browser**

On `ecpkom` → Settings:
1. The Verification tab shows.
2. Add a verifier called `Test V`.
   - Expected: a flash, and the row with Copy link appears.
3. ⋯ → Replace link → confirm.
   - Expected: "New link ready…"
   - `select token from verifier_links where name = 'Test V'` returns a different token than before.
4. Edit the reasons:
   - Add a line `Selfie missing`, swap the first two, and save. The textarea reloads in the new order.
   - Then type the same line twice and save.
   - Expected: `"Selfie missing" is in the list twice. Nothing was saved.`
5. Leave `Test V` in place for Task 6. Put the reasons back to the five defaults plus `Selfie missing`.

- [ ] **Step 8: Commit**

```bash
git pull --rebase --autostash
git add src/lib/links.ts tests/links.test.ts src/features/activities/admin/verifier-actions.ts src/features/activities/admin/VerificationTab.tsx src/features/activities/index.ts "src/app/admin/events/[id]/settings/page.tsx"
git commit -m "feat(settings): Verification tab with verifier links and revoke reasons (D493, D497, D502)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The verify page and its revoke action

**Files:**
- Modify: `src/lib/file-links.ts` (add `verifyFileHref` and `isImagePath`)
- Modify: `tests/file-links.test.ts`
- Create: `src/features/activities/verify/actions.ts`
- Create: `src/features/activities/verify/VerifyCard.tsx`
- Create: `src/features/activities/verify/VerifyPage.tsx`
- Modify: `src/features/activities/index.ts` (export `VerifyPage`)
- Create: `src/app/verify/layout.tsx`, `src/app/verify/[token]/page.tsx`

**Interfaces:**
- Consumes:
  - `resolveVerifier`, `belongsToLink`, `verifyQuery`, `verifyQueryString`, `VerifyQuery` (Task 2)
  - `verifierByToken`, `submissionsForVerify`, `verifierNames`, `VERIFY_PAGE_SIZE`, `revokeSubmission` (Task 3)
  - `RevokeForm` (Task 4)
  - `parseRevokeReason`, `reasonsOf`, `revokeCredit` (Task 2)
  - `getEvent` (`src/lib/db/events.ts`), `listActivities`, `getActivity`, `getSubmission`, `listAttendees(eventId, q, "name")`, `listAttendeesByIds`, `listGroups`, `allow`, `brandStyle`
- Produces:
  - `verifyFileHref(token: string, submissionId: string, key: string): string`
  - `isImagePath(path: string): boolean`
  - `revokeAsVerifierAction(token: string, query: string, submissionId: string, fd: FormData)`
  - `VerifyPage({ token, search }: { token: string; search: Record<string, string | undefined> })`
  - `InvalidVerifyLink()`

- [ ] **Step 1: Write the failing file-link tests**

In `tests/file-links.test.ts`, add `verifyFileHref, isImagePath` to the import from `@/lib/file-links`, and append:

```ts
describe("verifyFileHref (D495)", () => {
  it("goes through the verifier's own route", () => {
    expect(verifyFileHref("k7m2xq9rt4bd", "sub-1", "selfie")).toBe("/verify/k7m2xq9rt4bd/files/sub-1/selfie");
  });
});

describe("isImagePath", () => {
  it("is true for photos the browser can draw", () => {
    for (const p of ["o/e/f/a.jpg", "o/e/f/a.JPEG", "x.png", "x.webp", "x.gif"]) expect(isImagePath(p)).toBe(true);
  });
  it("is false for anything else", () => {
    for (const p of ["x.pdf", "x.heic", "x", "jpg"]) expect(isImagePath(p)).toBe(false);
  });
});
```

Run: `npx vitest run tests/file-links.test.ts`. Expected: FAIL, because these aren't exported.

- [ ] **Step 2: Add the helpers**

Append to `src/lib/file-links.ts`:

```ts
/** D495: the verifier's route; their link's token is the authority, re-checked at every click (D496). */
export function verifyFileHref(token: string, submissionId: string, key: string): string {
  return `/verify/${token}/files/${submissionId}/${key}`;
}

/** Whether a stored file can be shown inline as a thumbnail rather than only linked. */
export function isImagePath(path: string): boolean {
  return /\.(jpe?g|png|webp|gif)$/i.test(path);
}
```

Run: `npx vitest run tests/file-links.test.ts`. Expected: PASS.

- [ ] **Step 3: Write the action**

Create `src/features/activities/verify/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getEvent } from "@/lib/db/events";
import { flashPath } from "@/lib/flash";
import { allow } from "@/lib/ratelimit";
import { getActivity, getSubmission, revokeSubmission } from "../db/activities";
import { verifierByToken } from "../db/verifiers";
import { belongsToLink, resolveVerifier, verifyQuery, verifyQueryString } from "../lib/verifier";
import { parseRevokeReason, reasonsOf } from "../lib/revoke";

const INVALID = "This link isn't valid. Ask the organiser for the right one.";

/**
 * D495/D496: a verifier's revoke. Everything is re-checked here - the link (removed or
 * replaced since the page loaded), the entry's event, its kind - and `query` is rebuilt
 * through `verifyQuery` rather than trusted, so it can only ever add filters to this page.
 */
export async function revokeAsVerifierAction(token: string, query: string, submissionId: string, fd: FormData) {
  const back = `/verify/${token}${verifyQueryString(verifyQuery(Object.fromEntries(new URLSearchParams(query))))}`;
  const link = await resolveVerifier(token, verifierByToken);
  if (!link) redirect(flashPath(back, INVALID, "error"));
  if (!allow(`verify:${link.id}`, 60, 60_000)) redirect(flashPath(back, "Too many actions at once. Wait a moment and try again.", "error"));

  const submission = await getSubmission(submissionId);
  if (!submission || !belongsToLink(link, submission)) redirect(flashPath(back, "That entry no longer exists.", "error"));
  const [activity, ev] = await Promise.all([getActivity(submission.activity_id, link.event_id), getEvent(link.event_id)]);
  if (!activity || activity.kind !== "submission" || !ev) redirect(flashPath(back, "That entry no longer exists.", "error"));

  const parsed = parseRevokeReason(fd, reasonsOf(ev));
  if ("error" in parsed) redirect(flashPath(back, parsed.error, "error"));
  if (!(await revokeSubmission(submission.id, activity.id, parsed.reason, { verifierId: link.id }))) {
    redirect(flashPath(back, "Someone already revoked this entry.", "error"));
  }
  // The admin's activity pages count live rows; they moved.
  revalidatePath(`/admin/events/${link.event_id}/activities`, "layout");
  revalidatePath(`/verify/${token}`);
  redirect(flashPath(back, "Revoked. They'll see the reason and can send a new one."));
}
```

- [ ] **Step 4: Write the card**

Create `src/features/activities/verify/VerifyCard.tsx`:

```tsx
import type { Activity, ActivitySubmission } from "@/lib/types";
import { shortDateTime } from "@/lib/text";
import { isImagePath, verifyFileHref } from "@/lib/file-links";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/admin/Modal";
import { RevokeForm } from "../kinds/submission/RevokeForm";

/**
 * D495: one entry on the verifier's page - who, which activity, when, the answers, and the
 * photos inline, since checking proof is the whole job. A live entry has Revoke; a revoked
 * one shows who did it and why instead.
 */
export function VerifyCard({ s, activity, who, group, token, credit, reasons, revoke }: {
  s: ActivitySubmission;
  activity: Activity;
  who: string;
  group: string | null;
  token: string;
  /** `revokeCredit` for a revoked entry; null for a live one. */
  credit: string | null;
  reasons: string[];
  revoke: (fd: FormData) => Promise<void>;
}) {
  const answered = activity.questions.filter((q) => (s.answers[q.key] ?? "") !== "");
  return (
    <Card className={credit ? "opacity-70" : undefined}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {who}
          {credit && <Badge variant="secondary">Revoked</Badge>}
        </CardTitle>
        <CardDescription>{[activity.name, group, shortDateTime(s.created_at)].filter(Boolean).join(" · ")}</CardDescription>
        {credit && <CardDescription className="text-xs">{credit}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {answered.map((q) => {
          const value = s.answers[q.key];
          if (q.type !== "file") {
            return <div key={q.key} className="text-sm"><span className="font-bold">{q.label}: </span><span className="text-muted-foreground">{value}</span></div>;
          }
          const href = verifyFileHref(token, s.id, q.key);
          return (
            <div key={q.key} className="flex flex-col gap-1 text-sm">
              <span className="font-bold">{q.label}</span>
              {isImagePath(value) ? (
                <a href={href} target="_blank" rel="noreferrer" className="block w-fit overflow-hidden rounded-md border">
                  {/* The route redirects to a one-minute signed URL; a plain img follows it. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={href} alt={q.label} loading="lazy" className="max-h-72 w-auto object-contain" />
                </a>
              ) : (
                <a href={href} target="_blank" rel="noreferrer" className="text-primary underline">View file</a>
              )}
            </div>
          );
        })}
        {!credit && (
          <div className="pt-1">
            <Modal title={`Revoke ${who}'s entry?`} hint="It stops counting and they can send a new one. They'll see the reason you pick." trigger="Revoke" variant="outline">
              <RevokeForm action={revoke} reasons={reasons} />
            </Modal>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Write the page**

Create `src/features/activities/verify/VerifyPage.tsx`:

```tsx
import Link from "next/link";
import { Flag } from "lucide-react";
import { getEvent } from "@/lib/db/events";
import { listAttendees, listAttendeesByIds } from "@/lib/db/attendees";
import { listGroups } from "@/lib/db/groups";
import { allow } from "@/lib/ratelimit";
import { brandStyle } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { listActivities } from "../db/activities";
import { verifierByToken, submissionsForVerify, verifierNames } from "../db/verifiers";
import { resolveVerifier, verifyQuery, verifyQueryString } from "../lib/verifier";
import { reasonsOf, revokeCredit } from "../lib/revoke";
import { revokeAsVerifierAction } from "./actions";
import { VerifyCard } from "./VerifyCard";

const select = "h-11 rounded-md border border-input bg-background px-3 text-sm";

/** Copy from the Global Constraints. The same screen for a malformed, unknown, removed or replaced link. */
export function InvalidVerifyLink() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 p-6">
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Flag /></EmptyMedia>
          <EmptyTitle>This link isn&apos;t valid</EmptyTitle>
          <EmptyDescription>Ask the organiser for the right one.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
  );
}

/**
 * D495: the verifier's page - one event's submissions, newest first, to check and revoke.
 * Plain GET filters and Older/Newer links, so it works on any phone with no client state.
 * Admin revokes show as "an admin": a verifier is not shown organisers' emails.
 */
export async function VerifyPage({ token, search }: { token: string; search: Record<string, string | undefined> }) {
  const link = await resolveVerifier(token, verifierByToken);
  if (!link || !allow(`verify-page:${link.id}`, 120, 60_000)) return <InvalidVerifyLink />;
  const ev = await getEvent(link.event_id);
  if (!ev) return <InvalidVerifyLink />;

  const q = verifyQuery(search);
  const forms = await listActivities(ev.id, "submission");
  const formById = new Map(forms.map((f) => [f.id, f]));
  const chosen = q.activity && formById.has(q.activity) ? [q.activity] : forms.map((f) => f.id);
  // A name search narrows to at most 200 people, which keeps the `in` filter's URL sane.
  const matched = q.q ? (await listAttendees(ev.id, q.q, "name")).slice(0, 200).map((a) => a.id) : null;
  const { rows, more } = await submissionsForVerify({ eventId: ev.id, activityIds: chosen, status: q.status, attendeeIds: matched, page: q.page });

  const [people, groups, verifiers] = await Promise.all([
    listAttendeesByIds(ev.id, [...new Set(rows.map((r) => r.attendee_id))]),
    listGroups(ev.id),
    verifierNames(rows.map((r) => r.revoked_by_verifier)),
  ]);
  const nameOf = new Map(people.map((a) => [a.id, a.name]));
  const groupOf = new Map(groups.map((g) => [g.id, g.name]));
  const reasons = reasonsOf(ev);
  const query = verifyQueryString(q).slice(1);
  const here = (patch: Partial<typeof q>) => `/verify/${token}${verifyQueryString(q, patch)}`;

  return (
    <main style={brandStyle(ev.primary_color)} className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{ev.name}</p>
        <h1 className="text-xl font-extrabold">Verifying as {link.name}</h1>
        <p className="text-sm text-muted-foreground">Check each entry&apos;s proof. Revoke one that doesn&apos;t qualify and pick why; the attendee sees the reason and can send a new one.</p>
      </header>

      {forms.length === 0 ? (
        <p className="text-sm text-muted-foreground">This event has no submission activities yet.</p>
      ) : (
        <>
          <form method="get" className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto]">
            <select name="activity" defaultValue={q.activity ?? ""} className={select} aria-label="Activity">
              <option value="">All activities</option>
              {forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <select name="status" defaultValue={q.status} className={select} aria-label="Show">
              <option value="submitted">To check</option>
              <option value="revoked">Revoked</option>
              <option value="all">All</option>
            </select>
            <input name="q" defaultValue={q.q} placeholder="Attendee name" className={select} aria-label="Attendee name" />
            <Button type="submit" className="h-11">Filter</Button>
          </form>

          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nothing here.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {rows.map((s) => (
                <VerifyCard
                  key={s.id}
                  s={s}
                  activity={formById.get(s.activity_id)!}
                  who={nameOf.get(s.attendee_id) ?? "Unknown"}
                  group={s.group_id ? groupOf.get(s.group_id) ?? null : null}
                  token={token}
                  credit={s.status === "revoked" ? revokeCredit(s, { admins: {}, verifiers }) : null}
                  reasons={reasons}
                  revoke={revokeAsVerifierAction.bind(null, token, query, s.id)}
                />
              ))}
            </div>
          )}

          {(q.page > 0 || more) && (
            <nav className="flex justify-between">
              {q.page > 0 ? <Link href={here({ page: q.page - 1 })} className="text-sm font-bold text-primary">Newer</Link> : <span />}
              {more ? <Link href={here({ page: q.page + 1 })} className="text-sm font-bold text-primary">Older</Link> : <span />}
            </nav>
          )}
        </>
      )}
    </main>
  );
}
```

The GET form posts `activity`, `status` and `q` but never `page`, so filtering always starts again at page 0. `s.group_id` is the group the entry was sent for (D355).

Add `export * from "./verify/VerifyPage";` to `src/features/activities/index.ts`.

- [ ] **Step 6: Write the routes**

Create `src/app/verify/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Flash } from "@/components/admin/Flash";

// A verifier link is an authority, not a page: keep it out of search indexes, as every
// token-carrying route in this app is.
export const metadata: Metadata = { title: "Verify submissions", robots: { index: false, follow: false } };

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Suspense fallback={null}><Flash /></Suspense>
      <Toaster />
    </>
  );
}
```

Create `src/app/verify/[token]/page.tsx`:

```tsx
import { VerifyPage } from "@/features/activities";

// Never cached: a removed link must stop on the next load (D496), and the list is live.
export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const raw = await searchParams;
  const search = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  return <VerifyPage token={token} search={search} />;
}
```

No proxy change is needed. On the app's own host, `src/proxy.ts` runs the session check only for `/admin`, `/scan` and `/login`, so `/verify` passes straight through. On an event's own domain, `routeEventPath` decides, but verifier links are always built on `appBaseUrl()`, so they never arrive there.

- [ ] **Step 7: Run the checks**

Run: `npx tsc --noEmit; npm run lint; npm test`. Expected: all pass.

- [ ] **Step 8: Check it in the browser**

Use `resize_window` with the `mobile` preset.

1. Open Test V's link (Settings → Verification → ⋯ → Open link).
   - Expected: "Verifying as Test V" and the `ecpkom` entries, newest first.
   - Photos show as thumbnails. Thumbnails come from the Task 7 route, so until Task 7 lands they show broken images. Recheck them in Task 7.
2. Filter Status → Revoked: the entry revoked in Task 4 shows `Revoked by an admin on … · Selfie missing`.
3. Back on To check, revoke one entry with the template `Selfie missing`.
   - Expected: the flash reads "Revoked. They'll see the reason…", and the entry leaves the To check list.
4. `execute_sql` confirms `revoked_by` is null, `revoked_by_verifier` is Test V's id, and `revoke_reason` is `Selfie missing`.
5. In admin, that row's badge title reads `Revoked by Test V (verifier) on … · Selfie missing`.
6. Visit `/verify/abcdefghjkmn`: the "This link isn't valid" screen.
7. Run `resize_window` with the `desktop` preset when done.

- [ ] **Step 9: Commit**

```bash
git pull --rebase --autostash
git add src/lib/file-links.ts tests/file-links.test.ts src/features/activities/verify src/features/activities/index.ts src/app/verify/layout.tsx "src/app/verify/[token]/page.tsx"
git commit -m "feat(verify): verifier link page to check and revoke submissions (D495, D496)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The verify file route

**Files:**
- Create: `src/app/verify/[token]/files/[submissionId]/[key]/route.ts`

**Interfaces:**
- Consumes: `resolveVerifier`, `belongsToLink` (Task 2); `verifierByToken` (Task 3); `getSubmission`, `submissionFileResponse` (existing, `@/features/activities`); `allow`.
- Produces: `GET /verify/[token]/files/[submissionId]/[key]`. It returns a 302 to a one-minute signed URL; a 404 for a bad link, another event's entry or a non-file key; or a 429.

- [ ] **Step 1: Write the route**

```ts
import { notFound } from "next/navigation";
import { allow } from "@/lib/ratelimit";
import { getSubmission, submissionFileResponse, verifierByToken, resolveVerifier, belongsToLink } from "@/features/activities";

/**
 * D495/D496: one submitted file, for a verifier link of its event. The same checks as the
 * revoke action - link live, entry in the link's event - then the same signed redirect the
 * admin route uses (D399), so a thumbnail never outlives the link that opened it.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; submissionId: string; key: string }> }) {
  const { token, submissionId, key } = await params;
  const link = await resolveVerifier(token, verifierByToken);
  if (!link) notFound();
  if (!allow(`verify-file:${link.id}`, 600, 60_000)) {
    return new Response("Too many requests. Wait a moment and try again.", { status: 429, headers: { "Cache-Control": "private, no-store" } });
  }
  const submission = await getSubmission(submissionId);
  if (!belongsToLink(link, submission)) notFound();
  return submissionFileResponse(submission!, key);
}
```

- [ ] **Step 2: Run the checks**

Run: `npx tsc --noEmit; npm run lint; npm test`. Expected: all pass.

- [ ] **Step 3: Check it in the browser**

1. Reload Test V's verify page: the thumbnails now draw. Tapping one opens the full image in a new tab.
2. In `read_network_requests`, the `/verify/.../files/...` requests return 302.
3. Get a submission id from a different event that has a file answer:

```sql
select id from activity_submissions where event_id <> '4e64a90c-728c-4a08-af62-8c8046afa0c9' and answers::text like '%/%' limit 1
```

   Open `/verify/<Test V token>/files/<that id>/<any key>`. Expected: 404.

- [ ] **Step 4: Commit**

```bash
git pull --rebase --autostash
git add "src/app/verify/[token]/files"
git commit -m "feat(verify): files for verifier links, scoped to the link's event (D495)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: What attendees see, then the end-to-end check

**Files:**
- Create: `src/features/activities/kinds/submission/RevokedList.tsx`
- Modify: `src/features/activities/kinds/submission/SubmissionBody.tsx` (`SubmissionBody`, line 115 onward)
- Modify: `src/features/activities/kinds/submission/scoring/tracker/EntryTimeline.tsx:58`
- Modify: `src/features/activities/db/activities.ts` (the doc comment on `submissionsForAttendee`, line ~368)

**Interfaces:**
- Consumes: `SubmissionEntry.revoked` (Task 3); `attendeeRevokeLabel` (Task 2).
- Produces: `RevokedList({ entries, byline, canResend }: { entries: ActivitySubmission[]; byline?: (s: ActivitySubmission) => string | null; canResend: boolean })`.

- [ ] **Step 1: Write `RevokedList`**

Create `src/features/activities/kinds/submission/RevokedList.tsx`:

```tsx
import type { ActivitySubmission } from "@/lib/types";
import { shortDateTime } from "@/lib/text";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { attendeeRevokeLabel } from "../../lib/revoke";

/**
 * D500: the attendee's revoked entries, each with why. Shown beside the history, never in it:
 * the history and every count read live rows only (D501), so nothing here can change whether
 * they may submit. `canResend` adds the line that tells them they can.
 */
export function RevokedList({ entries, byline, canResend }: {
  entries: ActivitySubmission[];
  byline?: (s: ActivitySubmission) => string | null;
  canResend: boolean;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-extrabold">Removed by the organiser</h2>
      {entries.map((s) => {
        const by = byline?.(s);
        return (
          <Card key={s.id} className="opacity-75">
            <CardHeader>
              <CardTitle className="text-[13px] font-bold text-muted-foreground line-through">{shortDateTime(s.created_at)}</CardTitle>
              <CardDescription className="text-sm text-foreground">{attendeeRevokeLabel(s.revoke_reason, "history")}</CardDescription>
              {by && <CardDescription className="text-[11px]">{by}</CardDescription>}
              {canResend && <CardDescription className="text-[11px]">You can send a new one.</CardDescription>}
            </CardHeader>
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Show it on the activity page**

In `SubmissionBody.tsx`:
1. Import `RevokedList`.
2. Destructure `revoked` from `entry` alongside `mine` and `group`.
3. In the personal branch (`!isGroupForm(f.group_mode)`), directly after the `<SubmissionHistory .../>` line, add:

```tsx
            <div className="mt-4"><RevokedList entries={revoked} canResend={state.can} /></div>
```

4. In the group branch, directly after the `{group && <GroupStatus .../>}` line, add:

```tsx
            <div className="mt-4">
              <RevokedList entries={revoked} canResend={state.can}
                byline={(s) => (s.attendee_id === selfId ? "Your entry" : `${people[s.attendee_id]?.name ?? "A former member"}'s entry`)} />
            </div>
```

`SubmissionBody` is never used for scored challenges: `ActivityPage` renders `TrackerBody` for those. So the tracker isn't shown revoked entries twice.

- [ ] **Step 3: Add the reason to the tracker**

In `EntryTimeline.tsx`:
- Import `attendeeRevokeLabel` from `"../../../../lib/revoke"`. Check the relative depth: the file is at `kinds/submission/scoring/tracker/`, so `lib/` is four levels up.
- On line 58, replace `" · Removed by the organiser"` with:

```tsx
` · ${attendeeRevokeLabel(s.revoke_reason, "tracker")}`
```

In `db/activities.ts`, update the comment above `submissionsForAttendee` to: `// revoked rows never count and never reach an attendee's history (D339, D341); they are shown apart, with their reason, via revokedForAttendee (D500).`

- [ ] **Step 4: Run all the checks**

Run: `npx tsc --noEmit; npm run lint; npm test; npm run build`. Expected: all pass, and the build lists `/verify/[token]` and `/verify/[token]/files/[submissionId]/[key]`.

- [ ] **Step 5: End-to-end browser check**

Work on `ecpkom`, never `ecphub`.
1. **Attendee, personal form.** Open the portal as the ZZ test attendee whose entry was revoked in Tasks 4 and 6, using their `/e/ecpkom/a/<token>` link from Attendees.
   - Under the history, "Removed by the organiser" lists the entries with `Removed: Selfie missing`.
   - "You can send a new one." shows while the activity is open.
   - The live history above doesn't include them.
2. **Attendee, scored challenge.** If `ecpkom` has one, revoke a tracker entry from the verify page with a template. The attendee's tracker line then reads `· Removed by the organiser: <reason>`. If it has none, note that this check was skipped.
3. **Group form.** If `ecpkom` has one, revoke a member's entry. Another member of the same group sees it, with `<Name>'s entry`. If it has none, note that this check was skipped.
4. **Template edit.** Settings → Verification: delete `Selfie missing` and save.
   - The entries revoked with it still read `Removed: Selfie missing`.
   - On the verify page, the dialog no longer offers it.
5. **Stale dialog (Review Focus 3).**
   - Open the verify page's Revoke dialog and pick the first template.
   - In another tab, delete that template in Settings and save.
   - Back in the first tab, press Revoke.
   - Expected: `Pick a reason, or choose Other and type one.`, and the entry is still live.
6. **Removed while open (Review Focus 1).**
   - Keep Test V's verify page open.
   - In admin, remove Test V.
   - Back on the page, revoke an entry: the flash says the link isn't valid, and the entry is still live.
   - Reload: the "This link isn't valid" screen.
   - A thumbnail URL from before the removal now returns 404.
7. Put `ecpkom`'s reasons back to the five defaults.

- [ ] **Step 6: Commit**

```bash
git pull --rebase --autostash
git add src/features/activities/kinds/submission/RevokedList.tsx src/features/activities/kinds/submission/SubmissionBody.tsx src/features/activities/kinds/submission/scoring/tracker/EntryTimeline.tsx src/features/activities/db/activities.ts
git commit -m "feat(portal): attendees see why an entry was removed (D500, D501)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Runbook note**

In `docs/runbook.md`, after the section on adding admins (around line 49), add a short paragraph:

```markdown
### Verifiers (D492)

Committee helpers who check submissions do not need an admin account. In the event's
Settings → Verification, add each person by name and send them their own link. It opens that
event's submissions only; they can revoke an entry with a reason. Remove or replace a link
there to stop it at once.
```

Commit:

```bash
git pull --rebase --autostash
git add docs/runbook.md
git commit -m "docs(runbook): verifier links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
