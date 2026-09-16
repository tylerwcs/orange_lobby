-- Booth Passport: a stand an attendee visits, and the chop they collect there.
--
-- A booth is deliberately NOT a checkpoint with a kind (D89). A checkpoint is a moment on a
-- date that crew work, and its `day` is `not null`; a booth stands for the whole event and has
-- no day. Sharing the table would have inherited dedupe, undo and the export for free, at the
-- price of a `kind` filter on every door-side query — activeCheckpoint(), the Overview counts,
-- the scanner's landing screen — that is invisible when forgotten and lands the crew on a booth.
create table booths (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  location text,
  -- The booth's authority to stamp (D91). Unique across the table, not per event: it is looked
  -- up on its own, before any event is known. Same alphabet and length as an attendee token.
  token text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index booths_event_idx on booths (event_id, sort_order);

-- One stamp per booth per attendee for the WHOLE event (D92): a second scan on day two is an
-- "already stamped" carrying the original time, not a second stamp.
--
-- No `scanned_by`. The scan is authorised by a booth token rather than by a user, so there is
-- no auth.users id to record; the booth is the booth_id.
create table booth_stamps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  event_id uuid not null references events(id) on delete cascade,
  booth_id uuid not null references booths(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,
  stamped_at timestamptz not null default now(),
  unique (booth_id, attendee_id)
);

create index booth_stamps_event_idx on booth_stamps (event_id);
create index booth_stamps_attendee_idx on booth_stamps (attendee_id);

alter table booths enable row level security;
alter table booth_stamps enable row level security;
-- No policies on purpose: only the service role (which bypasses RLS) may access data.

-- How many stamps fill the card, and what to say when it does (D95, D96). Null `stamps_required`
-- means "all booths", so an event that adds a booth before setting a target still behaves.
alter table events add column stamps_required int;
alter table events add column stamps_message text;
