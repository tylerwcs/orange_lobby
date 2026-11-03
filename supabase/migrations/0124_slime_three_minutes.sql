-- Slime Splat runs last 3 minutes (D812). The game's rules changed in
-- src/features/qualifier/game/rules.ts: RUN_CAP_MS is now 180000, so a run's submit window is
-- RUN_CAP_MS + SUBMIT_GRACE_MS = 4 minutes. The functions of 0120 that repeat those literals are
-- replaced with the new values and nothing else changed: qualifier_submit (the window and the
-- ended_ms ceiling), qualifier_live_count and qualifier_confirm (the window). Their grants carry
-- over (create or replace keeps them). tests/qualifier/sql-constants.test.ts pins this file now.

-- Records a finished game (D792): 'late' after starts_at + 4 minutes, 'refused' with an
-- ended_ms outside 0-180000; otherwise as in 0120.
create or replace function public.qualifier_submit(
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
  if now() > v_run.starts_at + interval '4 minutes' then return 'late'; end if;
  if p_score is null or p_score < 0
     or p_ended_ms is null or p_ended_ms < 0 or p_ended_ms > 180000
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

-- Live runs still within their submit window (starts_at + 4 minutes); otherwise as in 0120.
create or replace function public.qualifier_live_count(p_event_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.qualifier_runs r
   where r.event_id = p_event_id and r.status = 'live'
     and now() <= r.starts_at + interval '4 minutes';
$$;

-- The finale snapshot waits for runs still within their 4 minutes; otherwise as in 0120.
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
       and now() <= r.starts_at + interval '4 minutes') then
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
