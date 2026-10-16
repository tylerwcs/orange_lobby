-- Tournament squads (spec 2026-10-16-tournament-squads-design.md, D637-D652): the fifth kind of
-- activity, its sports, every group's squad for each, and the two functions every squad write
-- goes through. Adds two columns to activities, two tables and two functions; no existing row changes.

alter table public.activities drop constraint if exists activities_kind_check;
alter table public.activities add constraint activities_kind_check
  check (kind in ('booking', 'submission', 'passport', 'polaroid', 'tournament'));

-- D641: the squad deadline. D640: who fills squads; the pickers are `proxy_fields` (D392).
-- Both null on every other kind.
alter table public.activities
  add column if not exists squads_close_at timestamptz,
  add column if not exists squad_fill text check (squad_fill in ('captains', 'self'));

-- D638: a tournament's sports, in the organiser's order. Later layers hang off these (D651).
create table if not exists public.tournament_sports (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 60),
  min_size    int not null,
  max_size    int not null,
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  check (min_size >= 1 and max_size >= min_size and max_size <= 30)
);
create unique index if not exists tournament_sports_name on public.tournament_sports (activity_id, lower(name));
create index if not exists tournament_sports_order on public.tournament_sports (activity_id, position);

-- D643: a row counts only while its attendee is not cancelled and still in `group_id`. The rest
-- stay, ignored; a new add for that person in this sport replaces theirs.
create table if not exists public.tournament_squad_members (
  sport_id    uuid not null references public.tournament_sports (id) on delete cascade,
  group_id    uuid not null references public.event_groups (id) on delete cascade,
  attendee_id uuid not null references public.attendees (id) on delete cascade,
  -- Null is an organiser (D648).
  added_by    uuid references public.attendees (id) on delete set null,
  added_at    timestamptz not null default now(),
  primary key (sport_id, attendee_id)
);
create index if not exists tournament_squad_members_squad on public.tournament_squad_members (sport_id, group_id);

alter table public.tournament_sports enable row level security;
alter table public.tournament_squad_members enable row level security;

-- D642: every squad add. The sport row is locked, so two pickers can never both fill the last
-- place. The portal path (p_admin false) also checks the open switch, the deadline, the actor's
-- right to pick and the squad's max; the admin path may go over max and past the deadline.
-- Answers ok, full, locked, not_allowed, not_member, already, missing or closed.
create or replace function public.add_squad_member(p_sport_id uuid, p_attendee_id uuid, p_actor_id uuid, p_admin boolean)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_sport public.tournament_sports%rowtype;
  v_act public.activities%rowtype;
  v_att public.attendees%rowtype;
  v_actor public.attendees%rowtype;
  v_proxy boolean;
  v_count int;
begin
  select s.* into v_sport from public.tournament_sports s where s.id = p_sport_id for update;
  if not found then return 'missing'; end if;
  select a.* into v_act from public.activities a where a.id = v_sport.activity_id;
  if not found or v_act.kind <> 'tournament' then return 'missing'; end if;

  select x.* into v_att from public.attendees x where x.id = p_attendee_id;
  if not found or v_att.event_id <> v_act.event_id or v_att.cancelled_at is not null or v_att.group_id is null then
    return 'not_member';
  end if;
  if not public.category_matches(v_act.categories, v_att.category) then return 'not_member'; end if;

  if not p_admin then
    if not v_act.is_open then return 'closed'; end if;
    if v_act.squads_close_at is not null and now() >= v_act.squads_close_at then return 'locked'; end if;
    select x.* into v_actor from public.attendees x where x.id = p_actor_id;
    if not found or v_actor.event_id <> v_act.event_id or v_actor.cancelled_at is not null
       or v_actor.group_id is distinct from v_att.group_id then
      return 'not_member';
    end if;
    v_proxy := exists (
      select 1 from unnest(v_act.proxy_fields) as f(k)
       where lower(btrim(coalesce(v_actor.extra->>f.k, ''))) in ('yes', 'y', 'true')
    );
    if coalesce(v_act.squad_fill, 'captains') = 'captains' and not v_proxy then return 'not_allowed'; end if;
    if v_act.squad_fill = 'self' and p_actor_id <> p_attendee_id and not v_proxy then return 'not_allowed'; end if;
  end if;

  if exists (
    select 1 from public.tournament_squad_members m
     where m.sport_id = p_sport_id and m.attendee_id = p_attendee_id and m.group_id = v_att.group_id
  ) then
    return 'already';
  end if;

  if not p_admin then
    select count(*) into v_count
      from public.tournament_squad_members m
      join public.attendees x on x.id = m.attendee_id
     where m.sport_id = p_sport_id and m.group_id = v_att.group_id
       and x.cancelled_at is null and x.group_id = m.group_id;
    if v_count >= v_sport.max_size then return 'full'; end if;
  end if;

  insert into public.tournament_squad_members (sport_id, group_id, attendee_id, added_by)
  values (p_sport_id, v_att.group_id, p_attendee_id, case when p_admin then null else p_actor_id end)
  on conflict (sport_id, attendee_id) do update
    set group_id = excluded.group_id, added_by = excluded.added_by, added_at = now();
  return 'ok';
end;
$$;

-- D642: every squad removal. Same locks and portal checks as an add, except anyone can always be
-- removed (no group or category test on them), and under `self` a member may remove themselves.
create or replace function public.remove_squad_member(p_sport_id uuid, p_attendee_id uuid, p_actor_id uuid, p_admin boolean)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_sport public.tournament_sports%rowtype;
  v_act public.activities%rowtype;
  v_row public.tournament_squad_members%rowtype;
  v_actor public.attendees%rowtype;
  v_proxy boolean;
begin
  select s.* into v_sport from public.tournament_sports s where s.id = p_sport_id for update;
  if not found then return 'missing'; end if;
  select a.* into v_act from public.activities a where a.id = v_sport.activity_id;
  if not found or v_act.kind <> 'tournament' then return 'missing'; end if;

  select m.* into v_row from public.tournament_squad_members m where m.sport_id = p_sport_id and m.attendee_id = p_attendee_id;
  if not found then return 'ok'; end if;

  if not p_admin then
    if not v_act.is_open then return 'closed'; end if;
    if v_act.squads_close_at is not null and now() >= v_act.squads_close_at then return 'locked'; end if;
    select x.* into v_actor from public.attendees x where x.id = p_actor_id;
    if not found or v_actor.event_id <> v_act.event_id or v_actor.cancelled_at is not null
       or v_actor.group_id is distinct from v_row.group_id then
      return 'not_member';
    end if;
    v_proxy := exists (
      select 1 from unnest(v_act.proxy_fields) as f(k)
       where lower(btrim(coalesce(v_actor.extra->>f.k, ''))) in ('yes', 'y', 'true')
    );
    if not v_proxy and not (v_act.squad_fill = 'self' and p_actor_id = p_attendee_id) then return 'not_allowed'; end if;
  end if;

  delete from public.tournament_squad_members m where m.sport_id = p_sport_id and m.attendee_id = p_attendee_id;
  return 'ok';
end;
$$;

revoke execute on function public.add_squad_member(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.add_squad_member(uuid, uuid, uuid, boolean) to service_role;
revoke execute on function public.remove_squad_member(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.remove_squad_member(uuid, uuid, uuid, boolean) to service_role;
