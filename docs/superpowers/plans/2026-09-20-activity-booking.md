# Activity Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let attendees book a seat in a capacity-limited session of an activity from their personal portal link, and let organisers run those activities from the admin.

**Architecture:** Three new tables (`activities`, `activity_sessions`, `activity_bookings`) and one plpgsql function, `book_session`, which is the only thing allowed to create a booking — it locks the session row, re-counts, and returns a reason code. Everything above it is ordinary Next.js: a pure domain module with unit tests, a `server-only` database module, one personal-portal route, and two admin pages. A booked session reaches the attendee's agenda as a derived row merged at read time; nothing is ever written to `agenda_items`.

**Tech Stack:** Next.js 16.3.4 (App Router, Server Actions), React 19.2.8, TypeScript, Supabase (postgres + supabase-js service role), Tailwind v4 + shadcn/ui on Base UI, Vitest, ExcelJS.

**Spec:** `docs/superpowers/specs/2026-09-20-activity-booking-design.md`

## Global Constraints

- **Read the Next.js docs before writing route or action code.** This repo pins Next 16.3.4 and `AGENTS.md` requires reading the relevant guide in `node_modules/next/dist/docs/` first. The two that matter here are `01-app/01-getting-started/07-mutating-data.md` and `01-app/01-getting-started/03-layouts-and-pages.md`.
- `params` in a page is a **Promise** and must be awaited: `{ params }: { params: Promise<{ slug: string; token: string }> }`.
- **Every new table gets `alter table … enable row level security;` with no policies.** Only the service role (which bypasses RLS) may touch data. Migration `0007` forgot this and `0011` had to go back for it.
- **The database function is the only authority on capacity** (D125). No TypeScript path may insert into `activity_bookings` directly.
- **`book_session` re-checks eligibility and open/closed on write** (D131). The portal hiding a session is not enforcement.
- **A refused booking is a flash, not an error page** (D134). Use `flashPath()` from `src/lib/flash.ts`.
- **A full session is a hard stop for everybody, including an organiser placing people** (D126). Placement ignores `booking_open` only.
- **Required means at least one booking in that activity** (D129), not `max_per_attendee` of them. A cancel is refused only when it would take the attendee to zero.
- Every new `src/lib/db/*.ts` module starts with `import "server-only";` and reaches the database through `serviceClient()`.
- Supabase returns a `time` column as `HH:MM:SS`. Normalise with `.slice(0, 5)` on read, exactly as `listAgenda` does.
- Time zone is Kuala Lumpur via `nowInKL()` from `src/lib/time.ts`. Never use `new Date()` for "today".
- Commit messages follow the repo: `feat(portal):`, `fix(admin):`, `docs:`. End every commit body with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Run `npm test` and `npm run lint` before every commit. Run `npx next build` at the end of each task that touches a route.
- **Apply migrations at merge, not before** — except against the Supabase test project, which holds test data only and needs no backup.

---

## File Structure

**Create:**
- `supabase/migrations/0016_activities.sql` — the three tables, indexes, RLS.
- `supabase/migrations/0017_book_session.sql` — the booking function and its grants.
- `src/lib/activities.ts` — pure domain: seat maths, eligibility, what an attendee may do, the agenda merge. No I/O.
- `src/lib/db/activities.ts` — every query and the `rpc` call. `server-only`.
- `tests/activities.test.ts` — unit tests for the pure module.
- `scripts/booking-concurrency.mjs` — the D141 concurrency check.
- `src/app/e/[slug]/a/[token]/activities/page.tsx` — the attendee's page.
- `src/app/e/[slug]/a/[token]/activities/actions.ts` — book, switch, cancel.
- `src/components/portal/ActivityList.tsx` — the activity cards and their session rows.
- `src/components/portal/RequiredActivityCard.tsx` — the "you haven't picked" card on the portal home.
- `src/app/admin/events/[id]/activities/page.tsx` — the activity list.
- `src/app/admin/events/[id]/activities/[activityId]/page.tsx` — one activity: policy, sessions, who hasn't booked.
- `src/app/admin/events/[id]/activities/actions.ts` — all admin writes.
- `src/components/admin/ActivityRows.tsx` — the list page's rows.
- `src/components/admin/SessionList.tsx` — reorderable session rows with capacity meters.
- `src/components/admin/UnbookedPanel.tsx` — who hasn't booked, with placement.
- `src/app/admin/events/[id]/export/activities.xlsx/route.ts` — one sheet per session plus the unbooked.

**Modify:**
- `src/lib/types.ts` — `Activity`, `ActivitySession`, `ActivityBooking`.
- `src/lib/agenda.ts` — extract `categoryMatches` so activities and agenda items share one rule.
- `src/lib/modules.ts` — `TILE_ROUTES` gains `"activities"`, `TILE_ROUTE_LABELS` gains its label.
- `src/lib/portal-home.ts` — load bookings, merge derived agenda rows, expose the required-not-booked list.
- `src/components/admin/nav.ts` — an "Activities" item in the Portal group.
- `src/app/e/[slug]/a/[token]/page.tsx` — render `RequiredActivityCard`.
- `src/lib/exports.ts` — a sheet builder for session rosters.

---

### Task 1: Schema

**Files:**
- Create: `supabase/migrations/0016_activities.sql`
- Modify: `src/lib/types.ts` (append after `BoothStamp`)

**Interfaces:**
- Consumes: nothing.
- Produces: tables `activities`, `activity_sessions`, `activity_bookings`; TypeScript types `Activity`, `ActivitySession`, `ActivityBooking` exported from `@/lib/types`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0016_activities.sql`:

```sql
-- Activities an attendee books a seat in, rather than one an organiser assigns them to.
--
-- Breakouts (0007) are the assigned case: the organiser reads a spreadsheet column and places
-- people. This is the chosen case, and the difference that forces new tables rather than more
-- columns on agenda_items is policy — `required`, `booking_open`, `max_per_attendee` and
-- `categories` belong to the activity as a whole, and a breakout round is only a text label on
-- each room with nowhere to put them (D122).
create table activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  description text,
  -- Required means AT LEAST ONE booking in this activity, never max_per_attendee of them (D129).
  required boolean not null default false,
  -- Flipped by hand; there is deliberately no scheduled close (D127).
  booking_open boolean not null default false,
  max_per_attendee int not null default 1 check (max_per_attendee between 1 and 10),
  -- Same shape and same rule as agenda_items.categories: null or empty means everyone (D131).
  categories text[],
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table activity_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade,
  title text not null,
  day date not null,
  starts_at time not null,
  ends_at time,
  location text,
  capacity int not null check (capacity > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- `activity_id` is denormalised from the session for the same reason breakout_assignments
-- carries `slot` (D80, D124): the per-attendee cap is counted without a join. It brings the
-- same obligation — moving a session to another activity must update its bookings.
--
-- Deleting a session cascades its bookings (D135), matching checkpoints and breakout items.
create table activity_bookings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade,
  session_id uuid not null references activity_sessions(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Booking the same session twice is a duplicate, not a policy question. The cap of N per
  -- ACTIVITY cannot be a unique index and lives in book_session instead (D128).
  unique (attendee_id, session_id)
);

create index activities_event_idx on activities (event_id, sort_order);
create index activity_sessions_activity_idx on activity_sessions (activity_id, day, starts_at, sort_order);
create index activity_bookings_session_idx on activity_bookings (session_id);
create index activity_bookings_attendee_idx on activity_bookings (attendee_id);

-- Enabled with no policies, as every table since 0001_init.sql: only the service role, which
-- bypasses RLS, may touch data. The anon key travels in the client bundle.
alter table activities enable row level security;
alter table activity_sessions enable row level security;
alter table activity_bookings enable row level security;
```

- [ ] **Step 2: Add the types**

Append to `src/lib/types.ts`:

```ts
export type Activity = {
  id: string;
  org_id: string;
  event_id: string;
  name: string;
  description: string | null;
  /** At least one booking is expected. Never max_per_attendee of them (D129). */
  required: boolean;
  booking_open: boolean;
  max_per_attendee: number;
  /** Null or empty means everyone, exactly as on an agenda item. */
  categories: string[] | null;
  sort_order: number;
};

export type ActivitySession = {
  id: string;
  event_id: string;
  activity_id: string;
  title: string;
  day: string;          // YYYY-MM-DD
  starts_at: string;    // HH:MM
  ends_at: string | null;
  location: string | null;
  capacity: number;
  sort_order: number;
};

export type ActivityBooking = {
  id: string;
  event_id: string;
  /** Copied from the session so the per-activity cap counts without a join (D124). */
  activity_id: string;
  session_id: string;
  attendee_id: string;
  created_at: string;
};
```

- [ ] **Step 3: Apply the migration to the Supabase test project**

Use the Supabase MCP `apply_migration` tool with name `0016_activities` and the SQL above. The test project holds test data only, so no backup is needed.

- [ ] **Step 4: Verify the tables exist and RLS is on**

Use the Supabase MCP `execute_sql` tool:

```sql
select relname, relrowsecurity
from pg_class
where relname in ('activities', 'activity_sessions', 'activity_bookings')
order by relname;
```

Expected: three rows, `relrowsecurity` true for all three.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run lint
git add supabase/migrations/0016_activities.sql src/lib/types.ts
git commit -m "feat(activities): tables for activities, sessions and bookings"
```

---

### Task 2: The booking function

**Files:**
- Create: `supabase/migrations/0017_book_session.sql`

**Interfaces:**
- Consumes: the three tables from Task 1.
- Produces:
  - `book_session(p_session_id uuid, p_attendee_id uuid, p_ignore_open boolean) returns text`
  - `switch_session(p_from_session uuid, p_to_session uuid, p_attendee_id uuid) returns text`
  - Both return exactly one of `ok`, `full`, `closed`, `limit`, `ineligible`, `missing`. `switch_session` never returns `limit`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0017_book_session.sql`:

```sql
-- The only thing allowed to create a booking.
--
-- `count(*)` then `insert` is two statements and supabase-js has no transaction, so two phones
-- at 29 of 30 both read 29 and the room seats 31. This locks the session row, re-counts under
-- that lock, and inserts or refuses (D125). The lock is per session, so two people booking
-- different sessions never wait on each other.
--
-- Returns a reason code rather than a boolean (D140): the portal says different things for a
-- session that filled and an activity the desk closed.
create or replace function book_session(
  p_session_id uuid,
  p_attendee_id uuid,
  p_ignore_open boolean default false
) returns text
language plpgsql
as $$
declare
  s activity_sessions%rowtype;
  a activities%rowtype;
  att attendees%rowtype;
  taken int;
  held int;
begin
  select * into s from activity_sessions where id = p_session_id for update;
  if not found then return 'missing'; end if;

  select * into a from activities where id = s.activity_id;
  if not found then return 'missing'; end if;

  select * into att from attendees where id = p_attendee_id;
  -- An attendee from another event is not a booking, it is a posted id from somewhere else.
  if not found or att.event_id <> s.event_id then return 'missing'; end if;

  -- Placement from the admin ignores open/closed, never capacity (D126, D130).
  if not p_ignore_open and not a.booking_open then return 'closed'; end if;

  -- The same rule as categoryVisible in src/lib/agenda.ts: empty means everyone, and the
  -- comparison is trimmed and case-folded because these values are typed by hand.
  if a.categories is not null and array_length(a.categories, 1) > 0 then
    if att.category is null or not exists (
      select 1 from unnest(a.categories) c
      where lower(btrim(c)) = lower(btrim(att.category))
    ) then
      return 'ineligible';
    end if;
  end if;

  select count(*) into taken from activity_bookings where session_id = s.id;
  if taken >= s.capacity then return 'full'; end if;

  select count(*) into held from activity_bookings
   where activity_id = a.id and attendee_id = p_attendee_id;
  if held >= a.max_per_attendee then return 'limit'; end if;

  insert into activity_bookings (event_id, activity_id, session_id, attendee_id)
  values (s.event_id, a.id, s.id, p_attendee_id)
  on conflict (attendee_id, session_id) do nothing;

  return 'ok';
end;
$$;

-- Moving one booking to another session of the same activity, atomically.
--
-- NOT a cancel followed by a booking. An attendee in a required activity with a cap of one
-- cannot cancel (D129), so two steps would leave them unable to change their mind at all; and
-- even where the cancel is allowed, a target that fills between the two steps leaves them
-- holding nothing — the state a required activity exists to prevent.
--
-- Both session rows are locked in id order, so two people swapping in opposite directions
-- cannot deadlock. The per-attendee cap needs no check: both sessions belong to the same
-- activity, so the count does not move.
create or replace function switch_session(
  p_from_session uuid,
  p_to_session uuid,
  p_attendee_id uuid
) returns text
language plpgsql
as $$
declare
  s_from activity_sessions%rowtype;
  s_to activity_sessions%rowtype;
  a activities%rowtype;
  att attendees%rowtype;
  taken int;
begin
  if p_from_session = p_to_session then return 'ok'; end if;

  perform 1 from activity_sessions
   where id in (p_from_session, p_to_session)
   order by id
     for update;

  select * into s_from from activity_sessions where id = p_from_session;
  if not found then return 'missing'; end if;
  select * into s_to from activity_sessions where id = p_to_session;
  if not found then return 'missing'; end if;
  -- Switching across activities is not a switch, it is two decisions.
  if s_from.activity_id <> s_to.activity_id then return 'missing'; end if;

  if not exists (
    select 1 from activity_bookings
     where session_id = p_from_session and attendee_id = p_attendee_id
  ) then return 'missing'; end if;

  select * into a from activities where id = s_to.activity_id;
  select * into att from attendees where id = p_attendee_id;
  if not found or att.event_id <> s_to.event_id then return 'missing'; end if;

  if not a.booking_open then return 'closed'; end if;

  if a.categories is not null and array_length(a.categories, 1) > 0 then
    if att.category is null or not exists (
      select 1 from unnest(a.categories) c
      where lower(btrim(c)) = lower(btrim(att.category))
    ) then
      return 'ineligible';
    end if;
  end if;

  select count(*) into taken from activity_bookings where session_id = s_to.id;
  if taken >= s_to.capacity then return 'full'; end if;

  delete from activity_bookings
   where session_id = p_from_session and attendee_id = p_attendee_id;
  insert into activity_bookings (event_id, activity_id, session_id, attendee_id)
  values (s_to.event_id, a.id, s_to.id, p_attendee_id);

  return 'ok';
end;
$$;

-- Postgres grants EXECUTE to public by default, and PostgREST exposes a function as an rpc
-- endpoint. The anon key travels in the client bundle, so leaving the default would put a
-- booking write behind a key everybody has. Same reasoning as 0011.
-- `revoke ... from public` alone is NOT enough on a Supabase project: it provisions
-- `alter default privileges in schema public grant execute on functions to anon,
-- authenticated, service_role`, which fires at CREATE FUNCTION time and grants EXECUTE
-- directly to those roles. Revoking public leaves those direct grants standing — verified
-- live, `has_function_privilege('anon', …)` was still true after a public-only revoke.
revoke execute on function book_session(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function book_session(uuid, uuid, boolean) to service_role;
revoke execute on function switch_session(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function switch_session(uuid, uuid, uuid) to service_role;
```

- [ ] **Step 2: Apply the migration to the test project**

Use the Supabase MCP `apply_migration` tool with name `0017_book_session`.

- [ ] **Step 3: Write a SQL fixture and exercise every return value**

Use the Supabase MCP `execute_sql` tool. This creates a throwaway event and tears it down at the end:

```sql
do $$
declare
  v_org uuid;
  v_event uuid;
  v_act uuid;
  v_sess uuid;
  v_a1 uuid;
  v_a2 uuid;
begin
  select id into v_org from organisations limit 1;
  insert into events (org_id, slug, name, status)
    values (v_org, 'plan-test-activities', 'Plan test', 'draft') returning id into v_event;
  insert into activities (org_id, event_id, name, required, booking_open, max_per_attendee)
    values (v_org, v_event, 'Workshops', true, false, 1) returning id into v_act;
  insert into activity_sessions (event_id, activity_id, title, day, starts_at, capacity)
    values (v_event, v_act, 'Only seat', current_date, '09:30', 1) returning id into v_sess;
  insert into attendees (org_id, event_id, token, name, source)
    values (v_org, v_event, 'plantok0000000001', 'First', 'walkin') returning id into v_a1;
  insert into attendees (org_id, event_id, token, name, source)
    values (v_org, v_event, 'plantok0000000002', 'Second', 'walkin') returning id into v_a2;

  raise notice 'closed   -> %', book_session(v_sess, v_a1, false);
  raise notice 'ignored  -> %', book_session(v_sess, v_a1, true);
  update activities set booking_open = true where id = v_act;
  raise notice 'full     -> %', book_session(v_sess, v_a2, false);
  update activity_sessions set capacity = 2 where id = v_sess;
  raise notice 'ok2      -> %', book_session(v_sess, v_a2, false);
  update activities set categories = array['VIP'] where id = v_act;
  delete from activity_bookings where attendee_id = v_a2;
  raise notice 'inelig   -> %', book_session(v_sess, v_a2, false);
  update attendees set category = ' vip ' where id = v_a2;
  raise notice 'folded   -> %', book_session(v_sess, v_a2, false);
  update activity_sessions set capacity = 3 where id = v_sess;
  raise notice 'limit    -> %', book_session(v_sess, v_a2, false);

  -- A switch out of a required activity with a cap of one: the case two steps cannot do.
  insert into activity_sessions (event_id, activity_id, title, day, starts_at, capacity)
    values (v_event, v_act, 'Other room', current_date, '11:30', 1) returning id into v_sess2;
  raise notice 'switch   -> %', switch_session(v_sess, v_sess2, v_a2);
  raise notice 'moved    -> %', (select count(*) from activity_bookings
                                  where attendee_id = v_a2 and session_id = v_sess2);
  raise notice 'left     -> %', (select count(*) from activity_bookings
                                  where attendee_id = v_a2 and session_id = v_sess);
  -- Attendee 1 holds the first session and tries to move into the one attendee 2 just took.
  -- It is full, so the switch must refuse AND leave attendee 1 where they were.
  raise notice 'refused  -> %', switch_session(v_sess, v_sess2, v_a1);
  raise notice 'kept     -> %', (select count(*) from activity_bookings
                                  where attendee_id = v_a1 and session_id = v_sess);

  delete from events where id = v_event;
end $$;
```

Add `v_sess2 uuid;` to the `declare` block above.

Expected notices, in order: `closed`, `ok`, `full`, `ok`, `ineligible`, `ok`, `limit`, `switch -> ok`, `moved -> 1`, `left -> 0`, `refused -> ineligible`, `kept -> 1`.

Note the second-to-last: attendee 1 is refused for `ineligible`, not `full`. Two steps earlier the fixture gave the activity `categories = array['VIP']` and attendee 1 has no category, so eligibility fails before capacity is ever reached. To see `full` from a switch, run a separate case where the mover *is* eligible and the target is at capacity.

`kept -> 1` is the one that matters most, and it holds whichever refusal fires. A refused switch must be a no-op: if it prints 0, the function deleted before it checked, and a refused target has just cost somebody the seat they already had.

The last three are the ones worth reading twice: `ineligible` proves the category rule is enforced in the database and not only in the portal; `folded` proves `' vip '` matches `VIP`, matching `categoryVisible`; `limit` proves the per-activity cap holds when the session still has room.

- [ ] **Step 4: Verify the grant**

```sql
select has_function_privilege('anon', 'book_session(uuid,uuid,boolean)', 'execute') as anon_can_call;
```

Expected: `false`. If this is `true`, the revoke did not apply and an attacker with the public anon key can book seats.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0017_book_session.sql
git commit -m "feat(activities): book_session enforces capacity under a row lock"
```

---

### Task 3: The concurrency check

**Files:**
- Create: `scripts/booking-concurrency.mjs`
- Modify: `package.json` (one script entry)

**Interfaces:**
- Consumes: `book_session` from Task 2.
- Produces: `npm run check:booking`, which exits non-zero if capacity was ever exceeded.

This is a deliverable, not a checklist line (D141). The suite is pure functions with no database, so this script is the only thing that can see the rule the whole feature exists to enforce.

- [ ] **Step 1: Write the script**

Create `scripts/booking-concurrency.mjs`:

```js
// Fires N bookings at a one-seat session at the same moment and asserts exactly one wins.
//
// Run: npm run check:booking
//
// This exists because vitest has no database (D141). `count(*)` then `insert` passes every
// unit test ever written for it and still seats 31 people in a room of 30.
import { createClient } from "@supabase/supabase-js";

const PARALLEL = 50;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/booking-concurrency.mjs");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// Throws rather than calling process.exit: an exit inside the try below skips the finally,
// so a failing run would leak its event and 50 attendees into the database every time.
const fail = (message) => { throw new Error(message); };

const { data: org } = await db.from("organisations").select("id").limit(1).single();
const { data: event } = await db.from("events")
  .insert({ org_id: org.id, slug: `concurrency-${Date.now()}`, name: "Concurrency check", status: "draft" })
  .select("id").single();

try {
  const { data: activity } = await db.from("activities")
    .insert({ org_id: org.id, event_id: event.id, name: "Race", booking_open: true, max_per_attendee: 1 })
    .select("id").single();
  const { data: session } = await db.from("activity_sessions")
    .insert({ event_id: event.id, activity_id: activity.id, title: "One seat", day: "2026-10-01", starts_at: "09:00", capacity: 1 })
    .select("id").single();

  const people = Array.from({ length: PARALLEL }, (_, i) => ({
    org_id: org.id, event_id: event.id, token: `race${String(i).padStart(12, "0")}`, name: `Racer ${i}`, source: "walkin",
  }));
  const { data: attendees } = await db.from("attendees").insert(people).select("id");

  const results = await Promise.all(attendees.map((a) =>
    db.rpc("book_session", { p_session_id: session.id, p_attendee_id: a.id, p_ignore_open: false })
      .then((r) => (r.error ? `error:${r.error.message}` : r.data))));

  const tally = results.reduce((acc, r) => ({ ...acc, [r]: (acc[r] ?? 0) + 1 }), {});
  const { count } = await db.from("activity_bookings")
    .select("id", { count: "exact", head: true }).eq("session_id", session.id);

  console.log(`${PARALLEL} parallel calls ->`, tally);
  console.log(`rows in activity_bookings: ${count}`);

  if (tally.ok !== 1) fail(`expected exactly 1 'ok', got ${tally.ok ?? 0}`);
  if (tally.full !== PARALLEL - 1) fail(`expected ${PARALLEL - 1} 'full', got ${tally.full ?? 0}`);
  if (count !== 1) fail(`expected 1 booking row, found ${count}`);
  console.log("PASS: one seat, one winner.");
} finally {
  await db.from("events").delete().eq("id", event.id);
}
```

Wrap the whole thing so a thrown failure still exits non-zero after the cleanup has run:

```js
// at the top level, around the try/finally above
try { /* … */ } catch (err) {
  console.error(`FAIL: ${err.message}`);
  process.exitCode = 1;
} finally { /* cleanup */ }
```

The exact arrangement is the implementer's to settle; what must hold is that the cleanup runs on the pass path, the fail path and the thrown-error path, and that the process still exits non-zero when the check fails.

- [ ] **Step 2: Add the script entry**

In `package.json`, inside `"scripts"`, after `"test:watch"`:

```json
"check:booking": "node --env-file=.env.local scripts/booking-concurrency.mjs"
```

- [ ] **Step 3: Run it against the test project**

Run: `npm run check:booking`
Expected: `PASS: one seat, one winner.` and a tally of `{ ok: 1, full: 49 }`.

If it reports two or more `ok`, the `for update` lock is missing or the function was edited after Task 2 — stop and fix `0017` before continuing. Everything after this task assumes this passes.

- [ ] **Step 4: Commit**

```bash
git add scripts/booking-concurrency.mjs package.json
git commit -m "test(activities): prove one seat yields one winner under 50-way contention"
```

---

### Task 4: The pure domain module

**Files:**
- Create: `src/lib/activities.ts`
- Create: `tests/activities.test.ts`
- Modify: `src/lib/agenda.ts:14-18`

**Interfaces:**
- Consumes: `Activity`, `ActivitySession`, `ActivityBooking`, `AgendaItem` from `@/lib/types`.
- Produces:
  - `categoryMatches(categories: string[] | null, category: string | null): boolean` from `@/lib/agenda`
  - `seatsFor(session: ActivitySession, booked: number): SessionSeats`
  - `eligible(activity: Pick<Activity, "categories">, category: string | null): boolean`
  - `activityState(input: StateInput): ActivityState`
  - `canCancel(activity: Pick<Activity, "required">, held: number): boolean`
  - `unbookedIds(attendeeIds: string[], eligibleFor: (id: string) => boolean, bookedIds: ReadonlySet<string>): string[]`
  - `bookedAgendaRows(sessions: ActivitySession[]): AgendaItem[]`
  - `mergeAgenda(items: AgendaItem[], derived: AgendaItem[]): AgendaItem[]`
  - `isBookedRow(item: AgendaItem): boolean`
  - `BOOKING_ROW_PREFIX = "booking:"`
  - types `SessionSeats`, `ActivityState`, `StateInput`

- [ ] **Step 1: Write the failing tests**

Create `tests/activities.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  seatsFor, eligible, activityState, canCancel, unbookedIds,
  bookedAgendaRows, mergeAgenda, isBookedRow,
} from "@/lib/activities";
import type { Activity, ActivitySession, AgendaItem } from "@/lib/types";

const activity = (over: Partial<Activity> = {}): Activity => ({
  id: "act1", org_id: "o", event_id: "e", name: "Workshops", description: null,
  required: false, booking_open: true, max_per_attendee: 1, categories: null, sort_order: 0, ...over,
});
const session = (id: string, over: Partial<ActivitySession> = {}): ActivitySession => ({
  id, event_id: "e", activity_id: "act1", title: id, day: "2026-10-01", starts_at: "09:30",
  ends_at: "11:00", location: "Room 2A", capacity: 30, sort_order: 0, ...over,
});
const item = (id: string, day: string, starts_at: string): AgendaItem => ({
  id, event_id: "e", day, starts_at, ends_at: null, title: id, description: null, location: null,
  categories: null, slot: null, code: null, color: null, sort_order: 0,
});

describe("seatsFor", () => {
  it("reports what is left", () => {
    expect(seatsFor(session("s1"), 18)).toEqual({ session: session("s1"), booked: 18, left: 12, full: false });
  });

  it("is full at capacity", () => {
    expect(seatsFor(session("s1", { capacity: 30 }), 30).full).toBe(true);
  });

  // An organiser can lower a capacity below what is already booked. The card must not
  // offer minus two seats, and it must certainly not offer a Book button.
  it("never reports negative seats when capacity was lowered under the bookings", () => {
    const s = seatsFor(session("s1", { capacity: 10 }), 12);
    expect(s.left).toBe(0);
    expect(s.full).toBe(true);
  });
});

describe("eligible", () => {
  it("lets everyone into an activity with no categories", () => {
    expect(eligible(activity({ categories: null }), null)).toBe(true);
    expect(eligible(activity({ categories: [] }), null)).toBe(true);
  });

  it("matches a category ignoring case and surrounding space", () => {
    expect(eligible(activity({ categories: ["VIP"] }), " vip ")).toBe(true);
  });

  it("keeps out an attendee with no category when the activity names one", () => {
    expect(eligible(activity({ categories: ["VIP"] }), null)).toBe(false);
  });
});

describe("activityState", () => {
  const sessions = [session("s1"), session("s2", { starts_at: "11:30" })];

  it("marks the sessions this attendee holds", () => {
    const state = activityState({
      activity: activity(), sessions, counts: { s1: 5, s2: 0 },
      mine: new Set(["s1"]), category: null,
    });
    expect(state.sessions.map((s) => s.mine)).toEqual([true, false]);
    expect(state.held).toBe(1);
  });

  it("stops offering seats once the per-activity cap is reached", () => {
    const state = activityState({
      activity: activity({ max_per_attendee: 1 }), sessions, counts: {},
      mine: new Set(["s1"]), category: null,
    });
    expect(state.canBookMore).toBe(false);
  });

  it("allows a second booking when the activity allows two", () => {
    const state = activityState({
      activity: activity({ max_per_attendee: 2 }), sessions, counts: {},
      mine: new Set(["s1"]), category: null,
    });
    expect(state.canBookMore).toBe(true);
  });

  it("is closed when the organiser has not opened booking", () => {
    const state = activityState({
      activity: activity({ booking_open: false }), sessions, counts: {},
      mine: new Set(), category: null,
    });
    expect(state.canBookMore).toBe(false);
    expect(state.closed).toBe(true);
  });

  // Required is satisfied by one booking, never by max_per_attendee of them (D129).
  it("asks a required activity to be picked once, however many are allowed", () => {
    const two = { activity: activity({ required: true, max_per_attendee: 2 }), sessions, counts: {}, category: null };
    expect(activityState({ ...two, mine: new Set() }).mustPick).toBe(true);
    expect(activityState({ ...two, mine: new Set(["s1"]) }).mustPick).toBe(false);
  });

  it("hides an activity the attendee's category cannot see", () => {
    const state = activityState({
      activity: activity({ categories: ["VIP"] }), sessions, counts: {},
      mine: new Set(), category: "Delegate",
    });
    expect(state.eligible).toBe(false);
  });
});

describe("canCancel", () => {
  it("lets anyone leave an optional activity", () => {
    expect(canCancel(activity({ required: false }), 1)).toBe(true);
  });

  it("refuses the last booking of a required activity", () => {
    expect(canCancel(activity({ required: true }), 1)).toBe(false);
  });

  it("allows dropping a second booking of a required activity", () => {
    expect(canCancel(activity({ required: true }), 2)).toBe(true);
  });
});

describe("unbookedIds", () => {
  it("lists the eligible people who hold nothing, in the order given", () => {
    expect(unbookedIds(["a1", "a2", "a3"], () => true, new Set(["a2"]))).toEqual(["a1", "a3"]);
  });

  it("leaves out people the activity was never open to", () => {
    expect(unbookedIds(["a1", "a2"], (id) => id === "a1", new Set())).toEqual(["a1"]);
  });
});

describe("bookedAgendaRows", () => {
  it("turns a booked session into an agenda row carrying its own time and place", () => {
    const [row] = bookedAgendaRows([session("s1")]);
    expect(row).toMatchObject({
      id: "booking:s1", day: "2026-10-01", starts_at: "09:30", ends_at: "11:00",
      title: "s1", location: "Room 2A", slot: null, code: null,
    });
  });

  it("marks its rows and only its rows", () => {
    const [row] = bookedAgendaRows([session("s1")]);
    expect(isBookedRow(row)).toBe(true);
    expect(isBookedRow(item("x", "2026-10-01", "09:00"))).toBe(false);
  });
});

describe("mergeAgenda", () => {
  it("interleaves derived rows by day and time", () => {
    const items = [item("i1", "2026-10-01", "09:00"), item("i2", "2026-10-01", "14:00")];
    const derived = bookedAgendaRows([session("s1", { starts_at: "11:30" })]);
    expect(mergeAgenda(items, derived).map((i) => i.id)).toEqual(["i1", "booking:s1", "i2"]);
  });

  it("sorts across days, not only within one", () => {
    const items = [item("i1", "2026-10-02", "09:00")];
    const derived = bookedAgendaRows([session("s1", { day: "2026-10-01", starts_at: "18:00" })]);
    expect(mergeAgenda(items, derived).map((i) => i.id)).toEqual(["booking:s1", "i1"]);
  });

  it("leaves the agenda untouched when nothing is booked", () => {
    const items = [item("i1", "2026-10-01", "09:00")];
    expect(mergeAgenda(items, [])).toEqual(items);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/activities.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/activities"`.

- [ ] **Step 3: Extract the shared category rule**

In `src/lib/agenda.ts`, replace the body of `categoryVisible` (lines 14-18) with a delegation, and export the rule itself:

```ts
/**
 * The category rule on its own, over a bare list.
 *
 * Extracted from `categoryVisible` so activities can hold to exactly the same rule (D131)
 * without owning an `AgendaItem`. One rule, one place, one set of tests — the alternative
 * was a second case-folding comparison that agrees today and drifts later.
 */
export function categoryMatches(categories: string[] | null, category: string | null): boolean {
  const c = category?.trim().toLowerCase() ?? null;
  return !categories || categories.length === 0
    || (c !== null && categories.some((x) => x.trim().toLowerCase() === c));
}

export function categoryVisible(item: AgendaItem, category: string | null): boolean {
  return categoryMatches(item.categories, category);
}
```

- [ ] **Step 4: Write the domain module**

Create `src/lib/activities.ts`:

```ts
import { categoryMatches } from "@/lib/agenda";
import type { Activity, ActivitySession, AgendaItem } from "@/lib/types";

/**
 * Everything about one session that a screen needs and a database row does not carry: how
 * many seats are gone, how many are left, whether it is full.
 *
 * These numbers were true when the page rendered and are stale by definition (D134).
 * `book_session` is the only authority; this decides what to draw, never what to allow.
 */
export type SessionSeats = { session: ActivitySession; booked: number; left: number; full: boolean };

export function seatsFor(session: ActivitySession, booked: number): SessionSeats {
  // An organiser may lower a capacity below the bookings already taken. Clamping at zero
  // keeps "minus two seats left" off the card and keeps `full` honest.
  const left = Math.max(0, session.capacity - booked);
  return { session, booked, left, full: left === 0 };
}

export function eligible(activity: Pick<Activity, "categories">, category: string | null): boolean {
  return categoryMatches(activity.categories, category);
}

export type SeatsForViewer = SessionSeats & { mine: boolean };

export type StateInput = {
  activity: Activity;
  sessions: ActivitySession[];
  /** Bookings per session id. A session absent from this map has none. */
  counts: Record<string, number>;
  /** The sessions of this activity this attendee already holds. */
  mine: ReadonlySet<string>;
  category: string | null;
};

export type ActivityState = {
  activity: Activity;
  sessions: SeatsForViewer[];
  eligible: boolean;
  closed: boolean;
  /** How many sessions of this activity the attendee holds. */
  held: number;
  canBookMore: boolean;
  /** A required activity they hold nothing in. Satisfied by one booking, never by the cap (D129). */
  mustPick: boolean;
};

export function activityState(input: StateInput): ActivityState {
  const { activity, sessions, counts, mine, category } = input;
  const seats = sessions.map((s) => ({ ...seatsFor(s, counts[s.id] ?? 0), mine: mine.has(s.id) }));
  const held = seats.filter((s) => s.mine).length;
  const isEligible = eligible(activity, category);
  const closed = !activity.booking_open;
  return {
    activity,
    sessions: seats,
    eligible: isEligible,
    closed,
    held,
    canBookMore: isEligible && !closed && held < activity.max_per_attendee,
    mustPick: activity.required && isEligible && held === 0,
  };
}

/**
 * Whether this attendee may drop the booking they are looking at.
 *
 * Cancelling out of a required activity would put them in the state the activity exists to
 * prevent, and the portal has somewhere better to send them — the other sessions (D129).
 */
export function canCancel(activity: Pick<Activity, "required">, held: number): boolean {
  return !activity.required || held > 1;
}

/**
 * The people the desk has to chase: eligible, and holding nothing.
 *
 * Order is the caller's, which is `listAttendees` order — already alphabetical, which is what
 * a list somebody reads down wants.
 */
export function unbookedIds(
  attendeeIds: string[],
  eligibleFor: (attendeeId: string) => boolean,
  bookedIds: ReadonlySet<string>,
): string[] {
  return attendeeIds.filter((id) => eligibleFor(id) && !bookedIds.has(id));
}

/** Marks an agenda row that came from a booking rather than from `agenda_items`. */
export const BOOKING_ROW_PREFIX = "booking:";

export function isBookedRow(item: AgendaItem): boolean {
  return item.id.startsWith(BOOKING_ROW_PREFIX);
}

/**
 * A booked session, shaped as an agenda row (D133).
 *
 * Derived at read time and never written to `agenda_items`, so the organiser's timetable
 * stays the organiser's. The prefixed id is the same trick `resolveTiles` uses for `tile:`
 * ids: it keeps the row inside the existing type while staying recognisable to the one
 * component that renders it differently.
 */
export function bookedAgendaRows(sessions: ActivitySession[]): AgendaItem[] {
  return sessions.map((s) => ({
    id: `${BOOKING_ROW_PREFIX}${s.id}`,
    event_id: s.event_id,
    day: s.day,
    starts_at: s.starts_at,
    ends_at: s.ends_at,
    title: s.title,
    description: null,
    location: s.location,
    // Already personal: these rows are this attendee's bookings, so no filter may remove them.
    categories: null,
    slot: null,
    code: null,
    color: null,
    sort_order: s.sort_order,
  }));
}

/** The agenda with the attendee's bookings folded in, in the order the day runs. */
export function mergeAgenda(items: AgendaItem[], derived: AgendaItem[]): AgendaItem[] {
  if (derived.length === 0) return items;
  return [...items, ...derived].sort((a, b) =>
    a.day.localeCompare(b.day) || a.starts_at.localeCompare(b.starts_at) || a.sort_order - b.sort_order);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/activities.test.ts tests/agenda.test.ts`
Expected: PASS, including the existing agenda tests — `categoryVisible` must behave exactly as before.

- [ ] **Step 6: Run the whole suite and commit**

```bash
npm test
npm run lint
git add src/lib/activities.ts src/lib/agenda.ts tests/activities.test.ts
git commit -m "feat(activities): seat maths, eligibility and the agenda merge"
```

---

### Task 5: The database module

**Files:**
- Create: `src/lib/db/activities.ts`

**Interfaces:**
- Consumes: `serviceClient()` from `@/lib/supabase/service`; the tables and function from Tasks 1-2.
- Produces:
  - `listActivities(eventId: string): Promise<Activity[]>`
  - `getActivity(id: string, eventId: string): Promise<Activity | null>`
  - `createActivity(event: Pick<Event, "id" | "org_id">, input: NewActivity): Promise<void>`
  - `updateActivity(id: string, eventId: string, patch: Partial<NewActivity>): Promise<void>`
  - `deleteActivity(id: string, eventId: string): Promise<void>`
  - `listSessions(eventId: string): Promise<ActivitySession[]>`
  - `createSession(eventId: string, activityId: string, input: NewSession): Promise<void>`
  - `updateSession(id: string, eventId: string, patch: NewSession): Promise<void>`
  - `deleteSession(id: string, eventId: string): Promise<void>`
  - `setSessionOrder(eventId: string, orderedIds: string[]): Promise<void>`
  - `countBookingsBySession(eventId: string): Promise<Record<string, number>>`
  - `listBookings(eventId: string): Promise<ActivityBooking[]>`
  - `bookingsForAttendee(attendeeId: string): Promise<ActivityBooking[]>`
  - `bookSession(sessionId: string, attendeeId: string, ignoreOpen?: boolean): Promise<BookResult>`
  - `switchSession(fromSessionId: string, toSessionId: string, attendeeId: string): Promise<BookResult>`
  - `cancelBooking(sessionId: string, attendeeId: string): Promise<boolean>`
  - types `NewActivity`, `NewSession`, `BookResult`

- [ ] **Step 1: Write the module**

Create `src/lib/db/activities.ts`:

```ts
import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { Activity, ActivityBooking, ActivitySession, Event } from "@/lib/types";

export type NewActivity = {
  name: string;
  description: string | null;
  required: boolean;
  booking_open: boolean;
  max_per_attendee: number;
  categories: string[] | null;
};

export type NewSession = {
  title: string;
  day: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  capacity: number;
};

/** Every answer `book_session` can give (D140). `missing` means the row is gone or foreign. */
export type BookResult = "ok" | "full" | "closed" | "limit" | "ineligible" | "missing";

export async function listActivities(eventId: string): Promise<Activity[]> {
  const { data, error } = await serviceClient().from("activities").select("*")
    .eq("event_id", eventId).order("sort_order").order("created_at");
  if (error) throw error;
  return data as Activity[];
}

export async function getActivity(id: string, eventId: string): Promise<Activity | null> {
  const { data, error } = await serviceClient().from("activities").select("*")
    .eq("id", id).eq("event_id", eventId).maybeSingle();
  if (error) throw error;
  return (data as Activity | null) ?? null;
}

/** Appends to the end: a new activity is the next one, not the first. */
export async function createActivity(event: Pick<Event, "id" | "org_id">, input: NewActivity): Promise<void> {
  const db = serviceClient();
  const { data: last } = await db.from("activities").select("sort_order")
    .eq("event_id", event.id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await db.from("activities")
    .insert({ org_id: event.org_id, event_id: event.id, ...input, sort_order: (last?.sort_order ?? -1) + 1 });
  if (error) throw error;
}

export async function updateActivity(id: string, eventId: string, patch: Partial<NewActivity>): Promise<void> {
  const { error } = await serviceClient().from("activities").update(patch)
    .eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

/** Cascades its sessions, and through them its bookings (D135). */
export async function deleteActivity(id: string, eventId: string): Promise<void> {
  const { error } = await serviceClient().from("activities").delete()
    .eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

/** Every session of the event. `time` comes back as HH:MM:SS, so it is trimmed as listAgenda does. */
export async function listSessions(eventId: string): Promise<ActivitySession[]> {
  const { data, error } = await serviceClient().from("activity_sessions").select("*")
    .eq("event_id", eventId).order("day").order("starts_at").order("sort_order");
  if (error) throw error;
  return (data as ActivitySession[]).map((s) => ({
    ...s, starts_at: s.starts_at.slice(0, 5), ends_at: s.ends_at?.slice(0, 5) ?? null,
  }));
}

export async function createSession(eventId: string, activityId: string, input: NewSession): Promise<void> {
  const db = serviceClient();
  const { data: last } = await db.from("activity_sessions").select("sort_order")
    .eq("activity_id", activityId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await db.from("activity_sessions")
    .insert({ event_id: eventId, activity_id: activityId, ...input, sort_order: (last?.sort_order ?? -1) + 1 });
  if (error) throw error;
}

/**
 * Edits one session. Sends every column including nulls, so clearing an end time or a
 * location actually clears it.
 *
 * This deliberately cannot move a session to another activity. `activity_bookings.activity_id`
 * is denormalised from the session (D124), so a move has to rewrite every booking on that
 * session in the same breath — and nothing in the admin offers a move, so the safe answer is
 * that this path does not do it. If a move is ever added, it belongs in a function of its own
 * that updates both tables, with a test that proves the bookings followed.
 */
export async function updateSession(id: string, eventId: string, patch: NewSession): Promise<void> {
  const { error } = await serviceClient().from("activity_sessions").update(patch)
    .eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

export async function deleteSession(id: string, eventId: string): Promise<void> {
  const { error } = await serviceClient().from("activity_sessions").delete()
    .eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

/** Scoped by event id as well as row id, so a posted id from another event reorders nothing. */
export async function setSessionOrder(eventId: string, orderedIds: string[]): Promise<void> {
  const db = serviceClient();
  for (const [index, id] of orderedIds.entries()) {
    const { error } = await db.from("activity_sessions").update({ sort_order: index })
      .eq("id", id).eq("event_id", eventId);
    if (error) throw error;
  }
}

export async function listBookings(eventId: string): Promise<ActivityBooking[]> {
  const { data, error } = await serviceClient().from("activity_bookings").select("*").eq("event_id", eventId);
  if (error) throw error;
  return (data ?? []) as ActivityBooking[];
}

export async function countBookingsBySession(eventId: string): Promise<Record<string, number>> {
  const rows = await listBookings(eventId);
  return rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.session_id] = (acc[r.session_id] ?? 0) + 1;
    return acc;
  }, {});
}

/** One attendee's bookings. The portal's hot path — one query, one attendee. */
export async function bookingsForAttendee(attendeeId: string): Promise<ActivityBooking[]> {
  const { data, error } = await serviceClient().from("activity_bookings").select("*")
    .eq("attendee_id", attendeeId);
  if (error) throw error;
  return (data ?? []) as ActivityBooking[];
}

/**
 * The only way a booking is ever created.
 *
 * Capacity, the per-activity cap, open/closed and eligibility are all decided inside the
 * database under a row lock (D125), so nothing above this line may read a count and then
 * insert. `ignoreOpen` is the desk placing somebody while booking is shut (D130); it does
 * not — and must not — bypass capacity.
 */
export async function bookSession(sessionId: string, attendeeId: string, ignoreOpen = false): Promise<BookResult> {
  const { data, error } = await serviceClient().rpc("book_session", {
    p_session_id: sessionId, p_attendee_id: attendeeId, p_ignore_open: ignoreOpen,
  });
  if (error) throw error;
  return data as BookResult;
}

/**
 * Moves one booking to another session of the same activity, atomically.
 *
 * Not a `cancelBooking` followed by a `bookSession`: an attendee in a required activity with a
 * cap of one cannot cancel (D129), and a target that fills between the two steps would leave
 * them holding nothing. The database does both halves in one transaction or neither.
 */
export async function switchSession(fromSessionId: string, toSessionId: string, attendeeId: string): Promise<BookResult> {
  const { data, error } = await serviceClient().rpc("switch_session", {
    p_from_session: fromSessionId, p_to_session: toSessionId, p_attendee_id: attendeeId,
  });
  if (error) throw error;
  return data as BookResult;
}

/** Returns whether a row was deleted, so the caller can tell a cancel from a double tap. */
export async function cancelBooking(sessionId: string, attendeeId: string): Promise<boolean> {
  const { data, error } = await serviceClient().from("activity_bookings").delete()
    .eq("session_id", sessionId).eq("attendee_id", attendeeId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: no errors. There is nothing to unit test here — every function is a single query with no branching logic, which is the point; the logic lives in Task 4's module and in the database function.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/activities.ts
git commit -m "feat(activities): queries, and the rpc that is the only way to book"
```

---

### Task 6: The attendee's page

**Files:**
- Create: `src/app/e/[slug]/a/[token]/activities/page.tsx`
- Create: `src/app/e/[slug]/a/[token]/activities/actions.ts`
- Create: `src/components/portal/ActivityList.tsx`
- Modify: `src/lib/modules.ts` (`TILE_ROUTES`, `TILE_ROUTE_LABELS`)

**Interfaces:**
- Consumes: `activityState`, `canCancel` from `@/lib/activities`; `listActivities`, `listSessions`, `countBookingsBySession`, `bookingsForAttendee`, `bookSession`, `cancelBooking`, `getActivity` from `@/lib/db/activities`; `loadPortalAttendee` from `@/lib/portal`; `flashPath` from `@/lib/flash`; `allow` from `@/lib/ratelimit`.
- Produces: the route `/e/[slug]/a/[token]/activities`; `bookAction(slug, token, sessionId)`, `switchAction(slug, token, fromSessionId, toSessionId)` and `cancelAction(slug, token, sessionId)`.

Read `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` before this task. Note its warning: a Server Action is reachable by direct POST, not only through your UI, so every action re-authorises.

- [ ] **Step 1: Register the route as a tile destination**

In `src/lib/modules.ts`, append to `TILE_ROUTES` and its label map:

```ts
export const TILE_ROUTES = ["agenda", "announcements", "info", "me", "seat", "stamps", "activities"] as const;
```

```ts
export const TILE_ROUTE_LABELS: Record<TileRoute, string> = {
  agenda: "Agenda",
  announcements: "Announcements",
  info: "Info page",
  me: "My badge",
  seat: "My seat",
  stamps: "Booth Passport",
  activities: "Activities",
};
```

- [ ] **Step 2: Write the actions**

Create `src/app/e/[slug]/a/[token]/activities/actions.ts`:

```ts
"use server";
import { redirect } from "next/navigation";
import { loadPortalAttendee } from "@/lib/portal";
import { bookSession, switchSession, cancelBooking, getActivity, listSessions, bookingsForAttendee } from "@/lib/db/activities";
import { canCancel } from "@/lib/activities";
import { flashPath } from "@/lib/flash";
import { allow } from "@/lib/ratelimit";
import type { BookResult } from "@/lib/db/activities";

/**
 * What the attendee is told when the database refuses (D134, D140).
 *
 * Losing the race is a normal outcome and reads as one: the counts on the page were true when
 * it rendered, somebody else was faster, here is the list again with fresh numbers.
 */
const REFUSALS: Record<Exclude<BookResult, "ok">, string> = {
  full: "That session filled up while you were looking. Pick another one.",
  closed: "Booking for this activity is closed. Speak to the registration desk.",
  limit: "You already have as many sessions of this activity as you can take.",
  ineligible: "That session is not open to you.",
  missing: "That session is no longer on the programme.",
};

export async function bookAction(slug: string, token: string, sessionId: string) {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const path = `/e/${slug}/a/${token}/activities`;

  // The route is reachable by anyone holding a personal link, and a tight loop against it is
  // a denial of seats (D137). Keyed on the token, which is the identity being spent.
  if (!allow(`book:${token}`, 20, 60_000)) {
    redirect(flashPath(path, "Too many attempts. Try again in a minute.", "error"));
  }

  const sessions = await listSessions(event.id);
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) redirect(flashPath(path, REFUSALS.missing, "error"));

  const result = await bookSession(session.id, attendee.id);
  redirect(result === "ok"
    ? flashPath(path, `Booked: ${session.title}.`)
    : flashPath(path, REFUSALS[result], "error"));
}

/**
 * Moves one booking to another session of the same activity.
 *
 * Its own action rather than a cancel then a book, because a required activity with a cap of
 * one refuses the cancel (D129) and would otherwise be unchangeable — and because a target
 * that fills in between must not leave this attendee with nothing.
 */
export async function switchAction(slug: string, token: string, fromSessionId: string, toSessionId: string) {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const path = `/e/${slug}/a/${token}/activities`;
  if (!allow(`book:${token}`, 20, 60_000)) {
    redirect(flashPath(path, "Too many attempts. Try again in a minute.", "error"));
  }

  const sessions = await listSessions(event.id);
  const target = sessions.find((s) => s.id === toSessionId);
  if (!target) redirect(flashPath(path, REFUSALS.missing, "error"));

  const result = await switchSession(fromSessionId, target.id, attendee.id);
  redirect(result === "ok"
    ? flashPath(path, `Moved to ${target.title}.`)
    : flashPath(path, REFUSALS[result], "error"));
}

export async function cancelAction(slug: string, token: string, sessionId: string) {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const path = `/e/${slug}/a/${token}/activities`;
  if (!allow(`book:${token}`, 20, 60_000)) {
    redirect(flashPath(path, "Too many attempts. Try again in a minute.", "error"));
  }

  const sessions = await listSessions(event.id);
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) redirect(flashPath(path, REFUSALS.missing, "error"));

  // Re-checked here rather than trusted from the page: the button is hidden on a required
  // activity's last booking, but a second tab opened before the other one was cancelled
  // still has a live one.
  const activity = await getActivity(session.activity_id, event.id);
  if (!activity) redirect(flashPath(path, REFUSALS.missing, "error"));
  const held = (await bookingsForAttendee(attendee.id)).filter((b) => b.activity_id === activity.id).length;
  if (!canCancel(activity, held)) {
    redirect(flashPath(path, `${activity.name} needs a choice. Switch to another session instead.`, "error"));
  }

  await cancelBooking(session.id, attendee.id);
  redirect(flashPath(path, `Cancelled: ${session.title}.`));
}
```

- [ ] **Step 3: Write the list component**

Create `src/components/portal/ActivityList.tsx`:

```tsx
import type { ActivityState } from "@/lib/activities";
import { canCancel } from "@/lib/activities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/admin/SubmitButton";

export function ActivityList({ states, book, switchTo, cancel }: {
  states: ActivityState[];
  book: (sessionId: string) => Promise<void>;
  switchTo: (fromSessionId: string, toSessionId: string) => Promise<void>;
  cancel: (sessionId: string) => Promise<void>;
}) {
  const open = states.filter((s) => s.eligible);
  if (open.length === 0) {
    return <p className="text-sm text-muted-foreground">There is nothing to book for this event.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {open.map((state) => (
        <Card key={state.activity.id}>
          <CardHeader className="flex flex-row items-baseline justify-between gap-3">
            <CardTitle className="text-[15px] font-bold">{state.activity.name}</CardTitle>
            {state.mustPick
              ? <Badge variant="secondary">Pick one</Badge>
              : state.held > 0 ? <Badge>Booked</Badge> : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {state.activity.description && (
              <p className="text-sm text-muted-foreground">{state.activity.description}</p>
            )}
            {state.closed && (
              <p className="text-sm text-muted-foreground">Booking is closed for this activity.</p>
            )}
            {/*
              The one booking a "switch here" button would move. Offered only when the
              attendee holds exactly one session of this activity: with two, "switch" does
              not say which one is moving (D129), and the honest control is to cancel the
              one they mean — which the cap being full already allows, since held > 1 passes
              canCancel even on a required activity.
            */}
            {state.sessions.map(({ session, left, full, mine }, _i, all) => {
              const heldOne = state.held === 1 ? all.find((s) => s.mine)?.session.id ?? null : null;
              return (
              <div key={session.id} className="flex items-center gap-3 border-t border-border pt-2.5 first:border-t-0 first:pt-0">
                <div className="w-11 shrink-0 text-[13px] text-muted-foreground tabular-nums">
                  {session.starts_at}
                  {session.ends_at && <div className="text-[11px]">{session.ends_at}</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold">{session.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {session.location ? `${session.location} · ` : ""}
                    {mine ? "You are booked" : full ? "No seats left" : `${left} left`}
                  </div>
                </div>
                {/* SubmitButton takes only children, className and variant — it has no size
                    or pendingLabel prop, and says "Working…" while pending on its own. */}
                {mine ? (
                  canCancel(state.activity, state.held) ? (
                    <form action={cancel.bind(null, session.id)}>
                      <SubmitButton variant="outline">Cancel</SubmitButton>
                    </form>
                  ) : null
                ) : full ? (
                  <span className="rounded-[10px] bg-muted px-3 py-1.5 text-xs text-muted-foreground">Full</span>
                ) : state.canBookMore ? (
                  <form action={book.bind(null, session.id)}>
                    <SubmitButton>Book</SubmitButton>
                  </form>
                ) : heldOne && !state.closed ? (
                  <form action={switchTo.bind(null, heldOne, session.id)}>
                    <SubmitButton variant="outline">Switch here</SubmitButton>
                  </form>
                ) : null}
              </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

`SubmitButton` lives in `src/components/admin/` but is a plain client component with no admin dependency, so the portal may use it. Its full signature is `{ children, className?, variant? }` — do not pass `size` or `pendingLabel`.

- [ ] **Step 4: Write the page**

Create `src/app/e/[slug]/a/[token]/activities/page.tsx`:

```tsx
import { loadPortalAttendee } from "@/lib/portal";
import { listActivities, listSessions, countBookingsBySession, bookingsForAttendee } from "@/lib/db/activities";
import { activityState } from "@/lib/activities";
import { ActivityList } from "@/components/portal/ActivityList";
import { bookAction, switchAction, cancelAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ActivitiesPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const [activities, sessions, counts, mine] = await Promise.all([
    listActivities(event.id),
    listSessions(event.id),
    countBookingsBySession(event.id),
    bookingsForAttendee(attendee.id),
  ]);
  const mineBySession = new Set(mine.map((b) => b.session_id));
  const states = activities.map((activity) => activityState({
    activity,
    sessions: sessions.filter((s) => s.activity_id === activity.id),
    counts,
    mine: mineBySession,
    category: attendee.category,
  }));
  return (
    <ActivityList
      states={states}
      book={bookAction.bind(null, slug, token)}
      switchTo={switchAction.bind(null, slug, token)}
      cancel={cancelAction.bind(null, slug, token)}
    />
  );
}
```

- [ ] **Step 5: Verify in the browser pane**

Seed one activity with two sessions against the test event using the Supabase MCP `execute_sql` tool, setting `booking_open = true`, one session with `capacity = 1` and one with `capacity = 10`.

Run `preview_start` with the dev server, then navigate to `/e/<slug>/a/<token>/activities` and check, in order:

1. Both sessions show seats left, and Book appears on both.
2. Book the capacity-1 session. The page returns with a green flash and the row reads "You are booked".
3. The other session now offers "Switch here" rather than Book, because `max_per_attendee` is 1.
4. In a second browser tab on the same page (loaded before step 2), press Book on the same session. It returns "That session filled up while you were looking." — the stale page was refused, not obeyed.
5. Cancel. The seat returns and both Book buttons come back.
6. Set `required = true` in SQL, book again, and confirm Cancel is no longer offered — but "Switch here" still is. Press it; the booking moves and the first session's seat frees. This is the case a cancel-then-book flow cannot do at all, so if Switch is missing here, stop and re-read Task 2.

Use `read_console_messages` and `preview_logs` to confirm no errors.

- [ ] **Step 6: Build and commit**

```bash
npm test
npm run lint
npx next build
git add src/app/e/\[slug\]/a/\[token\]/activities src/components/portal/ActivityList.tsx src/lib/modules.ts
git commit -m "feat(portal): attendees book and cancel a session"
```

---

### Task 7: The agenda merge and the nag

**Files:**
- Modify: `src/lib/portal-home.ts`
- Create: `src/components/portal/RequiredActivityCard.tsx`
- Modify: `src/app/e/[slug]/a/[token]/page.tsx`
- Modify: `src/components/portal/AgendaList.tsx`
- Modify: `tests/activities.test.ts` (one more case)

**Interfaces:**
- Consumes: `bookedAgendaRows`, `mergeAgenda`, `isBookedRow`, `activityState` from `@/lib/activities`.
- Produces: `HomeData.mustPick: ActivityState[]` — the required activities this attendee holds nothing in.

- [ ] **Step 1: Write the failing test for the home data shape**

Append to `tests/activities.test.ts`:

```ts
describe("mergeAgenda with a filtered agenda", () => {
  // The derived rows are already personal, so they are merged AFTER visibleTo and must
  // survive it. This proves the merge does not depend on the agenda being unfiltered.
  it("keeps a booked row that no agenda item corresponds to", () => {
    const filtered: AgendaItem[] = [];
    const derived = bookedAgendaRows([session("s1")]);
    expect(mergeAgenda(filtered, derived).map((i) => i.id)).toEqual(["booking:s1"]);
  });
});
```

- [ ] **Step 2: Run it to verify it passes already**

Run: `npx vitest run tests/activities.test.ts`
Expected: PASS. This case is already satisfied by Task 4's implementation; it is written here because Task 7 is where the ordering decision (merge after filtering) is actually taken, and a later refactor that moves the merge before `visibleTo` must break a test.

- [ ] **Step 3: Load and merge in the home loader**

In `src/lib/portal-home.ts`, add the imports:

```ts
import { listActivities, listSessions, countBookingsBySession, bookingsForAttendee } from "@/lib/db/activities";
import { activityState, bookedAgendaRows, mergeAgenda, type ActivityState } from "@/lib/activities";
```

Add to the `HomeData` type:

```ts
  /** Required activities this attendee has booked nothing in. Drives the nag card (D129). */
  mustPick: ActivityState[];
```

Inside `loadHomeData`, after the existing `assignedItemIds` line and before `const { date, time } = nowInKL();`:

```ts
  // Only touch the activity tables when this event actually runs activities. Every event
  // that exists today has none, and skipping the queries keeps their portal working even
  // before migration 0016 has been applied — the same guard `hasBreakouts` gives above.
  const activities = attendee ? await listActivities(event.id) : [];
  const [sessions, counts, myBookings] = activities.length && attendee
    ? await Promise.all([listSessions(event.id), countBookingsBySession(event.id), bookingsForAttendee(attendee.id)])
    : [[], {} as Record<string, number>, []];
  const mineBySession = new Set(myBookings.map((b) => b.session_id));
  const states = attendee ? activities.map((activity) => activityState({
    activity,
    sessions: sessions.filter((s) => s.activity_id === activity.id),
    counts,
    mine: mineBySession,
    category: attendee.category,
  })) : [];
  const bookedSessions = sessions.filter((s) => mineBySession.has(s.id));
```

Then change the `agenda` line to merge the derived rows in after filtering:

```ts
  // Merged AFTER visibleTo: these rows are this attendee's own bookings, so no category or
  // assignment filter has anything to say about them (D133).
  const agenda = mergeAgenda(
    visibleTo(allAgenda, attendee ? { category: attendee.category, assignedItemIds } : null),
    bookedAgendaRows(bookedSessions),
  );
```

And add to the returned object:

```ts
    mustPick: states.filter((s) => s.mustPick),
```

- [ ] **Step 4: Mark the booked row in the agenda**

In `src/components/portal/AgendaList.tsx`, import the helper:

```tsx
import { isBookedRow } from "@/lib/activities";
```

Inside the item map, after the `categories` badge line, add:

```tsx
              {isBookedRow(i) && <div className="mt-1.5"><Badge>Booked</Badge></div>}
```

and change the location line's condition so a booked row reads as strongly as a breakout room does:

```tsx
                <div className={isBreakout(i) || isBookedRow(i) ? "text-sm font-extrabold text-primary" : "text-xs text-muted-foreground"}>
```

- [ ] **Step 5: Write the nag card**

Create `src/components/portal/RequiredActivityCard.tsx`:

```tsx
import Link from "next/link";
import type { ActivityState } from "@/lib/activities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const caption = "text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground";

/**
 * The activities this attendee still has to choose, on the page they land on.
 *
 * Renders nothing when there is nothing to pick, so every event that runs no activities —
 * which is all of them today — sees no change. Mirrors BreakoutCard, which solves the same
 * problem from the other direction: that card says where you have been put, this one says
 * where you have not yet chosen.
 */
export function RequiredActivityCard({ states, basePath }: { states: ActivityState[]; basePath: string }) {
  if (states.length === 0) return null;
  return (
    <Card>
      <CardHeader><CardTitle className={caption}>Still to choose</CardTitle></CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {states.map((s) => {
            const left = s.sessions.reduce((n, x) => n + x.left, 0);
            return (
              <li key={s.activity.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-0.5 py-2.5">
                <span className="font-medium">{s.activity.name}</span>
                <span className="ml-auto text-muted-foreground">
                  {s.closed
                    ? "Booking closed — see the desk"
                    : <Link className="font-medium text-primary" href={`${basePath}/activities`}>{left} seats left</Link>}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Render it on the portal home**

In `src/app/e/[slug]/a/[token]/page.tsx`, import the card and render it directly above the existing `BreakoutCard` (read the file first to find that line — the two cards sit together below the badge):

```tsx
import { RequiredActivityCard } from "@/components/portal/RequiredActivityCard";
```

```tsx
      <RequiredActivityCard states={home.mustPick} basePath={basePath} />
```

- [ ] **Step 7: Verify in the browser pane**

With the seed from Task 6 still in place and `required = true`:

1. `/e/<slug>/a/<token>` shows "Still to choose" with the seats left, and the link goes to the activities page.
2. Book a session. The card disappears on the next load.
3. `/e/<slug>/a/<token>/agenda` shows the booked session in time order with a "Booked" badge and its room in the strong treatment.
4. Cancel, and confirm the agenda row disappears and the nag comes back.
5. Load the anonymous portal `/e/<slug>/agenda` and confirm it is unchanged — no booked rows, no card.

- [ ] **Step 8: Build and commit**

```bash
npm test
npm run lint
npx next build
git add src/lib/portal-home.ts src/components/portal/RequiredActivityCard.tsx src/components/portal/AgendaList.tsx "src/app/e/[slug]/a/[token]/page.tsx" tests/activities.test.ts
git commit -m "feat(portal): booked sessions join the agenda, unpicked ones nag"
```

---

### Task 8: The admin activity list

**Files:**
- Create: `src/app/admin/events/[id]/activities/page.tsx`
- Create: `src/app/admin/events/[id]/activities/actions.ts`
- Create: `src/components/admin/ActivityRows.tsx`
- Modify: `src/components/admin/nav.ts:24-28`

**Interfaces:**
- Consumes: `requireAdmin` from `@/lib/auth`; `requireEvent` from `@/lib/db/events`; the Task 5 module.
- Produces: `/admin/events/[id]/activities`; `addActivityAction`, `saveActivityAction`, `toggleBookingAction`, `deleteActivityAction`, all taking `(eventId, …)`.

- [ ] **Step 1: Add the nav entry**

In `src/components/admin/nav.ts`, in the `Portal` group, after the Agenda item:

```ts
      { href: `${b}/activities`, label: "Activities", icon: "flag" },
```

`flag` is in `ICONS` (see `src/components/ui/icon.tsx`); `calendar` is taken by Agenda and reusing it would make the two look like one feature — which is the confusion D138 says to avoid.

- [ ] **Step 2: Write the actions**

Create `src/app/admin/events/[id]/activities/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { createActivity, updateActivity, deleteActivity, getActivity } from "@/lib/db/activities";
import { parseCategories } from "@/lib/agenda";
import { flashPath } from "@/lib/flash";

async function event(eventId: string) {
  const { orgId } = await requireAdmin();
  return requireEvent(eventId, orgId);
}

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const checked = (fd: FormData, key: string) => fd.get(key) !== null;

/** Shared by add and save so the two can never disagree about what a valid activity is. */
function readActivity(fd: FormData) {
  const name = text(fd, "name");
  if (!name) throw new Error("An activity needs a name");
  const raw = text(fd, "max_per_attendee") || "1";
  const max = Number.parseInt(raw, 10);
  if (!Number.isFinite(max) || max < 1 || max > 10) {
    throw new Error("Sessions per person must be a whole number between 1 and 10");
  }
  return {
    name,
    description: text(fd, "description") || null,
    required: checked(fd, "required"),
    booking_open: checked(fd, "booking_open"),
    max_per_attendee: max,
    categories: parseCategories(text(fd, "categories")),
  };
}

export async function addActivityAction(eventId: string, fd: FormData) {
  const ev = await event(eventId);
  await createActivity(ev, readActivity(fd));
  revalidatePath(`/admin/events/${eventId}/activities`);
}

export async function saveActivityAction(eventId: string, activityId: string, fd: FormData) {
  const ev = await event(eventId);
  await updateActivity(activityId, ev.id, readActivity(fd));
  revalidatePath(`/admin/events/${eventId}/activities`);
  revalidatePath(`/admin/events/${eventId}/activities/${activityId}`);
  redirect(flashPath(`/admin/events/${eventId}/activities/${activityId}`, "Activity saved."));
}

/**
 * The one control the desk uses during an event, so it is one click and its own action
 * rather than a field inside the settings form (D127).
 */
export async function toggleBookingAction(eventId: string, activityId: string) {
  const ev = await event(eventId);
  const activity = await getActivity(activityId, ev.id);
  if (!activity) redirect(flashPath(`/admin/events/${eventId}/activities`, "That activity no longer exists.", "error"));
  await updateActivity(activityId, ev.id, { booking_open: !activity.booking_open });
  const path = `/admin/events/${eventId}/activities/${activityId}`;
  revalidatePath(path);
  redirect(flashPath(path, activity.booking_open ? "Booking closed." : "Booking open."));
}

/** Cascades sessions and bookings (D135), so the confirm dialog says how many seats go with it. */
export async function deleteActivityAction(eventId: string, activityId: string) {
  const ev = await event(eventId);
  await deleteActivity(activityId, ev.id);
  revalidatePath(`/admin/events/${eventId}/activities`);
  redirect(flashPath(`/admin/events/${eventId}/activities`, "Activity deleted."));
}
```

- [ ] **Step 3: Write the rows component**

Create `src/components/admin/ActivityRows.tsx`. Read `src/components/admin/BoothList.tsx` first and follow it: same `<ul className="divide-y divide-border">`, same `ConfirmButton` for the delete, same `Badge` usage.

```tsx
import Link from "next/link";
import type { Activity } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

export function ActivityRows({ items, counts, seats, basePath }: {
  items: Activity[];
  /** Bookings per activity id. */
  counts: Record<string, number>;
  /** Total capacity per activity id. */
  seats: Record<string, number>;
  basePath: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No activities yet. Add one to let attendees book a seat.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {items.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
          <Link href={`${basePath}/activities/${a.id}`} className="min-w-0 flex-1 font-medium hover:underline">
            {a.name}
          </Link>
          {a.required && <Badge variant="secondary">Pick one</Badge>}
          <Badge variant={a.booking_open ? "default" : "outline"}>
            {a.booking_open ? "Booking open" : "Closed"}
          </Badge>
          <span className="text-sm text-muted-foreground tabular-nums">
            {counts[a.id] ?? 0} / {seats[a.id] ?? 0} seats
          </span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Write the page**

Create `src/app/admin/events/[id]/activities/page.tsx`:

```tsx
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listActivities, listSessions, countBookingsBySession } from "@/lib/db/activities";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Modal } from "@/components/admin/Modal";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ActivityRows } from "@/components/admin/ActivityRows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Activities · Orange Lobby" };

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const check = "flex items-center gap-2 text-sm font-bold";

export default async function Activities({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const [activities, sessions, bookings] = await Promise.all([
    listActivities(ev.id), listSessions(ev.id), countBookingsBySession(ev.id),
  ]);

  // Rolled up from the sessions already loaded rather than queried per activity: the page
  // shows one line each, and a query per row is how a ten-activity event gets slow.
  const counts: Record<string, number> = {};
  const seats: Record<string, number> = {};
  for (const s of sessions) {
    counts[s.activity_id] = (counts[s.activity_id] ?? 0) + (bookings[s.id] ?? 0);
    seats[s.activity_id] = (seats[s.activity_id] ?? 0) + s.capacity;
  }

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title="Activities"
        subtitle="Attendees book these themselves, first come first served. Breakout rooms, which you assign from the agenda, are a separate thing."
        actions={
          <Modal title="Add an activity" hint="Add its sessions once it exists." trigger="Add activity" icon="plus">
            <form action={addActivityAction.bind(null, ev.id)} className="grid gap-4">
              <Field label="Name" name="name" placeholder="Workshops" />
              <Field label="Description (optional)" name="description" textarea placeholder="Pick the track you want to join on Friday morning." />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="max_per_attendee" className="text-sm font-bold">Sessions per person</label>
                <input id="max_per_attendee" name="max_per_attendee" type="number" min={1} max={10}
                  defaultValue={1} inputMode="numeric" className={`${input} tabular-nums`} />
              </div>
              <Field label="Categories (optional)" name="categories" placeholder="VIP, Management"
                description="Comma separated. Leave blank to offer it to everyone." />
              <label className={check}>
                <input type="checkbox" name="required" className="size-4" />
                Everyone must pick one
              </label>
              <label className={check}>
                <input type="checkbox" name="booking_open" className="size-4" />
                Open for booking now
              </label>
              <SubmitButton>Add activity</SubmitButton>
            </form>
          </Modal>
        }
      />

      <Card className="overflow-hidden">
        <CardHeader className="border-b"><CardTitle>Activities</CardTitle></CardHeader>
        <CardContent className="px-6">
          <ActivityRows items={activities} counts={counts} seats={seats} basePath={`/admin/events/${ev.id}`} />
        </CardContent>
      </Card>
    </div>
  );
}
```

Add `import { addActivityAction } from "./actions";` with the other imports — it is referenced in the form above.

- [ ] **Step 5: Verify**

Run `npx next build`. Then add to `docs/dry-run-verification.md` under a new "Activities" heading, since the admin is login-gated and cannot be driven here:

```markdown
## Activities (admin — needs a logged-in organiser)

- [ ] Activities appears in the Portal group of the sidebar
- [ ] Add an activity with two sessions; the list shows 0 / <capacity> seats
- [ ] Booking open / Closed toggles and the badge follows
- [ ] Deleting an activity removes its sessions and bookings
```

- [ ] **Step 6: Commit**

```bash
npm test
npm run lint
npx next build
git add "src/app/admin/events/[id]/activities" src/components/admin/ActivityRows.tsx src/components/admin/nav.ts docs/dry-run-verification.md
git commit -m "feat(admin): create activities and open or close their booking"
```

---

### Task 9: Sessions and the people who have not booked

**Files:**
- Create: `src/app/admin/events/[id]/activities/[activityId]/page.tsx`
- Create: `src/components/admin/SessionList.tsx`
- Create: `src/components/admin/UnbookedPanel.tsx`
- Modify: `src/app/admin/events/[id]/activities/actions.ts` (append)

**Interfaces:**
- Consumes: Task 8's `event()` helper and actions file; `unbookedIds`, `seatsFor`, `eligible` from `@/lib/activities`; `listAttendees` from `@/lib/db/attendees`.
- Produces: `/admin/events/[id]/activities/[activityId]`, and in `../actions.ts`:
  - `addSessionAction(eventId, activityId, fd)`
  - `saveSessionAction(eventId, activityId, sessionId, fd)`
  - `deleteSessionAction(eventId, activityId, sessionId)`
  - `reorderSessionsAction(eventId, activityId, ids)`
  - `placeAttendeesAction(eventId, activityId, fd)` — the session comes from the form's `session_id`, the people from its `ids`.
  - `SessionList` props `{ items: SessionSeats[]; addSession; saveSession; deleteSession; reorder }`
  - `UnbookedPanel` props `{ people: Placeable[]; options: SessionOption[]; place }`

- [ ] **Step 1: Append the session and placement actions**

Add to `src/app/admin/events/[id]/activities/actions.ts`:

```ts
import { createSession, updateSession, deleteSession, setSessionOrder, bookSession, listSessions } from "@/lib/db/activities";
import { listAttendees } from "@/lib/db/attendees";
import { parseIds } from "@/lib/bulk";

function readSession(fd: FormData) {
  const title = text(fd, "title");
  if (!title) throw new Error("A session needs a title");
  const day = text(fd, "day");
  const starts_at = text(fd, "starts_at");
  if (!day || !starts_at) throw new Error("A session needs a day and a start time");
  const capacity = Number.parseInt(text(fd, "capacity") || "0", 10);
  if (!Number.isFinite(capacity) || capacity < 1) throw new Error("Capacity must be at least 1");
  return { title, day, starts_at, ends_at: text(fd, "ends_at") || null, location: text(fd, "location") || null, capacity };
}

export async function addSessionAction(eventId: string, activityId: string, fd: FormData) {
  const ev = await event(eventId);
  await createSession(ev.id, activityId, readSession(fd));
  revalidatePath(`/admin/events/${eventId}/activities/${activityId}`);
}

export async function saveSessionAction(eventId: string, activityId: string, sessionId: string, fd: FormData) {
  const ev = await event(eventId);
  await updateSession(sessionId, ev.id, readSession(fd));
  revalidatePath(`/admin/events/${eventId}/activities/${activityId}`);
}

/**
 * Deleting a session takes its bookings with it (D135). The confirm dialog says how many,
 * because "delete this session" and "cancel 28 people's afternoon" are the same click.
 */
export async function deleteSessionAction(eventId: string, activityId: string, sessionId: string) {
  const ev = await event(eventId);
  await deleteSession(sessionId, ev.id);
  const path = `/admin/events/${eventId}/activities/${activityId}`;
  revalidatePath(path);
  redirect(flashPath(path, "Session deleted."));
}

export async function reorderSessionsAction(eventId: string, activityId: string, ids: string[]) {
  const ev = await event(eventId);
  await setSessionOrder(ev.id, ids);
  revalidatePath(`/admin/events/${eventId}/activities/${activityId}`);
}

/**
 * Places the selected people in one session.
 *
 * Goes through `book_session` like everything else, with `ignoreOpen` true: the desk works
 * after booking has closed, but a full session refuses an organiser exactly as it refuses an
 * attendee (D126, D130). The report counts each outcome rather than claiming success, because
 * "placed 12 of 15" is the sentence the organiser actually needs.
 */
export async function placeAttendeesAction(eventId: string, activityId: string, fd: FormData) {
  const ev = await event(eventId);
  const path = `/admin/events/${eventId}/activities/${activityId}`;
  // The session comes from the form's own select, not from a bound argument: a form action
  // receives FormData and nothing else.
  const sessionId = String(fd.get("session_id") ?? "");
  // Never trust the posted list: it decides who gets written. `parseIds` filters it against
  // the attendees of THIS event, the same way the attendee bulk actions do. The field is a
  // comma-separated hidden input named "ids" (see BulkBar).
  const attendees = await listAttendees(ev.id);
  const ids = parseIds(String(fd.get("ids") ?? ""), new Set(attendees.map((a) => a.id)));
  if (ids.length === 0) redirect(flashPath(path, "Nobody was selected.", "error"));
  const session = (await listSessions(ev.id)).find((s) => s.id === sessionId);
  if (!session) redirect(flashPath(path, "That session no longer exists.", "error"));

  const outcomes = await Promise.all(ids.map((id) => bookSession(session.id, id, true)));
  const placed = outcomes.filter((o) => o === "ok").length;
  const full = outcomes.filter((o) => o === "full").length;
  const other = outcomes.length - placed - full;
  revalidatePath(path);
  redirect(flashPath(path, [
    `${placed} placed in ${session.title}`,
    full ? `${full} refused — the session is full` : "",
    other ? `${other} could not be placed` : "",
  ].filter(Boolean).join(", ") + ".", full || other ? "error" : "ok"));
}
```

`listAttendees` is imported for the id filter alone. If `src/lib/db/attendees.ts` exports it under another name, use that one — do not add a second reader.

- [ ] **Step 2: Write the session list**

Create `src/components/admin/SessionList.tsx` with exactly this signature, which the page in Step 4 depends on:

```tsx
"use client";
import type { SessionSeats } from "@/lib/activities";

export function SessionList({ items, addSession, saveSession, deleteSession, reorder }: {
  items: SessionSeats[];
  addSession: (fd: FormData) => Promise<void>;
  saveSession: (sessionId: string, fd: FormData) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  reorder: (ids: string[]) => Promise<void>;
}) { /* … */ }
```

Build the body by copying `src/components/admin/BoothList.tsx` and changing four things, and nothing else:

1. `items` is `SessionSeats[]`, so each row reads `item.session` for its fields and `item.booked`, `item.left`, `item.full` for its numbers.
2. The row's middle column shows `session.title`, then `session.day` and `session.starts_at`–`ends_at` and `session.location` beneath it, instead of a booth name and location.
3. Where `BoothList` shows its stamp count, show `{item.booked} / {item.session.capacity}` plus a `Progress` bar (`src/components/ui/progress.tsx`) at `booked / capacity`.
4. The delete `ConfirmButton`'s message names what goes with it: `` `Delete ${session.title}? Its ${item.booked} booking${item.booked === 1 ? "" : "s"} go with it.` `` — deleting a session cancels those people's afternoon (D135), and the dialog is the only place that says so. Unlike a booth, a session with bookings **is** deletable; the cascade is intended here.

Keep `useOptimistic` for the order, `moveItem` from `@/lib/reorder` for both routes, and the `aria-busy` plus live-region message exactly as they are. A drag with no keyboard equivalent fails WCAG 2.5.7, so the handle must take focus and respond to arrow keys — do not ship a pointer-only reorder.

The Add and Edit forms are `Modal` + `Field` as in Task 8, with fields `title`, `day` (type `date`), `starts_at` and `ends_at` (type `time`), `location`, and `capacity` (type `number`, `min={1}`).

- [ ] **Step 3: Write the unbooked panel**

Create `src/components/admin/UnbookedPanel.tsx`:

```tsx
"use client";
import { useState } from "react";
import { SubmitButton } from "@/components/admin/SubmitButton";

export type Placeable = { id: string; name: string; category: string | null };
export type SessionOption = { id: string; label: string; left: number };

/**
 * The people this activity still needs a choice from, and the one control that places them.
 *
 * Full sessions are not in the select. The database would refuse them anyway (D126), but a
 * dropdown that offers a choice and then rejects it is a worse way to learn that than not
 * offering it — and the counts here are a render old, so the refusal path still has to work.
 */
export function UnbookedPanel({ people, options, place }: {
  people: Placeable[];
  options: SessionOption[];
  place: (fd: FormData) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  if (people.length === 0) {
    return <p className="text-sm text-muted-foreground">Everyone who can book has booked.</p>;
  }

  return (
    <form action={place} className="flex flex-col gap-3">
      <input type="hidden" name="ids" value={selected.join(",")} />
      <ul className="divide-y divide-border">
        {people.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2.5">
            <input
              type="checkbox" className="size-4" checked={selected.includes(p.id)}
              onChange={() => toggle(p.id)} aria-label={`Select ${p.name}`}
            />
            <span className="min-w-0 flex-1 text-sm">{p.name}</span>
            {p.category && <span className="text-sm text-muted-foreground">{p.category}</span>}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="session_id" className="text-sm font-bold">Place in</label>
        <select id="session_id" name="session_id" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.label} — {o.left} left</option>
          ))}
        </select>
        <span className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {selected.length} selected
        </span>
        <SubmitButton>Place selected</SubmitButton>
      </div>
      {options.length === 0 && (
        <p className="text-sm text-muted-foreground">Every session is full. Raise a capacity or add a session.</p>
      )}
    </form>
  );
}
```

- [ ] **Step 4: Write the page**

Create `src/app/admin/events/[id]/activities/[activityId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { getActivity, listSessions, listBookings, countBookingsBySession } from "@/lib/db/activities";
import { listAttendees } from "@/lib/db/attendees";
import { seatsFor, eligible, unbookedIds } from "@/lib/activities";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SessionList } from "@/components/admin/SessionList";
import { UnbookedPanel } from "@/components/admin/UnbookedPanel";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  saveActivityAction, toggleBookingAction, addSessionAction, saveSessionAction,
  deleteSessionAction, reorderSessionsAction, placeAttendeesAction,
} from "../actions";

export default async function ActivityDetail({ params }: { params: Promise<{ id: string; activityId: string }> }) {
  const { id, activityId } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const activity = await getActivity(activityId, ev.id);
  if (!activity) notFound();

  const [allSessions, bookings, counts, attendees] = await Promise.all([
    listSessions(ev.id), listBookings(ev.id), countBookingsBySession(ev.id), listAttendees(ev.id),
  ]);
  const sessions = allSessions.filter((s) => s.activity_id === activity.id);
  const seats = sessions.map((s) => seatsFor(s, counts[s.id] ?? 0));

  // Who still owes a choice: eligible, and holding nothing in THIS activity. `listAttendees`
  // is already ordered by name, and unbookedIds keeps that order, which is what a list
  // somebody reads down wants.
  const booked = new Set(bookings.filter((b) => b.activity_id === activity.id).map((b) => b.attendee_id));
  const byId = new Map(attendees.map((a) => [a.id, a]));
  const unbooked = unbookedIds(
    attendees.map((a) => a.id),
    (attendeeId) => eligible(activity, byId.get(attendeeId)?.category ?? null),
    booked,
  );

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title={activity.name}
        subtitle={`${booked.size} of ${attendees.length} have booked · ${seats.reduce((n, s) => n + s.left, 0)} seats left`}
        actions={
          <form action={toggleBookingAction.bind(null, ev.id, activity.id)}>
            <SubmitButton variant={activity.booking_open ? "outline" : "default"}>
              {activity.booking_open ? "Close booking" : "Open booking"}
            </SubmitButton>
          </form>
        }
      />

      <Card className="overflow-hidden">
        <CardHeader className="border-b"><CardTitle>Sessions</CardTitle></CardHeader>
        <CardContent className="px-6">
          <SessionList
            items={seats}
            addSession={addSessionAction.bind(null, ev.id, activity.id)}
            saveSession={saveSessionAction.bind(null, ev.id, activity.id)}
            deleteSession={deleteSessionAction.bind(null, ev.id, activity.id)}
            reorder={reorderSessionsAction.bind(null, ev.id, activity.id)}
          />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b">
          <CardTitle>Not booked yet · {unbooked.length}</CardTitle>
        </CardHeader>
        <CardContent className="px-6 py-4">
          <UnbookedPanel
            people={unbooked.map((attendeeId) => {
              const a = byId.get(attendeeId)!;
              return { id: a.id, name: a.name, category: a.category };
            })}
            options={seats.filter((s) => !s.full).map((s) => ({
              id: s.session.id,
              label: `${s.session.title} · ${s.session.starts_at}`,
              left: s.left,
            }))}
            place={placeAttendeesAction.bind(null, ev.id, activity.id)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
```

The policy form — name, description, `required`, `max_per_attendee`, `categories` — is the same set of fields as the add form in Task 8, bound to `saveActivityAction.bind(null, ev.id, activity.id)` with `defaultValue` filled from `activity`. Put it in a third `Card` titled "Settings" below the two above. `booking_open` is deliberately NOT in that form: it has its own button in the header, because it is the one control the desk touches during an event and it must not need a Save (D127).

- [ ] **Step 5: Verify**

Run `npx next build`, then extend the checklist in `docs/dry-run-verification.md`:

```markdown
- [ ] Add a session; it appears with 0 / <capacity>
- [ ] Reorder sessions with the drag handle, then with the keyboard
- [ ] Not-booked list shows the right people and excludes anyone outside the categories
- [ ] Place three people into a session; the flash counts them
- [ ] Place people into a session with one seat left; the flash says how many were refused
- [ ] Close booking, then place somebody — placement still works
- [ ] Delete a session with bookings; the confirm dialog names them
```

- [ ] **Step 6: Commit**

```bash
npm test
npm run lint
npx next build
git add "src/app/admin/events/[id]/activities" src/components/admin/SessionList.tsx src/components/admin/UnbookedPanel.tsx docs/dry-run-verification.md
git commit -m "feat(admin): sessions, capacity meters and placing people who have not booked"
```

---

### Task 10: The rosters export

**Files:**
- Create: `src/app/admin/events/[id]/export/activities.xlsx/route.ts`
- Modify: `src/lib/exports.ts`
- Modify: `src/app/admin/events/[id]/exports/page.tsx`

**Interfaces:**
- Consumes: the Task 5 module; the existing ExcelJS helpers in `@/lib/exports`.
- Produces: `GET /admin/events/[id]/export/activities.xlsx`.

**This task is droppable (D139).** If the work has run long, stop after Task 9 and say so — nothing else depends on this.

- [ ] **Step 1: Read the existing export**

Read `src/app/admin/events/[id]/export/rosters.xlsx/route.ts` and `src/lib/exports.ts`. The breakout roster is already one sheet per room plus a sheet of the unassigned (D87); this is the same file for a different table, and it must reuse the same helpers rather than growing a second way to build a sheet.

- [ ] **Step 2: Write the route**

Create `src/app/admin/events/[id]/export/activities.xlsx/route.ts` following the rosters route exactly: `requireAdmin`, `requireEvent`, load activities, sessions, bookings and attendees, then one sheet per session titled `<activity> — <session>` holding each attendee's name and the pinned facts that roster already prints, plus a final sheet per required activity listing who booked nothing.

Sheet names in Excel are capped at 31 characters and cannot contain `: \ / ? * [ ]`. `src/lib/filenames.ts` already has the sanitiser the other exports use — use it rather than writing a second one.

- [ ] **Step 3: Add it to the exports page**

Add a row to `src/app/admin/events/[id]/exports/page.tsx` beside the existing downloads, labelled "Activity rosters", with a one-line description: "One sheet per session, plus who has not booked."

- [ ] **Step 4: Verify**

Run `npx next build`. Add to the checklist:

```markdown
- [ ] Activity rosters download opens in Excel; one sheet per session, names in alphabetical order
- [ ] A session with no bookings still gets a sheet, with a header and no rows
```

- [ ] **Step 5: Commit**

```bash
npm test
npm run lint
npx next build
git add "src/app/admin/events/[id]/export/activities.xlsx" src/lib/exports.ts "src/app/admin/events/[id]/exports/page.tsx" docs/dry-run-verification.md
git commit -m "feat(admin): export activity rosters, one sheet per session"
```

---

## Final verification

- [ ] `npm test` — the whole suite, including the existing agenda tests that `categoryMatches` refactored under.
- [ ] `npm run lint`
- [ ] `npx next build`
- [ ] `npm run check:booking` — re-run after every change to `0017_book_session.sql`, and once at the end.
- [ ] Portal walked end to end in the browser pane: book, switch, cancel, full, closed, and the agenda row.
- [ ] `docs/dry-run-verification.md` carries the admin checklist for the user.
- [ ] Migrations `0016` and `0017` applied to production at merge, not before.
