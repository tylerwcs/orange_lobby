-- Live games (spec 2026-09-26-live-games-design.md, D250–D289): a tap race, last one standing
-- and a lucky draw, played from phones and shown on the LED. One stage row per event is the
-- single source of truth; host actions write it through compare-and-set, and timed phases move
-- on by the clock when read (resolveStage in src/lib/games/phase.ts), so nothing here runs on a
-- timer.

-- The host console's and the LED's authority (D252). Separate from each other and from
-- crew_token: the AV laptop should only be able to show, and door crew are not the stage crew.
-- Unique across the table because each is looked up on its own, before any event is known.
alter table events add column host_token text unique;
alter table events add column display_token text unique;

create table games (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  event_id uuid not null references events(id) on delete cascade,
  kind text not null check (kind in ('tap_race', 'survival', 'draw')),
  title text not null,
  -- Validated per kind in src/lib/games/config.ts. Keys may be added, never removed.
  config jsonb not null default '{}'::jsonb,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index games_event_idx on games (event_id, position);

-- One play-through. "Run again" is a new row, so every round's results are kept.
create table game_runs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  game_id uuid not null references games(id) on delete cascade,
  -- How a race's lanes were grouped for this run (D263): {"by":"solo"|"category"} or
  -- {"by":"field","key":...,"label":...}. Unused by the other kinds.
  grouping jsonb not null default '{"by":"solo"}'::jsonb,
  started_at timestamptz not null default now()
);
create index game_runs_game_idx on game_runs (game_id);

-- At most one live game per event (D250). No row is idle, at version 0.
-- game_id/run_id are SET NULL, not cascaded: deleting a game mid-play must leave a stage that
-- reads as idle (resolveStage), not a missing row that resets the version clients hold.
create table game_stage (
  event_id uuid primary key references events(id) on delete cascade,
  run_id uuid references game_runs(id) on delete set null,
  game_id uuid references games(id) on delete set null,
  phase text not null default 'idle',
  phase_data jsonb not null default '{}'::jsonb,
  phase_ends_at timestamptz,
  version int not null default 0,
  updated_at timestamptz not null default now()
);

-- One row per player per race, so 500 phones' batches never queue on a shared counter (D266).
-- lane_key is snapshotted at join (D264): editing an attendee mid-race does not move them.
create table race_taps (
  run_id uuid not null references game_runs(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,
  lane_key text not null,
  taps int not null default 0,
  last_tap_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (run_id, attendee_id)
);

-- out_at_question is written once, by survival_reveal (D272). Null = still in.
create table survival_players (
  run_id uuid not null references game_runs(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,
  out_at_question int,
  joined_at timestamptz not null default now(),
  primary key (run_id, attendee_id)
);

-- The primary key IS the one-answer-per-question rule: the first insert wins.
create table survival_answers (
  run_id uuid not null references game_runs(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,
  question_no int not null,
  choice int not null,
  answered_at timestamptz not null default now(),
  primary key (run_id, attendee_id, question_no)
);

-- void = "not here", redrawn (D281). Kept on record; excluded from "past winners".
create table draw_winners (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  game_id uuid not null references games(id) on delete cascade,
  prize_no int not null,
  attendee_id uuid not null references attendees(id) on delete cascade,
  drawn_at timestamptz not null default now(),
  void boolean not null default false
);
create index draw_winners_event_idx on draw_winners (event_id);
create index draw_winners_game_idx on draw_winners (game_id);

alter table games enable row level security;
alter table game_runs enable row level security;
alter table game_stage enable row level security;
alter table race_taps enable row level security;
alter table survival_players enable row level security;
alter table survival_answers enable row level security;
alter table draw_winners enable row level security;
-- No policies on purpose: only the service role (which bypasses RLS) may access data.

-- Compare-and-set on the stage (D261). Two crew phones pressing Next together: the first
-- moves the version on, the second's expected version is stale and it gets -1. A game or run
-- from another event (or a run of another game) is refused the same way, so a host token can
-- only ever put its own event's games on its own stage.
create or replace function game_stage_write(
  p_event_id uuid, p_expected int, p_run_id uuid, p_game_id uuid,
  p_phase text, p_phase_data jsonb, p_phase_ends_at timestamptz
) returns int
language plpgsql
as $$
declare
  v int;
begin
  if p_game_id is not null
     and not exists (select 1 from games where id = p_game_id and event_id = p_event_id) then
    return -1;
  end if;
  if p_run_id is not null
     and not exists (select 1 from game_runs
                      where id = p_run_id and event_id = p_event_id and game_id = p_game_id) then
    return -1;
  end if;
  insert into game_stage (event_id) values (p_event_id) on conflict (event_id) do nothing;
  update game_stage
     set run_id = p_run_id, game_id = p_game_id, phase = p_phase,
         phase_data = coalesce(p_phase_data, '{}'::jsonb), phase_ends_at = p_phase_ends_at,
         version = version + 1, updated_at = now()
   where event_id = p_event_id and version = p_expected
  returning version into v;
  return coalesce(v, -1);
end;
$$;

-- Adds a phone's batch of taps (D266). At most ceil(15 × seconds since this player's last
-- accepted batch), elapsed capped at 3 s, and only inside the live window plus 1.5 s grace.
-- A race stopped during its countdown has an empty window (raceStopWrite: until = from) and
-- takes nothing, not even in the grace after it. Mirrored by tapAllowance in
-- src/lib/games/race.ts; change both together.
create or replace function race_add_taps(
  p_run_id uuid, p_attendee_id uuid, p_n int, p_live_from timestamptz, p_live_until timestamptz
) returns int
language plpgsql
as $$
declare
  r race_taps%rowtype;
  elapsed double precision;
  accepted int;
begin
  if p_n is null or p_n <= 0 then return 0; end if;
  if p_live_until <= p_live_from then return 0; end if;
  if now() < p_live_from or now() > p_live_until + interval '1.5 seconds' then return 0; end if;
  select * into r from race_taps where run_id = p_run_id and attendee_id = p_attendee_id for update;
  if not found then return 0; end if;
  elapsed := least(greatest(extract(epoch from (now() - coalesce(r.last_tap_at, p_live_from))), 0), 3);
  accepted := least(p_n, ceil(15 * elapsed)::int);
  if accepted <= 0 then return 0; end if;
  update race_taps set taps = taps + accepted, last_tap_at = now()
   where run_id = p_run_id and attendee_id = p_attendee_id;
  return accepted;
end;
$$;

-- Reveals a question (D272), atomically with the stage move so a second Reveal cannot
-- eliminate twice. No answer counts as wrong. If every player still in is wrong, nobody is
-- eliminated. Mirrored by revealOutcome in src/lib/games/survival.ts; change both together.
-- Refused (-1, version untouched) until the question's deadline (phase_data.deadline, written by
-- questionWrite) plus the 1.5 s answer grace has passed: answers are still accepted until then
-- (answerAccepted), and a reveal must not eliminate a player whose in-time answer is in flight.
-- revealReadyAt in src/lib/games/phase.ts is the host console's copy of this rule. Also refused
-- when the run is not this game's, or the game not this event's survival game.
create or replace function survival_reveal(
  p_event_id uuid, p_expected int, p_run_id uuid, p_game_id uuid, p_question int, p_correct int
) returns int
language plpgsql
as $$
declare
  v int;
  alive int;
  wrong int;
  everyone boolean;
begin
  if not exists (
    select 1 from game_runs r join games g on g.id = r.game_id
     where r.id = p_run_id and r.event_id = p_event_id
       and g.id = p_game_id and g.event_id = p_event_id and g.kind = 'survival') then
    return -1;
  end if;
  update game_stage set version = version + 1, updated_at = now()
   where event_id = p_event_id and version = p_expected and run_id = p_run_id
     and game_id = p_game_id
     and phase_data ? 'deadline'
     and now() >= (phase_data->>'deadline')::timestamptz + interval '1.5 seconds'
  returning version into v;
  if v is null then return -1; end if;

  select count(*) into alive from survival_players
   where run_id = p_run_id and out_at_question is null;
  select count(*) into wrong from survival_players p
   where p.run_id = p_run_id and p.out_at_question is null
     and not exists (
       select 1 from survival_answers a
        where a.run_id = p.run_id and a.attendee_id = p.attendee_id
          and a.question_no = p_question and a.choice = p_correct);
  everyone := alive > 0 and wrong = alive;

  if not everyone and wrong > 0 then
    update survival_players p set out_at_question = p_question
     where p.run_id = p_run_id and p.out_at_question is null
       and not exists (
         select 1 from survival_answers a
          where a.run_id = p.run_id and a.attendee_id = p.attendee_id
            and a.question_no = p_question and a.choice = p_correct);
  end if;

  update game_stage
     set phase = 'survival_reveal', game_id = p_game_id, phase_ends_at = null,
         phase_data = jsonb_build_object(
           'question', p_question,
           'eliminated', case when everyone then 0 else wrong end,
           'remaining', case when everyone then alive else alive - wrong end,
           'everyone_survived', everyone)
   where event_id = p_event_id;
  return v;
end;
$$;

-- Draws winners (D278, D280), atomically with the stage move to draw_spinning so a double tap
-- cannot draw twice. Pool: checked in at the checkpoint, no part of their category excluded
-- (category_matches from 0048, so leaving out Crew also leaves out "KOM, Crew"), not already a
-- standing winner of ANY draw in this event. The game must be this event's draw and the run
-- that game's, or nothing is drawn (null). Ordered by
-- gen_random_uuid(), which draws from a cryptographic source. Mirrored by eligiblePool in
-- src/lib/games/draw.ts; change both together.
create or replace function draw_spin(
  p_event_id uuid, p_expected int, p_run_id uuid, p_game_id uuid, p_prize_no int, p_count int,
  p_checkpoint_id uuid, p_exclude text[], p_spin_ends_at timestamptz
) returns uuid[]
language plpgsql
as $$
declare
  v int;
  picked uuid[];
begin
  if not exists (
    select 1 from game_runs r join games g on g.id = r.game_id
     where r.id = p_run_id and r.event_id = p_event_id
       and g.id = p_game_id and g.event_id = p_event_id and g.kind = 'draw') then
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
     order by gen_random_uuid()
     limit greatest(p_count, 0)
  ) s;

  insert into draw_winners (event_id, game_id, prize_no, attendee_id)
  select p_event_id, p_game_id, p_prize_no, unnest(picked);

  update game_stage
     set run_id = p_run_id, game_id = p_game_id, phase = 'draw_spinning',
         phase_ends_at = p_spin_ends_at,
         phase_data = jsonb_build_object('prize_no', p_prize_no, 'winner_ids', to_jsonb(picked))
   where event_id = p_event_id;
  return picked;
end;
$$;

revoke execute on function game_stage_write(uuid, int, uuid, uuid, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function game_stage_write(uuid, int, uuid, uuid, text, jsonb, timestamptz) to service_role;
revoke execute on function race_add_taps(uuid, uuid, int, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function race_add_taps(uuid, uuid, int, timestamptz, timestamptz) to service_role;
revoke execute on function survival_reveal(uuid, int, uuid, uuid, int, int) from public, anon, authenticated;
grant execute on function survival_reveal(uuid, int, uuid, uuid, int, int) to service_role;
revoke execute on function draw_spin(uuid, int, uuid, uuid, int, int, uuid, text[], timestamptz) from public, anon, authenticated;
grant execute on function draw_spin(uuid, int, uuid, uuid, int, int, uuid, text[], timestamptz) to service_role;
