-- D441, D442: the organiser setup link and what organisers submit through it. Adds one column
-- and one table; no existing row or policy changes.

-- D441: one private link per event. Null means the link is off. Unique, like crew_token, so a
-- token alone names one event.
alter table public.events add column setup_token text unique;

-- D442: one row per event and section. `answers` is the organiser's working copy, `submitted`
-- the snapshot taken at Submit, `applied` the snapshot taken at Apply. Status is worked out
-- from the three, never stored. `rev` guards autosave against two people saving at once.
create table public.event_setup_sections (
  event_id     uuid not null references public.events (id) on delete cascade,
  section      text not null check (section in ('basics', 'agenda', 'info')),
  answers      jsonb not null default '{}'::jsonb,
  submitted    jsonb,
  applied      jsonb,
  applied_map  jsonb not null default '{}'::jsonb,
  rev          int not null default 1 check (rev >= 1),
  submitted_at timestamptz,
  applied_at   timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (event_id, section)
);
-- Read and written only by the server with the service role: no policies on purpose.
alter table public.event_setup_sections enable row level security;
