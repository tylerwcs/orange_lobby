-- Live games visuals (spec 2026-09-27-live-games-visuals-design.md, D290–D322): the lucky
-- draw's four formats. Additive, and draw_spin keeps its old call working through defaults, so
-- this is applied BEFORE the code that uses it is deployed (D320).

-- A card round's shuffled deck (D317): prize numbers, card 1 first. Null for every other run.
alter table game_runs add column deck int[];

-- Which run drew a winner, and which card they picked. Older rows keep run_id null.
alter table draw_winners add column run_id uuid references game_runs(id) on delete cascade;
alter table draw_winners add column card_no int;
-- A card round draws the person before the prize is known (D317).
alter table draw_winners alter column prize_no drop not null;
-- A card is taken once per run.
create unique index draw_winners_card_idx on draw_winners (run_id, card_no) where card_no is not null and not void;
create index draw_winners_run_idx on draw_winners (run_id);

drop function draw_spin(uuid, int, uuid, uuid, int, int, uuid, text[], timestamptz, uuid[]);

-- As 0049's, plus: no prize for a card round's turn (only when the game's format is 'cards');
-- the run recorded on each winner; voided winners matched with IS NOT DISTINCT FROM, so a
-- person sent away before picking a card is not drawn again in that card round; p_phase
-- 'draw_rounds' for the mosaic, which has no end time (D315); p_extra merged into phase_data;
-- and pool_at stamped from the database clock (D316).
create function draw_spin(
  p_event_id uuid, p_expected int, p_run_id uuid, p_game_id uuid, p_prize_no int, p_count int,
  p_checkpoint_id uuid, p_exclude text[], p_spin_ends_at timestamptz, p_keep uuid[] default '{}',
  p_phase text default 'draw_spinning', p_extra jsonb default '{}'
) returns uuid[]
language plpgsql
as $$
declare
  v int;
  picked uuid[];
  kept uuid[];
begin
  if p_phase is null or p_phase not in ('draw_spinning', 'draw_rounds') then
    return null;
  end if;
  if not exists (
    select 1 from game_runs r join games g on g.id = r.game_id
     where r.id = p_run_id and r.event_id = p_event_id
       and g.id = p_game_id and g.event_id = p_event_id and g.kind = 'draw'
       and (p_prize_no is not null or g.config->>'format' = 'cards')) then
    return null;
  end if;
  update game_stage set version = version + 1, updated_at = now()
   where event_id = p_event_id and version = p_expected
  returning version into v;
  if v is null then return null; end if;

  select coalesce(array_agg(s.id), '{}'::uuid[]) into picked from (
    select a.id from attendees a
     where a.event_id = p_event_id
       and exists (select 1 from checkins c where c.attendee_id = a.id and c.checkpoint_id = p_checkpoint_id)
       -- category_matches treats an empty list as "everyone", so an empty exclude list is guarded.
       and not (coalesce(array_length(p_exclude, 1), 0) > 0 and category_matches(p_exclude, a.category))
       and not exists (
         select 1 from draw_winners w
          where w.event_id = p_event_id and w.attendee_id = a.id and not w.void)
       and not exists (
         select 1 from draw_winners w
          where w.game_id = p_game_id and w.prize_no is not distinct from p_prize_no
            and w.attendee_id = a.id and w.void)
     order by gen_random_uuid()
     limit greatest(p_count, 0)
  ) s;

  insert into draw_winners (event_id, game_id, run_id, prize_no, attendee_id)
  select p_event_id, p_game_id, p_run_id, p_prize_no, unnest(picked);

  select coalesce(array_agg(k.id order by k.n), '{}'::uuid[]) into kept
    from unnest(coalesce(p_keep, '{}'::uuid[])) with ordinality k(id, n)
   where exists (
     select 1 from draw_winners w
      where w.game_id = p_game_id and w.prize_no is not distinct from p_prize_no
        and w.attendee_id = k.id and not w.void)
     and not k.id = any(picked);

  update game_stage
     set run_id = p_run_id, game_id = p_game_id, phase = p_phase,
         phase_ends_at = case when p_phase = 'draw_spinning' then p_spin_ends_at end,
         phase_data = coalesce(p_extra, '{}'::jsonb)
                      || jsonb_build_object('prize_no', p_prize_no, 'winner_ids', to_jsonb(kept || picked),
                                            'new_ids', to_jsonb(picked), 'pool_at', now())
   where event_id = p_event_id;
  return picked;
end;
$$;

-- A card round's pick (D317, D320): the participant on stage takes card p_card_no of this run's
-- deck. Only once their reel has stopped (2 s allowed for the app's and the database's clocks
-- disagreeing), only a card inside the deck and not yet taken, only for the stage's current,
-- card-less winner. Moves the stage to the flip. Null when refused; the version does not move.
create function card_pick(
  p_event_id uuid, p_expected int, p_run_id uuid, p_game_id uuid, p_attendee_id uuid, p_card_no int
) returns int
language plpgsql
as $$
declare
  s game_stage%rowtype;
  d int[];
  prize int;
begin
  select r.deck into d from game_runs r join games g on g.id = r.game_id
   where r.id = p_run_id and r.event_id = p_event_id
     and g.id = p_game_id and g.event_id = p_event_id
     and g.kind = 'draw' and g.config->>'format' = 'cards';
  if d is null or p_card_no is null or p_card_no < 1 or p_card_no > coalesce(array_length(d, 1), 0) then
    return null;
  end if;
  -- Locks the stage row: two consoles tapping a card at once take turns, and the second sees
  -- the version moved.
  select * into s from game_stage where event_id = p_event_id for update;
  if not found
     or s.version <> p_expected
     or s.run_id is distinct from p_run_id or s.game_id is distinct from p_game_id
     or s.phase <> 'draw_spinning' or coalesce(s.phase_data->>'cards', 'false') <> 'true'
     or s.phase_ends_at is null or now() + interval '2 seconds' < s.phase_ends_at
     or not (coalesce(s.phase_data->'winner_ids', '[]'::jsonb) ? p_attendee_id::text) then
    return null;
  end if;
  if exists (select 1 from draw_winners where run_id = p_run_id and card_no = p_card_no and not void) then
    return null;
  end if;
  update draw_winners set card_no = p_card_no, prize_no = d[p_card_no]
   where game_id = p_game_id and run_id = p_run_id and attendee_id = p_attendee_id
     and not void and card_no is null and prize_no is null
  returning prize_no into prize;
  if prize is null then return null; end if;
  update game_stage
     set phase = 'draw_card_reveal', phase_ends_at = null, version = version + 1, updated_at = now(),
         phase_data = jsonb_build_object('cards', true, 'prize_no', prize, 'card_no', p_card_no,
                                         'winner_ids', jsonb_build_array(p_attendee_id), 'new_ids', '[]'::jsonb)
   where event_id = p_event_id;
  return prize;
end;
$$;

revoke execute on function draw_spin(uuid, int, uuid, uuid, int, int, uuid, text[], timestamptz, uuid[], text, jsonb) from public, anon, authenticated;
grant execute on function draw_spin(uuid, int, uuid, uuid, int, int, uuid, text[], timestamptz, uuid[], text, jsonb) to service_role;
revoke execute on function card_pick(uuid, int, uuid, uuid, uuid, int) from public, anon, authenticated;
grant execute on function card_pick(uuid, int, uuid, uuid, uuid, int) to service_role;

-- Background videos (D300): up to 30 MB, uploaded straight from the browser with a signed URL.
-- Images keep their 4 MB gate in the app (src/lib/storage.ts acceptImage).
update storage.buckets
   set file_size_limit = 31457280,
       allowed_mime_types = array['image/png','image/jpeg','image/jpg','image/webp','image/svg+xml','video/mp4','video/webm']
 where id = 'event-media';
