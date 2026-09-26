# Live Games Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three stage games — tap race, last one standing, lucky draw — played from attendees' phones, driven from a crew host link, and shown on a 1920×1080 LED page.

**Architecture:** One `game_stage` row per event is the single source of truth; host actions write it through compare-and-set RPCs, and timed phases advance by the clock on read (`resolveStage`). Phones, the host console and the LED poll plain HTTP route handlers (no Supabase Realtime). All game rules are pure functions under `src/lib/games/` with Vitest tests; the database enforces the same rules in `security`-restricted RPCs.

**Tech Stack:** Next.js 16.3 App Router (route handlers, server actions), React 19, Supabase Postgres via `serviceClient()` (service role, RLS on with no policies), zod 4, Tailwind 4, Vitest 5, exceljs.

**Spec:** `docs/superpowers/specs/2026-09-26-live-games-design.md` (decisions D250–D289). Read it before starting any task; decision numbers below refer to it.

## Global Constraints

- Next.js here is 16.3 — read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` before writing a route handler. `params` is a Promise in pages, layouts and route handlers.
- Every new table: RLS enabled, **no policies**. Every new RPC: `revoke execute ... from public, anon, authenticated;` then `grant execute ... to service_role;` (both roles must be revoked explicitly — see `supabase/migrations/0017_book_session.sql:194-205`).
- Server-only data modules start with `import "server-only";` and use `serviceClient()` from `@/lib/supabase/service`.
- Pure modules (everything in `src/lib/games/` except `live.ts`, `phone-state.ts`, `display-state.ts`) must not import `server-only`, `next/*` or the Supabase client — they are imported by client components and by tests.
- Tests live flat in `tests/`, named `tests/games-*.test.ts`, import from `@/...`, and use `import { describe, expect, it } from "vitest";`.
- Tokens use `generateToken()` / `isValidToken()` from `@/lib/tokens` (12 chars, 31-symbol alphabet).
- Host and display links follow the crew link's expiry rule: `crewLinkLive(event, nowInKL().date)` from `@/lib/crew`. Draft events (`isUnpublished` from `@/lib/portal`) refuse phones, host and display.
- Timing constants (from D258, D265, D266, D272, D280): countdown 3 s, grace 1.5 s, spin 5 s, tap rate 15/s with elapsed capped at 3 s.
- LED is designed for **1920×1080** (D284). Names on the LED are **initials + first name** everywhere except winner cards, which show full name and company (D273).
- Never test against the event with slug `ecphub` — it is the live event. Use a throwaway or test event.
- Work on `main` (the user declines worktrees). Commit after each task. Commit messages end with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Run the whole suite with `npm test`; lint with `npm run lint`; typecheck with `npx tsc --noEmit`.
- The lint config is `eslint-config-next` 16 (core-web-vitals + typescript), which includes the React hooks rules. If one flags a pattern in this plan's code (e.g. state set during render, `Date.now()` in a state initializer), restructure the code to satisfy it; do not add a disable comment. The one sanctioned disable is `@next/next/no-img-element` for organiser-uploaded logos, as elsewhere in the repo.

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/0046_games.sql` | Tables, tokens, RPCs (`game_stage_write`, `race_add_taps`, `survival_reveal`, `draw_spin`) |
| `scripts/games-db-check.mjs` | Executable evidence that the RPCs enforce their rules against a real database |
| `src/lib/games/config.ts` | Game kinds, per-kind zod config, `hydrateGame`, `gameSummary` |
| `src/lib/games/config-form.ts` | Admin form → validated config |
| `src/lib/games/phase.ts` | Phases, `StageRow`, `resolveStage`, host-action table, stage writes, phase-data readers |
| `src/lib/games/names.ts` | Initials + first name |
| `src/lib/games/mosaic.ts` | Tile tiers, grid fitting, seeded ripple order |
| `src/lib/games/race.ts` | Lane grouping, labels, standings, tap allowance |
| `src/lib/games/survival.ts` | Elimination rules, answer split, end condition |
| `src/lib/games/draw.ts` | Pool eligibility, prize progress, draw count |
| `src/lib/games/memo.ts` | Per-instance TTL memo |
| `src/lib/games/poll.ts` | Client polling cadence, clock offset, backoff |
| `src/lib/games/views.ts` | `publicStage` (the correct-answer secrecy rule), option colours |
| `src/lib/games/wire.ts` | Types of the JSON the endpoints return |
| `src/lib/db/games.ts` | Server-only reads/writes and RPC calls |
| `src/lib/games/live.ts` | Server-only memos, token → event/attendee, `liveStage` |
| `src/lib/games/phone-state.ts` | Server-only phone view builder |
| `src/lib/games/display-state.ts` | Server-only LED and host view builders, draw pool |
| `src/app/api/play/[token]/{state,join,taps,answer}/route.ts` | Phone endpoints |
| `src/app/api/display/[token]/state/route.ts`, `src/app/api/host/[token]/state/route.ts` | LED and host endpoints |
| `src/app/admin/events/[id]/games/...` | Games admin list, editor, actions |
| `src/app/admin/events/[id]/export/winners.xlsx/route.ts` | Winners export |
| `src/app/host/[token]/...` | Host console + server actions |
| `src/app/e/[slug]/a/[token]/play/page.tsx` | Attendee play page |
| `src/app/display/[token]/...` | LED page |
| `src/components/games/*` | Poll hook, play UI, banner, LED screens, mosaic, winner card |
| `scripts/games-load.mjs` | 500/1,000-phone load test |

---

### Task 1: Database — migration, event tokens, RPCs

**Files:**
- Create: `supabase/migrations/0046_games.sql`
- Create: `scripts/games-db-check.mjs`
- Modify: `src/lib/types.ts:64-66` (Event gains `host_token`, `display_token`)
- Modify: `package.json` (script `check:games`)

**Interfaces:**
- Produces (SQL, called by Task 10):
  - `game_stage_write(p_event_id uuid, p_expected int, p_run_id uuid, p_game_id uuid, p_phase text, p_phase_data jsonb, p_phase_ends_at timestamptz) returns int` — new version, or `-1` when `p_expected` is stale.
  - `race_add_taps(p_run_id uuid, p_attendee_id uuid, p_n int, p_live_from timestamptz, p_live_until timestamptz) returns int` — taps accepted.
  - `survival_reveal(p_event_id uuid, p_expected int, p_run_id uuid, p_game_id uuid, p_question int, p_correct int) returns int` — new version or `-1`.
  - `draw_spin(p_event_id uuid, p_expected int, p_run_id uuid, p_game_id uuid, p_prize_no int, p_count int, p_checkpoint_id uuid, p_exclude text[], p_spin_ends_at timestamptz) returns uuid[]` — winners, or `null` when stale.
- Produces (TS): `Event.host_token: string | null`, `Event.display_token: string | null`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0046_games.sql`:

```sql
-- Live games (spec 2026-09-26-live-games-design.md, D250–D289): a tap race, last one standing
-- and a lucky draw, played from phones and shown on the LED. One stage row per event is the
-- single source of truth; host actions write it through compare-and-set, and timed phases move
-- on by the clock when read (resolveStage in src/lib/games/phase.ts), so nothing here runs on a
-- timer.

-- The host console's and the LED's authority (D252). Separate from each other and from
-- crew_token: the AV laptop should only be able to show, and door crew are not the stage crew.
-- Unique across the table because each is looked up on its own, before any event is known.
alter table events add column host_token text unique;
alter table events add column display_token text unique;

create table games (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  event_id uuid not null references events(id) on delete cascade,
  kind text not null check (kind in ('tap_race', 'survival', 'draw')),
  title text not null,
  -- Validated per kind in src/lib/games/config.ts. Keys may be added, never removed.
  config jsonb not null default '{}'::jsonb,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index games_event_idx on games (event_id, position);

-- One play-through. "Run again" is a new row, so every round's results are kept.
create table game_runs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  game_id uuid not null references games(id) on delete cascade,
  -- How a race's lanes were grouped for this run (D263): {"by":"solo"|"category"} or
  -- {"by":"field","key":...,"label":...}. Unused by the other kinds.
  grouping jsonb not null default '{"by":"solo"}'::jsonb,
  started_at timestamptz not null default now()
);
create index game_runs_game_idx on game_runs (game_id);

-- At most one live game per event (D250). No row is idle, at version 0.
-- game_id/run_id are SET NULL, not cascaded: deleting a game mid-play must leave a stage that
-- reads as idle (resolveStage), not a missing row that resets the version clients hold.
create table game_stage (
  event_id uuid primary key references events(id) on delete cascade,
  run_id uuid references game_runs(id) on delete set null,
  game_id uuid references games(id) on delete set null,
  phase text not null default 'idle',
  phase_data jsonb not null default '{}'::jsonb,
  phase_ends_at timestamptz,
  version int not null default 0,
  updated_at timestamptz not null default now()
);

-- One row per player per race, so 500 phones' batches never queue on a shared counter (D266).
-- lane_key is snapshotted at join (D264): editing an attendee mid-race does not move them.
create table race_taps (
  run_id uuid not null references game_runs(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,
  lane_key text not null,
  taps int not null default 0,
  last_tap_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (run_id, attendee_id)
);

-- out_at_question is written once, by survival_reveal (D272). Null = still in.
create table survival_players (
  run_id uuid not null references game_runs(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,
  out_at_question int,
  joined_at timestamptz not null default now(),
  primary key (run_id, attendee_id)
);

-- The primary key IS the one-answer-per-question rule: the first insert wins.
create table survival_answers (
  run_id uuid not null references game_runs(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,
  question_no int not null,
  choice int not null,
  answered_at timestamptz not null default now(),
  primary key (run_id, attendee_id, question_no)
);

-- void = "not here", redrawn (D281). Kept on record; excluded from "past winners".
create table draw_winners (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  game_id uuid not null references games(id) on delete cascade,
  prize_no int not null,
  attendee_id uuid not null references attendees(id) on delete cascade,
  drawn_at timestamptz not null default now(),
  void boolean not null default false
);
create index draw_winners_event_idx on draw_winners (event_id);
create index draw_winners_game_idx on draw_winners (game_id);

alter table games enable row level security;
alter table game_runs enable row level security;
alter table game_stage enable row level security;
alter table race_taps enable row level security;
alter table survival_players enable row level security;
alter table survival_answers enable row level security;
alter table draw_winners enable row level security;
-- No policies on purpose: only the service role (which bypasses RLS) may access data.

-- Compare-and-set on the stage (D261). Two crew phones pressing Next together: the first
-- moves the version on, the second's expected version is stale and it gets -1.
create or replace function game_stage_write(
  p_event_id uuid, p_expected int, p_run_id uuid, p_game_id uuid,
  p_phase text, p_phase_data jsonb, p_phase_ends_at timestamptz
) returns int
language plpgsql
as $$
declare
  v int;
begin
  insert into game_stage (event_id) values (p_event_id) on conflict (event_id) do nothing;
  update game_stage
     set run_id = p_run_id, game_id = p_game_id, phase = p_phase,
         phase_data = coalesce(p_phase_data, '{}'::jsonb), phase_ends_at = p_phase_ends_at,
         version = version + 1, updated_at = now()
   where event_id = p_event_id and version = p_expected
  returning version into v;
  return coalesce(v, -1);
end;
$$;

-- Adds a phone's batch of taps (D266). At most ceil(15 × seconds since this player's last
-- accepted batch), elapsed capped at 3 s, and only inside the live window plus 1.5 s grace.
-- Mirrored by tapAllowance in src/lib/games/race.ts; change both together.
create or replace function race_add_taps(
  p_run_id uuid, p_attendee_id uuid, p_n int, p_live_from timestamptz, p_live_until timestamptz
) returns int
language plpgsql
as $$
declare
  r race_taps%rowtype;
  elapsed double precision;
  accepted int;
begin
  if p_n is null or p_n <= 0 then return 0; end if;
  if now() < p_live_from or now() > p_live_until + interval '1.5 seconds' then return 0; end if;
  select * into r from race_taps where run_id = p_run_id and attendee_id = p_attendee_id for update;
  if not found then return 0; end if;
  elapsed := least(greatest(extract(epoch from (now() - coalesce(r.last_tap_at, p_live_from))), 0), 3);
  accepted := least(p_n, ceil(15 * elapsed)::int);
  if accepted <= 0 then return 0; end if;
  update race_taps set taps = taps + accepted, last_tap_at = now()
   where run_id = p_run_id and attendee_id = p_attendee_id;
  return accepted;
end;
$$;

-- Reveals a question (D272), atomically with the stage move so a second Reveal cannot
-- eliminate twice. No answer counts as wrong. If every player still in is wrong, nobody is
-- eliminated. Mirrored by revealOutcome in src/lib/games/survival.ts; change both together.
create or replace function survival_reveal(
  p_event_id uuid, p_expected int, p_run_id uuid, p_game_id uuid, p_question int, p_correct int
) returns int
language plpgsql
as $$
declare
  v int;
  alive int;
  wrong int;
  everyone boolean;
begin
  update game_stage set version = version + 1, updated_at = now()
   where event_id = p_event_id and version = p_expected and run_id = p_run_id
  returning version into v;
  if v is null then return -1; end if;

  select count(*) into alive from survival_players
   where run_id = p_run_id and out_at_question is null;
  select count(*) into wrong from survival_players p
   where p.run_id = p_run_id and p.out_at_question is null
     and not exists (
       select 1 from survival_answers a
        where a.run_id = p.run_id and a.attendee_id = p.attendee_id
          and a.question_no = p_question and a.choice = p_correct);
  everyone := alive > 0 and wrong = alive;

  if not everyone and wrong > 0 then
    update survival_players p set out_at_question = p_question
     where p.run_id = p_run_id and p.out_at_question is null
       and not exists (
         select 1 from survival_answers a
          where a.run_id = p.run_id and a.attendee_id = p.attendee_id
            and a.question_no = p_question and a.choice = p_correct);
  end if;

  update game_stage
     set phase = 'survival_reveal', game_id = p_game_id, phase_ends_at = null,
         phase_data = jsonb_build_object(
           'question', p_question,
           'eliminated', case when everyone then 0 else wrong end,
           'remaining', case when everyone then alive else alive - wrong end,
           'everyone_survived', everyone)
   where event_id = p_event_id;
  return v;
end;
$$;

-- Draws winners (D278, D280), atomically with the stage move to draw_spinning so a double tap
-- cannot draw twice. Pool: checked in at the checkpoint, category not excluded (trimmed,
-- case-insensitive), not already a standing winner of ANY draw in this event. Ordered by
-- gen_random_uuid(), which draws from a cryptographic source. Mirrored by eligiblePool in
-- src/lib/games/draw.ts; change both together.
create or replace function draw_spin(
  p_event_id uuid, p_expected int, p_run_id uuid, p_game_id uuid, p_prize_no int, p_count int,
  p_checkpoint_id uuid, p_exclude text[], p_spin_ends_at timestamptz
) returns uuid[]
language plpgsql
as $$
declare
  v int;
  picked uuid[];
begin
  if not exists (select 1 from games where id = p_game_id and event_id = p_event_id and kind = 'draw') then
    return null;
  end if;
  update game_stage set version = version + 1, updated_at = now()
   where event_id = p_event_id and version = p_expected
  returning version into v;
  if v is null then return null; end if;

  select coalesce(array_agg(s.id), '{}'::uuid[]) into picked from (
    select a.id from attendees a
     where a.event_id = p_event_id
       and exists (select 1 from checkins c where c.attendee_id = a.id and c.checkpoint_id = p_checkpoint_id)
       and not (lower(btrim(coalesce(a.category, ''))) = any (
         array(select lower(btrim(x)) from unnest(coalesce(p_exclude, '{}'::text[])) x)))
       and not exists (
         select 1 from draw_winners w
          where w.event_id = p_event_id and w.attendee_id = a.id and not w.void)
     order by gen_random_uuid()
     limit greatest(p_count, 0)
  ) s;

  insert into draw_winners (event_id, game_id, prize_no, attendee_id)
  select p_event_id, p_game_id, p_prize_no, unnest(picked);

  update game_stage
     set run_id = p_run_id, game_id = p_game_id, phase = 'draw_spinning',
         phase_ends_at = p_spin_ends_at,
         phase_data = jsonb_build_object('prize_no', p_prize_no, 'winner_ids', to_jsonb(picked))
   where event_id = p_event_id;
  return picked;
end;
$$;

revoke execute on function game_stage_write(uuid, int, uuid, uuid, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function game_stage_write(uuid, int, uuid, uuid, text, jsonb, timestamptz) to service_role;
revoke execute on function race_add_taps(uuid, uuid, int, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function race_add_taps(uuid, uuid, int, timestamptz, timestamptz) to service_role;
revoke execute on function survival_reveal(uuid, int, uuid, uuid, int, int) from public, anon, authenticated;
grant execute on function survival_reveal(uuid, int, uuid, uuid, int, int) to service_role;
revoke execute on function draw_spin(uuid, int, uuid, uuid, int, int, uuid, text[], timestamptz) from public, anon, authenticated;
grant execute on function draw_spin(uuid, int, uuid, uuid, int, int, uuid, text[], timestamptz) to service_role;
```

- [ ] **Step 2: Add the tokens to the Event type**

In `src/lib/types.ts`, directly after the `crew_token` line (`crew_token: string | null;`), add:

```ts
  /** The host console link's authority (D252). Null until an admin creates one on the Games page. */
  host_token: string | null;
  /** The LED display link's authority (D252). Show-only; separate from the host link. */
  display_token: string | null;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If any test fixture builds a full `Event` literal and now fails, add `host_token: null, display_token: null` to it.)

- [ ] **Step 4: Apply the migration**

Ask the user before applying (the project applies migrations to the live Supabase project `orange_lobby`, id `wfmqwwcolfigjylkgrsv`, via the Supabase MCP `apply_migration`). On a yes, apply with name `0046_games` and the file's contents. Then verify the grants with `execute_sql`:

```sql
select p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authed,
       has_function_privilege('service_role', p.oid, 'execute') as service
  from pg_proc p
 where p.proname in ('game_stage_write', 'race_add_taps', 'survival_reveal', 'draw_spin');
```

Expected: 4 rows, `anon = false`, `authed = false`, `service = true`.

- [ ] **Step 5: Write the database check script**

Create `scripts/games-db-check.mjs`:

```js
// Executable evidence that the live-games RPCs (supabase/migrations/0046_games.sql) enforce
// their rules against a real database. vitest has no database (D141), so the pure mirrors in
// src/lib/games/ are unit-tested there and this proves the SQL agrees.
//
// WHAT THIS PROVES:
//   1. game_stage_write refuses a stale expected version (two crew phones pressing Next).
//   2. race_add_taps caps a batch at ceil(15 × elapsed), refuses taps outside the live window,
//      and refuses a player who never joined.
//   3. survival_reveal eliminates wrong and missing answers; when everyone still in is wrong,
//      nobody is eliminated; a second Reveal with the old version is refused.
//   4. draw_spin draws only checked-in, non-excluded, not-yet-won attendees, and a voided
//      winner can be drawn again.
//   5. Deleting the event removes every game row (cascade).
//
// HOW TO RUN: npm run check:games (node --env-file=.env.local scripts/games-db-check.mjs).
// SAFE TO RE-RUN: it creates its own draft event with a random slug and deletes it in `finally`.
// It never touches the event with slug `ecphub`.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/games-db-check.mjs");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const runId = randomUUID().replaceAll("-", "");
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
};
const must = ({ data, error }) => { if (error) throw error; return data; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const org = must(await db.from("organisations").select("id").limit(1).single());
const event = must(await db.from("events").insert({ org_id: org.id, name: `Games check ${runId}`, slug: `games-check-${runId}` }).select("id, org_id").single());

try {
  const people = must(await db.from("attendees").insert(
    ["Ann Lee", "Ben Tan", "Cai Wong", "Dev Raj"].map((name, i) => ({
      org_id: event.org_id, event_id: event.id, name, token: `${runId}`.slice(0, 11) + "abcd"[i],
      category: i === 3 ? "Crew" : "Staff", source: "import",
    })),
  ).select("id, name"));
  const [ann, ben, cai, dev] = people;

  // 1. Compare-and-set
  const v1 = must(await db.rpc("game_stage_write", { p_event_id: event.id, p_expected: 0, p_run_id: null, p_game_id: null, p_phase: "idle", p_phase_data: {}, p_phase_ends_at: null }));
  const stale = must(await db.rpc("game_stage_write", { p_event_id: event.id, p_expected: 0, p_run_id: null, p_game_id: null, p_phase: "idle", p_phase_data: {}, p_phase_ends_at: null }));
  check("stage write moves the version on", v1 === 1, `got ${v1}`);
  check("stale stage write is refused", stale === -1, `got ${stale}`);

  // 2. Taps
  const race = must(await db.from("games").insert({ org_id: event.org_id, event_id: event.id, kind: "tap_race", title: "Race" }).select("id").single());
  const raceRun = must(await db.from("game_runs").insert({ event_id: event.id, game_id: race.id }).select("id").single());
  must(await db.from("race_taps").insert({ run_id: raceRun.id, attendee_id: ann.id, lane_key: "Staff" }));
  const liveFrom = new Date(Date.now() - 1000).toISOString();
  const liveUntil = new Date(Date.now() + 60_000).toISOString();
  const first = must(await db.rpc("race_add_taps", { p_run_id: raceRun.id, p_attendee_id: ann.id, p_n: 500, p_live_from: liveFrom, p_live_until: liveUntil }));
  check("a batch is capped at ceil(15 × elapsed)", first >= 15 && first <= 30, `accepted ${first} of 500 after ~1 s`);
  const early = must(await db.rpc("race_add_taps", { p_run_id: raceRun.id, p_attendee_id: ann.id, p_n: 5, p_live_from: new Date(Date.now() + 10_000).toISOString(), p_live_until: liveUntil }));
  check("taps before the race starts are refused", early === 0, `got ${early}`);
  const late = must(await db.rpc("race_add_taps", { p_run_id: raceRun.id, p_attendee_id: ann.id, p_n: 5, p_live_from: liveFrom, p_live_until: new Date(Date.now() - 2000).toISOString() }));
  check("taps after the grace window are refused", late === 0, `got ${late}`);
  const stranger = must(await db.rpc("race_add_taps", { p_run_id: raceRun.id, p_attendee_id: ben.id, p_n: 5, p_live_from: liveFrom, p_live_until: liveUntil }));
  check("a player who never joined gets nothing", stranger === 0, `got ${stranger}`);

  // 3. Reveal
  const quiz = must(await db.from("games").insert({ org_id: event.org_id, event_id: event.id, kind: "survival", title: "Quiz" }).select("id").single());
  const quizRun = must(await db.from("game_runs").insert({ event_id: event.id, game_id: quiz.id }).select("id").single());
  must(await db.from("survival_players").insert([ann, ben, cai].map((p) => ({ run_id: quizRun.id, attendee_id: p.id }))));
  const vq = must(await db.rpc("game_stage_write", { p_event_id: event.id, p_expected: 1, p_run_id: quizRun.id, p_game_id: quiz.id, p_phase: "survival_locked", p_phase_data: { question: 0 }, p_phase_ends_at: null }));
  // Ann right, Ben wrong, Cai no answer.
  must(await db.from("survival_answers").insert([{ run_id: quizRun.id, attendee_id: ann.id, question_no: 0, choice: 1 }, { run_id: quizRun.id, attendee_id: ben.id, question_no: 0, choice: 0 }]));
  const vr = must(await db.rpc("survival_reveal", { p_event_id: event.id, p_expected: vq, p_run_id: quizRun.id, p_game_id: quiz.id, p_question: 0, p_correct: 1 }));
  const after = must(await db.from("survival_players").select("attendee_id, out_at_question").eq("run_id", quizRun.id));
  const outIds = after.filter((r) => r.out_at_question === 0).map((r) => r.attendee_id).sort();
  check("wrong and missing answers are eliminated", JSON.stringify(outIds) === JSON.stringify([ben.id, cai.id].sort()));
  const again = must(await db.rpc("survival_reveal", { p_event_id: event.id, p_expected: vq, p_run_id: quizRun.id, p_game_id: quiz.id, p_question: 0, p_correct: 1 }));
  check("a second Reveal with the old version is refused", again === -1, `got ${again}`);
  // Question 1: Ann (the only one left) answers wrong -> everyone survives.
  must(await db.from("survival_answers").insert({ run_id: quizRun.id, attendee_id: ann.id, question_no: 1, choice: 0 }));
  must(await db.rpc("survival_reveal", { p_event_id: event.id, p_expected: vr, p_run_id: quizRun.id, p_game_id: quiz.id, p_question: 1, p_correct: 1 }));
  const annRow = must(await db.from("survival_players").select("out_at_question").eq("run_id", quizRun.id).eq("attendee_id", ann.id).single());
  const stage = must(await db.from("game_stage").select("phase_data").eq("event_id", event.id).single());
  check("everyone wrong means nobody is eliminated", annRow.out_at_question === null && stage.phase_data.everyone_survived === true);

  // 4. Draw
  const cp = must(await db.from("checkpoints").insert({ org_id: event.org_id, event_id: event.id, name: "Day 1", day: "2026-10-01" }).select("id").single());
  must(await db.from("checkins").insert([ann, ben, dev].map((p) => ({ org_id: event.org_id, event_id: event.id, checkpoint_id: cp.id, attendee_id: p.id }))));
  const draw = must(await db.from("games").insert({ org_id: event.org_id, event_id: event.id, kind: "draw", title: "Draw" }).select("id").single());
  const drawRun = must(await db.from("game_runs").insert({ event_id: event.id, game_id: draw.id }).select("id").single());
  let version = must(await db.from("game_stage").select("version").eq("event_id", event.id).single()).version;
  const spin = async (count) => {
    const ids = must(await db.rpc("draw_spin", { p_event_id: event.id, p_expected: version, p_run_id: drawRun.id, p_game_id: draw.id, p_prize_no: 0, p_count: count, p_checkpoint_id: cp.id, p_exclude: [" crew "], p_spin_ends_at: new Date(Date.now() + 5000).toISOString() }));
    version += 1;
    return ids;
  };
  const all = await spin(10);
  check("draw takes only checked-in, non-excluded people", JSON.stringify([...all].sort()) === JSON.stringify([ann.id, ben.id].sort()), `drew ${all.length}`);
  const none = await spin(1);
  check("past winners are excluded", none.length === 0, `drew ${none.length}`);
  must(await db.from("draw_winners").update({ void: true }).eq("game_id", draw.id).eq("attendee_id", ann.id));
  const redraw = await spin(1);
  check("a voided winner can be drawn again", redraw.length === 1 && redraw[0] === ann.id);
  const staleSpin = must(await db.rpc("draw_spin", { p_event_id: event.id, p_expected: version - 1, p_run_id: drawRun.id, p_game_id: draw.id, p_prize_no: 0, p_count: 1, p_checkpoint_id: cp.id, p_exclude: [], p_spin_ends_at: new Date().toISOString() }));
  check("a stale draw is refused", staleSpin === null);

  await sleep(0);
} catch (e) {
  failures += 1;
  console.error("ERROR", e);
} finally {
  const { error } = await db.from("events").delete().eq("id", event.id);
  if (error) console.error("WARNING: could not delete the check event", event.id, error);
  else {
    const left = await Promise.all(["games", "game_runs", "game_stage", "draw_winners"].map((t) =>
      db.from(t).select("event_id", { count: "exact", head: true }).eq("event_id", event.id)));
    check("deleting the event removes every game row", left.every((r) => (r.count ?? 0) === 0));
  }
}
process.exit(failures ? 1 : 0);
```

Add to `package.json` `scripts`, after `check:submit`:

```json
    "check:games": "node --env-file=.env.local scripts/games-db-check.mjs"
```

- [ ] **Step 6: Run the database check**

Run: `npm run check:games`
Expected: every line `PASS`, exit code 0. If the attendee insert fails on a missing column (the schema may have gained a required column), read `src/lib/types.ts` `AttendeeSource` and `supabase/migrations/0001_init.sql` and use a valid value.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0046_games.sql scripts/games-db-check.mjs src/lib/types.ts package.json
git commit -m "feat(games): schema, stage compare-and-set and game RPCs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Game config

**Files:**
- Create: `src/lib/games/config.ts`
- Test: `tests/games-config.test.ts`

**Interfaces:**
- Produces: `GAME_KINDS`, `type GameKind = "tap_race" | "survival" | "draw"`, `GAME_KIND_LABELS`, `type RaceConfig = { duration_s: number }`, `type Question = { text: string; options: string[]; correct: number }`, `type SurvivalConfig = { answer_s: number; questions: Question[] }`, `type Prize = { name: string; quantity: number }`, `type DrawConfig = { checkpoint_id: string | null; exclude_categories: string[]; prizes: Prize[] }`, `type Game` (discriminated on `kind`, fields `id, org_id, event_id, title, position, created_at, kind, config`), `isGameKind(v): v is GameKind`, `defaultConfig(kind)`, `parseConfig(kind, raw) → config | null`, `hydrateGame(row: unknown): Game | null`, `gameSummary(g: Game): string`, and the zod schemas `raceConfigSchema`, `survivalConfigSchema`, `drawConfigSchema`.

- [ ] **Step 1: Write the failing test**

Create `tests/games-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defaultConfig, parseConfig, hydrateGame, gameSummary, isGameKind } from "@/lib/games/config";

const row = (kind: string, config: unknown) => ({
  id: "g1", org_id: "o1", event_id: "e1", title: "Game", position: 0, created_at: "2026-10-01T00:00:00Z", kind, config,
});

describe("defaultConfig", () => {
  it("starts a race at 20 seconds", () => {
    expect(defaultConfig("tap_race")).toEqual({ duration_s: 20 });
  });
  it("starts last one standing with no questions and 10 s answers", () => {
    expect(defaultConfig("survival")).toEqual({ answer_s: 10, questions: [] });
  });
  it("starts a draw with no checkpoint, no exclusions and no prizes", () => {
    expect(defaultConfig("draw")).toEqual({ checkpoint_id: null, exclude_categories: [], prizes: [] });
  });
});

describe("parseConfig", () => {
  it("rejects a race shorter than 10 s", () => {
    expect(parseConfig("tap_race", { duration_s: 5 })).toBeNull();
  });
  it("rejects a question whose correct answer is not one of its options", () => {
    expect(parseConfig("survival", { questions: [{ text: "Q", options: ["A", "B"], correct: 2 }] })).toBeNull();
  });
  it("rejects a question with only one option", () => {
    expect(parseConfig("survival", { questions: [{ text: "Q", options: ["A"], correct: 0 }] })).toBeNull();
  });
  it("trims text and keeps a valid question", () => {
    expect(parseConfig("survival", { questions: [{ text: " Q ", options: [" A", "B "], correct: 1 }] }))
      .toEqual({ answer_s: 10, questions: [{ text: "Q", options: ["A", "B"], correct: 1 }] });
  });
  it("drops keys it does not know, so an older app still reads a newer row", () => {
    expect(parseConfig("tap_race", { duration_s: 30, sound: true })).toEqual({ duration_s: 30 });
  });
  it("reads a null config as the defaults", () => {
    expect(parseConfig("draw", null)).toEqual(defaultConfig("draw"));
  });
});

describe("hydrateGame", () => {
  it("drops an unknown kind", () => {
    expect(hydrateGame(row("quiz", {}))).toBeNull();
  });
  it("drops a config that no longer parses", () => {
    expect(hydrateGame(row("tap_race", { duration_s: "fast" }))).toBeNull();
  });
  it("reads a good row", () => {
    expect(hydrateGame(row("tap_race", { duration_s: 15 }))?.config).toEqual({ duration_s: 15 });
  });
});

describe("isGameKind", () => {
  it("knows the three kinds and nothing else", () => {
    expect(["tap_race", "survival", "draw", "poll"].map(isGameKind)).toEqual([true, true, true, false]);
  });
});

describe("gameSummary", () => {
  it("describes a race", () => {
    expect(gameSummary(hydrateGame(row("tap_race", {}))!)).toBe("20 s race");
  });
  it("describes last one standing in the singular", () => {
    const g = hydrateGame(row("survival", { questions: [{ text: "Q", options: ["A", "B"], correct: 0 }] }))!;
    expect(gameSummary(g)).toBe("1 question · 10 s each");
  });
  it("describes a draw by prizes and how many there are to give", () => {
    const g = hydrateGame(row("draw", { prizes: [{ name: "iPad", quantity: 1 }, { name: "Voucher", quantity: 10 }] }))!;
    expect(gameSummary(g)).toBe("2 prizes · 11 to give");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/games-config.test.ts`
Expected: FAIL — cannot resolve `@/lib/games/config`.

- [ ] **Step 3: Implement**

Create `src/lib/games/config.ts`:

```ts
import { z } from "zod";

/**
 * The games an event can run on its LED (D250). Keys may be added but never removed, or
 * stored rows stop parsing — the same rule as `modules`.
 */
export const GAME_KINDS = ["tap_race", "survival", "draw"] as const;
export type GameKind = (typeof GAME_KINDS)[number];

export const GAME_KIND_LABELS: Record<GameKind, string> = {
  tap_race: "Tap race",
  survival: "Last one standing",
  draw: "Lucky draw",
};

export const raceConfigSchema = z.object({
  duration_s: z.number().int().min(10).max(60).default(20),
});

const questionSchema = z
  .object({
    text: z.string().trim().min(1).max(200),
    options: z.array(z.string().trim().min(1).max(60)).min(2).max(4),
    correct: z.number().int().min(0),
  })
  .refine((q) => q.correct < q.options.length, { message: "Pick which option is correct.", path: ["correct"] });

export const survivalConfigSchema = z.object({
  answer_s: z.number().int().min(5).max(30).default(10),
  questions: z.array(questionSchema).max(50).default([]),
});

const prizeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  quantity: z.number().int().min(1).max(500),
});

export const drawConfigSchema = z.object({
  checkpoint_id: z.string().nullable().default(null),
  exclude_categories: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  prizes: z.array(prizeSchema).max(50).default([]),
});

export type RaceConfig = z.infer<typeof raceConfigSchema>;
export type Question = z.infer<typeof questionSchema>;
export type SurvivalConfig = z.infer<typeof survivalConfigSchema>;
export type Prize = z.infer<typeof prizeSchema>;
export type DrawConfig = z.infer<typeof drawConfigSchema>;

type ConfigFor = { tap_race: RaceConfig; survival: SurvivalConfig; draw: DrawConfig };
const SCHEMAS = { tap_race: raceConfigSchema, survival: survivalConfigSchema, draw: drawConfigSchema };

type GameBase = { id: string; org_id: string; event_id: string; title: string; position: number; created_at: string };
export type RaceGame = GameBase & { kind: "tap_race"; config: RaceConfig };
export type SurvivalGame = GameBase & { kind: "survival"; config: SurvivalConfig };
export type DrawGame = GameBase & { kind: "draw"; config: DrawConfig };
export type Game = RaceGame | SurvivalGame | DrawGame;

export function isGameKind(v: unknown): v is GameKind {
  return typeof v === "string" && (GAME_KINDS as readonly string[]).includes(v);
}

/** The config a new game of this kind starts with. */
export function defaultConfig<K extends GameKind>(kind: K): ConfigFor[K] {
  return SCHEMAS[kind].parse({}) as ConfigFor[K];
}

/** The stored config, validated; null when it no longer parses. */
export function parseConfig<K extends GameKind>(kind: K, raw: unknown): ConfigFor[K] | null {
  const r = SCHEMAS[kind].safeParse(raw ?? {});
  return r.success ? (r.data as ConfigFor[K]) : null;
}

/**
 * A `games` row as the app uses it. A row whose kind or config no longer parses is dropped
 * rather than thrown: one bad game must not take the Games page down on event day.
 */
export function hydrateGame(row: unknown): Game | null {
  const r = row as (GameBase & { kind: unknown; config: unknown }) | null;
  if (!r || !isGameKind(r.kind)) return null;
  const config = parseConfig(r.kind, r.config);
  if (!config) return null;
  return {
    id: r.id, org_id: r.org_id, event_id: r.event_id, title: r.title, position: r.position,
    created_at: r.created_at, kind: r.kind, config,
  } as Game;
}

/** One line for the admin list row and the host's game picker. */
export function gameSummary(g: Game): string {
  if (g.kind === "tap_race") return `${g.config.duration_s} s race`;
  if (g.kind === "survival") {
    const n = g.config.questions.length;
    return `${n} question${n === 1 ? "" : "s"} · ${g.config.answer_s} s each`;
  }
  const n = g.config.prizes.length;
  const total = g.config.prizes.reduce((sum, p) => sum + p.quantity, 0);
  return `${n} prize${n === 1 ? "" : "s"} · ${total} to give`;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/games-config.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/config.ts tests/games-config.test.ts
git commit -m "feat(games): per-kind game config

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Stage and phases

**Files:**
- Create: `src/lib/games/phase.ts`
- Test: `tests/games-phase.test.ts`

**Interfaces:**
- Consumes: `GameKind` from Task 2.
- Produces:
  - `PHASES`, `type Phase` (13 values below), `COUNTDOWN_MS = 3000`, `SPIN_MS = 5000`, `GRACE_MS = 1500`
  - `type StageRow = { event_id: string; run_id: string | null; game_id: string | null; phase: Phase; phase_data: Record<string, unknown>; phase_ends_at: string | null; version: number }`
  - `type StageWrite = Pick<StageRow, "run_id" | "game_id" | "phase" | "phase_data" | "phase_ends_at">`
  - `idleStage(eventId, version?)`, `hydrateStage(eventId, row: unknown): StageRow`, `resolveStage(s, now: number): StageRow`, `stageKey(s): string`, `phaseKind(p): GameKind | null`
  - `type HostAction = "open" | "start" | "stop" | "reveal" | "next" | "finish" | "draw" | "present" | "redraw" | "idle"`, `allowedActions(p): HostAction[]`, `canDo(p, a): boolean`
  - writes: `idleWrite()`, `lobbyWrite(game: { id: string; kind: GameKind }, runId)`, `raceStartWrite(s, now, durationS)`, `raceStopWrite(s, now)`, `questionWrite(s, question, now, answerS)`, `overWrite(s, question)`, `drawReadyWrite(s)`
  - readers: `raceWindow(s): { from: number; until: number } | null`, `currentQuestion(s): number | null`, `questionDeadline(s): number | null`, `revealFacts(s): { eliminated: number; remaining: number; everyoneSurvived: boolean } | null`, `spinFacts(s): { prizeNo: number; winnerIds: string[] } | null`

- [ ] **Step 1: Write the failing test**

Create `tests/games-phase.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  idleStage, hydrateStage, resolveStage, stageKey, phaseKind, canDo, allowedActions,
  lobbyWrite, raceStartWrite, raceStopWrite, questionWrite, overWrite, drawReadyWrite, idleWrite,
  raceWindow, currentQuestion, questionDeadline, revealFacts, spinFacts, COUNTDOWN_MS,
  type StageRow,
} from "@/lib/games/phase";

const T0 = Date.parse("2026-10-01T10:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const stage = (over: Partial<StageRow>): StageRow => ({ ...idleStage("e1"), game_id: "g1", run_id: "r1", version: 4, ...over });

describe("hydrateStage", () => {
  it("is idle at version 0 when there is no row", () => {
    expect(hydrateStage("e1", null)).toEqual(idleStage("e1"));
  });
  it("reads an unknown phase as idle but keeps the version", () => {
    expect(hydrateStage("e1", { phase: "poll", version: 7 })).toEqual(idleStage("e1", 7));
  });
});

describe("resolveStage", () => {
  const countdown = stage({
    phase: "race_countdown",
    phase_ends_at: iso(T0 + 3000),
    phase_data: { live_from: iso(T0 + 3000), live_until: iso(T0 + 23000) },
  });

  it("leaves a countdown alone before it ends", () => {
    expect(resolveStage(countdown, T0 + 1000).phase).toBe("race_countdown");
  });
  it("turns an ended countdown into the live race, ending at live_until", () => {
    const s = resolveStage(countdown, T0 + 3000);
    expect(s.phase).toBe("race_live");
    expect(s.phase_ends_at).toBe(iso(T0 + 23000));
  });
  it("chains a long-past countdown straight to results", () => {
    const s = resolveStage(countdown, T0 + 60_000);
    expect(s.phase).toBe("race_results");
    expect(s.phase_ends_at).toBeNull();
  });
  it("locks a question when its time is up", () => {
    const q = stage({ phase: "survival_question", phase_ends_at: iso(T0), phase_data: { question: 0, deadline: iso(T0) } });
    expect(resolveStage(q, T0).phase).toBe("survival_locked");
  });
  it("reveals a draw when the spin ends", () => {
    const d = stage({ phase: "draw_spinning", phase_ends_at: iso(T0), phase_data: { prize_no: 0, winner_ids: ["a1"] } });
    expect(resolveStage(d, T0 + 1).phase).toBe("draw_reveal");
  });
  it("reads a stage whose game was deleted as idle", () => {
    expect(resolveStage(stage({ phase: "race_lobby", game_id: null }), T0)).toEqual(idleStage("e1", 4));
  });
  it("does not change the version", () => {
    expect(resolveStage(countdown, T0 + 60_000).version).toBe(4);
  });
});

describe("stageKey", () => {
  it("changes when the clock moves a phase on, though the version did not", () => {
    const q = stage({ phase: "survival_question", phase_ends_at: iso(T0), phase_data: { question: 0 } });
    expect(stageKey(q)).not.toBe(stageKey(resolveStage(q, T0)));
  });
});

describe("phaseKind", () => {
  it("maps phases to their game kind", () => {
    expect([phaseKind("race_live"), phaseKind("survival_over"), phaseKind("draw_ready"), phaseKind("idle")])
      .toEqual(["tap_race", "survival", "draw", null]);
  });
});

describe("canDo", () => {
  it("only opens a game from idle", () => {
    expect(allowedActions("idle")).toEqual(["open"]);
  });
  it("cannot reveal while a question is still open", () => {
    expect(canDo("survival_question", "reveal")).toBe(false);
    expect(canDo("survival_locked", "reveal")).toBe(true);
  });
  it("allows nothing while a draw spins", () => {
    expect(allowedActions("draw_spinning")).toEqual([]);
  });
  it("lets the host switch games from a finished race without going idle first", () => {
    expect(canDo("race_results", "open")).toBe(true);
  });
});

describe("writes", () => {
  it("opens the right lobby for each kind", () => {
    expect(lobbyWrite({ id: "g1", kind: "tap_race" }, "r1").phase).toBe("race_lobby");
    expect(lobbyWrite({ id: "g1", kind: "survival" }, "r1").phase).toBe("survival_lobby");
    expect(lobbyWrite({ id: "g1", kind: "draw" }, "r1").phase).toBe("draw_ready");
  });
  it("starts a race 3 s from now and runs it for its duration", () => {
    const w = raceStartWrite(stage({ phase: "race_lobby" }), T0, 20);
    expect(w.phase).toBe("race_countdown");
    expect(w.phase_ends_at).toBe(iso(T0 + COUNTDOWN_MS));
    expect(w.phase_data).toEqual({ live_from: iso(T0 + 3000), live_until: iso(T0 + 23000) });
  });
  it("stops a live race now", () => {
    const live = stage({ phase: "race_live", phase_data: { live_from: iso(T0), live_until: iso(T0 + 20000) } });
    expect(raceStopWrite(live, T0 + 5000).phase_data).toEqual({ live_from: iso(T0), live_until: iso(T0 + 5000) });
  });
  it("stopping during the countdown leaves an empty window", () => {
    const cd = stage({ phase: "race_countdown", phase_data: { live_from: iso(T0 + 3000), live_until: iso(T0 + 23000) } });
    const w = raceStopWrite(cd, T0 + 1000);
    expect(w.phase).toBe("race_results");
    expect(w.phase_data).toEqual({ live_from: iso(T0 + 3000), live_until: iso(T0 + 3000) });
  });
  it("gives a question its answer time", () => {
    const w = questionWrite(stage({ phase: "survival_lobby" }), 0, T0, 10);
    expect(w.phase).toBe("survival_question");
    expect(w.phase_ends_at).toBe(iso(T0 + 10000));
    expect(w.phase_data).toEqual({ question: 0, deadline: iso(T0 + 10000) });
  });
  it("keeps the run and game through every in-game write", () => {
    const s = stage({ phase: "survival_reveal" });
    for (const w of [overWrite(s, 3), drawReadyWrite(s)]) expect([w.run_id, w.game_id]).toEqual(["r1", "g1"]);
  });
  it("goes idle with nothing attached", () => {
    expect(idleWrite()).toEqual({ run_id: null, game_id: null, phase: "idle", phase_data: {}, phase_ends_at: null });
  });
});

describe("readers", () => {
  it("reads the race window", () => {
    const s = stage({ phase: "race_live", phase_data: { live_from: iso(T0), live_until: iso(T0 + 20000) } });
    expect(raceWindow(s)).toEqual({ from: T0, until: T0 + 20000 });
  });
  it("reads the question and its deadline", () => {
    const s = stage({ phase: "survival_question", phase_data: { question: 2, deadline: iso(T0) } });
    expect([currentQuestion(s), questionDeadline(s)]).toEqual([2, T0]);
  });
  it("reads the reveal facts", () => {
    const s = stage({ phase: "survival_reveal", phase_data: { question: 0, eliminated: 5, remaining: 3, everyone_survived: false } });
    expect(revealFacts(s)).toEqual({ eliminated: 5, remaining: 3, everyoneSurvived: false });
  });
  it("reads the spin", () => {
    const s = stage({ phase: "draw_spinning", phase_data: { prize_no: 1, winner_ids: ["a1", "a2"] } });
    expect(spinFacts(s)).toEqual({ prizeNo: 1, winnerIds: ["a1", "a2"] });
  });
  it("returns null for data that is not there", () => {
    const s = stage({ phase: "race_lobby" });
    expect([raceWindow(s), currentQuestion(s), revealFacts(s), spinFacts(s)]).toEqual([null, null, null, null]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/games-phase.test.ts`
Expected: FAIL — cannot resolve `@/lib/games/phase`.

- [ ] **Step 3: Implement**

Create `src/lib/games/phase.ts`:

```ts
import type { GameKind } from "@/lib/games/config";

export const PHASES = [
  "idle",
  "race_lobby", "race_countdown", "race_live", "race_results",
  "survival_lobby", "survival_question", "survival_locked", "survival_reveal", "survival_over",
  "draw_ready", "draw_spinning", "draw_reveal",
] as const;
export type Phase = (typeof PHASES)[number];

export const COUNTDOWN_MS = 3000;
export const SPIN_MS = 5000;
/** How late a tap batch or an answer may arrive and still count (D266, D272). */
export const GRACE_MS = 1500;

/** One event's `game_stage` row (D250). */
export type StageRow = {
  event_id: string;
  run_id: string | null;
  game_id: string | null;
  phase: Phase;
  phase_data: Record<string, unknown>;
  phase_ends_at: string | null;
  version: number;
};

/** What a host action writes. The version and event are the RPC's business. */
export type StageWrite = Pick<StageRow, "run_id" | "game_id" | "phase" | "phase_data" | "phase_ends_at">;

export function idleStage(eventId: string, version = 0): StageRow {
  return { event_id: eventId, run_id: null, game_id: null, phase: "idle", phase_data: {}, phase_ends_at: null, version };
}

const isPhase = (v: unknown): v is Phase => typeof v === "string" && (PHASES as readonly string[]).includes(v);

/** A `game_stage` row from the database; idle when there is none or its phase no longer reads. */
export function hydrateStage(eventId: string, row: unknown): StageRow {
  if (!row) return idleStage(eventId);
  const r = row as Partial<StageRow> & { phase?: unknown };
  const version = typeof r.version === "number" ? r.version : 0;
  if (!isPhase(r.phase)) return idleStage(eventId, version);
  return {
    event_id: eventId, run_id: r.run_id ?? null, game_id: r.game_id ?? null, phase: r.phase,
    phase_data: (r.phase_data ?? {}) as Record<string, unknown>, phase_ends_at: r.phase_ends_at ?? null, version,
  };
}

const passed = (iso: string | null, now: number) => iso !== null && now >= Date.parse(iso);
const str = (v: unknown) => (typeof v === "string" ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * The stage as it stands at `now` (D258). Timed phases move on by the clock, not by a job: a
 * countdown whose end has passed IS the live race, and a race whose end has passed IS the
 * results — so a stage read long after a countdown lands on results. A game deleted mid-play
 * (its id nulled by the foreign key) reads as idle. The version is never changed here; only a
 * host write moves it.
 */
export function resolveStage(s: StageRow, now: number): StageRow {
  if (s.phase !== "idle" && !s.game_id) return idleStage(s.event_id, s.version);
  let cur = s;
  if (cur.phase === "race_countdown" && passed(cur.phase_ends_at, now)) {
    cur = { ...cur, phase: "race_live", phase_ends_at: str(cur.phase_data.live_until) };
  }
  if (cur.phase === "race_live" && (cur.phase_ends_at === null || passed(cur.phase_ends_at, now))) {
    return { ...cur, phase: "race_results", phase_ends_at: null };
  }
  if (cur.phase === "survival_question" && passed(cur.phase_ends_at, now)) {
    return { ...cur, phase: "survival_locked", phase_ends_at: null };
  }
  if (cur.phase === "draw_spinning" && passed(cur.phase_ends_at, now)) {
    return { ...cur, phase: "draw_reveal", phase_ends_at: null };
  }
  return cur;
}

/** Changes whenever anything a client shows could have: a host write, or the clock moving a phase on. */
export function stageKey(s: StageRow): string {
  return `${s.version}:${s.phase}`;
}

export function phaseKind(p: Phase): GameKind | null {
  if (p.startsWith("race_")) return "tap_race";
  if (p.startsWith("survival_")) return "survival";
  if (p.startsWith("draw_")) return "draw";
  return null;
}

export type HostAction = "open" | "start" | "stop" | "reveal" | "next" | "finish" | "draw" | "present" | "redraw" | "idle";

/**
 * What the host may do in each phase. "idle" (end the game) is the escape hatch from almost
 * everywhere; not during a countdown or live race (Stop is the control there) or a spin (it
 * lands in five seconds).
 */
const ALLOWED: Record<Phase, HostAction[]> = {
  idle: ["open"],
  race_lobby: ["start", "idle"],
  race_countdown: ["stop"],
  race_live: ["stop"],
  race_results: ["open", "idle"],
  survival_lobby: ["start", "idle"],
  survival_question: ["idle"],
  survival_locked: ["reveal", "idle"],
  survival_reveal: ["next", "finish", "idle"],
  survival_over: ["open", "idle"],
  draw_ready: ["draw", "open", "idle"],
  draw_spinning: [],
  draw_reveal: ["present", "redraw", "idle"],
};

export function allowedActions(p: Phase): HostAction[] {
  return ALLOWED[p];
}

export function canDo(p: Phase, a: HostAction): boolean {
  return ALLOWED[p].includes(a);
}

const keep = (s: StageRow) => ({ run_id: s.run_id, game_id: s.game_id });

export function idleWrite(): StageWrite {
  return { run_id: null, game_id: null, phase: "idle", phase_data: {}, phase_ends_at: null };
}

export function lobbyWrite(game: { id: string; kind: GameKind }, runId: string): StageWrite {
  const phase: Phase = game.kind === "tap_race" ? "race_lobby" : game.kind === "survival" ? "survival_lobby" : "draw_ready";
  return { run_id: runId, game_id: game.id, phase, phase_data: {}, phase_ends_at: null };
}

/** Start: a 3 s countdown, then the race for its duration (D265). Both ends fixed now. */
export function raceStartWrite(s: StageRow, now: number, durationS: number): StageWrite {
  const liveFrom = new Date(now + COUNTDOWN_MS).toISOString();
  const liveUntil = new Date(now + COUNTDOWN_MS + durationS * 1000).toISOString();
  return { ...keep(s), phase: "race_countdown", phase_data: { live_from: liveFrom, live_until: liveUntil }, phase_ends_at: liveFrom };
}

/**
 * Stop: the race ends now. Stopped during the countdown the race never ran, so its window is
 * empty (it ends where it would have started) rather than ending before it began.
 */
export function raceStopWrite(s: StageRow, now: number): StageWrite {
  const from = str(s.phase_data.live_from) ?? new Date(now).toISOString();
  const until = new Date(Math.max(now, Date.parse(from))).toISOString();
  return { ...keep(s), phase: "race_results", phase_data: { live_from: from, live_until: until }, phase_ends_at: null };
}

export function questionWrite(s: StageRow, question: number, now: number, answerS: number): StageWrite {
  const deadline = new Date(now + answerS * 1000).toISOString();
  return { ...keep(s), phase: "survival_question", phase_data: { question, deadline }, phase_ends_at: deadline };
}

export function overWrite(s: StageRow, question: number): StageWrite {
  return { ...keep(s), phase: "survival_over", phase_data: { question }, phase_ends_at: null };
}

export function drawReadyWrite(s: StageRow): StageWrite {
  return { ...keep(s), phase: "draw_ready", phase_data: {}, phase_ends_at: null };
}

export function raceWindow(s: StageRow): { from: number; until: number } | null {
  const from = str(s.phase_data.live_from);
  const until = str(s.phase_data.live_until);
  return from && until ? { from: Date.parse(from), until: Date.parse(until) } : null;
}

export function currentQuestion(s: StageRow): number | null {
  return num(s.phase_data.question);
}

export function questionDeadline(s: StageRow): number | null {
  const d = str(s.phase_data.deadline);
  return d ? Date.parse(d) : null;
}

export function revealFacts(s: StageRow): { eliminated: number; remaining: number; everyoneSurvived: boolean } | null {
  const eliminated = num(s.phase_data.eliminated);
  const remaining = num(s.phase_data.remaining);
  if (eliminated === null || remaining === null) return null;
  return { eliminated, remaining, everyoneSurvived: s.phase_data.everyone_survived === true };
}

export function spinFacts(s: StageRow): { prizeNo: number; winnerIds: string[] } | null {
  const prizeNo = num(s.phase_data.prize_no);
  const ids = s.phase_data.winner_ids;
  if (prizeNo === null || !Array.isArray(ids)) return null;
  return { prizeNo, winnerIds: ids.filter((x): x is string => typeof x === "string") };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/games-phase.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/phase.ts tests/games-phase.test.ts
git commit -m "feat(games): stage phases resolved by the clock, host-action table

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Names and the mosaic

**Files:**
- Create: `src/lib/games/names.ts`, `src/lib/games/mosaic.ts`
- Test: `tests/games-names.test.ts`, `tests/games-mosaic.test.ts`

**Interfaces:**
- Produces:
  - `type Tag = { initials: string; first: string }`, `tag(name: string): Tag`, `tagLabel(name: string): string` ("PR · Priya")
  - `type Tier = "dense" | "medium" | "large" | "finalist"`, `tierFor(n): Tier`, `type Grid = { cols: number; rows: number; cell: number }`, `gridFor(n, width = 1920, height = 1080): Grid`, `seededOrder<T>(items: T[], seed: string): T[]`

- [ ] **Step 1: Write the failing tests**

Create `tests/games-names.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { tag, tagLabel } from "@/lib/games/names";

describe("tag", () => {
  it("takes the first letters of the first two words and the first word", () => {
    expect(tag("Priya Ramasamy")).toEqual({ initials: "PR", first: "Priya" });
  });
  it("uses the first word even when it is a surname (D273)", () => {
    expect(tag("Tan Mei Ling")).toEqual({ initials: "TM", first: "Tan" });
  });
  it("copes with one word, stray spaces and lower case", () => {
    expect(tag("  cher  ")).toEqual({ initials: "C", first: "cher" });
  });
  it("does not split a multi-byte first letter", () => {
    expect(tag("Élodie Martin").initials).toBe("ÉM");
  });
  it("falls back to ? for an empty name", () => {
    expect(tag("   ")).toEqual({ initials: "?", first: "" });
  });
});

describe("tagLabel", () => {
  it("joins initials and first name", () => {
    expect(tagLabel("Priya Ramasamy")).toBe("PR · Priya");
  });
  it("is just the initials when there is no name", () => {
    expect(tagLabel("")).toBe("?");
  });
});
```

Create `tests/games-mosaic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { tierFor, gridFor, seededOrder } from "@/lib/games/mosaic";

describe("tierFor", () => {
  it("picks a tier by how many players are still in", () => {
    expect([500, 200, 199, 50, 49, 6, 5, 1].map(tierFor))
      .toEqual(["dense", "dense", "medium", "medium", "large", "large", "finalist", "finalist"]);
  });
});

describe("gridFor", () => {
  it("gives one player the whole height", () => {
    expect(gridFor(1)).toEqual({ cols: 1, rows: 1, cell: 1080 });
  });
  it("fits every player on a 1920×1080 screen", () => {
    for (const n of [2, 7, 38, 147, 312, 500, 1000]) {
      const g = gridFor(n);
      expect(g.cols * g.rows).toBeGreaterThanOrEqual(n);
      expect(g.cols * g.cell).toBeLessThanOrEqual(1920);
      expect(g.rows * g.cell).toBeLessThanOrEqual(1080);
    }
  });
  it("keeps 500 tiles big enough to read initials", () => {
    expect(gridFor(500).cell).toBeGreaterThanOrEqual(55);
  });
});

describe("seededOrder", () => {
  const ids = Array.from({ length: 20 }, (_, i) => `a${i}`);
  it("is a permutation", () => {
    expect([...seededOrder(ids, "r1:0")].sort()).toEqual([...ids].sort());
  });
  it("is the same for the same seed, so a reload replays the ripple", () => {
    expect(seededOrder(ids, "r1:0")).toEqual(seededOrder(ids, "r1:0"));
  });
  it("differs between questions", () => {
    expect(seededOrder(ids, "r1:0")).not.toEqual(seededOrder(ids, "r1:1"));
  });
  it("does not change its input", () => {
    const copy = [...ids];
    seededOrder(ids, "x");
    expect(ids).toEqual(copy);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/games-names.test.ts tests/games-mosaic.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

Create `src/lib/games/names.ts`:

```ts
/**
 * How a player is named on the LED (D273): initials plus first name, everywhere but a winner
 * card. "First name" is the first word of `attendees.name`; for surname-first names that is the
 * surname, and the initials still tell two Tans apart.
 */
export type Tag = { initials: string; first: string };

const words = (name: string) => name.trim().split(/\s+/).filter(Boolean);
// Array.from splits by code point, so "É" is one letter rather than half a surrogate pair.
const firstLetter = (w: string) => (Array.from(w)[0] ?? "").toUpperCase();

export function tag(name: string): Tag {
  const w = words(name);
  return { initials: w.slice(0, 2).map(firstLetter).join("") || "?", first: w[0] ?? "" };
}

export function tagLabel(name: string): string {
  const t = tag(name);
  return t.first ? `${t.initials} · ${t.first}` : t.initials;
}
```

Create `src/lib/games/mosaic.ts`:

```ts
/** The last-one-standing mosaic (D274, D275): one tile per player on a 1920×1080 canvas. */
export type Tier = "dense" | "medium" | "large" | "finalist";

/** Bigger tiles as the field narrows. Type scales with the tile; the content never changes (D273). */
export function tierFor(n: number): Tier {
  if (n <= 5) return "finalist";
  if (n < 50) return "large";
  if (n < 200) return "medium";
  return "dense";
}

export type Grid = { cols: number; rows: number; cell: number };

/** The column count that gives the largest square tiles for `n` players. */
export function gridFor(n: number, width = 1920, height = 1080): Grid {
  const count = Math.max(1, Math.floor(n));
  let best: Grid = { cols: 1, rows: count, cell: 0 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const cell = Math.floor(Math.min(width / cols, height / rows));
    if (cell > best.cell) best = { cols, rows, cell };
  }
  return best;
}

// FNV-1a: a stable 32-bit hash of the seed string.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32: a small seeded PRNG. Not for secrets — only for the order tiles go dark in.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A shuffle that is the same every time for the same seed (D275): seeded by run and question,
 * so an LED reloaded mid-reveal replays the ripple identically.
 */
export function seededOrder<T>(items: T[], seed: string): T[] {
  const rand = mulberry32(hash(seed));
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run tests/games-names.test.ts tests/games-mosaic.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/names.ts src/lib/games/mosaic.ts tests/games-names.test.ts tests/games-mosaic.test.ts
git commit -m "feat(games): LED name tags and mosaic layout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Tap race rules

**Files:**
- Create: `src/lib/games/race.ts`
- Test: `tests/games-race.test.ts`

**Interfaces:**
- Consumes: `tagLabel` (Task 4), `fieldValue` from `@/lib/attendee-values`, `Attendee` from `@/lib/types`.
- Produces: `type Grouping = { by: "solo" } | { by: "category" } | { by: "field"; key: string; label: string }`, `OTHERS = "__others"`, `TAP_RATE = 15`, `TAP_ELAPSED_CAP_S = 3`, `MAX_LANES = 12`, `MAX_SOLO = 10`, `parseGrouping(raw): Grouping`, `laneKeyFor(a, g): string`, `laneLabel(key, g, nameOf?): string`, `type TapRow = { attendee_id: string; lane_key: string; taps: number }`, `type LaneStanding = { key: string; players: number; active: number; taps: number; score: number; place: number }`, `standings(rows): LaneStanding[]`, `topTapper(rows): TapRow | null`, `tapAllowance(n, elapsedMs): number`, `visibleLanes(list, g): LaneStanding[]`

- [ ] **Step 1: Write the failing test**

Create `tests/games-race.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  parseGrouping, laneKeyFor, laneLabel, standings, topTapper, tapAllowance, visibleLanes, OTHERS,
  type Grouping, type TapRow,
} from "@/lib/games/race";

const person = (over: Partial<{ id: string; category: string | null; extra: Record<string, string> }> = {}) =>
  ({ id: "a1", category: null, extra: {}, ...over });
const byTable: Grouping = { by: "field", key: "table_no", label: "Table" };

describe("parseGrouping", () => {
  it("reads each shape", () => {
    expect(parseGrouping({ by: "category" })).toEqual({ by: "category" });
    expect(parseGrouping({ by: "field", key: "table_no", label: "Table" })).toEqual(byTable);
  });
  it("falls back to solo for anything else", () => {
    expect([parseGrouping(null), parseGrouping({ by: "field" }), parseGrouping({ by: "team" })])
      .toEqual([{ by: "solo" }, { by: "solo" }, { by: "solo" }]);
  });
  it("labels a field by its key when it has no label", () => {
    expect(parseGrouping({ by: "field", key: "dept" })).toEqual({ by: "field", key: "dept", label: "dept" });
  });
});

describe("laneKeyFor", () => {
  it("is the attendee in solo", () => {
    expect(laneKeyFor(person({ id: "a9" }), { by: "solo" })).toBe("a9");
  });
  it("is the trimmed category", () => {
    expect(laneKeyFor(person({ category: " Sales " }), { by: "category" })).toBe("Sales");
  });
  it("is the field value", () => {
    expect(laneKeyFor(person({ extra: { table_no: "7" } }), byTable)).toBe("7");
  });
  it("puts people with no value in Others", () => {
    expect(laneKeyFor(person(), byTable)).toBe(OTHERS);
    expect(laneKeyFor(person({ category: "  " }), { by: "category" })).toBe(OTHERS);
  });
});

describe("laneLabel", () => {
  it("labels a bare number with its field (D263)", () => {
    expect(laneLabel("7", byTable)).toBe("Table 7");
  });
  it("uses any other value as it is", () => {
    expect(laneLabel("Sales", { by: "field", key: "dept", label: "Department" })).toBe("Sales");
  });
  it("names the Others lane", () => {
    expect(laneLabel(OTHERS, byTable)).toBe("Others");
  });
  it("names a solo lane by initials and first name", () => {
    expect(laneLabel("a1", { by: "solo" }, () => "Priya Ramasamy")).toBe("PR · Priya");
  });
});

describe("standings", () => {
  const rows: TapRow[] = [
    { attendee_id: "a", lane_key: "7", taps: 100 },
    { attendee_id: "b", lane_key: "7", taps: 50 },
    { attendee_id: "c", lane_key: "7", taps: 0 },
    { attendee_id: "d", lane_key: "12", taps: 90 },
  ];
  it("ranks by average taps per player who tapped (D267)", () => {
    expect(standings(rows).map((l) => [l.key, l.score, l.place])).toEqual([["12", 90, 1], ["7", 75, 2]]);
  });
  it("counts everyone who joined, and separately who tapped", () => {
    expect(standings(rows).find((l) => l.key === "7")).toMatchObject({ players: 3, active: 2, taps: 150 });
  });
  it("scores a lane where nobody tapped as zero", () => {
    expect(standings([{ attendee_id: "a", lane_key: "3", taps: 0 }])[0].score).toBe(0);
  });
  it("breaks a tied score by total taps", () => {
    const tie: TapRow[] = [
      { attendee_id: "a", lane_key: "A", taps: 10 },
      { attendee_id: "b", lane_key: "B", taps: 10 },
      { attendee_id: "c", lane_key: "B", taps: 10 },
    ];
    expect(standings(tie).map((l) => l.key)).toEqual(["B", "A"]);
  });
});

describe("topTapper", () => {
  it("finds the fastest individual", () => {
    expect(topTapper([{ attendee_id: "a", lane_key: "1", taps: 3 }, { attendee_id: "b", lane_key: "1", taps: 9 }])?.attendee_id).toBe("b");
  });
  it("is nobody when nobody tapped", () => {
    expect(topTapper([{ attendee_id: "a", lane_key: "1", taps: 0 }])).toBeNull();
  });
});

describe("tapAllowance", () => {
  it("allows 15 taps per second since the last batch", () => {
    expect(tapAllowance(100, 1000)).toBe(15);
  });
  it("accepts an honest batch whole", () => {
    expect(tapAllowance(9, 1000)).toBe(9);
  });
  it("caps the elapsed time at 3 s, so a quiet phone cannot bank taps", () => {
    expect(tapAllowance(500, 60_000)).toBe(45);
  });
  it("never goes negative", () => {
    expect([tapAllowance(-5, 1000), tapAllowance(5, -1000)]).toEqual([0, 0]);
  });
});

describe("visibleLanes", () => {
  const many = Array.from({ length: 15 }, (_, i) => ({ key: String(i), players: 1, active: 1, taps: 1, score: 1, place: i + 1 }));
  it("shows 12 lanes for teams and 10 for solo", () => {
    expect(visibleLanes(many, byTable)).toHaveLength(12);
    expect(visibleLanes(many, { by: "solo" })).toHaveLength(10);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/games-race.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/games/race.ts`:

```ts
import type { Attendee } from "@/lib/types";
import { fieldValue } from "@/lib/attendee-values";
import { tagLabel } from "@/lib/games/names";

/**
 * How a race's lanes are made (D263): the attendee's category, any attendee field the event
 * defines (table, company and department are ordinary fields in `extra`), or every player alone.
 */
export type Grouping = { by: "solo" } | { by: "category" } | { by: "field"; key: string; label: string };

export const OTHERS = "__others";
export const TAP_RATE = 15;
export const TAP_ELAPSED_CAP_S = 3;
export const MAX_LANES = 12;
export const MAX_SOLO = 10;

export function parseGrouping(raw: unknown): Grouping {
  const r = raw as { by?: unknown; key?: unknown; label?: unknown } | null | undefined;
  if (r?.by === "category") return { by: "category" };
  if (r?.by === "field" && typeof r.key === "string" && r.key) {
    return { by: "field", key: r.key, label: typeof r.label === "string" && r.label ? r.label : r.key };
  }
  return { by: "solo" };
}

/** The lane a player races in. Snapshotted when they join (D264). */
export function laneKeyFor(a: Pick<Attendee, "id" | "category" | "extra">, g: Grouping): string {
  if (g.by === "solo") return a.id;
  const v = g.by === "category" ? (a.category ?? "").trim() : fieldValue(a, g.key);
  return v || OTHERS;
}

/** "Table 7" for a bare number, the value itself otherwise (D263). */
export function laneLabel(key: string, g: Grouping, nameOf: (id: string) => string = () => ""): string {
  if (key === OTHERS) return "Others";
  if (g.by === "solo") return tagLabel(nameOf(key));
  if (g.by === "field" && /^\d+$/.test(key)) return `${g.label} ${key}`;
  return key;
}

export type TapRow = { attendee_id: string; lane_key: string; taps: number };
export type LaneStanding = { key: string; players: number; active: number; taps: number; score: number; place: number };

/**
 * Lanes ranked by average taps per player who tapped at all (D267). Averaging stops a big
 * table beating a small one by size; leaving out zero-tap players stops someone who joined
 * and put their phone down dragging their lane down.
 */
export function standings(rows: TapRow[]): LaneStanding[] {
  const lanes = new Map<string, { players: number; active: number; taps: number }>();
  for (const r of rows) {
    const l = lanes.get(r.lane_key) ?? { players: 0, active: 0, taps: 0 };
    l.players += 1;
    if (r.taps > 0) { l.active += 1; l.taps += r.taps; }
    lanes.set(r.lane_key, l);
  }
  return [...lanes.entries()]
    .map(([key, l]) => ({ key, ...l, score: l.active ? Math.round((l.taps / l.active) * 10) / 10 : 0 }))
    .sort((a, b) => b.score - a.score || b.taps - a.taps || a.key.localeCompare(b.key))
    .map((l, i) => ({ ...l, place: i + 1 }));
}

export function topTapper(rows: TapRow[]): TapRow | null {
  let best: TapRow | null = null;
  for (const r of rows) if (r.taps > 0 && (!best || r.taps > best.taps)) best = r;
  return best;
}

/**
 * How many of a batch count (D266): at most 15 per second since the player's last accepted
 * batch, with that time capped at 3 s. Mirrors race_add_taps in 0046_games.sql.
 */
export function tapAllowance(n: number, elapsedMs: number): number {
  const want = Math.max(0, Math.floor(n));
  const elapsed = Math.min(Math.max(elapsedMs, 0), TAP_ELAPSED_CAP_S * 1000);
  return Math.min(want, Math.ceil((TAP_RATE * elapsed) / 1000));
}

/** The lanes the LED shows while racing (D268); the full ranking is shown at the end. */
export function visibleLanes(list: LaneStanding[], g: Grouping): LaneStanding[] {
  return list.slice(0, g.by === "solo" ? MAX_SOLO : MAX_LANES);
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/games-race.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/race.ts tests/games-race.test.ts
git commit -m "feat(games): tap race lanes, scoring and tap cap

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Last one standing rules

**Files:**
- Create: `src/lib/games/survival.ts`
- Test: `tests/games-survival.test.ts`

**Interfaces:**
- Consumes: `GRACE_MS` (Task 3).
- Produces: `type PlayerRow = { attendee_id: string; out_at_question: number | null }`, `stillIn(rows): string[]`, `inGoingInto(rows, q): string[]`, `outAt(rows, q): string[]`, `type RevealOutcome = { eliminated: string[]; survivors: string[]; everyoneSurvived: boolean }`, `revealOutcome(alive, answers: ReadonlyMap<string, number>, correct): RevealOutcome`, `answerSplit(choices: number[], optionCount): number[]`, `isOver(remaining, question, total): boolean`, `answerAccepted(deadlineMs: number, now: number): boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/games-survival.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { stillIn, inGoingInto, outAt, revealOutcome, answerSplit, isOver, answerAccepted, type PlayerRow } from "@/lib/games/survival";

const rows: PlayerRow[] = [
  { attendee_id: "a", out_at_question: null },
  { attendee_id: "b", out_at_question: 0 },
  { attendee_id: "c", out_at_question: 1 },
  { attendee_id: "d", out_at_question: null },
];

describe("who is in", () => {
  it("is still in when never eliminated", () => {
    expect(stillIn(rows)).toEqual(["a", "d"]);
  });
  it("was in going into a question if eliminated at it or later", () => {
    expect(inGoingInto(rows, 1)).toEqual(["a", "c", "d"]);
  });
  it("knows who went out at a question", () => {
    expect(outAt(rows, 1)).toEqual(["c"]);
  });
});

describe("revealOutcome", () => {
  it("eliminates wrong answers and missing ones (D272)", () => {
    const r = revealOutcome(["a", "b", "c"], new Map([["a", 1], ["b", 0]]), 1);
    expect(r).toEqual({ eliminated: ["b", "c"], survivors: ["a"], everyoneSurvived: false });
  });
  it("eliminates nobody when everyone still in is wrong", () => {
    const r = revealOutcome(["a", "b"], new Map([["a", 0]]), 1);
    expect(r).toEqual({ eliminated: [], survivors: ["a", "b"], everyoneSurvived: true });
  });
  it("is not 'everyone survives' when nobody is playing", () => {
    expect(revealOutcome([], new Map(), 0).everyoneSurvived).toBe(false);
  });
});

describe("answerSplit", () => {
  it("counts each option and ignores out-of-range choices", () => {
    expect(answerSplit([0, 2, 2, 5, -1], 3)).toEqual([1, 0, 2]);
  });
});

describe("isOver", () => {
  it("ends when one player is left", () => {
    expect(isOver(1, 0, 10)).toBe(true);
  });
  it("ends after the last question", () => {
    expect(isOver(12, 9, 10)).toBe(true);
  });
  it("carries on otherwise", () => {
    expect(isOver(12, 3, 10)).toBe(false);
  });
});

describe("answerAccepted", () => {
  const deadline = Date.parse("2026-10-01T10:00:00Z");
  it("accepts up to 1.5 s after the deadline", () => {
    expect(answerAccepted(deadline, deadline + 1500)).toBe(true);
  });
  it("refuses anything later", () => {
    expect(answerAccepted(deadline, deadline + 1501)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/games-survival.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/games/survival.ts`:

```ts
import { GRACE_MS } from "@/lib/games/phase";

/** One `survival_players` row. `out_at_question` is written once, by the reveal (D272). */
export type PlayerRow = { attendee_id: string; out_at_question: number | null };

export function stillIn(rows: PlayerRow[]): string[] {
  return rows.filter((r) => r.out_at_question === null).map((r) => r.attendee_id);
}

/** Everyone who was in when question `q` was asked: the mosaic the reveal starts from (D275). */
export function inGoingInto(rows: PlayerRow[], q: number): string[] {
  return rows.filter((r) => r.out_at_question === null || r.out_at_question >= q).map((r) => r.attendee_id);
}

export function outAt(rows: PlayerRow[], q: number): string[] {
  return rows.filter((r) => r.out_at_question === q).map((r) => r.attendee_id);
}

export type RevealOutcome = { eliminated: string[]; survivors: string[]; everyoneSurvived: boolean };

/**
 * Who a reveal knocks out (D272). No answer is a wrong answer. If every player still in is
 * wrong, nobody goes out, so the game can never end with zero players. Mirrors survival_reveal
 * in 0046_games.sql.
 */
export function revealOutcome(alive: string[], answers: ReadonlyMap<string, number>, correct: number): RevealOutcome {
  const wrong = alive.filter((id) => answers.get(id) !== correct);
  if (alive.length > 0 && wrong.length === alive.length) {
    return { eliminated: [], survivors: [...alive], everyoneSurvived: true };
  }
  const out = new Set(wrong);
  return { eliminated: wrong, survivors: alive.filter((id) => !out.has(id)), everyoneSurvived: false };
}

/** How many picked each option, for the LED's locked screen (D276). */
export function answerSplit(choices: number[], optionCount: number): number[] {
  const counts = Array.from({ length: optionCount }, () => 0);
  for (const c of choices) if (c >= 0 && c < optionCount) counts[c] += 1;
  return counts;
}

/** One player left, or no questions left: time for the winner (D272). */
export function isOver(remaining: number, question: number, total: number): boolean {
  return remaining <= 1 || question >= total - 1;
}

export function answerAccepted(deadlineMs: number, now: number): boolean {
  return now <= deadlineMs + GRACE_MS;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/games-survival.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/survival.ts tests/games-survival.test.ts
git commit -m "feat(games): last one standing elimination rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Lucky draw rules

**Files:**
- Create: `src/lib/games/draw.ts`
- Test: `tests/games-draw.test.ts`

**Interfaces:**
- Consumes: `Prize` (Task 2), `Attendee` from `@/lib/types`.
- Produces: `type WinnerRow = { id: string; event_id: string; game_id: string; prize_no: number; attendee_id: string; drawn_at: string; void: boolean }`, `eligiblePool<A>(attendees, checkedIn: ReadonlySet<string>, exclude: string[], pastWinners: ReadonlySet<string>): A[]`, `standingWinners(rows): Set<string>`, `type PrizeProgress = { prize_no: number; name: string; quantity: number; given: number; remaining: number }`, `prizeProgress(prizes, winners): PrizeProgress[]`, `nextPrize(progress): PrizeProgress | null`, `drawCount(prize, mode: "one" | "all", pool): number`

- [ ] **Step 1: Write the failing test**

Create `tests/games-draw.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { eligiblePool, standingWinners, prizeProgress, nextPrize, drawCount, type WinnerRow } from "@/lib/games/draw";

const a = (id: string, category: string | null = "Staff") => ({ id, category });
const win = (attendee_id: string, prize_no = 0, isVoid = false): WinnerRow =>
  ({ id: `w-${attendee_id}`, event_id: "e1", game_id: "g1", prize_no, attendee_id, drawn_at: "2026-10-01T10:00:00Z", void: isVoid });

describe("eligiblePool", () => {
  const people = [a("1"), a("2", " crew "), a("3", null), a("4")];
  it("takes only people checked in at the checkpoint (D278)", () => {
    expect(eligiblePool(people, new Set(["1", "3"]), [], new Set()).map((p) => p.id)).toEqual(["1", "3"]);
  });
  it("excludes categories, trimmed and case-insensitive", () => {
    expect(eligiblePool(people, new Set(["1", "2"]), ["Crew"], new Set()).map((p) => p.id)).toEqual(["1"]);
  });
  it("keeps people with no category", () => {
    expect(eligiblePool(people, new Set(["3"]), ["Crew"], new Set()).map((p) => p.id)).toEqual(["3"]);
  });
  it("excludes past winners", () => {
    expect(eligiblePool(people, new Set(["1", "4"]), [], new Set(["4"])).map((p) => p.id)).toEqual(["1"]);
  });
});

describe("standingWinners", () => {
  it("leaves out voided winners, who may win again", () => {
    expect([...standingWinners([win("1"), win("2", 0, true)])]).toEqual(["1"]);
  });
});

describe("prizeProgress", () => {
  const prizes = [{ name: "Voucher", quantity: 3 }, { name: "iPad", quantity: 1 }];
  it("counts what each prize has given, ignoring voids", () => {
    expect(prizeProgress(prizes, [win("1"), win("2"), win("3", 0, true)])).toEqual([
      { prize_no: 0, name: "Voucher", quantity: 3, given: 2, remaining: 1 },
      { prize_no: 1, name: "iPad", quantity: 1, given: 0, remaining: 1 },
    ]);
  });
  it("draws in list order (D279)", () => {
    expect(nextPrize(prizeProgress(prizes, [win("1"), win("2"), win("3")]))?.name).toBe("iPad");
  });
  it("has no next prize when all are given", () => {
    expect(nextPrize(prizeProgress(prizes, [win("1"), win("2"), win("3"), win("4", 1)]))).toBeNull();
  });
});

describe("drawCount", () => {
  const prize = { prize_no: 0, name: "Voucher", quantity: 10, given: 4, remaining: 6 };
  it("draws one", () => {
    expect(drawCount(prize, "one", 100)).toBe(1);
  });
  it("draws all remaining", () => {
    expect(drawCount(prize, "all", 100)).toBe(6);
  });
  it("never draws more than the pool holds", () => {
    expect([drawCount(prize, "all", 2), drawCount(prize, "one", 0)]).toEqual([2, 0]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/games-draw.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/games/draw.ts`:

```ts
import type { Attendee } from "@/lib/types";
import type { Prize } from "@/lib/games/config";

export type WinnerRow = {
  id: string;
  event_id: string;
  game_id: string;
  prize_no: number;
  attendee_id: string;
  drawn_at: string;
  void: boolean;
};

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Who can win (D278): checked in at the draw's checkpoint, category not excluded, not already
 * a standing winner of any draw in this event. Mirrors draw_spin in 0046_games.sql, which is
 * what actually picks; this is for the host's "184 eligible" and the LED's rolling names.
 */
export function eligiblePool<A extends Pick<Attendee, "id" | "category">>(
  attendees: A[], checkedIn: ReadonlySet<string>, exclude: string[], pastWinners: ReadonlySet<string>,
): A[] {
  const excluded = new Set(exclude.map(norm));
  return attendees.filter((a) => checkedIn.has(a.id) && !excluded.has(norm(a.category ?? "")) && !pastWinners.has(a.id));
}

/** Winners who still hold their prize. A voided winner was "not here" and may win again (D281). */
export function standingWinners(rows: WinnerRow[]): Set<string> {
  return new Set(rows.filter((r) => !r.void).map((r) => r.attendee_id));
}

export type PrizeProgress = { prize_no: number; name: string; quantity: number; given: number; remaining: number };

export function prizeProgress(prizes: Prize[], winners: WinnerRow[]): PrizeProgress[] {
  return prizes.map((p, prize_no) => {
    const given = winners.filter((w) => w.prize_no === prize_no && !w.void).length;
    return { prize_no, name: p.name, quantity: p.quantity, given, remaining: Math.max(0, p.quantity - given) };
  });
}

/** Prizes are drawn in the order the admin listed them (D279). */
export function nextPrize(progress: PrizeProgress[]): PrizeProgress | null {
  return progress.find((p) => p.remaining > 0) ?? null;
}

export function drawCount(prize: PrizeProgress, mode: "one" | "all", pool: number): number {
  return Math.max(0, Math.min(mode === "one" ? 1 : prize.remaining, prize.remaining, pool));
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/games-draw.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/draw.ts tests/games-draw.test.ts
git commit -m "feat(games): lucky draw pool and prize progress

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Memo and polling cadence

**Files:**
- Create: `src/lib/games/memo.ts`, `src/lib/games/poll.ts`
- Test: `tests/games-memo.test.ts`, `tests/games-poll.test.ts`

**Interfaces:**
- Consumes: `Phase` (Task 3).
- Produces: `createMemo<T>(ttlMs, clock = Date.now): { get(key: string, load: () => Promise<T>): Promise<T>; clear(key?: string): void }`; `clockOffset(sentAt, receivedAt, serverNow): number`, `phoneInterval(phase: Phase | null): number`, `displayInterval(phase: Phase | null): number`, `HOST_INTERVAL = 1000`, `backoff(failures): number`

- [ ] **Step 1: Write the failing tests**

Create `tests/games-memo.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createMemo } from "@/lib/games/memo";

describe("createMemo", () => {
  it("loads once within the time-to-live", async () => {
    let now = 0;
    const memo = createMemo<number>(1000, () => now);
    const load = vi.fn(async () => 42);
    await memo.get("k", load);
    now = 999;
    await memo.get("k", load);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("loads again once the time-to-live has passed", async () => {
    let now = 0;
    const memo = createMemo<number>(1000, () => now);
    const load = vi.fn(async () => 1);
    await memo.get("k", load);
    now = 1000;
    await memo.get("k", load);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("shares one load between callers that arrive together", async () => {
    const memo = createMemo<number>(1000, () => 0);
    const load = vi.fn(async () => 7);
    const [a, b] = await Promise.all([memo.get("k", load), memo.get("k", load)]);
    expect([a, b, load.mock.calls.length]).toEqual([7, 7, 1]);
  });
  it("does not keep a failed load", async () => {
    const memo = createMemo<number>(1000, () => 0);
    await expect(memo.get("k", async () => { throw new Error("db down"); })).rejects.toThrow("db down");
    await expect(memo.get("k", async () => 5)).resolves.toBe(5);
  });
  it("forgets a key on clear", async () => {
    const memo = createMemo<number>(1000, () => 0);
    const load = vi.fn(async () => 1);
    await memo.get("k", load);
    memo.clear("k");
    await memo.get("k", load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
```

Create `tests/games-poll.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { clockOffset, phoneInterval, displayInterval, backoff } from "@/lib/games/poll";

describe("clockOffset", () => {
  it("is the server time minus the request's midpoint", () => {
    expect(clockOffset(1000, 1200, 5100)).toBe(4000);
  });
});

describe("intervals (D256)", () => {
  it("polls a phone every second while a game is on, every 5 s otherwise", () => {
    expect([phoneInterval("race_live"), phoneInterval("survival_question"), phoneInterval("idle"), phoneInterval(null)])
      .toEqual([1000, 1000, 5000, 5000]);
  });
  it("polls the LED every 250 ms during a race, every second otherwise", () => {
    expect([displayInterval("race_live"), displayInterval("race_countdown"), displayInterval("survival_reveal")])
      .toEqual([250, 250, 1000]);
  });
});

describe("backoff", () => {
  it("doubles from one second up to eight", () => {
    expect([1, 2, 3, 4, 5, 9].map(backoff)).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/games-memo.test.ts tests/games-poll.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

Create `src/lib/games/memo.ts`:

```ts
/**
 * A per-instance memo with a time-to-live (D259). 500 phones polling once a second share one
 * database read per second per server instance instead of making 500. It lives in module
 * memory, so on Vercel each instance has its own — which is the point: it bounds load, it is
 * not a cache anyone must invalidate across machines. Callers arriving together share the one
 * in-flight load; a failed load is dropped so the next caller retries.
 */
export function createMemo<T>(ttlMs: number, clock: () => number = Date.now) {
  const entries = new Map<string, { at: number; value: Promise<T> }>();
  return {
    get(key: string, load: () => Promise<T>): Promise<T> {
      const now = clock();
      const hit = entries.get(key);
      if (hit && now - hit.at < ttlMs) return hit.value;
      const value = load();
      entries.set(key, { at: now, value });
      value.catch(() => {
        if (entries.get(key)?.value === value) entries.delete(key);
      });
      // Bound the map: a long-lived instance must not keep every run it ever saw.
      if (entries.size > 1000) {
        for (const [k, e] of entries) if (now - e.at >= ttlMs) entries.delete(k);
      }
      return value;
    },
    clear(key?: string) {
      if (key === undefined) entries.clear();
      else entries.delete(key);
    },
  };
}
```

Create `src/lib/games/poll.ts`:

```ts
import type { Phase } from "@/lib/games/phase";

/** Server time minus the midpoint of the request: add it to Date.now() for server time (D257). */
export function clockOffset(sentAt: number, receivedAt: number, serverNow: number): number {
  return serverNow - (sentAt + receivedAt) / 2;
}

const ACTIVE: ReadonlySet<Phase> = new Set<Phase>([
  "race_lobby", "race_countdown", "race_live",
  "survival_lobby", "survival_question", "survival_locked", "survival_reveal",
  "draw_ready", "draw_spinning", "draw_reveal",
]);

/** Once a second while a game is on, every 5 s otherwise (D256). */
export function phoneInterval(phase: Phase | null): number {
  return phase && ACTIVE.has(phase) ? 1000 : 5000;
}

/** Four times a second during a race so the lanes move smoothly, once a second otherwise. */
export function displayInterval(phase: Phase | null): number {
  return phase === "race_countdown" || phase === "race_live" ? 250 : 1000;
}

export const HOST_INTERVAL = 1000;

/** Wait after `failures` failed polls in a row: 1 s, 2 s, 4 s, then 8 s (D262). */
export function backoff(failures: number): number {
  return Math.min(8000, 1000 * 2 ** Math.max(0, failures - 1));
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run tests/games-memo.test.ts tests/games-poll.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/memo.ts src/lib/games/poll.ts tests/games-memo.test.ts tests/games-poll.test.ts
git commit -m "feat(games): per-instance memo and polling cadence

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Public stage and wire types

**Files:**
- Create: `src/lib/games/views.ts`, `src/lib/games/wire.ts`
- Test: `tests/games-views.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3, 7 (`PrizeProgress`), `HostAction` (Task 3).
- Produces:
  - `OPTION_STYLES` (A–D letter + colour)
  - `type PublicQuestion = { no: number; total: number; text: string; options: string[]; answer_s: number; deadline: number | null; correct: number | null }`
  - `type PublicStage = { key: string; phase: Phase; endsAt: number | null; game: { id: string; kind: GameKind; title: string } | null; race: { liveFrom: number; liveUntil: number; duration_s: number } | null; question: PublicQuestion | null; reveal: { eliminated: number; remaining: number; everyoneSurvived: boolean } | null; prizeNo: number | null }`
  - `publicStage(s: StageRow, game: Game | null): PublicStage`
  - `wire.ts`: `PhoneMe`, `PhoneState`, `Person`, `DisplayLane`, `DisplayState`, `HostGame`, `HostState` (shapes in Step 3)

- [ ] **Step 1: Write the failing test**

Create `tests/games-views.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { publicStage } from "@/lib/games/views";
import { hydrateGame, type Game } from "@/lib/games/config";
import { idleStage, type StageRow } from "@/lib/games/phase";

const quiz = hydrateGame({
  id: "g1", org_id: "o1", event_id: "e1", title: "Quiz", position: 0, created_at: "", kind: "survival",
  config: { answer_s: 10, questions: [{ text: "Capital of Malaysia?", options: ["KL", "Penang"], correct: 0 }] },
}) as Game;
const race = hydrateGame({ id: "g2", org_id: "o1", event_id: "e1", title: "Race", position: 1, created_at: "", kind: "tap_race", config: { duration_s: 20 } }) as Game;
const at = (phase: StageRow["phase"], phase_data: Record<string, unknown>, game_id = "g1"): StageRow =>
  ({ ...idleStage("e1"), version: 3, run_id: "r1", game_id, phase, phase_data });

describe("publicStage — the correct answer is secret until revealed (D276)", () => {
  it("hides it while the question is open", () => {
    expect(publicStage(at("survival_question", { question: 0, deadline: "2026-10-01T10:00:10Z" }), quiz).question?.correct).toBeNull();
  });
  it("hides it once time is up but before the reveal", () => {
    expect(publicStage(at("survival_locked", { question: 0 }), quiz).question?.correct).toBeNull();
  });
  it("shows it on reveal", () => {
    expect(publicStage(at("survival_reveal", { question: 0, eliminated: 1, remaining: 2, everyone_survived: false }), quiz).question?.correct).toBe(0);
  });
  it("never puts the answer anywhere else in the payload", () => {
    expect(JSON.stringify(publicStage(at("survival_question", { question: 0 }), quiz))).not.toContain("\"correct\":0");
  });
});

describe("publicStage", () => {
  it("carries the question text, options and count", () => {
    expect(publicStage(at("survival_question", { question: 0 }), quiz).question)
      .toMatchObject({ no: 0, total: 1, text: "Capital of Malaysia?", options: ["KL", "Penang"], answer_s: 10 });
  });
  it("has no question in the lobby", () => {
    expect(publicStage(at("survival_lobby", {}), quiz).question).toBeNull();
  });
  it("carries a race's window as numbers", () => {
    const s = publicStage(at("race_live", { live_from: "2026-10-01T10:00:00.000Z", live_until: "2026-10-01T10:00:20.000Z" }, "g2"), race);
    expect(s.race).toEqual({ liveFrom: Date.parse("2026-10-01T10:00:00Z"), liveUntil: Date.parse("2026-10-01T10:00:20Z"), duration_s: 20 });
  });
  it("ignores a game that is not the one on stage", () => {
    expect(publicStage(at("race_lobby", {}, "g2"), quiz).game).toBeNull();
  });
  it("keys by version and phase", () => {
    expect(publicStage(at("survival_lobby", {}), quiz).key).toBe("3:survival_lobby");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/games-views.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/games/views.ts`:

```ts
import type { Game, GameKind } from "@/lib/games/config";
import {
  currentQuestion, questionDeadline, raceWindow, revealFacts, spinFacts, stageKey,
  type Phase, type StageRow,
} from "@/lib/games/phase";

/** Option colours, the same on the LED and the phones so "pick red" works across the room. */
export const OPTION_STYLES = [
  { letter: "A", colour: "#E5484D" },
  { letter: "B", colour: "#3E63DD" },
  { letter: "C", colour: "#F5A524" },
  { letter: "D", colour: "#30A46C" },
] as const;

export type PublicQuestion = {
  no: number;
  total: number;
  text: string;
  options: string[];
  answer_s: number;
  deadline: number | null;
  /** Null until the host reveals it (D276). */
  correct: number | null;
};

export type PublicStage = {
  key: string;
  phase: Phase;
  endsAt: number | null;
  game: { id: string; kind: GameKind; title: string } | null;
  race: { liveFrom: number; liveUntil: number; duration_s: number } | null;
  question: PublicQuestion | null;
  reveal: { eliminated: number; remaining: number; everyoneSurvived: boolean } | null;
  prizeNo: number | null;
};

const REVEALED: ReadonlySet<Phase> = new Set<Phase>(["survival_reveal", "survival_over"]);

/**
 * The stage as anyone may see it: phones, the LED, the host. The one secret is the correct
 * answer, which is only here once the host has revealed it — never while a question is open,
 * or any phone could read it off the wire.
 */
export function publicStage(s: StageRow, game: Game | null): PublicStage {
  const g = game && s.game_id === game.id ? game : null;
  const q = currentQuestion(s);
  let question: PublicQuestion | null = null;
  if (g?.kind === "survival" && q !== null && s.phase !== "survival_lobby") {
    const item = g.config.questions[q];
    if (item) {
      question = {
        no: q, total: g.config.questions.length, text: item.text, options: item.options,
        answer_s: g.config.answer_s, deadline: questionDeadline(s),
        correct: REVEALED.has(s.phase) ? item.correct : null,
      };
    }
  }
  const w = raceWindow(s);
  return {
    key: stageKey(s),
    phase: s.phase,
    endsAt: s.phase_ends_at ? Date.parse(s.phase_ends_at) : null,
    game: g ? { id: g.id, kind: g.kind, title: g.title } : null,
    race: g?.kind === "tap_race" && w ? { liveFrom: w.from, liveUntil: w.until, duration_s: g.config.duration_s } : null,
    question,
    reveal: revealFacts(s),
    prizeNo: spinFacts(s)?.prizeNo ?? null,
  };
}
```

Create `src/lib/games/wire.ts`:

```ts
import type { GameKind } from "@/lib/games/config";
import type { PrizeProgress } from "@/lib/games/draw";
import type { HostAction } from "@/lib/games/phase";
import type { PublicStage } from "@/lib/games/views";

/** What a phone knows about itself in the game on stage. */
export type PhoneMe =
  | { kind: "race"; joined: boolean; lane: string; taps: number; place: number | null; lanes: number }
  | { kind: "survival"; joined: boolean; outAt: number | null; answered: number | null }
  | { kind: "draw"; won: string | null }
  | { kind: "none" };

/** GET /api/play/[token]/state. `unchanged` means "same key as you sent", and nothing else is sent. */
export type PhoneState = { now: number; key: string; unchanged?: true; stage?: PublicStage; me?: PhoneMe };

/** A tile on the LED: initials plus first name (D273). */
export type Person = { id: string; initials: string; first: string };

export type DisplayLane = { key: string; label: string; players: number; taps: number; score: number; place: number };

/** GET /api/display/[token]/state — the full view on every poll (D260). */
export type DisplayState = {
  now: number;
  stage: PublicStage;
  event: { name: string; logoUrl: string | null; colour: string };
  race: { lanes: DisplayLane[]; solo: boolean; mvp: { name: string; taps: number } | null } | null;
  survival: {
    players: Person[];
    eliminatedIds: string[];
    answered: number;
    split: number[] | null;
    winners: { name: string; company: string }[];
  } | null;
  draw: {
    prize: string | null;
    pool: number;
    sample: Person[];
    /** Only in draw_reveal (D280). */
    winners: { name: string; company: string }[] | null;
  } | null;
};

export type HostGame = { id: string; kind: GameKind; title: string; summary: string };

/** GET /api/host/[token]/state — the LED's view plus what only the host sees. */
export type HostState = DisplayState & {
  version: number;
  actions: HostAction[];
  games: HostGame[];
  /** Attendee fields a race can be grouped by. */
  fields: { key: string; label: string }[];
  /** The running race's grouping, for "Run again". */
  grouping: { by: string; key?: string; label?: string } | null;
  hostDraw: {
    progress: PrizeProgress[];
    /** Shown to the host as soon as the draw is made (D281). */
    spinWinners: { id: string; name: string; company: string }[];
    checkpointSet: boolean;
  } | null;
};
```

- [ ] **Step 4: Run it, then the whole suite**

Run: `npx vitest run tests/games-views.test.ts && npm test`
Expected: PASS, and the existing suite still green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/views.ts src/lib/games/wire.ts tests/games-views.test.ts
git commit -m "feat(games): public stage view that keeps the answer secret

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Data layer

**Files:**
- Create: `src/lib/db/games.ts`
- Modify: `src/lib/db/events.ts` (after `rotateCrewToken`)

**Interfaces:**
- Consumes: Tasks 1–7.
- Produces (all server-only, all `async`):
  - games: `listGames(eventId): Game[]`, `countGames(eventId): number`, `getGame(id, eventId): Game | null`, `createGame(event: Pick<Event, "id" | "org_id">, kind, title): Game`, `updateGame(id, eventId, patch: { title: string; config: unknown }): void`, `deleteGame(id, eventId): boolean`
  - stage: `getStage(eventId): StageRow`, `writeStage(eventId, expected, w: StageWrite): number | null`
  - runs: `type Run = { id: string; event_id: string; game_id: string; grouping: Grouping; started_at: string }`, `createRun(game: Game, grouping: Grouping): Run`, `getRun(id): Run | null`
  - `getAttendeeByToken(token): Attendee | null`
  - race: `joinRace(runId, attendeeId, laneKey): void`, `addTaps(runId, attendeeId, n, liveFrom: string, liveUntil: string): number`, `listTaps(runId): TapRow[]`, `getTapRow(runId, attendeeId): TapRow | null`
  - survival: `joinSurvival(runId, attendeeId): void`, `listPlayers(runId): PlayerRow[]`, `getPlayer(runId, attendeeId): PlayerRow | null`, `recordAnswer(runId, attendeeId, question, choice): boolean`, `getAnswer(runId, attendeeId, question): number | null`, `listAnswerChoices(runId, question): number[]`, `revealQuestion(eventId, expected, runId, gameId, question, correct): number | null`
  - draw: `listWinners(gameId): WinnerRow[]`, `listEventWinners(eventId): WinnerRow[]`, `drawSpin(a: { eventId; expected; runId; gameId; prizeNo; count; checkpointId; exclude: string[]; spinEndsAt: string }): string[] | null`, `voidWinner(gameId, attendeeId): boolean`, `resetDraw(gameId): void`
  - events.ts: `getEventByHostToken(token)`, `getEventByDisplayToken(token)`, `rotateHostToken(eventId): string`, `rotateDisplayToken(eventId): string`

- [ ] **Step 1: Add the event token functions**

In `src/lib/db/events.ts`, after `rotateCrewToken`, add:

```ts
/** The event behind a host console link (D252). Looked up by token alone, like the crew link. */
export async function getEventByHostToken(token: string): Promise<Event | null> {
  const { data } = await serviceClient().from("events").select("*").eq("host_token", token).maybeSingle();
  return data ? hydrate(data) : null;
}

/** The event behind an LED display link (D252). */
export async function getEventByDisplayToken(token: string): Promise<Event | null> {
  const { data } = await serviceClient().from("events").select("*").eq("display_token", token).maybeSingle();
  return data ? hydrate(data) : null;
}

/** Mints or replaces the host link. As with the crew link, rotation IS the revocation (D108, D252). */
export async function rotateHostToken(eventId: string): Promise<string> {
  const host_token = generateToken();
  await updateEvent(eventId, { host_token });
  return host_token;
}

export async function rotateDisplayToken(eventId: string): Promise<string> {
  const display_token = generateToken();
  await updateEvent(eventId, { display_token });
  return display_token;
}
```

- [ ] **Step 2: Write the games data module**

Create `src/lib/db/games.ts`:

```ts
import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { Attendee, Event } from "@/lib/types";
import { defaultConfig, hydrateGame, type Game, type GameKind } from "@/lib/games/config";
import { hydrateStage, type StageRow, type StageWrite } from "@/lib/games/phase";
import { parseGrouping, type Grouping, type TapRow } from "@/lib/games/race";
import type { PlayerRow } from "@/lib/games/survival";
import type { WinnerRow } from "@/lib/games/draw";

const PAGE = 1000;

/**
 * Every row of a one-row-per-player query. PostgREST returns at most 1,000 rows per request on
 * Supabase, and a race or a quiz is one row per player, so reads page rather than silently
 * stopping at the 1,001st player (D289).
 */
async function selectAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

// --- Games ---

export async function listGames(eventId: string): Promise<Game[]> {
  const { data, error } = await serviceClient().from("games").select("*").eq("event_id", eventId)
    .order("position").order("created_at");
  if (error) throw error;
  return (data ?? []).map(hydrateGame).filter((g): g is Game => g !== null);
}

export async function countGames(eventId: string): Promise<number> {
  const { count, error } = await serviceClient().from("games").select("id", { count: "exact", head: true }).eq("event_id", eventId);
  if (error) throw error;
  return count ?? 0;
}

export async function getGame(id: string, eventId: string): Promise<Game | null> {
  const { data, error } = await serviceClient().from("games").select("*").eq("id", id).eq("event_id", eventId).maybeSingle();
  if (error) throw error;
  return data ? hydrateGame(data) : null;
}

export async function createGame(event: Pick<Event, "id" | "org_id">, kind: GameKind, title: string): Promise<Game> {
  const db = serviceClient();
  const position = await countGames(event.id);
  const { data, error } = await db.from("games")
    .insert({ org_id: event.org_id, event_id: event.id, kind, title, config: defaultConfig(kind), position })
    .select("*").single();
  if (error) throw error;
  const game = hydrateGame(data);
  if (!game) throw new Error("A new game did not parse");
  return game;
}

export async function updateGame(id: string, eventId: string, patch: { title: string; config: unknown }): Promise<void> {
  const { error } = await serviceClient().from("games").update(patch).eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

/** Deletes a game and its runs and winners (cascade). A stage showing it reads as idle (D258). */
export async function deleteGame(id: string, eventId: string): Promise<boolean> {
  const { data, error } = await serviceClient().from("games").delete().eq("id", id).eq("event_id", eventId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

// --- Stage ---

export async function getStage(eventId: string): Promise<StageRow> {
  const { data, error } = await serviceClient().from("game_stage").select("*").eq("event_id", eventId).maybeSingle();
  if (error) throw error;
  return hydrateStage(eventId, data);
}

/** Compare-and-set (D261). Null when `expected` is stale: someone else moved the game on. */
export async function writeStage(eventId: string, expected: number, w: StageWrite): Promise<number | null> {
  const { data, error } = await serviceClient().rpc("game_stage_write", {
    p_event_id: eventId, p_expected: expected, p_run_id: w.run_id, p_game_id: w.game_id,
    p_phase: w.phase, p_phase_data: w.phase_data, p_phase_ends_at: w.phase_ends_at,
  });
  if (error) throw error;
  const v = data as number;
  return v < 0 ? null : v;
}

// --- Runs ---

export type Run = { id: string; event_id: string; game_id: string; grouping: Grouping; started_at: string };

const hydrateRun = (r: Record<string, unknown>): Run => ({
  id: r.id as string, event_id: r.event_id as string, game_id: r.game_id as string,
  grouping: parseGrouping(r.grouping), started_at: r.started_at as string,
});

export async function createRun(game: Game, grouping: Grouping): Promise<Run> {
  const { data, error } = await serviceClient().from("game_runs")
    .insert({ event_id: game.event_id, game_id: game.id, grouping }).select("*").single();
  if (error) throw error;
  return hydrateRun(data);
}

export async function getRun(id: string): Promise<Run | null> {
  const { data, error } = await serviceClient().from("game_runs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? hydrateRun(data) : null;
}

/** The attendee a personal link belongs to. `attendees.token` is unique across the table. */
export async function getAttendeeByToken(token: string): Promise<Attendee | null> {
  const { data, error } = await serviceClient().from("attendees").select("*").eq("token", token).maybeSingle();
  if (error) throw error;
  return (data as Attendee | null) ?? null;
}

// --- Race ---

/** Joining twice is a no-op, and keeps the lane from the first join (D264). */
export async function joinRace(runId: string, attendeeId: string, laneKey: string): Promise<void> {
  const { error } = await serviceClient().from("race_taps")
    .upsert({ run_id: runId, attendee_id: attendeeId, lane_key: laneKey }, { onConflict: "run_id,attendee_id", ignoreDuplicates: true });
  if (error) throw error;
}

export async function addTaps(runId: string, attendeeId: string, n: number, liveFrom: string, liveUntil: string): Promise<number> {
  const { data, error } = await serviceClient().rpc("race_add_taps", {
    p_run_id: runId, p_attendee_id: attendeeId, p_n: n, p_live_from: liveFrom, p_live_until: liveUntil,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function listTaps(runId: string): Promise<TapRow[]> {
  return selectAll<TapRow>((from, to) => serviceClient().from("race_taps")
    .select("attendee_id, lane_key, taps").eq("run_id", runId).order("attendee_id").range(from, to));
}

export async function getTapRow(runId: string, attendeeId: string): Promise<TapRow | null> {
  const { data, error } = await serviceClient().from("race_taps").select("attendee_id, lane_key, taps")
    .eq("run_id", runId).eq("attendee_id", attendeeId).maybeSingle();
  if (error) throw error;
  return (data as TapRow | null) ?? null;
}

// --- Last one standing ---

export async function joinSurvival(runId: string, attendeeId: string): Promise<void> {
  const { error } = await serviceClient().from("survival_players")
    .upsert({ run_id: runId, attendee_id: attendeeId }, { onConflict: "run_id,attendee_id", ignoreDuplicates: true });
  if (error) throw error;
}

export async function listPlayers(runId: string): Promise<PlayerRow[]> {
  return selectAll<PlayerRow>((from, to) => serviceClient().from("survival_players")
    .select("attendee_id, out_at_question").eq("run_id", runId).order("joined_at").order("attendee_id").range(from, to));
}

export async function getPlayer(runId: string, attendeeId: string): Promise<PlayerRow | null> {
  const { data, error } = await serviceClient().from("survival_players").select("attendee_id, out_at_question")
    .eq("run_id", runId).eq("attendee_id", attendeeId).maybeSingle();
  if (error) throw error;
  return (data as PlayerRow | null) ?? null;
}

/** False when this player already answered this question: the first answer counts (D272). */
export async function recordAnswer(runId: string, attendeeId: string, question: number, choice: number): Promise<boolean> {
  const { error } = await serviceClient().from("survival_answers")
    .insert({ run_id: runId, attendee_id: attendeeId, question_no: question, choice });
  if (!error) return true;
  if ((error as { code?: string }).code === "23505") return false;
  throw error;
}

export async function getAnswer(runId: string, attendeeId: string, question: number): Promise<number | null> {
  const { data, error } = await serviceClient().from("survival_answers").select("choice")
    .eq("run_id", runId).eq("attendee_id", attendeeId).eq("question_no", question).maybeSingle();
  if (error) throw error;
  return (data?.choice as number | undefined) ?? null;
}

export async function listAnswerChoices(runId: string, question: number): Promise<number[]> {
  const rows = await selectAll<{ choice: number }>((from, to) => serviceClient().from("survival_answers")
    .select("choice").eq("run_id", runId).eq("question_no", question).order("attendee_id").range(from, to));
  return rows.map((r) => r.choice);
}

export async function revealQuestion(eventId: string, expected: number, runId: string, gameId: string, question: number, correct: number): Promise<number | null> {
  const { data, error } = await serviceClient().rpc("survival_reveal", {
    p_event_id: eventId, p_expected: expected, p_run_id: runId, p_game_id: gameId, p_question: question, p_correct: correct,
  });
  if (error) throw error;
  const v = data as number;
  return v < 0 ? null : v;
}

// --- Lucky draw ---

export async function listWinners(gameId: string): Promise<WinnerRow[]> {
  const { data, error } = await serviceClient().from("draw_winners").select("*").eq("game_id", gameId).order("drawn_at");
  if (error) throw error;
  return (data ?? []) as WinnerRow[];
}

export async function listEventWinners(eventId: string): Promise<WinnerRow[]> {
  const { data, error } = await serviceClient().from("draw_winners").select("*").eq("event_id", eventId);
  if (error) throw error;
  return (data ?? []) as WinnerRow[];
}

/** Draws and moves the stage to the spin in one transaction (D280). Null when stale. */
export async function drawSpin(a: {
  eventId: string; expected: number; runId: string; gameId: string; prizeNo: number; count: number;
  checkpointId: string; exclude: string[]; spinEndsAt: string;
}): Promise<string[] | null> {
  const { data, error } = await serviceClient().rpc("draw_spin", {
    p_event_id: a.eventId, p_expected: a.expected, p_run_id: a.runId, p_game_id: a.gameId,
    p_prize_no: a.prizeNo, p_count: a.count, p_checkpoint_id: a.checkpointId,
    p_exclude: a.exclude, p_spin_ends_at: a.spinEndsAt,
  });
  if (error) throw error;
  return (data as string[] | null) ?? null;
}

/** "Not here" (D281): the winner stays on record, struck through, and may win again. */
export async function voidWinner(gameId: string, attendeeId: string): Promise<boolean> {
  const { data, error } = await serviceClient().from("draw_winners").update({ void: true })
    .eq("game_id", gameId).eq("attendee_id", attendeeId).eq("void", false).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** Clears a draw's winners, e.g. after a rehearsal, so everyone is back in the pool. */
export async function resetDraw(gameId: string): Promise<void> {
  const { error } = await serviceClient().from("draw_winners").delete().eq("game_id", gameId);
  if (error) throw error;
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (If `selectAll`'s `page` argument does not accept the Supabase builder, change its parameter type to `(from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>` is already structural; the builder is a `PromiseLike` of `{ data, error, ... }` and should fit. If TypeScript still refuses, wrap each call as `async (f, t) => await serviceClient()...range(f, t)`.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/games.ts src/lib/db/events.ts
git commit -m "feat(games): data layer for games, stage, runs, taps, answers and winners

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Games admin — list, links and sidebar

**Files:**
- Create: `src/components/admin/ShareLink.tsx`, `src/components/admin/NewGameMenu.tsx`, `src/app/admin/events/[id]/games/page.tsx`, `src/app/admin/events/[id]/games/actions.ts`
- Modify: `src/app/admin/events/[id]/settings/page.tsx:77-87` (use the extracted `ShareLink`), `src/lib/links.ts`, `src/components/admin/nav.ts`
- Test: `tests/links.test.ts`, `tests/nav.test.ts`

**Interfaces:**
- Consumes: Task 10 (`listGames`, `createGame`, `deleteGame`, `rotateHostToken`, `rotateDisplayToken`), Task 2 (`GAME_KIND_LABELS`, `gameSummary`, `isGameKind`).
- Produces: `hostLink(base, token)`, `displayLink(base, token)`; `ShareLink({ label, url })`; server actions `createGameAction(eventId, kind, form)`, `deleteGameAction(eventId, gameId)`, `rotateHostTokenAction(eventId)`, `rotateDisplayTokenAction(eventId)` (Task 12 adds more to the same file).

- [ ] **Step 1: Write the failing tests**

In `tests/links.test.ts`, add `hostLink, displayLink` to the existing import from `@/lib/links`, and append:

```ts
describe("game links (D252)", () => {
  it("puts the host console outside the portal, by token alone", () => {
    expect(hostLink("https://ecphub.vercel.app/", "abcdefghjkmn")).toBe("https://ecphub.vercel.app/host/abcdefghjkmn");
  });
  it("puts the LED display outside the portal, by token alone", () => {
    expect(displayLink("https://ecphub.vercel.app", "abcdefghjkmn")).toBe("https://ecphub.vercel.app/display/abcdefghjkmn");
  });
});
```

(If `describe`/`it`/`expect` are not already imported in that file, add them from `vitest`.)

In `tests/nav.test.ts`, change the expected Onsite group in "orders the groups the way the sidebar reads" to:

```ts
      ["Onsite", ["Overview", "Attendees", "Games", "Scanner"]],
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/links.test.ts tests/nav.test.ts`
Expected: FAIL — `hostLink` is not exported; the nav order has no Games.

- [ ] **Step 3: Implement links and nav**

Append to `src/lib/links.ts`:

```ts
/** The host console (D251). Staff-facing like the crew link, and looked up by token alone. */
export function hostLink(base: string, token: string) {
  return `${trimSlash(base)}/host/${token}`;
}
/** The LED display (D251). Show-only; a separate token from the host link (D252). */
export function displayLink(base: string, token: string) {
  return `${trimSlash(base)}/display/${token}`;
}
```

In `src/components/admin/nav.ts`, change the Onsite items to:

```ts
    { title: "Onsite", items: [
      { href: b, label: "Overview", icon: "home" },
      { href: `${b}/attendees`, label: "Attendees", icon: "users" },
      { href: `${b}/games`, label: "Games", icon: "star" },
      ...(ev.check_in_enabled ? [{ href: `/scan/${ev.id}`, label: "Scanner", icon: "scan" as IconName, newTab: true }] : []),
    ] },
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run tests/links.test.ts tests/nav.test.ts`
Expected: PASS.

- [ ] **Step 5: Extract ShareLink**

Create `src/components/admin/ShareLink.tsx` with the body moved verbatim from the settings page:

```tsx
import { CopyButton } from "@/components/admin/CopyButton";

/** A link to hand out: the URL itself, and a Copy button. Used for the crew, host and display links. */
export function ShareLink({ label, url }: { label: string; url: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2">
        <a href={url} className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 font-mono text-xs text-primary">{url}</a>
        <CopyButton value={url} label={`${label.toLowerCase()} link`} />
      </div>
    </div>
  );
}
```

In `src/app/admin/events/[id]/settings/page.tsx`, delete the local `function ShareLink(...) { ... }` (lines 77–87) and add `import { ShareLink } from "@/components/admin/ShareLink";`. If `CopyButton` is now unused in that file, remove its import.

- [ ] **Step 6: Write the actions**

Create `src/app/admin/events/[id]/games/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent, rotateDisplayToken, rotateHostToken } from "@/lib/db/events";
import { createGame, deleteGame } from "@/lib/db/games";
import { GAME_KIND_LABELS, isGameKind } from "@/lib/games/config";
import { flashPath } from "@/lib/flash";

const gamesPath = (eventId: string) => `/admin/events/${eventId}/games`;

export async function createGameAction(eventId: string, kind: string, form: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  if (!isGameKind(kind)) redirect(flashPath(gamesPath(ev.id), "That kind of game does not exist.", "error"));
  const title = (String(form.get("title") ?? "").trim() || GAME_KIND_LABELS[kind]).slice(0, 80);
  const game = await createGame(ev, kind, title);
  revalidatePath(gamesPath(ev.id));
  // Straight into its editor: a race is ready as it is, but questions and prizes are not.
  redirect(`${gamesPath(ev.id)}/${game.id}`);
}

export async function deleteGameAction(eventId: string, gameId: string) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  await deleteGame(gameId, ev.id);
  revalidatePath(gamesPath(ev.id));
  redirect(flashPath(gamesPath(ev.id), "Game deleted."));
}

/** Rotation is the revocation (D252): every copy of the old link stops at once. */
export async function rotateHostTokenAction(eventId: string) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  await rotateHostToken(ev.id);
  revalidatePath(gamesPath(ev.id));
  redirect(flashPath(gamesPath(ev.id), "New host link ready. The old one has stopped working."));
}

export async function rotateDisplayTokenAction(eventId: string) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  await rotateDisplayToken(ev.id);
  revalidatePath(gamesPath(ev.id));
  redirect(flashPath(gamesPath(ev.id), "New display link ready. The old one has stopped working."));
}
```

- [ ] **Step 7: Write the New game menu**

Create `src/components/admin/NewGameMenu.tsx`, following `NewActivityMenu` (same dropdown → dialog shape, same close-on-navigation rule):

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, Gift, Hand, Plus, Trophy } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { GameKind } from "@/lib/games/config";

const KINDS: { kind: GameKind; icon: typeof Plus; label: string; what: string; hint: string }[] = [
  { kind: "tap_race", icon: Hand, label: "Tap race", what: "Teams tap their phones to race", hint: "You pick the lanes — table, category or solo — when you start it." },
  { kind: "survival", icon: Trophy, label: "Last one standing", what: "Wrong answers are out until one is left", hint: "Add its questions on the next page." },
  { kind: "draw", icon: Gift, label: "Lucky draw", what: "Draw winners from who checked in", hint: "Pick the checkpoint and add prizes on the next page." },
];

/**
 * One "New game" button for every kind, like "New activity". The forms are rendered by the
 * server page and handed in, so they post straight to server actions; the create action
 * redirects to the game's editor and the URL change closes the dialog.
 */
export function NewGameMenu({ forms }: { forms: Record<GameKind, React.ReactNode> }) {
  const [which, setWhich] = useState<GameKind | null>(null);
  const url = `${usePathname()}?${useSearchParams().toString()}`;
  const openedAt = useRef<string | null>(null);
  useEffect(() => {
    if (openedAt.current === null || openedAt.current === url) { openedAt.current = url; return; }
    openedAt.current = url;
    setWhich(null);
  }, [url]);
  const current = KINDS.find((k) => k.kind === which);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" />}>
          <Plus />New game<ChevronDown data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          {KINDS.map(({ kind, icon: Icon, label, what }) => (
            <DropdownMenuItem key={kind} onClick={() => setWhich(kind)} className="items-start gap-3 py-2">
              <Icon className="mt-0.5 size-4 shrink-0" />
              <span className="flex flex-col">
                <span className="font-bold">{label}</span>
                <span className="text-xs text-muted-foreground">{what}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={which !== null} onOpenChange={(open) => { if (!open) setWhich(null); }}>
        <DialogContent>
          {current && (
            <>
              <DialogHeader>
                <DialogTitle>New {current.label.toLowerCase()}</DialogTitle>
                <DialogDescription>{current.hint}</DialogDescription>
              </DialogHeader>
              {forms[current.kind]}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
```

Before writing, open `src/components/admin/NewActivityMenu.tsx` and copy any detail this sketch differs on (e.g. how its `DropdownMenuItem` lays out icon and text, or the Dialog props) so the two menus look identical.

- [ ] **Step 8: Write the Games page**

Create `src/app/admin/events/[id]/games/page.tsx`:

```tsx
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listGames } from "@/lib/db/games";
import { GAME_KIND_LABELS, gameSummary, type GameKind } from "@/lib/games/config";
import { appBaseUrl, displayLink, hostLink } from "@/lib/links";
import { crewLinkLastDay } from "@/lib/crew";
import { shortDate } from "@/lib/text";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { RowActions } from "@/components/admin/RowActions";
import { ShareLink } from "@/components/admin/ShareLink";
import { NewGameMenu } from "@/components/admin/NewGameMenu";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createGameAction, deleteGameAction, rotateDisplayTokenAction, rotateHostTokenAction } from "./actions";

export const metadata = { title: "Games" };

export default async function Games({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const games = await listGames(ev.id);
  const base = appBaseUrl();
  const lastDay = crewLinkLastDay(ev);
  const expiry = lastDay ? `Stops working after ${shortDate(lastDay)}.` : "Does not expire, because the event has no dates.";

  const form = (kind: GameKind) => (
    <form action={createGameAction.bind(null, ev.id, kind)} className="grid grid-cols-1 gap-4">
      <Field label="Name" name="title" defaultValue={GAME_KIND_LABELS[kind]} />
      <SubmitButton>Create</SubmitButton>
    </form>
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <AdminHeader
        title="Games"
        subtitle={games.length ? `${games.length} game${games.length === 1 ? "" : "s"} ready for the stage` : "Games the room plays from their phones, shown on the LED."}
        actions={<NewGameMenu forms={{ tap_race: form("tap_race"), survival: form("survival"), draw: form("draw") }} />}
      />

      <Card className="overflow-hidden py-0">
        <CardContent className="px-0">
          {games.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No games yet. Use New game to add a tap race, last one standing or a lucky draw.</p>
          ) : (
            <ul className="divide-y divide-border">
              {games.map((g) => {
                const href = `/admin/events/${ev.id}/games/${g.id}`;
                return (
                  <li key={g.id} className="flex items-center gap-3 px-4 py-3">
                    <Link href={href} className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-bold">{g.title}</span>
                      <span className="text-xs text-muted-foreground">{gameSummary(g)}</span>
                    </Link>
                    <Badge variant="secondary">{GAME_KIND_LABELS[g.kind]}</Badge>
                    <RowActions
                      name={g.title}
                      links={[{ label: "Edit", href }]}
                      remove={{
                        action: deleteGameAction.bind(null, ev.id, g.id),
                        message: g.kind === "draw"
                          ? `Delete "${g.title}"? Its winners list goes with it, and those winners can win other draws again.`
                          : `Delete "${g.title}"? Its results go with it.`,
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Host link</CardTitle>
            <CardDescription>For whoever runs the games — crew or the emcee — on their phone. Anyone holding it can start games and draw winners.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {ev.host_token ? (
              <>
                <ShareLink label="Host" url={hostLink(base, ev.host_token)} />
                <p className="text-xs text-muted-foreground">{expiry}</p>
                <form action={rotateHostTokenAction.bind(null, ev.id)}>
                  <ConfirmButton message="Replace the host link? The old one stops working immediately.">Replace link</ConfirmButton>
                </form>
              </>
            ) : (
              <form action={rotateHostTokenAction.bind(null, ev.id)}><SubmitButton>Create host link</SubmitButton></form>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Display link</CardTitle>
            <CardDescription>Open on the computer that feeds the LED, in Chrome, and click to start. It only shows; it cannot control anything.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {ev.display_token ? (
              <>
                <ShareLink label="Display" url={displayLink(base, ev.display_token)} />
                <p className="text-xs text-muted-foreground">{expiry}</p>
                <form action={rotateDisplayTokenAction.bind(null, ev.id)}>
                  <ConfirmButton message="Replace the display link? The screen showing the old one goes blank until it is reopened with the new one.">Replace link</ConfirmButton>
                </form>
              </>
            ) : (
              <form action={rotateDisplayTokenAction.bind(null, ev.id)}><SubmitButton>Create display link</SubmitButton></form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

Check before finishing: `RowActions` props (`name`, `links`, `remove`) in `src/components/admin/RowActions.tsx:36`; `shortDate` in `src/lib/text.ts`; `Badge` variants in `src/components/ui/badge.tsx`. Match the other admin list pages' container width if it differs from `max-w-4xl` (see memory "Admin design style": capped and centred).

- [ ] **Step 9: Verify**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green.

Then start the dev server (`preview_start`; add a `.claude/launch.json` entry `{ "name": "dev", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 3000 }` if none exists), sign in, open a **test event's** Games page (never the `ecphub` event), and check: Games appears in the sidebar under Onsite; New game → Tap race creates a game and lands on `/games/<id>` (a 404 is expected until Task 12); back on the list the row shows "20 s race"; Create host link and Create display link each show a link; delete removes the row.

- [ ] **Step 10: Commit**

```bash
git add src/lib/links.ts src/components/admin/nav.ts src/components/admin/ShareLink.tsx src/components/admin/NewGameMenu.tsx "src/app/admin/events/[id]/games" "src/app/admin/events/[id]/settings/page.tsx" tests/links.test.ts tests/nav.test.ts
git commit -m "feat(admin): Games page with host and display links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Game editor, winners and export

**Files:**
- Create: `src/lib/games/config-form.ts`, `src/components/admin/QuestionsEditor.tsx`, `src/components/admin/PrizesEditor.tsx`, `src/app/admin/events/[id]/games/[gameId]/page.tsx`, `src/app/admin/events/[id]/export/winners.xlsx/route.ts`
- Modify: `src/app/admin/events/[id]/games/actions.ts` (add `updateGameAction`, `resetDrawAction`), `src/lib/exports.ts` (add `winnerSheetRows`, `buildWinnersWorkbook`)
- Test: `tests/games-config-form.test.ts`, `tests/games-winners-export.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 7, 10; `listCheckpoints`, `listCategories`, `listAttendees`, `fieldValue`.
- Produces: `type QuestionDraft = { text: string; options: string[]; correct: number }`, `packQuestions(drafts): unknown[]`, `configFromForm(kind, form): { ok: true; config: unknown } | { ok: false; error: string }`; `winnerSheetRows(prizes, winners, people: Map<string, Pick<Attendee, "name" | "email" | "category" | "extra">>): (string)[][]`, `buildWinnersWorkbook(title, rows): ExcelJS.Workbook`.

- [ ] **Step 1: Write the failing tests**

Create `tests/games-config-form.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { configFromForm, packQuestions } from "@/lib/games/config-form";

const form = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

describe("packQuestions", () => {
  it("drops blank options and moves the correct index with them", () => {
    expect(packQuestions([{ text: "Q", options: ["A", "", "C", ""], correct: 2 }]))
      .toEqual([{ text: "Q", options: ["A", "C"], correct: 1 }]);
  });
  it("marks a blank correct option as invalid so the form says so", () => {
    expect(packQuestions([{ text: "Q", options: ["A", "", "C", ""], correct: 1 }])[0]).toMatchObject({ correct: -1 });
  });
});

describe("configFromForm", () => {
  it("reads a race", () => {
    expect(configFromForm("tap_race", form([["duration_s", "30"]]))).toEqual({ ok: true, config: { duration_s: 30 } });
  });
  it("explains a race that is too short", () => {
    expect(configFromForm("tap_race", form([["duration_s", "3"]]))).toEqual({ ok: false, error: "A race runs for 10 to 60 seconds." });
  });
  it("reads last one standing", () => {
    const r = configFromForm("survival", form([["answer_s", "12"], ["questions", JSON.stringify([{ text: "Q", options: ["A", "B"], correct: 1 }])]]));
    expect(r).toEqual({ ok: true, config: { answer_s: 12, questions: [{ text: "Q", options: ["A", "B"], correct: 1 }] } });
  });
  it("names the question that is wrong", () => {
    const r = configFromForm("survival", form([["answer_s", "10"], ["questions", JSON.stringify([
      { text: "Q1", options: ["A", "B"], correct: 0 },
      { text: "Q2", options: ["A", "B"], correct: -1 },
    ])]]));
    expect(r).toEqual({ ok: false, error: "Question 2: pick which option is correct." });
  });
  it("says so when the questions cannot be read", () => {
    expect(configFromForm("survival", form([["answer_s", "10"], ["questions", "{not json"]])))
      .toEqual({ ok: false, error: "The questions could not be read. Reload the page and try again." });
  });
  it("reads a draw with exclusions", () => {
    const r = configFromForm("draw", form([
      ["checkpoint_id", "cp1"], ["exclude", "Crew"], ["exclude", "Management"],
      ["prizes", JSON.stringify([{ name: "iPad", quantity: 1 }])],
    ]));
    expect(r).toEqual({ ok: true, config: { checkpoint_id: "cp1", exclude_categories: ["Crew", "Management"], prizes: [{ name: "iPad", quantity: 1 }] } });
  });
  it("reads no checkpoint as null", () => {
    const r = configFromForm("draw", form([["checkpoint_id", ""], ["prizes", "[]"]]));
    expect(r.ok && (r.config as { checkpoint_id: string | null }).checkpoint_id).toBeNull();
  });
  it("names the prize that is wrong", () => {
    const r = configFromForm("draw", form([["prizes", JSON.stringify([{ name: "iPad", quantity: 1 }, { name: "", quantity: 1 }])]]));
    expect(r).toEqual({ ok: false, error: "Prize 2 needs a name and a quantity from 1 to 500." });
  });
});
```

Create `tests/games-winners-export.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { winnerSheetRows } from "@/lib/exports";
import type { WinnerRow } from "@/lib/games/draw";

const w = (attendee_id: string, prize_no: number, isVoid = false): WinnerRow =>
  ({ id: attendee_id, event_id: "e1", game_id: "g1", prize_no, attendee_id, drawn_at: "2026-10-01T02:00:00Z", void: isVoid });

describe("winnerSheetRows (D283)", () => {
  const people = new Map([
    ["a1", { name: "Priya Ramasamy", email: "p@x.test", category: "Staff", extra: { company: "Ecopia" } }],
    ["a2", { name: "Tan Mei Ling", email: null, category: null, extra: {} }],
  ]);
  it("has a header and one row per winner, with the prize name and whether they collected", () => {
    const rows = winnerSheetRows([{ name: "Voucher", quantity: 2 }, { name: "iPad", quantity: 1 }], [w("a1", 1), w("a2", 0, true)], people);
    expect(rows[0]).toEqual(["Prize", "Name", "Company", "Category", "Email", "Drawn at", "Status"]);
    expect(rows[1]).toEqual(["iPad", "Priya Ramasamy", "Ecopia", "Staff", "p@x.test", "2026-10-01 10:00", "Won"]);
    expect(rows[2]).toEqual(["Voucher", "Tan Mei Ling", "", "", "", "2026-10-01 10:00", "Not here — redrawn"]);
  });
  it("keeps a winner whose attendee was later deleted", () => {
    expect(winnerSheetRows([{ name: "Voucher", quantity: 1 }], [w("gone", 0)], people)[1][1]).toBe("(removed attendee)");
  });
});
```

(The "Drawn at" column is Malaysia time, `YYYY-MM-DD HH:mm`. Before writing the implementation, check `src/lib/time.ts` for an existing UTC → KL formatter — e.g. `isoToLocalInput` returns `YYYY-MM-DDTHH:mm` — and use it, replacing the `T` with a space.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/games-config-form.test.ts tests/games-winners-export.test.ts`
Expected: FAIL — modules/exports missing.

- [ ] **Step 3: Implement config-form**

Create `src/lib/games/config-form.ts`:

```ts
import type { z } from "zod";
import { drawConfigSchema, raceConfigSchema, survivalConfigSchema, type GameKind } from "@/lib/games/config";

type Form = { get(name: string): FormDataEntryValue | null; getAll(name: string): FormDataEntryValue[] };
export type ConfigResult = { ok: true; config: unknown } | { ok: false; error: string };

/** What the questions editor holds: always four option boxes, some of them blank. */
export type QuestionDraft = { text: string; options: string[]; correct: number };

/**
 * The editor's drafts as the config stores them: blank options dropped, and the correct index
 * moved to match. A correct option left blank becomes -1, which the schema refuses with a
 * message naming the question — better than silently marking a different option correct.
 */
export function packQuestions(drafts: QuestionDraft[]): { text: string; options: string[]; correct: number }[] {
  return drafts.map((d) => {
    const kept: string[] = [];
    let correct = -1;
    d.options.forEach((o, i) => {
      if (!o.trim()) return;
      if (i === d.correct) correct = kept.length;
      kept.push(o);
    });
    return { text: d.text, options: kept, correct };
  });
}

const int = (v: FormDataEntryValue | null) => Number.parseInt(String(v ?? ""), 10);

function json(v: FormDataEntryValue | null): unknown {
  try {
    return JSON.parse(String(v ?? "[]"));
  } catch {
    return undefined;
  }
}

function explain(error: z.ZodError): string {
  const path = error.issues[0]?.path ?? [];
  const [field, index, part] = path;
  if (field === "duration_s") return "A race runs for 10 to 60 seconds.";
  if (field === "answer_s") return "Answer time is 5 to 30 seconds.";
  if (field === "questions" && typeof index === "number") {
    const n = index + 1;
    if (part === "correct") return `Question ${n}: pick which option is correct.`;
    if (part === "options") return `Question ${n} needs 2 to 4 options.`;
    if (part === "text") return `Question ${n} needs its question.`;
  }
  if (field === "questions") return "Up to 50 questions.";
  if (field === "prizes" && typeof index === "number") return `Prize ${index + 1} needs a name and a quantity from 1 to 500.`;
  if (field === "prizes") return "Up to 50 prizes.";
  return "Something on the form is not right. Check it and save again.";
}

/** The Games editor's form, validated for its kind (D287). */
export function configFromForm(kind: GameKind, form: Form): ConfigResult {
  if (kind === "tap_race") {
    const r = raceConfigSchema.safeParse({ duration_s: int(form.get("duration_s")) });
    return r.success ? { ok: true, config: r.data } : { ok: false, error: explain(r.error) };
  }
  if (kind === "survival") {
    const questions = json(form.get("questions"));
    if (!Array.isArray(questions)) return { ok: false, error: "The questions could not be read. Reload the page and try again." };
    const r = survivalConfigSchema.safeParse({ answer_s: int(form.get("answer_s")), questions });
    return r.success ? { ok: true, config: r.data } : { ok: false, error: explain(r.error) };
  }
  const prizes = json(form.get("prizes"));
  if (!Array.isArray(prizes)) return { ok: false, error: "The prizes could not be read. Reload the page and try again." };
  const r = drawConfigSchema.safeParse({
    checkpoint_id: String(form.get("checkpoint_id") ?? "") || null,
    exclude_categories: form.getAll("exclude").map(String),
    prizes,
  });
  return r.success ? { ok: true, config: r.data } : { ok: false, error: explain(r.error) };
}
```

Note: the "names the question that is wrong" test posts `correct: -1`, which the schema's `min(0)` refuses with path `["questions", 1, "correct"]` — the same message as the refine. If zod reports the issue at a different path, adjust `explain`, not the test.

- [ ] **Step 4: Implement the export rows**

Append to `src/lib/exports.ts` (it already imports `ExcelJS`, `Attendee` types and `fieldValue`; add `import type { Prize } from "@/lib/games/config";` and `import type { WinnerRow } from "@/lib/games/draw";` at the top, plus the KL time helper you found in Step 1):

```ts
/** One row per winner, in the order drawn (D283). Voided winners stay, marked, so the sheet is the whole story. */
export function winnerSheetRows(
  prizes: Prize[], winners: WinnerRow[],
  people: Map<string, Pick<Attendee, "name" | "email" | "category" | "extra">>,
): string[][] {
  const rows: string[][] = [["Prize", "Name", "Company", "Category", "Email", "Drawn at", "Status"]];
  for (const w of winners) {
    const a = people.get(w.attendee_id);
    rows.push([
      prizes[w.prize_no]?.name ?? `Prize ${w.prize_no + 1}`,
      a?.name ?? "(removed attendee)",
      a ? fieldValue(a, "company") : "",
      a?.category ?? "",
      a?.email ?? "",
      isoToLocalInput(w.drawn_at).replace("T", " "),
      w.void ? "Not here — redrawn" : "Won",
    ]);
  }
  return rows;
}

export function buildWinnersWorkbook(title: string, rows: string[][]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(title.slice(0, 31) || "Winners");
  for (const r of rows) ws.addRow(r);
  ws.columns?.forEach((c) => { c.width = 24; });
  return wb;
}
```

(Replace `isoToLocalInput` with whichever helper Step 1 found, if it is named differently.)

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run tests/games-config-form.test.ts tests/games-winners-export.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the editor actions**

Append to `src/app/admin/events/[id]/games/actions.ts` (add imports `getGame, resetDraw, updateGame` from `@/lib/db/games` and `configFromForm` from `@/lib/games/config-form`):

```ts
export async function updateGameAction(eventId: string, gameId: string, form: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const game = await getGame(gameId, ev.id);
  if (!game) redirect(flashPath(gamesPath(ev.id), "That game no longer exists.", "error"));
  const path = `${gamesPath(ev.id)}/${game.id}`;
  const parsed = configFromForm(game.kind, form);
  if (!parsed.ok) redirect(flashPath(path, parsed.error, "error"));
  const title = (String(form.get("title") ?? "").trim() || game.title).slice(0, 80);
  await updateGame(game.id, ev.id, { title, config: parsed.config });
  revalidatePath(path);
  redirect(flashPath(path, "Saved."));
}

/** After a rehearsal: everyone this draw picked is back in every draw's pool. */
export async function resetDrawAction(eventId: string, gameId: string) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  await resetDraw(gameId);
  const path = `${gamesPath(ev.id)}/${gameId}`;
  revalidatePath(path);
  redirect(flashPath(path, "Draw reset. Everyone it picked is back in the pool."));
}
```

- [ ] **Step 7: Write the two list editors**

Create `src/components/admin/QuestionsEditor.tsx`:

```tsx
"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { packQuestions, type QuestionDraft } from "@/lib/games/config-form";
import { OPTION_STYLES } from "@/lib/games/views";
import type { Question } from "@/lib/games/config";

const toDraft = (q: Question): QuestionDraft => ({ text: q.text, options: [0, 1, 2, 3].map((i) => q.options[i] ?? ""), correct: q.correct });
const blank = (): QuestionDraft => ({ text: "", options: ["", "", "", ""], correct: 0 });
const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Last one standing's questions (D270): a card per question, four option boxes (two needed),
 * and a radio for the correct one. Posted as one hidden JSON field, packed by `packQuestions`,
 * so the server validates exactly what it will store.
 */
export function QuestionsEditor({ initial }: { initial: Question[] }) {
  const [items, setItems] = useState<QuestionDraft[]>(initial.length ? initial.map(toDraft) : [blank()]);
  const set = (i: number, patch: Partial<QuestionDraft>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, by: number) => setItems((xs) => {
    const j = i + by;
    if (j < 0 || j >= xs.length) return xs;
    const next = [...xs];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="questions" value={JSON.stringify(packQuestions(items))} />
      {items.map((q, i) => (
        <fieldset key={i} className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="flex items-center gap-2">
            <legend className="text-sm font-bold">Question {i + 1}</legend>
            <span className="ml-auto flex gap-1">
              <Button type="button" variant="ghost" size="icon" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp /></Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === items.length - 1}><ArrowDown /></Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Delete question" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}><Trash2 /></Button>
            </span>
          </div>
          <input className={input} value={q.text} maxLength={200} placeholder="The question" aria-label={`Question ${i + 1}`}
            onChange={(e) => set(i, { text: e.target.value })} />
          <div className="grid gap-2 sm:grid-cols-2">
            {q.options.map((o, k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="radio" name={`correct-${i}`} checked={q.correct === k} onChange={() => set(i, { correct: k })}
                  aria-label={`Option ${OPTION_STYLES[k].letter} is correct`} className="size-4" />
                <span className="flex size-6 shrink-0 items-center justify-center rounded text-xs font-bold text-white" style={{ background: OPTION_STYLES[k].colour }}>
                  {OPTION_STYLES[k].letter}
                </span>
                <input className={input} value={o} maxLength={60} placeholder={k < 2 ? "Option" : "Option (optional)"}
                  onChange={(e) => set(i, { options: q.options.map((x, m) => (m === k ? e.target.value : x)) })} />
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Tick the correct answer.</p>
        </fieldset>
      ))}
      <Button type="button" variant="outline" onClick={() => setItems((xs) => [...xs, blank()])} disabled={items.length >= 50}>
        <Plus />Add question
      </Button>
    </div>
  );
}
```

Create `src/components/admin/PrizesEditor.tsx`:

```tsx
"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Prize } from "@/lib/games/config";

const input = "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** The draw's prizes, drawn top to bottom (D279): put the grand prize last. Posted as one hidden JSON field. */
export function PrizesEditor({ initial }: { initial: Prize[] }) {
  const [items, setItems] = useState<{ name: string; quantity: string }[]>(
    initial.length ? initial.map((p) => ({ name: p.name, quantity: String(p.quantity) })) : [{ name: "", quantity: "1" }],
  );
  const packed = items.map((p) => ({ name: p.name, quantity: Number.parseInt(p.quantity, 10) || 0 }));
  const set = (i: number, patch: Partial<{ name: string; quantity: string }>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, by: number) => setItems((xs) => {
    const j = i + by;
    if (j < 0 || j >= xs.length) return xs;
    const next = [...xs];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="prizes" value={JSON.stringify(packed)} />
      {items.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-6 text-right text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
          <input className={`${input} min-w-0 flex-1`} value={p.name} maxLength={80} placeholder="Prize" aria-label={`Prize ${i + 1}`}
            onChange={(e) => set(i, { name: e.target.value })} />
          <input className={`${input} w-20 tabular-nums`} value={p.quantity} inputMode="numeric" aria-label={`How many of prize ${i + 1}`}
            onChange={(e) => set(i, { quantity: e.target.value.replace(/\D/g, "") })} />
          <Button type="button" variant="ghost" size="icon" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === items.length - 1}><ArrowDown /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Delete prize" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}><Trash2 /></Button>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={() => setItems((xs) => [...xs, { name: "", quantity: "1" }])} disabled={items.length >= 50}>
        <Plus />Add prize
      </Button>
      <p className="text-xs text-muted-foreground">Drawn from the top down — put the grand prize last.</p>
    </div>
  );
}
```

- [ ] **Step 8: Write the editor page**

Create `src/app/admin/events/[id]/games/[gameId]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { getGame, listWinners } from "@/lib/db/games";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { listAttendees, listCategories } from "@/lib/db/attendees";
import { GAME_KIND_LABELS } from "@/lib/games/config";
import { prizeProgress } from "@/lib/games/draw";
import { fieldValue } from "@/lib/attendee-values";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { QuestionsEditor } from "@/components/admin/QuestionsEditor";
import { PrizesEditor } from "@/components/admin/PrizesEditor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resetDrawAction, updateGameAction } from "../actions";

export const metadata = { title: "Game" };

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default async function GameEditor({ params }: { params: Promise<{ id: string; gameId: string }> }) {
  const { id, gameId } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const game = await getGame(gameId, ev.id);
  if (!game) notFound();
  const back = `/admin/events/${ev.id}/games`;

  const [checkpoints, categories, winners, people] = game.kind === "draw"
    ? await Promise.all([listCheckpoints(ev.id), listCategories(ev.id), listWinners(game.id), listAttendees(ev.id)])
    : [[], [], [], []];
  const byId = new Map(people.map((a) => [a.id, a]));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Link href={back} className="text-sm text-muted-foreground hover:text-foreground">← Games</Link>
      <AdminHeader title={game.title} subtitle={GAME_KIND_LABELS[game.kind]} />

      <form action={updateGameAction.bind(null, ev.id, game.id)} className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <Field label="Name" name="title" defaultValue={game.title} />

            {game.kind === "tap_race" && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="duration_s" className="text-sm font-bold">Race length (seconds)</label>
                <input id="duration_s" name="duration_s" type="number" min={10} max={60} defaultValue={game.config.duration_s} className={`${input} max-w-32 tabular-nums`} />
                <p className="text-xs text-muted-foreground">Lanes are picked on the host console when the race starts: by category, by any attendee field such as table, or everyone solo.</p>
              </div>
            )}

            {game.kind === "survival" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="answer_s" className="text-sm font-bold">Answer time (seconds)</label>
                  <input id="answer_s" name="answer_s" type="number" min={5} max={30} defaultValue={game.config.answer_s} className={`${input} max-w-32 tabular-nums`} />
                </div>
                <QuestionsEditor initial={game.config.questions} />
              </>
            )}

            {game.kind === "draw" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="checkpoint_id" className="text-sm font-bold">Who is in the draw</label>
                  <select id="checkpoint_id" name="checkpoint_id" defaultValue={game.config.checkpoint_id ?? ""} className={input}>
                    <option value="">Pick a checkpoint…</option>
                    {checkpoints.map((c) => <option key={c.id} value={c.id}>Checked in at {c.name}</option>)}
                  </select>
                  {checkpoints.length === 0 && <p className="text-xs text-muted-foreground">This event has no checkpoints. Add one in Settings — the draw only picks people who checked in.</p>}
                </div>
                {categories.length > 0 && (
                  <fieldset className="flex flex-col gap-1.5">
                    <legend className="text-sm font-bold">Leave out</legend>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {categories.map((c) => (
                        <label key={c} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" name="exclude" value={c} defaultChecked={game.config.exclude_categories.some((x) => x.toLowerCase() === c.toLowerCase())} className="size-4" />
                          {c}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-bold">Prizes</span>
                  <PrizesEditor initial={game.config.prizes} />
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <div><SubmitButton>Save</SubmitButton></div>
      </form>

      {game.kind === "draw" && (
        <Card>
          <CardHeader>
            <CardTitle>Winners</CardTitle>
            <CardDescription>
              {prizeProgress(game.config.prizes, winners).map((p) => `${p.name} ${p.given}/${p.quantity}`).join(" · ") || "No prizes yet."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {winners.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody drawn yet.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {winners.map((w) => {
                  const a = byId.get(w.attendee_id);
                  return (
                    <li key={w.id} className={`flex gap-3 py-2 ${w.void ? "text-muted-foreground line-through" : ""}`}>
                      <span className="w-40 shrink-0 truncate font-bold">{game.config.prizes[w.prize_no]?.name ?? `Prize ${w.prize_no + 1}`}</span>
                      <span className="min-w-0 flex-1 truncate">{a?.name ?? "(removed attendee)"}{a && fieldValue(a, "company") ? ` · ${fieldValue(a, "company")}` : ""}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <a href={`/admin/events/${ev.id}/export/winners.xlsx?game=${game.id}`} className="text-sm font-bold text-primary">Download winners (.xlsx)</a>
              {winners.length > 0 && (
                <form action={resetDrawAction.bind(null, ev.id, game.id)} className="ml-auto">
                  <ConfirmButton message="Reset this draw? Its winners are cleared and go back into every draw's pool. Use this after a rehearsal, not during the event.">Reset draw</ConfirmButton>
                </form>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 9: Write the export route**

Create `src/app/admin/events/[id]/export/winners.xlsx/route.ts`:

```ts
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { getGame, listWinners } from "@/lib/db/games";
import { listAttendees } from "@/lib/db/attendees";
import { buildWinnersWorkbook, winnerSheetRows } from "@/lib/exports";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const gameId = new URL(req.url).searchParams.get("game") ?? "";
  const game = await getGame(gameId, ev.id);
  if (!game || game.kind !== "draw") return new Response("No such draw.", { status: 404 });
  const [winners, attendees] = await Promise.all([listWinners(game.id), listAttendees(ev.id)]);
  const rows = winnerSheetRows(game.config.prizes, winners, new Map(attendees.map((a) => [a.id, a])));
  const buf = await buildWinnersWorkbook(game.title, rows).xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${ev.slug}-winners.xlsx"`,
    },
  });
}
```

- [ ] **Step 10: Verify**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green.

In the browser, on a test event: create a last one standing, add two questions (one with only options A and C filled, C correct), save → "Saved." and reopening shows the options packed as A, B with B correct. Leave the correct option blank → the flash names the question. Create a lucky draw: pick a checkpoint, tick a category to leave out, add "Voucher ×3" and "iPad ×1", save; Download winners gives a sheet with only the header.

- [ ] **Step 11: Commit**

```bash
git add src/lib/games/config-form.ts src/lib/exports.ts src/components/admin/QuestionsEditor.tsx src/components/admin/PrizesEditor.tsx "src/app/admin/events/[id]/games" "src/app/admin/events/[id]/export/winners.xlsx" tests/games-config-form.test.ts tests/games-winners-export.test.ts
git commit -m "feat(admin): game editor with questions, prizes, winners and export

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Live views and the API endpoints

**Files:**
- Create: `src/lib/games/live.ts`, `src/lib/games/phone-state.ts`, `src/lib/games/display-state.ts`, `src/lib/games/http.ts`
- Create: `src/app/api/play/[token]/state/route.ts`, `src/app/api/play/[token]/join/route.ts`, `src/app/api/play/[token]/taps/route.ts`, `src/app/api/play/[token]/answer/route.ts`, `src/app/api/display/[token]/state/route.ts`, `src/app/api/host/[token]/state/route.ts`

**Interfaces:**
- Consumes: Tasks 2–10.
- Produces:
  - `live.ts`: `liveStage(eventId, now): Promise<{ stage: StageRow; game: Game | null }>`, `forgetStage(eventId)`, `runFor(runId)`, `tapsFor(runId)`, `rosterFor(eventId): Promise<Map<string, Attendee>>`, `playContext(token): Promise<PlayContext | null>`, `hostLinkState(token)`, `displayLinkState(token)` → `{ event: Event } | { refused: "missing" | "expired" | "draft" }`
  - `phone-state.ts`: `type PlayContext = { event: Event; attendee: Attendee }`, `phoneState(ctx, v: string | null, now): Promise<PhoneState>`
  - `display-state.ts`: `displayState(event, now): Promise<DisplayState>`, `hostState(event, now): Promise<HostState>`, `poolFor(event, game: DrawGame): Promise<Attendee[]>`, `forgetPool(gameId)`
  - `http.ts`: `json(body, status = 200): Response` (never cached)
  - Endpoints: `GET /api/play/[token]/state?v=`, `POST /api/play/[token]/join`, `POST /api/play/[token]/taps {n}` → `{ accepted }`, `POST /api/play/[token]/answer {question, choice}` → `{ ok, choice? , error? }`, `GET /api/display/[token]/state`, `GET /api/host/[token]/state`

These modules import `server-only` and the database, so they have no Vitest tests (the suite runs without a database); the rules they apply are the pure functions already tested. They are verified end to end in Step 6 and again by Tasks 14–19.

- [ ] **Step 1: Read the route handler docs**

Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (params are a Promise; `Response.json` is available).

- [ ] **Step 2: Write live.ts and http.ts**

Create `src/lib/games/http.ts`:

```ts
/** A JSON response no cache may keep: every game endpoint answers "right now". */
export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
```

Create `src/lib/games/live.ts`:

```ts
import "server-only";
import type { Attendee, Event } from "@/lib/types";
import { getEvent, getEventByDisplayToken, getEventByHostToken } from "@/lib/db/events";
import { listAttendees } from "@/lib/db/attendees";
import { getAttendeeByToken, getGame, getRun, getStage, listTaps, type Run } from "@/lib/db/games";
import type { Game } from "@/lib/games/config";
import { createMemo } from "@/lib/games/memo";
import { resolveStage, type StageRow } from "@/lib/games/phase";
import type { TapRow } from "@/lib/games/race";
import { isValidToken } from "@/lib/tokens";
import { isUnpublished } from "@/lib/portal";
import { crewLinkLive } from "@/lib/crew";
import { nowInKL } from "@/lib/time";

/*
 * Per-instance memos (D259). The stage is shared by every phone at the event, so it is read at
 * most once a second per server instance; the rest change rarely or not at all during a game.
 * A host write clears the stage on the instance that made it (forgetStage); other instances
 * catch up within the second.
 */
const stageMemo = createMemo<StageRow>(1000);
const gameMemo = createMemo<Game | null>(5000);
const runMemo = createMemo<Run | null>(60_000);
const tapsMemo = createMemo<TapRow[]>(250);
const rosterMemo = createMemo<Map<string, Attendee>>(10_000);
const attendeeMemo = createMemo<Attendee | null>(30_000);
const eventMemo = createMemo<Event | null>(10_000);

/** The stage as it stands now, and the game on it. */
export async function liveStage(eventId: string, now: number): Promise<{ stage: StageRow; game: Game | null }> {
  const raw = await stageMemo.get(eventId, () => getStage(eventId));
  const stage = resolveStage(raw, now);
  const gameId = stage.game_id;
  const game = gameId ? await gameMemo.get(gameId, () => getGame(gameId, eventId)) : null;
  return { stage, game };
}

export function forgetStage(eventId: string) {
  stageMemo.clear(eventId);
}

export const runFor = (runId: string) => runMemo.get(runId, () => getRun(runId));
export const tapsFor = (runId: string) => tapsMemo.get(runId, () => listTaps(runId));
export const rosterFor = (eventId: string) =>
  rosterMemo.get(eventId, async () => new Map((await listAttendees(eventId)).map((a) => [a.id, a])));

export type PlayContext = { event: Event; attendee: Attendee };

/**
 * A phone's personal link → who and which event. Null for a malformed or unknown token, a draft
 * event, or an archived one. A rotated attendee token keeps working for up to 30 s on an
 * instance that had it memoised — acceptable for a game, and the portal itself is not memoised.
 */
export async function playContext(token: string): Promise<PlayContext | null> {
  if (!isValidToken(token)) return null;
  const attendee = await attendeeMemo.get(token, () => getAttendeeByToken(token));
  if (!attendee) return null;
  const event = await eventMemo.get(attendee.event_id, () => getEvent(attendee.event_id));
  if (!event || isUnpublished(event) || event.status === "archived") return null;
  return { event, attendee };
}

export type LinkState = { event: Event } | { refused: "missing" | "expired" | "draft" };

async function byLink(token: string, kind: "host" | "display"): Promise<LinkState> {
  if (!isValidToken(token)) return { refused: "missing" };
  const lookup = kind === "host" ? getEventByHostToken : getEventByDisplayToken;
  const event = await eventMemo.get(`${kind}:${token}`, () => lookup(token));
  if (!event) return { refused: "missing" };
  if (isUnpublished(event)) return { refused: "draft" };
  // The crew link's rule (D252): closed a day after the event ends, and when archived.
  if (!crewLinkLive(event, nowInKL().date)) return { refused: "expired" };
  return { event };
}

export const hostLinkState = (token: string) => byLink(token, "host");
export const displayLinkState = (token: string) => byLink(token, "display");
```

Check `nowInKL` in `src/lib/time.ts` returns an object with `date` (`YYYY-MM-DD`) — the crew page uses `nowInKL().date`.

- [ ] **Step 3: Write phone-state.ts**

Create `src/lib/games/phone-state.ts`:

```ts
import "server-only";
import type { Game } from "@/lib/games/config";
import { currentQuestion, spinFacts, stageKey, type StageRow } from "@/lib/games/phase";
import { laneKeyFor, laneLabel, standings } from "@/lib/games/race";
import { publicStage } from "@/lib/games/views";
import type { PhoneMe, PhoneState } from "@/lib/games/wire";
import { getAnswer, getPlayer, getTapRow } from "@/lib/db/games";
import { liveStage, runFor, tapsFor, type PlayContext } from "@/lib/games/live";

export type { PlayContext };

/**
 * A phone's view (D259). When the stage key is the one the phone already has, the answer is
 * three fields and no personal reads at all — that is what 500 phones polling once a second
 * mostly get.
 */
export async function phoneState(ctx: PlayContext, v: string | null, now: number): Promise<PhoneState> {
  const { stage, game } = await liveStage(ctx.event.id, now);
  const key = stageKey(stage);
  if (v === key) return { now, key, unchanged: true };
  return { now, key, stage: publicStage(stage, game), me: await phoneMe(ctx, stage, game) };
}

async function phoneMe(ctx: PlayContext, stage: StageRow, game: Game | null): Promise<PhoneMe> {
  const runId = stage.run_id;
  if (!game || !runId || stage.game_id !== game.id) return { kind: "none" };

  if (game.kind === "tap_race") {
    const [run, mine] = await Promise.all([runFor(runId), getTapRow(runId, ctx.attendee.id)]);
    const grouping = run?.grouping ?? { by: "solo" as const };
    const laneKey = mine?.lane_key ?? laneKeyFor(ctx.attendee, grouping);
    const lane = laneLabel(laneKey, grouping, () => ctx.attendee.name);
    let place: number | null = null;
    let lanes = 0;
    if (stage.phase === "race_results" && mine) {
      const table = standings(await tapsFor(runId));
      lanes = table.length;
      place = table.find((l) => l.key === laneKey)?.place ?? null;
    }
    return { kind: "race", joined: mine !== null, lane, taps: mine?.taps ?? 0, place, lanes };
  }

  if (game.kind === "survival") {
    const q = currentQuestion(stage);
    const [player, answered] = await Promise.all([
      getPlayer(runId, ctx.attendee.id),
      q === null ? Promise.resolve(null) : getAnswer(runId, ctx.attendee.id, q),
    ]);
    return { kind: "survival", joined: player !== null, outAt: player?.out_at_question ?? null, answered };
  }

  // The winner's own phone learns only once the LED reveals it (D280, D282).
  const spun = spinFacts(stage);
  const won = stage.phase === "draw_reveal" && spun?.winnerIds.includes(ctx.attendee.id)
    ? game.config.prizes[spun.prizeNo]?.name ?? "a prize"
    : null;
  return { kind: "draw", won };
}
```

- [ ] **Step 4: Write display-state.ts**

Create `src/lib/games/display-state.ts`:

```ts
import "server-only";
import type { Attendee, Event } from "@/lib/types";
import { gameSummary, type DrawGame, type SurvivalGame } from "@/lib/games/config";
import { allowedActions, currentQuestion, spinFacts, type StageRow } from "@/lib/games/phase";
import { laneLabel, standings, topTapper, visibleLanes } from "@/lib/games/race";
import { answerSplit, inGoingInto, outAt, stillIn } from "@/lib/games/survival";
import { eligiblePool, nextPrize, prizeProgress, standingWinners } from "@/lib/games/draw";
import { seededOrder } from "@/lib/games/mosaic";
import { tag, tagLabel } from "@/lib/games/names";
import { createMemo } from "@/lib/games/memo";
import { publicStage } from "@/lib/games/views";
import type { DisplayState, HostState, Person } from "@/lib/games/wire";
import { fieldValue } from "@/lib/attendee-values";
import { eventFields } from "@/lib/attendee-fields";
import { listCheckedInAttendeeIds } from "@/lib/db/checkins";
import { listAnswerChoices, listEventWinners, listGames, listPlayers, listWinners } from "@/lib/db/games";
import { liveStage, rosterFor, runFor, tapsFor } from "@/lib/games/live";

const poolMemo = createMemo<Attendee[]>(3000);

/** The draw's eligible pool (D278), for the host's count and the LED's rolling names. */
export function poolFor(event: Event, game: DrawGame): Promise<Attendee[]> {
  return poolMemo.get(game.id, async () => {
    const { checkpoint_id, exclude_categories } = game.config;
    if (!checkpoint_id) return [];
    const [roster, checkedIn, winners] = await Promise.all([
      rosterFor(event.id), listCheckedInAttendeeIds(checkpoint_id), listEventWinners(event.id),
    ]);
    return eligiblePool([...roster.values()], checkedIn, exclude_categories, standingWinners(winners));
  });
}

export function forgetPool(gameId: string) {
  poolMemo.clear(gameId);
}

const person = (id: string, name: string): Person => ({ id, ...tag(name) });
/** Winner cards are the one place with the full name and company (D273). */
const card = (a: Attendee | undefined) => ({ name: a?.name ?? "", company: a ? fieldValue(a, "company") : "" });

/** The LED's full view, every poll (D260). */
export async function displayState(event: Event, now: number): Promise<DisplayState> {
  const { stage, game } = await liveStage(event.id, now);
  const base: DisplayState = {
    now, stage: publicStage(stage, game),
    event: { name: event.name, logoUrl: event.logo_url, colour: event.primary_color },
    race: null, survival: null, draw: null,
  };
  if (!game || !stage.run_id || stage.game_id !== game.id) return base;
  if (game.kind === "tap_race") return { ...base, race: await raceView(event, stage) };
  if (game.kind === "survival") return { ...base, survival: await survivalView(event, stage, game) };
  return { ...base, draw: await drawView(event, stage, game) };
}

async function raceView(event: Event, stage: StageRow): Promise<DisplayState["race"]> {
  const runId = stage.run_id!;
  const [run, rows, roster] = await Promise.all([runFor(runId), tapsFor(runId), rosterFor(event.id)]);
  const grouping = run?.grouping ?? { by: "solo" as const };
  const nameOf = (id: string) => roster.get(id)?.name ?? "";
  const table = standings(rows);
  const shown = stage.phase === "race_results" ? table : visibleLanes(table, grouping);
  const top = topTapper(rows);
  return {
    lanes: shown.map((l) => ({ key: l.key, label: laneLabel(l.key, grouping, nameOf), players: l.players, taps: l.taps, score: l.score, place: l.place })),
    solo: grouping.by === "solo",
    mvp: stage.phase === "race_results" && top ? { name: tagLabel(nameOf(top.attendee_id)), taps: top.taps } : null,
  };
}

async function survivalView(event: Event, stage: StageRow, game: SurvivalGame): Promise<DisplayState["survival"]> {
  const runId = stage.run_id!;
  const [rows, roster] = await Promise.all([listPlayers(runId), rosterFor(event.id)]);
  const nameOf = (id: string) => roster.get(id)?.name ?? "";
  const q = currentQuestion(stage);
  const ids = stage.phase === "survival_lobby" ? rows.map((r) => r.attendee_id)
    : stage.phase === "survival_over" || q === null ? stillIn(rows)
    : inGoingInto(rows, q);
  const counting = q !== null && ["survival_question", "survival_locked", "survival_reveal"].includes(stage.phase);
  const choices = counting ? await listAnswerChoices(runId, q) : [];
  const optionCount = q === null ? 0 : game.config.questions[q]?.options.length ?? 0;
  return {
    players: ids.map((id) => person(id, nameOf(id))),
    eliminatedIds: stage.phase === "survival_reveal" && q !== null ? outAt(rows, q) : [],
    answered: choices.length,
    split: stage.phase === "survival_locked" || stage.phase === "survival_reveal" ? answerSplit(choices, optionCount) : null,
    winners: stage.phase === "survival_over" ? stillIn(rows).map((id) => card(roster.get(id))) : [],
  };
}

async function drawView(event: Event, stage: StageRow, game: DrawGame): Promise<DisplayState["draw"]> {
  const [winners, pool, roster] = await Promise.all([listWinners(game.id), poolFor(event, game), rosterFor(event.id)]);
  const spun = spinFacts(stage);
  const prizeNo = spun?.prizeNo ?? nextPrize(prizeProgress(game.config.prizes, winners))?.prize_no ?? null;
  return {
    prize: prizeNo === null ? null : game.config.prizes[prizeNo]?.name ?? null,
    pool: pool.length,
    sample: seededOrder(pool, `${stage.run_id}:${stage.version}`).slice(0, 40).map((a) => person(a.id, a.name)),
    // Never before the reveal: the winner is not on the wire while the names are still rolling (D280).
    winners: stage.phase === "draw_reveal" && spun ? spun.winnerIds.map((id) => card(roster.get(id))) : null,
  };
}

/** The LED's view plus what only the host sees (D260, D281). */
export async function hostState(event: Event, now: number): Promise<HostState> {
  const [display, { stage, game }, games] = await Promise.all([displayState(event, now), liveStage(event.id, now), listGames(event.id)]);
  let hostDraw: HostState["hostDraw"] = null;
  if (game?.kind === "draw" && stage.game_id === game.id) {
    const [winners, roster] = await Promise.all([listWinners(game.id), rosterFor(event.id)]);
    const spun = spinFacts(stage);
    hostDraw = {
      progress: prizeProgress(game.config.prizes, winners),
      spinWinners: spun && (stage.phase === "draw_spinning" || stage.phase === "draw_reveal")
        ? spun.winnerIds.map((id) => ({ id, ...card(roster.get(id)) }))
        : [],
      checkpointSet: game.config.checkpoint_id !== null,
    };
  }
  const run = stage.run_id && game?.kind === "tap_race" ? await runFor(stage.run_id) : null;
  return {
    ...display,
    version: stage.version,
    actions: allowedActions(stage.phase),
    games: games.map((g) => ({ id: g.id, kind: g.kind, title: g.title, summary: gameSummary(g) })),
    fields: eventFields(event.registration_questions, event.attendee_fields).map((f) => ({ key: f.key, label: f.label })),
    grouping: run ? run.grouping : null,
    hostDraw,
  };
}
```

- [ ] **Step 5: Write the endpoints**

Create `src/app/api/play/[token]/state/route.ts`:

```ts
import { playContext } from "@/lib/games/live";
import { phoneState } from "@/lib/games/phone-state";
import { json } from "@/lib/games/http";
import { allow } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Once a second is 60 a minute; the limit leaves room for a reload or two.
  if (!allow(`play:${token}`, 240, 60_000)) return json({ error: "Too many requests." }, 429);
  const ctx = await playContext(token);
  if (!ctx) return json({ error: "This link does not open a game." }, 404);
  return json(await phoneState(ctx, new URL(req.url).searchParams.get("v"), Date.now()));
}
```

Create `src/app/api/play/[token]/join/route.ts`:

```ts
import { liveStage, playContext, runFor } from "@/lib/games/live";
import { phoneState } from "@/lib/games/phone-state";
import { joinRace, joinSurvival } from "@/lib/db/games";
import { laneKeyFor } from "@/lib/games/race";
import { json } from "@/lib/games/http";
import { allow } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** Join the race or last one standing in its lobby (D264, D271). Answers with the fresh phone state. */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!allow(`join:${token}`, 30, 60_000)) return json({ error: "Too many requests." }, 429);
  const ctx = await playContext(token);
  if (!ctx) return json({ error: "This link does not open a game." }, 404);
  const now = Date.now();
  const { stage } = await liveStage(ctx.event.id, now);
  if (stage.phase === "race_lobby" && stage.run_id) {
    const run = await runFor(stage.run_id);
    await joinRace(stage.run_id, ctx.attendee.id, laneKeyFor(ctx.attendee, run?.grouping ?? { by: "solo" }));
  } else if (stage.phase === "survival_lobby" && stage.run_id) {
    await joinSurvival(stage.run_id, ctx.attendee.id);
  } else {
    return json({ error: "Joining has closed for this game." }, 409);
  }
  return json(await phoneState(ctx, null, now));
}
```

Create `src/app/api/play/[token]/taps/route.ts`:

```ts
import { liveStage, playContext } from "@/lib/games/live";
import { addTaps } from "@/lib/db/games";
import { raceWindow } from "@/lib/games/phase";
import { json } from "@/lib/games/http";
import { allow } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * A batch of taps, about once a second (D266). The database caps it and checks the window; this
 * only refuses the obviously wrong. Results is allowed through so the last batch, sent as the
 * race ends, can land inside the 1.5 s grace.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!allow(`taps:${token}`, 180, 60_000)) return json({ accepted: 0 }, 429);
  const ctx = await playContext(token);
  if (!ctx) return json({ error: "This link does not open a game." }, 404);
  const body = (await req.json().catch(() => null)) as { n?: unknown } | null;
  const n = typeof body?.n === "number" && Number.isFinite(body.n) ? Math.min(Math.max(Math.floor(body.n), 0), 200) : 0;
  const { stage } = await liveStage(ctx.event.id, Date.now());
  const w = raceWindow(stage);
  if (n === 0 || !stage.run_id || !w || (stage.phase !== "race_live" && stage.phase !== "race_results")) return json({ accepted: 0 });
  const accepted = await addTaps(stage.run_id, ctx.attendee.id, n, new Date(w.from).toISOString(), new Date(w.until).toISOString());
  return json({ accepted });
}
```

Create `src/app/api/play/[token]/answer/route.ts`:

```ts
import { liveStage, playContext } from "@/lib/games/live";
import { getAnswer, getPlayer, recordAnswer } from "@/lib/db/games";
import { currentQuestion, questionDeadline } from "@/lib/games/phase";
import { answerAccepted } from "@/lib/games/survival";
import { json } from "@/lib/games/http";
import { allow } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** One answer per question, until the deadline plus 1.5 s (D272). The first answer counts. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!allow(`answer:${token}`, 60, 60_000)) return json({ ok: false, error: "Too many requests." }, 429);
  const ctx = await playContext(token);
  if (!ctx) return json({ ok: false, error: "This link does not open a game." }, 404);
  const body = (await req.json().catch(() => null)) as { question?: unknown; choice?: unknown } | null;
  const now = Date.now();
  const { stage, game } = await liveStage(ctx.event.id, now);
  const q = currentQuestion(stage);
  const deadline = questionDeadline(stage);
  const open = game?.kind === "survival" && stage.run_id && q !== null && q === body?.question && deadline !== null
    && (stage.phase === "survival_question" || stage.phase === "survival_locked") && answerAccepted(deadline, now);
  if (!open || game?.kind !== "survival" || !stage.run_id || q === null) return json({ ok: false, error: "Too late — answers are locked." }, 409);
  const optionCount = game.config.questions[q]?.options.length ?? 0;
  const choice = body?.choice;
  if (typeof choice !== "number" || !Number.isInteger(choice) || choice < 0 || choice >= optionCount) {
    return json({ ok: false, error: "Pick one of the options." }, 400);
  }
  const player = await getPlayer(stage.run_id, ctx.attendee.id);
  if (!player) return json({ ok: false, error: "You're not in this game." }, 403);
  if (player.out_at_question !== null) return json({ ok: false, error: "You're out — watch this one." }, 403);
  const first = await recordAnswer(stage.run_id, ctx.attendee.id, q, choice);
  return json({ ok: true, choice: first ? choice : await getAnswer(stage.run_id, ctx.attendee.id, q) });
}
```

Create `src/app/api/display/[token]/state/route.ts`:

```ts
import { displayLinkState } from "@/lib/games/live";
import { displayState } from "@/lib/games/display-state";
import { json } from "@/lib/games/http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await displayLinkState(token);
  if ("refused" in link) return json({ error: link.refused }, link.refused === "missing" ? 404 : 403);
  return json(await displayState(link.event, Date.now()));
}
```

Create `src/app/api/host/[token]/state/route.ts`:

```ts
import { hostLinkState } from "@/lib/games/live";
import { hostState } from "@/lib/games/display-state";
import { json } from "@/lib/games/http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await hostLinkState(token);
  if ("refused" in link) return json({ error: link.refused }, link.refused === "missing" ? 404 : 403);
  return json(await hostState(link.event, Date.now()));
}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all green.

With the dev server running, on a **published test event** (not `ecphub`) that has a display link and at least one attendee (copy an attendee token from the admin's attendee list or the links export):

```bash
curl -s http://localhost:3000/api/play/<attendee-token>/state
```

Expected: JSON with `"key":"0:idle"` (or the current version), `stage.phase` `"idle"`, `me.kind` `"none"`.

```bash
curl -s "http://localhost:3000/api/play/<attendee-token>/state?v=0:idle"
```

Expected: `{"now":…,"key":"0:idle","unchanged":true}`.

```bash
curl -s -X POST http://localhost:3000/api/play/<attendee-token>/join
```

Expected: HTTP 409 `{"error":"Joining has closed for this game."}`.

```bash
curl -s http://localhost:3000/api/display/<display-token>/state
```

Expected: JSON with `event.name` set and `race`, `survival`, `draw` all `null`. A made-up display token (`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/display/aaaaaaaaaaaa/state`) gives `404`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/games/live.ts src/lib/games/phone-state.ts src/lib/games/display-state.ts src/lib/games/http.ts src/app/api/play src/app/api/display src/app/api/host
git commit -m "feat(games): phone, display and host endpoints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Host console

**Files:**
- Create: `src/components/games/usePoll.ts`, `src/app/host/[token]/actions.ts`, `src/app/host/[token]/page.tsx`, `src/components/games/HostConsole.tsx`, `src/components/games/LinkRefused.tsx`

**Interfaces:**
- Consumes: Tasks 3, 5–10, 13.
- Produces:
  - `usePoll<T extends { now: number; key?: string; unchanged?: true }>(url, initial: T, intervalFor: (s: T) => number, versioned: boolean): { state: T; offset: number; apply(next: T): void; pollNow(): void }` — `intervalFor` must be a module-level (stable) function.
  - `useServerNow(offset, everyMs = 200, active = true): number`
  - `type HostResult = { ok: true; message?: string } | { ok: false; message: string }`
  - Server actions (all `(token: string, expected: number, ...) => Promise<HostResult>`): `openGameAction(token, expected, gameId, grouping)`, `startAction`, `stopAction`, `revealAction`, `nextAction`, `finishAction`, `drawAction(token, expected, mode: "one" | "all")`, `presentAction`, `redrawAction(token, expected, attendeeId)`, `idleAction`
  - `LinkRefused({ title, body })` — the "this link has expired / is not live yet" screen, reused by the display page.

- [ ] **Step 1: Write the poll hooks**

Create `src/components/games/usePoll.ts`:

```ts
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { backoff, clockOffset } from "@/lib/games/poll";

type Polled = { now: number; key?: string; unchanged?: true };

/**
 * Polls a game endpoint (D256). `versioned` sends the last key so the server can answer
 * "unchanged" (phones); the LED and host take the full view every time (D260). Keeps the
 * server-clock offset (D257) and backs off after failures (D262). `apply` takes a response got
 * elsewhere (a join); `pollNow` polls at once (after a host action).
 *
 * Every tick carries a generation number and only the newest reschedules, so a pollNow during
 * a tick in flight cannot leave two timers running.
 */
export function usePoll<T extends Polled>(url: string, initial: T, intervalFor: (s: T) => number, versioned: boolean) {
  const [state, setState] = useState<T>(initial);
  const [offset, setOffset] = useState(0);
  const latest = useRef(initial);
  const failures = useRef(0);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<() => void>(() => {});

  const apply = useCallback((next: T) => {
    if (next.unchanged) return;
    latest.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      const gen = ++generation.current;
      if (timer.current) clearTimeout(timer.current);
      const sent = Date.now();
      try {
        const key = versioned ? latest.current.key : undefined;
        const res = await fetch(key ? `${url}?v=${encodeURIComponent(key)}` : url, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as T;
        setOffset(clockOffset(sent, Date.now(), body.now));
        failures.current = 0;
        apply(body);
      } catch {
        failures.current += 1;
      }
      if (stopped || gen !== generation.current) return;
      timer.current = setTimeout(tick, failures.current ? backoff(failures.current) : intervalFor(latest.current));
    };
    tickRef.current = () => { void tick(); };
    timer.current = setTimeout(tick, intervalFor(latest.current));
    return () => {
      stopped = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [url, versioned, intervalFor, apply]);

  const pollNow = useCallback(() => tickRef.current(), []);
  return { state, offset, apply, pollNow };
}

/** Server time (D257), ticking every `everyMs` while `active`. */
export function useServerNow(offset: number, everyMs = 200, active = true): number {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now() + offset), everyMs);
    return () => clearInterval(id);
  }, [offset, everyMs, active]);
  return now;
}
```

- [ ] **Step 2: Write the host actions**

Create `src/app/host/[token]/actions.ts`:

```ts
"use server";
import type { Event } from "@/lib/types";
import type { Game } from "@/lib/games/config";
import { forgetStage, hostLinkState, liveStage } from "@/lib/games/live";
import { forgetPool, poolFor } from "@/lib/games/display-state";
import { createRun, drawSpin, getGame, listWinners, revealQuestion, voidWinner, writeStage } from "@/lib/db/games";
import {
  canDo, currentQuestion, drawReadyWrite, idleWrite, lobbyWrite, overWrite, questionWrite, raceStartWrite,
  raceStopWrite, revealFacts, spinFacts, SPIN_MS, type HostAction, type StageRow, type StageWrite,
} from "@/lib/games/phase";
import { parseGrouping } from "@/lib/games/race";
import { isOver } from "@/lib/games/survival";
import { drawCount, nextPrize, prizeProgress } from "@/lib/games/draw";
import { allow } from "@/lib/ratelimit";

export type HostResult = { ok: true; message?: string } | { ok: false; message: string };

const STALE: HostResult = { ok: false, message: "Someone else moved the game on. Showing the latest." };
const fail = (message: string): HostResult => ({ ok: false, message });

type Ready = { event: Event; stage: StageRow; game: Game | null };

/**
 * Every host action starts here: the token is the authority (D252), the version must be the one
 * the console was showing (D261), and the action must fit the phase. The stage is re-read, not
 * taken from the memo, so a console on this instance never acts on a second-old stage.
 */
async function begin(token: string, expected: number, action: HostAction): Promise<Ready | HostResult> {
  if (!allow(`host:${token}`, 120, 60_000)) return fail("Too many taps at once. Wait a moment.");
  const link = await hostLinkState(token);
  if ("refused" in link) return fail("This host link no longer works. Ask the organiser for a new one.");
  forgetStage(link.event.id);
  const { stage, game } = await liveStage(link.event.id, Date.now());
  if (stage.version !== expected || !canDo(stage.phase, action)) return STALE;
  return { event: link.event, stage, game };
}

async function commit(event: Event, expected: number, w: StageWrite, message?: string): Promise<HostResult> {
  const v = await writeStage(event.id, expected, w);
  forgetStage(event.id);
  return v === null ? STALE : { ok: true, message };
}

export async function openGameAction(token: string, expected: number, gameId: string, grouping: unknown): Promise<HostResult> {
  const b = await begin(token, expected, "open");
  if ("ok" in b) return b;
  const game = await getGame(gameId, b.event.id);
  if (!game) return fail("That game no longer exists.");
  if (game.kind === "survival" && game.config.questions.length === 0) return fail("This game has no questions yet. Add them in admin first.");
  if (game.kind === "draw" && !game.config.checkpoint_id) return fail("Pick a checkpoint for this draw in admin first.");
  if (game.kind === "draw" && game.config.prizes.length === 0) return fail("This draw has no prizes yet. Add them in admin first.");
  const run = await createRun(game, game.kind === "tap_race" ? parseGrouping(grouping) : { by: "solo" });
  return commit(b.event, expected, lobbyWrite(game, run.id));
}

export async function startAction(token: string, expected: number): Promise<HostResult> {
  const b = await begin(token, expected, "start");
  if ("ok" in b) return b;
  const now = Date.now();
  if (b.game?.kind === "tap_race") return commit(b.event, expected, raceStartWrite(b.stage, now, b.game.config.duration_s));
  if (b.game?.kind === "survival") return commit(b.event, expected, questionWrite(b.stage, 0, now, b.game.config.answer_s));
  return STALE;
}

export async function stopAction(token: string, expected: number): Promise<HostResult> {
  const b = await begin(token, expected, "stop");
  if ("ok" in b) return b;
  return commit(b.event, expected, raceStopWrite(b.stage, Date.now()));
}

export async function revealAction(token: string, expected: number): Promise<HostResult> {
  const b = await begin(token, expected, "reveal");
  if ("ok" in b) return b;
  const q = currentQuestion(b.stage);
  if (b.game?.kind !== "survival" || q === null || !b.stage.run_id) return STALE;
  const item = b.game.config.questions[q];
  if (!item) return fail("That question was removed in admin.");
  const v = await revealQuestion(b.event.id, expected, b.stage.run_id, b.game.id, q, item.correct);
  forgetStage(b.event.id);
  return v === null ? STALE : { ok: true };
}

export async function nextAction(token: string, expected: number): Promise<HostResult> {
  const b = await begin(token, expected, "next");
  if ("ok" in b) return b;
  const q = currentQuestion(b.stage);
  const facts = revealFacts(b.stage);
  if (b.game?.kind !== "survival" || q === null || !facts) return STALE;
  if (isOver(facts.remaining, q, b.game.config.questions.length)) return fail("That was the last question — show the winner.");
  return commit(b.event, expected, questionWrite(b.stage, q + 1, Date.now(), b.game.config.answer_s));
}

export async function finishAction(token: string, expected: number): Promise<HostResult> {
  const b = await begin(token, expected, "finish");
  if ("ok" in b) return b;
  return commit(b.event, expected, overWrite(b.stage, currentQuestion(b.stage) ?? 0));
}

export async function drawAction(token: string, expected: number, mode: "one" | "all"): Promise<HostResult> {
  const b = await begin(token, expected, "draw");
  if ("ok" in b) return b;
  const game = b.game;
  if (game?.kind !== "draw" || !b.stage.run_id || !game.config.checkpoint_id) return fail("Pick a checkpoint for this draw in admin first.");
  forgetPool(game.id);
  const [winners, pool] = await Promise.all([listWinners(game.id), poolFor(b.event, game)]);
  const prize = nextPrize(prizeProgress(game.config.prizes, winners));
  if (!prize) return fail("Every prize has been drawn.");
  const count = drawCount(prize, mode, pool.length);
  if (count === 0) return fail("No one left to draw. Check the checkpoint and the categories left out.");
  const picked = await drawSpin({
    eventId: b.event.id, expected, runId: b.stage.run_id, gameId: game.id, prizeNo: prize.prize_no, count,
    checkpointId: game.config.checkpoint_id, exclude: game.config.exclude_categories,
    spinEndsAt: new Date(Date.now() + SPIN_MS).toISOString(),
  });
  forgetStage(b.event.id);
  forgetPool(game.id);
  return picked === null ? STALE : { ok: true };
}

export async function presentAction(token: string, expected: number): Promise<HostResult> {
  const b = await begin(token, expected, "present");
  if ("ok" in b) return b;
  return commit(b.event, expected, drawReadyWrite(b.stage));
}

/**
 * "Not here — redraw" (D281): the winner is voided, kept on record, and one replacement is drawn
 * for the same prize. After "Draw all", redrawing one name shows only the replacement on the
 * LED; the others keep their prizes and stay on the winners list.
 */
export async function redrawAction(token: string, expected: number, attendeeId: string): Promise<HostResult> {
  const b = await begin(token, expected, "redraw");
  if ("ok" in b) return b;
  const game = b.game;
  const spun = spinFacts(b.stage);
  if (game?.kind !== "draw" || !spun || !spun.winnerIds.includes(attendeeId) || !b.stage.run_id || !game.config.checkpoint_id) return STALE;
  await voidWinner(game.id, attendeeId);
  forgetPool(game.id);
  const pool = await poolFor(b.event, game);
  if (pool.length === 0) return commit(b.event, expected, drawReadyWrite(b.stage), "Marked as not here. No one is left to draw for this prize.");
  const picked = await drawSpin({
    eventId: b.event.id, expected, runId: b.stage.run_id, gameId: game.id, prizeNo: spun.prizeNo, count: 1,
    checkpointId: game.config.checkpoint_id, exclude: game.config.exclude_categories,
    spinEndsAt: new Date(Date.now() + SPIN_MS).toISOString(),
  });
  forgetStage(b.event.id);
  forgetPool(game.id);
  return picked === null ? STALE : { ok: true };
}

export async function idleAction(token: string, expected: number): Promise<HostResult> {
  const b = await begin(token, expected, "idle");
  if ("ok" in b) return b;
  return commit(b.event, expected, idleWrite());
}
```

- [ ] **Step 3: Write the refused-link screen and the host page**

Create `src/components/games/LinkRefused.tsx`:

```tsx
import { Flag } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/** An expired or not-yet-live host or display link says so, like the crew link does. */
export function LinkRefused({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 p-6">
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Flag /></EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{body}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
  );
}
```

Create `src/app/host/[token]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { hostLinkState } from "@/lib/games/live";
import { hostState } from "@/lib/games/display-state";
import { HostConsole } from "@/components/games/HostConsole";
import { LinkRefused } from "@/components/games/LinkRefused";

// Never cached: the stage is live, and an expired link must stop on the day it does.
export const dynamic = "force-dynamic";
export const metadata = { title: "Host console", robots: { index: false } };

export default async function HostPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await hostLinkState(token);
  if ("refused" in link) {
    if (link.refused === "missing") notFound();
    return link.refused === "draft"
      ? <LinkRefused title="This event is not published yet" body="Publish the event in Settings, then open this link again." />
      : <LinkRefused title="This host link has expired" body="The event is over. Ask the organiser for a new link if you still need it." />;
  }
  return <HostConsole token={token} initial={await hostState(link.event, Date.now())} />;
}
```

- [ ] **Step 4: Write the host console**

Create `src/components/games/HostConsole.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import type { HostState } from "@/lib/games/wire";
import type { Phase } from "@/lib/games/phase";
import { GAME_KIND_LABELS } from "@/lib/games/config";
import { HOST_INTERVAL } from "@/lib/games/poll";
import { isOver } from "@/lib/games/survival";
import { OPTION_STYLES } from "@/lib/games/views";
import { Button } from "@/components/ui/button";
import { usePoll, useServerNow } from "./usePoll";
import {
  drawAction, finishAction, idleAction, nextAction, openGameAction, presentAction, redrawAction,
  revealAction, startAction, stopAction, type HostResult,
} from "@/app/host/[token]/actions";

const every = () => HOST_INTERVAL;
const big = "h-14 w-full text-base font-bold";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Nothing on stage",
  race_lobby: "Lobby — players joining",
  race_countdown: "Countdown",
  race_live: "Racing",
  race_results: "Results",
  survival_lobby: "Lobby — players joining",
  survival_question: "Question open",
  survival_locked: "Time's up",
  survival_reveal: "Answer revealed",
  survival_over: "Game over",
  draw_ready: "Ready to draw",
  draw_spinning: "Drawing…",
  draw_reveal: "Winner on screen",
};

/**
 * The stage, run from a phone (D251). One big button for the next step, a two-tap "End game",
 * and the facts the host needs to talk over it. Every action carries the version this console
 * was showing, so two consoles cannot skip a step (D261); a refusal says so and the console
 * catches up on the next poll, which it asks for at once.
 */
export function HostConsole({ token, initial }: { token: string; initial: HostState }) {
  const { state, offset, pollNow } = usePoll<HostState>(`/api/host/${token}/state`, initial, every, false);
  const s = state.stage;
  const now = useServerNow(offset, 250, s.phase === "race_countdown" || s.phase === "race_live" || s.phase === "survival_question");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const v = state.version;

  const run = (fn: () => Promise<HostResult>) => startTransition(async () => {
    const r = await fn();
    setMessage(r.message ?? null);
    setArmed(null);
    pollNow();
  });
  const confirmTwice = (id: string, fn: () => Promise<HostResult>) => (armed === id ? run(fn) : setArmed(id));
  const secondsLeft = (until: number | null) => (until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000)));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 p-4">
      <header className="flex flex-col gap-0.5">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{state.event.name} · Host</p>
        <h1 className="text-xl font-extrabold leading-tight">{s.game?.title ?? "Games"}</h1>
        <p className="text-sm text-muted-foreground">{s.game ? `${GAME_KIND_LABELS[s.game.kind]} · ` : ""}{PHASE_LABEL[s.phase]}</p>
      </header>

      {message && <p role="status" className="rounded-lg bg-muted p-3 text-sm">{message}</p>}

      <section className="flex flex-col gap-3">
        {/* Tap race */}
        {s.phase === "race_lobby" && (
          <>
            <Facts rows={state.race?.lanes.map((l) => [l.label, `${l.players} joined`]) ?? []} empty="Waiting for players to join…" />
            <Button className={big} disabled={pending} onClick={() => run(() => startAction(token, v))}>Start race</Button>
          </>
        )}
        {(s.phase === "race_countdown" || s.phase === "race_live") && (
          <>
            <p className="text-center text-5xl font-extrabold tabular-nums">
              {s.phase === "race_countdown" ? secondsLeft(s.race?.liveFrom ?? null) : `${secondsLeft(s.race?.liveUntil ?? null)}s`}
            </p>
            <Facts rows={state.race?.lanes.slice(0, 5).map((l) => [`${l.place}. ${l.label}`, String(l.score)]) ?? []} />
            <Button className={big} variant="destructive" disabled={pending} onClick={() => run(() => stopAction(token, v))}>Stop race</Button>
          </>
        )}
        {s.phase === "race_results" && (
          <>
            <Facts rows={state.race?.lanes.slice(0, 3).map((l) => [`${l.place}. ${l.label}`, String(l.score)]) ?? []} />
            {state.race?.mvp && <p className="text-sm">Fastest tapper: <b>{state.race.mvp.name}</b> ({state.race.mvp.taps})</p>}
            {s.game && <Button className={big} disabled={pending} onClick={() => run(() => openGameAction(token, v, s.game!.id, state.grouping))}>Run again</Button>}
          </>
        )}

        {/* Last one standing */}
        {s.phase === "survival_lobby" && (
          <>
            <p className="text-center text-5xl font-extrabold tabular-nums">{state.survival?.players.length ?? 0}<span className="block text-sm font-normal text-muted-foreground">joined</span></p>
            <Button className={big} disabled={pending} onClick={() => run(() => startAction(token, v))}>Start question 1</Button>
          </>
        )}
        {(s.phase === "survival_question" || s.phase === "survival_locked") && s.question && (
          <>
            <p className="text-sm font-bold">Question {s.question.no + 1} of {s.question.total}</p>
            <p className="text-lg font-bold">{s.question.text}</p>
            <p className="text-sm text-muted-foreground">
              {state.survival?.answered ?? 0} of {state.survival?.players.length ?? 0} answered
              {s.phase === "survival_question" ? ` · ${secondsLeft(s.question.deadline)}s left` : ""}
            </p>
            {s.phase === "survival_locked" && state.survival?.split && (
              <Facts rows={s.question.options.map((o, i) => [`${OPTION_STYLES[i].letter}. ${o}`, String(state.survival!.split![i] ?? 0)])} />
            )}
            {s.phase === "survival_locked" && <Button className={big} disabled={pending} onClick={() => run(() => revealAction(token, v))}>Reveal answer</Button>}
          </>
        )}
        {s.phase === "survival_reveal" && s.question && s.reveal && (
          <>
            <p className="text-center text-lg font-bold">
              {s.reveal.everyoneSurvived ? "Everyone was wrong — everyone survives!" : `−${s.reveal.eliminated} · ${s.reveal.remaining} remain`}
            </p>
            {isOver(s.reveal.remaining, s.question.no, s.question.total)
              ? <Button className={big} disabled={pending} onClick={() => run(() => finishAction(token, v))}>Show the winner</Button>
              : <Button className={big} disabled={pending} onClick={() => run(() => nextAction(token, v))}>Next question ({s.question.no + 2} of {s.question.total})</Button>}
          </>
        )}
        {s.phase === "survival_over" && (
          <>
            <Facts rows={state.survival?.winners.map((w) => [w.name, w.company]) ?? []} empty="No winner." />
            {s.game && <Button className={big} disabled={pending} onClick={() => run(() => openGameAction(token, v, s.game!.id, null))}>Play again</Button>}
          </>
        )}

        {/* Lucky draw */}
        {s.phase === "draw_ready" && state.hostDraw && (
          <>
            <Facts rows={state.hostDraw.progress.map((p) => [p.name, `${p.given}/${p.quantity}`])} />
            <p className="text-sm text-muted-foreground">{state.draw?.pool ?? 0} eligible</p>
            {(() => {
              const next = state.hostDraw.progress.find((p) => p.remaining > 0);
              if (!next) return <p className="text-sm font-bold">Every prize has been drawn.</p>;
              return (
                <>
                  <Button className={big} disabled={pending} onClick={() => run(() => drawAction(token, v, "one"))}>Draw 1 × {next.name}</Button>
                  {next.remaining > 1 && (
                    <Button className={big} variant="outline" disabled={pending} onClick={() => run(() => drawAction(token, v, "all"))}>
                      Draw all {next.remaining} remaining
                    </Button>
                  )}
                </>
              );
            })()}
          </>
        )}
        {(s.phase === "draw_spinning" || s.phase === "draw_reveal") && state.hostDraw && (
          <>
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
              {s.phase === "draw_spinning" ? "Drawn — the screen is still rolling" : "On screen now"}
            </p>
            <ul className="flex flex-col gap-2">
              {state.hostDraw.spinWinners.map((w) => (
                <li key={w.id} className="flex items-center gap-2 rounded-lg border border-border p-3">
                  <span className="min-w-0 flex-1"><b className="block truncate">{w.name}</b><span className="text-xs text-muted-foreground">{w.company}</span></span>
                  {s.phase === "draw_reveal" && (
                    <Button variant="outline" size="sm" disabled={pending} onClick={() => confirmTwice(`redraw:${w.id}`, () => redrawAction(token, v, w.id))}>
                      {armed === `redraw:${w.id}` ? "Tap again" : "Not here"}
                    </Button>
                  )}
                </li>
              ))}
              {state.hostDraw.spinWinners.length === 0 && <li className="text-sm text-muted-foreground">No one left to draw.</li>}
            </ul>
            {s.phase === "draw_reveal" && <Button className={big} disabled={pending} onClick={() => run(() => presentAction(token, v))}>✓ Present — next prize</Button>}
          </>
        )}
      </section>

      {state.actions.includes("open") && <GamePicker state={state} pending={pending} onOpen={(id, grouping) => run(() => openGameAction(token, v, id, grouping))} />}

      {state.actions.includes("idle") && (
        <Button variant="ghost" className="mt-auto" disabled={pending} onClick={() => confirmTwice("idle", () => idleAction(token, v))}>
          {armed === "idle" ? "Tap again to end the game" : "End game"}
        </Button>
      )}
    </main>
  );
}

function Facts({ rows, empty }: { rows: string[][]; empty?: string }) {
  if (rows.length === 0) return empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null;
  return (
    <dl className="flex flex-col divide-y divide-border rounded-lg border border-border text-sm">
      {rows.map(([k, val], i) => (
        <div key={i} className="flex justify-between gap-3 px-3 py-2"><dt className="truncate">{k}</dt><dd className="shrink-0 font-bold tabular-nums">{val}</dd></div>
      ))}
    </dl>
  );
}

/** Pick the next game; a race also picks its lanes here (D263). */
function GamePicker({ state, pending, onOpen }: { state: HostState; pending: boolean; onOpen: (id: string, grouping: unknown) => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [lanes, setLanes] = useState("solo");
  const game = state.games.find((g) => g.id === picked);
  const grouping = lanes === "solo" ? { by: "solo" } : lanes === "category" ? { by: "category" }
    : { by: "field", key: lanes, label: state.fields.find((f) => f.key === lanes)?.label ?? lanes };

  if (state.games.length === 0) return <p className="text-sm text-muted-foreground">No games yet. Add them on the Games page in admin.</p>;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Start a game</h2>
      <ul className="flex flex-col gap-2">
        {state.games.map((g) => (
          <li key={g.id}>
            <button type="button" onClick={() => setPicked(g.id)}
              className={`flex w-full flex-col rounded-xl border p-3 text-left ${picked === g.id ? "border-primary bg-primary/5" : "border-border"}`}>
              <span className="font-bold">{g.title}</span>
              <span className="text-xs text-muted-foreground">{GAME_KIND_LABELS[g.kind]} · {g.summary}</span>
            </button>
          </li>
        ))}
      </ul>
      {game?.kind === "tap_race" && (
        <label className="flex flex-col gap-1 text-sm font-bold">
          Lanes
          <select value={lanes} onChange={(e) => setLanes(e.target.value)} className="h-11 rounded-md border border-input bg-transparent px-3 text-base">
            <option value="solo">Everyone solo (top 10)</option>
            <option value="category">By category</option>
            {state.fields.map((f) => <option key={f.key} value={f.key}>By {f.label}</option>)}
          </select>
        </label>
      )}
      {game && <Button className={big} disabled={pending} onClick={() => onOpen(game.id, game.kind === "tap_race" ? grouping : null)}>Open {game.title}</Button>}
    </section>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all green.

In the browser (dev server), on a published test event with a tap race, a last one standing with two questions, and a draw with a checkpoint and prizes: open the host link from the Games page. Check that:
- The picker lists all three games.
- Opening the race with lanes "By category" shows "Waiting for players to join…".
- Start shows a 3-2-1 countdown then the seconds left, and the phase label moves on by itself.
- After the race, "Run again" opens a new lobby.
- End game needs two taps.
- Opening the host link in a second tab, pressing Start in one and then in the other gives "Someone else moved the game on." in the second.
- The draw buttons refuse with a clear message when nobody is checked in at the checkpoint.

- [ ] **Step 6: Commit**

```bash
git add src/components/games/usePoll.ts src/components/games/HostConsole.tsx src/components/games/LinkRefused.tsx "src/app/host/[token]"
git commit -m "feat(games): host console on a crew link

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Play page, portal banner and Games tile

**Files:**
- Create: `src/components/games/PlayClient.tsx`, `src/components/games/GameBanner.tsx`, `src/app/e/[slug]/a/[token]/play/page.tsx`
- Modify: `src/lib/modules.ts:36-52` (`TILE_ROUTES`, `TILE_ROUTE_LABELS`), `src/app/e/[slug]/a/[token]/page.tsx` (banner)
- Test: `tests/modules.test.ts` (existing "every TILE_ROUTES entry has a label" covers the new route)

**Interfaces:**
- Consumes: Tasks 8, 9, 13, 14 (`usePoll`, `useServerNow`), `countGames` (Task 10).
- Produces: `PlayClient({ token, initial: PhoneState })`, `GameBanner({ token, basePath, initial: PhoneState })`, portal route `play`.

- [ ] **Step 1: Add the tile route**

In `src/lib/modules.ts`, change:

```ts
export const TILE_ROUTES = ["agenda", "announcements", "info", "me", "seat", "stamps", "activities", "play"] as const;
```

and add `play: "Games",` to `TILE_ROUTE_LABELS`. Run `npx tsc --noEmit`; if any other `Record<TileRoute, ...>` now fails (search with `grep -rn "TileRoute" src`), add a `play` entry there too.

Run: `npx vitest run tests/modules.test.ts`
Expected: PASS.

- [ ] **Step 2: Write the play client**

Create `src/components/games/PlayClient.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import type { PhoneState } from "@/lib/games/wire";
import type { PublicStage } from "@/lib/games/views";
import { OPTION_STYLES } from "@/lib/games/views";
import { phoneInterval } from "@/lib/games/poll";
import { Button } from "@/components/ui/button";
import { usePoll, useServerNow } from "./usePoll";

const phoneEvery = (s: PhoneState) => phoneInterval(s.stage?.phase ?? null);
const big = "h-16 w-full text-lg font-extrabold";

/**
 * The attendee's side of every game (D251). It follows the stage by polling (D256): once a
 * second while a game is on, every 5 s otherwise, sending its key so an unchanged stage costs
 * almost nothing. Joining answers with the fresh state, so the button changes at once.
 */
export function PlayClient({ token, initial }: { token: string; initial: PhoneState }) {
  const { state, offset, apply } = usePoll<PhoneState>(`/api/play/${token}/state`, initial, phoneEvery, true);
  const [error, setError] = useState<string | null>(null);
  const s = state.stage;
  const me = state.me;
  const ticking = !!s && (s.phase === "race_countdown" || s.phase === "race_live" || s.phase === "survival_question");
  const now = useServerNow(offset, 100, ticking);

  const join = async () => {
    setError(null);
    const res = await fetch(`/api/play/${token}/join`, { method: "POST" });
    const body = await res.json().catch(() => ({ error: "Could not join. Try again." }));
    if (res.ok) apply(body as PhoneState);
    else setError((body as { error?: string }).error ?? "Could not join. Try again.");
  };

  if (!s || !me) return <Note>Loading…</Note>;
  const title = s.game?.title;

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      {title && <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{title}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {s.phase === "idle" && <Note>No game on right now. Keep this page open — it switches on by itself when the host starts one.</Note>}

      {/* Tap race */}
      {me.kind === "race" && s.phase === "race_lobby" && (
        <>
          <p className="text-lg">You&apos;re racing for <b className="text-primary">{me.lane}</b></p>
          {me.joined ? <Note>You&apos;re in ✓ Get ready to tap!</Note> : <Button className={big} onClick={join}>Join the race</Button>}
        </>
      )}
      {me.kind === "race" && s.phase === "race_countdown" && s.race && (
        me.joined
          ? <p className="text-8xl font-extrabold tabular-nums">{Math.max(1, Math.ceil((s.race.liveFrom - now) / 1000))}</p>
          : <Note>The race has started. Catch the next one!</Note>
      )}
      {me.kind === "race" && s.phase === "race_live" && s.race && (
        me.joined
          ? <TapPad token={token} initial={me.taps} secondsLeft={Math.max(0, Math.ceil((s.race.liveUntil - now) / 1000))} />
          : <Note>The race has started. Catch the next one!</Note>
      )}
      {me.kind === "race" && s.phase === "race_results" && (
        me.joined && me.place
          ? <Note><b className="text-2xl">{me.lane} finished {ordinal(me.place)}</b><br />of {me.lanes} — you tapped {me.taps}</Note>
          : <Note>Race over — see the screen for the results.</Note>
      )}

      {/* Last one standing */}
      {me.kind === "survival" && s.phase === "survival_lobby" && (
        me.joined ? <Note>You&apos;re in ✓ Watch the screen for question 1.</Note> : <Button className={big} onClick={join}>I&apos;m in</Button>
      )}
      {me.kind === "survival" && ["survival_question", "survival_locked", "survival_reveal", "survival_over"].includes(s.phase) && (
        <SurvivalPlay token={token} stage={s} me={me} now={now} />
      )}

      {/* Lucky draw: no phone play (D277) */}
      {me.kind === "draw" && (
        me.won
          ? <Note><span className="text-5xl">🎉</span><br /><b className="text-2xl">You won {me.won}!</b><br />Come to the stage.</Note>
          : <Note>Lucky draw on stage — eyes on the screen!</Note>
      )}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="max-w-sm text-base text-muted-foreground">{children}</p>;
}

const SUFFIX: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };
const ordinal = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? `${n}th` : `${n}${SUFFIX[n % 10] ?? "th"}`);

/**
 * The tap button (D269). Taps are counted here and sent in a batch every second (D266); a batch
 * that fails is dropped, never replayed (D262). The last batch is sent when the race ends and
 * this unmounts, inside the server's 1.5 s grace.
 */
function TapPad({ token, initial, secondsLeft }: { token: string; initial: number; secondsLeft: number }) {
  const [count, setCount] = useState(initial);
  const pending = useRef(0);

  useEffect(() => {
    const send = () => {
      const n = pending.current;
      if (!n) return;
      pending.current = 0;
      void fetch(`/api/play/${token}/taps`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ n }), keepalive: true,
      }).catch(() => {});
    };
    const id = setInterval(send, 1000);
    return () => { clearInterval(id); send(); };
  }, [token]);

  const tap = () => {
    pending.current += 1;
    setCount((c) => c + 1);
    navigator.vibrate?.(8);
  };

  return (
    <>
      <p className="text-sm font-bold tabular-nums text-muted-foreground">{secondsLeft}s left</p>
      <button
        type="button"
        onPointerDown={tap}
        onContextMenu={(e) => e.preventDefault()}
        className="flex size-64 select-none items-center justify-center rounded-full bg-primary text-5xl font-extrabold text-primary-foreground shadow-lg active:scale-95"
        style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
      >
        TAP!
      </button>
      <p className="text-3xl font-extrabold tabular-nums">{count}</p>
    </>
  );
}

type SurvivalMe = Extract<NonNullable<PhoneState["me"]>, { kind: "survival" }>;

function SurvivalPlay({ token, stage, me, now }: { token: string; stage: PublicStage; me: SurvivalMe; now: number }) {
  const q = stage.question;
  const [picked, setPicked] = useState<number | null>(me.answered);
  const [error, setError] = useState<string | null>(null);
  // A new question clears the local pick; the server's answer for it (if any) comes with the state.
  const [forQuestion, setForQuestion] = useState(q?.no ?? -1);
  if ((q?.no ?? -1) !== forQuestion) {
    setForQuestion(q?.no ?? -1);
    setPicked(me.answered);
    setError(null);
  }

  if (!me.joined) return <Note>This game started without you. Watch the screen — the next one is yours!</Note>;
  const outBefore = me.outAt !== null && (q === null || me.outAt < q.no);
  if (stage.phase === "survival_over") {
    return me.outAt === null ? <Note><span className="text-5xl">🏆</span><br /><b className="text-2xl">You won!</b></Note> : <Note>Game over — see the screen for the winner.</Note>;
  }
  if (!q) return null;
  if (stage.phase === "survival_reveal") {
    if (outBefore) return <Note>You&apos;re out — watching.</Note>;
    return me.outAt === q.no
      ? <Note><span className="text-5xl">❌</span><br /><b className="text-2xl">You&apos;re out</b><br />Stay and watch who wins!</Note>
      : <Note><span className="text-5xl">✅</span><br /><b className="text-2xl">You&apos;re through!</b></Note>;
  }

  const answer = async (choice: number) => {
    setPicked(choice);
    const res = await fetch(`/api/play/${token}/answer`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q.no, choice }),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; choice?: number; error?: string };
    if (body.ok && typeof body.choice === "number") setPicked(body.choice);
    else { setPicked(null); setError(body.error ?? "That answer did not go through."); }
  };
  const locked = stage.phase === "survival_locked" || picked !== null || outBefore;

  return (
    <div className="flex w-full flex-col gap-3">
      <p className="text-sm font-bold text-muted-foreground">
        Question {q.no + 1} of {q.total}
        {stage.phase === "survival_question" && q.deadline ? ` · ${Math.max(0, Math.ceil((q.deadline - now) / 1000))}s` : ""}
      </p>
      <p className="text-xl font-extrabold">{q.text}</p>
      {outBefore && <Note>You&apos;re out — watching this one.</Note>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-1 gap-2">
        {q.options.map((o, i) => (
          <button key={i} type="button" disabled={locked} onClick={() => answer(i)}
            className={`flex min-h-16 items-center gap-3 rounded-xl px-4 text-left text-lg font-bold text-white transition-opacity ${locked && picked !== i ? "opacity-35" : ""}`}
            style={{ background: OPTION_STYLES[i].colour }}>
            <span className="text-2xl">{OPTION_STYLES[i].letter}</span>{o}
          </button>
        ))}
      </div>
      {picked !== null && <Note>Answer locked in — look at the screen.</Note>}
      {picked === null && stage.phase === "survival_locked" && !outBefore && <Note>Time&apos;s up.</Note>}
    </div>
  );
}
```

(`setState` during render when `q.no` changes is React's documented "adjust state when a prop changes" pattern. If the project's ESLint flags it, switch to `key={q?.no}` on `<SurvivalPlay>` in the parent and drop `forQuestion`.)

- [ ] **Step 3: Write the play page**

Create `src/app/e/[slug]/a/[token]/play/page.tsx`:

```tsx
import { loadPortalAttendee, isUnpublished } from "@/lib/portal";
import { phoneState } from "@/lib/games/phone-state";
import { PlayClient } from "@/components/games/PlayClient";

export const dynamic = "force-dynamic";

export default async function Play({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  // A draft shows only "Coming soon" (the layout's chrome); see isUnpublished.
  if (isUnpublished(event)) return null;
  const initial = await phoneState({ event, attendee }, null, Date.now());
  return (
    <>
      <h1 className="mb-4 text-xl font-extrabold">Games</h1>
      <PlayClient token={token} initial={initial} />
    </>
  );
}
```

- [ ] **Step 4: Write the portal banner**

Create `src/components/games/GameBanner.tsx`:

```tsx
"use client";
import Link from "next/link";
import type { PhoneState } from "@/lib/games/wire";
import type { Phase } from "@/lib/games/phase";
import { usePoll } from "./usePoll";

const every = () => 5000;
const PLAYING: ReadonlySet<Phase> = new Set<Phase>([
  "race_lobby", "race_countdown", "race_live",
  "survival_lobby", "survival_question", "survival_locked", "survival_reveal",
]);

/**
 * "Game on — tap to join" on the portal home while a race or last one standing is in its lobby
 * or live (D254), and "You won" for a draw winner (D282). Polls every 5 s; rendered only on
 * events that have a game at all.
 */
export function GameBanner({ token, basePath, initial }: { token: string; basePath: string; initial: PhoneState }) {
  const { state } = usePoll<PhoneState>(`/api/play/${token}/state`, initial, every, true);
  const s = state.stage;
  const me = state.me;
  if (me?.kind === "draw" && me.won) {
    return (
      <div className="rounded-xl bg-primary p-4 text-center text-primary-foreground">
        <b className="text-lg">🎉 You won {me.won}!</b>
        <p className="text-sm">Come to the stage.</p>
      </div>
    );
  }
  if (!s || !PLAYING.has(s.phase)) return null;
  const joining = s.phase === "race_lobby" || s.phase === "survival_lobby";
  return (
    <Link href={`${basePath}/play`} className="flex items-center gap-3 rounded-xl bg-primary p-4 text-primary-foreground">
      <span className="text-3xl">🎮</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="truncate">{joining ? "Game on — tap to join" : "Game on — tap to play"}</b>
        <span className="truncate text-sm opacity-90">{s.game?.title}</span>
      </span>
      <span aria-hidden>›</span>
    </Link>
  );
}
```

In `src/app/e/[slug]/a/[token]/page.tsx`:
- add imports: `import { countGames } from "@/lib/db/games";`, `import { phoneState } from "@/lib/games/phone-state";`, `import { GameBanner } from "@/components/games/GameBanner";`
- after the existing `Promise.all`, add:

```ts
  // Only events with a game pay for the banner's first state read (D254).
  const game = (await countGames(event.id)) > 0 ? await phoneState({ event, attendee }, null, Date.now()) : null;
```

- in the first column, directly above `<BadgeCard …/>`, add:

```tsx
          {game && <GameBanner token={token} basePath={basePath} initial={game} />}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all green.

In the browser, on the test event: add a tile in Modules → Portal page "Games". Open two attendees' personal links, one in a phone-sized window (`resize_window` preset mobile). From the host console:
- Open the race with lanes by a field. Both phones show "You're racing for …"; the home page banner reads "Game on — tap to join".
- Join on one phone only. Start: the joined phone counts down then shows TAP!, the other says "Catch the next one".
- Tap for a while; results show place and taps.
- Run last one standing: I'm in on both. Answer question 1 right on one and wrong on the other. Reveal: ✅ / ❌. The ❌ phone sees the next question dimmed with "watching". Finish: 🏆 on the survivor.
- Run the draw with one of the two checked in at its checkpoint: after the spin, that phone's banner and play page say "You won …".

- [ ] **Step 6: Commit**

```bash
git add src/lib/modules.ts src/components/games/PlayClient.tsx src/components/games/GameBanner.tsx "src/app/e/[slug]/a/[token]/play" "src/app/e/[slug]/a/[token]/page.tsx"
git commit -m "feat(portal): play page, Game on banner and Games tile

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: LED display — shell, idle and the race

**Files:**
- Create: `src/app/display/[token]/page.tsx`, `src/app/display/[token]/display.css`, `src/components/games/display/DisplayClient.tsx`, `src/components/games/display/Frame.tsx`, `src/components/games/display/IdleScreen.tsx`, `src/components/games/display/RaceScreen.tsx`

**Interfaces:**
- Consumes: Tasks 8, 9, 13, 14 (`usePoll`, `useServerNow`, `LinkRefused`).
- Produces: `DisplayClient({ token, initial: DisplayState })` with a `Screen` switch that Tasks 17 and 18 extend; `Frame({ title, right?, children })`; CSS classes `mosaic-tile`, `mosaic-dark`, `mosaic-lit`, `mosaic-flash`, `confetti`, `countdown-pop` in `display.css`.

- [ ] **Step 1: Write the stylesheet**

Create `src/app/display/[token]/display.css`:

```css
/* The LED page's animations (D275, D284). Only opacity, filter and transform animate, so 500
   mosaic tiles stay smooth on an ordinary laptop. */

.countdown-pop { animation: countdown-pop 900ms ease-out both; }
@keyframes countdown-pop {
  from { transform: scale(1.6); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.mosaic-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--brand);
  color: #fff;
  transition: opacity 500ms ease, filter 500ms ease;
  /* backwards, not both: once popped in, the class below must be free to dim the tile. */
  animation: tile-pop 350ms ease-out backwards;
}
@keyframes tile-pop {
  from { transform: scale(0.6); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.mosaic-dark { opacity: 0.12; filter: grayscale(1) brightness(0.5); }

/* Survivors pulse once, after the ripple has run (D275 step 3). */
.mosaic-lit { animation: tile-pulse 900ms ease-in-out 2200ms 1; }
@keyframes tile-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.08); box-shadow: 0 0 24px var(--brand); }
}

/* "Everyone survives!" — the whole mosaic flashes instead of darkening. */
.mosaic-flash { animation: mosaic-flash 700ms ease-in-out 2; }
@keyframes mosaic-flash {
  0%, 100% { filter: none; }
  50% { filter: brightness(2.2); }
}

.confetti {
  position: absolute;
  top: -40px;
  width: 16px;
  height: 26px;
  border-radius: 3px;
  animation-name: confetti-fall;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
@keyframes confetti-fall {
  from { transform: translateY(0) rotate(0deg); }
  to { transform: translateY(1160px) rotate(720deg); }
}
```

- [ ] **Step 2: Write the page**

Create `src/app/display/[token]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { displayLinkState } from "@/lib/games/live";
import { displayState } from "@/lib/games/display-state";
import { DisplayClient } from "@/components/games/display/DisplayClient";
import { LinkRefused } from "@/components/games/LinkRefused";
import "./display.css";

// Never cached: the stage is live, and an expired link must stop on the day it does.
export const dynamic = "force-dynamic";
export const metadata = { title: "Display", robots: { index: false } };

export default async function DisplayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await displayLinkState(token);
  if ("refused" in link) {
    if (link.refused === "missing") notFound();
    return link.refused === "draft"
      ? <LinkRefused title="This event is not published yet" body="Publish the event in Settings, then reload this page." />
      : <LinkRefused title="This display link has expired" body="The event is over. Ask the organiser for a new link if you still need it." />;
  }
  return <DisplayClient token={token} initial={await displayState(link.event, Date.now())} />;
}
```

- [ ] **Step 3: Write the shell**

Create `src/components/games/display/Frame.tsx`:

```tsx
/** The LED's standard layout: a title on the left, one big fact on the right, the screen's content below. */
export function Frame({ title, right, children }: { title: string; right?: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col px-16 pb-12 pt-10">
      <header className="flex items-baseline justify-between gap-8">
        <h1 className="truncate text-6xl font-extrabold">{title}</h1>
        {right && <span className="shrink-0 text-6xl font-extrabold tabular-nums text-[var(--brand)]">{right}</span>}
      </header>
      <div className="min-h-0 flex-1 pt-8">{children}</div>
    </div>
  );
}
```

Create `src/components/games/display/IdleScreen.tsx`:

```tsx
import { APP_NAME } from "@/lib/app-name";
import type { DisplayState } from "@/lib/games/wire";

/** Nothing on stage (D285): the event's name and a nudge to have phones ready. */
export function IdleScreen({ event }: { event: DisplayState["event"] }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-10 bg-[radial-gradient(circle_at_50%_40%,color-mix(in_srgb,var(--brand)_35%,black),black_70%)]">
      {event.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- an organiser upload of unknown size; next/image adds nothing on a 1080p canvas
        <img src={event.logoUrl} alt="" className="max-h-[260px] max-w-[900px] object-contain" />
      )}
      <h1 className="max-w-[1700px] text-center text-[110px] font-extrabold leading-none">{event.name}</h1>
      <p className="text-5xl opacity-70">Get ready…</p>
      <p className="text-3xl opacity-50">Open {APP_NAME} on your phone to play</p>
    </div>
  );
}
```

Create `src/components/games/display/DisplayClient.tsx`:

```tsx
"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { DisplayState } from "@/lib/games/wire";
import { displayInterval } from "@/lib/games/poll";
import { usePoll } from "../usePoll";
import { IdleScreen } from "./IdleScreen";
import { RaceScreen } from "./RaceScreen";

const displayEvery = (s: DisplayState) => displayInterval(s.stage.phase);

const onResize = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};
const fitScale = () => Math.min(window.innerWidth / 1920, window.innerHeight / 1080);

/** Everything is laid out on a fixed 1920×1080 canvas (D284) and scaled to whatever the screen is. */
function Canvas1080({ children }: { children: React.ReactNode }) {
  const scale = useSyncExternalStore(onResize, fitScale, () => 1);
  return (
    <div className="absolute left-1/2 top-1/2 h-[1080px] w-[1920px]" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
      {children}
    </div>
  );
}

/** Keeps the screen from sleeping (D284). Browsers drop the lock when the tab hides, so it is re-taken on return. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      try { lock = await navigator.wakeLock.request("screen"); } catch { /* denied or unsupported: the page still works */ }
    };
    const onVisible = () => { if (!stopped && document.visibilityState === "visible") void acquire(); };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [active]);
}

/**
 * The LED page (D251). It opens on "Click to start display" because browsers allow fullscreen
 * and a wake lock only after a click (D284). It polls the full view (D260): four times a second
 * during a race, once a second otherwise. A reload redraws straight from the stage (D262).
 */
export function DisplayClient({ token, initial }: { token: string; initial: DisplayState }) {
  const { state, offset } = usePoll<DisplayState>(`/api/display/${token}/state`, initial, displayEvery, false);
  const [started, setStarted] = useState(false);
  useWakeLock(started);

  const start = () => {
    setStarted(true);
    void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="fixed inset-0 cursor-none overflow-hidden bg-black text-white" style={{ "--brand": state.event.colour } as React.CSSProperties}>
      <Canvas1080>
        <Screen state={state} offset={offset} />
      </Canvas1080>
      {!started && (
        <button type="button" onClick={start}
          className="absolute inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-4 bg-black/85">
          <span className="text-5xl font-extrabold">Click to start display</span>
          <span className="text-xl opacity-70">Goes full screen and keeps the screen awake.</span>
        </button>
      )}
    </div>
  );
}

function Screen({ state, offset }: { state: DisplayState; offset: number }) {
  const kind = state.stage.game?.kind;
  if (kind === "tap_race" && state.race) return <RaceScreen state={state} offset={offset} />;
  return <IdleScreen event={state.event} />;
}
```

- [ ] **Step 4: Write the race screen**

Create `src/components/games/display/RaceScreen.tsx`:

```tsx
"use client";
import { APP_NAME } from "@/lib/app-name";
import type { DisplayLane, DisplayState } from "@/lib/games/wire";
import { useServerNow } from "../usePoll";
import { Frame } from "./Frame";

/** The tap race on the LED (D268): lanes filling, 3-2-1, racing lanes, then the podium. */
export function RaceScreen({ state, offset }: { state: DisplayState; offset: number }) {
  const s = state.stage;
  const race = state.race!;
  const now = useServerNow(offset, 100, s.phase === "race_countdown" || s.phase === "race_live");
  const title = s.game?.title ?? "Tap race";

  if (s.phase === "race_lobby") {
    const players = race.lanes.reduce((n, l) => n + l.players, 0);
    return (
      <Frame title={title} right={`${players} ${players === 1 ? "player" : "players"}`}>
        <div className="flex h-full flex-col items-center justify-center gap-12">
          <p className="text-6xl font-extrabold">Open {APP_NAME} → Games and join!</p>
          <div className="flex max-w-[1700px] flex-wrap justify-center gap-4">
            {race.lanes.map((l) => (
              <div key={l.key} className="rounded-2xl bg-white/10 px-8 py-5 text-4xl font-bold">
                {l.label} <span className="opacity-60">· {l.players}</span>
              </div>
            ))}
          </div>
        </div>
      </Frame>
    );
  }

  if (s.phase === "race_countdown" && s.race) {
    const n = Math.max(1, Math.ceil((s.race.liveFrom - now) / 1000));
    return (
      <Frame title={title}>
        <div className="flex h-full items-center justify-center">
          <span key={n} className="countdown-pop text-[520px] font-extrabold leading-none text-[var(--brand)]">{n}</span>
        </div>
      </Frame>
    );
  }

  if (s.phase === "race_live" && s.race) {
    return (
      <Frame title={title} right={`${Math.max(0, Math.ceil((s.race.liveUntil - now) / 1000))}s`}>
        <Lanes lanes={race.lanes} solo={race.solo} />
      </Frame>
    );
  }

  return (
    <Frame title={`${title} — results`}>
      <Podium lanes={race.lanes} solo={race.solo} mvp={race.mvp} />
    </Frame>
  );
}

/**
 * Lanes stay in a fixed order while racing so bars grow instead of rows jumping; the scale is
 * 110% of the leader so the leader never looks finished. Width eases over each 250 ms poll.
 */
function Lanes({ lanes, solo }: { lanes: DisplayLane[]; solo: boolean }) {
  const ordered = [...lanes].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const max = Math.max(1, ...lanes.map((l) => l.score)) * 1.1;
  const row = Math.min(110, Math.floor(880 / Math.max(1, ordered.length)));
  const text = Math.min(44, row * 0.45);
  return (
    <ol className="flex flex-col gap-2">
      {ordered.map((l) => (
        <li key={l.key} className="flex items-center gap-6" style={{ height: row - 8 }}>
          <span className="w-[380px] truncate text-right font-bold" style={{ fontSize: text }}>{l.label}</span>
          <div className="relative h-full flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[var(--brand)] transition-[width] duration-300 ease-linear" style={{ width: `${(l.score / max) * 100}%` }} />
          </div>
          <span className="w-[160px] text-right font-extrabold tabular-nums" style={{ fontSize: text }}>
            {l.score}{solo ? "" : " avg"}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Podium({ lanes, solo, mvp }: { lanes: DisplayLane[]; solo: boolean; mvp: { name: string; taps: number } | null }) {
  const [first, second, third] = lanes;
  const rest = lanes.slice(3, 12);
  const step = (l: DisplayLane | undefined, height: number, medal: string) =>
    l ? (
      <div className="flex w-[440px] flex-col items-center gap-4">
        <span className="text-7xl">{medal}</span>
        <span className="max-w-full truncate text-5xl font-extrabold">{l.label}</span>
        <span className="text-3xl tabular-nums opacity-70">{l.score} {solo ? "taps" : "avg taps"}</span>
        <div className="w-full rounded-t-3xl bg-[var(--brand)]" style={{ height }} />
      </div>
    ) : <div className="w-[440px]" />;
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 items-end justify-center gap-10">
        {step(second, 260, "🥈")}{step(first, 380, "🥇")}{step(third, 180, "🥉")}
      </div>
      <div className="flex items-center justify-between gap-8 pt-8 text-3xl">
        <span className="truncate opacity-70">{rest.map((l) => `${l.place}. ${l.label}`).join("    ")}</span>
        {mvp && !solo && <span className="shrink-0">⚡ Fastest tapper: <b>{mvp.name}</b> · {mvp.taps}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all green.

In the browser: open the test event's display link. Check that:
- It shows "Click to start display"; after the click, the idle screen shows the event name.
- `resize_window` to 1920×1080 and to 1280×720: the canvas scales and nothing overflows.
- A race driven from the host console (with one or two phones tapping): the lobby shows lanes and player counts; there is a big 3-2-1; bars grow smoothly; the podium shows medals, and the fastest tapper for team lanes.
- Reloading mid-race comes straight back to the race.
- Take a screenshot of the racing lanes and the podium to show the user.

- [ ] **Step 6: Commit**

```bash
git add "src/app/display/[token]" src/components/games/display
git commit -m "feat(games): LED display with the tap race

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: LED — last one standing and the mosaic

**Files:**
- Create: `src/components/games/display/useStep.ts`, `src/components/games/display/Mosaic.tsx`, `src/components/games/display/QuestionBoard.tsx`, `src/components/games/display/WinnerCard.tsx`, `src/components/games/display/SurvivalScreen.tsx`
- Modify: `src/components/games/display/DisplayClient.tsx` (`Screen` switch)

**Interfaces:**
- Consumes: Task 4 (`gridFor`, `seededOrder`, `tierFor`), Task 9 (`OPTION_STYLES`, `PublicQuestion`), Task 16.
- Produces: `useStep(marks: readonly number[]): number` (marks must be a module-level constant); `Mosaic({ people, darkIds?, darken?, hideDark?, seed?, width?, height? })`; `QuestionBoard({ q, now, answered?, players?, split?, showTimer? })`; `WinnerCard({ label, name, company, prize? })`, `JointWinners({ title, winners, prize? })`, `Confetti()`; `SurvivalScreen({ state, offset })`.

- [ ] **Step 1: Write the timeline hook and the mosaic**

Create `src/components/games/display/useStep.ts`:

```ts
"use client";
import { useEffect, useState } from "react";

/**
 * Which step of a timed sequence we are in: 0 until marks[0] ms after mount, then 1 until
 * marks[1], and so on. Three re-renders for a whole reveal, rather than one per frame across
 * 500 tiles. Remount (a new `key`) to replay. `marks` must be a stable, module-level array.
 */
export function useStep(marks: readonly number[]): number {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const ids = marks.map((ms, i) => setTimeout(() => setStep(i + 1), ms));
    return () => ids.forEach(clearTimeout);
  }, [marks]);
  return step;
}
```

Create `src/components/games/display/Mosaic.tsx`:

```tsx
"use client";
import { memo, useMemo } from "react";
import type { Person } from "@/lib/games/wire";
import { gridFor, seededOrder, tierFor } from "@/lib/games/mosaic";

const GAP = 4;
const SPREAD_MS = 2000;

/**
 * One tile per player (D274): initials large, first name small, at every size (D273). With
 * `darken`, the tiles in `darkIds` fade to near-black greyscale in a staggered ripple over
 * ~2 s, in an order seeded by `seed` so a reload replays it identically (D275). `hideDark`
 * drops them so the survivors regroup into bigger tiles.
 */
export const Mosaic = memo(function Mosaic({
  people, darkIds, darken = false, hideDark = false, seed = "", width = 1840, height = 960,
}: {
  people: Person[];
  darkIds?: ReadonlySet<string>;
  darken?: boolean;
  hideDark?: boolean;
  seed?: string;
  width?: number;
  height?: number;
}) {
  const shown = hideDark && darkIds ? people.filter((p) => !darkIds.has(p.id)) : people;
  const { cols, cell } = gridFor(shown.length, width, height);
  const delays = useMemo(() => {
    const m = new Map<string, number>();
    if (!darkIds?.size) return m;
    const order = seededOrder(people.filter((p) => darkIds.has(p.id)).map((p) => p.id), seed);
    order.forEach((id, i) => m.set(id, order.length > 1 ? (i / (order.length - 1)) * SPREAD_MS : 0));
    return m;
  }, [people, darkIds, seed]);
  const size = Math.max(8, cell - GAP);
  const finalist = tierFor(shown.length) === "finalist";

  return (
    <div className="grid h-full content-center justify-center"
      style={{ gap: GAP, gridTemplateColumns: `repeat(${cols}, ${size}px)`, gridAutoRows: `${size}px` }}>
      {shown.map((p) => {
        const out = darken && !!darkIds?.has(p.id);
        return (
          <div key={p.id} className={`mosaic-tile ${out ? "mosaic-dark" : darken ? "mosaic-lit" : ""}`}
            style={{ transitionDelay: out ? `${delays.get(p.id) ?? 0}ms` : undefined, borderRadius: Math.max(4, size * 0.08) }}>
            <span className="font-extrabold leading-none" style={{ fontSize: size * (finalist ? 0.28 : 0.34) }}>{p.initials}</span>
            <span className="mt-[0.2em] max-w-full truncate px-[6%] leading-none opacity-85" style={{ fontSize: Math.max(9, size * (finalist ? 0.12 : 0.15)) }}>
              {p.first}
            </span>
          </div>
        );
      })}
    </div>
  );
});
```

- [ ] **Step 2: Write the question board and winner cards**

Create `src/components/games/display/QuestionBoard.tsx`:

```tsx
import type { PublicQuestion } from "@/lib/games/views";
import { OPTION_STYLES } from "@/lib/games/views";

/**
 * A question on the LED (D276): the question, the colour-coded options, and either the
 * countdown or how the room split. Once `q.correct` is set (reveal), the others dim.
 */
export function QuestionBoard({ q, now, answered, players, split, showTimer = false }: {
  q: PublicQuestion;
  now: number;
  answered?: number;
  players?: number;
  split?: number[] | null;
  showTimer?: boolean;
}) {
  const left = q.deadline ? Math.max(0, Math.ceil((q.deadline - now) / 1000)) : 0;
  const total = split ? Math.max(1, split.reduce((a, b) => a + b, 0)) : 1;
  return (
    <div className="flex h-full flex-col gap-10">
      <div className="flex items-center justify-between text-4xl font-bold opacity-80">
        <span>Question {q.no + 1} of {q.total}</span>
        {showTimer
          ? <span className="text-7xl font-extrabold tabular-nums text-[var(--brand)]">{left}</span>
          : q.correct === null && <span>Time&apos;s up!</span>}
      </div>
      <p className="text-center text-[80px] font-extrabold leading-tight">{q.text}</p>
      <div className="grid flex-1 grid-cols-2 gap-6">
        {q.options.map((o, i) => {
          const right = q.correct === i;
          const dim = q.correct !== null && !right;
          return (
            <div key={i}
              className={`relative flex items-center gap-6 overflow-hidden rounded-3xl px-10 text-6xl font-extrabold transition-opacity duration-500 ${dim ? "opacity-25" : ""} ${right ? "ring-8 ring-white" : ""}`}
              style={{ background: OPTION_STYLES[i].colour }}>
              {split && <div className="absolute inset-y-0 left-0 bg-white/20" style={{ width: `${((split[i] ?? 0) / total) * 100}%` }} />}
              <span className="relative text-7xl">{OPTION_STYLES[i].letter}</span>
              <span className="relative min-w-0 flex-1 truncate">{o}</span>
              {split && <span className="relative tabular-nums">{split[i] ?? 0}</span>}
              {right && <span className="relative">✓</span>}
            </div>
          );
        })}
      </div>
      {showTimer && answered !== undefined && <p className="text-center text-4xl opacity-70">{answered} of {players ?? 0} answered</p>}
    </div>
  );
}
```

Create `src/components/games/display/WinnerCard.tsx`:

```tsx
const COLOURS = ["#F97316", "#FACC15", "#22C55E", "#3B82F6", "#EC4899"];
// Fixed positions: the same shower on every render and every reload.
const PIECES = Array.from({ length: 90 }, (_, i) => ({
  left: (i * 37) % 100, delay: ((i * 53) % 30) / 10, duration: 3 + (i % 5) * 0.7,
  colour: COLOURS[i % COLOURS.length], rotate: (i * 47) % 360,
}));

export function Confetti() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {PIECES.map((p, i) => (
        <span key={i} className="confetti"
          style={{ left: `${p.left}%`, background: p.colour, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`, rotate: `${p.rotate}deg` }} />
      ))}
    </div>
  );
}

/** The one place the LED shows a full name and company (D273): someone is walking on stage. */
export function WinnerCard({ label, name, company, prize }: { label: string; name: string; company: string; prize?: string | null }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-6 px-16 text-center">
      <Confetti />
      <div className="text-5xl font-bold uppercase tracking-[0.2em] text-[var(--brand)]">{label}</div>
      <div className="max-w-[1780px] text-[140px] font-extrabold leading-none">{name}</div>
      {company && <div className="text-5xl opacity-80">{company}</div>}
      {prize && <div className="mt-6 rounded-full bg-[var(--brand)] px-12 py-4 text-5xl font-extrabold">{prize}</div>}
    </div>
  );
}

/** Joint winners of last one standing, or a "draw all" (D272, D282). */
export function JointWinners({ title, winners, prize }: { title: string; winners: { name: string; company: string }[]; prize?: string | null }) {
  const cols = Math.min(5, Math.max(1, Math.ceil(Math.sqrt(winners.length))));
  const size = winners.length > 20 ? 30 : winners.length > 9 ? 40 : 56;
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-10 px-16">
      <Confetti />
      <div className="text-5xl font-bold uppercase tracking-[0.15em] text-[var(--brand)]">{title}</div>
      {prize && <div className="text-7xl font-extrabold">{prize}</div>}
      <div className="grid w-full gap-5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {winners.map((w, i) => (
          <div key={i} className="rounded-2xl bg-white/10 p-5 text-center">
            <div className="truncate font-extrabold" style={{ fontSize: size }}>{w.name}</div>
            {w.company && <div className="truncate opacity-70" style={{ fontSize: size * 0.6 }}>{w.company}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write the survival screen**

Create `src/components/games/display/SurvivalScreen.tsx`:

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { APP_NAME } from "@/lib/app-name";
import type { DisplayState } from "@/lib/games/wire";
import { useServerNow } from "../usePoll";
import { Frame } from "./Frame";
import { Mosaic } from "./Mosaic";
import { QuestionBoard } from "./QuestionBoard";
import { JointWinners, WinnerCard } from "./WinnerCard";
import { useStep } from "./useStep";

/** Reveal timeline (D275): answer 0–1 s, mosaic at 1 s, ripple from 1.2 s, regroup at 4.7 s. */
const MARKS = [1000, 1200, 4700] as const;

export function SurvivalScreen({ state, offset }: { state: DisplayState; offset: number }) {
  const s = state.stage;
  const sv = state.survival!;
  const now = useServerNow(offset, 200, s.phase === "survival_question");
  const title = s.game?.title ?? "Last one standing";

  if (s.phase === "survival_lobby") {
    return (
      <Frame title={title} right={`${sv.players.length} in`}>
        <div className="flex h-full flex-col gap-6">
          <p className="text-center text-5xl font-bold">Open {APP_NAME} → Games and tap “I’m in”</p>
          <div className="min-h-0 flex-1"><Mosaic people={sv.players} height={780} /></div>
        </div>
      </Frame>
    );
  }
  if ((s.phase === "survival_question" || s.phase === "survival_locked") && s.question) {
    return (
      <Frame title={title}>
        <QuestionBoard q={s.question} now={now} answered={sv.answered} players={sv.players.length}
          split={s.phase === "survival_locked" ? sv.split : null} showTimer={s.phase === "survival_question"} />
      </Frame>
    );
  }
  if (s.phase === "survival_reveal" && s.question) return <RevealSequence key={s.key} state={state} />;
  if (s.phase === "survival_over") {
    if (sv.winners.length === 1) return <WinnerCard label="Last one standing" name={sv.winners[0].name} company={sv.winners[0].company} />;
    return <JointWinners title="Last ones standing" winners={sv.winners} />;
  }
  return null;
}

/**
 * The reveal (D275), replayed from the start whenever it mounts — keyed by the stage key, so a
 * new reveal or a reloaded LED starts it again, with the same ripple order.
 */
function RevealSequence({ state }: { state: DisplayState }) {
  const s = state.stage;
  const sv = state.survival!;
  const q = s.question!;
  const step = useStep(MARKS);
  const dark = useMemo(() => new Set(sv.eliminatedIds), [sv.eliminatedIds]);
  const everyone = s.reveal?.everyoneSurvived ?? false;
  const before = sv.players.length;
  const after = everyone ? before : s.reveal?.remaining ?? before - dark.size;

  if (step === 0) {
    return <Frame title={s.game?.title ?? ""}><QuestionBoard q={q} now={0} split={sv.split} /></Frame>;
  }
  return (
    <div className="flex h-full flex-col px-10 pb-6 pt-6">
      <header className="flex items-baseline justify-between pb-4">
        <span className="text-5xl font-extrabold">{everyone && step >= 2 ? "Everyone survives!" : `Question ${q.no + 1}`}</span>
        <RevealCounter from={before} to={after} running={step >= 2} />
      </header>
      <div className={`min-h-0 flex-1 ${everyone && step >= 2 ? "mosaic-flash" : ""}`}>
        {/* A new key at the regroup remounts the tiles, so the survivors pop into their bigger places. */}
        <Mosaic key={step >= 3 && !everyone ? "survivors" : "all"} people={sv.players}
          darkIds={everyone ? undefined : dark} darken={step >= 2} hideDark={step >= 3} seed={s.key} height={960} />
      </div>
    </div>
  );
}

/** "312 → 38 remain", ticking down over the ripple's two seconds. */
function RevealCounter({ from, to, running }: { from: number; to: number; running: boolean }) {
  const [shown, setShown] = useState(from);
  useEffect(() => {
    if (!running) return;
    const start = performance.now();
    let raf = 0;
    const loop = () => {
      const p = Math.min(1, (performance.now() - start) / 2000);
      setShown(Math.round(from - (from - to) * p));
      if (p < 1) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, from, to]);
  return (
    <span className="text-6xl font-extrabold tabular-nums">
      {running ? <>{from} → <span className="text-[var(--brand)]">{shown}</span> remain</> : `${from} in`}
    </span>
  );
}
```

In `src/components/games/display/DisplayClient.tsx`, import `SurvivalScreen` and add to `Screen`, after the race line:

```tsx
  if (kind === "survival" && state.survival) return <SurvivalScreen state={state} offset={offset} />;
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all green.

In the browser, with the display at 1920×1080 and the load-test attendees from Task 19 Step 2 (or 3–4 real phones/tabs), run last one standing from the host console. Check that:
- Tiles pop in during the lobby.
- The question shows a countdown and "N of M answered"; at time up the split appears.
- Reveal runs the sequence: the correct answer lights, then the mosaic, then a staggered ripple of darkening tiles, the counter ticking down, and the survivors regrouping bigger.
- Reloading the display mid-reveal replays the same ripple order.
- When everyone is wrong, the mosaic flashes with "Everyone survives!".
- The winner card shows full name and company.

Screenshot the mid-ripple mosaic and the winner card.

- [ ] **Step 5: Commit**

```bash
git add src/components/games/display
git commit -m "feat(games): last one standing on the LED with the mosaic reveal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: LED — lucky draw

**Files:**
- Create: `src/components/games/display/DrawScreen.tsx`
- Modify: `src/components/games/display/DisplayClient.tsx` (`Screen` switch)

**Interfaces:**
- Consumes: Task 3 (`SPIN_MS`), Tasks 16–17 (`Frame`, `WinnerCard`, `JointWinners`).
- Produces: `DrawScreen({ state, offset })`.

- [ ] **Step 1: Write the draw screen**

Create `src/components/games/display/DrawScreen.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import type { DisplayState, Person } from "@/lib/games/wire";
import { SPIN_MS } from "@/lib/games/phase";
import { Frame } from "./Frame";
import { JointWinners, WinnerCard } from "./WinnerCard";

/** The lucky draw on the LED (D279–D282): the next prize, the rolling names, the winner. */
export function DrawScreen({ state, offset }: { state: DisplayState; offset: number }) {
  const s = state.stage;
  const d = state.draw!;
  const title = s.game?.title ?? "Lucky draw";

  if (s.phase === "draw_ready") {
    return (
      <Frame title={title} right={`${d.pool} in the draw`}>
        <div className="flex h-full flex-col items-center justify-center gap-8">
          {d.prize ? (
            <>
              <p className="text-5xl opacity-70">Next up</p>
              <p className="max-w-[1700px] text-center text-[150px] font-extrabold leading-none text-[var(--brand)]">{d.prize}</p>
            </>
          ) : <p className="text-8xl font-extrabold">All prizes drawn 🎉</p>}
        </div>
      </Frame>
    );
  }

  if (s.phase === "draw_spinning") {
    return <Frame title={title} right={d.prize ?? ""}><Roller sample={d.sample} endsAt={s.endsAt} offset={offset} /></Frame>;
  }

  const winners = d.winners ?? [];
  if (winners.length === 0) {
    return <Frame title={title}><div className="flex h-full items-center justify-center text-7xl font-extrabold">No one left to draw</div></Frame>;
  }
  if (winners.length === 1) return <WinnerCard label="Winner" name={winners[0].name} company={winners[0].company} prize={d.prize} />;
  return <JointWinners title="Winners" winners={winners} prize={d.prize} />;
}

/**
 * Names roll fast and slow down to a stop as the spin ends (D280). Theatre only: the winner was
 * drawn before this started and is not in the data until the reveal.
 */
function Roller({ sample, endsAt, offset }: { sample: Person[]; endsAt: number | null; offset: number }) {
  const i = useRoller(sample.length, endsAt, offset);
  const p = sample[i];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      <div className="flex h-[360px] w-[1500px] items-center justify-center rounded-[48px] border-8 border-[var(--brand)] bg-white/5">
        <span className="text-[160px] font-extrabold leading-none">{p ? `${p.initials} · ${p.first}` : "…"}</span>
      </div>
      <p className="text-4xl opacity-60">Drawing…</p>
    </div>
  );
}

function useRoller(count: number, endsAt: number | null, offset: number): number {
  const [i, setI] = useState(0);
  const offsetRef = useRef(offset);
  useEffect(() => { offsetRef.current = offset; }, [offset]);
  useEffect(() => {
    if (count === 0 || endsAt === null) return;
    let t: ReturnType<typeof setTimeout>;
    let stopped = false;
    const step = () => {
      if (stopped) return;
      setI((x) => (x + 1) % count);
      const left = endsAt - (Date.now() + offsetRef.current);
      const done = 1 - Math.max(0, Math.min(1, left / SPIN_MS));
      t = setTimeout(step, 50 + 400 * done * done);
    };
    t = setTimeout(step, 50);
    return () => { stopped = true; clearTimeout(t); };
  }, [count, endsAt]);
  return count ? i % count : 0;
}
```

In `src/components/games/display/DisplayClient.tsx`, import `DrawScreen` and add to `Screen`:

```tsx
  if (kind === "draw" && state.draw) return <DrawScreen state={state} offset={offset} />;
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all green.

In the browser, on the test event with some attendees checked in at the draw's checkpoint (Task 19 Step 2 can seed them), and prizes "Voucher ×3", "iPad ×1". Check that:
- Ready shows "Next up Voucher" and the pool size.
- Draw 1: the host sees the name at once; the LED rolls about 5 s, slowing, then the winner card with confetti and the prize.
- "Not here" (two taps) rolls again for the same prize; the struck-through winner shows in admin.
- ✓ Present goes to the next prize.
- Draw all shows a grid of winners.
- After the last prize, "All prizes drawn".
- With the network tab open on the display during the spin, no response contains the winner's name before the reveal.

Screenshot the roller and a winner card.

- [ ] **Step 3: Commit**

```bash
git add src/components/games/display
git commit -m "feat(games): lucky draw on the LED

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Load test, rehearsal and runbook

**Files:**
- Create: `scripts/games-load.mjs`
- Modify: `package.json` (script `load:games`), `docs/runbook.md` (a "Live games" section), `docs/superpowers/specs/2026-09-26-live-games-design.md` (status line)

**Interfaces:**
- Consumes: the endpoints from Task 13.
- Produces: `node --env-file=.env.local scripts/games-load.mjs seed|checkin|run|cleanup ...`

- [ ] **Step 1: Write the load script**

Create `scripts/games-load.mjs`:

```js
// Load test for live games (spec 2026-09-26-live-games-design.md §5, D289): N simulated phones
// against a deployed app, while a person drives the host console as on the day.
//
//   seed    <event-id> <n>                 add n attendees tagged extra.seed = "load", ~10 per table
//   checkin <event-id> <checkpoint-id>     check every load attendee in, so a draw has a pool
//   run     <base-url> <event-id> [n=500] [seconds=180] [display-token]
//   cleanup <event-id>                     delete the load attendees (and with them their game rows)
//
// During `run`, from the host console: open a tap race (lanes by table_no), start it, let it
// finish; then open last one standing and run 3 questions. Phones join every lobby, tap 6–10
// times a second in batches, and answer at random 0.5–4 s into each question.
//
// PASS: state p95 < 300 ms, no 5xx, and — when a display token is given and the stage ends on a
// race's results — the LED's lane totals equal the taps the server accepted. Run once per race.
//
// Refuses to touch the event with slug `ecphub` (the live event). If Vercel's firewall answers
// with its own 403/429 pages (not this app's JSON), the test is tripping platform protection
// from one IP: run from two machines, or ask before adding a temporary bypass rule.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/games-load.mjs ...");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const newToken = () => Array.from({ length: 12 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const must = ({ data, error }) => { if (error) throw error; return data; };

async function guardedEvent(eventId) {
  const ev = must(await db.from("events").select("id, org_id, slug").eq("id", eventId).single());
  if (ev.slug === "ecphub") {
    console.error("Refusing: ecphub is the live event. Use a test event.");
    process.exit(1);
  }
  return ev;
}

async function loadAttendees(eventId, limit = 5000) {
  return must(await db.from("attendees").select("id, token").eq("event_id", eventId).eq("extra->>seed", "load").limit(limit));
}

async function seed(eventId, n) {
  const ev = await guardedEvent(eventId);
  const tables = Math.max(1, Math.round(n / 10));
  const rows = Array.from({ length: n }, (_, i) => ({
    org_id: ev.org_id, event_id: ev.id, token: newToken(), name: `Load Tester ${i + 1}`,
    email: `load${i + 1}-${randomUUID().slice(0, 8)}@example.test`, category: i % 7 === 0 ? "Crew" : "Staff",
    source: "import", extra: { seed: "load", table_no: String((i % tables) + 1) },
  }));
  for (let i = 0; i < rows.length; i += 500) must(await db.from("attendees").insert(rows.slice(i, i + 500)));
  console.log(`Added ${n} load-test attendees across ${tables} tables.`);
}

async function checkin(eventId, checkpointId) {
  const ev = await guardedEvent(eventId);
  const people = await loadAttendees(eventId);
  const rows = people.map((a) => ({ org_id: ev.org_id, event_id: ev.id, checkpoint_id: checkpointId, attendee_id: a.id }));
  for (let i = 0; i < rows.length; i += 500) {
    must(await db.from("checkins").upsert(rows.slice(i, i + 500), { onConflict: "checkpoint_id,attendee_id", ignoreDuplicates: true }));
  }
  console.log(`Checked in ${rows.length} load-test attendees.`);
}

async function cleanup(eventId) {
  await guardedEvent(eventId);
  const gone = must(await db.from("attendees").delete().eq("event_id", eventId).eq("extra->>seed", "load").select("id"));
  console.log(`Removed ${gone.length} load-test attendees.`);
}

const pct = (xs, p) => (xs.length ? xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : 0);

async function run(base, eventId, n, seconds, displayToken) {
  await guardedEvent(eventId);
  const people = await loadAttendees(eventId, n);
  if (people.length < n) {
    console.error(`Only ${people.length} load-test attendees; run seed first.`);
    process.exit(1);
  }
  const stats = new Map();
  const record = (name, ms, code) => {
    const s = stats.get(name) ?? { ms: [], codes: new Map() };
    s.ms.push(ms);
    s.codes.set(code, (s.codes.get(code) ?? 0) + 1);
    stats.set(name, s);
  };
  const call = async (name, path, init) => {
    const t = performance.now();
    try {
      const res = await fetch(base.replace(/\/+$/, "") + path, init);
      record(name, performance.now() - t, res.status);
      return res.ok ? await res.json() : null;
    } catch {
      record(name, performance.now() - t, "network");
      return null;
    }
  };
  const post = (body) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  let accepted = 0;
  const until = Date.now() + seconds * 1000;
  const phone = async (tok) => {
    let key = "";
    let stage = null;
    let me = null;
    const answered = new Set();
    const take = (b) => { if (b && !b.unchanged) { key = b.key; stage = b.stage; me = b.me; } };
    await sleep(Math.random() * 1000);
    while (Date.now() < until) {
      take(await call("state", `/api/play/${tok}/state${key ? `?v=${encodeURIComponent(key)}` : ""}`));
      const phase = stage?.phase;
      if ((phase === "race_lobby" || phase === "survival_lobby") && me && !me.joined) take(await call("join", `/api/play/${tok}/join`, { method: "POST" }));
      if (phase === "race_live" && me?.joined) {
        const r = await call("taps", `/api/play/${tok}/taps`, post({ n: 6 + Math.floor(Math.random() * 5) }));
        accepted += r?.accepted ?? 0;
      }
      if (phase === "survival_question" && me?.joined && me.outAt === null && stage.question && !answered.has(stage.question.no)) {
        const q = stage.question;
        answered.add(q.no);
        setTimeout(() => void call("answer", `/api/play/${tok}/answer`, post({ question: q.no, choice: Math.floor(Math.random() * q.options.length) })), 500 + Math.random() * 3500);
      }
      await sleep(phase && phase !== "idle" ? 1000 : 5000);
    }
  };

  console.log(`${n} phones for ${seconds} s against ${base}. Drive the host console now.`);
  await Promise.all(people.map((p) => phone(p.token)));

  let failed = false;
  for (const [name, s] of stats) {
    s.ms.sort((a, b) => a - b);
    const codes = [...s.codes].map(([c, k]) => `${c}×${k}`).join(" ");
    console.log(`${name.padEnd(6)} n=${s.ms.length} p50=${pct(s.ms, 50).toFixed(0)}ms p95=${pct(s.ms, 95).toFixed(0)}ms p99=${pct(s.ms, 99).toFixed(0)}ms max=${(s.ms.at(-1) ?? 0).toFixed(0)}ms  ${codes}`);
    if ([...s.codes.keys()].some((c) => typeof c === "number" && c >= 500)) failed = true;
  }
  const state = stats.get("state");
  if (state && pct(state.ms, 95) >= 300) { console.log("FAIL  state p95 is 300 ms or more"); failed = true; }
  console.log(`Taps accepted by the server: ${accepted}`);
  if (displayToken) {
    const d = await (await fetch(`${base.replace(/\/+$/, "")}/api/display/${displayToken}/state`)).json();
    if (d.stage?.phase === "race_results" && d.race) {
      const shown = d.race.lanes.reduce((sum, l) => sum + l.taps, 0);
      const ok = shown === accepted;
      console.log(`${ok ? "PASS" : "FAIL"}  LED lane totals ${shown} vs accepted ${accepted}`);
      if (!ok) failed = true;
    } else {
      console.log("Skipped the lane-total check: the stage is not on a race's results.");
    }
  }
  process.exit(failed ? 1 : 0);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "seed") await seed(args[0], Number(args[1] ?? 500));
else if (cmd === "checkin") await checkin(args[0], args[1]);
else if (cmd === "cleanup") await cleanup(args[0]);
else if (cmd === "run") await run(args[0], args[1], Number(args[2] ?? 500), Number(args[3] ?? 180), args[4]);
else {
  console.error("Usage: games-load.mjs seed <event-id> <n> | checkin <event-id> <checkpoint-id> | run <base-url> <event-id> [n] [seconds] [display-token] | cleanup <event-id>");
  process.exit(1);
}
```

Add to `package.json` `scripts`:

```json
    "load:games": "node --env-file=.env.local scripts/games-load.mjs"
```

Note: lane totals equal accepted taps only when the stage's race is the one this run tapped in. Taps from real phones in the same race, or a second race in the same run, make the numbers differ legitimately.

- [ ] **Step 2: Prepare a test event**

Ask the user which test event to use (never `ecphub`) and confirm it is published. Then run `npm run load:games -- seed <event-id> 1000` and `npm run load:games -- checkin <event-id> <checkpoint-id>`. In admin, create a race, a last one standing with 3 questions, and a host and display link.

- [ ] **Step 3: Deploy, with permission**

The load test must hit the deployed app on Vercel (sin1, next to Supabase), not the dev server. Deploying means pushing `main`, which ships to production — **ask the user before pushing**. On a yes: `git push`, wait for the deployment to finish, and confirm the Games page loads on the deployed URL.

- [ ] **Step 4: Run at 500, then at 1,000**

Run: `npm run load:games -- run <deployed-url> <event-id> 500 180 <display-token>`, and drive one race (lanes by table) and 3 questions from the host console while it runs. Keep the LED page open on another screen and watch it.

Expected: exit 0, `state p95` under 300 ms, no 5xx, lane totals PASS. Also check the Supabase project's CPU in the dashboard (or via the Supabase MCP `get_project`/logs) stayed comfortable, and note it.

Then run again with `1000`. Report the numbers to the user whether or not it passes — at 1,000 this is finding the ceiling, not a gate. If PostgREST row limits, connection errors or Vercel protection show up, record exactly which.

- [ ] **Step 5: Clean up**

Run: `npm run load:games -- cleanup <event-id>`
Expected: "Removed 1000 load-test attendees." Their game rows go with them by cascade.

- [ ] **Step 6: Write the runbook section**

Append to `docs/runbook.md`:

```markdown
## Live games

**Before the day**
- Admin → Games: create the games. Last one standing needs its questions; a lucky draw needs a checkpoint and its prizes (grand prize last).
- Create the **host link** (for the emcee or crew running the games, on their phone) and the **display link** (for the computer feeding the LED).
- Add a **Games** tile in Modules (Portal page → Games), so attendees can find the play page.
- Rehearse on a copy or test event. After a rehearsal draw on the real event, use **Reset draw**, or the rehearsal winners stay excluded.

**On the day**
- LED computer: open the display link in Chrome, click **Click to start display** (goes full screen, keeps the screen awake). A reload is harmless — it comes back to wherever the game is.
- Host phone: open the host link. If it dies, open the same link on any other phone; nothing is lost.
- Attendees get a **Game on — tap to join** banner on their portal home while a game is open.

**If something goes wrong**
- "Someone else moved the game on": two host phones are open. Use one.
- LED frozen: reload it (F5), then click to start again.
- A draw winner isn't in the room: **Not here** (tap twice) draws a replacement for the same prize; the absent winner stays on the winners list, struck through.
- Winners list: Admin → Games → the draw → Download winners (.xlsx).
```

- [ ] **Step 7: Full dress run**

Run `npm test && npx tsc --noEmit && npm run lint && npm run build`, and check everything is green.

Then do a dress run on the test event (dev server or deployment): 3 races with different lanes, 5 questions, and one draw with 3 prizes including a redraw. Use the LED page at 1920×1080 in the browser pane and two phone-sized tabs.

Ask the user to repeat it on a real **iPhone (Safari)** and an **Android phone (Chrome)**, with the display in fullscreen Chrome on the AV laptop. The spec requires real devices (§5), and this session cannot drive them. Report what was verified here and what still needs their hands.

- [ ] **Step 8: Mark the spec built and commit**

In `docs/superpowers/specs/2026-09-26-live-games-design.md`, change the status line to `Status: built <date> (load-tested at 500: <result>; 1,000: <result>)`.

```bash
git add scripts/games-load.mjs package.json docs/runbook.md docs/superpowers/specs/2026-09-26-live-games-design.md
git commit -m "chore(games): load test, runbook and spec status

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
