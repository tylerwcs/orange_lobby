-- A change an attendee has asked for and the desk has not yet decided.
--
-- Its own table rather than a flag on the booking (D142). `activity_bookings` keeps meaning
-- exactly one thing — a seat somebody holds — which is what every count in this feature
-- reads, and a cancel request has nowhere to live on a row that is about to disappear.
-- The deciding reason is that a request is a RECORD: when somebody asks in November why a
-- room seated nineteen, the answer is a row naming who asked, for what, who decided, and
-- when.
--
-- The booking itself does not move while a request is pending (D143), so nothing here
-- affects any count until an approval calls switch_session or cancel_booking.
create table activity_change_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,
  kind text not null check (kind in ('switch', 'cancel')),
  -- The booking they hold now. Cascades, so deleting a session takes its pending requests
  -- with it exactly as it takes its bookings (D135).
  from_session_id uuid not null references activity_sessions(id) on delete cascade,
  -- Where they want to go; null for a cancel. The check below makes that structural rather
  -- than a convention somebody has to remember.
  to_session_id uuid references activity_sessions(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  -- Who decided, the same way checkins records scanned_by (D155). scannerNames() in
  -- src/lib/db/users.ts already resolves these to emails.
  decided_by uuid references auth.users(id),
  check ((kind = 'switch' and to_session_id is not null)
      or (kind = 'cancel' and to_session_id is null))
);

-- One open request per attendee per activity (D146), in the database rather than in the
-- action. Two tabs is exactly when application-side uniqueness fails, and this is the same
-- reasoning as `unique (attendee_id, session_id)` on activity_bookings.
create unique index activity_change_requests_one_open
  on activity_change_requests (attendee_id, activity_id)
  where status = 'pending';

-- The desk's queue: one activity's pending rows, oldest first.
create index activity_change_requests_activity_idx
  on activity_change_requests (activity_id, status, created_at);

-- The portal's hot path: this attendee's own requests.
create index activity_change_requests_attendee_idx
  on activity_change_requests (attendee_id, status);

-- Enabled with no policies, as every table since 0001_init.sql: only the service role,
-- which bypasses RLS, may touch data. The anon key travels in the client bundle.
alter table activity_change_requests enable row level security;
