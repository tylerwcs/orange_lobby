-- Mileage x Active: two tracks, one team score (spec 2026-10-25-mileage-x-active-tracks-design.md,
-- D721-D725). Two scored activities linked as a pair, each attendee on at most one of them, the one
-- function every track change goes through, and submit_answers taking only the person's own track.
-- Adds two tables and one function and replaces submit_answers; no existing row changes, and an
-- activity in no pair submits exactly as before.

-- D721: the pair. a is Track A, b is Track B. An activity is in at most one pair.
create table if not exists public.challenge_track_pairs (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  a_activity_id uuid not null references public.activities (id) on delete cascade,
  b_activity_id uuid not null references public.activities (id) on delete cascade,
  -- D724: people per track the page aims for; shown, never enforced.
  target        int not null default 5 check (target between 1 and 30),
  -- D727: the weekly bonus when every member logs every day on either track.
  bonus         int not null default 0 check (bonus between 0 and 999),
  created_at    timestamptz not null default now(),
  check (a_activity_id <> b_activity_id)
);
create unique index if not exists challenge_track_pairs_a on public.challenge_track_pairs (a_activity_id);
create unique index if not exists challenge_track_pairs_b on public.challenge_track_pairs (b_activity_id);

-- D722: who is on which track. A row counts only while its attendee is not cancelled and still in
-- `group_id`; a new placement replaces it. No history is kept.
create table if not exists public.challenge_track_members (
  pair_id     uuid not null references public.challenge_track_pairs (id) on delete cascade,
  attendee_id uuid not null references public.attendees (id) on delete cascade,
  group_id    uuid not null references public.event_groups (id) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete cascade,
  -- Null is an organiser (D723).
  assigned_by uuid references public.attendees (id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (pair_id, attendee_id)
);
create index if not exists challenge_track_members_group on public.challenge_track_members (pair_id, group_id);

alter table public.challenge_track_pairs enable row level security;
alter table public.challenge_track_members enable row level security;

-- D723: every track change. A null p_activity_id takes the person off their track. The portal
-- path (p_admin false) needs an open pair activity and a captain - a Yes in either activity's
-- proxy fields - in the target's own group; the admin path places anyone.
-- Answers ok, missing, not_member, not_allowed or closed.
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

  if p_activity_id is null then
    delete from public.challenge_track_members m where m.pair_id = p_pair_id and m.attendee_id = p_attendee_id;
  else
    insert into public.challenge_track_members (pair_id, attendee_id, group_id, activity_id, assigned_by)
    values (p_pair_id, p_attendee_id, v_att.group_id, p_activity_id, case when p_admin then null else p_actor_id end)
    on conflict (pair_id, attendee_id) do update
      set group_id = excluded.group_id, activity_id = excluded.activity_id, assigned_by = excluded.assigned_by, assigned_at = now();
  end if;
  return 'ok';
end;
$$;

revoke execute on function public.set_challenge_track(uuid, uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_challenge_track(uuid, uuid, uuid, uuid, boolean) to service_role;

-- D725: as 0080, plus the track check after the category check (notrack, othertrack).
create or replace function submit_answers(
  p_activity_id uuid,
  p_attendee_id uuid,
  p_answers jsonb,
  p_today date,
  p_submitted_by uuid default null,
  p_file_hashes jsonb default '{}'::jsonb,
  p_pair_id uuid default null
) returns text
language plpgsql
as $$
declare
  a activities%rowtype;
  att attendees%rowtype;
  v_proxy attendees%rowtype;
  used int;
  v_constraint text;
  v_pair challenge_track_pairs%rowtype;
  v_track uuid;
begin
  select * into a from activities where id = p_activity_id for update;
  if not found then return 'missing'; end if;
  if a.kind <> 'submission' then return 'missing'; end if;

  select * into att from attendees where id = p_attendee_id;
  if not found or att.event_id <> a.event_id then return 'missing'; end if;

  if not a.is_open then return 'closed'; end if;

  if a.scoring is not null and (
    p_today < (a.scoring->>'starts_on')::date or p_today > (a.scoring->>'ends_on')::date
  ) then
    return 'closed';
  end if;

  -- D392: the sender must share the member's group and hold a Yes in one of the proxy fields.
  if p_submitted_by is not null and p_submitted_by <> p_attendee_id then
    select * into v_proxy from attendees where id = p_submitted_by;
    if not found or v_proxy.event_id <> a.event_id or v_proxy.group_id is null
       or v_proxy.group_id is distinct from att.group_id
       or not exists (
         select 1 from unnest(a.proxy_fields) as f(k)
          where lower(btrim(coalesce(v_proxy.extra->>f.k, ''))) in ('yes', 'y', 'true')
       ) then
      return 'proxy';
    end if;
  end if;

  if not category_matches(a.categories, att.category) then return 'ineligible'; end if;

  -- D725: in a track pair, only the person's own track takes their entry. The person checked is
  -- the one the entry is for, never a captain sending it. A row from another group (a team move)
  -- does not count (D722).
  select p.* into v_pair from challenge_track_pairs p where a.id in (p.a_activity_id, p.b_activity_id);
  if found then
    select m.activity_id into v_track from challenge_track_members m
     where m.pair_id = v_pair.id and m.attendee_id = p_attendee_id and m.group_id = att.group_id;
    if v_track is null then return 'notrack'; end if;
    if v_track <> a.id then return 'othertrack'; end if;
  end if;

  -- D396: the same file already in one of this person's live entries to this activity.
  if exists (
    select 1 from activity_submissions s, jsonb_each_text(s.file_hashes) as h(k, v)
     where s.activity_id = a.id and s.attendee_id = p_attendee_id and s.status = 'submitted'
       and h.v in (select value from jsonb_each_text(coalesce(p_file_hashes, '{}'::jsonb)))
  ) then
    return 'duplicate';
  end if;

  if a.group_mode <> 'off' then
    if att.group_id is null then return 'nogroup'; end if;
    if a.group_mode = 'entries' then
      select count(*) into used from activity_submissions
       where activity_id = a.id and group_id = att.group_id and status = 'submitted';
      if used >= a.group_target then return 'groupdone'; end if;
    elsif a.group_mode = 'everyone' and exists (
      select 1 from activity_submissions
       where activity_id = a.id and attendee_id = p_attendee_id
         and group_id = att.group_id and status = 'submitted'
    ) then
      return 'limit';
    end if;
    -- 'members': no limit at all - one entry per workout (D368).
  else
    if a.max_per_attendee is not null then
      select count(*) into used from activity_submissions
       where activity_id = a.id and attendee_id = p_attendee_id and status = 'submitted';
      if used >= a.max_per_attendee then return 'limit'; end if;
    end if;

    if a.per_day and exists (
      select 1 from activity_submissions
       where activity_id = a.id and attendee_id = p_attendee_id and submitted_on = p_today and status = 'submitted'
    ) then
      return 'today';
    end if;
  end if;

  insert into activity_submissions (event_id, activity_id, attendee_id, group_id, answers, submitted_on, per_day, submitted_by, file_hashes, pair_id)
  values (
    a.event_id, a.id, p_attendee_id,
    case when a.group_mode <> 'off' then att.group_id end,
    coalesce(p_answers, '{}'::jsonb), p_today, a.per_day,
    case when p_submitted_by is distinct from p_attendee_id then p_submitted_by end,
    coalesce(p_file_hashes, '{}'::jsonb),
    p_pair_id
  );

  return 'ok';
exception
  -- Scoped to that one constraint BY NAME, as in 0053: anything else is a genuine fault.
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'activity_submissions_one_a_day' then
      return 'today';
    end if;
    raise;
end;
$$;

revoke execute on function submit_answers(uuid, uuid, jsonb, date, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function submit_answers(uuid, uuid, jsonb, date, uuid, jsonb, uuid) to service_role;
