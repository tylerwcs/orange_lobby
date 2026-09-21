-- Activities an attendee books a seat in, rather than one an organiser assigns them to.
--
-- Breakouts (0007) are the assigned case: the organiser reads a spreadsheet column and places
-- people. This is the chosen case, and the difference that forces new tables rather than more
-- columns on agenda_items is policy — `required`, `booking_open`, `max_per_attendee` and
-- `categories` belong to the activity as a whole, and a breakout round is only a text label on
-- each room with nowhere to put them (D122).
create table activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  description text,
  -- Required means AT LEAST ONE booking in this activity, never max_per_attendee of them (D129).
  required boolean not null default false,
  -- Flipped by hand; there is deliberately no scheduled close (D127).
  booking_open boolean not null default false,
  max_per_attendee int not null default 1 check (max_per_attendee between 1 and 10),
  -- Same shape and same rule as agenda_items.categories: null or empty means everyone (D131).
  categories text[],
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table activity_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade,
  title text not null,
  day date not null,
  starts_at time not null,
  ends_at time,
  location text,
  capacity int not null check (capacity > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- `activity_id` is denormalised from the session for the same reason breakout_assignments
-- carries `slot` (D80, D124): the per-attendee cap is counted without a join. It brings the
-- same obligation — moving a session to another activity must update its bookings.
--
-- Deleting a session cascades its bookings (D135), matching checkpoints and breakout items.
create table activity_bookings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade,
  session_id uuid not null references activity_sessions(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Booking the same session twice is a duplicate, not a policy question. The cap of N per
  -- ACTIVITY cannot be a unique index and lives in book_session instead (D128).
  unique (attendee_id, session_id)
);

create index activities_event_idx on activities (event_id, sort_order);
create index activity_sessions_activity_idx on activity_sessions (activity_id, day, starts_at, sort_order);
create index activity_bookings_session_idx on activity_bookings (session_id);
create index activity_bookings_attendee_idx on activity_bookings (attendee_id);

-- Enabled with no policies, as every table since 0001_init.sql: only the service role, which
-- bypasses RLS, may touch data. The anon key travels in the client bundle.
alter table activities enable row level security;
alter table activity_sessions enable row level security;
alter table activity_bookings enable row level security;
