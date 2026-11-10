-- D884: a passport's personality test lives in one jsonb column, read through
-- readPassportTest (src/features/passport-test), which fills every default. Null is "no test".
alter table activities add column passport_test jsonb;

-- D882, D883: one result per guest per passport, worked out on the server from their answers.
-- `answers` keeps the picks ([{questionId, answerId}]) so a result can be explained later;
-- `holder_name` is the name they put on the passport, which never changes the attendee (D874).
-- Deleting the guest or the passport takes the result with it.
create table passport_results (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  event_id uuid not null references events(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,
  personality_id text not null,
  answers jsonb not null,
  holder_name text not null,
  created_at timestamptz not null default now(),
  unique (activity_id, attendee_id)
);

create index passport_results_activity_idx on passport_results (activity_id);

alter table passport_results enable row level security;
-- No policies on purpose: only the service role (which bypasses RLS) may access data, as booth_stamps.
