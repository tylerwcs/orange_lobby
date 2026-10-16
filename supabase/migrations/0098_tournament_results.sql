-- Tournament results (spec 2026-10-16-tournament-results-design.md, D653-D672): each sport's
-- results type and format, the pools, the matches and their slots, and the one function that
-- writes a sport's whole match plan. Standings, places and totals are never stored: they are
-- worked out from these rows on every read (D670). No existing row changes.

-- D654: points per place, 1st first; null is no overall leaderboard. D662: the reveal switch.
alter table public.activities
  add column if not exists place_points int[],
  add column if not exists show_overall boolean not null default true;

-- D653: how a sport is scored and run. D660: when its short squads were marked forfeit.
alter table public.tournament_sports
  add column if not exists result_kind text not null default 'score' check (result_kind in ('score', 'time')),
  add column if not exists format text not null default 'pools' check (format in ('pools', 'manual')),
  add column if not exists pool_size int not null default 3 check (pool_size between 2 and 8),
  add column if not exists forfeits_marked_at timestamptz;

-- D655: who plays a sport and in which pool (0 = Pool A). A group without a row sits it out.
-- D665: by hand, every playing group has pool 0 and the admin's place.
create table if not exists public.tournament_pool_groups (
  sport_id     uuid not null references public.tournament_sports (id) on delete cascade,
  group_id     uuid not null references public.event_groups (id) on delete cascade,
  pool         int not null default 0 check (pool >= 0),
  forfeit      boolean not null default false,
  manual_place int check (manual_place >= 1),
  primary key (sport_id, group_id)
);
create index if not exists tournament_pool_groups_group on public.tournament_pool_groups (group_id);

-- D669: a match or race. Pool matches carry their pool, bracket matches their bracket (0 = Gold).
create table if not exists public.tournament_matches (
  id           uuid primary key default gen_random_uuid(),
  sport_id     uuid not null references public.tournament_sports (id) on delete cascade,
  stage        text not null check (stage in ('pool', 'bracket', 'manual')),
  pool         int,
  bracket      int,
  round        text not null check (length(btrim(round)) between 1 and 60),
  position     int not null default 0,
  -- D658: a no-show on the day. D658: who went through a level bracket match.
  walkover_to  uuid references public.event_groups (id) on delete set null,
  went_through uuid references public.event_groups (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists tournament_matches_sport on public.tournament_matches (sport_id, position);
create index if not exists tournament_matches_walkover on public.tournament_matches (walkover_to);
create index if not exists tournament_matches_went on public.tournament_matches (went_through);

-- D651/D669: a place in a match. Fixed (group_id, null while empty) or a pointer to another
-- match's winner or loser, resolved when read so a corrected semi moves the final by itself.
create table if not exists public.tournament_match_slots (
  match_id        uuid not null references public.tournament_matches (id) on delete cascade,
  slot            int not null check (slot >= 0),
  group_id        uuid references public.event_groups (id) on delete set null,
  source_match_id uuid references public.tournament_matches (id) on delete cascade,
  source_outcome  text check (source_outcome in ('winner', 'loser')),
  score           int check (score between 0 and 999),
  time_ms         int check (time_ms > 0),
  dnf             boolean not null default false,
  primary key (match_id, slot),
  check (not (group_id is not null and source_match_id is not null)),
  check ((source_match_id is null) = (source_outcome is null))
);
create index if not exists tournament_match_slots_source on public.tournament_match_slots (source_match_id);
create index if not exists tournament_match_slots_group on public.tournament_match_slots (group_id);

alter table public.tournament_pool_groups enable row level security;
alter table public.tournament_matches enable row level security;
alter table public.tournament_match_slots enable row level security;

-- D655: a sport's whole plan - pools, matches with their ids, slots - in one transaction, built
-- by the pure planner. Refuses ('has_results') once any result is in, unless p_force (Reset).
-- An empty plan with p_force is Reset itself.
create or replace function public.set_sport_plan(p_sport_id uuid, p_plan jsonb, p_force boolean)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_sport uuid;
begin
  select id into v_sport from public.tournament_sports where id = p_sport_id for update;
  if v_sport is null then
    return 'missing';
  end if;

  if not p_force and (
    exists (
      select 1 from public.tournament_match_slots s
      join public.tournament_matches m on m.id = s.match_id
      where m.sport_id = p_sport_id and (s.score is not null or s.time_ms is not null or s.dnf)
    ) or exists (
      select 1 from public.tournament_matches m
      where m.sport_id = p_sport_id and (m.walkover_to is not null or m.went_through is not null)
    )
  ) then
    return 'has_results';
  end if;

  delete from public.tournament_matches where sport_id = p_sport_id;
  delete from public.tournament_pool_groups where sport_id = p_sport_id;

  insert into public.tournament_pool_groups (sport_id, group_id, pool, forfeit, manual_place)
  select p_sport_id, (p->>'group_id')::uuid, coalesce((p->>'pool')::int, 0),
         coalesce((p->>'forfeit')::boolean, false), (p->>'manual_place')::int
  from jsonb_array_elements(coalesce(p_plan->'pools', '[]'::jsonb)) p;

  insert into public.tournament_matches (id, sport_id, stage, pool, bracket, round, position)
  select (m->>'id')::uuid, p_sport_id, m->>'stage', (m->>'pool')::int, (m->>'bracket')::int, m->>'round', (m->>'position')::int
  from jsonb_array_elements(coalesce(p_plan->'matches', '[]'::jsonb)) m;

  insert into public.tournament_match_slots (match_id, slot, group_id, source_match_id, source_outcome)
  select (m->>'id')::uuid, (s->>'slot')::int, (s->>'group_id')::uuid, (s->>'source_match_id')::uuid, s->>'source_outcome'
  from jsonb_array_elements(coalesce(p_plan->'matches', '[]'::jsonb)) m,
       jsonb_array_elements(coalesce(m->'slots', '[]'::jsonb)) s;

  return 'ok';
end;
$$;

revoke execute on function public.set_sport_plan(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.set_sport_plan(uuid, jsonb, boolean) to service_role;
