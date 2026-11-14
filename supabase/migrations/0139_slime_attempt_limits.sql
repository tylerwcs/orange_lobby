-- Slime Splat: practice and official runs, daily limits and play hours (D907, D908).
--
-- A client's poster: 3 practice runs a day that never count, 1 official attempt a day that does,
-- and play only before 10am, 12pm-2pm and after 7pm. All three are per-event settings; null
-- means "no limit" / "any time", so an event that sets none plays exactly as before.
--
-- - qualifier_runs.kind: 'practice' or 'official'. Every run so far is official.
-- - qualifier_settings.practice_per_day / official_per_day: how many runs of each kind one
--   attendee may START in a Malaysia calendar day. An attempt is used when its row is inserted,
--   whatever becomes of it (abandoned, never sent, disqualified): otherwise a bad run is quit
--   and tried again.
-- - qualifier_settings.play_hours: flat pairs of minutes of the Malaysia day, [from, to, ...],
--   `to` exclusive (src/features/qualifier/hours.ts). A run started inside the hours may finish
--   after them, as one started before closes_at already does.
--
-- The rules live in qualifier_start because it already holds the attendee's row lock: two
-- starts by one person run one after the other, so two tabs cannot both take the last attempt.
-- The new parameters come last and have defaults, so the code that is live while this is
-- applied (it sends the old named arguments) keeps working: its runs are official, and its
-- settings save leaves the three new settings null.

alter table public.qualifier_runs
  add column kind text not null default 'official' check (kind in ('practice', 'official'));

alter table public.qualifier_settings
  add column practice_per_day int check (practice_per_day between 0 and 99),
  add column official_per_day int check (official_per_day between 0 and 99),
  add column play_hours int[] check (
    play_hours is null
    or (cardinality(play_hours) % 2 = 0 and 0 <= all (play_hours) and 1440 >= all (play_hours))
  );

-- Rewrites one attendee's summary from their runs (0120), now from OFFICIAL runs only: best =
-- the highest-scoring counted official run that is not disqualified (then the earlier run, then
-- the lower id). runs_played still counts every counted run, practice included.
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
     and r.kind = 'official'
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

-- Starts a run (D769, D792, D907, D908). As 0120, plus p_kind ('practice' or 'official'; anything
-- else is official) and two more refusals, checked after 'closed' and 'ineligible' and BEFORE
-- the live run is abandoned, so a refused start costs the player nothing:
-- 'hours' when play_hours is set and the Malaysia minute of now() is in none of its pairs;
-- 'limit' when that kind's per-day number is set and the attendee already has that many runs
-- of the kind in this event on the new run's Malaysia day. The day is the day of starts_at (the
-- end of the countdown), for the count and for the new run alike, so a run started in the last
-- seconds before midnight belongs to the next day on both sides.
drop function public.qualifier_start(uuid, uuid, int, int);
create function public.qualifier_start(
  p_event_id uuid, p_attendee_id uuid, p_seed int, p_countdown_ms int, p_kind text default 'official'
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
  v_kind text := case when p_kind = 'practice' then 'practice' else 'official' end;
  v_local timestamp;
  v_minute int;
  v_open boolean;
  v_limit int;
  v_used int;
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

  if v_set.play_hours is not null and cardinality(v_set.play_hours) >= 2 then
    v_local := now() at time zone 'Asia/Kuala_Lumpur';
    v_minute := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
    v_open := false;
    for i in 1 .. cardinality(v_set.play_hours) / 2 loop
      if v_minute >= v_set.play_hours[2 * i - 1] and v_minute < v_set.play_hours[2 * i] then
        v_open := true;
      end if;
    end loop;
    if not v_open then
      return query select null::uuid, null::timestamptz, 'hours'::text;
      return;
    end if;
  end if;

  v_starts := date_trunc('milliseconds', now() + greatest(coalesce(p_countdown_ms, 0), 0) * interval '1 millisecond');

  v_limit := case when v_kind = 'practice' then v_set.practice_per_day else v_set.official_per_day end;
  if v_limit is not null then
    select count(*)::int into v_used
      from public.qualifier_runs r
     where r.event_id = p_event_id and r.attendee_id = p_attendee_id and r.kind = v_kind
       and (r.starts_at at time zone 'Asia/Kuala_Lumpur')::date = (v_starts at time zone 'Asia/Kuala_Lumpur')::date;
    if v_used >= v_limit then
      return query select null::uuid, null::timestamptz, 'limit'::text;
      return;
    end if;
  end if;

  update public.qualifier_runs r set status = 'abandoned'
   where r.attendee_id = p_attendee_id and r.status = 'live';

  insert into public.qualifier_runs as r (org_id, event_id, attendee_id, seed, starts_at, kind)
  values (v_org, p_event_id, p_attendee_id, p_seed, v_starts, v_kind)
  returning r.id into v_id;

  return query select v_id, v_starts, null::text;
end;
$$;

-- Saves the settings (0117), now with the two daily numbers and the play hours (D910). The
-- table's checks raise on a number outside 0-99 or hours that aren't pairs inside one day, so
-- the action validates first.
drop function public.qualifier_save_settings(uuid, timestamptz, timestamptz, text[]);
create function public.qualifier_save_settings(
  p_event_id uuid, p_opens_at timestamptz, p_closes_at timestamptz, p_excluded text[],
  p_practice_per_day int default null, p_official_per_day int default null, p_play_hours int[] default null
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
    (event_id, org_id, opens_at, closes_at, excluded_categories, practice_per_day, official_per_day, play_hours, updated_at)
  values
    (p_event_id, v_org, p_opens_at, p_closes_at, coalesce(p_excluded, '{}'::text[]),
     p_practice_per_day, p_official_per_day, p_play_hours, now())
  on conflict (event_id) do update
     set opens_at = excluded.opens_at,
         closes_at = excluded.closes_at,
         excluded_categories = excluded.excluded_categories,
         practice_per_day = excluded.practice_per_day,
         official_per_day = excluded.official_per_day,
         play_hours = excluded.play_hours,
         updated_at = now();
  return 'ok';
end;
$$;

revoke execute on function public.qualifier_start(uuid, uuid, int, int, text) from public, anon, authenticated;
grant execute on function public.qualifier_start(uuid, uuid, int, int, text) to service_role;
revoke execute on function public.qualifier_save_settings(uuid, timestamptz, timestamptz, text[], int, int, int[]) from public, anon, authenticated;
grant execute on function public.qualifier_save_settings(uuid, timestamptz, timestamptz, text[], int, int, int[]) to service_role;
