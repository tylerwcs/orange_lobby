-- Tournament super teams (spec 2026-11-05-super-teams-design.md, D821-D826): a tournament may pair
-- the event's groups into super teams of two, each playing as one side with one squad per sport.
-- Adds a switch, two tables and a helper, and widens the two squad functions from "the group" to
-- "the group's side". With the switch off (every existing tournament) they answer as in 0097.

-- D821: the switch. Off everywhere today.
alter table public.activities add column if not exists super_teams boolean not null default false;

-- D822: a pair, keyed in by an admin. An unnamed one is shown as its two group names.
create table if not exists public.tournament_super_teams (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  name        text check (name is null or length(btrim(name)) between 1 and 60),
  created_at  timestamptz not null default now()
);
create index if not exists tournament_super_teams_activity on public.tournament_super_teams (activity_id);

-- A pair's two groups. Position 0 is the lead: its group id stands for the side in pools, match
-- slots and places. A group is in at most one super team per tournament (the primary key).
create table if not exists public.tournament_super_team_groups (
  super_team_id uuid not null references public.tournament_super_teams (id) on delete cascade,
  activity_id   uuid not null references public.activities (id) on delete cascade,
  group_id      uuid not null references public.event_groups (id) on delete cascade,
  position      smallint not null check (position in (0, 1)),
  primary key (activity_id, group_id),
  unique (super_team_id, position)
);
create index if not exists tournament_super_team_groups_team on public.tournament_super_team_groups (super_team_id);
create index if not exists tournament_super_team_groups_group on public.tournament_super_team_groups (group_id);

alter table public.tournament_super_teams enable row level security;
alter table public.tournament_super_team_groups enable row level security;

-- The groups that share a squad with `p_group_id` in this tournament: just itself with the switch
-- off; its super team's groups with it on; none when it is on and the group has no pair (D824).
create or replace function public.tournament_side_groups(p_activity_id uuid, p_group_id uuid)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select case
    when not coalesce((select a.super_teams from public.activities a where a.id = p_activity_id), false) then array[p_group_id]
    else coalesce((
      select array_agg(o.group_id order by o.position)
        from public.tournament_super_team_groups g
        join public.tournament_super_team_groups o on o.super_team_id = g.super_team_id
       where g.activity_id = p_activity_id and g.group_id = p_group_id
    ), '{}'::uuid[])
  end;
$$;

-- D642 + D826: every squad add, as 0097, with the actor's group, "already" and the squad's count
-- all taken over the attendee's side (both teams of a pair).
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
  v_side uuid[];
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
  v_side := public.tournament_side_groups(v_act.id, v_att.group_id);
  if cardinality(v_side) = 0 then return 'not_member'; end if;

  if not p_admin then
    if not v_act.is_open then return 'closed'; end if;
    if v_act.squads_close_at is not null and now() >= v_act.squads_close_at then return 'locked'; end if;
    select x.* into v_actor from public.attendees x where x.id = p_actor_id;
    if not found or v_actor.event_id <> v_act.event_id or v_actor.cancelled_at is not null
       or v_actor.group_id is null or not (v_actor.group_id = any(v_side)) then
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
     where m.sport_id = p_sport_id and m.attendee_id = p_attendee_id and m.group_id = any(v_side)
  ) then
    return 'already';
  end if;

  if not p_admin then
    select count(*) into v_count
      from public.tournament_squad_members m
      join public.attendees x on x.id = m.attendee_id
     where m.sport_id = p_sport_id and m.group_id = any(v_side)
       and x.cancelled_at is null and x.group_id = any(v_side);
    if v_count >= v_sport.max_size then return 'full'; end if;
  end if;

  insert into public.tournament_squad_members (sport_id, group_id, attendee_id, added_by)
  values (p_sport_id, v_att.group_id, p_attendee_id, case when p_admin then null else p_actor_id end)
  on conflict (sport_id, attendee_id) do update
    set group_id = excluded.group_id, added_by = excluded.added_by, added_at = now();
  return 'ok';
end;
$$;

-- D642 + D826: every squad removal, as 0097, with the actor allowed anywhere in the row's side.
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
  v_side uuid[];
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
    v_side := public.tournament_side_groups(v_act.id, v_row.group_id);
    select x.* into v_actor from public.attendees x where x.id = p_actor_id;
    if not found or v_actor.event_id <> v_act.event_id or v_actor.cancelled_at is not null
       or v_actor.group_id is null or not (v_actor.group_id = any(v_side)) then
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

revoke execute on function public.tournament_side_groups(uuid, uuid) from public, anon, authenticated;
grant execute on function public.tournament_side_groups(uuid, uuid) to service_role;
revoke execute on function public.add_squad_member(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.add_squad_member(uuid, uuid, uuid, boolean) to service_role;
revoke execute on function public.remove_squad_member(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.remove_squad_member(uuid, uuid, uuid, boolean) to service_role;
