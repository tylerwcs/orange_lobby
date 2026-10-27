-- Mileage x Active (spec 2026-10-25-mileage-x-active-tracks-design.md, D731, the user's ask on
-- 27 Oct): My team shows each day's tracks as they were, so every track change is kept with the
-- Malaysian day it happened. Adds one table (filled from today's placements) and replaces
-- set_challenge_track (as 0107, plus the history row).

-- D731: one row per change. A null activity is "taken off a track". The latest row on or before a
-- day is the person's track that day; a row counts only while its group is the person's group.
create table if not exists public.challenge_track_history (
  id          uuid primary key default gen_random_uuid(),
  pair_id     uuid not null references public.challenge_track_pairs (id) on delete cascade,
  attendee_id uuid not null references public.attendees (id) on delete cascade,
  group_id    uuid not null references public.event_groups (id) on delete cascade,
  activity_id uuid references public.activities (id) on delete cascade,
  day         date not null,
  at          timestamptz not null default now()
);
create index if not exists challenge_track_history_pair on public.challenge_track_history (pair_id, day);
alter table public.challenge_track_history enable row level security;

-- The placements made before this table existed, each from the day it was made.
insert into public.challenge_track_history (pair_id, attendee_id, group_id, activity_id, day, at)
select m.pair_id, m.attendee_id, m.group_id, m.activity_id, (m.assigned_at at time zone 'Asia/Kuala_Lumpur')::date, m.assigned_at
  from public.challenge_track_members m
 where not exists (select 1 from public.challenge_track_history h where h.pair_id = m.pair_id and h.attendee_id = m.attendee_id);

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
    if not exists (
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

  -- D731: keep the change with its day, so My team can show any day's tracks as they were.
  if v_old is distinct from p_activity_id then
    insert into public.challenge_track_history (pair_id, attendee_id, group_id, activity_id, day)
    values (p_pair_id, p_attendee_id, v_att.group_id, p_activity_id, v_today);
  end if;
  return 'ok';
end;
$$;

revoke execute on function public.set_challenge_track(uuid, uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_challenge_track(uuid, uuid, uuid, uuid, boolean) to service_role;
