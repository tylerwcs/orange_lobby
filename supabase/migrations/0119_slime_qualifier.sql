-- Slime qualifier (spec 2026-11-01-slime-qualifier-design.md, D790-D796; this migration D792):
-- the typing qualifier's 30-second wpm sprint becomes the slime game. A run is now one game of up
-- to 20 minutes (RUN_CAP_MS), started from a seed the server picks; the client sends its
-- keystroke timeline and the server replays it (src/features/qualifier/game/replay.ts) and
-- stores the score it computes. The board ranks by best score, then the earlier best run.
-- Reshapes the 0117 tables and functions; the settings table, qualifier_may_play,
-- qualifier_eligible, qualifier_set_disqualified, qualifier_save_settings and the
-- event_features key are unchanged.
--
-- The database still owns the parts a client could cheat: the run's start time, one live run
-- per attendee, the submit window, who may play, the tie order and the finalist snapshot. The
-- pure mirrors live in src/features/qualifier/ (phaseOf and ineligibility in phase.ts, the game
-- and timing constants in game/rules.ts, byStanding in progress.ts); change both together. The
-- SQL literals that repeat rules.ts are pinned by tests/qualifier/sql-constants.test.ts:
-- interval '21 minutes' (RUN_CAP_MS + SUBMIT_GRACE_MS), 1200000 (RUN_CAP_MS) and 2000
-- (EARLY_TOLERANCE_MS).
--
-- Lock order, as in 0117 and the same in every function, so two of them never deadlock: the
-- event's settings row, then the attendee row, then that attendee's runs. Start, submit and
-- disqualify read the settings row FOR SHARE; confirm and the settings save take it FOR UPDATE.
-- So a confirm waits for every start, submit and disqualify already under way, and each of
-- those that comes after it sees the confirm: nothing reaches the board once the finalists are
-- snapshotted. qualifier_refresh_player is only called with these locks already held.
--
-- Cost: as 0117 (one board definition, qualifier_entrants, inlined; rank by counting who is
-- ahead; one window for the board and the confirm), with one sort key fewer.

-- The migration takes ACCESS EXCLUSIVE on the three reshaped tables. The database also hosts
-- live events: give up after 5 s rather than queue every request behind a long lock.
set local lock_timeout = '5s';

-- Guard: the reshape drops the wpm columns and adds NOT NULL ones, which only makes sense on
-- empty tables (no event has the add-on today). If anyone has played, stop and reshape by hand.
-- The tables are locked first, so no start can slip in between the guard and the reshape.
lock table public.qualifier_runs, public.qualifier_players, public.qualifier_finalists in access exclusive mode;
do $$
begin
  if exists (select 1 from public.qualifier_runs) or exists (select 1 from public.qualifier_finalists) then
    raise exception '0119: qualifier data exists; reshape by hand';
  end if;
end $$;

-- The functions whose arguments or return type change can't be replaced in place: drop them
-- (their old signatures) and create them again below.
drop function if exists public.qualifier_entrants(uuid);
drop function if exists public.qualifier_ahead(numeric, smallint, timestamptz, uuid, numeric, smallint, timestamptz, uuid);
drop function if exists public.qualifier_standings(uuid);
drop function if exists public.qualifier_board(uuid, int, int);
drop function if exists public.qualifier_start(uuid, uuid, text[], int);
drop function if exists public.qualifier_submit(uuid, uuid, numeric, int, int, int[], text, int, boolean);

-- One game. starts_at is still the end of the countdown on the database's clock, to the
-- millisecond. seed starts the game's random sequence (mulberry32); ended_ms is when the game
-- ended, ms after starts_at (death, or RUN_CAP_MS). score, popped, bosses and peak_cps are the
-- server's replay of keys (the typed letters, "\b" for backspace) at key_times (ms after
-- starts_at, one per key), which are kept for review. live -> done or abandoned, as 0117.
alter table public.qualifier_runs
  drop column words,
  drop column wpm,
  drop column accuracy,
  drop column words_done,
  drop column offsets,
  add column seed int not null,
  add column ended_ms int,
  add column score int,
  add column popped int,
  add column bosses int,
  add column peak_cps numeric(4,1),
  add column keys text,
  add column key_times int[];

-- The per-attendee summary the board reads, rewritten by qualifier_refresh_player after every
-- counted run, disqualify or restore. best_at is the best run's starts_at. The streak, skin and
-- last seen rank are gone with the sprint.
alter table public.qualifier_players
  drop column best_wpm,
  drop column best_accuracy,
  drop column run_days,
  drop column skin,
  drop column last_seen_rank,
  add column best_score int;

-- The finale list, written once by qualifier_confirm: the board's top 10 at that moment.
alter table public.qualifier_finalists
  drop column best_wpm,
  drop column best_accuracy,
  drop column skin,
  add column best_score int not null;

-- The board's helpers (qualifier_entrants, qualifier_ahead, qualifier_standings, with
-- qualifier_may_play from 0117) stay plain SQL on purpose: not security definer and with no
-- SET, so the planner inlines them into the query that calls them. They read nothing a caller
-- could steer: every name is schema-qualified or in pg_catalog. Like the RPCs they are revoked
-- from public, anon and authenticated and granted to service_role only.

-- Who is on the board: players of the event with a best who may play. The one definition used
-- by qualifier_standings (so qualifier_board and qualifier_confirm), qualifier_rank and
-- qualifier_board_size. The event and its settings are joined once, not looked up per row.
create function public.qualifier_entrants(p_event_id uuid)
returns table(attendee_id uuid, best_score int, best_at timestamptz, best_run_id uuid, runs_played int)
language sql
stable
as $$
  select p.attendee_id, p.best_score, p.best_at, p.best_run_id, p.runs_played
    from public.qualifier_players p
    join public.attendees a on a.id = p.attendee_id and a.event_id = p.event_id
    join public.events e on e.id = p.event_id
    left join public.qualifier_settings s on s.event_id = p.event_id
   where p.event_id = p_event_id
     and p.best_run_id is not null
     and p.best_score is not null
     and p.best_at is not null
     and public.qualifier_may_play(a.id, a.category, a.cancelled_at, e.preview_attendee_id,
                                   coalesce(s.excluded_categories, '{}'::text[]));
$$;

-- The tie order, as "a comes before b": higher score, then the earlier best run, then the lower
-- attendee id. A row comparison is decided by its first unequal pair, so swapping best_at and
-- attendee_id between the sides makes those two "lower comes first". Entrants never have a null
-- in these. Must order exactly as qualifier_standings' window (the next function); both are
-- mirrored by byStanding in src/features/qualifier/progress.ts.
create function public.qualifier_ahead(
  a_score int, a_at timestamptz, a_id uuid,
  b_score int, b_at timestamptz, b_id uuid
) returns boolean
language sql
immutable
as $$
  select (a_score, b_at, b_id) > (b_score, a_at, a_id);
$$;

-- The board: the entrants ranked 1, 2, 3... in the tie order (qualifier_ahead, above). Used by
-- qualifier_board and qualifier_confirm.
create function public.qualifier_standings(p_event_id uuid)
returns table(rank bigint, attendee_id uuid, best_score int, best_at timestamptz, best_run_id uuid, runs_played int)
language sql
stable
as $$
  select row_number() over (order by en.best_score desc, en.best_at asc, en.attendee_id asc),
         en.attendee_id, en.best_score, en.best_at, en.best_run_id, en.runs_played
    from public.qualifier_entrants(p_event_id) en;
$$;

-- Rewrites one attendee's summary from their runs. Best = the highest-scoring counted run that
-- is not disqualified (then the earlier run, then the lower id); none leaves the best null and
-- the player off the board. runs_played counts every counted run, disqualified or not.
-- Takes the attendee row's lock (callers already hold it; taking it again is free), so two
-- refreshes of one person run one after the other and the second reads the first's runs.
create or replace function public.qualifier_refresh_player(p_event_id uuid, p_attendee_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_org uuid;
  v_best public.qualifier_runs%rowtype;
  v_played int;
begin
  perform 1 from public.attendees a
   where a.id = p_attendee_id and a.event_id = p_event_id
     for no key update;
  if not found then return; end if;
  select e.org_id into v_org from public.events e where e.id = p_event_id;

  -- No row leaves every field of v_best null.
  select r.* into v_best from public.qualifier_runs r
   where r.event_id = p_event_id and r.attendee_id = p_attendee_id
     and r.status = 'done' and r.disqualified_at is null
   order by r.score desc nulls last, r.starts_at asc, r.id asc
   limit 1;

  select count(*)::int into v_played
    from public.qualifier_runs r
   where r.event_id = p_event_id and r.attendee_id = p_attendee_id and r.status = 'done';

  insert into public.qualifier_players as p
    (org_id, event_id, attendee_id, best_run_id, best_score, best_at, runs_played)
  values
    (v_org, p_event_id, p_attendee_id, v_best.id, v_best.score, v_best.starts_at, v_played)
  on conflict (event_id, attendee_id) do update
     set best_run_id = excluded.best_run_id,
         best_score = excluded.best_score,
         best_at = excluded.best_at,
         runs_played = excluded.runs_played;
end;
$$;

-- Starts a run (D769, D792). Refused 'closed' unless opens_at <= now() < closes_at and the
-- finalists are not confirmed; 'ineligible' for someone not in this event, cancelled, the preview
-- attendee or in a left-out category. Otherwise abandons the attendee's live run and inserts the
-- new one with its seed, starting when the countdown ends (p_countdown_ms is COUNTDOWN_MS). One
-- row: run_id and starts_at, or refused.
-- The settings row is read FOR SHARE, so a start never commits after a confirm it didn't see.
-- Then the attendee row is locked, so two starts by one person run one after the other: the
-- second abandons the first's run instead of tripping the one-live-run index.
create function public.qualifier_start(
  p_event_id uuid, p_attendee_id uuid, p_seed int, p_countdown_ms int
) returns table(run_id uuid, starts_at timestamptz, refused text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_set public.qualifier_settings%rowtype;
  v_att public.attendees%rowtype;
  v_org uuid;
  v_preview uuid;
  v_id uuid;
  v_starts timestamptz;
begin
  select s.* into v_set from public.qualifier_settings s
   where s.event_id = p_event_id
     for share;
  if not found or v_set.opens_at is null or v_set.closes_at is null or v_set.confirmed_at is not null
     or now() < v_set.opens_at or now() >= v_set.closes_at then
    return query select null::uuid, null::timestamptz, 'closed'::text;
    return;
  end if;

  select e.org_id, e.preview_attendee_id into v_org, v_preview from public.events e where e.id = p_event_id;
  select a.* into v_att from public.attendees a
   where a.id = p_attendee_id and a.event_id = p_event_id
     for no key update;
  if not found or not public.qualifier_eligible(v_att.id, v_att.category, v_att.cancelled_at, v_preview,
                                                v_set.excluded_categories) then
    return query select null::uuid, null::timestamptz, 'ineligible'::text;
    return;
  end if;

  update public.qualifier_runs r set status = 'abandoned'
   where r.attendee_id = p_attendee_id and r.status = 'live';

  v_starts := date_trunc('milliseconds', now() + greatest(coalesce(p_countdown_ms, 0), 0) * interval '1 millisecond');
  insert into public.qualifier_runs as r (org_id, event_id, attendee_id, seed, starts_at)
  values (v_org, p_event_id, p_attendee_id, p_seed, v_starts)
  returning r.id into v_id;

  return query select v_id, v_starts, null::text;
end;
$$;

-- Records a finished game (D792). 'refused' for a run that isn't this attendee's; 'done' once the
-- finalists are confirmed, or when the run is no longer live (submitted already, or abandoned by
-- a newer start); 'early' when the game claims to have ended later than the database's clock
-- allows (before starts_at + ended_ms - 2 s, EARLY_TOLERANCE_MS); 'late' after starts_at +
-- 21 minutes (RUN_CAP_MS + SUBMIT_GRACE_MS); 'refused' with a negative score, an ended_ms outside
-- 0-1200000 (RUN_CAP_MS) or more than 20,000 keys (the route refuses these first, this is the
-- backstop). Otherwise the run is counted and the attendee's summary rewritten: 'ok'. closes_at
-- is not checked on purpose: a run started inside the window counts.
-- score, ended_ms, popped, bosses, peak_cps and flagged are the route's replay of the timeline
-- (keys, key_times); device is clamped and the counts kept to fit their columns.
-- The settings row is read FOR SHARE before anything is locked (the lock order): a confirm
-- (FOR UPDATE) waits for an in-progress submit, and a submit waiting on a confirm then sees it
-- and answers 'done', so a run can never land on the board after the snapshot was taken.
create function public.qualifier_submit(
  p_run_id uuid, p_attendee_id uuid, p_score int, p_ended_ms int, p_popped int, p_bosses int,
  p_peak_cps numeric, p_keys text, p_key_times int[], p_device text, p_multi int, p_flagged boolean
) returns text
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_event uuid;
  v_confirmed timestamptz;
  v_run public.qualifier_runs%rowtype;
begin
  -- Unlocked: only to find the event whose settings row comes first in the lock order.
  select r.event_id into v_event from public.qualifier_runs r
   where r.id = p_run_id and r.attendee_id = p_attendee_id;
  if not found then return 'refused'; end if;
  select s.confirmed_at into v_confirmed from public.qualifier_settings s
   where s.event_id = v_event
     for share;
  if v_confirmed is not null then return 'done'; end if;

  perform 1 from public.attendees a where a.id = p_attendee_id for no key update;
  select r.* into v_run from public.qualifier_runs r
   where r.id = p_run_id and r.attendee_id = p_attendee_id
     for update;
  if not found then return 'refused'; end if;
  if v_run.status <> 'live' then return 'done'; end if;
  if now() < v_run.starts_at + make_interval(secs => (p_ended_ms - 2000) / 1000.0) then return 'early'; end if;
  if now() > v_run.starts_at + interval '21 minutes' then return 'late'; end if;
  if p_score is null or p_score < 0
     or p_ended_ms is null or p_ended_ms < 0 or p_ended_ms > 1200000
     or coalesce(length(p_keys), 0) > 20000 then
    return 'refused';
  end if;

  update public.qualifier_runs r
     set status = 'done',
         submitted_at = now(),
         score = p_score,
         ended_ms = p_ended_ms,
         popped = greatest(coalesce(p_popped, 0), 0),
         bosses = greatest(coalesce(p_bosses, 0), 0),
         peak_cps = least(greatest(coalesce(round(p_peak_cps, 1), 0), 0), 999.9),
         keys = p_keys,
         key_times = p_key_times,
         device = case when p_device in ('touch', 'keyboard') then p_device else 'unknown' end,
         multi_inserts = least(greatest(coalesce(p_multi, 0), 0), 32767),
         flagged = coalesce(p_flagged, false)
   where r.id = p_run_id;

  perform public.qualifier_refresh_player(v_run.event_id, v_run.attendee_id);
  return 'ok';
end;
$$;

-- A page of the board: qualifier_standings plus the attendee's name and extra (for tag /
-- tagsFor) and the best run's flag and device.
create function public.qualifier_board(p_event_id uuid, p_limit int, p_offset int)
returns table(
  rank bigint, attendee_id uuid, name text, extra jsonb, best_score int, best_at timestamptz,
  best_run_id uuid, runs_played int, flagged boolean, device text
)
language sql
stable
security definer
set search_path = ''
as $$
  select st.rank, st.attendee_id, a.name, a.extra, st.best_score, st.best_at,
         st.best_run_id, st.runs_played, r.flagged, r.device
    from public.qualifier_standings(p_event_id) st
    join public.attendees a on a.id = st.attendee_id
    join public.qualifier_runs r on r.id = st.best_run_id
   order by st.rank
   limit greatest(coalesce(p_limit, 0), 0)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- One attendee's place on the board, or null when they are not on it: 1 + the entrants ahead
-- of them in the tie order. The same number qualifier_standings gives them (the order is total),
-- without ranking everyone: one pass, no sort.
create or replace function public.qualifier_rank(p_event_id uuid, p_attendee_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select 1 + (select count(*)::int
                from public.qualifier_entrants(p_event_id) o
               where public.qualifier_ahead(o.best_score, o.best_at, o.attendee_id,
                                            me.best_score, me.best_at, me.attendee_id))
    from public.qualifier_entrants(p_event_id) me
   where me.attendee_id = p_attendee_id;
$$;

-- How many are on the board.
create or replace function public.qualifier_board_size(p_event_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.qualifier_entrants(p_event_id);
$$;

-- How many games of the event are in flight: live and still within their submit window
-- (starts_at + 21 minutes, RUN_CAP_MS + SUBMIT_GRACE_MS), the same wait qualifier_confirm uses.
-- A live run past its window is not counted (it can no longer be submitted; the next start
-- abandons it).
create function public.qualifier_live_count(p_event_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.qualifier_runs r
   where r.event_id = p_event_id and r.status = 'live'
     and now() <= r.starts_at + interval '21 minutes';
$$;

-- Freezes the finale list (D769). 'not_closed' before closes_at (or with no window), and also
-- while a run started inside the window can still be submitted (live, within its 21 minutes,
-- RUN_CAP_MS + SUBMIT_GRACE_MS): it would count, so the snapshot waits for it. 'already' once
-- confirmed. Otherwise the board's top 10 (FINALISTS) is copied to qualifier_finalists and the
-- confirm stamped. The settings row is locked, so two confirms run one after the other and the
-- second answers 'already'.
create or replace function public.qualifier_confirm(p_event_id uuid, p_by uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_set public.qualifier_settings%rowtype;
begin
  select s.* into v_set from public.qualifier_settings s
   where s.event_id = p_event_id
     for update;
  if not found or v_set.closes_at is null or now() < v_set.closes_at then return 'not_closed'; end if;
  if v_set.confirmed_at is not null then return 'already'; end if;
  if exists (
    select 1 from public.qualifier_runs r
     where r.event_id = p_event_id and r.status = 'live'
       and now() <= r.starts_at + interval '21 minutes') then
    return 'not_closed';
  end if;

  insert into public.qualifier_finalists (org_id, event_id, rank, attendee_id, best_score)
  select v_set.org_id, p_event_id, st.rank::int, st.attendee_id, st.best_score
    from public.qualifier_standings(p_event_id) st
   where st.rank <= 10;

  update public.qualifier_settings s
     set confirmed_at = now(), confirmed_by = p_by, updated_at = now()
   where s.event_id = p_event_id;
  return 'ok';
end;
$$;

-- Every function created or replaced above, revoked and granted again as 0117 does (a new
-- function starts with EXECUTE granted to public).
revoke execute on function public.qualifier_entrants(uuid) from public, anon, authenticated;
grant execute on function public.qualifier_entrants(uuid) to service_role;
revoke execute on function public.qualifier_ahead(int, timestamptz, uuid, int, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.qualifier_ahead(int, timestamptz, uuid, int, timestamptz, uuid) to service_role;
revoke execute on function public.qualifier_standings(uuid) from public, anon, authenticated;
grant execute on function public.qualifier_standings(uuid) to service_role;
revoke execute on function public.qualifier_refresh_player(uuid, uuid) from public, anon, authenticated;
grant execute on function public.qualifier_refresh_player(uuid, uuid) to service_role;
revoke execute on function public.qualifier_start(uuid, uuid, int, int) from public, anon, authenticated;
grant execute on function public.qualifier_start(uuid, uuid, int, int) to service_role;
revoke execute on function public.qualifier_submit(uuid, uuid, int, int, int, int, numeric, text, int[], text, int, boolean) from public, anon, authenticated;
grant execute on function public.qualifier_submit(uuid, uuid, int, int, int, int, numeric, text, int[], text, int, boolean) to service_role;
revoke execute on function public.qualifier_board(uuid, int, int) from public, anon, authenticated;
grant execute on function public.qualifier_board(uuid, int, int) to service_role;
revoke execute on function public.qualifier_rank(uuid, uuid) from public, anon, authenticated;
grant execute on function public.qualifier_rank(uuid, uuid) to service_role;
revoke execute on function public.qualifier_board_size(uuid) from public, anon, authenticated;
grant execute on function public.qualifier_board_size(uuid) to service_role;
revoke execute on function public.qualifier_live_count(uuid) from public, anon, authenticated;
grant execute on function public.qualifier_live_count(uuid) to service_role;
revoke execute on function public.qualifier_confirm(uuid, uuid) from public, anon, authenticated;
grant execute on function public.qualifier_confirm(uuid, uuid) to service_role;
