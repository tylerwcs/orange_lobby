# Scheduled Opening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An organiser sets a date and time on a closed activity; it opens itself then, and until it does attendees see a non-tappable Coming soon card with the opening time.

**Architecture:** A nullable `activities.opens_at` plus a `pg_cron` job that runs `open_scheduled_activities()` every minute, which flips `is_open` on and clears `opens_at` (D601). Every existing `is_open` check in SQL and the app stays as is. The portal reads scheduled activities through a second memoised filter beside `portalActivities`, and only the card list (and the nav's `show`) reads them. The admin gets a Schedule button and dialog on every kind's header, and a Scheduled pill on the list.

**Tech Stack:** Next.js (App Router, server actions; read `node_modules/next/dist/docs/` before touching anything Next-specific, per AGENTS.md), Supabase Postgres with `pg_cron`, TypeScript, vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-16-scheduled-open-design.md` (D600–D609). Read it before starting any task.

## Global Constraints

- All times are Malaysia time: `MY_TZ = "Asia/Kuala_Lumpur"`, UTC+8, no DST (`src/lib/time.ts`).
- Copy, verbatim: chip `Coming soon`; card line `Opens <Day D Mon>, <h:mm><am|pm>` e.g. `Opens Sat 17 Oct, 10:00am`; admin button `Schedule` / `Opens Sat 17 Oct, 10:00am`; dialog title `Schedule opening`; buttons `Save`, `Remove schedule`; list pill `Scheduled` with `17 Oct, 10:00am` beneath; section heading `Coming soon`.
- Flashes, verbatim: `Opening scheduled for Sat 17 Oct, 10:00am.`, `Schedule removed.`, `Pick a time in the future.`, `It's already open.`, and (added by this plan for a blank form) `Pick a date and time.`
- `opens_at` is written only by `scheduleOpenAction`, `removeScheduleAction`, `toggleOpenAction` and the cron function. No settings form reads or writes it (D602, same rule as `is_open`, D127).
- Never test on the live event (slug `ecphub`). Use any other event.
- Decision numbers are D600–D609; migration is `0086`. Reference the D number in code comments as the codebase does.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on `main` (the user does not use worktrees).
- Note: 17 Oct 2026 is a **Saturday**. The spec's examples say "Fri 17 Oct"; that was a typo. Tests use `Sat`.

## Review Focus

1. **A blank or half-filled schedule form** (no date, or no time): expect `Pick a date and time.` and nothing written. Pinned in Task 2 (`scheduleCheck(…, null, …)`, `scheduleAt("", "10:00")`).
2. **Closing an activity that somehow still carries a past `opens_at`:** the timer must not reopen it a minute later. Prevented two ways: a check constraint makes an open activity with `opens_at` impossible (Task 1, checked by the DB script), and `toggleOpenAction` writes `opens_at: null` in both directions (Task 5).
3. **Times around midnight and noon** in Malaysia time: 00:30 reads `12:30am` on the right day, 12:00 reads `12:00pm`. Pinned in Task 2.
4. **A scheduled activity outside the attendee's category:** no card and no Activities button for them. Pinned in Task 3 (`activityNav`) and wired in Task 4 (`loadActivityEntries` filters by `eligible`).
5. **A required booking that is scheduled:** no ring, not under To choose, no nav dot. Pinned in Task 3 (`activityCards` gives it `emphasis: false`, `section: "coming"`; `activityNav` only owes on open activities).

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `supabase/migrations/0086_scheduled_open.sql` | create | column, constraint, index, `open_scheduled_activities()`, cron job |
| `scripts/scheduled-open-db-check.mjs` | create | proves the SQL against the real DB |
| `package.json` | modify | `check:schedule` script |
| `src/lib/types.ts` | modify | `Activity.opens_at?` |
| `src/features/activities/db/activities.ts` | modify | `NewActivity.opens_at?` |
| `src/features/activities/lib/schedule.ts` | create | pure: `scheduleAt`, `scheduleCheck`, `opensLabel`, `opensShort` |
| `src/features/activities/client.ts` | modify | export `./lib/schedule` |
| `src/features/activities/lib/activity-card.ts` | modify | `CardView.action` nullable, `comingSoonCard` |
| `src/features/activities/lib/portal-activities.ts` | modify | `comingSoonForAttendees`, `activityNav` takes `coming` |
| `src/features/activities/cards.ts` | modify | `coming` section, `href: string \| null` |
| `src/lib/portal.ts` | modify | `portalComingSoon`, shared `eventActivities` read |
| `src/features/activities/lib/portal-activity-entries.ts` | modify | returns `coming` |
| `src/lib/portal-home.ts` | modify | `loadActivityNav` passes `coming` |
| `src/features/activities/portal/ActivitiesTab.tsx` | modify | Coming soon section; card without link or pill |
| `src/features/activities/admin/actions.ts` | modify | `scheduleOpenAction`, `removeScheduleAction`, toggle clears |
| `src/features/activities/admin/ScheduleOpen.tsx` | create | header button + dialog |
| `src/features/activities/kinds/{booking,submission,passport,polaroid}/*Detail.tsx` | modify | place `ScheduleOpen` |
| `src/features/activities/admin/ActivityRows.tsx` | modify | `StatusPill` Scheduled state |
| tests: `tests/activities/schedule.test.ts` (create), `activity-card.test.ts`, `cards.test.ts`, `portal-activities.test.ts` | | |

Commands used throughout:
- Unit tests: `npx vitest run tests/activities/<file>.test.ts`
- All tests: `npm test`
- Types: `npx tsc --noEmit`
- Lint: `npm run lint`

---

### Task 1: Migration, types and DB check

**Files:**
- Create: `supabase/migrations/0086_scheduled_open.sql`
- Create: `scripts/scheduled-open-db-check.mjs`
- Modify: `package.json` (scripts)
- Modify: `src/lib/types.ts` (Activity, near `is_open`)
- Modify: `src/features/activities/db/activities.ts` (`NewActivity`)

**Interfaces:**
- Produces: column `activities.opens_at timestamptz null`; constraint `activities_open_unscheduled`; SQL function `open_scheduled_activities() returns integer`; cron job `open-scheduled-activities`; TS `Activity.opens_at?: string | null`; `NewActivity.opens_at?: string | null`.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0086_scheduled_open.sql`:

```sql
-- Scheduled opening (D600-D609): an organiser sets when a closed activity opens, and a
-- one-minute timer opens it. Attendees see it as Coming soon until then (D603).
alter table activities add column opens_at timestamptz;

-- D600: only a closed activity carries a schedule. Without this, an activity closed while a
-- stale past opens_at was still on it would be reopened by the timer a minute later.
alter table activities add constraint activities_open_unscheduled check (not is_open or opens_at is null);

create index activities_opens_at_due_idx on activities (opens_at) where opens_at is not null and not is_open;

-- D601: opens every due activity, outside archived events, exactly as the Open switch would,
-- and clears its schedule. Returns how many it opened. A function rather than a bare UPDATE in
-- the job so scripts/scheduled-open-db-check.mjs can run it without waiting for the clock.
create or replace function open_scheduled_activities() returns integer
language sql
as $$
  with opened as (
    update activities a set is_open = true, opens_at = null
    from events e
    where e.id = a.event_id and e.status <> 'archived'
      and not a.is_open and a.opens_at is not null and a.opens_at <= now()
    returning a.id
  )
  select count(*)::int from opened;
$$;

-- Only the timer (postgres) and the service role run it; nothing in the browser should.
revoke execute on function open_scheduled_activities() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('open-scheduled-activities', '* * * * *', $$select open_scheduled_activities()$$);
```

- [ ] **Step 2: Apply the migration**

Apply with the Supabase MCP `apply_migration` tool (name `0086_scheduled_open`, the SQL above), the same way 0084/0085 were applied. Then confirm with `execute_sql`:

```sql
select jobname, schedule, command from cron.job where jobname = 'open-scheduled-activities';
```

Expected: one row, schedule `* * * * *`, command `select open_scheduled_activities()`.

- [ ] **Step 3: Write the DB check script**

`scripts/scheduled-open-db-check.mjs`:

```js
// Executable evidence that migration 0086 (scheduled opening, D600-D601) holds against a real
// database. vitest has no database (D141), so the pure rules are unit-tested and this proves the SQL.
//
// WHAT THIS PROVES:
//   1. An open activity cannot carry opens_at (activities_open_unscheduled).
//   2. open_scheduled_activities() opens a due activity and clears its opens_at.
//   3. It leaves a future one alone, and a due one in an archived event alone.
//   4. The anon key cannot run it.
//
// HOW TO RUN: npm run check:schedule (node --env-file=.env.local scripts/scheduled-open-db-check.mjs).
// SAFE TO RE-RUN: it creates its own two events with random slugs and deletes them in `finally`.
// It never touches the event with slug `ecphub`. Running the function opens any other activity
// that is genuinely due - which is exactly what the timer would do within the minute anyway.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key || !anonKey) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/scheduled-open-db-check.mjs");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const runId = randomUUID().replaceAll("-", "");
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
};
const must = ({ data, error }) => { if (error) throw error; return data; };

const org = must(await db.from("organisations").select("id").limit(1).single());
const live = must(await db.from("events").insert({ org_id: org.id, name: `Schedule check ${runId}`, slug: `schedule-check-${runId}`, status: "live" }).select("id, org_id").single());
const archived = must(await db.from("events").insert({ org_id: org.id, name: `Schedule check old ${runId}`, slug: `schedule-old-${runId}`, status: "archived" }).select("id, org_id").single());

const base = { required: false, max_per_attendee: 1, questions: [], per_day: false, kind: "booking" };
const minute = 60_000;
const at = (ms) => new Date(Date.now() + ms).toISOString();

try {
  // 1. The constraint.
  const bad = await db.from("activities").insert({ ...base, org_id: live.org_id, event_id: live.id, name: "Bad", is_open: true, opens_at: at(minute) });
  check("an open activity cannot carry opens_at", bad.error?.code === "23514", bad.error?.code ?? "no error");

  const due = must(await db.from("activities").insert({ ...base, org_id: live.org_id, event_id: live.id, name: "Due", is_open: false, opens_at: at(-minute) }).select("id").single());
  const later = must(await db.from("activities").insert({ ...base, org_id: live.org_id, event_id: live.id, name: "Later", is_open: false, opens_at: at(60 * minute) }).select("id").single());
  const old = must(await db.from("activities").insert({ ...base, org_id: archived.org_id, event_id: archived.id, name: "Old", is_open: false, opens_at: at(-minute) }).select("id").single());

  // 4. Anon first, so a refusal is not masked by the service-role run below.
  const anonRun = await anon.rpc("open_scheduled_activities");
  check("the anon key cannot run open_scheduled_activities", Boolean(anonRun.error), anonRun.error?.code ?? "it ran");

  // 2 and 3.
  const opened = must(await db.rpc("open_scheduled_activities"));
  check("it reports at least the one due activity", typeof opened === "number" && opened >= 1, String(opened));
  const rows = must(await db.from("activities").select("id, is_open, opens_at").in("id", [due.id, later.id, old.id]));
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  check("a due activity opens", byId[due.id].is_open === true);
  check("a due activity's opens_at clears", byId[due.id].opens_at === null);
  check("a future activity stays closed and scheduled", byId[later.id].is_open === false && byId[later.id].opens_at !== null);
  check("an archived event's due activity stays closed", byId[old.id].is_open === false && byId[old.id].opens_at !== null);
} finally {
  const { error } = await db.from("events").delete().in("id", [live.id, archived.id]);
  if (error) console.error("cleanup failed", error);
}

if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
console.log("All checks passed");
```

- [ ] **Step 4: Add the npm script**

In `package.json` `scripts`, after `"check:polaroid"`:

```json
    "check:schedule": "node --env-file=.env.local scripts/scheduled-open-db-check.mjs",
```

- [ ] **Step 5: Run the DB check**

Run: `npm run check:schedule`
Expected: six `PASS` lines and `All checks passed`. If `events` rejects `status: "live"` or the activities insert names a missing required column, read the error, fix the insert to match the table (see `scripts/polaroid-db-check.mjs` for a working activities insert) and rerun. Do not weaken a check to make it pass.

- [ ] **Step 6: Add the TypeScript fields**

In `src/lib/types.ts`, change the `is_open` doc and add `opens_at` right after it:

```ts
  /** Flipped by hand, or by the one-minute timer at `opens_at` (D601); there is deliberately no scheduled close (D127). */
  is_open: boolean;
  /**
   * D600: when a closed activity opens itself. Null is no schedule; never set on an open one
   * (constraint `activities_open_unscheduled`). Optional so old fixtures compile.
   */
  opens_at?: string | null;
```

In `src/features/activities/db/activities.ts`, in `NewActivity`, after `is_open: boolean;`:

```ts
  /** D600. Left out, the column's null stands; only the schedule actions and the Open switch write it (D602). */
  opens_at?: string | null;
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0086_scheduled_open.sql scripts/scheduled-open-db-check.mjs package.json src/lib/types.ts src/features/activities/db/activities.ts
git commit -m "feat(schedule): opens_at and the one-minute opening timer (D600, D601)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Pure schedule rules and wording

**Files:**
- Create: `src/features/activities/lib/schedule.ts`
- Modify: `src/features/activities/client.ts` (add export)
- Test: `tests/activities/schedule.test.ts`

**Interfaces:**
- Consumes: `localInputToIso`, `isoToLocalInput` from `@/lib/time`; `shortDate` from `@/lib/text`; `Activity` from `@/lib/types`.
- Produces:
  - `scheduleAt(date: string, time: string): string | null` — `"2026-10-17", "10:00"` → `"2026-10-17T10:00:00+08:00"`; null if either is blank/malformed.
  - `scheduleCheck(activity: Pick<Activity, "is_open">, at: string | null, now: Date): string | null` — the refusal flash, or null when it may be saved.
  - `opensLabel(iso: string): string` — `"Sat 17 Oct, 10:00am"`.
  - `opensShort(iso: string): string` — `"17 Oct, 10:00am"`.

- [ ] **Step 1: Write the failing tests**

`tests/activities/schedule.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { opensLabel, opensShort, scheduleAt, scheduleCheck } from "@/features/activities/lib/schedule";

describe("scheduleAt", () => {
  it("reads the dialog's date and time as Malaysia time", () => {
    expect(scheduleAt("2026-10-17", "10:00")).toBe("2026-10-17T10:00:00+08:00");
  });

  it("is null when either half is missing or malformed", () => {
    expect(scheduleAt("", "10:00")).toBeNull();
    expect(scheduleAt("2026-10-17", "")).toBeNull();
    expect(scheduleAt("2026-02-30", "10:00")).toBeNull();
  });
});

describe("scheduleCheck (D602)", () => {
  const now = new Date("2026-10-16T02:00:00Z"); // 10:00 in KL
  const closed = { is_open: false };

  it("refuses an activity that is already open", () => {
    expect(scheduleCheck({ is_open: true }, "2026-10-17T10:00:00+08:00", now)).toBe("It's already open.");
  });

  it("asks for a date and time when the form was blank", () => {
    expect(scheduleCheck(closed, null, now)).toBe("Pick a date and time.");
  });

  it("refuses now and the past", () => {
    expect(scheduleCheck(closed, "2026-10-16T10:00:00+08:00", now)).toBe("Pick a time in the future.");
    expect(scheduleCheck(closed, "2026-10-15T10:00:00+08:00", now)).toBe("Pick a time in the future.");
  });

  it("accepts a time in the future", () => {
    expect(scheduleCheck(closed, "2026-10-16T10:01:00+08:00", now)).toBeNull();
  });
});

describe("opensLabel / opensShort (D604, D608)", () => {
  it("says the Malaysia day and a 12-hour time", () => {
    expect(opensLabel("2026-10-17T02:00:00+00:00")).toBe("Sat 17 Oct, 10:00am");
    expect(opensShort("2026-10-17T02:00:00+00:00")).toBe("17 Oct, 10:00am");
  });

  it("puts just after midnight on the Malaysia day, as 12:30am", () => {
    // 16:30 UTC on the 16th is 00:30 on the 17th in KL.
    expect(opensLabel("2026-10-16T16:30:00Z")).toBe("Sat 17 Oct, 12:30am");
  });

  it("reads noon as 12:00pm and the afternoon with pm", () => {
    expect(opensLabel("2026-10-17T04:00:00Z")).toBe("Sat 17 Oct, 12:00pm");
    expect(opensLabel("2026-10-17T07:05:00Z")).toBe("Sat 17 Oct, 3:05pm");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/activities/schedule.test.ts`
Expected: FAIL, cannot resolve `@/features/activities/lib/schedule`.

- [ ] **Step 3: Implement**

`src/features/activities/lib/schedule.ts`:

```ts
import { isoToLocalInput, localInputToIso } from "@/lib/time";
import { shortDate } from "@/lib/text";
import type { Activity } from "@/lib/types";

/**
 * Scheduled opening's rules and words (D600-D609). Pure, so the admin action, the Schedule
 * button, the list pill and the attendee card all say the same thing about the same instant.
 */

/** The Schedule dialog's two fields as one instant in Malaysia time, or null if either is blank or not a real date. */
export function scheduleAt(date: string, time: string): string | null {
  return localInputToIso(`${date.trim()}T${time.trim()}`);
}

/**
 * Why a schedule cannot be saved (D602), as the flash to show - or null when it can. An open
 * activity has nothing to schedule; the time must be strictly after now.
 */
export function scheduleCheck(activity: Pick<Activity, "is_open">, at: string | null, now: Date): string | null {
  if (activity.is_open) return "It's already open.";
  if (!at) return "Pick a date and time.";
  if (new Date(at).getTime() <= now.getTime()) return "Pick a time in the future.";
  return null;
}

/** "10:00" → "10:00am", "00:30" → "12:30am", "12:00" → "12:00pm". */
function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

/** When it opens, in Malaysia time: "Sat 17 Oct, 10:00am" (D604, D607). */
export function opensLabel(iso: string): string {
  const [day, time] = isoToLocalInput(iso).split("T");
  return `${shortDate(day)}, ${clock(time)}`;
}

/** The same without the weekday, for the list's narrow Status column: "17 Oct, 10:00am" (D608). */
export function opensShort(iso: string): string {
  return opensLabel(iso).split(" ").slice(1).join(" ");
}
```

In `src/features/activities/client.ts`, after `export * from "./lib/revoke";`:

```ts
export * from "./lib/schedule";
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/activities/schedule.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/activities/lib/schedule.ts src/features/activities/client.ts tests/activities/schedule.test.ts
git commit -m "feat(schedule): schedule rules and opening-time wording (D602, D604)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Coming soon card, section and nav rules

**Files:**
- Modify: `src/features/activities/lib/activity-card.ts`
- Modify: `src/features/activities/lib/portal-activities.ts`
- Modify: `src/features/activities/cards.ts`
- Test: `tests/activities/activity-card.test.ts`, `tests/activities/portal-activities.test.ts`, `tests/activities/cards.test.ts`

**Interfaces:**
- Consumes: `opensLabel(iso)` from Task 2.
- Produces:
  - `CardView.action: { label: string; primary: boolean } | null`.
  - `comingSoonCard(opensAt: string): CardView`.
  - `comingSoonForAttendees<T extends Pick<Activity, "is_open" | "opens_at">>(activities: T[]): T[]`.
  - `activityNav(activities, category, heldActivityIds, coming?: Pick<Activity, "categories">[])`.
  - `CardSection = "pinned" | "coming" | ActivitySection`.
  - `ActivityCardItem.href: string | null` (null only for Coming soon).
  - `activityCards(entries: ActivityEntries & { coming?: Activity[] }, basePath: string)`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/activities/activity-card.test.ts` (and add `comingSoonCard` to its import from `@/features/activities/lib/activity-card`):

```ts
describe("comingSoonCard (D604)", () => {
  it("says Coming soon and when, with no button", () => {
    expect(comingSoonCard("2026-10-17T02:00:00+00:00")).toEqual({
      status: { label: "Coming soon", tone: "muted" },
      meta: { icon: "clock", text: "Opens Sat 17 Oct, 10:00am" },
      action: null,
    });
  });
});
```

Append to `tests/activities/portal-activities.test.ts` (add `comingSoonForAttendees` to the import from `@/features/activities/lib/portal-activities`):

```ts
describe("comingSoonForAttendees (D603)", () => {
  it("keeps closed activities with a schedule, and nothing else", () => {
    const list = [
      activity({ id: "open", is_open: true }),
      activity({ id: "closed", is_open: false }),
      activity({ id: "soon", is_open: false, opens_at: "2026-10-17T02:00:00+00:00" }),
    ];
    expect(comingSoonForAttendees(list).map((a) => a.id)).toEqual(["soon"]);
  });
});

describe("activityNav with Coming soon (D606)", () => {
  const soon = activity({ id: "soon", is_open: false, opens_at: "2026-10-17T02:00:00+00:00", required: true, categories: ["VIP"] });

  it("shows the button when the only thing is Coming soon, for a category that can use it", () => {
    expect(activityNav([], "VIP", new Set(), [soon])).toEqual({ show: true, owed: false });
  });

  it("does not show it to a category the activity is not for", () => {
    expect(activityNav([], "Staff", new Set(), [soon])).toEqual({ show: false, owed: false });
  });

  it("never owes a required booking that has not opened", () => {
    expect(activityNav([], "VIP", new Set(), [soon]).owed).toBe(false);
  });
});
```

In `tests/activities/cards.test.ts`, fix the one existing line that reads `c.view.action.label` to `c.view.action?.label`, then append:

```ts
describe("activityCards — Coming soon (D605)", () => {
  const soon = (id: string, over: Partial<Activity> = {}) =>
    activity(id, { is_open: false, opens_at: "2026-10-17T02:00:00+00:00", ...over });

  it("lists it after Open and before Done, with no link, ring or button", () => {
    const cards = activityCards(
      { booking: [booking("b")], submission: [], passport: [passport("p", true)], polaroid: [], coming: [soon("s", { required: true })] },
      "/p",
    );
    expect(cards.map((c) => [c.activity.id, c.section])).toEqual([["b", "open"], ["s", "coming"], ["p", "done"]]);
    const s = cards.find((c) => c.activity.id === "s")!;
    expect(s.href).toBeNull();
    expect(s.emphasis).toBe(false);
    expect(s.view.action).toBeNull();
    expect(s.view.status).toEqual({ label: "Coming soon", tone: "muted" });
  });

  it("keeps a pinned one under Pinned, still as Coming soon", () => {
    const cards = activityCards({ booking: [booking("b")], submission: [], passport: [], polaroid: [], coming: [soon("s", { pinned: true })] }, "/p");
    expect(cards.map((c) => [c.activity.id, c.section, c.href])).toEqual([["s", "pinned", null], ["b", "open", "/p/activities/b"]]);
  });

  it("draws nothing extra when there is no coming list", () => {
    expect(activityCards({ booking: [booking("b")], submission: [], passport: [], polaroid: [] }, "/p")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/activities/activity-card.test.ts tests/activities/portal-activities.test.ts tests/activities/cards.test.ts`
Expected: FAIL. `comingSoonCard` and `comingSoonForAttendees` are not exported, `activityNav` ignores the 4th argument, and the Coming soon cards are missing.

- [ ] **Step 3: Implement `comingSoonCard`**

In `src/features/activities/lib/activity-card.ts`:

Add the import after the existing imports:

```ts
import { opensLabel } from "./schedule";
```

Change `CardView`'s `action` line to:

```ts
  /** What tapping does. Null on a Coming soon card, which is not a link (D604). */
  action: { label: string; primary: boolean } | null;
```

Append at the end of the file:

```ts
/**
 * A scheduled activity's card before it opens (D604): when it opens, and nothing to press -
 * the card is not a link, because nothing on its page is open yet. Every kind uses this one.
 */
export function comingSoonCard(opensAt: string): CardView {
  return { status: { label: "Coming soon", tone: "muted" }, meta: { icon: "clock", text: `Opens ${opensLabel(opensAt)}` }, action: null };
}
```

- [ ] **Step 4: Implement the portal filter and nav**

In `src/features/activities/lib/portal-activities.ts`, after `shownToAttendees`:

```ts
/**
 * D603: the one closed state attendees see - a closed activity with a schedule. Only the
 * Activities tab's and home row's cards and the nav's `show` read this; everything else reads
 * `shownToAttendees` and never sees it.
 */
export function comingSoonForAttendees<T extends Pick<Activity, "is_open" | "opens_at">>(activities: T[]): T[] {
  return activities.filter((a) => !a.is_open && !!a.opens_at);
}
```

Replace `activityNav` with:

```ts
export function activityNav(
  activities: Pick<Activity, "id" | "kind" | "required" | "categories">[],
  category: string | null,
  heldActivityIds: ReadonlySet<string>,
  /** D606: Coming soon activities. They bring the button, so their card has somewhere to show, but never the dot. */
  coming: Pick<Activity, "categories">[] = [],
): ActivityNav {
  const visible = activities.filter((a) => eligible(a, category));
  return {
    show: visible.length > 0 || coming.some((a) => eligible(a, category)),
    owed: visible.some((a) => a.kind === "booking" && a.required && !heldActivityIds.has(a.id)),
  };
}
```

- [ ] **Step 5: Implement the cards**

In `src/features/activities/cards.ts`:

Change the `activity-card` import line to include `comingSoonCard`:

```ts
import { bookingCard, comingSoonCard, formCard, passportCard, polaroidCard, type CardView } from "./lib/activity-card";
```

Replace the `CardSection` type, the `href` field of `ActivityCardItem`, and `SECTION_ORDER`:

```ts
/** The Activities tab's headings: the organiser's pins (D387), then where each card sits for the attendee; Coming soon is D605's. */
export type CardSection = "pinned" | "coming" | ActivitySection;
```

```ts
  /** The activity's page; null on a Coming soon card, which is not a link (D604). */
  href: string | null;
```

```ts
const SECTION_ORDER: readonly Exclude<CardSection, "pinned">[] = ["choose", "booked", "open", "coming", "done"];
```

Change the `activityCards` signature and its ordering. The signature becomes:

```ts
export function activityCards(entries: ActivityEntries & { coming?: Activity[] }, basePath: string): ActivityCardItem[] {
```

Replace the block from `// Kinds in ACTIVITY_KINDS order` down to `const ordered = …` with:

```ts
  // D605: scheduled, not yet open - after everything open, before Done. Not a link, never ringed:
  // a required one owes nothing until it opens (D606).
  const coming: ActivityCardItem[] = (entries.coming ?? []).flatMap((activity) =>
    activity.opens_at ? [{ activity, view: comingSoonCard(activity.opens_at), href: null, emphasis: false, section: "coming" as const }] : [],
  );

  // Kinds in ACTIVITY_KINDS order, then a stable sort by section: within a section, bookings,
  // then forms, then passports, as the tab has always listed them.
  const rank = (s: CardSection) => SECTION_ORDER.indexOf(s as Exclude<CardSection, "pinned">);
  const ordered = [...ACTIVITY_KINDS.flatMap((k) => cardsOf(k)), ...coming].sort((a, b) => rank(a.section) - rank(b.section));
```

Update the doc comment above `activityCards` to name Coming soon in the order: "To choose, Booked, Open to you (…), Coming soon (D605), Done".

- [ ] **Step 6: Run to verify they pass**

Run: `npx vitest run tests/activities/activity-card.test.ts tests/activities/portal-activities.test.ts tests/activities/cards.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors only in `src/features/activities/portal/ActivitiesTab.tsx` (`view.action` possibly null, `href` possibly null) and `src/features/activities/portal/HomeActivities.tsx` (passes the nullable `href` through `cardProps`). Task 4's new `ActivityCard` fixes both. Any other error must be fixed here.

- [ ] **Step 8: Commit**

```bash
git add src/features/activities/lib/activity-card.ts src/features/activities/lib/portal-activities.ts src/features/activities/cards.ts tests/activities/activity-card.test.ts tests/activities/portal-activities.test.ts tests/activities/cards.test.ts
git commit -m "feat(schedule): Coming soon card, section and nav rules (D603-D606)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Portal wiring and the card markup

**Files:**
- Modify: `src/lib/portal.ts`
- Modify: `src/features/activities/lib/portal-activity-entries.ts`
- Modify: `src/lib/portal-home.ts` (`loadActivityNav`)
- Modify: `src/features/activities/portal/ActivitiesTab.tsx`

**Interfaces:**
- Consumes: `comingSoonForAttendees`, `activityNav(…, coming)`, `activityCards(entries & { coming })`, nullable `href` and `action` (Task 3).
- Produces: `portalComingSoon(eventId: string): Promise<Activity[]>` (memoised); `loadActivityEntries` returns `coming: Activity[]` (category-filtered).

- [ ] **Step 1: One activities read, two filters**

In `src/lib/portal.ts`, change the import from `@/features/activities` to include `comingSoonForAttendees`:

```ts
import { listActivities, bookingsForAttendee, shownToAttendees, comingSoonForAttendees } from "@/features/activities";
```

Replace the `portalActivities` line (keep its doc comment) with:

```ts
const eventActivities = cache((eventId: string) => listActivities(eventId));
export const portalActivities = cache(async (eventId: string) => shownToAttendees(await eventActivities(eventId)));
/** D603: the scheduled ones, for the cards and the nav's `show` only. Same read as `portalActivities`. */
export const portalComingSoon = cache(async (eventId: string) => comingSoonForAttendees(await eventActivities(eventId)));
```

- [ ] **Step 2: Entries carry `coming`**

In `src/features/activities/lib/portal-activity-entries.ts`:

Change the portal import to:

```ts
import { portalActivities, portalComingSoon, portalBookings } from "@/lib/portal";
```

Add `coming: Activity[];` to the return type, beside `people`:

```ts
}): Promise<ActivityEntries & {
  people: Record<string, { name: string; movedTo: string | null }>;
  /** D603: scheduled activities this attendee's category could use, for their Coming soon cards. */
  coming: Activity[];
}> {
```

Replace `const activities = await portalActivities(event.id);` with:

```ts
  const [activities, scheduled] = await Promise.all([portalActivities(event.id), portalComingSoon(event.id)]);
```

Change the final return to:

```ts
  return {
    booking: bookings, submission: forms, passport: passports, polaroid: polaroids, people,
    coming: scheduled.filter((a) => eligible(a, attendee.category)),
  };
```

- [ ] **Step 3: The nav sees Coming soon**

In `src/lib/portal-home.ts`, change the portal import to include `portalComingSoon`, and replace the body of `loadActivityNav` with:

```ts
  const [activities, coming] = await Promise.all([portalActivities(event.id), portalComingSoon(event.id)]);
  const mayOwe = activities.some((a) => a.kind === "booking" && a.required && eligible(a, attendee.category));
  const held = mayOwe ? new Set((await portalBookings(attendee.id)).map((b) => b.activity_id)) : new Set<string>();
  return activityNav(activities, attendee.category, held, coming);
```

- [ ] **Step 4: The tab's section and the card without a link**

In `src/features/activities/portal/ActivitiesTab.tsx`:

Add `{ key: "coming", title: "Coming soon" },` to `SECTIONS` between `open` and `done`.

Change the `ActivitiesTab` props type to accept the coming list:

```ts
export function ActivitiesTab({ entries, basePath }: { entries: ActivityEntries & { coming?: Activity[] }; basePath: string }) {
```

Update its doc comment's section list to "Pinned (D387), To choose, Booked, Open to you, Coming soon (D605), Done", and note that a Coming soon card is the one card that does not go to a page.

Replace the whole `ActivityCard` function with:

```tsx
/**
 * One activity as a card. The whole card is the link; the pill on the right is what tapping
 * it will do, drawn as a button so it reads as one, but it is not a second target.
 *
 * A Coming soon card (D604) has no link and no pill: a plain block with the same outline, and
 * no press effect, because there is nothing to open yet.
 */
export function ActivityCard({ activity, view, href, emphasis = false, className = "" }: {
  activity: Activity;
  view: CardView;
  /** Null for a Coming soon card. */
  href: string | null;
  /** Required and not yet chosen: ringed in the brand colour so it is the card the eye lands on. */
  emphasis?: boolean;
  className?: string;
}) {
  const shape = `flex flex-col overflow-hidden rounded-2xl bg-card ${emphasis ? "ring-2 ring-primary" : "ring-1 ring-foreground/10"} ${className}`;
  const body = (
    <>
      <ActivityCover activity={activity} variant="card" />
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <KindTag kind={activity.kind} />
          {view.status && <StatusChip status={view.status} />}
        </div>
        <div className="text-[15px] font-bold leading-snug">{activity.name}</div>
        <div className="mt-auto flex items-center justify-between gap-3">
          {view.meta ? <MetaLine meta={view.meta} /> : <span />}
          {view.action && (
            <span
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-bold ${view.action.primary ? "bg-primary text-primary-foreground" : "border border-border text-foreground"}`}
            >
              {view.action.label}
            </span>
          )}
        </div>
      </div>
    </>
  );
  if (href === null) return <div className={shape}>{body}</div>;
  return (
    <Link href={href} className={`group outline-none transition-transform active:scale-[0.99] focus-visible:ring-3 focus-visible:ring-ring/50 ${shape}`}>
      {body}
    </Link>
  );
}
```

`HomeActivities.tsx` needs no change: it passes `cardProps(c)` through, and `href` may now be null.

- [ ] **Step 5: Typecheck, lint, all tests**

Run: `npx tsc --noEmit` → no errors.
Run: `npm run lint` → no new errors.
Run: `npm test` → all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/portal.ts src/features/activities/lib/portal-activity-entries.ts src/lib/portal-home.ts src/features/activities/portal/ActivitiesTab.tsx
git commit -m "feat(schedule): Coming soon cards on the Activities tab and home row (D603-D606)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Admin actions

**Files:**
- Modify: `src/features/activities/admin/actions.ts`

**Interfaces:**
- Consumes: `scheduleAt`, `scheduleCheck`, `opensLabel` (Task 2); `NewActivity.opens_at` (Task 1).
- Produces:
  - `scheduleOpenAction(eventId: string, activityId: string, from: ActivityTab, fd: FormData): Promise<void>`. Reads the form fields `date` and `time`.
  - `removeScheduleAction(eventId: string, activityId: string, from: ActivityTab): Promise<void>`.
  - `toggleOpenAction` now writes `opens_at: null` every time.

Server actions have no unit-test harness here (the rules they call are tested in Task 2). They are exercised in Task 7's browser check.

- [ ] **Step 1: Import the rules**

Add to the imports in `src/features/activities/admin/actions.ts`:

```ts
import { scheduleAt, scheduleCheck, opensLabel } from "../lib/schedule";
```

- [ ] **Step 2: The Open switch clears any schedule**

In `toggleOpenAction`, replace the `updateActivity` line with:

```ts
  // D602: opening by hand opens now and drops the schedule; closing leaves none behind, so the
  // timer can never reopen something the organiser just closed.
  await updateActivity(activityId, ev.id, { is_open: !activity.is_open, opens_at: null });
```

- [ ] **Step 3: Add the two schedule actions**

Directly after `toggleOpenAction`:

```ts
/**
 * D602/D607: sets when a closed activity opens itself. Its own action, like the Open switch,
 * so no settings form can ever clear a schedule by leaving it out. Lands back on the tab it
 * was set from.
 */
export async function scheduleOpenAction(eventId: string, activityId: string, from: ActivityTab, fd: FormData) {
  const ev = await event(eventId);
  const activity = await getActivity(activityId, ev.id);
  if (!activity) redirect(flashPath(listPath(eventId), "That activity no longer exists.", "error"));
  const path = activityHref(eventId, activityId, from);
  const at = scheduleAt(text(fd, "date"), text(fd, "time"));
  const refusal = scheduleCheck(activity, at, new Date());
  if (refusal || !at) redirect(flashPath(path, refusal ?? "Pick a date and time.", "error"));
  await updateActivity(activityId, ev.id, { opens_at: at });
  revalidatePath(listPath(eventId));
  revalidatePath(detailPath(eventId, activityId));
  redirect(flashPath(path, `Opening scheduled for ${opensLabel(at)}.`));
}

/** D602: drops the schedule; the activity is plainly Closed again, and hidden from attendees (D384). */
export async function removeScheduleAction(eventId: string, activityId: string, from: ActivityTab) {
  const ev = await event(eventId);
  const activity = await getActivity(activityId, ev.id);
  if (!activity) redirect(flashPath(listPath(eventId), "That activity no longer exists.", "error"));
  await updateActivity(activityId, ev.id, { opens_at: null });
  revalidatePath(listPath(eventId));
  revalidatePath(detailPath(eventId, activityId));
  redirect(flashPath(activityHref(eventId, activityId, from), "Schedule removed."));
}
```

(If the timer opened the activity between the read and this write, the `activities_open_unscheduled` constraint rejects the write rather than leaving a stale schedule. That race is a minute-boundary edge case. A 500 there is acceptable; a silent stale value is not.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/activities/admin/actions.ts
git commit -m "feat(schedule): schedule and remove-schedule actions; the Open switch clears a schedule (D602)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Admin UI: Schedule button and Scheduled pill

**Files:**
- Create: `src/features/activities/admin/ScheduleOpen.tsx`
- Modify: `src/features/activities/kinds/booking/BookingDetail.tsx:31,109`
- Modify: `src/features/activities/kinds/submission/SubmissionDetail.tsx:34,130`
- Modify: `src/features/activities/kinds/passport/PassportDetail.tsx:28,81`
- Modify: `src/features/activities/kinds/polaroid/PolaroidDetail.tsx:23,43`
- Modify: `src/features/activities/admin/ActivityRows.tsx` (`StatusPill`, `Row`)

**Interfaces:**
- Consumes: `scheduleOpenAction`, `removeScheduleAction` (Task 5); `opensLabel`, `opensShort` (Task 2); `isoToLocalInput` from `@/lib/time`; `Modal` from `@/components/admin/Modal` (props `title`, `hint`, `trigger`, `icon`, children); `SubmitButton` from `@/components/admin/SubmitButton` (props `variant`, `formAction`).
- Produces: `ScheduleOpen({ activity, schedule, remove })`; `StatusPill({ open, opensAt? })`.

- [ ] **Step 1: The button and dialog**

`src/features/activities/admin/ScheduleOpen.tsx`:

```tsx
import { Modal } from "@/components/admin/Modal";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { isoToLocalInput } from "@/lib/time";
import { opensLabel } from "../lib/schedule";
import type { Activity } from "@/lib/types";

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const label = "text-sm font-bold";

/**
 * D607: beside every kind's Open switch while the activity is closed - "Schedule", or, once set,
 * when it opens. The dialog sets, changes or removes the time; the switch still opens it now.
 * Nothing at all while it is open: there is nothing to schedule.
 */
export function ScheduleOpen({ activity, schedule, remove }: {
  activity: Pick<Activity, "is_open" | "opens_at">;
  schedule: (fd: FormData) => Promise<void>;
  remove: () => Promise<void>;
}) {
  if (activity.is_open) return null;
  const at = activity.opens_at ?? null;
  const [day, time] = at ? isoToLocalInput(at).split("T") : ["", ""];
  return (
    <Modal
      title="Schedule opening"
      hint="It opens by itself at this time, Malaysia time. Until then attendees see it as Coming soon."
      trigger={at ? `Opens ${opensLabel(at)}` : "Schedule"}
      icon="clock"
    >
      <form action={schedule} className="grid gap-4">
        <div className="grid grid-cols-2 gap-4">
          <label className="grid gap-1.5"><span className={label}>Date</span>
            <input name="date" type="date" defaultValue={day} className={input} /></label>
          <label className="grid gap-1.5"><span className={label}>Time</span>
            <input name="time" type="time" defaultValue={time} className={input} /></label>
        </div>
        <div className="flex flex-wrap gap-2">
          <SubmitButton>Save</SubmitButton>
          {at && <SubmitButton variant="outline" formAction={remove}>Remove schedule</SubmitButton>}
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 2: Place it in the four headers**

In each file below, add `scheduleOpenAction, removeScheduleAction` to the existing import from `"../../admin/actions"`, add `import { ScheduleOpen } from "../../admin/ScheduleOpen";`, and insert the element **immediately before** the `<OpenSwitch … showLabel />` line.

`BookingDetail.tsx` and `SubmissionDetail.tsx` (they use `current`):

```tsx
            <ScheduleOpen
              activity={activity}
              schedule={scheduleOpenAction.bind(null, ev.id, activity.id, current)}
              remove={removeScheduleAction.bind(null, ev.id, activity.id, current)}
            />
```

`PassportDetail.tsx` and `PolaroidDetail.tsx` (they use `"setup"`):

```tsx
            <ScheduleOpen
              activity={activity}
              schedule={scheduleOpenAction.bind(null, ev.id, activity.id, "setup")}
              remove={removeScheduleAction.bind(null, ev.id, activity.id, "setup")}
            />
```

- [ ] **Step 3: The list's Scheduled pill**

In `src/features/activities/admin/ActivityRows.tsx`, add `import { opensShort } from "../lib/schedule";` and replace `StatusPill` with:

```tsx
/** Open, Closed, or D608's Scheduled with when beneath it: scheduled is still closed, but it is not the same news. */
export function StatusPill({ open, opensAt = null }: { open: boolean; opensAt?: string | null }) {
  if (!open && opensAt) {
    return (
      <span className="inline-flex flex-col items-start gap-0.5">
        <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">Scheduled</span>
        <span className="text-xs text-muted-foreground">{opensShort(opensAt)}</span>
      </span>
    );
  }
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${open ? "bg-success-soft text-success-strong" : "bg-muted text-muted-foreground"}`}>
      {open ? "Open" : "Closed"}
    </span>
  );
}
```

In `Row`, change both `<StatusPill open={activity.is_open} />` to:

```tsx
<StatusPill open={activity.is_open} opensAt={activity.opens_at} />
```

Run `grep -rn "StatusPill" src` to confirm there are no other callers. The new prop is optional, so any other caller still compiles.

- [ ] **Step 4: Typecheck, lint, tests**

Run: `npx tsc --noEmit` → no errors.
Run: `npm run lint` → no new errors.
Run: `npm test` → all pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/activities/admin/ScheduleOpen.tsx src/features/activities/admin/ActivityRows.tsx src/features/activities/kinds/booking/BookingDetail.tsx src/features/activities/kinds/submission/SubmissionDetail.tsx src/features/activities/kinds/passport/PassportDetail.tsx src/features/activities/kinds/polaroid/PolaroidDetail.tsx
git commit -m "feat(schedule): Schedule button on every kind's header and a Scheduled pill on the list (D607, D608)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Browser verification on a test event

**Files:** none, unless a defect is found. Fix it in the file that owns it, with its own commit.

Use the built-in browser and the project's dev server (`preview_start`, `.claude/launch.json`). Pick a test event that is **not** `ecphub`, e.g. `ecpkom`. Sign-in for admin is the user's existing session in the pane; if it is not signed in, ask the user to sign in rather than entering credentials.

- [ ] **Step 1: Admin: schedule a closed activity**

On the test event's Activities list, open a **closed** booking activity. Expect a `Schedule` button left of the switch. Open it, pick a date and a time about 3 minutes from now, and Save.
Expect: flash `Opening scheduled for <Day D Mon>, <time>.`; the button now reads `Opens …`; the switch still reads Closed.

- [ ] **Step 2: Admin: refusals**

Open the dialog, set a time in the past, Save → flash `Pick a time in the future.` Clear the date, Save → `Pick a date and time.` The schedule is unchanged after both.

- [ ] **Step 3: Admin: the list**

On the Activities list, the row shows `Scheduled` with `D Mon, h:mmam` beneath it, on desktop and at phone width (`resize_window` mobile). If the time wraps awkwardly in the Status column, widen that column in `ROW` from `5.5rem` to `7rem` (fix commit).

- [ ] **Step 4: Portal: Coming soon**

Open an attendee portal link for the same event, for an attendee whose category can use the activity. On the Activities tab, expect a `Coming soon` section holding the card, with the chip, the `Opens …` line and no button. Clicking it does nothing (`read_page`: it is not a link). The home row shows it too. Use `read_console_messages` to check for no errors.

- [ ] **Step 5: The timer opens it**

Wait until the scheduled minute has passed, plus up to one more minute (use `execute_sql`: `select is_open, opens_at from activities where id = '<id>'` until `is_open` is true). Reload the portal: the card is now the normal booking card in its usual section, with `Book`. On the admin page, the switch reads Open and there is no Schedule button.

- [ ] **Step 6: Open early and remove**

Close the activity again, schedule it for tomorrow, then (a) Remove schedule → flash `Schedule removed.`, button back to `Schedule`, and the portal card gone; (b) schedule again, then flip the switch on → it opens now, and `opens_at` is null (`execute_sql`).

- [ ] **Step 7: The other kinds**

On one submission, one passport and one polaroid activity (closed), confirm the Schedule button appears in the header, and that the scheduled card shows as Coming soon in the portal. Remove those schedules afterwards so the test event is left as you found it.

- [ ] **Step 8: Screenshot proof**

Take a screenshot of the admin header with `Opens …` and one of the portal Coming soon card for the user.

---

## Self-review notes

- Spec coverage: D600 → T1; D601 → T1; D602 → T2 + T5; D603 → T3 + T4; D604 → T2 + T3 + T4; D605 → T3 + T4; D606 → T3 + T4; D607 → T5 + T6; D608 → T6; D609 needs no code (nothing added to the add forms; no close; no notice).
- Refinements over the spec, all in its spirit: the timer calls a function rather than a bare UPDATE, so the DB check can run it; a check constraint enforces D600's "an open activity never carries one"; `toggleOpenAction` writes `opens_at: null` in both directions; a blank form gets `Pick a date and time.`; the example weekday is Sat, not Fri.
