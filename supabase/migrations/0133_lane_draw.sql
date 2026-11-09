-- Bowling lane draw (spec 2026-11-09-bowling-lanes-design.md, D860-D866): a third sport format
-- whose playing sides' bowlers are seated on lanes for each game and scored one by one. Totals
-- and places are never stored: they are worked out from the seats on every read (D670). Pool
-- rows keep recording who plays and who is forfeit. No existing row changes.

-- D860: the format, and its lanes and games.
alter table public.tournament_sports drop constraint if exists tournament_sports_format_check;
alter table public.tournament_sports
  add constraint tournament_sports_format_check check (format in ('pools', 'manual', 'lanes')),
  add column if not exists lane_count int not null default 6 check (lane_count between 1 and 20),
  add column if not exists games int not null default 4 check (games between 1 and 10);

-- D862/D865: one bowler's seat on one lane in one game, and their score once keyed (blank until
-- then). `group_id` is the side: the group, or the super team's lead group (D825). `number` is the
-- side's random 1..n label (A1..A4 in the user's picture).
create table if not exists public.tournament_lane_seats (
  sport_id    uuid not null references public.tournament_sports (id) on delete cascade,
  game        int not null check (game >= 1),
  lane        int not null check (lane >= 1),
  seat        int not null check (seat >= 1),
  group_id    uuid not null references public.event_groups (id) on delete cascade,
  attendee_id uuid not null references public.attendees (id) on delete cascade,
  number      int not null check (number >= 1),
  score       int check (score between 0 and 300),
  primary key (sport_id, game, lane, seat),
  unique (sport_id, game, attendee_id)
);
create index if not exists tournament_lane_seats_attendee on public.tournament_lane_seats (attendee_id);
create index if not exists tournament_lane_seats_group on public.tournament_lane_seats (group_id);

alter table public.tournament_lane_seats enable row level security;

-- D863: the whole draw in one transaction - who plays (pool 0, with their forfeit flag) and every
-- seat. Refused once any seat has a score, unless forced (Reset clears it all).
create or replace function public.set_lane_draw(p_sport_id uuid, p_pools jsonb, p_seats jsonb, p_force boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sport uuid;
begin
  select id into v_sport from public.tournament_sports where id = p_sport_id for update;
  if v_sport is null then
    return 'missing';
  end if;

  if not p_force and exists (select 1 from public.tournament_lane_seats where sport_id = p_sport_id and score is not null) then
    return 'has_scores';
  end if;

  delete from public.tournament_lane_seats where sport_id = p_sport_id;
  delete from public.tournament_pool_groups where sport_id = p_sport_id;

  insert into public.tournament_pool_groups (sport_id, group_id, pool, forfeit, manual_place)
  select p_sport_id, (p->>'group_id')::uuid, 0, coalesce((p->>'forfeit')::boolean, false), null
  from jsonb_array_elements(coalesce(p_pools, '[]'::jsonb)) p;

  insert into public.tournament_lane_seats (sport_id, game, lane, seat, group_id, attendee_id, number)
  select p_sport_id, (s->>'game')::int, (s->>'lane')::int, (s->>'seat')::int, (s->>'group_id')::uuid, (s->>'attendee_id')::uuid, (s->>'number')::int
  from jsonb_array_elements(coalesce(p_seats, '[]'::jsonb)) s;

  return 'ok';
end;
$$;

revoke execute on function public.set_lane_draw(uuid, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.set_lane_draw(uuid, jsonb, jsonb, boolean) to service_role;
