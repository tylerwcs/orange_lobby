-- Covering indexes for every foreign key the Supabase performance advisor found without one.
--
-- Most of these are the columns the app actually filters on: every portal and admin page reads
-- its rows `where event_id = ...`, and the badge's arrival time reads `checkins` by attendee.
-- Without an index each of those is a scan of the whole table, which is invisible on test data
-- and grows with every attendee, booking and scan once an event is live. The rest (org_id,
-- decided_by, scanned_by, active_checkpoint_id) are rarely filtered on but are checked by
-- Postgres on every delete of the row they point to - deleting an event or a user would
-- otherwise scan each referencing table.

create index if not exists activities_org_id_idx on activities (org_id);
create index if not exists activity_bookings_activity_id_idx on activity_bookings (activity_id);
create index if not exists activity_bookings_event_id_idx on activity_bookings (event_id);
create index if not exists activity_change_requests_decided_by_idx on activity_change_requests (decided_by);
create index if not exists activity_change_requests_event_id_idx on activity_change_requests (event_id);
create index if not exists activity_change_requests_from_session_id_idx on activity_change_requests (from_session_id);
create index if not exists activity_change_requests_to_session_id_idx on activity_change_requests (to_session_id);
create index if not exists activity_sessions_event_id_idx on activity_sessions (event_id);
create index if not exists activity_submissions_event_id_idx on activity_submissions (event_id);
create index if not exists agenda_items_org_id_idx on agenda_items (org_id);
create index if not exists announcements_event_id_idx on announcements (event_id);
create index if not exists announcements_org_id_idx on announcements (org_id);
create index if not exists attendees_org_id_idx on attendees (org_id);
create index if not exists booth_stamps_org_id_idx on booth_stamps (org_id);
create index if not exists booths_org_id_idx on booths (org_id);
create index if not exists checkins_attendee_id_idx on checkins (attendee_id);
create index if not exists checkins_event_id_idx on checkins (event_id);
create index if not exists checkins_org_id_idx on checkins (org_id);
create index if not exists checkins_scanned_by_idx on checkins (scanned_by);
create index if not exists checkpoints_org_id_idx on checkpoints (org_id);
create index if not exists events_active_checkpoint_id_idx on events (active_checkpoint_id);
create index if not exists events_org_id_idx on events (org_id);
create index if not exists org_members_user_id_idx on org_members (user_id);
