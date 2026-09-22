# Activity Change Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make switching and cancelling an activity booking a request the desk approves, and make the attendee's Activities page readable — weighted seat counts, a confirmation before a seat is taken, and the change controls moved out of the session rows.

**Architecture:** One new table, `activity_change_requests`, holding a row per request with its decision history. The booking never moves while a request is pending; approving calls the `switch_session` / `cancel_booking` functions that already enforce capacity under row locks, so an approval can be refused exactly as an attendee's own attempt would be. `switch_session` gains an ignore-open parameter, because the desk closes booking at the headcount cut-off and must still be able to work the queue. A new pure module holds the state machine that decides which controls a given booking-and-request state offers.

**Tech Stack:** Next.js 16.3.4 (App Router, Server Actions), React 19.2.8, TypeScript, Supabase (postgres + supabase-js service role), Tailwind v4 + shadcn/ui on Base UI, Vitest, ExcelJS.

**Spec:** `docs/superpowers/specs/2026-09-21-activity-change-requests-design.md`

## Global Constraints

- **Read the Next.js docs before writing route or action code.** `AGENTS.md` requires reading the relevant guide in `node_modules/next/dist/docs/` first; for this work that is `01-app/01-getting-started/07-mutating-data.md`. A Server Action is reachable by direct POST, so every action re-authorises.
- **Approval and decline write through the existing database functions, never a direct insert or delete** (D154). `switch_session` and `cancel_booking` are the only write paths that hold the row locks; an approval that bypassed them would be the one caller that can overbook.
- **The booking does not move while a request is pending** (D143). Nothing in this work may write to `activity_bookings` outside those two functions.
- **A refused approval leaves the request `pending`** (§6 of the spec). The desk has not decided anything; they have been told they cannot do it yet. Declining is the separate, deliberate act.
- **Every activity requires approval for switch and cancel** (D145). No per-activity setting, no cut-off.
- **One open request per attendee per activity**, enforced by a partial unique index, not by application code (D146).
- **A required activity offers no cancel control at all** (D148) — it never reaches the queue.
- **Booking a first seat stays instant** (D149), but gets a confirmation step (D150).
- Every new table gets `alter table … enable row level security;` with no policies.
- Supabase returns a `time` column as `HH:MM:SS`; normalise with `.slice(0, 5)` as `listSessions` does.
- `SubmitButton`'s full signature is `{ children, className?, variant? }` — no `size`, no `pendingLabel`.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Never pass `--no-verify` or `-c commit.gpgsign=false`.
- `npm test`, `npm run lint` and `npx next build` pass before every commit.
- **Do not run `npm run check:booking` before 30 Sep** — it writes an event and 50 attendees to the live pilot project.

---

## File Structure

**Create:**
- `supabase/migrations/0019_activity_change_requests.sql` — the table, its constraints, its indexes, RLS.
- `supabase/migrations/0020_switch_session_ignore_open.sql` — `switch_session` regains a signature with `p_ignore_open`, with the drop-and-regrant that a signature change forces.
- `src/lib/activity-requests.ts` — pure: which controls a booking-and-request state offers, the pending rollup, the outcome wording. A new file rather than more of `src/lib/activities.ts`, which already carries seat derivation and form reading; a third concern is the agreed trigger to split.
- `tests/activity-requests.test.ts` — its tests.
- `src/lib/db/activity-requests.ts` — every query, `server-only`.
- `src/components/portal/ActivityBooking.tsx` — the attendee's own booking and the controls that act on it, below the sessions.
- `src/components/admin/RequestQueue.tsx` — the desk's card.

**Modify:**
- `src/lib/types.ts` — `ActivityChangeRequest` and its two unions.
- `src/components/admin/ConfirmButton.tsx` — an optional non-destructive tone, so Book can confirm without a red button.
- `src/components/portal/ActivityList.tsx` — seat weight, Book confirmation, change controls removed from the rows.
- `src/app/e/[slug]/a/[token]/activities/page.tsx` — load the attendee's pending requests.
- `src/app/e/[slug]/a/[token]/activities/actions.ts` — `switchAction`/`cancelAction` become `requestSwitchAction`/`requestCancelAction`, plus `withdrawRequestAction`.
- `src/app/admin/events/[id]/activities/[activityId]/page.tsx` — the requests card.
- `src/app/admin/events/[id]/activities/actions.ts` — `approveRequestAction`, `declineRequestAction`.
- `src/app/admin/events/[id]/activities/page.tsx` and `src/components/admin/ActivityRows.tsx` — the pending count.
- `scripts/book-session-fixture.sql`, `scripts/booking-concurrency.mjs` — evidence for the new paths.
- `docs/activities-verification.md` — the admin walkthrough.

---

### Task 1: The requests table

**Files:**
- Create: `supabase/migrations/0019_activity_change_requests.sql`
- Modify: `src/lib/types.ts` (append after `ActivityBooking`)

**Interfaces:**
- Consumes: `activities`, `activity_sessions`, `attendees`, `events` from migrations 0001 and 0016.
- Produces: table `activity_change_requests`; types `ActivityRequestKind`, `ActivityRequestStatus`, `ActivityChangeRequest` from `@/lib/types`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0019_activity_change_requests.sql`:

```sql
-- A change an attendee has asked for and the desk has not yet decided.
--
-- Its own table rather than a flag on the booking (D142). `activity_bookings` keeps meaning
-- exactly one thing — a seat somebody holds — which is what every count in this feature
-- reads, and a cancel request has nowhere to live on a row that is about to disappear.
-- The deciding reason is that a request is a RECORD: when somebody asks in November why a
-- room seated nineteen, the answer is a row naming who asked, for what, who decided, and
-- when.
--
-- The booking itself does not move while a request is pending (D143), so nothing here
-- affects any count until an approval calls switch_session or cancel_booking.
create table activity_change_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,
  kind text not null check (kind in ('switch', 'cancel')),
  -- The booking they hold now. Cascades, so deleting a session takes its pending requests
  -- with it exactly as it takes its bookings (D135).
  from_session_id uuid not null references activity_sessions(id) on delete cascade,
  -- Where they want to go; null for a cancel. The check below makes that structural rather
  -- than a convention somebody has to remember.
  to_session_id uuid references activity_sessions(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  -- Who decided, the same way checkins records scanned_by (D155). scannerNames() in
  -- src/lib/db/users.ts already resolves these to emails.
  decided_by uuid references auth.users(id),
  check ((kind = 'switch' and to_session_id is not null)
      or (kind = 'cancel' and to_session_id is null))
);

-- One open request per attendee per activity (D146), in the database rather than in the
-- action. Two tabs is exactly when application-side uniqueness fails, and this is the same
-- reasoning as `unique (attendee_id, session_id)` on activity_bookings.
create unique index activity_change_requests_one_open
  on activity_change_requests (attendee_id, activity_id)
  where status = 'pending';

-- The desk's queue: one activity's pending rows, oldest first.
create index activity_change_requests_activity_idx
  on activity_change_requests (activity_id, status, created_at);

-- The portal's hot path: this attendee's own requests.
create index activity_change_requests_attendee_idx
  on activity_change_requests (attendee_id, status);

-- Enabled with no policies, as every table since 0001_init.sql: only the service role,
-- which bypasses RLS, may touch data. The anon key travels in the client bundle.
alter table activity_change_requests enable row level security;
```

No `org_id`, matching `activity_sessions` and `activity_bookings`: every query scopes by `event_id`, and admin access is gated by `requireEvent(eventId, orgId)`.

- [ ] **Step 2: Add the types**

Append to `src/lib/types.ts`:

```ts
export type ActivityRequestKind = "switch" | "cancel";
export type ActivityRequestStatus = "pending" | "approved" | "declined" | "withdrawn";

/**
 * A change an attendee has asked for. The booking it refers to does not move until the
 * desk approves it (D143), so this row never affects a seat count on its own.
 */
export type ActivityChangeRequest = {
  id: string;
  event_id: string;
  activity_id: string;
  attendee_id: string;
  kind: ActivityRequestKind;
  /** The booking they hold now. */
  from_session_id: string;
  /** Where they want to go. Null for a cancel — the database enforces the pairing. */
  to_session_id: string | null;
  status: ActivityRequestStatus;
  created_at: string;
  decided_at: string | null;
  /** An `auth.users` id, as `checkins.scanned_by` is. */
  decided_by: string | null;
};
```

- [ ] **Step 3: Apply the migration**

Load the Supabase MCP tools in ONE call:

`ToolSearch` query: `select:mcp__0687aa52-4553-40db-b867-72024a86f547__apply_migration,mcp__0687aa52-4553-40db-b867-72024a86f547__execute_sql`

Project `orange_lobby`, ref `wfmqwwcolfigjylkgrsv` — the only one, holding test data. Apply as `0019_activity_change_requests`.

- [ ] **Step 4: Prove the two constraints actually refuse bad rows**

The partial unique index and the kind/to_session check are load-bearing — they are what the application is allowed to stop checking. Run this with `execute_sql` and report the actual output:

```sql
do $$
declare
  v_org uuid; v_event uuid; v_act uuid; v_s1 uuid; v_s2 uuid; v_att uuid;
  v_tok text := left(replace(gen_random_uuid()::text, '-', ''), 16);
  v_err text;
begin
  select id into v_org from organisations limit 1;
  insert into events (org_id, slug, name, status)
    values (v_org, 'req-check-' || v_tok, 'Request constraint check', 'draft') returning id into v_event;
  insert into activities (org_id, event_id, name, booking_open) values (v_org, v_event, 'A', true) returning id into v_act;
  insert into activity_sessions (event_id, activity_id, title, day, starts_at, capacity)
    values (v_event, v_act, 'S1', current_date, '09:00', 5) returning id into v_s1;
  insert into activity_sessions (event_id, activity_id, title, day, starts_at, capacity)
    values (v_event, v_act, 'S2', current_date, '11:00', 5) returning id into v_s2;
  insert into attendees (org_id, event_id, token, name, source)
    values (v_org, v_event, v_tok, 'Req Tester', 'walkin') returning id into v_att;

  insert into activity_change_requests (event_id, activity_id, attendee_id, kind, from_session_id, to_session_id)
    values (v_event, v_act, v_att, 'switch', v_s1, v_s2);
  raise notice 'first_pending -> inserted';

  begin
    insert into activity_change_requests (event_id, activity_id, attendee_id, kind, from_session_id, to_session_id)
      values (v_event, v_act, v_att, 'cancel', v_s1, null);
    raise notice 'second_pending -> INSERTED (BUG)';
  exception when unique_violation then
    raise notice 'second_pending -> refused by unique index';
  end;

  begin
    insert into activity_change_requests (event_id, activity_id, attendee_id, kind, from_session_id, to_session_id)
      values (v_event, v_act, v_att, 'cancel', v_s1, v_s2);
    raise notice 'cancel_with_target -> INSERTED (BUG)';
  exception when check_violation then
    raise notice 'cancel_with_target -> refused by check';
  end;

  begin
    insert into activity_change_requests (event_id, activity_id, attendee_id, kind, from_session_id, to_session_id)
      values (v_event, v_act, v_att, 'switch', v_s1, null);
    raise notice 'switch_without_target -> INSERTED (BUG)';
  exception when check_violation then
    raise notice 'switch_without_target -> refused by check';
  end;

  update activity_change_requests set status = 'withdrawn' where attendee_id = v_att;
  insert into activity_change_requests (event_id, activity_id, attendee_id, kind, from_session_id, to_session_id)
    values (v_event, v_act, v_att, 'switch', v_s1, v_s2);
  raise notice 'after_withdraw -> inserted (index is partial)';

  delete from events where id = v_event;
end $$;
```

Expected, in order: `inserted`, `refused by unique index`, `refused by check`, `refused by check`, `inserted (index is partial)`. Any line containing `BUG` means a constraint is not doing its job — stop and fix the migration.

If `raise notice` output is not visible through the MCP tool, collect the results into a temp table or a returned result set instead, and say in your report how you obtained them.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run lint
git add supabase/migrations/0019_activity_change_requests.sql src/lib/types.ts
git commit -m "feat(activities): a table for change requests the desk decides"
```

---

### Task 2: `switch_session` learns to ignore a closed activity

**Files:**
- Create: `supabase/migrations/0020_switch_session_ignore_open.sql`
- Modify: `scripts/book-session-fixture.sql` (append a section)

**Interfaces:**
- Consumes: `switch_session(uuid, uuid, uuid)` from `0017_book_session.sql`.
- Produces: `switch_session(p_from_session uuid, p_to_session uuid, p_attendee_id uuid, p_ignore_open boolean default false) returns text`. The three-argument signature no longer exists.

Read `supabase/migrations/0017_book_session.sql` in full before starting. You are replacing a function that is live, and its grant block documents a trap you are about to walk into.

- [ ] **Step 1: Understand why this is needed**

`0017_book_session.sql:160` refuses a switch whenever `booking_open` is false. The desk closes booking at the headcount cut-off — which is the exact moment this feature's approval gate matters — and every pending switch in the queue would become un-approvable. `book_session` already carries `p_ignore_open` for the same reason (D130). `cancel_booking` needs nothing, because it never reads `booking_open`.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/0020_switch_session_ignore_open.sql`:

```sql
-- switch_session gains p_ignore_open, so the desk can approve a queued switch after booking
-- has closed (D156).
--
-- Without this the feature defeats itself: closing booking is what the desk does when the
-- headcount is committed, and that is precisely when the request queue needs working.
--
-- THE SIGNATURE CHANGE IS THIS MIGRATION'S WHOLE RISK. Postgres keys a function by its
-- argument list, so `create or replace` with a fourth argument creates a SECOND function
-- rather than replacing the first. The old three-argument one must be dropped explicitly, or
-- both exist and which one runs depends on how the caller names its arguments.
--
-- And the new signature is a new object with no inherited grants: Supabase provisions every
-- project with `alter default privileges in schema public grant execute on functions to
-- anon, authenticated, service_role`, which fires at CREATE time. Revoking from `public`
-- alone does not remove those direct grants — 0017 documents this the hard way. Both roles
-- must be named.
drop function if exists switch_session(uuid, uuid, uuid);

create or replace function switch_session(
  p_from_session uuid,
  p_to_session uuid,
  p_attendee_id uuid,
  p_ignore_open boolean default false
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
  if s_from.activity_id <> s_to.activity_id then return 'missing'; end if;

  if not exists (
    select 1 from activity_bookings
     where session_id = p_from_session and attendee_id = p_attendee_id
  ) then return 'missing'; end if;

  -- NOT `for update`, unlike book_session and cancel_booking. Both of this function's
  -- sessions belong to one activity, so the per-attendee count cannot move and there is
  -- nothing for an activity-row lock to serialise. Copy this line from 0017 rather than
  -- from here, and do not add a lock it does not need.
  select * into a from activities where id = s_to.activity_id;
  if not found then return 'missing'; end if;
  select * into att from attendees where id = p_attendee_id;
  if not found or att.event_id <> s_to.event_id then return 'missing'; end if;

  -- The desk approving a queued request passes true; an attendee's own path no longer
  -- exists, since switching is a request now (D145). Capacity and eligibility below are
  -- NOT bypassed by it.
  if not p_ignore_open and not a.booking_open then return 'closed'; end if;

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
  values (s_to.event_id, a.id, s_to.id, p_attendee_id)
  on conflict (attendee_id, session_id) do nothing;

  return 'ok';
end;
$$;

revoke execute on function switch_session(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function switch_session(uuid, uuid, uuid, boolean) to service_role;
```

Copy the body from `0017_book_session.sql` rather than retyping it from this plan, and diff the two so the only differences are the new parameter and the `p_ignore_open and` on the closed check. Every other line — the two session locks in id order, the activity lock, the ordering of the refusals above the mutation — is load-bearing and was got wrong twice before it was got right.

- [ ] **Step 3: Apply it, then prove the old signature is gone and the new one is locked down**

```sql
select p.oid::regprocedure::text as signature,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('service_role', p.oid, 'execute') as service_role
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'switch_session';
```

Expected: exactly ONE row, `switch_session(uuid,uuid,uuid,boolean)`, with `anon` and `authenticated` false and `service_role` true. Two rows means the drop did not happen and two functions are live.

- [ ] **Step 4: Prove the new parameter does what it exists for**

Append a section to `scripts/book-session-fixture.sql` following the file's existing style: an activity with `booking_open = false`, an attendee holding session A, then

- `switch_session(A, B, attendee)` → expect `closed`
- `switch_session(A, B, attendee, true)` → expect `ok`
- and afterwards, the attendee holds B and not A.

Then re-run the whole fixture and confirm every pre-existing section still reports what it did before.

- [ ] **Step 5: Commit**

```bash
npm run lint
git add supabase/migrations/0020_switch_session_ignore_open.sql scripts/book-session-fixture.sql
git commit -m "feat(activities): the desk can approve a switch after booking closes"
```

---

### Task 3: The request state machine

**Files:**
- Create: `src/lib/activity-requests.ts`
- Create: `tests/activity-requests.test.ts`

**Interfaces:**
- Consumes: `ActivityState`, `SeatsForViewer` from `@/lib/activities`; `ActivityChangeRequest`, `Activity` from `@/lib/types`.
- Produces, from `@/lib/activity-requests`:
  - `pendingFor(requests: ActivityChangeRequest[], activityId: string): ActivityChangeRequest | null`
  - `lastDeclinedFor(requests: ActivityChangeRequest[], activityId: string): ActivityChangeRequest | null`
  - `activityControls(state: ActivityState, pending: ActivityChangeRequest | null, lastDeclined?: ActivityChangeRequest | null): ActivityControls`
  - `pendingCountByActivity(requests: ActivityChangeRequest[]): Record<string, number>`
  - types `ActivityControls`, `PendingSummary`

This module is pure: no I/O, no `server-only`, no clock. It decides what a screen offers; it never decides what the database allows.

- [ ] **Step 1: Write the failing tests**

Create `tests/activity-requests.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pendingFor, lastDeclinedFor, activityControls, pendingCountByActivity } from "@/lib/activity-requests";
import { activityState } from "@/lib/activities";
import type { Activity, ActivityChangeRequest, ActivitySession } from "@/lib/types";

const activity = (over: Partial<Activity> = {}): Activity => ({
  id: "act1", org_id: "o", event_id: "e", name: "Workshops", description: null,
  required: false, booking_open: true, max_per_attendee: 1, categories: null, sort_order: 0, ...over,
});
const session = (id: string, over: Partial<ActivitySession> = {}): ActivitySession => ({
  id, event_id: "e", activity_id: "act1", title: id, day: "2026-10-01", starts_at: "09:30",
  ends_at: "11:00", location: "Room 2A", capacity: 30, sort_order: 0, ...over,
});
const request = (over: Partial<ActivityChangeRequest> = {}): ActivityChangeRequest => ({
  id: "req1", event_id: "e", activity_id: "act1", attendee_id: "att1", kind: "switch",
  from_session_id: "s1", to_session_id: "s2", status: "pending",
  created_at: "2026-09-21T02:00:00Z", decided_at: null, decided_by: null, ...over,
});
const state = (over: { activity?: Activity; mine?: string[]; counts?: Record<string, number> } = {}) =>
  activityState({
    activity: over.activity ?? activity(),
    sessions: [session("s1"), session("s2", { starts_at: "11:30" })],
    counts: over.counts ?? {},
    mine: new Set(over.mine ?? []),
    category: null,
  });

describe("pendingFor", () => {
  it("finds this activity's open request", () => {
    const rs = [request({ id: "other", activity_id: "act2" }), request()];
    expect(pendingFor(rs, "act1")?.id).toBe("req1");
  });

  it("ignores a decided request", () => {
    expect(pendingFor([request({ status: "approved" })], "act1")).toBeNull();
    expect(pendingFor([request({ status: "declined" })], "act1")).toBeNull();
    expect(pendingFor([request({ status: "withdrawn" })], "act1")).toBeNull();
  });
});

describe("activityControls", () => {
  it("offers Book on a free session when nothing is held", () => {
    const c = activityControls(state(), null);
    expect(c.bookable.map((s) => s.session.id)).toEqual(["s1", "s2"]);
    expect(c.holding).toBeNull();
    expect(c.switchTargets).toEqual([]);
    expect(c.canRequestCancel).toBe(false);
  });

  it("names the held session and offers the others as switch targets", () => {
    const c = activityControls(state({ mine: ["s1"] }), null);
    expect(c.holding?.session.id).toBe("s1");
    expect(c.switchTargets.map((s) => s.session.id)).toEqual(["s2"]);
    expect(c.bookable).toEqual([]);
  });

  // D148: a required activity's cancel never reaches the queue, so the control is absent.
  it("offers no cancel on a required activity", () => {
    expect(activityControls(state({ activity: activity({ required: true }), mine: ["s1"] }), null).canRequestCancel).toBe(false);
    expect(activityControls(state({ mine: ["s1"] }), null).canRequestCancel).toBe(true);
  });

  it("never offers a full session as a switch target", () => {
    const c = activityControls(state({ mine: ["s1"], counts: { s2: 30 } }), null);
    expect(c.switchTargets).toEqual([]);
  });

  // D143 and §7.4: while a request is open, nothing that changes a seat is offered.
  it("withholds every control while a request is pending", () => {
    const c = activityControls(state({ mine: ["s1"] }), request());
    expect(c.bookable).toEqual([]);
    expect(c.switchTargets).toEqual([]);
    expect(c.canRequestCancel).toBe(false);
    expect(c.pending).toEqual({ kind: "switch", fromTitle: "s1", toTitle: "s2" });
  });

  it("summarises a pending cancel with no target", () => {
    const c = activityControls(state({ mine: ["s1"] }), request({ kind: "cancel", to_session_id: null }));
    expect(c.pending).toEqual({ kind: "cancel", fromTitle: "s1", toTitle: null });
  });

  // The request outlives the session it names only until the cascade runs, but a page can
  // render in between. Falling back to the id would show a uuid to an attendee.
  it("survives a pending request naming a session that is gone", () => {
    const c = activityControls(state({ mine: ["s1"] }), request({ to_session_id: "vanished" }));
    expect(c.pending).toEqual({ kind: "switch", fromTitle: "s1", toTitle: null });
  });

  it("offers nothing bookable when the activity is closed", () => {
    const c = activityControls(state({ activity: activity({ booking_open: false }) }), null);
    expect(c.bookable).toEqual([]);
  });

  // D157: asking is not taking a seat, so a closed activity still accepts a request.
  it("still offers a switch when booking is closed", () => {
    const c = activityControls(state({ activity: activity({ booking_open: false }), mine: ["s1"] }), null);
    expect(c.switchTargets.map((s) => s.session.id)).toEqual(["s2"]);
    expect(c.canRequestCancel).toBe(true);
  });
});

// D153a: an approval announces itself — they are simply booked on the new session now. A
// decline leaves no trace, so the pending block vanishing would read as the request having
// been lost. This is the only thing that tells them the desk said no.
describe("lastDeclinedFor", () => {
  it("finds the most recent decline for this activity", () => {
    const rs = [
      request({ id: "old", status: "declined", decided_at: "2026-09-21T01:00:00Z" }),
      request({ id: "new", status: "declined", decided_at: "2026-09-21T03:00:00Z" }),
    ];
    expect(lastDeclinedFor(rs, "act1")?.id).toBe("new");
  });

  it("ignores approvals, withdrawals and other activities", () => {
    expect(lastDeclinedFor([request({ status: "approved" })], "act1")).toBeNull();
    expect(lastDeclinedFor([request({ status: "withdrawn" })], "act1")).toBeNull();
    expect(lastDeclinedFor([request({ status: "declined", activity_id: "act2" })], "act1")).toBeNull();
  });
});

describe("activityControls with a decline to report", () => {
  it("reports the decline when nothing is pending", () => {
    const declined = request({ status: "declined", decided_at: "2026-09-21T03:00:00Z" });
    const c = activityControls(state({ mine: ["s1"] }), null, declined);
    expect(c.declined).toEqual({ kind: "switch", fromTitle: "s1", toTitle: "s2" });
    // The controls are otherwise untouched — a decline is news, not a restriction.
    expect(c.switchTargets.map((s) => s.session.id)).toEqual(["s2"]);
  });

  it("says nothing about an old decline once a new request is open", () => {
    const declined = request({ id: "old", status: "declined", decided_at: "2026-09-21T03:00:00Z" });
    const c = activityControls(state({ mine: ["s1"] }), request(), declined);
    expect(c.declined).toBeNull();
    expect(c.pending).not.toBeNull();
  });
});

describe("pendingCountByActivity", () => {
  it("counts only open requests, per activity", () => {
    const rs = [
      request({ id: "a" }),
      request({ id: "b" }),
      request({ id: "c", activity_id: "act2" }),
      request({ id: "d", status: "approved" }),
    ];
    expect(pendingCountByActivity(rs)).toEqual({ act1: 2, act2: 1 });
  });

  it("is empty when nothing is pending", () => {
    expect(pendingCountByActivity([request({ status: "declined" })])).toEqual({});
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/activity-requests.test.ts`
Expected: FAIL — the module `@/lib/activity-requests` does not resolve.

- [ ] **Step 3: Write the module**

Create `src/lib/activity-requests.ts`:

```ts
import type { ActivityState, SeatsForViewer } from "@/lib/activities";
import type { ActivityChangeRequest } from "@/lib/types";

/**
 * What an attendee's Activities card offers, given what they hold and what they have asked
 * for.
 *
 * Kept apart from `activityState` because the two answer different questions: that one is
 * about seats, this one is about permission to change. It also keeps `src/lib/activities.ts`
 * from taking on a third concern — it already holds seat derivation and form reading.
 */
export type PendingSummary = {
  kind: ActivityChangeRequest["kind"];
  /** The session they hold. Null only if it has been deleted under them. */
  fromTitle: string | null;
  /** Where they asked to go; null for a cancel, or if that session has been deleted. */
  toTitle: string | null;
};

export type ActivityControls = {
  /** Sessions offering a Book button. Empty while a request is open, or when at the cap. */
  bookable: SeatsForViewer[];
  /** The session this attendee holds, stated once below the sessions rather than inline. */
  holding: SeatsForViewer | null;
  /** Sessions they could ask to move to: not theirs, not full. Empty while a request is open. */
  switchTargets: SeatsForViewer[];
  canRequestCancel: boolean;
  pending: PendingSummary | null;
  /** The most recent decline to report, or null. See D153a. */
  declined: PendingSummary | null;
};

/** This activity's open request, or null. At most one exists — the database enforces it (D146). */
export function pendingFor(
  requests: ActivityChangeRequest[],
  activityId: string,
): ActivityChangeRequest | null {
  return requests.find((r) => r.activity_id === activityId && r.status === "pending") ?? null;
}

/**
 * The latest decline for this activity, which is the only outcome the card has to report.
 *
 * An approval needs no announcement — the attendee is booked on the session they asked for
 * and the card already says so. A decline would otherwise be invisible: the pending block
 * vanishes and the card looks exactly as it did before they asked (D153a).
 */
export function lastDeclinedFor(
  requests: ActivityChangeRequest[],
  activityId: string,
): ActivityChangeRequest | null {
  return requests
    .filter((r) => r.activity_id === activityId && r.status === "declined")
    .sort((a, b) => (a.decided_at ?? "").localeCompare(b.decided_at ?? ""))
    .at(-1) ?? null;
}

export function activityControls(
  state: ActivityState,
  pending: ActivityChangeRequest | null,
  lastDeclined: ActivityChangeRequest | null = null,
): ActivityControls {
  const titleOf = (id: string | null): string | null =>
    (id ? state.sessions.find((s) => s.session.id === id)?.session.title ?? null : null);
  const summarise = (r: ActivityChangeRequest): PendingSummary =>
    ({ kind: r.kind, fromTitle: titleOf(r.from_session_id), toTitle: titleOf(r.to_session_id) });

  const holding = state.sessions.find((s) => s.mine) ?? null;

  // While a request is open, nothing that changes a seat is offered (§7.4). Book is
  // withheld too, not only the change controls: on an activity allowing more than one
  // session, taking a second seat while asking to move the first hands the desk a request
  // whose meaning has changed under them. Withdraw is always one tap away.
  if (pending) {
    // An open request is the latest word on the subject, so an older decline is no longer
    // news and saying both at once would be noise.
    return {
      bookable: [],
      holding,
      switchTargets: [],
      canRequestCancel: false,
      pending: summarise(pending),
      declined: null,
    };
  }

  return {
    declined: lastDeclined ? summarise(lastDeclined) : null,
    bookable: state.canBookMore ? state.sessions.filter((s) => !s.mine && !s.full) : [],
    holding,
    // Asking is not taking a seat, so a closed activity still offers this (D157). A full
    // session is never offered, because the approval would be refused (D144) and the desk
    // would be deciding on something that cannot happen.
    switchTargets: holding ? state.sessions.filter((s) => !s.mine && !s.full) : [],
    // D148: a required activity's cancel never reaches the queue.
    canRequestCancel: Boolean(holding) && !state.activity.required,
    pending: null,
  };
}

/**
 * Open requests per activity id, for the count beside each row of the admin's activity list.
 *
 * An activity with none is absent rather than zero, so the caller writes `counts[id] ?? 0`
 * and a zero never renders as a badge.
 */
export function pendingCountByActivity(requests: ActivityChangeRequest[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of requests) {
    if (r.status !== "pending") continue;
    out[r.activity_id] = (out[r.activity_id] ?? 0) + 1;
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/activity-requests.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Run the full suite and commit**

```bash
npm test
npm run lint
git add src/lib/activity-requests.ts tests/activity-requests.test.ts
git commit -m "feat(activities): the state machine behind request, switch and withdraw"
```

---

### Task 4: The requests database module

**Files:**
- Create: `src/lib/db/activity-requests.ts`
- Modify: `src/lib/db/activities.ts` — `switchSession` gains a fourth parameter

**Interfaces:**
- Consumes: `serviceClient()`; `switchSession`, `cancelBooking`, and the `BookResult` type from `@/lib/db/activities`.
- Produces, from `@/lib/db/activity-requests`:
  - `listRequests(eventId: string): Promise<ActivityChangeRequest[]>`
  - `requestsForAttendee(attendeeId: string): Promise<ActivityChangeRequest[]>`
  - `getRequest(id: string, eventId: string): Promise<ActivityChangeRequest | null>`
  - `createRequest(input: NewRequest): Promise<"ok" | "duplicate">`
  - `withdrawRequest(id: string, attendeeId: string): Promise<boolean>`
  - `markDecided(id: string, eventId: string, status: "approved" | "declined", userId: string): Promise<boolean>`
  - `applyRequest(request: ActivityChangeRequest): Promise<BookResult>`
  - type `NewRequest`
- Also produces, from `@/lib/db/activities`:
  - `switchSession(fromSessionId: string, toSessionId: string, attendeeId: string, ignoreOpen?: boolean): Promise<BookResult>` — the fourth parameter defaults to `false` and is passed to the rpc as `p_ignore_open`, so no existing caller changes behaviour.

Read `src/lib/db/activities.ts` first and follow it exactly: `import "server-only"`, `serviceClient()`, errors thrown rather than swallowed, every query scoped by the id that proves ownership.

- [ ] **Step 1: Write the module**

Create `src/lib/db/activity-requests.ts`:

```ts
import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { switchSession, cancelBooking } from "@/lib/db/activities";
import type { BookResult } from "@/lib/db/activities";
import type { ActivityChangeRequest } from "@/lib/types";

export type NewRequest = {
  eventId: string;
  activityId: string;
  attendeeId: string;
  fromSessionId: string;
  /** Null makes it a cancel. The database rejects the mismatched pairings. */
  toSessionId: string | null;
};

export async function listRequests(eventId: string): Promise<ActivityChangeRequest[]> {
  const { data, error } = await serviceClient().from("activity_change_requests").select("*")
    .eq("event_id", eventId).order("created_at");
  if (error) throw error;
  return (data ?? []) as ActivityChangeRequest[];
}

/** This attendee's requests. The portal's hot path — one query, one attendee. */
export async function requestsForAttendee(attendeeId: string): Promise<ActivityChangeRequest[]> {
  const { data, error } = await serviceClient().from("activity_change_requests").select("*")
    .eq("attendee_id", attendeeId).order("created_at");
  if (error) throw error;
  return (data ?? []) as ActivityChangeRequest[];
}

export async function getRequest(id: string, eventId: string): Promise<ActivityChangeRequest | null> {
  const { data, error } = await serviceClient().from("activity_change_requests").select("*")
    .eq("id", id).eq("event_id", eventId).maybeSingle();
  if (error) throw error;
  return (data as ActivityChangeRequest | null) ?? null;
}

/**
 * Raises a request, or reports that one is already open.
 *
 * "One open request per attendee per activity" is a partial unique index, not a check here
 * (D146): two tabs is exactly when an application-side check fails. 23505 is the unique
 * violation, and it is an answer rather than an error — the attendee has a request open and
 * the page should say so.
 */
export async function createRequest(input: NewRequest): Promise<"ok" | "duplicate"> {
  const { error } = await serviceClient().from("activity_change_requests").insert({
    event_id: input.eventId,
    activity_id: input.activityId,
    attendee_id: input.attendeeId,
    kind: input.toSessionId ? "switch" : "cancel",
    from_session_id: input.fromSessionId,
    to_session_id: input.toSessionId,
  });
  if (error?.code === "23505") return "duplicate";
  if (error) throw error;
  return "ok";
}

/**
 * The attendee's own escape. Scoped by attendee as well as id, so a posted id belonging to
 * somebody else withdraws nothing, and by status so a decided request cannot be un-decided.
 */
export async function withdrawRequest(id: string, attendeeId: string): Promise<boolean> {
  const { data, error } = await serviceClient().from("activity_change_requests")
    .update({ status: "withdrawn", decided_at: new Date().toISOString() })
    .eq("id", id).eq("attendee_id", attendeeId).eq("status", "pending").select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/**
 * Stamps the decision. Scoped by `status = 'pending'` so two desks clicking Approve at once
 * cannot both record a decision — the second updates no rows and the caller reports that.
 *
 * This does NOT move the booking. The caller has already called switch_session or
 * cancel_booking and only reaches here on 'ok' (D154).
 */
export async function markDecided(
  id: string,
  eventId: string,
  status: "approved" | "declined",
  userId: string,
): Promise<boolean> {
  const { data, error } = await serviceClient().from("activity_change_requests")
    .update({ status, decided_at: new Date().toISOString(), decided_by: userId })
    .eq("id", id).eq("event_id", eventId).eq("status", "pending").select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/**
 * Carries out an approved request against the database, without recording anything.
 *
 * Goes through the locked functions rather than writing bookings itself (D154): they are the
 * only callers that hold the session and activity row locks, and an approval that bypassed
 * them would be the one path in the system that can overbook. `ignoreOpen` is true because
 * the desk works the queue after booking has closed (D156) — it does not bypass capacity.
 */
export async function applyRequest(request: ActivityChangeRequest): Promise<BookResult> {
  return request.kind === "switch" && request.to_session_id
    ? switchSession(request.from_session_id, request.to_session_id, request.attendee_id, true)
    : cancelBooking(request.from_session_id, request.attendee_id);
}
```

In `src/lib/db/activities.ts`, widen `switchSession` in the same commit:

```ts
export async function switchSession(
  fromSessionId: string,
  toSessionId: string,
  attendeeId: string,
  ignoreOpen = false,
): Promise<BookResult> {
  const { data, error } = await serviceClient().rpc("switch_session", {
    p_from_session: fromSessionId, p_to_session: toSessionId,
    p_attendee_id: attendeeId, p_ignore_open: ignoreOpen,
  });
  if (error) throw error;
  return data as BookResult;
}
```

The default keeps every existing caller unchanged. To be precise about why this is safe: the SQL parameter also has a default, so a call that omitted `p_ignore_open` would still resolve to the four-argument function and get `false` — passing it explicitly is for legibility at the call site, not to avoid a resolution failure.

- [ ] **Step 2: Verify**

Run `npm run lint` and `npx next build`. There are no unit tests for this module by design — each function is a single query, and the logic that could be wrong lives in `src/lib/activity-requests.ts` and in the database functions.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/activity-requests.ts src/lib/db/activities.ts
git commit -m "feat(activities): queries for change requests, and the rpc that applies one"
```

---

### Task 5: The attendee page reads clearly

**Files:**
- Modify: `src/components/admin/ConfirmButton.tsx`
- Modify: `src/components/portal/ActivityList.tsx`

This task is the three clarity fixes, with today's direct switch and cancel still in place. Task 6 replaces those with requests. Splitting it this way keeps a reviewable diff for the visual change and another for the behaviour change.

**Interfaces:**
- Consumes: `ActivityState` from `@/lib/activities`.
- Produces: `ConfirmButton` gains `tone?: "default" | "destructive"` and `triggerVariant?: React.ComponentProps<typeof Button>["variant"]`, both defaulting to today's behaviour.

- [ ] **Step 1: Give ConfirmButton a non-destructive tone**

`ConfirmButton` always renders an outline trigger and a red confirm, which is right for Delete and wrong for Book. Add two optional props, defaulting so every existing call site renders byte-identically:

```tsx
export function ConfirmButton({
  message, children, className = "", confirmLabel = "Yes, continue",
  tone = "destructive", triggerVariant = "outline",
}: {
  message: string;
  children: React.ReactNode;
  className?: string;
  confirmLabel?: string;
  /** "destructive" paints the confirm red, for anything that removes something. */
  tone?: "default" | "destructive";
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
}) {
```

Use `triggerVariant` on the `AlertDialogTrigger`'s `Button`, and give `AlertDialogAction` the red classes only when `tone === "destructive"`. Read the file's doc comment first — it explains why the confirm cannot be a `type="submit"` button and why the trigger is the way back into the form. Do not change that mechanism.

- [ ] **Step 2: Rework the session row**

In `src/components/portal/ActivityList.tsx`, each session row keeps its time column and title, and changes in three ways:

- The seats-left count moves out of the muted location line into its own element beside the title, at `text-sm font-bold`. Use `text-warning` when `left <= 3` and `text-muted-foreground` otherwise. `Full` keeps the pill it has today. The location stays in the muted line on its own:

```tsx
<div className="min-w-0 flex-1">
  <div className="flex flex-wrap items-baseline gap-x-2">
    <span className="text-[15px] font-bold">{session.title}</span>
    {!mine && !full && (
      <span className={`text-sm font-bold tabular-nums ${left <= 3 ? "text-warning" : "text-muted-foreground"}`}>
        {left} left
      </span>
    )}
  </div>
  <div className="text-xs text-muted-foreground">
    {mine ? "You are booked" : session.location}
  </div>
</div>
```
- Book becomes a `ConfirmButton` inside the existing form, with `tone="default"`, `triggerVariant="default"`, `confirmLabel="Book"` and a message naming the session, its day, its time and its room — for example `Book Design sprint basics, Thu 1 Oct, 09:30–11:00, Room 2A?`. Use `shortDate` from `@/lib/text` for the day, as `AgendaList` does.
- The `mine`, `canCancel`, `heldOne` and `switchTo` branches leave the row entirely. A row that is the attendee's own says "You are booked" in its muted line and offers no control; the controls move to Task 6's component.

Keep `state.closed`'s explanatory line and the `Full` pill exactly as they are.

- [ ] **Step 3: Verify in the browser pane**

Seed a live event, an attendee and an activity with two sessions using the Supabase MCP tool (`ToolSearch` query: `select:mcp__0687aa52-4553-40db-b867-72024a86f547__execute_sql`, project `orange_lobby`, ref `wfmqwwcolfigjylkgrsv`). Use a unique slug and unique tokens — `attendees.token` is globally unique. Give one session a capacity of 2 so you can see the warning treatment.

`preview_start` with `{name: "dev"}`, then at a 375px viewport confirm: the seat count is legible at a glance, a session at 2 left reads in the warning colour, tapping Book opens a confirmation naming the session, cancelling the dialog books nothing, and confirming it books. Screenshot the confirmation. Delete your seed data afterwards and confirm zero rows remain.

- [ ] **Step 4: Commit**

```bash
npm test
npm run lint
npx next build
git add src/components/admin/ConfirmButton.tsx src/components/portal/ActivityList.tsx
git commit -m "feat(portal): seats you can read, and a confirmation before a seat is taken"
```

---

### Task 6: Switch and cancel become requests

**Files:**
- Create: `src/components/portal/ActivityBooking.tsx`
- Modify: `src/app/e/[slug]/a/[token]/activities/actions.ts`
- Modify: `src/app/e/[slug]/a/[token]/activities/page.tsx`
- Modify: `src/components/portal/ActivityList.tsx` (render the new component)

**Interfaces:**
- Consumes: `activityControls`, `pendingFor` from `@/lib/activity-requests`; `createRequest`, `withdrawRequest`, `requestsForAttendee` from `@/lib/db/activity-requests`.
- Produces: `requestSwitchAction(slug, token, fromSessionId, fd: FormData)` (the target arrives as the form's `to` field), `requestCancelAction(slug, token, fromSessionId)`, `withdrawRequestAction(slug, token, requestId)`. `switchAction` and `cancelAction` are deleted.

Read `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` before touching the actions file.

- [ ] **Step 1: Replace the two actions**

In `src/app/e/[slug]/a/[token]/activities/actions.ts`, delete `switchAction` and `cancelAction` and add the three below. Keep `bookAction` exactly as it is. The existing `REFUSALS` map, the `ARCHIVED` constant, the `allow()` rate limit and the archived-event guards stay; note that the archived guard belongs on the two request actions for the same reason it is on `bookAction`, and stays off `withdrawRequestAction`, which only releases something.

```ts
const ASK_REFUSALS = {
  duplicate: "You already have a change waiting for approval. Withdraw it first.",
  missing: "That session is no longer on the programme.",
  notYours: "You are not booked on that session.",
  required: "This activity needs a choice. Ask to switch instead.",
} as const;

export async function requestSwitchAction(slug: string, token: string, fromSessionId: string, fd: FormData) {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const path = `/e/${slug}/a/${token}/activities`;
  if (event.status === "archived") redirect(flashPath(path, ARCHIVED, "error"));
  if (!allow(`book:${token}`, 20, 60_000)) {
    redirect(flashPath(path, "Too many attempts. Try again in a minute.", "error"));
  }

  // The target comes from the form's own select, not from a bound argument: a form action
  // receives FormData and nothing else.
  const toSessionId = String(fd.get("to") ?? "");
  const sessions = await listSessions(event.id);
  const from = sessions.find((s) => s.id === fromSessionId);
  const to = sessions.find((s) => s.id === toSessionId);
  // Both event-scoped, and both must belong to one activity — a switch across activities is
  // two decisions, not one, and the database would refuse it at approval time anyway.
  if (!from || !to || from.activity_id !== to.activity_id) {
    redirect(flashPath(path, ASK_REFUSALS.missing, "error"));
  }

  // Re-checked rather than trusted from the page: a second tab still has a live button.
  const holds = (await bookingsForAttendee(attendee.id)).some((b) => b.session_id === from.id);
  if (!holds) redirect(flashPath(path, ASK_REFUSALS.notYours, "error"));

  const result = await createRequest({
    eventId: event.id, activityId: from.activity_id, attendeeId: attendee.id,
    fromSessionId: from.id, toSessionId: to.id,
  });
  redirect(result === "ok"
    ? flashPath(path, `Asked to move to ${to.title}. The desk will confirm.`)
    : flashPath(path, ASK_REFUSALS.duplicate, "error"));
}

export async function requestCancelAction(slug: string, token: string, fromSessionId: string) {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const path = `/e/${slug}/a/${token}/activities`;
  if (event.status === "archived") redirect(flashPath(path, ARCHIVED, "error"));
  if (!allow(`book:${token}`, 20, 60_000)) {
    redirect(flashPath(path, "Too many attempts. Try again in a minute.", "error"));
  }

  const sessions = await listSessions(event.id);
  const from = sessions.find((s) => s.id === fromSessionId);
  if (!from) redirect(flashPath(path, ASK_REFUSALS.missing, "error"));

  const holds = (await bookingsForAttendee(attendee.id)).some((b) => b.session_id === from.id);
  if (!holds) redirect(flashPath(path, ASK_REFUSALS.notYours, "error"));

  // D148: a required activity's cancel never reaches the queue. The control is hidden, and
  // this is the check that makes hiding it enforcement rather than decoration.
  const activity = await getActivity(from.activity_id, event.id);
  if (!activity) redirect(flashPath(path, ASK_REFUSALS.missing, "error"));
  if (activity.required) redirect(flashPath(path, ASK_REFUSALS.required, "error"));

  const result = await createRequest({
    eventId: event.id, activityId: activity.id, attendeeId: attendee.id,
    fromSessionId: from.id, toSessionId: null,
  });
  redirect(result === "ok"
    ? flashPath(path, `Asked to cancel ${from.title}. The desk will confirm.`)
    : flashPath(path, ASK_REFUSALS.duplicate, "error"));
}

export async function withdrawRequestAction(slug: string, token: string, requestId: string) {
  const { attendee } = await loadPortalAttendee(slug, token);
  const path = `/e/${slug}/a/${token}/activities`;
  if (!allow(`book:${token}`, 20, 60_000)) {
    redirect(flashPath(path, "Too many attempts. Try again in a minute.", "error"));
  }
  // Scoped by attendee inside the query, so a posted id belonging to somebody else
  // withdraws nothing and says so.
  const gone = await withdrawRequest(requestId, attendee.id);
  redirect(gone
    ? flashPath(path, "Request withdrawn.")
    : flashPath(path, "That request is no longer waiting.", "error"));
}
```

Add `bookingsForAttendee` and `getActivity` to the existing import from `@/lib/db/activities`, and `createRequest`/`withdrawRequest` from `@/lib/db/activity-requests`.

- [ ] **Step 2: Write the booking component**

Create `src/components/portal/ActivityBooking.tsx`. It renders below an activity's sessions and is the only place a seat the attendee already holds can be acted on. It reimplements no rule — `activityControls` decides what to offer, this draws it.

```tsx
import type { ActivityControls } from "@/lib/activity-requests";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { SubmitButton } from "@/components/admin/SubmitButton";

/**
 * The attendee's own seat in one activity, and the only controls that act on it.
 *
 * Separated from the session rows deliberately: the control that undoes your afternoon used
 * to sit in the same column, in the same shape, as the control that booked it. Here there is
 * one statement of what you hold and one place to change it.
 */
export function ActivityBooking({ controls, requestSwitch, requestCancel, withdraw }: {
  controls: ActivityControls;
  requestSwitch: (fromSessionId: string, toSessionId: string) => Promise<void>;
  requestCancel: (fromSessionId: string) => Promise<void>;
  withdraw: () => Promise<void>;
}) {
  const { holding, pending, declined, switchTargets, canRequestCancel } = controls;
  if (!holding && !pending && !declined) return null;

  if (pending) {
    return (
      <div className="rounded-[12px] bg-accent p-3 text-sm">
        <p className="font-bold text-accent-foreground">
          {pending.kind === "cancel"
            ? `Waiting for approval: cancel ${pending.fromTitle ?? "your session"}`
            : `Waiting for approval: move to ${pending.toTitle ?? "another session"}`}
        </p>
        <p className="mt-1 text-muted-foreground">
          Your seat is held until the desk agrees, so nothing has changed yet.
        </p>
        <form action={withdraw} className="mt-2">
          <SubmitButton variant="outline">Withdraw request</SubmitButton>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2.5">
      {/* D153a: an approval needs no announcement — they are simply booked on the session
          they asked for. A decline would otherwise leave no trace at all. */}
      {declined && (
        <p className="text-sm text-warning">
          {declined.kind === "cancel"
            ? `The desk declined your request to cancel ${declined.fromTitle ?? "that session"}.`
            : `The desk declined your request to move to ${declined.toTitle ?? "another session"}.`}
        </p>
      )}
      {holding && (
        <>
          <p className="text-sm font-bold">You are booked on {holding.session.title}.</p>
          {switchTargets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No other session has room right now.</p>
          ) : (
            <form action={requestSwitch.bind(null, holding.session.id)} className="flex flex-wrap items-center gap-2">
              <label htmlFor="to" className="sr-only">Move to</label>
              <select id="to" name="to" className="h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 text-sm">
                {switchTargets.map((t) => (
                  <option key={t.session.id} value={t.session.id}>
                    {t.session.title} · {t.session.starts_at} · {t.left} left
                  </option>
                ))}
              </select>
              <ConfirmButton
                tone="default"
                confirmLabel="Send request"
                message="Your current seat is held until the desk agrees, so nothing changes yet."
              >
                Request switch
              </ConfirmButton>
            </form>
          )}
          {canRequestCancel && (
            <form action={requestCancel.bind(null, holding.session.id)}>
              <ConfirmButton
                tone="default"
                confirmLabel="Send request"
                message={`Ask the desk to cancel ${holding.session.title}? Your seat is held until they agree.`}
              >
                Request cancel
              </ConfirmButton>
            </form>
          )}
        </>
      )}
    </div>
  );
}
```

Two things to get right when wiring it. `requestSwitch` is bound with the from-session only, so the target comes from the form's `to` field — meaning `requestSwitchAction`'s signature is `(slug, token, fromSessionId, fd: FormData)` and it reads `String(fd.get("to") ?? "")`. Adjust the Step 1 action accordingly. And the `ConfirmButton` inside the switch form must be the form's only submit, since its trigger calls `form.requestSubmit()` — read that component's doc comment, which explains why the confirm itself cannot be a submit button.

- [ ] **Step 3: Load requests on the page**

In `src/app/e/[slug]/a/[token]/activities/page.tsx`, add `requestsForAttendee(attendee.id)` to the existing `Promise.all`. Per activity compute

```ts
const pending = pendingFor(requests, activity.id);
const controls = activityControls(state, pending, lastDeclinedFor(requests, activity.id));
```

and pass the state and its controls down. `withdraw` is bound with the pending request's id, which the page has and the component's `PendingSummary` deliberately does not — the summary is for rendering, not for addressing rows. Bind the other two actions the way the old ones were.

- [ ] **Step 4: Verify in the browser pane**

Reseed as in Task 5, with an activity that is NOT required and has two sessions with room. Confirm, at 375px:

1. Booked on one session, the card below the sessions offers Request switch and Request cancel; the rows themselves offer no controls.
2. Requesting a switch shows the confirmation, then the pending block, and Book / Request switch / Request cancel all disappear for that activity.
3. Withdraw returns the card to its booked state and the seat never moved — check the counts did not change at any point.
4. Set `required = true` in SQL: Request cancel is gone, Request switch remains.
5. Set `booking_open = false`: Request switch is still offered (D157), Book is not.
6. Set the pending request's `status` to `'declined'` in SQL and reload: the card reports "The desk declined your request to move to …" and the controls come back. Raise another request and confirm the decline line disappears — an open request is the latest word (D153a).

Delete your seed data and confirm zero rows remain.

- [ ] **Step 5: Commit**

```bash
npm test
npm run lint
npx next build
git add "src/app/e/[slug]/a/[token]/activities" src/components/portal/ActivityBooking.tsx src/components/portal/ActivityList.tsx
git commit -m "feat(portal): switching and cancelling are requests the desk decides"
```

---

### Task 7: The desk's queue

**Files:**
- Create: `src/components/admin/RequestQueue.tsx`
- Modify: `src/app/admin/events/[id]/activities/actions.ts` (append)
- Modify: `src/app/admin/events/[id]/activities/[activityId]/page.tsx`

**Interfaces:**
- Consumes: `listRequests`, `getRequest`, `applyRequest`, `markDecided` from `@/lib/db/activity-requests`; `scannerNames` from `@/lib/db/users`.
- Produces: `approveRequestAction(eventId, activityId, requestId)`, `declineRequestAction(eventId, activityId, requestId)`.

- [ ] **Step 1: Append the two actions**

In `src/app/admin/events/[id]/activities/actions.ts`, reusing its existing `event()` helper:

```ts
/**
 * Carries out a request, or explains why it cannot be.
 *
 * A refusal leaves the request PENDING. The desk has not decided anything — they have been
 * told they cannot do it yet, usually because the target filled while the request waited
 * (D144). Declining is the deliberate act and is a separate control.
 */
export async function approveRequestAction(eventId: string, activityId: string, requestId: string) {
  const ev = await event(eventId);
  const { userId } = await requireAdmin();
  const path = `/admin/events/${eventId}/activities/${activityId}`;
  const request = await getRequest(requestId, ev.id);
  if (!request || request.status !== "pending") {
    redirect(flashPath(path, "That request is no longer waiting.", "error"));
  }

  const result = await applyRequest(request);
  if (result !== "ok") {
    revalidatePath(path);
    redirect(flashPath(path, APPROVE_REFUSALS[result], "error"));
  }

  // Scoped by status inside the query, so two desks approving at once cannot both stamp it.
  const stamped = await markDecided(request.id, ev.id, "approved", userId);
  revalidatePath(path);
  redirect(flashPath(path, stamped ? "Request approved." : "Approved, but somebody decided it first."));
}

export async function declineRequestAction(eventId: string, activityId: string, requestId: string) {
  const ev = await event(eventId);
  const { userId } = await requireAdmin();
  const path = `/admin/events/${eventId}/activities/${activityId}`;
  const stamped = await markDecided(requestId, ev.id, "declined", userId);
  revalidatePath(path);
  redirect(flashPath(path, stamped ? "Request declined." : "That request is no longer waiting.", stamped ? "ok" : "error"));
}
```

with, above them:

```ts
/**
 * Why an approval could not be carried out. `closed` is absent: the approval passes
 * p_ignore_open (D156), so a closed activity never refuses the desk. `required` can only
 * appear when an optional activity was made required after a cancel request was raised.
 */
const APPROVE_REFUSALS: Record<Exclude<BookResult, "ok">, string> = {
  full: "That session is full now, so this cannot be approved. Decline it, or raise the capacity.",
  closed: "Booking is closed for this activity.",
  limit: "They already hold as many sessions as this activity allows.",
  ineligible: "They are no longer eligible for that session.",
  missing: "The session or the booking is gone.",
  required: "This activity is now required, so they cannot be left with no session.",
};
```

`requireAdmin()` is called twice on this path — once inside `event()` and once for `userId`. That is one extra session lookup on a desk action, and it keeps `event()` unchanged for its six existing callers; if you prefer, have `event()` return the whole `AdminContext` instead and update those callers in the same commit, but do not leave two different shapes.

- [ ] **Step 2: Write the queue component**

Create `src/components/admin/RequestQueue.tsx`. Props: the pending requests, a session-title lookup, an attendee-name lookup, the decided requests, the resolved decider emails, and the two bound actions. It renders:

- A heading `Requests · N pending`, or nothing at all when there are neither pending nor decided rows.
- One row per pending request, oldest first: the attendee's name, what they asked for (`Morning → Afternoon` for a switch, `Cancel Afternoon` for a cancel), how long it has been waiting, then **Approve** and **Decline**. Approve is a plain `SubmitButton`; Decline is a `ConfirmButton` with the default destructive tone and a message naming the attendee and what they asked for.
- A `<details>` headed "Show decided" holding the rest: the same description plus the status, when it was decided, and by whom via `scannerNames`. The desk is working the queue, not reading the log.

- [ ] **Step 3: Render it on the activity page**

In the activity detail page, load `listRequests(ev.id)` alongside the existing `Promise.all`, filter to this activity, and render `<RequestQueue …/>` directly above the Sessions card. Build the session-title and attendee-name lookups from data the page already has.

- [ ] **Step 4: Verify**

The admin is login-gated and you cannot sign in — do not attempt to. Run `npm test`, `npm run lint`, `npx next build`, and add to `docs/activities-verification.md`:

```markdown
- [ ] A pending request appears on its activity's page with the attendee, what they asked for, and how long it has waited
- [ ] Approve moves the booking and the request disappears from the queue
- [ ] Approving into a session that filled meanwhile refuses, says the session is full, and leaves the request pending
- [ ] Decline asks for confirmation, leaves the booking alone, and the request moves under "Show decided"
- [ ] "Show decided" names who decided and when
- [ ] Approving a switch works after booking has been closed
```

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/RequestQueue.tsx "src/app/admin/events/[id]/activities" docs/activities-verification.md
git commit -m "feat(admin): approve or decline the changes attendees ask for"
```

---

### Task 8: The pending count on the activity list

**Files:**
- Modify: `src/app/admin/events/[id]/activities/page.tsx`
- Modify: `src/components/admin/ActivityRows.tsx`

**Interfaces:**
- Consumes: `pendingCountByActivity` from `@/lib/activity-requests`; `listRequests` from `@/lib/db/activity-requests`.
- Produces: `ActivityRows` gains a `pending: Record<string, number>` prop.

- [ ] **Step 1: Pass the counts**

Add `listRequests(ev.id)` to the page's `Promise.all`, build `pendingCountByActivity(requests)`, and pass it to `ActivityRows` as `pending`.

- [ ] **Step 2: Render the badge**

In `ActivityRows`, after the open/closed badge, render `{pending[a.id] ? <Badge variant="secondary">{pending[a.id]} waiting</Badge> : null}`. Absent rather than zero, so an activity with nothing waiting looks exactly as it does today.

- [ ] **Step 3: Verify and commit**

```bash
npm test
npm run lint
npx next build
git add "src/app/admin/events/[id]/activities/page.tsx" src/components/admin/ActivityRows.tsx
git commit -m "feat(admin): show which activity has requests waiting"
```

Add to `docs/activities-verification.md`: `- [ ] An activity with pending requests shows a waiting count on the list; one without shows nothing`.

---

### Task 9: Evidence for the contended path

**Files:**
- Modify: `scripts/booking-concurrency.mjs`

**Interfaces:**
- Consumes: `book_session`, `switch_session` (four-argument), `cancel_booking`.
- Produces: a fourth scenario in `npm run check:booking`.

- [ ] **Step 1: Add the scenario**

Two requests asking to move into the same one-seat target, approved concurrently. Build it the way the file's existing scenarios are built — unique `runId` tokens, exact-equality assertions routed through `fail()`, cleanup in the `finally`:

- one activity, `max_per_attendee = 1`, `booking_open = true`
- sessions A (capacity 2, holding attendees X and Y), B (capacity 1, empty)
- two `switch_session(A, B, …, true)` calls fired concurrently, one per attendee

Expect exactly one `ok`, one `full`, and exactly one booking row in B. Assert all three.

- [ ] **Step 2: Run it against the pre-fix state if you cheaply can**

Only after 30 Sep, or against a session where the pilot is not at risk — this script writes to the live project. If you cannot run it now, say so plainly in your report rather than claiming a pass.

- [ ] **Step 3: Commit**

```bash
npm run lint
git add scripts/booking-concurrency.mjs
git commit -m "test(activities): two approvals racing for one seat"
```

---

## Final verification

- [ ] `npm test` — the full suite, including the new `tests/activity-requests.test.ts`.
- [ ] `npm run lint`
- [ ] `npx next build`
- [ ] `scripts/book-session-fixture.sql` re-run in full; every pre-existing section still reports what it did before, and the new `p_ignore_open` section passes.
- [ ] Exactly one `switch_session` exists in `pg_proc`, with the four-argument signature, and `anon` cannot execute it.
- [ ] Portal walked in the browser pane: confirmation on Book, request, pending state, withdraw, and the required-activity and closed-booking variations.
- [ ] `docs/activities-verification.md` carries the admin items.
- [ ] Migrations 0019 and 0020 applied to production at merge, not before.
