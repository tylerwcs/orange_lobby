-- Typing qualifier (spec 2026-10-31-typing-qualifier-design.md, D767-D769): a week of 30-second
-- typing sprints, each attendee's best wpm on one board, and the top 10 frozen as the finale list.
-- Adds four tables and the functions below; no existing table or function changes.
--
-- The database owns the parts a client could cheat: the run's start time, one live run per
-- attendee, the submit window, who may play, the tie order and the finalist snapshot. The pure
-- mirrors live in src/features/qualifier/ (phaseOf and ineligibility in phase.ts, the timing
-- constants in scoring.ts, byStanding in progress.ts); change both together.
--
-- Lock order, the same in every function, so two of them never deadlock: the event's settings
-- row, then the attendee row, then that attendee's runs. Start, submit and disqualify read the
-- settings row FOR SHARE; confirm and the settings save take it FOR UPDATE. So a confirm waits
-- for every start, submit and disqualify already under way, and each of those that comes after
-- it sees the confirm: nothing reaches the board once the finalists are snapshotted.
-- qualifier_refresh_player is only called with these locks already held.

-- One row per event: the window (opens_at inclusive, closes_at exclusive, as phaseOf), the
-- categories left out, and the confirm that freezes everything.
create table public.qualifier_settings (
  event_id uuid primary key references public.events (id) on delete cascade,
  org_id uuid not null references public.organisations (id),
  opens_at timestamptz,
  closes_at timestamptz,
  excluded_categories text[] not null default '{}',
  confirmed_at timestamptz,
  -- The admin who confirmed (an auth user id). No FK: the record outlives the login.
  confirmed_by uuid,
  updated_at timestamptz not null default now(),
  check (closes_at > opens_at)
);

-- One sprint. starts_at is the end of the countdown, on the database's clock, kept to the
-- millisecond so the board's best_at compares the same in SQL and as an ISO string in JS.
-- live -> done (counted) or abandoned (a newer start replaced it). A live run that was never
-- submitted, or submitted too late, just stays live until the next start abandons it.
create table public.qualifier_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id),
  event_id uuid not null references public.events (id) on delete cascade,
  attendee_id uuid not null references public.attendees (id) on delete cascade,
  words text[] not null,
  starts_at timestamptz not null,
  submitted_at timestamptz,
  status text not null default 'live' check (status in ('live', 'abandoned', 'done')),
  wpm numeric(5,1),
  accuracy smallint,
  words_done smallint,
  -- ms into the run at which each completed word was finished (ghosts and review).
  offsets int[],
  device text not null default 'unknown' check (device in ('touch', 'keyboard', 'unknown')),
  multi_inserts smallint not null default 0,
  flagged boolean not null default false,
  disqualified_at timestamptz,
  created_at timestamptz not null default now()
);
-- One live run per attendee (D769): the in-memory rate limit is per server, this is not.
create unique index qualifier_runs_one_live on public.qualifier_runs (attendee_id) where status = 'live';
create index qualifier_runs_event_attendee on public.qualifier_runs (event_id, attendee_id);
-- For the attendee delete cascade, which looks runs up by attendee alone.
create index qualifier_runs_attendee on public.qualifier_runs (attendee_id);

-- The per-attendee summary the board reads, rewritten by qualifier_refresh_player after every
-- counted run, disqualify or restore. skin and last_seen_rank are the app's (never touched by
-- the refresh). best_at is the best run's starts_at.
create table public.qualifier_players (
  org_id uuid not null references public.organisations (id),
  event_id uuid not null references public.events (id) on delete cascade,
  attendee_id uuid not null references public.attendees (id) on delete cascade,
  best_run_id uuid references public.qualifier_runs (id) on delete set null,
  best_wpm numeric(5,1),
  best_accuracy smallint,
  best_at timestamptz,
  runs_played int not null default 0,
  -- Malaysia-time days with at least one counted run (the streak).
  run_days date[] not null default '{}',
  skin text,
  last_seen_rank int,
  primary key (event_id, attendee_id)
);
-- For the run delete's SET NULL, which looks players up by best run.
create index qualifier_players_best_run on public.qualifier_players (best_run_id);
-- For the attendee delete cascade, which looks players up by attendee alone.
create index qualifier_players_attendee on public.qualifier_players (attendee_id);

-- The finale list, written once by qualifier_confirm: the board's top 10 at that moment.
create table public.qualifier_finalists (
  org_id uuid not null references public.organisations (id),
  event_id uuid not null references public.events (id) on delete cascade,
  rank int not null check (rank between 1 and 10),
  attendee_id uuid not null references public.attendees (id) on delete cascade,
  best_wpm numeric(5,1) not null,
  best_accuracy smallint not null,
  skin text,
  primary key (event_id, rank)
);

alter table public.qualifier_settings enable row level security;
alter table public.qualifier_runs enable row level security;
alter table public.qualifier_players enable row level security;
alter table public.qualifier_finalists enable row level security;
-- No policies on purpose: only the service role (which bypasses RLS) may access data.

-- Who may play and appear on the board (D768): not cancelled, not the event's preview attendee,
-- and no part of their category left out (category_matches from 0048, so leaving out Crew also
-- leaves out "KOM, Crew"; it treats an empty list as "everyone", so an empty list is guarded).
-- The caller has already matched the attendee to the event. Mirrored by ineligibility in
-- src/features/qualifier/phase.ts.
create or replace function public.qualifier_eligible(
  p_attendee_id uuid, p_category text, p_cancelled_at timestamptz, p_preview_id uuid, p_excluded text[]
) returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select p_cancelled_at is null
     and p_attendee_id is distinct from p_preview_id
     and not (cardinality(coalesce(p_excluded, '{}'::text[])) > 0
              and public.category_matches(p_excluded, p_category));
$$;

-- The board's one rule, used by qualifier_board, qualifier_rank, qualifier_board_size and
-- qualifier_confirm: eligible players with a best, ordered by higher wpm, higher accuracy, the
-- earlier best run, then attendee id, ranked 1, 2, 3... Mirrored by byStanding in
-- src/features/qualifier/progress.ts.
create or replace function public.qualifier_standings(p_event_id uuid)
returns table(
  rank bigint, attendee_id uuid, best_wpm numeric, best_accuracy smallint, best_at timestamptz,
  best_run_id uuid, skin text, runs_played int
)
language sql
stable
security definer
set search_path = ''
as $$
  select row_number() over (
           order by p.best_wpm desc, p.best_accuracy desc, p.best_at asc, p.attendee_id asc),
         p.attendee_id, p.best_wpm, p.best_accuracy, p.best_at, p.best_run_id, p.skin, p.runs_played
    from public.qualifier_players p
    join public.attendees a on a.id = p.attendee_id and a.event_id = p.event_id
    join public.events e on e.id = p.event_id
    left join public.qualifier_settings s on s.event_id = p.event_id
   where p.event_id = p_event_id
     and p.best_run_id is not null
     and p.best_wpm is not null
     and p.best_accuracy is not null
     and p.best_at is not null
     and public.qualifier_eligible(a.id, a.category, a.cancelled_at, e.preview_attendee_id,
                                   coalesce(s.excluded_categories, '{}'::text[]));
$$;

-- Rewrites one attendee's summary from their runs. Best = the best counted run that is not
-- disqualified (wpm, then accuracy, then the earlier run); none leaves the best null and the
-- player off the board. runs_played and run_days count every counted run, disqualified or not.
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
  v_days date[];
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
   order by r.wpm desc nulls last, r.accuracy desc nulls last, r.starts_at asc, r.id asc
   limit 1;

  select count(*)::int,
         coalesce(array_agg(distinct (r.starts_at at time zone 'Asia/Kuala_Lumpur')::date
                            order by (r.starts_at at time zone 'Asia/Kuala_Lumpur')::date),
                  '{}'::date[])
    into v_played, v_days
    from public.qualifier_runs r
   where r.event_id = p_event_id and r.attendee_id = p_attendee_id and r.status = 'done';

  insert into public.qualifier_players as p
    (org_id, event_id, attendee_id, best_run_id, best_wpm, best_accuracy, best_at, runs_played, run_days)
  values
    (v_org, p_event_id, p_attendee_id, v_best.id, v_best.wpm, v_best.accuracy, v_best.starts_at, v_played, v_days)
  on conflict (event_id, attendee_id) do update
     set best_run_id = excluded.best_run_id,
         best_wpm = excluded.best_wpm,
         best_accuracy = excluded.best_accuracy,
         best_at = excluded.best_at,
         runs_played = excluded.runs_played,
         run_days = excluded.run_days;
end;
$$;

-- Starts a run (D769). Refused 'closed' unless opens_at <= now() < closes_at and the finalists
-- are not confirmed; 'ineligible' for someone not in this event, cancelled, the preview attendee
-- or in a left-out category. Otherwise abandons the attendee's live run and inserts the new one,
-- starting when the countdown ends (p_countdown_ms is COUNTDOWN_MS). One row: run_id and
-- starts_at, or refused.
-- The settings row is read FOR SHARE, so a start never commits after a confirm it didn't see.
-- Then the attendee row is locked, so two starts by one person run one after the other: the
-- second abandons the first's run instead of tripping the one-live-run index.
create or replace function public.qualifier_start(
  p_event_id uuid, p_attendee_id uuid, p_words text[], p_countdown_ms int
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
  insert into public.qualifier_runs as r (org_id, event_id, attendee_id, words, starts_at)
  values (v_org, p_event_id, p_attendee_id, p_words, v_starts)
  returning r.id into v_id;

  return query select v_id, v_starts, null::text;
end;
$$;

-- Records a finished run (D769). 'refused' for a run that isn't this attendee's; 'done' once the
-- finalists are confirmed, or when the run is no longer live (submitted already, or abandoned by
-- a newer start); 'early' before starts_at + 30 s - 1 s; 'late' after starts_at + 30 s + 3 s
-- (RUN_MS, GRACE_MS); 'refused' above
-- the 250 wpm ceiling (HARD_CEILING_WPM; the route refuses it first, this is the backstop) or
-- with an accuracy outside 0-100. Otherwise the run is counted and the attendee's summary
-- rewritten: 'ok'. closes_at is not checked on purpose: a run started inside the window counts.
-- wpm, accuracy and flagged are the route's recomputation (scoreRun); device is clamped and the
-- counts capped to fit their columns.
-- The settings row is read FOR SHARE before anything is locked (the lock order): a confirm
-- (FOR UPDATE) waits for an in-progress submit, and a submit waiting on a confirm then sees it
-- and answers 'done', so a run can never land on the board after the snapshot was taken.
create or replace function public.qualifier_submit(
  p_run_id uuid, p_attendee_id uuid, p_wpm numeric, p_accuracy int, p_words_done int,
  p_offsets int[], p_device text, p_multi int, p_flagged boolean
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
  if now() < v_run.starts_at + interval '29 seconds' then return 'early'; end if;
  if now() > v_run.starts_at + interval '33 seconds' then return 'late'; end if;
  if p_wpm is null or p_wpm < 0 or p_wpm > 250
     or p_accuracy is null or p_accuracy < 0 or p_accuracy > 100 then
    return 'refused';
  end if;

  update public.qualifier_runs r
     set status = 'done',
         submitted_at = now(),
         wpm = round(p_wpm, 1),
         accuracy = p_accuracy,
         words_done = least(greatest(coalesce(p_words_done, 0), 0), 32767),
         offsets = p_offsets,
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
create or replace function public.qualifier_board(p_event_id uuid, p_limit int, p_offset int)
returns table(
  rank bigint, attendee_id uuid, name text, extra jsonb, best_wpm numeric, best_accuracy smallint,
  best_at timestamptz, best_run_id uuid, skin text, runs_played int, flagged boolean, device text
)
language sql
stable
security definer
set search_path = ''
as $$
  select st.rank, st.attendee_id, a.name, a.extra, st.best_wpm, st.best_accuracy, st.best_at,
         st.best_run_id, st.skin, st.runs_played, r.flagged, r.device
    from public.qualifier_standings(p_event_id) st
    join public.attendees a on a.id = st.attendee_id
    join public.qualifier_runs r on r.id = st.best_run_id
   order by st.rank
   limit greatest(coalesce(p_limit, 0), 0)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- One attendee's place on the board, or null when they are not on it.
create or replace function public.qualifier_rank(p_event_id uuid, p_attendee_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select st.rank::int from public.qualifier_standings(p_event_id) st where st.attendee_id = p_attendee_id;
$$;

-- How many are on the board.
create or replace function public.qualifier_board_size(p_event_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.qualifier_standings(p_event_id);
$$;

-- Disqualifies (p_on) or restores a run, and rewrites its attendee's best (D769). 'locked' once
-- the finalists are confirmed; 'missing' for a run not in this event.
-- The settings row is read FOR SHARE: a confirm (FOR UPDATE) waits for this to finish, and this
-- waits for a confirm and then sees it, so the snapshot never misses a change or follows one.
create or replace function public.qualifier_set_disqualified(p_event_id uuid, p_run_id uuid, p_on boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_confirmed timestamptz;
  v_attendee uuid;
begin
  select s.confirmed_at into v_confirmed from public.qualifier_settings s
   where s.event_id = p_event_id
     for share;
  if v_confirmed is not null then return 'locked'; end if;

  select r.attendee_id into v_attendee from public.qualifier_runs r
   where r.id = p_run_id and r.event_id = p_event_id;
  if not found then return 'missing'; end if;

  perform 1 from public.attendees a where a.id = v_attendee for no key update;
  update public.qualifier_runs r
     set disqualified_at = case when p_on then coalesce(r.disqualified_at, now()) else null end
   where r.id = p_run_id;

  perform public.qualifier_refresh_player(p_event_id, v_attendee);
  return 'ok';
end;
$$;

-- Freezes the finale list (D769). 'not_closed' before closes_at (or with no window), and also
-- while a run started inside the window can still be submitted (live, within its 30 s + 3 s
-- grace): it would count, so the snapshot waits for it. 'already' once confirmed. Otherwise
-- the board's top 10 (FINALISTS) is copied to qualifier_finalists and the confirm stamped.
-- The settings row is locked, so two confirms run one after the other and the second answers
-- 'already'.
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
       and now() <= r.starts_at + interval '33 seconds') then
    return 'not_closed';
  end if;

  insert into public.qualifier_finalists (org_id, event_id, rank, attendee_id, best_wpm, best_accuracy, skin)
  select v_set.org_id, p_event_id, st.rank::int, st.attendee_id, st.best_wpm, st.best_accuracy, st.skin
    from public.qualifier_standings(p_event_id) st
   where st.rank <= 10;

  update public.qualifier_settings s
     set confirmed_at = now(), confirmed_by = p_by, updated_at = now()
   where s.event_id = p_event_id;
  return 'ok';
end;
$$;

-- Every settings write (D769): the window and the left-out categories. 'locked' once the
-- finalists are confirmed. A window that closes before it opens is refused by the check (an
-- error, not a code: the caller validates first). org_id is the event's own, as in start and
-- refresh; an event that doesn't exist is an error.
create or replace function public.qualifier_save_settings(
  p_event_id uuid, p_opens_at timestamptz, p_closes_at timestamptz, p_excluded text[]
) returns text
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_org uuid;
  v_confirmed timestamptz;
begin
  select e.org_id into v_org from public.events e where e.id = p_event_id;
  if not found then raise exception 'qualifier_save_settings: no event %', p_event_id; end if;

  select s.confirmed_at into v_confirmed from public.qualifier_settings s
   where s.event_id = p_event_id
     for update;
  if v_confirmed is not null then return 'locked'; end if;

  insert into public.qualifier_settings as s
    (event_id, org_id, opens_at, closes_at, excluded_categories, updated_at)
  values
    (p_event_id, v_org, p_opens_at, p_closes_at, coalesce(p_excluded, '{}'::text[]), now())
  on conflict (event_id) do update
     set opens_at = excluded.opens_at,
         closes_at = excluded.closes_at,
         excluded_categories = excluded.excluded_categories,
         updated_at = now();
  return 'ok';
end;
$$;

revoke execute on function public.qualifier_eligible(uuid, text, timestamptz, uuid, text[]) from public, anon, authenticated;
grant execute on function public.qualifier_eligible(uuid, text, timestamptz, uuid, text[]) to service_role;
revoke execute on function public.qualifier_standings(uuid) from public, anon, authenticated;
grant execute on function public.qualifier_standings(uuid) to service_role;
revoke execute on function public.qualifier_refresh_player(uuid, uuid) from public, anon, authenticated;
grant execute on function public.qualifier_refresh_player(uuid, uuid) to service_role;
revoke execute on function public.qualifier_start(uuid, uuid, text[], int) from public, anon, authenticated;
grant execute on function public.qualifier_start(uuid, uuid, text[], int) to service_role;
revoke execute on function public.qualifier_submit(uuid, uuid, numeric, int, int, int[], text, int, boolean) from public, anon, authenticated;
grant execute on function public.qualifier_submit(uuid, uuid, numeric, int, int, int[], text, int, boolean) to service_role;
revoke execute on function public.qualifier_board(uuid, int, int) from public, anon, authenticated;
grant execute on function public.qualifier_board(uuid, int, int) to service_role;
revoke execute on function public.qualifier_rank(uuid, uuid) from public, anon, authenticated;
grant execute on function public.qualifier_rank(uuid, uuid) to service_role;
revoke execute on function public.qualifier_board_size(uuid) from public, anon, authenticated;
grant execute on function public.qualifier_board_size(uuid) to service_role;
revoke execute on function public.qualifier_set_disqualified(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.qualifier_set_disqualified(uuid, uuid, boolean) to service_role;
revoke execute on function public.qualifier_confirm(uuid, uuid) from public, anon, authenticated;
grant execute on function public.qualifier_confirm(uuid, uuid) to service_role;
revoke execute on function public.qualifier_save_settings(uuid, timestamptz, timestamptz, text[]) from public, anon, authenticated;
grant execute on function public.qualifier_save_settings(uuid, timestamptz, timestamptz, text[]) to service_role;
