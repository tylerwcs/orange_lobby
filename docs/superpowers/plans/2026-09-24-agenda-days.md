# Agenda Days — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organisers create named days first ("Day 1 (Conference)"), then put sessions, breakout rounds and standalone image rows under each day in a hand-set order; the portal shows the day names as its tabs.

**Architecture:** A new `agenda_days` table owns the date and name. Every `agenda_items` row points at its day (`day_id`) and keeps a database-maintained copy of the date in `day`, so every existing reader of `item.day` is untouched. Rows gain a `kind` (`session` | `image`); an image has no time. Within a day, `sort_order` is the organiser's order; new or retimed sessions are placed by time, then dragged. Booked activity sessions are folded into the hand order by time.

**Tech Stack:** Next.js 16 App Router + Server Actions, TypeScript, Supabase (Postgres + PostgREST via the service client), vitest, Tailwind + shadcn/Base UI.

**Spec:** `docs/superpowers/specs/2026-09-24-agenda-days-design.md` — read it first. D193–D201 are defined there; D80, D133, D160 are in earlier specs under `docs/superpowers/specs/`.

## Global Constraints

- **The `ecphub` event (id `3fbf681f-9ee0-49b6-b522-5063c36d39a2`, "ECP Hub") is the real event. Never write to it** — no seeding, no test rows, no edits through the admin. Test on `az-asia-rare-neurology-brand-forum` (id `d634961c-f7a6-4d58-9436-004bb95b982d`, "ECP KOM 2026"), `ecpkom` (id `4e64a90c-728c-4a08-af62-8c8046afa0c9`) or `ecpwellness`. The migration touches every event by design; ecphub has no agenda rows, so it gains no days.
- Supabase project id: `wfmqwwcolfigjylkgrsv`. Local dev (`.env.local`) talks to the same live database as production.
- Work on `main` (the user declines worktrees). **Do not `git push` until Task 7 says so** — Vercel deploys every push to `main`.
- **Migration first, code later.** Task 1 applies `0038` to the live database while production still runs the old code; D195 keeps the old admin working. The new code reads `agenda_days` and must never deploy before the migration.
- Tests are pure `src/lib` only (`tests/**/*.test.ts`, `environment: "node"`). No DOM harness — do not add one.
- Commands: tests `npx vitest run <file>`; whole suite `npx vitest run`; types `npx tsc --noEmit -p .`; lint `npm run lint`; build `npm run build`.
- Another chat's dev server may already hold port 3000 for this folder. If `preview_start` refuses, drive `http://localhost:3000` directly with the browser tools' `navigate` (that worked on 24 Sep); it hot-reloads this checkout.
- Before writing Next.js code, check `node_modules/next/dist/docs/` for anything you touch (`redirect`, server actions, `searchParams`) — this Next version differs from training data (AGENTS.md).
- Comment voice: match the surrounding files — explain *why*, cite decision numbers.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Things that bite in this codebase:** a `<Button>` inside a `<form action>` must declare `type` (Base UI defaults to `type="button"`, tests/form-buttons.test.ts); a submit inside a portalled dialog has no form (use `ConfirmButton`, which handles it); never pass a whole DB row into a client component unless every column is safe to publish (D121) — `AgendaItem`/`AgendaDay` are safe, `Event` is not.

---

### Task 1: Migration 0038 — days, kinds, hand order, triggers (applied to live)

**Files:**
- Create: `supabase/migrations/0038_agenda_days.sql`

**Interfaces:**
- Produces (SQL): table `agenda_days(id uuid, org_id uuid, event_id uuid, date date, name text, created_at timestamptz)`, `unique (event_id, date)`; `agenda_items.day_id uuid not null` → `agenda_days(id) on delete cascade`; `agenda_items.kind text not null default 'session'` ∈ `session|image`; `agenda_items.starts_at` nullable (sessions still require it); triggers `agenda_items_sync_day` and `agenda_days_move_items`.

- [ ] **Step 1: Pre-check that time order is unambiguous**

Run with the Supabase MCP `execute_sql` (project `wfmqwwcolfigjylkgrsv`):

```sql
select e.slug, i.day, i.starts_at, count(distinct coalesce(nullif(trim(i.slot), ''), i.id::text)) as rows_at_this_time
from agenda_items i join events e on e.id = i.event_id
group by e.slug, i.day, i.starts_at
having count(distinct coalesce(nullif(trim(i.slot), ''), i.id::text)) > 1;
```

Expected: **zero rows** (it returned zero on 24 Sep). Zero means no two agenda rows share a start time on any day, so the order attendees see today *is* time order and step 5 of the migration reproduces it exactly. If rows come back, stop and report them — the backfill's tie-break (`sort_order, created_at`) would then need checking against what the portal shows.

- [ ] **Step 2: Snapshot the live portal agenda text (before)**

Find one ecpkom attendee token:

```sql
select token from attendees where event_id = '4e64a90c-728c-4a08-af62-8c8046afa0c9' order by created_at limit 1;
```

Write `snapshot.sh` in the scratchpad directory (replace `ECPKOM_TOKEN`):

```bash
#!/usr/bin/env bash
# Visible text of each agenda page, tags stripped, so build noise cannot fail the diff.
out="$1"; mkdir -p "$out"; base="https://ecphub.vercel.app"
urls=(
  "/e/ecpkom/agenda?day=2026-09-30"
  "/e/ecpkom/agenda?day=2026-10-01"
  "/e/ecpkom/a/ECPKOM_TOKEN/agenda?day=2026-09-30"
  "/e/ecpkom/a/ECPKOM_TOKEN/agenda?day=2026-10-01"
  "/e/az-asia-rare-neurology-brand-forum/agenda?day=2026-09-30"
  "/e/az-asia-rare-neurology-brand-forum/agenda?day=2026-10-01"
  "/e/az-asia-rare-neurology-brand-forum/a/5axab95d27b9/agenda?day=2026-09-22"
  "/e/az-asia-rare-neurology-brand-forum/a/5axab95d27b9/agenda?day=2026-09-30"
  "/e/az-asia-rare-neurology-brand-forum/a/5axab95d27b9/agenda?day=2026-10-01"
)
i=0
for u in "${urls[@]}"; do
  i=$((i+1))
  curl -s "$base$u" | sed 's/<script[^>]*>.*<\/script>//g; s/<[^>]*>/\n/g' | sed 's/^[[:space:]]*//' | grep -v '^$' > "$out/$i.txt"
done
wc -l "$out"/*.txt
```

Run: `bash <scratchpad>/snapshot.sh <scratchpad>/before`
Expected: nine files, each with dozens of lines (session titles visible). A file with a handful of lines means the page 404'd — fix the URL before continuing.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0038_agenda_days.sql`:

```sql
-- Agenda days (D193-D197). A day is a row of its own, created before anything is put on it,
-- with a name for the portal's tab. Agenda rows point at their day, gain a kind (a session,
-- or an image with no time), and are ordered by hand within the day.

-- 1. The days. One per date per event: the portal addresses a day by its date (`?day=`), so
--    two days on one date could never both be reached.
create table if not exists agenda_days (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  event_id uuid not null references events(id) on delete cascade,
  date date not null,
  name text,
  created_at timestamptz not null default now(),
  unique (event_id, date)
);
-- Read and written only through the service client, exactly like agenda_items.
alter table agenda_days enable row level security;

-- 2. One unnamed day per date already in use. Unnamed days are labelled by their date, so
--    nothing an attendee sees changes until an organiser names one.
insert into agenda_days (org_id, event_id, date)
select distinct org_id, event_id, day from agenda_items
on conflict (event_id, date) do nothing;

-- 3. Every row onto its day.
alter table agenda_items add column if not exists day_id uuid references agenda_days(id) on delete cascade;
update agenda_items i set day_id = d.id
from agenda_days d
where d.event_id = i.event_id and d.date = i.day and i.day_id is null;
alter table agenda_items alter column day_id set not null;

-- 4. Kinds (D196). An image row has no time; a session still must have one.
alter table agenda_items add column if not exists kind text not null default 'session';
alter table agenda_items add constraint agenda_items_kind_check check (kind in ('session', 'image'));
alter table agenda_items alter column starts_at drop not null;
alter table agenda_items add constraint agenda_items_session_has_time check (kind = 'image' or starts_at is not null);
alter table agenda_items add constraint agenda_items_image_has_url check (kind = 'session' or image_url is not null);

-- 5. Hand order (D197), seeded from the order attendees see today: by time, then the old
--    sort_order, then creation. A breakout round is one row, placed at its earliest room, and
--    every room of it gets the same number.
with keyed as (
  select id, day_id, starts_at, sort_order, created_at,
    case when nullif(trim(slot), '') is not null then 'slot:' || trim(slot) else 'item:' || id::text end as row_key
  from agenda_items
), led as (
  select id, day_id, row_key,
    first_value(starts_at) over w as lead_starts,
    first_value(sort_order) over w as lead_sort,
    first_value(created_at) over w as lead_created
  from keyed
  window w as (partition by day_id, row_key order by starts_at, sort_order, created_at)
), ranked as (
  select id, (dense_rank() over (partition by day_id order by lead_starts, lead_sort, lead_created, row_key)) * 10 as new_order
  from led
)
update agenda_items i set sort_order = r.new_order from ranked r where r.id = i.id;

-- 6a. The row's date is a copy of its day's (D194), and a write from code that predates days
--     - carrying a date and no day_id, or changing the date on an existing row - is resolved
--     to the day for that date, which is created if missing (D195).
create or replace function agenda_items_sync_day() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.day_id is not distinct from old.day_id and new.day is distinct from old.day then
    new.day_id := null;
  end if;
  if new.day_id is null then
    insert into agenda_days (org_id, event_id, date) values (new.org_id, new.event_id, new.day)
    on conflict (event_id, date) do nothing;
    select id into new.day_id from agenda_days where event_id = new.event_id and date = new.day;
  end if;
  select date into new.day from agenda_days where id = new.day_id and event_id = new.event_id;
  if new.day is null then
    raise exception 'agenda day % does not belong to event %', new.day_id, new.event_id;
  end if;
  return new;
end $$;

drop trigger if exists agenda_items_sync_day on agenda_items;
create trigger agenda_items_sync_day before insert or update of day_id, day on agenda_items
for each row execute function agenda_items_sync_day();

-- 6b. Re-dating a day moves its rows with it (D194). Their day_id is unchanged, so the
--     trigger above resolves the new date straight back to this same day.
create or replace function agenda_days_move_items() returns trigger
language plpgsql set search_path = public as $$
begin
  update agenda_items set day = new.date where day_id = new.id;
  return new;
end $$;

drop trigger if exists agenda_days_move_items on agenda_days;
create trigger agenda_days_move_items after update of date on agenda_days
for each row when (old.date is distinct from new.date) execute function agenda_days_move_items();

-- 7. Indexes for the new reads: a day's rows in order, and the event's agenda in order.
drop index if exists agenda_items_event_day_idx;
create index if not exists agenda_items_event_order_idx on agenda_items (event_id, day, sort_order);
create index if not exists agenda_items_day_order_idx on agenda_items (day_id, sort_order);
```

- [ ] **Step 4: Apply it**

Supabase MCP `apply_migration` with name `0038_agenda_days` and the file's contents.
Expected: success. Then verify:

```sql
select e.slug, d.date, d.name, count(i.id) as rows_, array_agg(i.sort_order order by i.sort_order) as orders
from agenda_days d join events e on e.id = d.event_id left join agenda_items i on i.day_id = d.id
group by e.slug, d.date, d.name order by 1, 2;
```

Expected: a day per date for ecpkom and the az-asia event (2026-09-30 and 2026-10-01 each), names null, orders 10, 20, 30… with breakout rooms sharing one number. **No ecphub rows.**

- [ ] **Step 5: Prove the old production code still works (D195), on the test event only**

```sql
-- Old "add session": a date, no day_id. Expect a day_id, and a new day for 2026-10-02.
insert into agenda_items (org_id, event_id, day, starts_at, title)
select org_id, id, '2026-10-02', '09:00', 'compat probe' from events where id = 'd634961c-f7a6-4d58-9436-004bb95b982d'
returning id, day_id, day, kind, sort_order;
```

Expected: one row, `day_id` set, `day` 2026-10-02, `kind` session. Then, with that id:

```sql
-- Old "edit session" changing the date: expect the row on the 2026-10-01 day.
update agenda_items set day = '2026-10-01' where id = '<probe id>' returning day_id, day;
select id, date from agenda_days where event_id = 'd634961c-f7a6-4d58-9436-004bb95b982d' order by date;
-- Re-dating a day moves its rows: 10-02 -> 10-03 and back.
update agenda_days set date = '2026-10-03' where event_id = 'd634961c-f7a6-4d58-9436-004bb95b982d' and date = '2026-10-01';
select count(*) from agenda_items where event_id = 'd634961c-f7a6-4d58-9436-004bb95b982d' and day = '2026-10-03';
update agenda_days set date = '2026-10-01' where event_id = 'd634961c-f7a6-4d58-9436-004bb95b982d' and date = '2026-10-03';
-- Clean up: the probe row, and the 10-02 day it created.
delete from agenda_items where id = '<probe id>';
delete from agenda_days where event_id = 'd634961c-f7a6-4d58-9436-004bb95b982d' and date = '2026-10-02';
```

Expected: the update returns the 2026-10-01 day's id; the count after re-dating equals that day's row count (5 = 4 existing + probe); both cleanup deletes affect one row.

- [ ] **Step 6: Snapshot again and diff**

Run: `bash <scratchpad>/snapshot.sh <scratchpad>/after && diff -r <scratchpad>/before <scratchpad>/after && echo IDENTICAL`
Expected: `IDENTICAL`. Production still runs the old code, so this proves the conversion changed nothing attendees see.

- [ ] **Step 7: Commit (do not push)**

```bash
git add supabase/migrations/0038_agenda_days.sql
git commit -m "feat(db): agenda days, image rows and hand order (0038)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Types, data access and the hand order

**Files:**
- Create: `src/lib/agenda-order.ts`, `tests/agenda-order.test.ts`
- Modify: `src/lib/types.ts` (AgendaItem ~83-106; add AgendaDay)
- Modify: `src/lib/db/agenda.ts`
- Modify: `src/lib/agenda.ts` (groupByDay, endOf, isNow, nextSession)
- Modify: `src/lib/breakouts.ts` (breakoutSlots, MyBreakout, AgendaRow, agendaRows)
- Modify: `src/lib/activities.ts` (bookedAgendaRows, mergeAgenda)
- Modify: `src/app/admin/events/[id]/actions.ts` (three `createAgendaItem` payloads gain `kind`)
- Modify: `src/app/admin/events/[id]/agenda/page.tsx` (`row.kind === "session"` → `"item"`)
- Modify (fixtures): `tests/agenda.test.ts`, `tests/breakouts.test.ts`, `tests/activities.test.ts`

**Interfaces:**
- Produces:
  - `type AgendaDay = { id: string; org_id: string; event_id: string; date: string; name: string | null }`
  - `type AgendaItemKind = "session" | "image"`; `AgendaItem` gains `day_id: string | null`, `kind: AgendaItemKind`; `starts_at: string | null`
  - `agenda-order.ts`: `type TimedItem = AgendaItem & { kind: "session"; starts_at: string }`; `isSession(i: AgendaItem): i is TimedItem`; `byAgendaOrder(a: AgendaItem, b: AgendaItem): number`; `firstLater<T>(list: readonly T[], time: string, timeOf: (t: T) => string | null): number`; `timeSlot<T>(list: readonly T[], day: string, time: string, dayOf: (t: T) => string, timeOf: (t: T) => string | null): number`
  - `breakouts.ts`: `AgendaRow = { kind: "item"; item: AgendaItem } | { kind: "round"; slot: string; items: AgendaItem[]; day: string; starts_at: string | null; ends_at: string | null }`; `MyBreakout.starts_at: string | null`
  - `db/agenda.ts`: `listAgendaDays(eventId: string): Promise<AgendaDay[]>`; `createAgendaDay(event: Pick<Event, "id" | "org_id">, input: { date: string; name: string | null }): Promise<AgendaDay | null>` (null = date taken); `updateAgendaDay(id: string, eventId: string, patch: { date: string; name: string | null }): Promise<boolean>` (false = date taken); `deleteAgendaDay(id: string, eventId: string): Promise<void>`; `type DayRef = { day_id: string } | { day: string }`; `type NewAgendaItem = Omit<AgendaItem, "id" | "event_id" | "day" | "day_id"> & DayRef`; `createAgendaItem(event, input: NewAgendaItem): Promise<string>` (the new id); `updateAgendaItem(id, eventId, patch: NewAgendaItem): Promise<void>`; `setAgendaOrder(eventId: string, orders: ReadonlyMap<string, number>): Promise<void>`

- [ ] **Step 1: Write the failing tests for agenda-order**

Create `tests/agenda-order.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isSession, byAgendaOrder, firstLater, timeSlot } from "@/lib/agenda-order";
import type { AgendaItem } from "@/lib/types";

const mk = (p: Partial<AgendaItem>): AgendaItem => ({
  id: "x", event_id: "e", day_id: "d1", day: "2026-09-30", kind: "session", starts_at: "09:00", ends_at: null,
  title: "t", description: null, location: null, categories: null, slot: null, code: null, color: null,
  image_url: null, sort_order: 0, ...p,
});
const img = (p: Partial<AgendaItem>) => mk({ kind: "image", starts_at: null, image_url: "https://x/y.png", ...p });

describe("isSession", () => {
  it("is true for a session with a time and false for an image", () => {
    expect(isSession(mk({}))).toBe(true);
    expect(isSession(img({}))).toBe(false);
  });
});

describe("byAgendaOrder", () => {
  it("orders by day, then the organiser's order - never by time", () => {
    const rows = [
      mk({ id: "late-day", day: "2026-10-01", sort_order: 10 }),
      mk({ id: "b", starts_at: "08:00", sort_order: 20 }),
      mk({ id: "a", starts_at: "17:00", sort_order: 10 }),
    ];
    expect([...rows].sort(byAgendaOrder).map((r) => r.id)).toEqual(["a", "b", "late-day"]);
  });
});

describe("firstLater", () => {
  const t = (s: string | null) => s;
  it("finds the first entry that starts strictly later", () => {
    expect(firstLater(["09:00", "10:00", "12:00"], "10:00", t)).toBe(2);
  });
  it("skips entries with no time", () => {
    expect(firstLater(["09:00", null, "12:00"], "10:00", t)).toBe(2);
  });
  it("is the length when nothing starts later", () => {
    expect(firstLater(["09:00", null], "23:00", t)).toBe(2);
  });
});

describe("timeSlot", () => {
  const rows = [
    mk({ id: "a", day: "2026-09-30", starts_at: "09:00" }),
    img({ id: "i", day: "2026-09-30" }),
    mk({ id: "b", day: "2026-09-30", starts_at: "14:00" }),
    mk({ id: "c", day: "2026-10-02", starts_at: "09:00" }),
  ];
  const at = (day: string, time: string) => timeSlot(rows, day, time, (r) => r.day, (r) => (isSession(r) ? r.starts_at : null));
  it("goes before the first later row of its own day, after any image before it", () => {
    expect(at("2026-09-30", "11:00")).toBe(2);
  });
  it("goes at the end of its day when nothing there starts later", () => {
    expect(at("2026-09-30", "18:00")).toBe(3);
  });
  it("goes between days when its day has no rows", () => {
    expect(at("2026-10-01", "10:00")).toBe(3);
  });
  it("goes at the very end after the last day", () => {
    expect(at("2026-10-05", "10:00")).toBe(4);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/agenda-order.test.ts`
Expected: FAIL — cannot resolve `@/lib/agenda-order`.

- [ ] **Step 3: Types**

In `src/lib/types.ts`, replace the `AgendaItem` type's opening fields and add `AgendaDay` above it:

```ts
/** A day of the programme, made before anything is put on it (D193). */
export type AgendaDay = {
  id: string;
  org_id: string;
  event_id: string;
  date: string;         // YYYY-MM-DD, unique per event
  /** "Day 1 (Conference)". Null: the day is labelled by its date everywhere. */
  name: string | null;
};

/** A session has a time; an image row is a picture placed in the programme and has none (D196). */
export type AgendaItemKind = "session" | "image";

export type AgendaItem = {
  id: string;
  event_id: string;
  /** The day this row is on (D194). Null only on rows `bookedAgendaRows` derives from a booking. */
  day_id: string | null;
  /** A copy of the day's date that the database keeps in sync (D194). Read it; never write it. */
  day: string;          // YYYY-MM-DD
  kind: AgendaItemKind;
  /** HH:MM. Null only on an image row, which has no time (D196). */
  starts_at: string | null;
  ends_at: string | null;
  /** A session's title; an image row's optional caption, "" when it has none. */
  title: string;
```

(keep every remaining field of `AgendaItem` — `description` … `sort_order` — exactly as it is.)

- [ ] **Step 4: agenda-order.ts**

Create `src/lib/agenda-order.ts`:

```ts
import type { AgendaItem } from "@/lib/types";

/**
 * The one ordering every agenda list shares (D197): by day, then the organiser's hand order.
 * Never by time - an organiser who drags lunch above the keynote meant it. Ties keep their
 * input order (Array.prototype.sort is stable), and `listAgenda` breaks them by creation.
 */
export function byAgendaOrder(a: AgendaItem, b: AgendaItem): number {
  return a.day.localeCompare(b.day) || a.sort_order - b.sort_order;
}

/** A session, with the time only sessions have. */
export type TimedItem = AgendaItem & { kind: "session"; starts_at: string };

/**
 * The gate every time-based reader goes through (D200): happening now, booked-row placement,
 * breakout times. An image row has no time and must never be compared as if it had one.
 */
export function isSession(i: AgendaItem): i is TimedItem {
  return i.kind === "session" && i.starts_at !== null;
}

/**
 * The index of the first entry that starts strictly later than `time`, skipping entries with
 * no time; the list's length when none does. "Strictly": a row added at 09:00 goes after the
 * 09:00 already there, so the earlier arrival keeps its place.
 */
export function firstLater<T>(list: readonly T[], time: string, timeOf: (t: T) => string | null): number {
  const at = list.findIndex((t) => {
    const s = timeOf(t);
    return s !== null && s > time;
  });
  return at === -1 ? list.length : at;
}

/**
 * Where a row at `day` + `time` goes in a list already in agenda order: within its own day,
 * before the first later timed row; with no rows on its day, where that day would begin.
 * The hand order of the rows around it is never disturbed (D198).
 */
export function timeSlot<T>(
  list: readonly T[],
  day: string,
  time: string,
  dayOf: (t: T) => string,
  timeOf: (t: T) => string | null,
): number {
  const start = list.findIndex((t) => dayOf(t) >= day);
  if (start === -1) return list.length;
  const after = list.findIndex((t) => dayOf(t) > day);
  const end = after === -1 ? list.length : after;
  return start + firstLater(list.slice(start, end), time, timeOf);
}
```

- [ ] **Step 5: Run the new tests**

Run: `npx vitest run tests/agenda-order.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Data access**

Replace the whole of `src/lib/db/agenda.ts` with:

```ts
import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { AgendaDay, AgendaItem, Event } from "@/lib/types";

/** Postgres's unique_violation: the one error a day write expects, when its date is taken. */
const TAKEN = "23505";

/**
 * The whole agenda in agenda order (D197): by day, then the organiser's hand order, then
 * creation - the tie-break for rooms of one round, which share a position.
 */
export async function listAgenda(eventId: string): Promise<AgendaItem[]> {
  const { data, error } = await serviceClient().from("agenda_items").select("*").eq("event_id", eventId)
    .order("day").order("sort_order").order("created_at");
  if (error) throw error;
  return (data as AgendaItem[]).map((i) => ({ ...i, starts_at: i.starts_at?.slice(0, 5) ?? null, ends_at: i.ends_at?.slice(0, 5) ?? null }));
}

/** The event's days in date order - the only order days have (D193). */
export async function listAgendaDays(eventId: string): Promise<AgendaDay[]> {
  const { data, error } = await serviceClient().from("agenda_days").select("id, org_id, event_id, date, name")
    .eq("event_id", eventId).order("date");
  if (error) throw error;
  return data as AgendaDay[];
}

/** Null when that date already has a day - the caller says so rather than failing. */
export async function createAgendaDay(event: Pick<Event, "id" | "org_id">, input: { date: string; name: string | null }): Promise<AgendaDay | null> {
  const { data, error } = await serviceClient().from("agenda_days")
    .insert({ org_id: event.org_id, event_id: event.id, date: input.date, name: input.name })
    .select("id, org_id, event_id, date, name").single();
  if (error?.code === TAKEN) return null;
  if (error) throw error;
  return data as AgendaDay;
}

/**
 * Renames or re-dates a day. False when the new date is taken. A new date carries the day's
 * rows with it - the database does that (D194), so there is nothing else to call.
 */
export async function updateAgendaDay(id: string, eventId: string, patch: { date: string; name: string | null }): Promise<boolean> {
  const { error } = await serviceClient().from("agenda_days").update(patch).eq("id", id).eq("event_id", eventId);
  if (error?.code === TAKEN) return false;
  if (error) throw error;
  return true;
}

/** Deletes the day and, by cascade, its rows and their breakout assignments (D201). */
export async function deleteAgendaDay(id: string, eventId: string) {
  const { error } = await serviceClient().from("agenda_days").delete().eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

/**
 * Which day a row goes on. `day_id` is what this code writes; a bare `day` date is what code
 * from before agenda days wrote, and the database still resolves it (D195).
 */
export type DayRef = { day_id: string } | { day: string };
export type NewAgendaItem = Omit<AgendaItem, "id" | "event_id" | "day" | "day_id"> & DayRef;

/**
 * Adds one row and returns its id, so the caller can place it in its day (D197).
 *
 * `slot`, `code` and `color` are omitted when null rather than sent as null: PostgREST refuses
 * an insert that NAMES a column its schema cache lacks (PGRST204) even for a null, and that
 * trick kept Add-a-session working either side of 0007 and 0009. `day` is never sent - the
 * database copies it from the day (D194).
 */
export async function createAgendaItem(event: Pick<Event, "id" | "org_id">, input: NewAgendaItem): Promise<string> {
  const { slot, code, color, ...rest } = input;
  const payload: Record<string, unknown> = { org_id: event.org_id, event_id: event.id, ...rest };
  if (slot !== null) payload.slot = slot;
  if (code !== null) payload.code = code;
  if (color !== null) payload.color = color;
  const { data, error } = await serviceClient().from("agenda_items").insert(payload).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/**
 * Edits one row, sending every column explicitly INCLUDING nulls: clearing an end time or a
 * location has to actually clear it.
 *
 * Renaming `slot` is the dangerous edit. `unique (attendee_id, slot)` on breakout_assignments
 * reads the copy denormalised onto each assignment row, so the caller MUST follow a slot change
 * with `renameSlotAssignments()` (src/lib/db/breakouts.ts). `updateAgendaItemAction` and
 * `updateBreakoutRoundAction` do; anything else that calls this must too.
 */
export async function updateAgendaItem(id: string, eventId: string, patch: NewAgendaItem) {
  const { error } = await serviceClient().from("agenda_items").update(patch).eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

export async function deleteAgendaItem(id: string, eventId: string) {
  const { error } = await serviceClient().from("agenda_items").delete().eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

/** Writes new `sort_order`s, one row at a time - a day holds a couple of dozen at most. */
export async function setAgendaOrder(eventId: string, orders: ReadonlyMap<string, number>) {
  const db = serviceClient();
  for (const [id, sort_order] of orders) {
    const { error } = await db.from("agenda_items").update({ sort_order }).eq("id", id).eq("event_id", eventId);
    if (error) throw error;
  }
}
```

- [ ] **Step 7: Hand order in agenda.ts**

In `src/lib/agenda.ts`:

Add the import: `import { byAgendaOrder, isSession, type TimedItem } from "@/lib/agenda-order";`

Replace `groupByDay`:

```ts
/** The rows grouped by day, each day in the organiser's order (D197). */
export function groupByDay(items: AgendaItem[]): { day: string; items: AgendaItem[] }[] {
  const sorted = [...items].sort(byAgendaOrder);
  const out: { day: string; items: AgendaItem[] }[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && last.day === i.day) last.items.push(i); else out.push({ day: i.day, items: [i] });
  }
  return out;
}
```

Replace `endOf`, `isNow` and `nextSession`:

```ts
function endOf(i: TimedItem): string {
  if (i.ends_at) return i.ends_at;
  const [h, m] = i.starts_at.split(":").map(Number);
  if (h + 1 > 23) return "23:59";
  return `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** An image row is never "now": it has no time (D200). */
export function isNow(i: AgendaItem, date: string, time: string): boolean {
  return isSession(i) && i.day === date && i.starts_at <= time && time < endOf(i);
}

/** The running or next session. Time order here, not hand order: "next" is about the clock. */
export function nextSession(items: AgendaItem[], date: string, time: string): { item: AgendaItem; status: "now" | "next" } | null {
  const sorted = items.filter(isSession).sort((a, b) => a.day.localeCompare(b.day) || a.starts_at.localeCompare(b.starts_at));
  const now = sorted.find((i) => isNow(i, date, time));
  if (now) return { item: now, status: "now" };
  const next = sorted.find((i) => i.day > date || (i.day === date && i.starts_at > time));
  return next ? { item: next, status: "next" } : null;
}
```

- [ ] **Step 8: Hand order in breakouts.ts**

In `src/lib/breakouts.ts`, add `import { byAgendaOrder } from "@/lib/agenda-order";`

In `breakoutSlots`, replace the sort with `const sorted = [...items].sort(byAgendaOrder);` and change its doc's last line to "in the organiser's order (D197)."

Change `MyBreakout` to `export type MyBreakout = { slot: string; item: AgendaItem | null; day: string; starts_at: string | null; ends_at: string | null };`

Replace `AgendaRow` and `agendaRows`:

```ts
export type AgendaRow =
  | { kind: "item"; item: AgendaItem }
  | { kind: "round"; slot: string; items: AgendaItem[]; day: string; starts_at: string | null; ends_at: string | null };

export function agendaRows(items: AgendaItem[]): AgendaRow[] {
  const sorted = [...items].sort(byAgendaOrder);
  const out: AgendaRow[] = [];
  const rounds = new Map<string, Extract<AgendaRow, { kind: "round" }>>();
  for (const i of sorted) {
    if (!isBreakout(i)) { out.push({ kind: "item", item: i }); continue; }
    const slot = (i.slot as string).trim();
    const seen = rounds.get(slot);
    if (seen) {
      seen.items.push(i);
      // The round shows its EARLIEST room's hours. Rooms normally share a time, but nothing
      // enforces it, and one mistyped room must not be what the round is shown as.
      if (i.starts_at !== null && (seen.starts_at === null || i.starts_at < seen.starts_at)) {
        seen.starts_at = i.starts_at;
        seen.ends_at = i.ends_at;
      }
      continue;
    }
    // The round sits where its first room sits in the hand order; every room shares that
    // position (D197).
    const row = { kind: "round" as const, slot, items: [i], day: i.day, starts_at: i.starts_at, ends_at: i.ends_at };
    rounds.set(slot, row);
    out.push(row);
  }
  return out;
}
```

- [ ] **Step 9: Bookings fold into the hand order (activities.ts)**

In `src/lib/activities.ts` add `import { byAgendaOrder, isSession, timeSlot } from "@/lib/agenda-order";`

In `bookedAgendaRows`, add two fields to the returned object, after `event_id`:

```ts
    // Not on any agenda day: it comes from an activity session, not from `agenda_items`.
    day_id: null,
```

and after `day: s.day,`:

```ts
    kind: "session" as const,
```

Replace `mergeAgenda`:

```ts
/**
 * The agenda with the attendee's bookings folded in (D198). The organiser's rows keep their
 * hand order; each booked row goes before the first later timed row of its day - the same rule
 * that places a new session - so a booking never reorders the programme around it. Bookings at
 * the same time keep their sessions' order between themselves.
 */
export function mergeAgenda(items: AgendaItem[], derived: AgendaItem[]): AgendaItem[] {
  if (derived.length === 0) return items;
  const out = [...items].sort(byAgendaOrder);
  const booked = derived.filter(isSession).sort((a, b) =>
    a.day.localeCompare(b.day) || a.starts_at.localeCompare(b.starts_at) || a.sort_order - b.sort_order);
  for (const row of booked) {
    out.splice(timeSlot(out, row.day, row.starts_at, (i) => i.day, (i) => (isSession(i) ? i.starts_at : null)), 0, row);
  }
  return out;
}
```

- [ ] **Step 10: Keep the callers compiling**

In `src/app/admin/events/[id]/actions.ts`, four object literals gain `kind: "session" as const,` next to `starts_at`: `addAgendaItemAction`'s `createAgendaItem` payload, the `shared` object in `addBreakoutRoundAction`, the `shared` object in `updateBreakoutRoundAction`, and `updateAgendaItemAction`'s `updateAgendaItem` patch (`NewAgendaItem` now requires `kind` on updates too). They still send `day` (a date); `DayRef` accepts that and the database resolves it (D195). Task 5 replaces these.

In `src/app/admin/events/[id]/agenda/page.tsx`, replace every `row.kind === "session"` with `row.kind === "item"`.

Run: `npx tsc --noEmit -p .`
Expected: errors only in `tests/*.test.ts` (fixtures missing `day_id`/`kind`). Any error in `src/` means a reader of `starts_at` needs `isSession` or a null guard — fix it the same way `isNow` does, not with `!`.

- [ ] **Step 11: Update the existing tests for hand order**

`tests/agenda.test.ts`: in `mk`, add `day_id: "d1", kind: "session",` after `event_id: "e",`. Replace the test "groups by day sorted by time then sort_order" with:

```ts
  it("groups by day in the organiser's order, not by time (D197)", () => {
    const items = [
      mk({ id: "1", day: "2026-10-01", sort_order: 10 }),
      mk({ id: "2", starts_at: "09:30", sort_order: 30 }),
      mk({ id: "3", starts_at: "09:00", sort_order: 20 }),
      mk({ id: "4", starts_at: "11:00", sort_order: 10 }),
    ];
    const g = groupByDay(items);
    expect(g.map((d) => d.day)).toEqual(["2026-09-30", "2026-10-01"]);
    expect(g[0].items.map((i) => i.id)).toEqual(["4", "3", "2"]);
  });
```

and add inside `describe("nextSession", …)`:

```ts
  it("never treats an image row as now or next (D200)", () => {
    const withImage = [mk({ id: "img", kind: "image", starts_at: null, image_url: "https://x/y.png" }), ...items];
    expect(isNow(withImage[0], "2026-09-30", "09:10")).toBe(false);
    expect(nextSession(withImage, "2026-09-30", "08:00")).toMatchObject({ item: { id: "a" }, status: "next" });
  });
```

`tests/breakouts.test.ts`: in `item`, add `day_id: "d1", kind: "session",` after `event_id: "e",`. Replace every `"session"` in the `agendaRows` block with `"item"`. Then:
- "sorts breakout items by day, then starts_at, regardless of input order" becomes "orders rooms by day, then hand order, regardless of input order": give `c` `sort_order: 30`, `a` `sort_order: 10`, `b` `sort_order: 20` and keep the expectation `["3A", "3B", "3C"]`; update the two comments to say "hand order".
- "leaves ordinary sessions alone, one row each": give `lunch` `sort_order: 20` (in its `const` at the top of the block) and `other` `sort_order: 10`; expectation stays `["o", "l"]`.
- "places a round at its earliest room, so it sorts with the programme" becomes "places a round where its first room sits, showing its earliest room's time". `lunch` is `sort_order: 20` from the change above; in this test create `late` with `sort_order: 30` and pass `{ ...a, sort_order: 30 }` instead of `a`. The expectations `["Lunch", "Breakout 3"]` and `starts_at` `"21:00"` stay — the round follows Lunch by hand order, and shows 21:00 because that is its earliest room.

Run `npx vitest run tests/breakouts.test.ts`. Any other failure in that file comes from a fixture that relied on time order: give its items `sort_order`s in the same order as their times, never change what the test asserts.

`tests/activities.test.ts`: change the `item` helper to

```ts
const item = (id: string, day: string, starts_at: string, over: Partial<AgendaItem> = {}): AgendaItem => ({
  id, event_id: "e", day_id: "d1", day, kind: "session", starts_at, ends_at: null, title: id, description: null,
  location: null, categories: null, slot: null, code: null, color: null, image_url: null, sort_order: 0, ...over,
});
```

and add to `describe("mergeAgenda", …)`:

```ts
  it("places a booked row by time inside a hand-ordered day, past an image (D198)", () => {
    const items = [
      item("i1", "2026-10-01", "09:00", { sort_order: 10 }),
      item("img", "2026-10-01", "09:00", { sort_order: 20, kind: "image", starts_at: null, image_url: "https://x/y.png" }),
      item("i2", "2026-10-01", "14:00", { sort_order: 30 }),
    ];
    const derived = bookedAgendaRows([session("s1", { starts_at: "11:30" })], NAMES);
    expect(mergeAgenda(items, derived).map((i) => i.id)).toEqual(["i1", "img", `${BOOKING_ROW_PREFIX}s1`, "i2"]);
  });

  it("puts a booked row after an organiser row at the same time", () => {
    const items = [item("i1", "2026-10-01", "09:30")];
    const derived = bookedAgendaRows([session("s1", { starts_at: "09:30" })], NAMES);
    expect(mergeAgenda(items, derived).map((i) => i.id)).toEqual(["i1", `${BOOKING_ROW_PREFIX}s1`]);
  });

  it("keeps the organiser's order even where it is not time order", () => {
    const items = [item("late", "2026-10-01", "14:00", { sort_order: 10 }), item("early", "2026-10-01", "09:00", { sort_order: 20 })];
    const derived = bookedAgendaRows([session("s1", { starts_at: "10:00" })], NAMES);
    expect(mergeAgenda(items, derived).map((i) => i.id)).toEqual([`${BOOKING_ROW_PREFIX}s1`, "late", "early"]);
  });
```

- [ ] **Step 12: Whole suite, types, lint**

Run: `npx vitest run` → all pass. `npx tsc --noEmit -p .` → clean. `npm run lint` → clean.

- [ ] **Step 13: Commit**

```bash
git add src/lib/agenda-order.ts tests/agenda-order.test.ts src/lib/types.ts src/lib/db/agenda.ts src/lib/agenda.ts src/lib/breakouts.ts src/lib/activities.ts "src/app/admin/events/[id]/actions.ts" "src/app/admin/events/[id]/agenda/page.tsx" tests/agenda.test.ts tests/breakouts.test.ts tests/activities.test.ts
git commit -m "feat(agenda): days and image rows in the types; hand order everywhere

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Placement and day-label helpers (pure)

**Files:**
- Create: `src/lib/agenda-placement.ts`, `tests/agenda-placement.test.ts`, `tests/agenda-days.test.ts`
- Modify: `src/lib/agenda.ts` (add `DayTab`, `dayTabs`, `dayLabel`, `nextFreeDate`)

**Interfaces:**
- Consumes: `AgendaRow`, `isBreakout` (breakouts.ts); `firstLater` (agenda-order.ts); `AgendaDay` (types).
- Produces:
  - `agenda-placement.ts`: `itemKey(i: AgendaItem): string`; `rowKey(row: AgendaRow): string`; `rowTime(row: AgendaRow): string | null`; `placeKey(rows: AgendaRow[], key: string, time: string | null): string[]`; `sortOrdersFor(rows: AgendaRow[], keys: string[]): Map<string, number>`; `isValidOrder(current: string[], proposed: string[]): boolean`
  - `agenda.ts`: `type DayTab = { date: string; name: string | null }`; `dayTabs(days: Pick<AgendaDay, "date" | "name">[], items: Pick<AgendaItem, "day">[]): DayTab[]`; `dayLabel(d: Pick<AgendaDay, "date" | "name">): string`; `nextFreeDate(eventDates: string[], taken: string[]): string | null`

- [ ] **Step 1: Write the failing placement tests**

Create `tests/agenda-placement.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { itemKey, rowKey, rowTime, placeKey, sortOrdersFor, isValidOrder } from "@/lib/agenda-placement";
import { agendaRows } from "@/lib/breakouts";
import type { AgendaItem } from "@/lib/types";

const mk = (p: Partial<AgendaItem>): AgendaItem => ({
  id: "x", event_id: "e", day_id: "d1", day: "2026-09-30", kind: "session", starts_at: "09:00", ends_at: null,
  title: "t", description: null, location: null, categories: null, slot: null, code: null, color: null,
  image_url: null, sort_order: 0, ...p,
});
const img = (p: Partial<AgendaItem>) => mk({ kind: "image", starts_at: null, image_url: "https://x/y.png", ...p });
const rowsOf = (...items: AgendaItem[]) => agendaRows(items.map((i, n) => ({ ...i, sort_order: i.sort_order || (n + 1) * 10 })));

describe("keys", () => {
  it("names a session by its id and a round by its slot, from either side", () => {
    const room = mk({ id: "r1", slot: " Breakout 1 ", code: "3A" });
    const [row] = agendaRows([room]);
    expect(itemKey(room)).toBe("slot:Breakout 1");
    expect(rowKey(row)).toBe("slot:Breakout 1");
    expect(itemKey(mk({ id: "s1" }))).toBe("s1");
  });

  it("gives an image row no time", () => {
    const [row] = agendaRows([img({ id: "i" })]);
    expect(rowTime(row)).toBeNull();
  });
});

describe("placeKey", () => {
  it("puts a new session before the first later one", () => {
    const rows = rowsOf(mk({ id: "a", starts_at: "09:00" }), mk({ id: "b", starts_at: "12:00" }));
    expect(placeKey(rows, "n", "10:00")).toEqual(["a", "n", "b"]);
  });

  it("skips images when comparing, so the new row lands after an image that precedes its neighbour", () => {
    const rows = rowsOf(mk({ id: "a", starts_at: "09:00" }), img({ id: "i" }), mk({ id: "b", starts_at: "12:00" }));
    expect(placeKey(rows, "n", "10:00")).toEqual(["a", "i", "n", "b"]);
    expect(placeKey(rows, "n", "13:00")).toEqual(["a", "i", "b", "n"]);
  });

  it("moves a retimed row that is already in the day", () => {
    const rows = rowsOf(mk({ id: "a", starts_at: "09:00" }), mk({ id: "b", starts_at: "10:00" }), mk({ id: "c", starts_at: "11:00" }));
    expect(placeKey(rows, "a", "10:30")).toEqual(["b", "a", "c"]);
  });

  it("goes after a row at the same time", () => {
    const rows = rowsOf(mk({ id: "a", starts_at: "09:00" }));
    expect(placeKey(rows, "n", "09:00")).toEqual(["a", "n"]);
  });

  it("sends a row with no time (an image) to the end", () => {
    const rows = rowsOf(mk({ id: "a", starts_at: "09:00" }), mk({ id: "b", starts_at: "12:00" }));
    expect(placeKey(rows, "i", null)).toEqual(["a", "b", "i"]);
  });

  it("handles an empty day", () => {
    expect(placeKey([], "n", "09:00")).toEqual(["n"]);
  });

  it("places a whole round by its key", () => {
    const rows = rowsOf(mk({ id: "a", starts_at: "09:00" }), mk({ id: "r1", slot: "B1", code: "3A", starts_at: "15:00" }), mk({ id: "b", starts_at: "12:00" }));
    expect(placeKey(rows, "slot:B1", "10:00")).toEqual(["a", "slot:B1", "b"]);
  });
});

describe("sortOrdersFor", () => {
  it("numbers rows 10 apart, every room of a round sharing its row's number", () => {
    const rows = agendaRows([
      mk({ id: "a", sort_order: 1 }),
      mk({ id: "r1", slot: "B1", code: "3A", sort_order: 2 }),
      mk({ id: "r2", slot: "B1", code: "3B", sort_order: 2 }),
    ]);
    const out = sortOrdersFor(rows, ["slot:B1", "a"]);
    expect(Object.fromEntries(out)).toEqual({ r1: 10, r2: 10, a: 20 });
  });

  it("ignores a key that is not one of the rows", () => {
    const rows = agendaRows([mk({ id: "a" })]);
    expect(Object.fromEntries(sortOrdersFor(rows, ["ghost", "a"]))).toEqual({ a: 20 });
  });
});

describe("isValidOrder", () => {
  const current = ["a", "b", "slot:B1"];
  it("accepts the same rows in another order", () => {
    expect(isValidOrder(current, ["slot:B1", "a", "b"])).toBe(true);
  });
  it("refuses a list with a row missing, added, repeated or foreign", () => {
    expect(isValidOrder(current, ["a", "b"])).toBe(false);
    expect(isValidOrder(current, ["a", "b", "slot:B1", "c"])).toBe(false);
    expect(isValidOrder(current, ["a", "a", "b"])).toBe(false);
    expect(isValidOrder(current, ["a", "b", "zzz"])).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/agenda-placement.test.ts`
Expected: FAIL — cannot resolve `@/lib/agenda-placement`.

- [ ] **Step 3: Implement**

Create `src/lib/agenda-placement.ts`:

```ts
import type { AgendaItem } from "@/lib/types";
import { isBreakout, type AgendaRow } from "@/lib/breakouts";
import { firstLater } from "@/lib/agenda-order";

/**
 * A row's identity in a day's order: the item's id, or `slot:<round>` for a breakout round,
 * whose rooms move as one (D197). Prefixed so a round named like a uuid can never collide.
 */
export function itemKey(i: AgendaItem): string {
  return isBreakout(i) ? `slot:${(i.slot as string).trim()}` : i.id;
}

export function rowKey(row: AgendaRow): string {
  return row.kind === "round" ? `slot:${row.slot}` : row.item.id;
}

/** A row's start time; null for an image row, which is never compared (D197). */
export function rowTime(row: AgendaRow): string | null {
  if (row.kind === "round") return row.starts_at;
  return row.item.kind === "session" ? row.item.starts_at : null;
}

/**
 * The day's order with `key` placed by `time` (D197): every other row keeps its place and
 * `key` goes before the first of them that starts strictly later. `key` may already be in the
 * day (a retimed or moved row: it is lifted out first) or not (a new row). No time - an image -
 * goes to the end, and the organiser drags it where it belongs.
 */
export function placeKey(rows: AgendaRow[], key: string, time: string | null): string[] {
  const others = rows.filter((r) => rowKey(r) !== key);
  const at = time === null ? others.length : firstLater(others, time, rowTime);
  const keys = others.map(rowKey);
  keys.splice(at, 0, key);
  return keys;
}

/** Each item's new `sort_order` for this key order: 10 apart, a round's rooms sharing one. */
export function sortOrdersFor(rows: AgendaRow[], keys: string[]): Map<string, number> {
  const byKey = new Map(rows.map((r) => [rowKey(r), r]));
  const out = new Map<string, number>();
  keys.forEach((k, n) => {
    const row = byKey.get(k);
    if (!row) return;
    for (const item of row.kind === "round" ? row.items : [row.item]) out.set(item.id, (n + 1) * 10);
  });
  return out;
}

/**
 * Whether `proposed` is exactly the day's rows, reordered. A reorder posted from a stale page
 * - a row added or deleted in another tab since - is refused whole rather than half-applied:
 * a partial list would renumber the rows it names over the ones it forgot.
 */
export function isValidOrder(current: string[], proposed: string[]): boolean {
  if (proposed.length !== current.length) return false;
  const want = new Set(current);
  const seen = new Set<string>();
  for (const k of proposed) {
    if (!want.has(k) || seen.has(k)) return false;
    seen.add(k);
  }
  return true;
}
```

- [ ] **Step 4: Run the placement tests**

Run: `npx vitest run tests/agenda-placement.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing day-label tests**

Create `tests/agenda-days.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dayTabs, dayLabel, nextFreeDate } from "@/lib/agenda";

describe("dayTabs", () => {
  it("lists the organiser's days in date order, with their names", () => {
    const tabs = dayTabs(
      [{ date: "2026-10-01", name: "Day 2 (Teambuilding)" }, { date: "2026-09-30", name: "Day 1 (Conference)" }],
      [],
    );
    expect(tabs).toEqual([
      { date: "2026-09-30", name: "Day 1 (Conference)" },
      { date: "2026-10-01", name: "Day 2 (Teambuilding)" },
    ]);
  });

  it("keeps a day with nothing on it", () => {
    expect(dayTabs([{ date: "2026-09-30", name: null }], [])).toEqual([{ date: "2026-09-30", name: null }]);
  });

  it("adds a date the viewer has a row on but no day - a booking must stay reachable (D199)", () => {
    const tabs = dayTabs([{ date: "2026-09-30", name: "Day 1" }], [{ day: "2026-09-22" }, { day: "2026-09-30" }]);
    expect(tabs).toEqual([{ date: "2026-09-22", name: null }, { date: "2026-09-30", name: "Day 1" }]);
  });

  it("treats a blank name as no name", () => {
    expect(dayTabs([{ date: "2026-09-30", name: "   " }], [])).toEqual([{ date: "2026-09-30", name: null }]);
  });
});

describe("dayLabel", () => {
  it("is the name and the short date when named, the date alone when not", () => {
    expect(dayLabel({ date: "2026-09-30", name: "Day 1 (Conference)" })).toBe("Day 1 (Conference) · Wed 30 Sep");
    expect(dayLabel({ date: "2026-09-30", name: null })).toBe("Wed 30 Sep");
  });
});

describe("nextFreeDate", () => {
  it("is the first event date without a day", () => {
    expect(nextFreeDate(["2026-09-30", "2026-10-01"], ["2026-09-30"])).toBe("2026-10-01");
  });
  it("is null when every event date has a day, or the event has no dates", () => {
    expect(nextFreeDate(["2026-09-30"], ["2026-09-30"])).toBeNull();
    expect(nextFreeDate([], [])).toBeNull();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run tests/agenda-days.test.ts`
Expected: FAIL — `dayTabs` is not exported.

- [ ] **Step 7: Implement in agenda.ts**

In `src/lib/agenda.ts` change the type import to `import type { AgendaDay, AgendaItem } from "@/lib/types";`, add `import { shortDate } from "@/lib/text";`, and append:

```ts
/** One portal day tab: the date it filters to (`?day=`), and the organiser's name for it. */
export type DayTab = { date: string; name: string | null };

/**
 * The portal's day tabs (D199): every day the organiser made, in date order - including an
 * empty one - plus any date the viewer has a row on without a day. That second case is a
 * booking dated outside the agenda, and a booking must never be unreachable.
 */
export function dayTabs(days: Pick<AgendaDay, "date" | "name">[], items: Pick<AgendaItem, "day">[]): DayTab[] {
  const byDate = new Map<string, string | null>(days.map((d) => [d.date, d.name?.trim() || null]));
  for (const i of items) if (!byDate.has(i.day)) byDate.set(i.day, null);
  return [...byDate].map(([date, name]) => ({ date, name })).sort((a, b) => a.date.localeCompare(b.date));
}

/** "Day 1 (Conference) · Wed 30 Sep", or "Wed 30 Sep" for an unnamed day. Admin text. */
export function dayLabel(d: Pick<AgendaDay, "date" | "name">): string {
  const name = d.name?.trim();
  return name ? `${name} · ${shortDate(d.date)}` : shortDate(d.date);
}

/** The first of the event's dates with no day yet - Add day's default. Null when none is free. */
export function nextFreeDate(eventDates: string[], taken: string[]): string | null {
  return eventDates.find((d) => !taken.includes(d)) ?? null;
}
```

Check `src/lib/text.ts` does not import from `@/lib/agenda` (it must not, or this is a cycle): `grep -n "lib/agenda" src/lib/text.ts` → no output.

- [ ] **Step 8: Run, then the whole suite**

Run: `npx vitest run tests/agenda-days.test.ts` → PASS. `npx vitest run` → all pass. `npx tsc --noEmit -p .` → clean.

- [ ] **Step 9: Commit**

```bash
git add src/lib/agenda-placement.ts src/lib/agenda.ts tests/agenda-placement.test.ts tests/agenda-days.test.ts
git commit -m "feat(agenda): placement by time, reorder validation and day tabs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Portal — named day tabs and image rows

**Files:**
- Modify: `src/components/portal/AgendaList.tsx`
- Modify: `src/components/portal/AgendaImage.tsx`
- Modify: `src/lib/portal-home.ts`
- Modify: `src/app/e/[slug]/a/[token]/agenda/page.tsx`
- Modify: `src/app/e/[slug]/agenda/page.tsx`

**Interfaces:**
- Consumes: `listAgendaDays` (Task 2); `dayTabs`, `DayTab` (Task 3).
- Produces: `AgendaList` prop `days: DayTab[]` (was `string[]`); `HomeData.days: DayTab[]`; `AgendaImage` prop `variant?: "thumb" | "full"`.

- [ ] **Step 1: AgendaImage gains a full-width variant**

In `src/components/portal/AgendaImage.tsx`, change the signature and the trigger button:

```tsx
export function AgendaImage({ src, title, variant = "thumb" }: {
  src: string;
  title: string;
  /**
   * "thumb": a session's picture, 44px on the row's trailing edge (D160). "full": an image
   * row (D196) - the picture IS the row, so it is shown whole at the column's width, never
   * cropped, and still opens full size when tapped.
   */
  variant?: "thumb" | "full";
}) {
  const [open, setOpen] = useState(false);
  const full = variant === "full";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={full
          ? "block w-full overflow-hidden rounded-[14px] border border-border bg-card outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          : "size-11 shrink-0 overflow-hidden rounded-[10px] border border-border outline-none focus-visible:ring-3 focus-visible:ring-ring/50"}
        aria-label={full ? `Open ${title} full size` : `Show picture for ${title}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className={full ? "h-auto w-full object-contain" : "size-full object-cover"} />
      </button>
```

(the `Dialog` below it is unchanged). Update the doc comment's first line to "A picture on the agenda: a session's thumbnail, or an image row shown whole (D160, D196)."

- [ ] **Step 2: AgendaList — tabs from DayTab, image rows**

In `src/components/portal/AgendaList.tsx`:

Change the import `import { isNow } from "@/lib/agenda";` to `import { isNow, type DayTab } from "@/lib/agenda";` and the prop type `days: string[];` to `days: DayTab[];`.

Replace the tab strip block (`{days.length > 1 && ( … )}`) with:

```tsx
      {days.length > 1 && (
        // Scrolls sideways rather than wrapping: named days ("Day 2 (Teambuilding)") do not fit
        // three abreast on a phone, and a wrapped strip reads as two rows of tabs (D199).
        <div className="overflow-x-auto">
          <div className="flex w-max min-w-full gap-5 border-b border-border">
            {days.map((d) => (
              <PendingLink
                key={d.date}
                href={hrefForDay(d.date)}
                selected={d.date === day}
                className="-mb-px shrink-0 border-b-[3px] pb-2 text-left text-[13px]"
                selectedClassName="border-primary font-extrabold text-primary"
                unselectedClassName="border-transparent font-semibold text-muted-foreground"
              >
                {d.name ? (
                  <>
                    <span className="block whitespace-nowrap">{d.name}</span>
                    <span className="block text-[11px] font-semibold text-muted-foreground">{shortDate(d.date)}</span>
                  </>
                ) : shortDate(d.date)}
              </PendingLink>
            ))}
          </div>
        </div>
      )}
```

Inside `todays.map((i) => { … })`, add as the first line of the callback body:

```tsx
        if (i.kind === "image") return <ImageRow key={i.id} item={i} />;
```

and append below the `AgendaList` function:

```tsx
/**
 * An image the organiser placed in the day (D196): shown whole across the column, with its
 * caption beneath. A row with no URL cannot exist (the database requires one), but rendering
 * nothing beats rendering a broken image if one ever does.
 */
function ImageRow({ item }: { item: AgendaItem }) {
  if (!item.image_url) return null;
  return (
    <figure className="flex flex-col gap-2">
      <AgendaImage src={item.image_url} title={item.title || "Agenda image"} variant="full" />
      {item.title && <figcaption className="px-1 text-sm text-muted-foreground">{item.title}</figcaption>}
    </figure>
  );
}
```

- [ ] **Step 3: portal-home.ts**

In `src/lib/portal-home.ts`:
- imports: `import { listAgenda, listAgendaDays } from "@/lib/db/agenda";` and `import { dayTabs, pickDay, type DayTab } from "@/lib/agenda";` (drop `groupByDay` if nothing else uses it).
- `HomeData.days: string[];` → `days: DayTab[];` with the doc "The day tabs (D199)."
- first `Promise.all` becomes `const [allAgenda, agendaDays, announcements, activities] = await Promise.all([listAgenda(event.id), listAgendaDays(event.id), listAnnouncements(event.id), attendee ? portalActivities(event.id) : []]);`
- replace `const days = groupByDay(agenda).map((g) => g.day);` with `const days = dayTabs(agendaDays, agenda);`
- in the return, `day: pickDay(days.map((d) => d.date), requestedDay, date),`.

- [ ] **Step 4: The two agenda pages**

`src/app/e/[slug]/a/[token]/agenda/page.tsx`: import `listAgendaDays` beside `listAgenda`; replace `groupByDay, pickDay` with `dayTabs, pickDay`; the first `Promise.all` becomes `const [allAgenda, agendaDays, activities] = await Promise.all([listAgenda(event.id), listAgendaDays(event.id), portalActivities(event.id)]);`; replace the `days`/`day` lines with:

```ts
  const days = dayTabs(agendaDays, items);
  const now = nowInKL();
  const day = pickDay(days.map((d) => d.date), requested, now.date);
```

`src/app/e/[slug]/agenda/page.tsx`: same substitution —

```ts
  const [all, agendaDays] = await Promise.all([listAgenda(event.id), listAgendaDays(event.id)]);
  const items = visibleTo(all, null);
  const days = dayTabs(agendaDays, items);
  const now = nowInKL();
  const day = pickDay(days.map((d) => d.date), requested, now.date);
```

with imports `listAgenda, listAgendaDays` and `visibleTo, dayTabs, pickDay`.

- [ ] **Step 5: Types, lint, tests**

Run: `npx tsc --noEmit -p .` → clean (the desktop home pages pass `days` straight through from `loadHomeData`, so they need no edit). `npm run lint` → clean. `npx vitest run` → all pass.

- [ ] **Step 6: Browser check on the TEST event (never ecphub)**

Name the az-asia event's days and add one image row by SQL:

```sql
update agenda_days set name = 'Day 1 (Conference)' where event_id = 'd634961c-f7a6-4d58-9436-004bb95b982d' and date = '2026-09-30';
update agenda_days set name = 'Day 2 (Teambuilding)' where event_id = 'd634961c-f7a6-4d58-9436-004bb95b982d' and date = '2026-10-01';
insert into agenda_items (org_id, event_id, day_id, kind, title, image_url, sort_order)
select d.org_id, d.event_id, d.id, 'image', 'Venue map', 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=1200', 15
from agenda_days d where d.event_id = 'd634961c-f7a6-4d58-9436-004bb95b982d' and d.date = '2026-09-30'
returning id;
```

In the browser pane, `resize_window` preset `mobile`, then open `http://localhost:3000/e/az-asia-rare-neurology-brand-forum/a/5axab95d27b9/agenda?day=2026-09-30`. Check with `read_page`/`screenshot`:
- three tabs: "Wed 22 Sep" (the booking-only date), "Day 1 (Conference)" over "Wed 30 Sep", "Day 2 (Teambuilding)" over "Thu 1 Oct"; the strip scrolls sideways, the page itself does not (`javascript_tool`: `document.documentElement.scrollWidth <= innerWidth` → `true`);
- the image row sits second, full width, whole, caption "Venue map" under it; tapping it opens the dialog;
- the public page `http://localhost:3000/e/az-asia-rare-neurology-brand-forum/agenda` shows the two named tabs.
Screenshot the phone view for the report. Reset with `resize_window` preset `desktop`. Leave the names and the image in place for Task 6.

- [ ] **Step 7: Commit**

```bash
git add src/components/portal/AgendaList.tsx src/components/portal/AgendaImage.tsx src/lib/portal-home.ts "src/app/e/[slug]/a/[token]/agenda/page.tsx" "src/app/e/[slug]/agenda/page.tsx"
git commit -m "feat(portal): named day tabs and image rows on the agenda

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Admin server actions — days, placement, images, reorder

**Files:**
- Modify: `src/app/admin/events/[id]/actions.ts`
- Modify: `src/lib/db/agenda.ts` (narrow `NewAgendaItem` to `day_id`)

**Interfaces:**
- Consumes: `listAgendaDays`, `createAgendaDay`, `updateAgendaDay`, `deleteAgendaDay`, `setAgendaOrder`, `createAgendaItem` (returns id) — Task 2; `agendaRows` — breakouts; `itemKey`, `rowKey`, `placeKey`, `sortOrdersFor`, `isValidOrder` — Task 3; `dayLabel` — Task 3.
- Produces (server actions; form field names are the contract with Task 6):
  - `addAgendaDayAction(eventId: string, formData: FormData)` — fields `date` (YYYY-MM-DD), `name`
  - `updateAgendaDayAction(eventId: string, dayId: string, formData: FormData)` — same fields
  - `deleteAgendaDayAction(eventId: string, dayId: string)`
  - `reorderAgendaDayAction(eventId: string, dayId: string, keys: string[])`
  - `addAgendaImageAction(eventId: string, formData: FormData)` — fields `day_id`, `image` (file, via `nextImage`), `title` (caption), `categories` (multi)
  - `updateAgendaImageAction(eventId: string, itemId: string, formData: FormData)` — same fields
  - existing `addAgendaItemAction`, `updateAgendaItemAction`, `addBreakoutRoundAction`, `updateBreakoutRoundAction` now read `day_id` instead of `day`

- [ ] **Step 1: Narrow the data type**

In `src/lib/db/agenda.ts`, replace the `DayRef`/`NewAgendaItem` pair with:

```ts
/** A row always names its day (D194); the database fills in the date. */
export type NewAgendaItem = Omit<AgendaItem, "id" | "event_id" | "day" | "day_id"> & { day_id: string };
```

and delete the `DayRef` comment. `npx tsc --noEmit -p .` now fails in actions.ts at every place that still sends `day` — the steps below fix each one.

- [ ] **Step 2: Imports and two helpers**

In `src/app/admin/events/[id]/actions.ts`:
- change the agenda db import to `import { createAgendaItem, deleteAgendaItem, listAgenda, updateAgendaItem, listAgendaDays, createAgendaDay, updateAgendaDay, deleteAgendaDay, setAgendaOrder } from "@/lib/db/agenda";`
- change `import { breakoutSlots, … } from "@/lib/breakouts";` to also import `agendaRows`
- change `import { categoriesFromValues } from "@/lib/agenda";` to `import { categoriesFromValues, dayLabel } from "@/lib/agenda";`
- add `import { itemKey, rowKey, placeKey, sortOrdersFor, isValidOrder } from "@/lib/agenda-placement";`
- change `import { formatDateRange } from "@/lib/text";` to `import { formatDateRange, shortDate } from "@/lib/text";`
- add `import type { AgendaDay } from "@/lib/types";` (merge into the existing type import line)

Directly under the `// ---- Agenda / announcements / info / checkpoints ----` line add:

```ts
const agendaBack = (eventId: string) => `/admin/events/${eventId}/agenda`;

/** The day a form names, if it is one of this event's. A posted id is never trusted (D193). */
async function dayOf(eventId: string, dayId: string | null): Promise<AgendaDay | null> {
  if (!dayId) return null;
  return (await listAgendaDays(eventId)).find((d) => d.id === dayId) ?? null;
}

/**
 * Re-numbers one day so the row `key` sits where `time` puts it (D197) and writes the result.
 * Called after the row itself is written, so the row is among the day's rows and is lifted
 * out and re-inserted like any retimed row.
 */
async function placeInDay(eventId: string, dayId: string, key: string, time: string | null) {
  const rows = agendaRows((await listAgenda(eventId)).filter((i) => i.day_id === dayId));
  await setAgendaOrder(eventId, sortOrdersFor(rows, placeKey(rows, key, time)));
}
```

- [ ] **Step 3: Day actions**

Add below the helpers:

```ts
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function addAgendaDayAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const date = str(formData, "date");
  if (!date || !ISO_DATE.test(date)) redirect(flashPath(agendaBack(eventId), "A day needs a date.", "error"));
  const made = await createAgendaDay(ev, { date, name: str(formData, "name") });
  if (!made) redirect(flashPath(agendaBack(eventId), `There's already a day on ${shortDate(date)}.`, "error"));
  revalidatePath(agendaBack(eventId));
  redirect(flashPath(agendaBack(eventId), `${dayLabel(made)} added.`));
}

/** Renames or re-dates a day; its rows move with a new date, in the database (D194). */
export async function updateAgendaDayAction(eventId: string, dayId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const day = await dayOf(ev.id, dayId);
  if (!day) redirect(flashPath(agendaBack(eventId), "That day no longer exists.", "error"));
  const date = str(formData, "date");
  if (!date || !ISO_DATE.test(date)) redirect(flashPath(agendaBack(eventId), "A day needs a date.", "error"));
  const name = str(formData, "name");
  if (!(await updateAgendaDay(day.id, ev.id, { date, name }))) {
    redirect(flashPath(agendaBack(eventId), `There's already a day on ${shortDate(date)}.`, "error"));
  }
  revalidatePath(agendaBack(eventId));
  redirect(flashPath(agendaBack(eventId), `${dayLabel({ date, name })} saved.`));
}

/**
 * Deletes a day with everything on it (D201). Its rows' images are read first and removed
 * from the bucket after, in the D160 order: nothing leaves storage until no row names it.
 */
export async function deleteAgendaDayAction(eventId: string, dayId: string) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const day = await dayOf(ev.id, dayId);
  if (!day) redirect(flashPath(agendaBack(eventId), "That day no longer exists.", "error"));
  const doomed = (await listAgenda(ev.id)).filter((i) => i.day_id === day.id);
  await deleteAgendaDay(day.id, ev.id);
  for (const i of doomed) await deleteEventImage(i.image_url);
  revalidatePath(agendaBack(eventId));
  redirect(flashPath(agendaBack(eventId), `${dayLabel(day)} removed.`));
}

/**
 * Saves one day's hand order (D197), from the drag list. A list that is not exactly the day's
 * rows - posted from a stale page - is ignored, and the list snaps back to what is stored.
 */
export async function reorderAgendaDayAction(eventId: string, dayId: string, keys: string[]) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const rows = agendaRows((await listAgenda(ev.id)).filter((i) => i.day_id === dayId));
  if (rows.length === 0 || !isValidOrder(rows.map(rowKey), keys)) return;
  await setAgendaOrder(ev.id, sortOrdersFor(rows, keys));
  revalidatePath(agendaBack(eventId));
}
```

- [ ] **Step 4: Sessions read `day_id` and are placed by time**

In `addAgendaItemAction`: replace `const day = str(formData, "day");` with `const day = await dayOf(ev.id, str(formData, "day_id"));`; the guard stays `if (!day || !starts_at || !title)`. In the `createAgendaItem` call replace `day,` with `day_id: day.id,`, keep `kind: "session" as const,`, and capture the id:

```ts
  const id = await createAgendaItem(ev, {
    day_id: day.id,
    kind: "session",
    starts_at,
    // …every other field exactly as before…
    sort_order: 0,
  });
  // New rows go in by time; the organiser drags from there (D197).
  await placeInDay(ev.id, day.id, id, starts_at);
```

(delete the old `// Sessions at the same time now order by when they were added` comment.)

In `updateAgendaItemAction`: replace `const day = str(formData, "day");` with `const day = await dayOf(ev.id, str(formData, "day_id"));` and the guard message stays. In the `updateAgendaItem` patch replace `day,` with `day_id: day.id,` and add `kind: "session",`. After `await deleteEventImage(image.stale);` add:

```ts
  // A new time or a new day re-places the row by time; any other edit leaves it where the
  // organiser put it (D197).
  if (day.id !== item.day_id || starts_at !== item.starts_at) {
    await placeInDay(ev.id, day.id, itemKey({ ...item, slot }), starts_at);
  }
```

(This must run before the `renameSlotAssignments` block's possible redirect, so place it directly after `deleteEventImage`.)

- [ ] **Step 5: Breakout rounds read `day_id`**

In `addBreakoutRoundAction`:
- `const day = str(formData, "day");` → `const day = await dayOf(ev.id, str(formData, "day_id"));`
- the `elsewhere` check becomes:

```ts
  const existing = breakoutSlots(await listAgenda(ev.id)).find((s) => s.slot === slot);
  const elsewhere = existing?.items.find((i) => i.day_id !== day.id);
  if (elsewhere) {
    redirect(flashPath(back, `“${slot}” is already on ${shortDate(elsewhere.day)}. A round runs on one day — rename this one, or edit the existing round to add rooms.`, "error"));
  }
```

- in `shared`: `day, starts_at,` → `day_id: day.id, kind: "session" as const, starts_at,`; `sort_order: 0,` → `sort_order: existing?.items[0]?.sort_order ?? 0,` with the comment `// Rooms added to an existing round join it where it already sits; only a new round is placed.`
- after the `for (const code of fresh)` loop add: `if (!existing) await placeInDay(ev.id, day.id, \`slot:${slot}\`, starts_at);`

In `updateBreakoutRoundAction`:
- `const day = str(formData, "day");` → `const day = await dayOf(ev.id, str(formData, "day_id"));`
- in `shared`: `day, starts_at,` → `day_id: day.id, kind: "session" as const, starts_at,`; `sort_order: 0,` → `sort_order: current.items[0].sort_order,` with `// An edit keeps the round where the organiser put it; a new time or day re-places it below.`
- before the final `revalidatePath(back);` add:

```ts
  const first = current.items[0];
  if (day.id !== first.day_id || starts_at !== first.starts_at) {
    await placeInDay(ev.id, day.id, `slot:${nextSlot}`, starts_at);
  }
```

- [ ] **Step 6: Image row actions**

Add after `updateAgendaItemAction`:

```ts
/**
 * An image placed in the programme (D196): a picture, an optional caption, optional
 * categories, and no time - so it goes to the end of its day and the organiser drags it.
 */
export async function addAgendaImageAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const back = agendaBack(eventId);
  const day = await dayOf(ev.id, str(formData, "day_id"));
  if (!day) redirect(flashPath(back, "That day no longer exists.", "error"));
  let image: ImageChange = { url: null, stale: null };
  try {
    image = await nextImage(formData, "image", null, { orgId, eventId, kind: "agenda" });
  } catch (e) {
    redirect(flashPath(back, (e as Error).message, "error"));
  }
  if (!image.url) redirect(flashPath(back, "Choose an image to add.", "error"));
  const id = await createAgendaItem(ev, {
    day_id: day.id,
    kind: "image",
    starts_at: null,
    ends_at: null,
    // `title` is not null in the table; an uncaptioned image stores "".
    title: str(formData, "title") ?? "",
    description: null,
    location: null,
    categories: categoriesFromValues(formData.getAll("categories").map(String)),
    slot: null,
    code: null,
    color: null,
    image_url: image.url,
    sort_order: 0,
  });
  await placeInDay(ev.id, day.id, id, null);
  revalidatePath(back);
  redirect(flashPath(back, "Image added. Drag it to where it belongs in the day."));
}

export async function updateAgendaImageAction(eventId: string, itemId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const back = agendaBack(eventId);
  const item = (await listAgenda(ev.id)).find((i) => i.id === itemId && i.kind === "image");
  if (!item) redirect(flashPath(back, "That image no longer exists.", "error"));
  const day = await dayOf(ev.id, str(formData, "day_id"));
  if (!day) redirect(flashPath(back, "That day no longer exists.", "error"));
  let image: ImageChange = { url: item.image_url, stale: null };
  try {
    image = await nextImage(formData, "image", item.image_url, { orgId, eventId, kind: "agenda" });
  } catch (e) {
    redirect(flashPath(back, (e as Error).message, "error"));
  }
  // The row IS the picture; removing it means deleting the row, which the Delete button does.
  if (!image.url) redirect(flashPath(back, "An image row needs its image. To remove it, delete the row.", "error"));
  await updateAgendaItem(itemId, ev.id, {
    day_id: day.id,
    kind: "image",
    starts_at: null,
    ends_at: null,
    title: str(formData, "title") ?? "",
    description: null,
    location: null,
    categories: categoriesFromValues(formData.getAll("categories").map(String)),
    slot: null,
    code: null,
    color: null,
    image_url: image.url,
    sort_order: item.sort_order,
  });
  await deleteEventImage(image.stale);
  if (day.id !== item.day_id) await placeInDay(ev.id, day.id, itemId, null);
  revalidatePath(back);
  redirect(flashPath(back, "Image saved."));
}
```

Check `deleteAgendaItemAction` needs no change: it already reads the row, deletes it, and removes its image — that covers image rows.

- [ ] **Step 7: Types, lint, tests**

Run: `npx tsc --noEmit -p .` → clean (form field names are not type-checked, so the forms still posting `day` does not show up here). `npm run lint` → clean. `npx vitest run` → all pass (tests/form-buttons.test.ts included).

Note: until Task 6 lands, the admin forms still post `day` and adding a session will fail with "A session needs a day…". Do not stop between Task 5 and Task 6.

- [ ] **Step 8: Commit**

```bash
git add "src/app/admin/events/[id]/actions.ts" src/lib/db/agenda.ts
git commit -m "feat(admin): actions for agenda days, image rows, placement and reorder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Admin Agenda page — day cards, drag order, forms

**Files:**
- Create: `src/components/admin/SortableList.tsx`
- Modify: `src/components/admin/AgendaForms.tsx`
- Modify: `src/app/admin/events/[id]/agenda/page.tsx`

**Interfaces:**
- Consumes: every Task 5 action; `rowKey` (Task 3); `dayLabel`, `nextFreeDate` (Task 3); `listAgendaDays` (Task 2); `eventDays` (src/lib/time.ts); `moveItem` (src/lib/reorder.ts).
- Produces: `SortableList({ rows: SortableRow[]; reorder: (keys: string[]) => Promise<void>; empty: string })` with `SortableRow = { key: string; label: string; node: React.ReactNode }`; `DayForm({ eventId, day?, suggestedDate? })`; `SessionForm({ eventId, categories, days, dayId, item? })`; `BreakoutForm({ eventId, days, dayId, round? })`; `ImageItemForm({ eventId, categories, days, dayId, item? })`.

- [ ] **Step 1: SortableList**

Create `src/components/admin/SortableList.tsx`:

```tsx
"use client";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { moveItem } from "@/lib/reorder";
import { Icon } from "@/components/ui/icon";

export type SortableRow = {
  /** What the reorder action receives - an item id, or `slot:<round>` (D197). */
  key: string;
  /** What a screen reader hears the handle move. */
  label: string;
  /** The row itself, rendered on the server: forms, dialogs and all. */
  node: React.ReactNode;
};

/**
 * One agenda day's rows in the organiser's order (D197). The same drag-and-arrow-key idiom as
 * CheckpointList: a drag is a pointer gesture no keyboard can perform, so the handle also takes
 * the arrow keys; both go through `moveItem`, and both save at once.
 *
 * The rows arrive already rendered - their Edit dialogs hold server-rendered forms - so this
 * component only owns their order. Optimistic, not local state: when the action settles the
 * list becomes whatever the server stored, so a refused reorder never leaves a lie on screen.
 */
export function SortableList({ rows, reorder, empty }: {
  rows: SortableRow[];
  reorder: (keys: string[]) => Promise<void>;
  empty: string;
}) {
  const [order, setOrder] = useOptimistic(rows);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const fromRef = useRef<number | null>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const moved = order[from];
    const next = moveItem(order, from, to);
    startTransition(async () => {
      setOrder(next);
      setMessage(`${moved.label} moved to position ${next.indexOf(moved) + 1} of ${next.length}`);
      await reorder(next.map((r) => r.key));
    });
  };

  if (order.length === 0) return <p className="py-3 text-sm text-muted-foreground">{empty}</p>;

  return (
    <div>
      <ul className="divide-y divide-border" aria-busy={pending}>
        {order.map((r, i) => (
          <li
            key={r.key}
            draggable
            onDragStart={(e) => { fromRef.current = i; setDragging(i); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(i); }}
            onDragLeave={() => setOver((prev) => (prev === i ? null : prev))}
            onDrop={(e) => { e.preventDefault(); const from = fromRef.current; setDragging(null); setOver(null); if (from !== null) move(from, i); }}
            onDragEnd={() => { fromRef.current = null; setDragging(null); setOver(null); }}
            className={`flex items-start gap-2 py-3 transition-colors duration-150 ${dragging === i ? "opacity-50" : ""} ${over === i && dragging !== i ? "bg-accent" : ""}`}
          >
            <button
              type="button"
              aria-label={`Reorder ${r.label}. Position ${i + 1} of ${order.length}. Use the arrow keys to move it.`}
              onKeyDown={(e) => {
                const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : null;
                if (to === null) return;
                e.preventDefault();
                move(i, to);
              }}
              className="flex h-11 w-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-background active:cursor-grabbing"
            >
              <Icon name="grip" size={18} />
            </button>
            <div className="min-w-0 flex-1">{r.node}</div>
          </li>
        ))}
      </ul>
      <p className="sr-only" role="status" aria-live="polite">{message}</p>
      {order.length > 1 && (
        <p className="pt-2 text-xs text-muted-foreground">Drag a row by its handle — or focus the handle and use the arrow keys — to set the order attendees see. Saved as you go.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: AgendaForms**

Replace the whole of `src/components/admin/AgendaForms.tsx` with:

```tsx
import { useId } from "react";
import { Field } from "@/components/admin/Field";
import { Field as UIField, FieldDescription, FieldLabel } from "@/components/ui/field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { CategoryCombo, ColourCombo } from "@/components/admin/AgendaCombos";
import { ImageField } from "@/components/admin/ImageField";
import {
  addAgendaItemAction, addBreakoutRoundAction, updateAgendaItemAction, updateBreakoutRoundAction,
  addAgendaImageAction, updateAgendaImageAction, addAgendaDayAction, updateAgendaDayAction,
} from "@/app/admin/events/[id]/actions";
import { dayLabel } from "@/lib/agenda";
import type { AgendaDay, AgendaItem } from "@/lib/types";

const control = "min-h-11 w-full rounded-md border border-border bg-card px-3 text-sm";

/**
 * The agenda's forms, each doing double duty for adding and editing.
 *
 * One form per shape rather than one form with switches: an ordinary session has a location
 * and an audience, a breakout room has a round and a room code, an image row has a picture
 * and no time, and a day has only a date and a name. `item`/`round`/`day` present means
 * editing, and every field is seeded from the row, so an edit that touches one field leaves
 * the rest exactly as they were.
 *
 * Adding happens from inside a day's card, so the day is already decided and travels as a
 * hidden `day_id`; only an edit offers a day picker, because only an edit can move a row.
 */

export function DayForm({ eventId, day, suggestedDate }: { eventId: string; day?: AgendaDay; suggestedDate?: string | null }) {
  const action = day ? updateAgendaDayAction.bind(null, eventId, day.id) : addAgendaDayAction.bind(null, eventId);
  return (
    <form action={action} className="grid gap-4 p-1">
      <Field label="Date" name="date" type="date" defaultValue={day?.date ?? suggestedDate} />
      <Field
        label="Name (optional)"
        name="name"
        defaultValue={day?.name}
        placeholder="Day 1 (Conference)"
        description="Shown on the portal's day tab, above the date. Left blank, the tab shows the date alone."
      />
      {day && (
        <p className="text-xs text-muted-foreground">
          A new date moves every session on this day with it. Activity bookings are dated separately and stay where they are.
        </p>
      )}
      <SubmitButton>{day ? "Save day" : "Add day"}</SubmitButton>
    </form>
  );
}

export function SessionForm({ eventId, categories, days, dayId, item }: {
  eventId: string;
  categories: string[];
  days: AgendaDay[];
  dayId: string;
  item?: AgendaItem;
}) {
  const action = item
    ? updateAgendaItemAction.bind(null, eventId, item.id)
    : addAgendaItemAction.bind(null, eventId);
  return (
    <form action={action} className="grid gap-4 p-1">
      <input type="hidden" name="preset" value="session" />
      <When days={days} dayId={dayId} item={item} />
      <Field label="Title" name="title" defaultValue={item?.title} />
      <Field label="Location" name="location" defaultValue={item?.location} placeholder="Grand Ballroom" />
      <Field label="Description" name="description" textarea defaultValue={item?.description} />
      <CategoryCombo categories={categories} defaultValue={item?.categories ?? []} />
      <ColourCombo defaultValue={item?.color ?? null} />
      {/* Only the session form carries one. A breakout round is many rooms on a single
          form, so a picker there would set one picture for all of them (D160). */}
      <ImageField
        label="Image"
        name="image"
        url={item?.image_url}
        description="A speaker, a poster, the room. Shown as a thumbnail on the agenda, full size when tapped."
      />
      <SubmitButton>{item ? "Save session" : "Add session"}</SubmitButton>
    </form>
  );
}

export function BreakoutForm({ eventId, days, dayId, round }: {
  eventId: string;
  days: AgendaDay[];
  dayId: string;
  /** The round being edited, with every room in it. Absent means creating a new one. */
  round?: { slot: string; items: AgendaItem[] };
}) {
  const first = round?.items[0];
  const action = round
    ? updateBreakoutRoundAction.bind(null, eventId, round.slot)
    : addBreakoutRoundAction.bind(null, eventId);
  const codes = round?.items.map((i) => i.code).filter(Boolean).join(", ");
  return (
    <form action={action} className="grid gap-4 p-1">
      <input type="hidden" name="preset" value="breakout" />
      <When days={days} dayId={dayId} item={first} />
      <Field
        label="Round"
        name="slot"
        defaultValue={round?.slot}
        placeholder="Breakout 1"
        description="Every room of this round shares it. Name it the same as the column in the spreadsheet."
      />
      <Field
        label="Rooms"
        name="code"
        defaultValue={codes}
        placeholder="3A, 3B, 3C, 3D"
        description="One per room, separated by commas, exactly as the spreadsheet writes them."
      />
      <Field label="Title (optional)" name="title" defaultValue={first?.title} placeholder="Breakout: regional teams" />
      <Field label="Description" name="description" textarea defaultValue={first?.description} />
      <ColourCombo defaultValue={first?.color ?? null} />
      {round && (
        <>
          <label className="flex items-start gap-3 text-sm font-medium">
            <input type="checkbox" name="remove_missing" className="mt-0.5 size-4 accent-primary" />
            <span>
              Remove rooms I have taken off the list
              <span className="block text-xs font-normal text-muted-foreground">
                Off by default. A room removed here is deleted, and so is everybody assigned to it.
              </span>
            </span>
          </label>
          <p className="text-xs text-muted-foreground">
            Renaming the round moves everybody in it with it — every room at once, so the round
            cannot be split in half.
          </p>
        </>
      )}
      <SubmitButton>{round ? "Save round" : "Add round"}</SubmitButton>
    </form>
  );
}

/** An image placed in the day (D196): a picture, an optional caption and audience, no time. */
export function ImageItemForm({ eventId, categories, days, dayId, item }: {
  eventId: string;
  categories: string[];
  days: AgendaDay[];
  dayId: string;
  item?: AgendaItem;
}) {
  const action = item
    ? updateAgendaImageAction.bind(null, eventId, item.id)
    : addAgendaImageAction.bind(null, eventId);
  return (
    <form action={action} className="grid gap-4 p-1">
      <DayPicker days={days} dayId={dayId} editing={Boolean(item)} />
      <ImageField
        label="Image"
        name="image"
        url={item?.image_url}
        description="Shown whole across the portal agenda, at the place you drag it to. Tapped, it opens full size."
      />
      <Field label="Caption (optional)" name="title" defaultValue={item?.title || null} placeholder="Venue map" />
      <CategoryCombo categories={categories} defaultValue={item?.categories ?? []} />
      <SubmitButton>{item ? "Save image" : "Add image"}</SubmitButton>
    </form>
  );
}

/** Day and times, the fields both timed shapes share. */
function When({ days, dayId, item }: { days: AgendaDay[]; dayId: string; item?: AgendaItem }) {
  return (
    <>
      <DayPicker days={days} dayId={dayId} editing={Boolean(item)} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts" name="starts_at" type="time" defaultValue={item?.starts_at} />
        <Field label="Ends" name="ends_at" type="time" defaultValue={item?.ends_at} />
      </div>
    </>
  );
}

function DayPicker({ days, dayId, editing }: { days: AgendaDay[]; dayId: string; editing: boolean }) {
  const id = useId();
  if (!editing) return <input type="hidden" name="day_id" value={dayId} />;
  return (
    <UIField>
      <FieldLabel htmlFor={id}>Day</FieldLabel>
      <select id={id} name="day_id" defaultValue={dayId} className={control}>
        {days.map((d) => <option key={d.id} value={d.id}>{dayLabel(d)}</option>)}
      </select>
      <FieldDescription>Moved to another day, it goes in there by its start time.</FieldDescription>
    </UIField>
  );
}
```

- [ ] **Step 3: The page**

Replace the whole of `src/app/admin/events/[id]/agenda/page.tsx` with:

```tsx
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAgenda, listAgendaDays } from "@/lib/db/agenda";
import { listAttendees, listCategories } from "@/lib/db/attendees";
import { listAssignments } from "@/lib/db/breakouts";
import { dayLabel, nextFreeDate } from "@/lib/agenda";
import { eventDays } from "@/lib/time";
import { shortDate } from "@/lib/text";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { deleteAgendaDayAction, deleteAgendaItemAction, deleteBreakoutRoundAction, reorderAgendaDayAction, updateAgendaBannerAction } from "../actions";
import { ImageField } from "@/components/admin/ImageField";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Modal } from "@/components/admin/Modal";
import { SortableList } from "@/components/admin/SortableList";
import { DayForm, SessionForm, BreakoutForm, ImageItemForm } from "@/components/admin/AgendaForms";
import { agendaAccentClass } from "@/lib/agenda-colours";
import { breakoutSlots, rosters, agendaRows, type AgendaRow } from "@/lib/breakouts";
import { rowKey } from "@/lib/agenda-placement";
import type { AgendaDay, Attendee, BreakoutAssignment } from "@/lib/types";

export const metadata = { title: "Agenda" };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default async function AgendaAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const [items, days, categories] = await Promise.all([listAgenda(ev.id), listAgendaDays(ev.id), listCategories(ev.id)]);
  const slots = breakoutSlots(items);
  // Only fetched when the event actually runs breakout rounds — a non-breakout event must
  // issue exactly the queries it issued before this feature.
  const [attendees, assignments]: [Attendee[], BreakoutAssignment[]] = slots.length > 0
    ? await Promise.all([listAttendees(ev.id), listAssignments(ev.id)])
    : [[], []];
  // Counts per room and per round, read straight onto the agenda rows. Nested rather than a
  // joined string key: a round "A" with a room "B C" and a round "A B" with a room "C" would
  // build the same flat key, and a count landing on the wrong room looks right.
  const roster = slots.length > 0 ? rosters(items, attendees.map((a) => a.id), assignments) : [];
  const inRoom = new Map<string, Map<string, number>>();
  const noRoom = new Map<string, number>();
  for (const s of roster) {
    noRoom.set(s.slot, s.unassignedIds.length);
    inRoom.set(s.slot, new Map(s.rooms.map((r) => [r.code, r.attendeeIds.length])));
  }
  const byDay = new Map(days.map((d) => [d.id, agendaRows(items.filter((i) => i.day_id === d.id))]));
  const sessions = [...byDay.values()].flat().filter((r) => r.kind === "round" || r.item.kind === "session").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminHeader title="Agenda" subtitle={`${plural(days.length, "day")} · ${plural(sessions, "session")}`} />
        <div className="flex flex-wrap gap-2">
          <Modal title="Add a day" hint="Name it for the portal's tab — “Day 1 (Conference)”. Sessions and images go under it." trigger="Add day" icon="plus">
            <DayForm eventId={ev.id} suggestedDate={nextFreeDate(eventDays(ev.starts_on, ev.ends_on), days.map((d) => d.date)) ?? ev.starts_on} />
          </Modal>
          {/* The banner belongs to the whole agenda, not to any day on it (D160). */}
          <Modal title="Agenda image" hint="One image above the agenda, on every day of the event." trigger="Image" icon="file" variant="outline">
            <form action={updateAgendaBannerAction.bind(null, ev.id)} className="grid gap-4 p-1">
              <ImageField
                label="Image"
                name="agenda_banner"
                url={ev.agenda_banner_url}
                description="Shown above the portal agenda at its own size, never cropped. Wider than the page, it is scaled down to fit."
              />
              <SubmitButton>Save image</SubmitButton>
            </form>
          </Modal>
        </div>
      </div>

      {days.length === 0 && (
        <Card>
          <CardContent>
            <Empty className="border-0 bg-transparent">
              <EmptyHeader>
                <EmptyTitle>No days yet</EmptyTitle>
                <EmptyDescription>Add the first day above, then put its sessions and images under it. Each day is a tab on the portal.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      )}

      {days.map((day) => {
        const rows = byDay.get(day.id) ?? [];
        const hasRounds = rows.some((r) => r.kind === "round");
        return (
          <Card key={day.id}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle>
                {day.name ? <>{day.name} <span className="font-semibold text-muted-foreground">· {shortDate(day.date)}</span></> : shortDate(day.date)}
              </CardTitle>
              <div className="flex items-center gap-1">
                <Modal title="Edit day" trigger="Edit day" variant="ghost">
                  <DayForm eventId={ev.id} day={day} />
                </Modal>
                <form action={deleteAgendaDayAction.bind(null, ev.id, day.id)}>
                  <ConfirmButton
                    message={`Delete ${dayLabel(day)}${rows.length ? ` and its ${plural(rows.length, "row")}` : ""}?${hasRounds ? " Anyone assigned to its breakout rooms loses their room." : ""}`}
                  >
                    Delete day
                  </ConfirmButton>
                </form>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <SortableList
                rows={rows.map((row) => ({
                  key: rowKey(row),
                  label: labelOf(row),
                  node: <RowView row={row} eventId={ev.id} day={day} days={days} categories={categories} inRoom={inRoom} noRoom={noRoom} />,
                }))}
                reorder={reorderAgendaDayAction.bind(null, ev.id, day.id)}
                empty="Nothing on this day yet."
              />
              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <Modal title="Add a session" hint="Anything on the programme that a whole category attends together." trigger="Add session" icon="plus">
                  <SessionForm eventId={ev.id} categories={categories} days={days} dayId={day.id} />
                </Modal>
                <Modal title="Add a breakout round" hint="A round and all of its rooms at once. An attendee sees only the room they are assigned to." trigger="Add breakout round" icon="users" variant="outline">
                  <BreakoutForm eventId={ev.id} days={days} dayId={day.id} />
                </Modal>
                <Modal title="Add an image" hint="A picture in the programme — a map, a poster. It goes to the end of the day; drag it into place." trigger="Add image" icon="file" variant="outline">
                  <ImageItemForm eventId={ev.id} categories={categories} days={days} dayId={day.id} />
                </Modal>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function labelOf(row: AgendaRow): string {
  if (row.kind === "round") return row.slot;
  return row.item.kind === "image" ? row.item.title || "Image" : row.item.title;
}

/** One row's content inside the drag list: what it is, and its Edit and Delete. */
function RowView({ row, eventId, day, days, categories, inRoom, noRoom }: {
  row: AgendaRow;
  eventId: string;
  day: AgendaDay;
  days: AgendaDay[];
  categories: string[];
  inRoom: Map<string, Map<string, number>>;
  noRoom: Map<string, number>;
}) {
  if (row.kind === "item" && row.item.kind === "image") {
    const i = row.item;
    return (
      <div className="flex items-start justify-between gap-4 text-sm">
        <div className="flex min-w-0 items-center gap-3">
          {i.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={i.image_url} alt="" className="h-12 w-16 shrink-0 rounded-md border border-border object-cover" />
          )}
          <div className="min-w-0">
            <div className="font-bold">{i.title || "Image"}</div>
            <div className="text-xs text-muted-foreground">Image{i.categories?.length ? ` · for ${i.categories.join(", ")}` : ""}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Modal title="Edit image" trigger="Edit" variant="ghost">
            <ImageItemForm eventId={eventId} categories={categories} days={days} dayId={day.id} item={i} />
          </Modal>
          <form action={deleteAgendaItemAction.bind(null, eventId, i.id)}>
            <ConfirmButton message={`Delete ${i.title ? `“${i.title}”` : "this image"}?`}>Delete</ConfirmButton>
          </form>
        </div>
      </div>
    );
  }

  const lead = row.kind === "round" ? row.items[0] : row.item;
  const accent = agendaAccentClass(lead.color);
  const starts = row.kind === "round" ? row.starts_at : lead.starts_at;
  const ends = row.kind === "round" ? row.ends_at : lead.ends_at;
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <div className="flex min-w-0 gap-4">
        <div className="w-24 shrink-0 tabular-nums text-muted-foreground">{starts}{ends ? ` – ${ends}` : ""}</div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {accent && <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${accent}`} />}
            <span className="font-bold">{row.kind === "round" ? row.slot : row.item.title}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {row.kind === "round"
              ? [lead.title !== row.slot ? lead.title : null, lead.description].filter(Boolean).join(" · ")
              : [row.item.location, row.item.description].filter(Boolean).join(" · ")}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {/* Every room of the round on one line — the thing the round is actually for,
                and the counts that say how it is filling up. */}
            {row.kind === "round" && row.items.map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs">
                <span className="font-bold">{r.code || "no code"}</span>
                <span className="tabular-nums text-muted-foreground">{inRoom.get(row.slot)?.get(r.code ?? "") ?? 0}</span>
              </span>
            ))}
            {row.kind === "round" && (noRoom.get(row.slot) ?? 0) > 0 && (
              <Badge variant="secondary" className="tabular-nums">{noRoom.get(row.slot)} with no room</Badge>
            )}
            {row.kind === "item" && row.item.categories && row.item.categories.length > 0 && (
              <Badge variant="secondary">{row.item.categories.join(", ")}</Badge>
            )}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {row.kind === "round" ? (
          <>
            <Modal title={`Edit ${row.slot}`} trigger="Edit" variant="ghost">
              <BreakoutForm eventId={eventId} days={days} dayId={day.id} round={{ slot: row.slot, items: row.items }} />
            </Modal>
            <form action={deleteBreakoutRoundAction.bind(null, eventId, row.slot)}>
              <ConfirmButton message={`Delete “${row.slot}” and its ${plural(row.items.length, "room")}? Anyone assigned to them loses their room.`}>Delete</ConfirmButton>
            </form>
          </>
        ) : (
          <>
            <Modal title="Edit session" trigger="Edit" variant="ghost">
              <SessionForm eventId={eventId} categories={categories} days={days} dayId={day.id} item={row.item} />
            </Modal>
            <form action={deleteAgendaItemAction.bind(null, eventId, row.item.id)}>
              <ConfirmButton message={`Delete "${row.item.title}"?`}>Delete</ConfirmButton>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Types, lint, tests**

Run: `npx tsc --noEmit -p .` → clean. `npm run lint` → clean. `npx vitest run` → all pass (including `tests/form-buttons.test.ts` and `tests/confirm-button.test.ts`).

- [ ] **Step 5: Drive the admin on the TEST event (never ecphub)**

Open `http://localhost:3000/admin/events/d634961c-f7a6-4d58-9436-004bb95b982d/agenda` in the browser pane. If it redirects to `/login`, the pane has no admin session: stop and ask the user to sign in in the pane (Claude must not enter credentials), then continue. Check, using `find`/`read_page` and the page's toasts:

1. Two day cards, "Day 1 (Conference) · Wed 30 Sep" and "Day 2 (Teambuilding) · Thu 1 Oct", rows in time order with "Venue map" second on Day 1 and the 4-room breakout round as one row.
2. **Add day**: default date is empty or the next free event date (both event dates are taken, so it falls back to `starts_on` — acceptable); set 2026-10-02, name "Day 3 (Test)" → toast "Day 3 (Test) · Fri 2 Oct added.", a third card. Add day again with 2026-10-02 → error toast "There's already a day on Fri 2 Oct."
3. On Day 3: **Add session** 11:00 "Late", then 09:00 "Early" → Early is above Late (placed by time). **Add image** with any small PNG (upload through the ImageField) → it lands last. Drag or arrow-key it to the top → refresh → it stays at the top.
4. **Edit** "Early": change time to 12:00 → it moves below Late. Change its Day to Day 2 → it leaves Day 3 and appears in Day 2 by time.
5. **Edit day** on Day 3: change the date to 2026-10-03 → its rows keep showing under it; the portal tab (`/e/az-asia-rare-neurology-brand-forum/agenda`) now says Sat 3 Oct.
6. **Delete day** on Day 3 → the confirmation names its rows; confirm → the card and its rows are gone.
7. Check the moved "Early" on Day 2 and delete it.
8. Breakout round: **Edit** it, change nothing, save → it stays where it was (no re-placement without a time change).

Then clean up the test event's leftovers so its agenda is as Task 4 left it:

```sql
select d.date, i.title, i.kind, i.sort_order from agenda_items i join agenda_days d on d.id = i.day_id
where i.event_id = 'd634961c-f7a6-4d58-9436-004bb95b982d' order by d.date, i.sort_order;
```

Delete any row or day this step created that is still there, **only with `event_id = 'd634961c-f7a6-4d58-9436-004bb95b982d'` in the `where`**.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/SortableList.tsx src/components/admin/AgendaForms.tsx "src/app/admin/events/[id]/agenda/page.tsx"
git commit -m "feat(admin): agenda day cards, drag order, and image rows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Final verification, deploy, records

**Files:**
- Modify: `docs/superpowers/specs/2026-09-24-agenda-days-design.md` (Status line)

- [ ] **Step 1: Everything green**

Run: `npx vitest run` → all pass. `npx tsc --noEmit -p .` → clean. `npm run lint` → clean. `npm run build` → succeeds.

- [ ] **Step 2: Rows written by the old production code since Task 1**

Production ran the old code from Task 1 until now. Anything it created has `sort_order = 0` and would show at the top of its day once the new code is live:

```sql
select e.slug, i.day, i.starts_at, i.title, i.created_at from agenda_items i join events e on e.id = i.event_id
where i.sort_order = 0 order by i.created_at;
```

Expected: no rows. If there are rows, re-place each affected day by time with the migration's step-5 statement restricted to those days (`where day_id in (…)` added to the `keyed` CTE) — including on ecphub, where this is the one permitted write, because it restores the order the organiser saw. Report what was re-placed.

- [ ] **Step 3: Push and wait for the deploy**

```bash
git push origin main
```

Wait for the Vercel deployment of this commit to be Ready (check `https://ecphub.vercel.app/e/az-asia-rare-neurology-brand-forum/agenda` until it shows the named tabs "Day 1 (Conference)").

- [ ] **Step 4: Production checks (read-only on ecphub)**

- `https://ecphub.vercel.app/e/az-asia-rare-neurology-brand-forum/a/5axab95d27b9/agenda?day=2026-09-30` at phone width: named tabs, the image row whole, sessions in order.
- `https://ecphub.vercel.app/e/ecpkom/agenda` renders its two unnamed date tabs exactly as before.
- `https://ecphub.vercel.app/e/ecphub/agenda` renders (empty agenda — "Agenda will be published soon.") with no error. Do not click anything that writes.
- The booked-session calendar link from 24 Sep still returns a file: `curl -sI "https://ecphub.vercel.app/e/az-asia-rare-neurology-brand-forum/a/5axab95d27b9/activities/b36476d9-5635-460b-82ac-8ec4376ec3c2/calendar.ics?session=de9b90b2-52b3-4daa-b4eb-7c84cb091585"` → `200`, `content-type: text/calendar`.

- [ ] **Step 5: Records**

Set the spec's `Status:` line to `built and deployed <date>`. Commit and push:

```bash
git add docs/superpowers/specs/2026-09-24-agenda-days-design.md
git commit -m "docs(spec): agenda days built

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

Update the project memory (`orange-lobby-pilot.md`): agenda days shipped (0038 applied, commits), the trigger-maintained `agenda_items.day`, that `sort_order` is now hand order, and that the ECP Hub organiser builds its agenda day-first. Report to the user: what shipped, the phone screenshot from Task 4, and that ECP Hub's days are theirs to create.
