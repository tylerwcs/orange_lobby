# Booth Passport as an Activity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Booth Passport the third `kind` of activity, so booths, bookings and submissions all live under Activities in the admin and the portal.

**Architecture:** `activities.kind` gains `'passport'`. Booths become children of a passport activity (`booths.activity_id`), and the passport's target and reward message move from `events` onto the activity. Stamping moves into a `record_stamp` RPC that enforces the activity's open flag and categories, the way `book_session` does. The admin booths screen becomes the passport's activity detail page; the portal shows the passport as an activity card and page. Every printed URL keeps working.

**Tech Stack:** Next.js 16 App Router + Server Actions, TypeScript, Supabase (Postgres, PostgREST RPC), vitest, ExcelJS, Tailwind + shadcn/Base UI.

**Spec:** `docs/superpowers/specs/2026-09-24-passport-activity-design.md` — read it first. Decision numbers D179–D192 below are defined there; D89–D103 are in `2026-09-16-booth-passport-design.md`.

## Global Constraints

- Lands before the **26 Sep 2026 code freeze**. Work on `main` (the user declines worktrees).
- **Do not `git push` until Task 7 says so.** Vercel deploys every push to `main`; intermediate commits must not reach production.
- Migration `0036` is applied to the live Supabase project in Task 1 (the DB holds test data only — no backup needed). Between that apply and the Task 7 deploy, the *old* production admin cannot add a booth (`booths.activity_id` is `not null`). Everything else keeps working. Keep that window short.
- Migration `0037` is applied **only after** the Task 7 deploy is Ready.
- `/booth/<token>`, `/e/<slug>/stamps`, `/e/<slug>/a/<token>/stamps` and the `stamps` tile route must keep working (D191).
- The booth scanner never receives more than name + progress for an attendee, and nothing at all for an ineligible one (D98, D184).
- Every activity RPC: `revoke execute ... from public, anon, authenticated; grant execute ... to service_role`.
- Tests: `npx vitest run <file>`; types: `npx tsc --noEmit`; lint: `npm run lint`. Tests are pure `src/lib` only — no component tests exist, do not add a DOM harness.
- Before writing Next.js code, check `node_modules/next/dist/docs/` for anything touched (`redirect`, `searchParams`, server actions) — this Next version differs from training data (AGENTS.md).
- Comment density and voice: match the surrounding files (they explain *why*, cite decision numbers).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Schema — the passport kind, booths under it, `record_stamp`

**Files:**
- Create: `supabase/migrations/0036_passport_kind.sql`
- Modify: `src/lib/types.ts` (`ActivityKind` ~162, `Activity` ~164-199, `Booth` ~141-150)
- Modify (fixtures): `tests/activities.test.ts`, `tests/activity-card.test.ts`, `tests/activity-requests.test.ts`, `tests/activity-summary.test.ts`, `tests/portal-activities.test.ts`, `tests/submissions.test.ts`, `tests/booths.test.ts`, `tests/exports.test.ts`

**Interfaces:**
- Produces: `ActivityKind = "booking" | "submission" | "passport"`; `Activity.stamps_required: number | null`; `Activity.reward_message: string | null`; `Booth.activity_id: string`; SQL `record_stamp(p_booth_id uuid, p_attendee_id uuid) returns text` ∈ `ok|duplicate|closed|ineligible|missing`.

- [ ] **Step 1: Confirm the live constraint name and modules shape**

Find the project with the Supabase MCP `list_projects` (the one named `orange-lobby`, region ap-southeast-1), then run with `execute_sql`:

```sql
select conname from pg_constraint where conrelid = 'activities'::regclass and contype = 'c';
select id, jsonb_typeof(modules) as t, stamps_required, stamps_message from events
 where exists (select 1 from booths b where b.event_id = events.id);
```

Expected: a constraint named `activities_kind_check` (plus others); the test event `d634961c-f7a6-4d58-9436-004bb95b982d` with `stamps_required = 2` and a message. If the kind constraint has another name, use that name in Step 2.

- [ ] **Step 2: Write the migration**

`supabase/migrations/0036_passport_kind.sql`:

```sql
-- The Booth Passport becomes the third kind of activity (D179) — the expand half of an
-- expand/contract pair (D189). 0037 drops events.stamps_required and events.stamps_message
-- once the code that stops reading them is live.
--
-- Booths become a passport's children the way sessions are a booking's (D180). booth_stamps is
-- untouched: a stamp still points at a booth, and a booth now points at its passport.

alter table activities drop constraint if exists activities_kind_check;
alter table activities add constraint activities_kind_check
  check (kind in ('booking', 'submission', 'passport'));

-- Passport-only, as questions and per_day are submission-only (D182). Null target is every
-- booth, exactly as events.stamps_required meant.
alter table activities
  add column if not exists stamps_required int check (stamps_required is null or stamps_required >= 1),
  add column if not exists reward_message text;

-- Cascade, not restrict: deleting a passport takes its booths — and the restrict that
-- booth_stamps.booth_id already carries is what refuses that once anyone is stamped (D188).
alter table booths add column if not exists activity_id uuid references activities(id) on delete cascade;

-- One open, everyone passport per event that has booths (D186), named after the event's own
-- "stamps" tile when it has one. Written for the data that might exist, not the data believed
-- to exist (the 0029 lesson), and idempotent: an event that already has a passport is skipped.
insert into activities (org_id, event_id, name, kind, required, is_open, max_per_attendee,
                        categories, stamps_required, reward_message, sort_order)
select e.org_id, e.id,
       coalesce(
         (select nullif(btrim(m->>'label'), '')
            from jsonb_array_elements(case when jsonb_typeof(e.modules) = 'array' then e.modules else '[]'::jsonb end) m
           where m->>'key' = 'tile' and m->'target'->>'route' = 'stamps'
           limit 1),
         'Booth Passport'),
       'passport', false, true, null, null,
       -- A zero or negative target always meant "every booth" (stampsTarget); the new column
       -- refuses it, so it arrives as the null that means the same thing.
       case when e.stamps_required >= 1 then e.stamps_required end,
       e.stamps_message,
       coalesce((select max(a.sort_order) + 1 from activities a where a.event_id = e.id), 0)
  from events e
 where exists (select 1 from booths b where b.event_id = e.id)
   and not exists (select 1 from activities a where a.event_id = e.id and a.kind = 'passport');

update booths b
   set activity_id = (select a.id from activities a
                       where a.event_id = b.event_id and a.kind = 'passport'
                       order by a.sort_order, a.created_at limit 1)
 where b.activity_id is null;

alter table booths alter column activity_id set not null;
create index if not exists booths_activity_id_idx on booths (activity_id);

-- Stamping, decided in one function (D185). It was a bare insert while there was nothing to
-- check; categories and the open flag (D184) would make it a read-then-write in the server
-- action, and every other activity write here is decided in the database for that reason.
create or replace function record_stamp(p_booth_id uuid, p_attendee_id uuid) returns text
language plpgsql
as $$
declare
  b booths%rowtype;
  a activities%rowtype;
  att attendees%rowtype;
  inserted int;
begin
  select * into b from booths where id = p_booth_id;
  if not found then return 'missing'; end if;

  -- FOR SHARE, not FOR UPDATE: a close (an UPDATE of this row) waits for stamps in flight and
  -- they wait for it, so a stamp is either before the close or after it — but two booths
  -- stamping at once do not queue behind each other.
  select * into a from activities where id = b.activity_id for share;
  if not found then return 'missing'; end if;
  -- The 0030 convention: another kind's id is not a closed passport, it is no passport.
  if a.kind <> 'passport' then return 'missing'; end if;

  select * into att from attendees where id = p_attendee_id;
  if not found or att.event_id <> b.event_id then return 'missing'; end if;

  if not a.is_open then return 'closed'; end if;

  if a.categories is not null and array_length(a.categories, 1) > 0 then
    if att.category is null or not exists (
      select 1 from unnest(a.categories) c
      where lower(btrim(c)) = lower(btrim(att.category))
    ) then
      return 'ineligible';
    end if;
  end if;

  insert into booth_stamps (org_id, event_id, booth_id, attendee_id)
  values (b.org_id, b.event_id, b.id, p_attendee_id)
  on conflict (booth_id, attendee_id) do nothing;
  get diagnostics inserted = row_count;

  return case when inserted = 1 then 'ok' else 'duplicate' end;
end;
$$;

revoke execute on function record_stamp(uuid, uuid) from public, anon, authenticated;
grant execute on function record_stamp(uuid, uuid) to service_role;
```

- [ ] **Step 3: Apply it**

Supabase MCP `apply_migration` with name `0036_passport_kind` and the file's contents.

- [ ] **Step 4: Verify the backfill**

```sql
select a.id, a.name, a.kind, a.is_open, a.categories, a.stamps_required, a.reward_message,
       (select count(*) from booths b where b.activity_id = a.id) as booths,
       (select count(*) from booth_stamps s join booths b on b.id = s.booth_id where b.activity_id = a.id) as stamps
  from activities a where a.kind = 'passport';
select count(*) as orphans from booths where activity_id is null;
```

Expected for the test event: one row, `is_open = true`, `categories = null`, `stamps_required = 2`, message carried, `booths = 3`, `stamps = 3`; `orphans = 0`.

Idempotency — re-run only the migration's `insert ... select` statement, then:

```sql
select event_id, count(*) from activities where kind = 'passport' group by event_id;
```

Expected: still 1 per event.

- [ ] **Step 5: Verify every `record_stamp` code, then undo**

Run as one `execute_sql` call so nothing persists:

```sql
begin;
-- A throwaway attendee in its own statement: rows a data-modifying CTE inserts are not
-- reliably visible to a function called in the same statement.
insert into attendees (org_id, event_id, name, token, category, source)
select org_id, id, 'Stamp Probe', 'PROBEPROBE12', 'Crew', 'walkin'
  from events where id = 'd634961c-f7a6-4d58-9436-004bb95b982d';
-- Two volatile calls in one select list run in order, the second seeing the first's insert.
select record_stamp(b.id, att.id) as first, record_stamp(b.id, att.id) as second
  from (select bo.id from booths bo join activities a on a.id = bo.activity_id
         where a.event_id = 'd634961c-f7a6-4d58-9436-004bb95b982d' and a.kind = 'passport'
         order by bo.sort_order limit 1) b,
       (select id from attendees where token = 'PROBEPROBE12') att;
rollback;
```

Expected: `first = ok`, `second = duplicate`. The later probes below reuse the same insert statement inside their own `begin; ... rollback;`.

Then, each in its own `begin; ... rollback;`:
- `update activities set is_open = false where kind = 'passport' and event_id = '<test event>'` → `record_stamp` for a new probe returns `closed`.
- `update activities set categories = array['VIP'] ...` with a `Crew` probe → `ineligible`.
- `record_stamp('<a booth id>', '<an attendee id from a different event>')` → `missing` (skip if only one event exists; say so in the report).
- `record_stamp(gen_random_uuid(), '<probe>')` → `missing`.
- Temporarily `update activities set kind = 'booking' where id = '<passport id>'` → `missing`.

Also confirm D188:

```sql
begin;
delete from activities where kind = 'passport' and event_id = 'd634961c-f7a6-4d58-9436-004bb95b982d';
rollback;
```

Expected: `ERROR: update or delete on table "booths" violates foreign key constraint ... on table "booth_stamps"` (23503).

- [ ] **Step 6: Types**

In `src/lib/types.ts`:

```ts
export type Booth = {
  id: string;
  org_id: string;
  event_id: string;
  /** The passport this booth stamps into (D180). */
  activity_id: string;
  name: string;
  location: string | null;
  /** The booth's scanner authority. Printed as a QR; never shown to attendees. */
  token: string;
  sort_order: number;
};
```

```ts
/** What an attendee does with an activity: take a seat, send answers, or collect stamps (D178, D179). */
export type ActivityKind = "booking" | "submission" | "passport";
```

In `Activity`, update the `kind` doc comment to name `passport` (booths and a target), and add after `action_label`:

```ts
  /** Passport kind only. How many stamps fill the card; null is every booth (D182). */
  stamps_required: number | null;
  /** Passport kind only. Shown once the card is full - the prize, in the organiser's words (D96). */
  reward_message: string | null;
```

Leave `Event.stamps_required` / `Event.stamps_message` in place — Task 7 removes them.

- [ ] **Step 7: Fixtures**

Every `Activity` fixture in the six activity/submission test files ends `... action_label: null, sort_order: 0, ...over` — add `stamps_required: null, reward_message: null,` after `action_label: null,`. Every `Booth` literal in `tests/booths.test.ts` (the `booth()` helper) and `tests/exports.test.ts` (the two booth objects) gains `activity_id: "p1",`.

Find them all:

```bash
grep -rn "action_label: null" tests
grep -rn "token: \"t\|token: \`tok" tests
```

- [ ] **Step 8: Typecheck and test**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; every test passes (nothing reads the new fields yet).

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0036_passport_kind.sql src/lib/types.ts tests
git commit -m "feat(activities): add the passport kind, booths under it, and record_stamp

The expand half (D189): kind 'passport', stamps_required and
reward_message on activities, booths.activity_id, one open passport
backfilled per event with booths (D186), and stamping decided in one
function that enforces the open flag and categories (D184, D185).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Pure passport logic

**Files:**
- Modify: `src/lib/booths.ts`
- Modify: `src/lib/activity-card.ts`
- Modify: `src/lib/portal-activities.ts`
- Test: `tests/booths.test.ts`, `tests/activity-card.test.ts`, `tests/portal-activities.test.ts`

**Interfaces:**
- Consumes: Task 1 types.
- Produces:
  - `firstPassport<T extends Pick<Activity, "kind">>(activities: T[]): T | null` (src/lib/booths.ts)
  - `passportRollup(passports: Pick<Activity, "id" | "stamps_required">[], booths: Booth[], stamps: BoothStamp[]): Record<string, { booths: number; completed: number }>` (src/lib/booths.ts)
  - `readPassportSettings(raw: { stamps_required: string; reward_message: string }, boothCount: number | null): { stamps_required: number | null; reward_message: string | null }` — throws `Error` with a user-facing message (src/lib/booths.ts)
  - `passportCard(input: { passport: Pick<Passport, "cells" | "collected" | "target" | "complete">; open: boolean }): CardView` (src/lib/activity-card.ts)
  - `ActivitySection = "choose" | "booked" | "open" | "done"`; `passportSection(passport: Pick<Passport, "complete">): "open" | "done"` (src/lib/portal-activities.ts)

- [ ] **Step 1: Write the failing tests — `tests/booths.test.ts`**

Extend the imports: `import { buildPassport, completionByAttendee, firstPassport, passportRollup, progressLine, readPassportSettings, stampsTarget } from "@/lib/booths";`. Change the `booth` helper to take a passport id:

```ts
const booth = (id: string, sort_order = 0, activity_id = "p1"): Booth => ({
  id, org_id: "o", event_id: "e", activity_id, name: id, location: null, token: `tok${id}`, sort_order,
});
```

Append:

```ts
describe("buildPassport across two passports", () => {
  // stampsForAttendee returns every stamp the attendee has in the event; a second passport's
  // stamps must not count towards this one's card.
  it("counts only the stamps made at this passport's booths", () => {
    const mine = [booth("b1", 0, "p1"), booth("b2", 1, "p1")];
    const stamps = [stamp("b1", "a1", "2026-09-30T02:00:00Z"), stamp("x9", "a1", "2026-09-30T03:00:00Z")];
    const p = buildPassport(mine, stamps, null);
    expect(p.collected).toBe(1);
    expect(p.cells.map((c) => c.stampedAt !== null)).toEqual([true, false]);
  });
});

describe("passportRollup", () => {
  const booths = [booth("b1", 0, "p1"), booth("b2", 1, "p1"), booth("c1", 0, "p2")];
  const stamps = [
    stamp("b1", "a1", "2026-09-30T02:00:00Z"), stamp("b2", "a1", "2026-09-30T02:10:00Z"),
    stamp("b1", "a2", "2026-09-30T02:20:00Z"), stamp("c1", "a2", "2026-09-30T02:30:00Z"),
  ];

  it("counts each passport's booths and completions separately", () => {
    expect(passportRollup([{ id: "p1", stamps_required: null }, { id: "p2", stamps_required: null }], booths, stamps)).toEqual({
      p1: { booths: 2, completed: 1 },
      p2: { booths: 1, completed: 1 },
    });
  });

  it("honours each passport's own target", () => {
    expect(passportRollup([{ id: "p1", stamps_required: 1 }], booths, stamps)).toEqual({ p1: { booths: 2, completed: 2 } });
  });

  it("gives a passport with no booths zeros rather than no entry", () => {
    expect(passportRollup([{ id: "p3", stamps_required: null }], booths, stamps)).toEqual({ p3: { booths: 0, completed: 0 } });
  });
});

describe("firstPassport", () => {
  it("is the first passport in the order given, skipping other kinds", () => {
    const list = [{ id: "a", kind: "booking" }, { id: "b", kind: "passport" }, { id: "c", kind: "passport" }] as const;
    expect(firstPassport([...list])?.id).toBe("b");
  });

  it("is null when there is none", () => {
    expect(firstPassport([{ id: "a", kind: "submission" as const }])).toBeNull();
  });
});

describe("readPassportSettings", () => {
  it("reads a blank target as every booth and a blank message as none", () => {
    expect(readPassportSettings({ stamps_required: "", reward_message: "  " }, 3)).toEqual({ stamps_required: null, reward_message: null });
  });

  it("keeps a whole-number target within the booth count", () => {
    expect(readPassportSettings({ stamps_required: "2", reward_message: "Collect at the desk" }, 3))
      .toEqual({ stamps_required: 2, reward_message: "Collect at the desk" });
  });

  it("refuses a target that is not a whole number of at least 1", () => {
    expect(() => readPassportSettings({ stamps_required: "0", reward_message: "" }, 3)).toThrow(/whole number/);
    expect(() => readPassportSettings({ stamps_required: "1.5", reward_message: "" }, 3)).toThrow(/whole number/);
    expect(() => readPassportSettings({ stamps_required: "two", reward_message: "" }, 3)).toThrow(/whole number/);
  });

  it("refuses a target above the booth count", () => {
    expect(() => readPassportSettings({ stamps_required: "4", reward_message: "" }, 3)).toThrow("This passport has 3 booths, so the target cannot be 4.");
  });

  // A new passport has no booths yet, so there is nothing to bound the target by; stampsTarget
  // clamps it on read until the booths exist.
  it("skips the upper bound when the booth count is not known yet", () => {
    expect(readPassportSettings({ stamps_required: "5", reward_message: "" }, null).stamps_required).toBe(5);
  });
});
```

- [ ] **Step 2: Write the failing tests — `tests/activity-card.test.ts`**

Add `passportCard` to the import from `@/lib/activity-card`, and append:

```ts
describe("passportCard", () => {
  const cells = (n: number) => Array.from({ length: n }, () => ({})) as never[];
  const card = (over: { n?: number; collected?: number; target?: number; complete?: boolean; open?: boolean } = {}) =>
    passportCard({
      passport: { cells: cells(over.n ?? 3), collected: over.collected ?? 0, target: over.target ?? 3, complete: over.complete ?? false },
      open: over.open ?? true,
    });

  it("says booths are coming when there are none", () => {
    expect(card({ n: 0, target: 0 })).toEqual({ status: null, meta: { icon: "pin", text: "Booths coming soon" }, action: { label: "View", primary: false } });
  });

  it("shows progress and invites a first visit while collecting", () => {
    expect(card({ collected: 1 })).toEqual({
      status: { label: "1 of 3 stamps", tone: "primary" },
      meta: { icon: "pin", text: "3 booths to visit" },
      action: { label: "Open card", primary: true },
    });
  });

  it("is complete once the target is met, whatever the open flag says", () => {
    expect(card({ collected: 3, complete: true, open: false }).status).toEqual({ label: "Complete", tone: "success" });
  });

  it("says it opens soon while closed", () => {
    expect(card({ open: false }).status).toEqual({ label: "Opens soon", tone: "muted" });
    expect(card({ open: false }).action).toEqual({ label: "View", primary: false });
  });

  it("names one booth in the singular", () => {
    expect(card({ n: 1, target: 1 }).meta).toEqual({ icon: "pin", text: "1 booth to visit" });
  });
});
```

- [ ] **Step 3: Write the failing tests — `tests/portal-activities.test.ts`**

Change the import to `import { activityNav, bookingSection, passportSection } from "@/lib/portal-activities";` and append:

```ts
describe("passportSection", () => {
  it("is Open to you while collecting and Done once complete — never To choose (D192)", () => {
    expect(passportSection({ complete: false })).toBe("open");
    expect(passportSection({ complete: true })).toBe("done");
  });
});

describe("activityNav with a passport", () => {
  it("shows the tab for an event whose only activity is a passport", () => {
    expect(activityNav([activity({ kind: "passport", required: false })], null, new Set()).show).toBe(true);
  });

  it("never owes anything for a passport, even one marked required", () => {
    // required is never set on a passport (D183), but the dot must not depend on that.
    expect(activityNav([activity({ kind: "passport", required: true })], null, new Set()).owed).toBe(false);
  });

  it("hides a passport outside the attendee's categories", () => {
    expect(activityNav([activity({ kind: "passport", categories: ["VIP"] })], "Crew", new Set()).show).toBe(false);
  });
});
```

- [ ] **Step 4: Run to see them fail**

Run: `npx vitest run tests/booths.test.ts tests/activity-card.test.ts tests/portal-activities.test.ts`
Expected: FAIL — `firstPassport`, `passportRollup`, `readPassportSettings`, `passportCard`, `passportSection` are not exported. The `activityNav` passport tests already pass (it is kind-agnostic apart from `owed`); that is expected.

- [ ] **Step 5: Implement — `src/lib/booths.ts`**

Change the type import to `import type { Activity, Booth, BoothStamp } from "@/lib/types";` and append:

```ts
/**
 * The passport an old, kind-less link means: `/stamps`, the signage QR, the "stamps" tile
 * (D191). The first by the order it is given in, which is `listActivities`' own sort order.
 */
export function firstPassport<T extends Pick<Activity, "kind">>(activities: T[]): T | null {
  return activities.find((a) => a.kind === "passport") ?? null;
}

/**
 * Each passport's booth count and how many attendees have filled its card, for the activity
 * list. Goes through `completionByAttendee` per passport rather than counting here, because
 * that is the one place "complete" is decided — the export and the passport page read it too.
 */
export function passportRollup(
  passports: Pick<Activity, "id" | "stamps_required">[],
  booths: Booth[],
  stamps: BoothStamp[],
): Record<string, { booths: number; completed: number }> {
  const out: Record<string, { booths: number; completed: number }> = {};
  for (const p of passports) {
    const mine = booths.filter((b) => b.activity_id === p.id);
    const completion = completionByAttendee(mine, stamps, p.stamps_required);
    out[p.id] = { booths: mine.length, completed: [...completion.values()].filter((c) => c.complete).length };
  }
  return out;
}

/**
 * The target and the message as an organiser typed them (D95, D96). A blank target is null,
 * which means every booth — clearing the box is an answer, not a mistake.
 *
 * `boothCount` is null when the passport is being created and has no booths to bound the
 * target by; `stampsTarget` clamps it on read until they exist.
 */
export function readPassportSettings(
  raw: { stamps_required: string; reward_message: string },
  boothCount: number | null,
): { stamps_required: number | null; reward_message: string | null } {
  const typed = raw.stamps_required.trim();
  let stamps_required: number | null = null;
  if (typed !== "") {
    const n = Number(typed);
    if (!Number.isInteger(n) || n < 1) throw new Error("Stamps needed must be a whole number, or blank for every booth.");
    if (boothCount !== null && n > boothCount) {
      throw new Error(`This passport has ${boothCount} booth${boothCount === 1 ? "" : "s"}, so the target cannot be ${n}.`);
    }
    stamps_required = n;
  }
  return { stamps_required, reward_message: raw.reward_message.trim() || null };
}
```

Also update `buildPassport`'s doc line "Takes the event's booths" → "Takes one passport's booths", and `Passport.cells`' comment "Every booth this event has" → "Every booth this passport has".

- [ ] **Step 6: Implement — `src/lib/activity-card.ts`**

Add `import type { Passport } from "@/lib/booths";` and append:

```ts
export type PassportCardInput = {
  passport: Pick<Passport, "cells" | "collected" | "target" | "complete">;
  /** The activity's open flag: whether booths may stamp into it right now (D184). */
  open: boolean;
};

/**
 * A Booth Passport's card. Its line is how many stands there are, because that is what tells
 * an attendee whether it is worth a walk; the chip is how far along they are.
 *
 * Complete is checked before closed: a card filled before the organiser closed stamping is
 * still a full card, and the prize is still theirs.
 */
export function passportCard({ passport, open }: PassportCardInput): CardView {
  const n = passport.cells.length;
  if (n === 0) return { status: null, meta: { icon: "pin", text: "Booths coming soon" }, action: view };
  const meta = { icon: "pin" as const, text: `${n} booth${n === 1 ? "" : "s"} to visit` };
  if (passport.complete) return { status: { label: "Complete", tone: "success" }, meta, action: view };
  if (!open) return { status: { label: "Opens soon", tone: "muted" }, meta, action: view };
  return {
    status: { label: `${passport.collected} of ${passport.target} stamps`, tone: "primary" },
    meta,
    action: { label: "Open card", primary: true },
  };
}
```

- [ ] **Step 7: Implement — `src/lib/portal-activities.ts`**

Add `import type { Passport } from "@/lib/booths";`, change line 13 to:

```ts
export type ActivitySection = "choose" | "booked" | "open" | "done";
```

and add after `bookingSection`:

```ts
/**
 * Where a passport sits on the Activities tab (D192): Open to you while there are stamps to
 * collect, Done once the card is full. Never To choose — that section means "you owe a pick",
 * and nothing is owed on a passport until a booth has stamped you (D183).
 */
export function passportSection(passport: Pick<Passport, "complete">): "open" | "done" {
  return passport.complete ? "done" : "open";
}
```

Update `activityNav`'s doc comment: the tab shows for any visible activity of any kind, passports included; the dot is still booking-only.

- [ ] **Step 8: Run the tests**

Run: `npx vitest run tests/booths.test.ts tests/activity-card.test.ts tests/portal-activities.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/booths.ts src/lib/activity-card.ts src/lib/portal-activities.ts tests/booths.test.ts tests/activity-card.test.ts tests/portal-activities.test.ts
git commit -m "feat(passport): the pure half of a passport activity

firstPassport for kind-less links (D191), a per-passport rollup for the
activity list, the settings reader, the card, and the Done section
(D192).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The booth scanner stamps through `record_stamp`

**Files:**
- Modify: `src/lib/db/booths.ts` (`recordStamp`; add `listPassportBooths`)
- Modify: `src/app/booth/[token]/actions.ts`
- Modify: `src/app/booth/[token]/page.tsx`
- Modify: `src/app/booth/[token]/BoothScanner.tsx`

**Interfaces:**
- Consumes: `record_stamp` (Task 1), `getActivity(id, eventId)` from `@/lib/db/activities`, `buildPassport`, `progressLine`.
- Produces:
  - `type StampResult = "ok" | "duplicate" | "closed" | "ineligible" | "missing"` (db/booths.ts)
  - `recordStamp(boothId: string, attendeeId: string): Promise<{ result: StampResult; existing?: BoothStamp }>`
  - `listPassportBooths(activityId: string): Promise<Booth[]>`
  - `BoothScanner` props gain `closed: boolean` and `booth.passport: string`.

- [ ] **Step 1: Data access**

In `src/lib/db/booths.ts`, add after `listBooths`:

```ts
/** One passport's booths, in admin order — what its card, its scanner progress and its page draw. */
export async function listPassportBooths(activityId: string): Promise<Booth[]> {
  const { data, error } = await serviceClient().from("booths").select("*")
    .eq("activity_id", activityId).order("sort_order").order("created_at");
  if (error) throw error;
  return data as Booth[];
}
```

Replace `recordStamp` with:

```ts
/** Every answer `record_stamp` can give (D185). `missing` means the booth, passport or attendee is gone or foreign. */
export type StampResult = "ok" | "duplicate" | "closed" | "ineligible" | "missing";

/**
 * One stamp, decided by `record_stamp` (0036): the open flag and the passport's categories are
 * checked in the same statement that writes, as `book_session` does for a seat (D184, D185).
 * The unique (booth_id, attendee_id) still makes a second scan a duplicate rather than a second
 * chop; on a duplicate the original row is read back so the booth can say when.
 */
export async function recordStamp(boothId: string, attendeeId: string): Promise<{ result: StampResult; existing?: BoothStamp }> {
  const db = serviceClient();
  const { data, error } = await db.rpc("record_stamp", { p_booth_id: boothId, p_attendee_id: attendeeId });
  if (error) throw error;
  const result = data as StampResult;
  if (result !== "duplicate") return { result };
  const { data: row, error: readError } = await db.from("booth_stamps").select("*")
    .eq("booth_id", boothId).eq("attendee_id", attendeeId).single();
  if (readError) throw readError;
  return { result, existing: row as BoothStamp };
}
```

- [ ] **Step 2: Server actions**

In `src/app/booth/[token]/actions.ts`:

Imports: add `import { getActivity } from "@/lib/db/activities";`, change the booths import to `listPassportBooths, getBoothByToken, recordStamp, deleteStamp, stampsForAttendee`, and `import type { Activity, Booth, Event } from "@/lib/types";`.

Replace `authoriseBooth`'s return type and tail:

```ts
async function authoriseBooth(boothToken: string): Promise<{ booth: Booth; event: Event; passport: Activity } | { error: string }> {
  if (!isValidToken(boothToken)) return { error: "This scanner link is not valid." };
  if (!allow(`booth:${boothToken}`, 120, 60_000)) return { error: "Too many scans at once. Wait a moment and try again." };
  const booth = await getBoothByToken(boothToken);
  if (!booth) return { error: "This scanner link no longer works. Ask the organiser for a new one." };
  const [event, passport] = await Promise.all([getEvent(booth.event_id), getActivity(booth.activity_id, booth.event_id)]);
  if (!event || !passport) return { error: "This scanner link no longer works. Ask the organiser for a new one." };
  if (event.status === "archived") return { error: "This event is closed, so stamping has finished." };
  return { booth, event, passport };
}
```

Replace `progressFor` and `stamp`:

```ts
// The same copy BoothScanner shows on load for a closed passport. Duplicated rather than
// exported: a "use server" file may only export async functions.
const CLOSED_MESSAGE = "This passport isn't open for stamping yet. Ask the organiser to open it.";

/** The progress line for one attendee on THIS passport, computed after the write so the booth sees the new total. */
async function progressFor(passport: Activity, attendeeId: string): Promise<Pick<BoothScanResult, "progress" | "collected" | "target">> {
  const [booths, stamps] = await Promise.all([listPassportBooths(passport.id), stampsForAttendee(attendeeId)]);
  const p = buildPassport(booths, stamps, passport.stamps_required);
  return { progress: progressLine(p), collected: p.collected, target: p.target };
}

async function stamp(booth: Booth, passport: Activity, attendeeId: string, name: string): Promise<BoothScanResult> {
  const r = await recordStamp(booth.id, attendeeId);
  if (r.result === "closed") return { status: "error", message: CLOSED_MESSAGE };
  // No name: D98 carries a name only for someone this booth may stamp (D184).
  if (r.result === "ineligible") return { status: "notfound", message: "Not part of this passport." };
  if (r.result === "missing") return { status: "notfound", message: "That attendee is no longer on the list." };
  const progress = await progressFor(passport, attendeeId);
  return r.result === "ok"
    ? { status: "ok", name, attendeeId, ...progress }
    : { status: "duplicate", name, attendeeId, ...progress, earlier: { at: r.existing!.stamped_at } };
}
```

Update the two callers: `return stamp(auth.booth, auth.passport, a.id, a.name);` in both `stampByTokenAction` and `stampByIdAction`. `undoStampAction` is unchanged (D187). `searchForBoothAction` is unchanged (D99).

- [ ] **Step 3: The page**

`src/app/booth/[token]/page.tsx` — add `import { getActivity } from "@/lib/db/activities";` and replace from `const event = ...` to the JSX:

```tsx
  const [event, passport] = await Promise.all([getEvent(booth.event_id), getActivity(booth.activity_id, booth.event_id)]);
  if (!event || !passport) notFound();

  const [count, total] = await Promise.all([
    countStampsForBooth(booth.id),
    countAttendees(event.id),
  ]);

  return (
    <BoothScanner
      boothToken={token}
      booth={{ name: booth.name, location: booth.location, passport: passport.name }}
      archived={event.status === "archived"}
      closed={!passport.is_open}
      initialCount={count}
      total={total}
    />
  );
```

- [ ] **Step 4: The scanner component**

In `src/app/booth/[token]/BoothScanner.tsx`:

After `ARCHIVED_MESSAGE` add:

```ts
// The same copy the server returns for a closed passport (actions.ts's stamp). Shown on load so
// the booth knows before the first badge; the camera still starts, because the organiser may
// open stamping at any moment and the next scan is decided by the server, not by this flag.
const CLOSED_MESSAGE = "This passport isn't open for stamping yet. Ask the organiser to open it.";
```

Props: add `closed,` to the destructure and `closed: boolean;` to the type; change `booth: { name: string; location: string | null };` to `booth: { name: string; location: string | null; passport: string };`.

Initial state:

```ts
  const [result, setResult] = useState<BoothScanResult | null>(
    archived ? { status: "error", message: ARCHIVED_MESSAGE } : closed ? { status: "error", message: CLOSED_MESSAGE } : null,
  );
```

Above line 143's booth name `<p>`, add:

```tsx
            <p className="truncate text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{booth.passport}</p>
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. `recordStamp` has no caller outside the booth scanner, and `listBooths`/`createBooth` are unchanged in this task, so the old admin booths page still compiles.

- [ ] **Step 6: Verify in the browser**

Start the dev server with `preview_start` (`name: "dev"`). Get a booth token:

```sql
select b.token, b.name, a.name as passport from booths b join activities a on a.id = b.activity_id
 where b.event_id = 'd634961c-f7a6-4d58-9436-004bb95b982d' order by b.sort_order limit 1;
```

Open `http://localhost:3000/booth/<token>`. Expected: the passport name above the booth name; no closed message (backfilled open). Use the name search (≥2 letters of a test attendee) and tap them: `Stamped` or `Already stamped at …` with a progress line. Then `update activities set is_open = false where kind = 'passport' and event_id = '<test event>'` via SQL, reload: the closed message shows on load, and stamping someone new returns it. Set `is_open = true` again. Undo a stamp you made: it works.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/booths.ts "src/app/booth/[token]"
git commit -m "feat(booth): stamp through record_stamp and name the passport

A closed passport refuses at the booth and says so on load; a badge
outside the passport's categories is refused with no name (D98, D184).
Progress counts this passport's booths only. Undo is untouched (D187).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Admin — New passport, its page, and Booths leaves the nav

**Files:**
- Modify: `src/lib/db/booths.ts` (`createBooth`, `setBoothOrder`)
- Modify: `src/lib/db/activities.ts` (`NewActivity`, `createActivity` returns id, add `deletePassportIfUnstamped`)
- Modify: `src/app/admin/events/[id]/activities/actions.ts`
- Modify: `src/app/admin/events/[id]/activities/page.tsx`
- Modify: `src/components/admin/ActivityRows.tsx`
- Create: `src/app/admin/events/[id]/activities/[activityId]/PassportDetail.tsx`
- Modify: `src/app/admin/events/[id]/activities/[activityId]/page.tsx`
- Modify: `src/app/admin/events/[id]/booths/page.tsx` (becomes a redirect)
- Delete: `src/app/admin/events/[id]/booths/actions.ts`
- Modify: `src/components/admin/nav.ts`
- Test: `tests/nav.test.ts`

**Interfaces:**
- Consumes: `readPassportSettings`, `passportRollup`, `completionByAttendee`, `eligible` (from `@/lib/activities`), `listPassportBooths`, `listStampsForEvent`.
- Produces:
  - `createBooth(passport: Pick<Activity, "id" | "org_id" | "event_id">, name: string, location: string | null): Promise<void>`
  - `setBoothOrder(eventId: string, activityId: string, orderedIds: string[]): Promise<void>`
  - `createActivity(...)`: `Promise<string>` (the new id)
  - `deletePassportIfUnstamped(id: string, eventId: string): Promise<boolean>`
  - Actions: `addPassportActivityAction(eventId, fd)`, `savePassportActivityAction(eventId, activityId, fd)`, `deletePassportActivityAction(eventId, activityId)`, `addBoothAction(eventId, activityId, fd)`, `renameBoothAction(eventId, activityId, boothId, fd)`, `reorderBoothsAction(eventId, activityId, ids)`, `deleteBoothAction(eventId, activityId, boothId)`.

- [ ] **Step 1: Nav test first**

In `tests/nav.test.ts`, append inside the `describe`:

```ts
  // Booths are a passport's children now (D190): they are reached through Activities.
  it("has no Booths item — booths live under their passport in Activities", () => {
    const all = hrefs({ id: "e1", check_in_enabled: true });
    expect(all).not.toContain("/admin/events/e1/booths");
    expect(all).toContain("/admin/events/e1/activities");
  });
```

Run: `npx vitest run tests/nav.test.ts` — Expected: FAIL on the new test.

- [ ] **Step 2: Nav**

In `src/components/admin/nav.ts`, delete the line `{ href: \`${b}/booths\`, label: "Booths", icon: "star" },` and change the doc comment's "booths keep stamping and the roster is still the roster" to "the roster is still the roster". Run `npx vitest run tests/nav.test.ts` — Expected: PASS.

- [ ] **Step 3: Data access**

`src/lib/db/booths.ts` — change the type import to `import type { Activity, Booth, BoothStamp } from "@/lib/types";` (drop `Event` if unused) and replace `createBooth` and `setBoothOrder`:

```ts
/** Appends to the end of its passport: a new booth is the next stand, not the first. */
export async function createBooth(passport: Pick<Activity, "id" | "org_id" | "event_id">, name: string, location: string | null) {
  const db = serviceClient();
  const { data: last } = await db.from("booths").select("sort_order")
    .eq("activity_id", passport.id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const sort_order = (last?.sort_order ?? -1) + 1;
  const { error } = await db.from("booths").insert({
    org_id: passport.org_id, event_id: passport.event_id, activity_id: passport.id,
    name, location, token: generateToken(), sort_order,
  });
  if (error) throw error;
}
```

```ts
/**
 * Scoped by event AND passport as well as row id: a posted id from another event updates
 * nothing, and one from a sibling passport cannot renumber that passport's booths.
 */
export async function setBoothOrder(eventId: string, activityId: string, orderedIds: string[]) {
  const db = serviceClient();
  for (const [index, id] of orderedIds.entries()) {
    const { error } = await db.from("booths").update({ sort_order: index })
      .eq("id", id).eq("event_id", eventId).eq("activity_id", activityId);
    if (error) throw error;
  }
}
```

`src/lib/db/activities.ts` — in `NewActivity`, after `action_label?`:

```ts
  /** Passport kind only (D182). Left out, the column's null stands. */
  stamps_required?: number | null;
  reward_message?: string | null;
```

Make `createActivity` return the new id (existing callers ignore it):

```ts
/** Appends to the end: a new activity is the next one, not the first. Returns its id. */
export async function createActivity(event: Pick<Event, "id" | "org_id">, input: NewActivity): Promise<string> {
  const db = serviceClient();
  const { data: last } = await db.from("activities").select("sort_order")
    .eq("event_id", event.id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await db.from("activities")
    .insert({ org_id: event.org_id, event_id: event.id, ...input, sort_order: (last?.sort_order ?? -1) + 1 })
    .select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}
```

Add after `deleteActivity`:

```ts
/**
 * Deletes a passport only while nobody has been stamped on it (D188). The cascade to `booths`
 * meets `booth_stamps.booth_id ... on delete restrict`, so the database refuses (23503) once
 * any stamp exists — atomically, the same way `deleteBoothIfUnstamped` relies on it for one
 * booth. Returns false when refused, or when nothing matched.
 */
export async function deletePassportIfUnstamped(id: string, eventId: string): Promise<boolean> {
  const { data, error } = await serviceClient().from("activities").delete()
    .eq("id", id).eq("event_id", eventId).eq("kind", "passport").select("id");
  if (error?.code === "23503") return false;
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
```

- [ ] **Step 4: Server actions**

In `src/app/admin/events/[id]/activities/actions.ts`:

Imports — extend the `@/lib/db/activities` import with `deletePassportIfUnstamped`, and add:

```ts
import { createBooth, updateBooth, setBoothOrder, deleteBoothIfUnstamped, listPassportBooths } from "@/lib/db/booths";
import { readPassportSettings } from "@/lib/booths";
import type { Activity, Event } from "@/lib/types";
```

Add after `listPath`:

```ts
const detailPath = (eventId: string, activityId: string) => `${listPath(eventId)}/${activityId}`;
```

Replace `toggleOpenAction`'s tail (from `const path = ...` to the end of the function) with:

```ts
  // A submission's toggle is inline on its row in the list; a booking's and a passport's are in
  // their detail page's header. Land back wherever the click came from.
  const path = activity.kind === "submission" ? listPath(eventId) : detailPath(eventId, activityId);
  revalidatePath(listPath(eventId));
  revalidatePath(detailPath(eventId, activityId));
  const opened = !activity.is_open;
  const LABELS: Record<Activity["kind"], [string, string]> = {
    booking: ["Booking open.", "Booking closed."],
    submission: ["Submissions open.", "Submissions closed."],
    passport: ["Stamping open.", "Stamping closed."],
  };
  redirect(flashPath(path, LABELS[activity.kind][opened ? 0 : 1]));
```

Append the passport and booth actions:

```ts
/**
 * The fields the add-passport form and its settings form share. No `required` and no cap
 * (D183): a passport is never owed and every booth stamps once. `is_open` is the add form's
 * alone; after that it belongs to `toggleOpenAction`, for the reason `readActivityPolicy` gives.
 */
function readPassportPolicy(fd: FormData, boothCount: number | null) {
  const name = text(fd, "name");
  if (!name) throw new Error("A passport needs a name");
  return {
    name,
    description: cleanRichText(text(fd, "description")),
    categories: parseCategories(text(fd, "categories")),
    ...readPassportSettings({ stamps_required: text(fd, "stamps_required"), reward_message: text(fd, "reward_message") }, boothCount),
  };
}

/** The passport a posted id names, or a flash back to the list. Scopes every booth action (D180). */
async function passportOf(ev: Event, activityId: string): Promise<Activity> {
  const passport = await getActivity(activityId, ev.id);
  if (!passport || passport.kind !== "passport") redirect(flashPath(listPath(ev.id), "That passport no longer exists.", "error"));
  return passport;
}

export async function addPassportActivityAction(eventId: string, fd: FormData) {
  const ev = await event(eventId);
  let policy;
  try {
    policy = readPassportPolicy(fd, null);
  } catch (e) {
    redirect(flashPath(listPath(eventId), (e as Error).message, "error"));
  }
  let image: ImageChange = { url: null, stale: null };
  try {
    image = await nextImage(fd, "image", null, { orgId: ev.org_id, eventId: ev.id, kind: "activity" });
  } catch (e) {
    redirect(flashPath(listPath(eventId), (e as Error).message, "error"));
  }
  const id = await createActivity(ev, {
    ...policy, kind: "passport", required: false, is_open: checked(fd, "is_open"),
    max_per_attendee: null, questions: [], per_day: false, image_url: image.url,
  });
  revalidatePath(listPath(eventId));
  // Straight to its page: a passport with no booths is the one thing an organiser cannot use.
  redirect(flashPath(detailPath(eventId, id), "Passport added. Add its booths next."));
}

/** Never touches `is_open`: see `readPassportPolicy`. */
export async function savePassportActivityAction(eventId: string, activityId: string, fd: FormData) {
  const ev = await event(eventId);
  const back = detailPath(eventId, activityId);
  const current = await passportOf(ev, activityId);
  const booths = await listPassportBooths(activityId);
  let policy;
  try {
    policy = readPassportPolicy(fd, booths.length);
  } catch (e) {
    redirect(flashPath(back, (e as Error).message, "error"));
  }
  let image: ImageChange = { url: current.image_url, stale: null };
  try {
    image = await nextImage(fd, "image", current.image_url, { orgId: ev.org_id, eventId: ev.id, kind: "activity" });
  } catch (e) {
    redirect(flashPath(back, (e as Error).message, "error"));
  }
  await updateActivity(activityId, ev.id, { ...policy, image_url: image.url });
  await deleteEventImage(image.stale);
  revalidatePath(listPath(eventId));
  revalidatePath(back);
  redirect(flashPath(back, "Passport saved."));
}

/** Refused by the database once anyone is stamped (D188), so the button needs no count check of its own. */
export async function deletePassportActivityAction(eventId: string, activityId: string) {
  const ev = await event(eventId);
  const doomed = await passportOf(ev, activityId);
  const removed = await deletePassportIfUnstamped(activityId, ev.id);
  if (!removed) {
    redirect(flashPath(detailPath(eventId, activityId), "Somebody has already been stamped on this passport, so it can't be deleted. Close stamping instead.", "error"));
  }
  await deleteEventImage(doomed.image_url);
  revalidatePath(listPath(eventId));
  redirect(flashPath(listPath(eventId), "Passport deleted."));
}

export async function addBoothAction(eventId: string, activityId: string, fd: FormData) {
  const ev = await event(eventId);
  const passport = await passportOf(ev, activityId);
  const name = text(fd, "name");
  if (!name) throw new Error("A booth needs a name");
  await createBooth(passport, name, text(fd, "location") || null);
  revalidatePath(detailPath(eventId, activityId));
}

/** Always allowed, stamped or not: stamps point at the row, not its name (D94). */
export async function renameBoothAction(eventId: string, activityId: string, boothId: string, fd: FormData) {
  const ev = await event(eventId);
  const name = text(fd, "name");
  if (!name) throw new Error("A booth needs a name");
  await updateBooth(boothId, ev.id, { name, location: text(fd, "location") || null });
  revalidatePath(detailPath(eventId, activityId));
}

export async function reorderBoothsAction(eventId: string, activityId: string, ids: string[]) {
  const ev = await event(eventId);
  await setBoothOrder(ev.id, activityId, ids);
  revalidatePath(detailPath(eventId, activityId));
}

/** Checked again in the database (D94): a second tab opened before the first stamp still has a live button. */
export async function deleteBoothAction(eventId: string, activityId: string, boothId: string) {
  const ev = await event(eventId);
  const removed = await deleteBoothIfUnstamped(boothId, ev.id);
  const path = detailPath(eventId, activityId);
  revalidatePath(path);
  redirect(removed
    ? flashPath(path, "Booth deleted.")
    : flashPath(path, "That booth has stamped somebody, so it can't be deleted. Rename it, or lower the stamps needed.", "error"));
}
```

- [ ] **Step 5: The passport detail page**

Create `src/app/admin/events/[id]/activities/[activityId]/PassportDetail.tsx` — today's booths page, moved (D190), plus the shared activity settings:

```tsx
import Link from "next/link";
import { listPassportBooths, listStampsForEvent } from "@/lib/db/booths";
import { listAttendees } from "@/lib/db/attendees";
import { completionByAttendee } from "@/lib/booths";
import { eligible } from "@/lib/activities";
import { appBaseUrl, boothScannerLink } from "@/lib/links";
import { qrDataUrl } from "@/lib/qr";
import type { Activity, Event } from "@/lib/types";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Modal } from "@/components/admin/Modal";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { BoothList } from "@/components/admin/BoothList";
import { BoothQr } from "@/components/admin/BoothQr";
import { RichTextEditor, SECTIONS_HINT } from "@/components/admin/RichTextEditor";
import { ImageField } from "@/components/admin/ImageField";
import { COVER_HINT } from "@/components/admin/ActivityRows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  toggleOpenAction, savePassportActivityAction, deletePassportActivityAction,
  addBoothAction, renameBoothAction, reorderBoothsAction, deleteBoothAction,
} from "../actions";

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * A Booth Passport's page: its booths, their scanner links, who has filled the card, and the
 * settings. What used to be the event's Booths page (D190), now one passport's.
 */
export async function PassportDetail({ ev, activity, qr }: { ev: Event; activity: Activity; qr?: string }) {
  const path = `/admin/events/${ev.id}/activities/${activity.id}`;
  const [booths, allStamps, attendees] = await Promise.all([
    listPassportBooths(activity.id), listStampsForEvent(ev.id), listAttendees(ev.id),
  ]);
  const boothIds = new Set(booths.map((b) => b.id));
  const stamps = allStamps.filter((s) => boothIds.has(s.booth_id));
  const counts = stamps.reduce<Record<string, number>>((acc, s) => {
    acc[s.booth_id] = (acc[s.booth_id] ?? 0) + 1;
    return acc;
  }, {});

  // `?qr=<id>` swaps the whole page for one booth's printable sheet: its print stylesheet hides
  // everything else, and a plain route means Back, reload and a direct link all just work.
  const qrBooth = qr ? (booths.find((b) => b.id === qr) ?? null) : null;
  if (qrBooth) {
    const link = boothScannerLink(appBaseUrl(), qrBooth.token);
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="flex w-full max-w-[559px] items-center justify-between print:hidden">
          <Link href={path} className={buttonVariants({ variant: "outline", size: "sm" })}>← Back to {activity.name}</Link>
        </div>
        <BoothQr boothName={qrBooth.name} location={qrBooth.location} eventName={ev.name} link={link} qr={await qrDataUrl(link)} />
      </div>
    );
  }

  const completion = completionByAttendee(booths, stamps, activity.stamps_required);
  const completed = [...completion.values()].filter((c) => c.complete).length;
  // Out of the people this passport is for, not the whole roster: a VIP-only passport that
  // every VIP has finished is finished (D184).
  const audience = attendees.filter((a) => eligible(activity, a.category)).length;

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title={activity.name}
        subtitle={`${completed} of ${audience} have filled their card · ${booths.length} booth${booths.length === 1 ? "" : "s"}`}
        actions={
          <>
            <form action={toggleOpenAction.bind(null, ev.id, activity.id)}>
              <SubmitButton variant={activity.is_open ? "outline" : "default"}>
                {activity.is_open ? "Close stamping" : "Open stamping"}
              </SubmitButton>
            </form>
            <Modal title="Add a booth" hint="Prints its own scanner link once it exists." trigger="Add booth" icon="plus">
              <form action={addBoothAction.bind(null, ev.id, activity.id)} className="grid gap-4">
                <Field label="Name" name="name" placeholder="Operations" />
                <Field label="Location (optional)" name="location" placeholder="Foyer · Stand 1" />
                <SubmitButton>Add booth</SubmitButton>
              </form>
            </Modal>
            <a download href={`/admin/events/${ev.id}/export/passport.xlsx`} className={buttonVariants({ variant: "outline" })}>
              <Icon name="file" size={18} />Export
            </a>
            <form action={deletePassportActivityAction.bind(null, ev.id, activity.id)}>
              <ConfirmButton
                message={`Delete ${activity.name}? Its ${booths.length} booth${booths.length === 1 ? "" : "s"} and their scanner links go with it. This is refused once anyone has been stamped.`}
                className="text-destructive"
              >
                Delete passport
              </ConfirmButton>
            </form>
          </>
        }
      />

      <Card className="overflow-hidden">
        <CardHeader className="border-b"><CardTitle>Booths</CardTitle></CardHeader>
        <CardContent className="px-0">
          {booths.length === 0 ? (
            <Empty className="border-0 bg-transparent">
              <EmptyHeader>
                <EmptyTitle>No booths yet</EmptyTitle>
                <EmptyDescription>Add the first one to get a scanner link you can print. The booth needs no login.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="px-6">
              <BoothList
                items={booths}
                counts={counts}
                reorder={reorderBoothsAction.bind(null, ev.id, activity.id)}
                renameBooth={renameBoothAction.bind(null, ev.id, activity.id)}
                deleteBooth={deleteBoothAction.bind(null, ev.id, activity.id)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* No `is_open` field (D127): that column is the header button's alone. */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b"><CardTitle>Settings</CardTitle></CardHeader>
        <CardContent className="px-6 py-4">
          <form action={savePassportActivityAction.bind(null, ev.id, activity.id)} className="grid grid-cols-1 gap-4">
            <Field label="Name" name="name" defaultValue={activity.name} />
            <RichTextEditor name="description" label="Description (optional)" defaultValue={activity.description} description={SECTIONS_HINT} />
            <ImageField label="Image (optional)" name="image" url={activity.image_url} description={COVER_HINT} />
            <Field label="Categories (optional)" name="categories" defaultValue={(activity.categories ?? []).join(", ")}
              placeholder="VIP, Management" description="Comma separated. Leave blank for everyone. Booths refuse anyone outside these." />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="stamps_required" className="text-sm font-bold">Stamps needed</label>
              <div className="flex items-center gap-2">
                <input id="stamps_required" name="stamps_required" type="number" min={1} inputMode="numeric"
                  defaultValue={activity.stamps_required ?? ""} placeholder="Every booth" className={`${input} tabular-nums`} />
                <span className="shrink-0 text-sm text-muted-foreground tabular-nums">of {booths.length} booth{booths.length === 1 ? "" : "s"}</span>
              </div>
            </div>
            <Field label="Message when the card is full" name="reward_message" defaultValue={activity.reward_message}
              placeholder="Show this screen at the registration counter to collect your gift." />
            <SubmitButton>Save settings</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        A booth can be deleted freely until it takes its first stamp. After that, deleting it would quietly take
        those stamps back and drop attendees out of &ldquo;completed&rdquo;, so Delete is disabled instead. Rename the
        booth, or lower <strong className="font-bold text-foreground">Stamps needed</strong> if it drops out mid-event.
      </p>
    </div>
  );
}
```

Check `Field`'s `defaultValue` prop accepts `string | null` (the old booths page passed `ev.stamps_message`, which is `string | null`, so it does).

- [ ] **Step 6: Branch the detail route**

In `src/app/admin/events/[id]/activities/[activityId]/page.tsx`: add `import { PassportDetail } from "./PassportDetail";`, change the `searchParams` type to `Promise<{ day?: string; qr?: string }>`, destructure `const { day: requestedDay, qr } = await searchParams;`, and before the submission branch add:

```tsx
  if (activity.kind === "passport") return <PassportDetail ev={ev} activity={activity} qr={qr} />;
```

Update the comment above it: "Three entirely different screens share this route ..." naming the passport's booths.

- [ ] **Step 7: The Activities list**

`src/components/admin/ActivityRows.tsx` — add a prop and a branch. In the props destructure and type:

```ts
  /** Booths and completed cards per passport id (`passportRollup`). */
  passports: Record<string, { booths: number; completed: number }>;
```

Inside `items.map`, before `if (a.kind === "booking")`:

```tsx
        if (a.kind === "passport") {
          const r = passports[a.id] ?? { booths: 0, completed: 0 };
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
              <Link href={`${basePath}/activities/${a.id}`} className="min-w-0 flex-1 font-medium hover:underline">
                {a.name}
              </Link>
              <Badge variant="outline">Passport</Badge>
              <Badge variant={a.is_open ? "default" : "outline"}>{a.is_open ? "Stamping open" : "Closed"}</Badge>
              <span className="text-sm text-muted-foreground tabular-nums">
                {r.booths} booth{r.booths === 1 ? "" : "s"} · {r.completed} completed
              </span>
            </li>
          );
        }
```

Update the component's doc comment ("whichever kind it is" — now three; a passport row, like a booking row, is edited on its own page). Update the empty-state text to "No activities yet. Add one to let attendees book a seat, send you something, or collect booth stamps."

`src/app/admin/events/[id]/activities/page.tsx`:

- Imports: add `import { listBooths, listStampsForEvent } from "@/lib/db/booths";`, `import { passportRollup } from "@/lib/booths";`, and `addPassportActivityAction` to the actions import.
- Load: extend the `Promise.all` with `listBooths(ev.id), listStampsForEvent(ev.id)` → `[activities, sessions, bookings, requests, submissions, booths, stamps]`.
- After `submissionCounts`: `const passportCounts = passportRollup(activities.filter((a) => a.kind === "passport"), booths, stamps);`
- Pass `passports={passportCounts}` to `<ActivityRows ...>`.
- Subtitle: `"Attendees book these themselves, send you answers on their own schedule, or collect stamps at booths. Breakout rooms, which you assign from the agenda, are a separate thing."`
- A third modal after "New submission":

```tsx
            <Modal title="Add a booth passport" hint="Add its booths once it exists. Each booth gets a scanner link to print." trigger="New passport" icon="plus">
              <form action={addPassportActivityAction.bind(null, ev.id)} className="grid grid-cols-1 gap-4">
                <Field label="Name" name="name" defaultValue="Booth Passport" />
                <RichTextEditor name="description" label="Description (optional)" description={SECTIONS_HINT} />
                <ImageField label="Image (optional)" name="image" description={COVER_HINT} />
                <Field label="Categories (optional)" name="categories" placeholder="VIP, Management"
                  description="Comma separated. Leave blank for everyone. Booths refuse anyone outside these." />
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="new_stamps_required" className="text-sm font-bold">Stamps needed</label>
                  <input id="new_stamps_required" name="stamps_required" type="number" min={1} inputMode="numeric"
                    placeholder="Every booth" className={`${input} tabular-nums`} />
                </div>
                <Field label="Message when the card is full (optional)" name="reward_message"
                  placeholder="Show this screen at the registration counter to collect your gift." />
                {/* Checked by default, unlike booking: a passport nobody opened is booths that
                    refuse every badge on the day (D184). */}
                <label className={check}>
                  <input type="checkbox" name="is_open" className="size-4" defaultChecked />
                  Open for stamping now
                </label>
                <SubmitButton>Add passport</SubmitButton>
              </form>
            </Modal>
```

Check `Field` supports `defaultValue` (it does — the settings forms use it).

- [ ] **Step 8: Retire the booths route**

Replace `src/app/admin/events/[id]/booths/page.tsx` entirely:

```tsx
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listActivities } from "@/lib/db/activities";

/**
 * Booths live under their passport now (D190). Kept as a redirect so a bookmark or a runbook
 * link lands somewhere useful: the passport itself when there is exactly one, else Activities.
 * `?qr=` is carried across so an old printable-sheet link still opens the sheet.
 */
export default async function Booths({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ qr?: string }> }) {
  const { id } = await params;
  const { qr } = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const passports = await listActivities(ev.id, "passport");
  if (passports.length === 1) {
    redirect(`/admin/events/${ev.id}/activities/${passports[0].id}${qr ? `?qr=${encodeURIComponent(qr)}` : ""}`);
  }
  redirect(`/admin/events/${ev.id}/activities`);
}
```

Delete `src/app/admin/events/[id]/booths/actions.ts` (`git rm`). Then find stragglers:

```bash
grep -rn "/booths\|booths/actions" src --include=*.ts --include=*.tsx
```

Anything linking to `/admin/events/<id>/booths` other than the redirect page itself should point at Activities instead. `src/lib/links.ts`' `/booth/<token>` (singular) is the scanner and stays.

- [ ] **Step 9: Typecheck, lint, test**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: clean. If `tsc` still flags `ev.stamps_required` anywhere, that file belongs to Task 5 or 6 — leave it only if it is `src/app/e/**/stamps/*` or `export/passport.xlsx`; those compile today because `Event` still has the fields.

- [ ] **Step 10: Verify in the browser**

`preview_start` `dev`, sign in is already handled per memory ("Claude can verify the admin now"). On the test event:

1. Sidebar: no "Booths" under Onsite. `/admin/events/<id>/booths` lands on the backfilled passport's page.
2. Activities list: the passport row reads "Passport · Stamping open · 3 booths · N completed".
3. Passport page: 3 booths with counts, Scanner QR opens the printable sheet and Back returns; Settings shows target 2 and the message. Save with target 9 → the error flash "This passport has 3 booths, so the target cannot be 9." Save with 2 → "Passport saved."
4. Close stamping → button flips, flash "Stamping closed."; reopen.
5. New passport "Probe Passport" → lands on its page with "Passport added. Add its booths next."; add a booth, rename it, reorder, delete it; delete the passport → "Passport deleted."
6. Delete the backfilled passport → refused with the "already been stamped" flash, nothing deleted.

Screenshot the passport page for the report.

- [ ] **Step 11: Commit**

```bash
git add -A src tests
git commit -m "feat(admin): booths live under their passport in Activities

New passport beside New booking and New submission; the passport's page
is the old Booths page plus the shared activity settings (D190). Booths
leaves the nav and its route redirects. A passport is deletable until
its first stamp, enforced by the database (D188).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Portal — the passport is an activity card and page

**Files:**
- Modify: `src/lib/portal-activity-entries.ts`
- Modify: `src/components/portal/ActivitiesTab.tsx`
- Modify: `src/components/portal/ActivityParts.tsx` (`KindTag`)
- Modify: `src/components/portal/PassportGrid.tsx` (`title` prop)
- Modify: `src/app/e/[slug]/a/[token]/activities/page.tsx`
- Modify: `src/app/e/[slug]/a/[token]/activities/[activityId]/page.tsx`
- Modify: `src/app/e/[slug]/a/[token]/stamps/page.tsx` (becomes a redirect)
- Modify: `src/app/e/[slug]/stamps/page.tsx`

**Interfaces:**
- Consumes: `passportCard`, `passportSection`, `firstPassport`, `buildPassport`, `listBooths`, `listPassportBooths`, `stampsForAttendee`, `eligible`.
- Produces: `type PassportEntry = { activity: Activity; passport: Passport }`; `loadActivityEntries(...)` returns `{ bookings, submissions, passports: PassportEntry[] }`; `PassportGrid` prop `title: string | null` (null draws no heading).

- [ ] **Step 1: Entries**

In `src/lib/portal-activity-entries.ts`:

```ts
import { listBooths, stampsForAttendee } from "@/lib/db/booths";
import { buildPassport, type Passport } from "@/lib/booths";
import { eligible } from "@/lib/activities";
```

(merge `eligible` into the existing `@/lib/activities` import). Add the type:

```ts
/** A passport this attendee may collect on, and their card for it. Ineligible ones are left out (D184). */
export type PassportEntry = { activity: Activity; passport: Passport };
```

Change the return type to `{ bookings: ActivityEntry[]; submissions: SubmissionEntry[]; passports: PassportEntry[] }`, extend the `Promise.all` with `listBooths(event.id), stampsForAttendee(attendee.id)` → `[activities, sessions, counts, mine, requests, submissions, booths, stamps]`, and before the return:

```ts
  // Hidden outright when ineligible, like a booking: the booth would refuse them anyway, so a
  // card they can never fill is not something to show them.
  const passports = activities
    .filter((a) => a.kind === "passport" && eligible(a, attendee.category))
    .map((activity) => ({
      activity,
      passport: buildPassport(booths.filter((b) => b.activity_id === activity.id), stamps, activity.stamps_required),
    }));

  return { bookings, submissions: forms, passports };
```

- [ ] **Step 2: KindTag**

In `src/components/portal/ActivityParts.tsx`:

```tsx
const KIND_LABELS: Record<Activity["kind"], string> = { booking: "Sessions", submission: "Submission", passport: "Passport" };

/** What kind of activity this is, in the words an attendee would use. */
export function KindTag({ kind }: { kind: Activity["kind"] }) {
  return (
    <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
      {KIND_LABELS[kind]}
    </span>
  );
}
```

- [ ] **Step 3: The tab**

In `src/components/portal/ActivitiesTab.tsx`:

- Imports: `import { bookingSection, passportSection } from "@/lib/portal-activities";`, add `passportCard` to the `@/lib/activity-card` import, and `type PassportEntry` to the entries import.
- Props: add `passports: PassportEntry[];` (and to the destructure).
- After `forms`:

```ts
  const collecting = passports.filter((p) => passportSection(p.passport) === "open");
  const done = passports.filter((p) => passportSection(p.passport) === "done");
```

- Empty check: `if (choose.length + booked.length + openBookings.length + forms.length + passports.length === 0)`.
- A helper beside `bookingItem`:

```tsx
  const passportItem = ({ activity, passport }: PassportEntry) => (
    <ActivityCard
      key={activity.id}
      activity={activity}
      view={passportCard({ passport, open: activity.is_open })}
      href={`${basePath}/activities/${activity.id}`}
    />
  );
```

- In "Open to you": condition `openBookings.length + forms.length + collecting.length > 0`, and after the forms map add `{collecting.map(passportItem)}`.
- After that section: `{done.length > 0 && <Section title="Done">{done.map(passportItem)}</Section>}`
- Doc comment: sections are To choose, Booked, Open to you, Done.

`src/app/e/[slug]/a/[token]/activities/page.tsx`: destructure `passports` and pass `passports={passports}`; update the doc comment to "every kind of activity on one page (D178, D179) ... To choose, Booked, Open to you and Done".

- [ ] **Step 4: PassportGrid heading**

In `src/components/portal/PassportGrid.tsx`, change the signature and the heading block:

```tsx
export function PassportGrid({ passport, message, attendeeName, title }: {
  passport: Passport;
  message: string | null;
  attendeeName: string | null;
  /** The page heading. Null on the activity page, where the activity's own name already heads it. */
  title: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        {title !== null && <h1 className="text-xl font-extrabold leading-tight">{title}</h1>}
        {attendeeName !== null && <p className="text-sm text-muted-foreground">Visit a booth, hand over your badge, collect a chop.</p>}
      </div>
```

(rest unchanged). Update the `CompleteHeader` comment's "the event's own `stamps_message`" → "the passport's `reward_message`".

- [ ] **Step 5: The activity page**

In `src/app/e/[slug]/a/[token]/activities/[activityId]/page.tsx`:

- Imports: `type PassportEntry` from entries; `import { PassportGrid } from "@/components/portal/PassportGrid";`.
- Load and resolve:

```tsx
  const { bookings, submissions, passports } = await loadActivityEntries(event, attendee);
  const basePath = `/e/${slug}/a/${token}`;

  const booking = bookings.find((b) => b.state.activity.id === activityId && b.state.eligible);
  const form = submissions.find((s) => s.form.id === activityId);
  const stampCard = passports.find((p) => p.activity.id === activityId);
  if (!booking && !form && !stampCard) notFound();
  const activity = booking ? booking.state.activity : form ? form.form : stampCard!.activity;
```

- Body:

```tsx
      {booking
        ? <BookingBody entry={booking} slug={slug} token={token} />
        : form
          ? <SubmissionBody entry={form} slug={slug} token={token} writing={writing === "1"} />
          : <PassportBody entry={stampCard!} attendeeName={attendee.name} />}
```

- The component, after `SubmissionBody`:

```tsx
/**
 * A Booth Passport's body. No dialog and no button: the attendee does nothing here — a booth
 * scans their badge (D90). The page is the card, and the wayfinding the card gives (D102).
 */
function PassportBody({ entry: { activity, passport }, attendeeName }: { entry: PassportEntry; attendeeName: string }) {
  const n = passport.cells.length;
  return (
    <>
      <InfoRows rows={[
        { icon: MapPin, text: n ? `${n} booth${n === 1 ? "" : "s"} to visit` : null },
        { icon: Users, text: forGroups(activity) },
      ]} />
      <RichSections html={activity.description} />
      <section className={`${block} flex flex-col gap-3`}>
        {!activity.is_open && !passport.complete && (
          <p className={note}>Stamping opens soon. The booths are below, so you know where to go.</p>
        )}
        <PassportGrid passport={passport} message={activity.reward_message} attendeeName={attendeeName} title={null} />
      </section>
    </>
  );
}
```

- Update the page's doc comment: three kinds; a passport has no dialog.

- [ ] **Step 6: The old routes (D191)**

Replace `src/app/e/[slug]/a/[token]/stamps/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { loadPortalAttendee, portalActivities } from "@/lib/portal";
import { firstPassport } from "@/lib/booths";
import { eligible } from "@/lib/activities";

export const dynamic = "force-dynamic";

/**
 * The "stamps" tile and every link printed before passports were activities (D191). Goes to
 * the first passport this attendee may collect on, or to the Activities tab when there is none.
 */
export default async function StampsPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const base = `/e/${slug}/a/${token}`;
  const passport = firstPassport((await portalActivities(event.id)).filter((a) => eligible(a, attendee.category)));
  redirect(passport ? `${base}/activities/${passport.id}` : `${base}/activities`);
}
```

Replace `src/app/e/[slug]/stamps/page.tsx`'s body (keep the imports it still uses, add `listActivities` from `@/lib/db/activities`, `listPassportBooths`, `firstPassport`):

```tsx
export default async function StampsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await loadPortalEvent(slug);
  // No attendee behind this link (it is the signage QR in the foyer), so there are no stamps to
  // fetch: PassportGrid renders locked whenever attendeeName is null, and still lists the booths
  // (D103). The first passport by sort order, as every kind-less link means (D191).
  const passport = firstPassport(await listActivities(event.id, "passport"));
  const booths = passport ? await listPassportBooths(passport.id) : [];
  return (
    <PortalShell event={event} basePath={`/e/${slug}`} personal={false}>
      <PassportGrid
        passport={buildPassport(booths, [], passport?.stamps_required ?? null)}
        message={passport?.reward_message ?? null}
        attendeeName={null}
        title={passport?.name ?? "Booth Passport"}
      />
    </PortalShell>
  );
}
```

- [ ] **Step 7: Typecheck, lint, test**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: clean.

- [ ] **Step 8: Verify in the browser**

Get a personal link for an attendee on the test event who has stamps (`select a.token, a.name from attendees a join booth_stamps s on s.attendee_id = a.id where a.event_id = '<test event>' limit 1;`) and the event slug.

1. `/e/<slug>/a/<token>/activities`: the passport card with the "Passport" tag and "N of 2 stamps" (or under Done with "Complete"). Other activities unchanged.
2. Tap it: the activity page — cover, name, "3 booths to visit", the stamp grid, no heading duplicated, no action button. At 375px width (`resize_window` mobile) the cover runs edge to edge as the other kinds do.
3. `/e/<slug>/a/<token>/stamps` → lands on that page.
4. `/e/<slug>/stamps` → locked card titled with the passport's name, booth list visible.
5. Close stamping in the admin, reload the page: "Stamping opens soon" line; card chip "Opens soon" (if not complete).
6. Set the passport's categories to one this attendee does not have: the card disappears; the page 404s; the bottom-bar tab still shows if other activities exist. Clear the categories again.

Reset the viewport with `resize_window` preset `desktop`. Screenshot the tab and the page.

- [ ] **Step 9: Commit**

```bash
git add -A src
git commit -m "feat(portal): the passport is an activity card and page

Open to you while collecting, Done once full (D192), hidden when the
attendee is outside its categories (D184). The page is the stamp card
under the shared cover and head. /stamps and the signage QR keep
working through the first passport (D191).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Exports — one sheet per passport; bookings-only where it means bookings

**Files:**
- Modify: `src/lib/exports.ts` (`buildPassportWorkbook`)
- Modify: `src/app/admin/events/[id]/export/passport.xlsx/route.ts`
- Modify: `src/app/admin/events/[id]/exports/page.tsx` (copy)
- Modify: `src/app/admin/events/[id]/export/activities.xlsx/route.ts`
- Modify: `src/app/admin/events/[id]/page.tsx` (Overview)
- Test: `tests/exports.test.ts`

**Interfaces:**
- Produces: `type PassportSheet = { name: string; booths: Booth[]; required: number | null }`; `buildPassportWorkbook(attendees: Attendee[], passports: PassportSheet[], stamps: BoothStamp[]): ExcelJS.Workbook`.

- [ ] **Step 1: Update the tests first**

In `tests/exports.test.ts`'s `describe("buildPassportWorkbook")`, every call `buildPassportWorkbook(attendees, booths, stamps, null)` becomes `buildPassportWorkbook(attendees, [{ name: "Booth Passport", booths, required: null }], stamps)` (and the `1` target case → `required: 1`; the company case → `[{ name: "Booth Passport", booths, required: null }], []`). Then add:

```ts
  it("writes one sheet per passport, each with only its own booths", () => {
    const other: Booth[] = [{ id: "c1", org_id: "o", event_id: "e", activity_id: "p2", name: "Photo Wall", location: null, token: "t3", sort_order: 0 }];
    const wb = buildPassportWorkbook(attendees, [
      { name: "Booth Passport", booths, required: null },
      { name: "Wellness Trail", booths: other, required: null },
    ], [...stamps, { id: "s3", org_id: "o", event_id: "e", booth_id: "c1", attendee_id: "a2", stamped_at: "2026-09-30T03:00:00Z" }]);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Booth Passport", "Wellness Trail"]);
    const trail = wb.getWorksheet("Wellness Trail")!;
    expect(trail.getRow(1).values).toEqual([undefined, "Name", "Email", "Category", "Photo Wall", "Stamps", "Completed"]);
    expect(trail.getRow(3).values).toEqual([undefined, "Sarah Lim", "s@x.my", "Crew", "Yes", 1, "Yes"]);
  });

  it("keeps two passports with the same name as two sheets", () => {
    const wb = buildPassportWorkbook(attendees, [
      { name: "Passport", booths, required: null },
      { name: "Passport", booths, required: null },
    ], []);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Passport", "Passport 2"]);
  });
```

Run: `npx vitest run tests/exports.test.ts` — Expected: FAIL (old signature).

- [ ] **Step 2: Implement**

Replace `buildPassportWorkbook` in `src/lib/exports.ts`:

```ts
/** One passport's sheet: its name, its booths in admin order, and its target. */
export type PassportSheet = { name: string; booths: Booth[]; required: number | null };

/**
 * One sheet per passport (D181): a row per attendee, a column per booth, a total and a
 * completed flag (D100). `stamps` may be the whole event's — `completionByAttendee` and the
 * per-booth lookup only ever match this passport's booth ids.
 */
export function buildPassportWorkbook(attendees: Attendee[], passports: PassportSheet[], stamps: BoothStamp[]): ExcelJS.Workbook {
  const stamped = new Set(stamps.map((s) => `${s.booth_id}:${s.attendee_id}`));
  const wb = new ExcelJS.Workbook();
  const taken = new Set<string>();
  for (const p of passports) {
    const completion = completionByAttendee(p.booths, stamps, p.required);
    const ws = wb.addWorksheet(uniqueSheetName(sanitizeSheetNamePart(p.name) || "Passport", taken));
    ws.addRow(["Name", "Email", "Category", ...p.booths.map((b) => b.name), "Stamps", "Completed"]);
    for (const a of attendees) {
      const c = completion.get(a.id) ?? { collected: 0, complete: false };
      ws.addRow([
        a.name, a.email, a.category,
        ...p.booths.map((b) => (stamped.has(`${b.id}:${a.id}`) ? "Yes" : "No")),
        c.collected,
        c.complete ? "Yes" : "No",
      ]);
    }
    ws.columns?.forEach((col) => { col.width = 20; });
  }
  return wb;
}
```

`src/app/admin/events/[id]/export/passport.xlsx/route.ts` — add `import { listActivities } from "@/lib/db/activities";` and replace the load/build:

```ts
  const [attendees, passports, booths, stamps] = await Promise.all([
    listAttendees(ev.id), listActivities(ev.id, "passport"), listBooths(ev.id), listStampsForEvent(ev.id),
  ]);
  const sheets = passports.map((p) => ({ name: p.name, booths: booths.filter((b) => b.activity_id === p.id), required: p.stamps_required }));
  const buf = await buildPassportWorkbook(attendees, sheets, stamps).xlsx.writeBuffer();
```

`src/app/admin/events/[id]/exports/page.tsx` — the Booth Passport entry's `what`: `"One sheet per passport: a row per attendee, a column per booth, how many stamps they collected, and whether their card is complete."`

- [ ] **Step 3: Bookings-only where the screen means bookings**

A passport has no seats; on the seat dashboard and the roster export it would be a row of zeros and an "unbooked" list of everyone. Submissions leaked in the same way — this fixes both.

- `src/app/admin/events/[id]/export/activities.xlsx/route.ts`: `listActivities(ev.id)` → `listActivities(ev.id, "booking")`.
- `src/app/admin/events/[id]/page.tsx` line ~40: `listActivities(ev.id)` → `listActivities(ev.id, "booking")`.

- [ ] **Step 4: Test, typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 5: Verify the download**

In the browser, open `/admin/events/<test event>/exports` and fetch the Booth Passport file with `javascript_tool`:

```js
const r = await fetch(location.pathname.replace(/exports$/, "export/passport.xlsx")); [r.status, r.headers.get("content-type"), (await r.arrayBuffer()).byteLength]
```

Expected: `200`, the xlsx content type, a non-zero size. (Opening it is covered by the unit tests.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/exports.ts "src/app/admin/events/[id]" tests/exports.test.ts
git commit -m "feat(exports): one passport sheet per passport; seats stay bookings-only

The passport export writes a sheet per passport (D181). The Overview's
seat dashboard and activities.xlsx read booking activities only, so a
passport - or a submission - no longer shows up as a zero-seat row.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Contract — drop the event columns, deploy, verify end to end

**Files:**
- Create: `supabase/migrations/0037_drop_event_stamps.sql`
- Modify: `src/lib/types.ts` (`Event`)
- Modify: docs that mention the Booths page (found in Step 2)

- [ ] **Step 1: Remove the event fields from the type**

Delete `stamps_required` and `stamps_message` (and their doc comments) from `Event` in `src/lib/types.ts`.

Run: `npx tsc --noEmit`
Expected: clean. Any error is a reader Tasks 3–6 missed — fix it to read the passport activity instead. Then:

```bash
grep -rn "stamps_required\|stamps_message" src
```

Expected: hits only in `src/lib/types.ts` (the `Activity` field), `src/lib/booths.ts` comments, and passport code reading `activity.stamps_required`. No `ev.` / `event.` reads.

- [ ] **Step 2: Docs**

```bash
grep -rln "Booths page\|/booths\b\|Booths\b" docs/runbook.md docs/*.md 2>/dev/null
```

Update each operational reference to say the booths are on the passport's page under Activities (e.g. "Activities → Booth Passport → Add booth"). Do not rewrite historical specs/plans.

- [ ] **Step 3: Write 0037 (do not apply yet)**

`supabase/migrations/0037_drop_event_stamps.sql`:

```sql
-- The contract half of 0036 (D189). The passport's target and reward message live on the
-- passport activity now (D182); nothing reads these since the code that shipped with 0036.
-- Applied only after that code was live, so production never read a column that had gone.
alter table events drop column if exists stamps_required;
alter table events drop column if exists stamps_message;
```

- [ ] **Step 4: Full suite**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: all green; the build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts supabase/migrations/0037_drop_event_stamps.sql docs
git commit -m "chore(passport): stop reading the event's stamp columns; add 0037

0037 drops events.stamps_required and events.stamps_message. It is
applied after this deploy is live, never before (D189).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: End-to-end pass on the dev server**

With `preview_start` `dev`, run the spec §5 end-to-end list once more, in order, on the test event: admin creates a passport and a booth → the booth link stamps a test attendee via name search → the attendee's Activities tab and passport page show the new count → closing the passport makes the booth refuse and undo still works → the export downloads → `/admin/events/<id>/booths`, `/e/<slug>/a/<token>/stamps` and `/e/<slug>/stamps` land where D190/D191 say. Delete the probe passport and probe booth afterwards (unstamped first: undo the stamp). Screenshots of the admin passport page, the booth scanner and the portal page go in the report.

- [ ] **Step 7: Hand the push to the user**

Stop and tell the user: everything is committed on `main` and not pushed. Ask them to push (or to say "push" so it is done for them). After Vercel shows the deployment Ready on ecphub.vercel.app, check production:

- `https://ecphub.vercel.app/booth/<a test booth token>` shows the passport name.
- the admin Activities page on production lists the passport.

- [ ] **Step 8: Apply 0037, only after Step 7's checks pass**

Supabase MCP `apply_migration` with name `0037_drop_event_stamps`. Verify:

```sql
select column_name from information_schema.columns where table_name = 'events' and column_name like 'stamps_%';
```

Expected: no rows. Reload the production booth page and the portal passport page once more — both still render.

- [ ] **Step 9: Update memory**

Update `orange-lobby-pilot.md` in the memory directory: passports are activities (kind 'passport', D179–D192), 0036 and 0037 applied with dates, Booths nav gone, `record_stamp` enforces open/categories, and the D184 risk (a closed passport means dead booths — check it is open before doors on 30 Sep).
