-- Mileage x Active, 14 Nov (spec 2026-10-25-mileage-x-active-tracks-design.md, D904-D906):
-- members pick their own track, a pair may drop the daily places, and each person may take a few
-- days off a week that count as logged for the pair's weekly bonus.
--
-- D904: set_challenge_track lets a portal attendee place THEMSELVES, captain or not. Captains keep
-- placing their own team as before. A self-move removes what they logged today on the old track,
-- as every move does (D726).
-- D905: `target` may be null - no daily places and no "of 5" on the page. submit_answers (0136) and
-- restore_submission (0110) already take a null target as "no limit", so neither changes.
-- D906: `skip_days` per pair (0 = off) and one row per person per day off. set_skip_day is the one
-- way in: today or later, inside the challenge's dates, at most `skip_days` in a Monday-Sunday week.

alter table public.challenge_track_pairs alter column target drop not null;
alter table public.challenge_track_pairs add column if not exists skip_days int not null default 0 check (skip_days between 0 and 6);

create table if not exists public.challenge_skip_days (
  pair_id     uuid not null references public.challenge_track_pairs (id) on delete cascade,
  attendee_id uuid not null references public.attendees (id) on delete cascade,
  day         date not null,
  created_at  timestamptz not null default now(),
  primary key (pair_id, attendee_id, day)
);
alter table public.challenge_skip_days enable row level security;

create or replace function public.set_challenge_track(p_pair_id uuid, p_attendee_id uuid, p_activity_id uuid, p_actor_id uuid, p_admin boolean)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_pair public.challenge_track_pairs%rowtype;
  v_a public.activities%rowtype;
  v_b public.activities%rowtype;
  v_att public.attendees%rowtype;
  v_actor public.attendees%rowtype;
  v_old uuid;
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  select p.* into v_pair from public.challenge_track_pairs p where p.id = p_pair_id for update;
  if not found then return 'missing'; end if;
  if p_activity_id is not null and p_activity_id not in (v_pair.a_activity_id, v_pair.b_activity_id) then return 'missing'; end if;
  select a.* into v_a from public.activities a where a.id = v_pair.a_activity_id;
  select a.* into v_b from public.activities a where a.id = v_pair.b_activity_id;

  select x.* into v_att from public.attendees x where x.id = p_attendee_id;
  if not found or v_att.event_id <> v_pair.event_id or v_att.cancelled_at is not null or v_att.group_id is null then
    return 'not_member';
  end if;

  if not p_admin then
    if not (v_a.is_open or v_b.is_open) then return 'closed'; end if;
    select x.* into v_actor from public.attendees x where x.id = p_actor_id;
    if not found or v_actor.event_id <> v_pair.event_id or v_actor.cancelled_at is not null
       or v_actor.group_id is distinct from v_att.group_id then
      return 'not_member';
    end if;
    -- D904: anyone may pick their own track; placing someone else still takes a captain.
    if v_actor.id <> v_att.id and not exists (
      select 1 from unnest(v_a.proxy_fields || v_b.proxy_fields) as f(k)
       where lower(btrim(coalesce(v_actor.extra->>f.k, ''))) in ('yes', 'y', 'true')
    ) then
      return 'not_allowed';
    end if;
  end if;

  -- D726: leaving a track - for the other one, or for none - removes what the person logged on it
  -- today (Malaysian date), so nobody scores on both tracks in one day. Earlier days stay.
  select m.activity_id into v_old from public.challenge_track_members m
   where m.pair_id = p_pair_id and m.attendee_id = p_attendee_id and m.group_id = v_att.group_id;
  if v_old is not null and v_old is distinct from p_activity_id then
    delete from public.activity_submissions s
     where s.activity_id = v_old and s.attendee_id = p_attendee_id
       and s.submitted_on = v_today;
  end if;

  if p_activity_id is null then
    delete from public.challenge_track_members m where m.pair_id = p_pair_id and m.attendee_id = p_attendee_id;
  else
    insert into public.challenge_track_members (pair_id, attendee_id, group_id, activity_id, assigned_by)
    values (p_pair_id, p_attendee_id, v_att.group_id, p_activity_id, case when p_admin then null else p_actor_id end)
    on conflict (pair_id, attendee_id) do update
      set group_id = excluded.group_id, activity_id = excluded.activity_id, assigned_by = excluded.assigned_by, assigned_at = now();
  end if;

  -- D734: keep the change with its day, so My team can show any day's tracks as they were.
  if v_old is distinct from p_activity_id then
    insert into public.challenge_track_history (pair_id, attendee_id, group_id, activity_id, day)
    values (p_pair_id, p_attendee_id, v_att.group_id, p_activity_id, v_today);
  end if;
  return 'ok';
end;
$$;

revoke execute on function public.set_challenge_track(uuid, uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_challenge_track(uuid, uuid, uuid, uuid, boolean) to service_role;

-- D906: one person takes a day off (p_skip true) or takes it back (false), for themselves only.
-- Answers ok, missing, off (the pair has no days off), not_member, closed, past, outside or used.
create or replace function public.set_skip_day(p_pair_id uuid, p_attendee_id uuid, p_day date, p_skip boolean)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_pair public.challenge_track_pairs%rowtype;
  v_a public.activities%rowtype;
  v_b public.activities%rowtype;
  v_att public.attendees%rowtype;
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_monday date := date_trunc('week', p_day)::date;
begin
  select p.* into v_pair from public.challenge_track_pairs p where p.id = p_pair_id;
  if not found then return 'missing'; end if;
  if v_pair.skip_days = 0 then return 'off'; end if;
  select a.* into v_a from public.activities a where a.id = v_pair.a_activity_id;
  select a.* into v_b from public.activities a where a.id = v_pair.b_activity_id;
  if not (v_a.is_open or v_b.is_open) then return 'closed'; end if;

  -- The row lock makes two taps from one person take turns, so the week's count holds.
  select x.* into v_att from public.attendees x where x.id = p_attendee_id for update;
  if not found or v_att.event_id <> v_pair.event_id or v_att.cancelled_at is not null or v_att.group_id is null then
    return 'not_member';
  end if;

  -- Nothing changes after midnight (the poster's deadline), so a day gone is gone either way.
  if p_day < v_today then return 'past'; end if;
  if p_day < (v_a.scoring->>'starts_on')::date or p_day > (v_a.scoring->>'ends_on')::date then return 'outside'; end if;

  if not p_skip then
    delete from public.challenge_skip_days d where d.pair_id = p_pair_id and d.attendee_id = p_attendee_id and d.day = p_day;
    return 'ok';
  end if;

  if (
    select count(*) from public.challenge_skip_days d
     where d.pair_id = p_pair_id and d.attendee_id = p_attendee_id
       and d.day between v_monday and v_monday + 6 and d.day <> p_day
  ) >= v_pair.skip_days then
    return 'used';
  end if;
  insert into public.challenge_skip_days (pair_id, attendee_id, day) values (p_pair_id, p_attendee_id, p_day)
  on conflict do nothing;
  return 'ok';
end;
$$;

revoke execute on function public.set_skip_day(uuid, uuid, date, boolean) from public, anon, authenticated;
grant execute on function public.set_skip_day(uuid, uuid, date, boolean) to service_role;
