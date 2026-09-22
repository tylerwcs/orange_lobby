create table forms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  description text,
  -- The same jsonb shape events.registration_questions holds, validated by the same zod
  -- schema against a wider type allowlist (D164).
  questions jsonb not null default '[]'::jsonb,
  -- Flipped by hand. No scheduled close, exactly as D127 decided for activities.
  submissions_open boolean not null default false,
  -- Null or empty means everyone, the same rule as agenda_items and activities.
  categories text[],
  -- The TOTAL a person may ever submit to this form. Null means no total limit.
  max_per_attendee int check (max_per_attendee is null or max_per_attendee between 1 and 366),
  -- At most one submission per Malaysian calendar day, on top of any total (D171).
  per_day boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table form_submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  form_id uuid not null references forms(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,
  -- { question key -> answer }. A `file` answer holds an OBJECT PATH, not a URL (D167).
  answers jsonb not null default '{}'::jsonb,
  -- The Malaysian calendar day this counts against (D165).
  submitted_on date not null,
  -- Room for the review queue that is not being built yet (D170).
  status text not null default 'submitted',
  -- Denormalised from the form so the partial unique index below needs no join (D165).
  per_day boolean not null,
  created_at timestamptz not null default now()
);

create unique index form_submissions_one_a_day
  on form_submissions (form_id, attendee_id, submitted_on)
  where per_day;

create index form_submissions_form_idx on form_submissions (form_id, submitted_on desc);
create index form_submissions_attendee_idx on form_submissions (attendee_id);
create index forms_event_idx on forms (event_id, sort_order);

alter table forms enable row level security;
alter table form_submissions enable row level security;
-- No policies, as every table since 0001_init.sql: only the service role may touch data.
