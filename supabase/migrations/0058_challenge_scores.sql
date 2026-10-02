-- D375: the one read scoring needs - live km per person, team and day, inside the challenge
-- dates. Summed in Postgres so the app gets ~7,400 small rows, not every entry's answers.
-- D380: disqualifications, one row per person per challenge; Undo deletes the row.

create table challenge_disqualifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (activity_id, attendee_id)
);
alter table challenge_disqualifications enable row level security;

create or replace function challenge_daily_totals(p_activity_id uuid)
returns table (attendee_id uuid, group_id uuid, day date, km numeric)
language sql
stable
as $$
  select s.attendee_id, s.group_id, s.submitted_on,
         sum(case when s.answers->>(a.scoring->>'metric_key') ~ '^\d+(\.\d+)?$'
                  then (s.answers->>(a.scoring->>'metric_key'))::numeric else 0 end)
    from activity_submissions s
    join activities a on a.id = s.activity_id
   where s.activity_id = p_activity_id
     and s.status = 'submitted'
     and a.scoring is not null
     and s.submitted_on between (a.scoring->>'starts_on')::date and (a.scoring->>'ends_on')::date
   group by s.attendee_id, s.group_id, s.submitted_on
$$;

revoke execute on function challenge_daily_totals(uuid) from public, anon, authenticated;
grant execute on function challenge_daily_totals(uuid) to service_role;
