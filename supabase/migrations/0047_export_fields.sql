-- The attendee columns an organiser wants carried on every export — a Nickname column, say, on
-- the rosters and the submissions sheet — beyond the fixed Name / Email / Category each already
-- has. Keys into attendees.extra, in the order chosen. Empty by default, so every existing
-- export keeps exactly the columns it had. The Attendance export ignores it and keeps carrying
-- every column.
alter table events add column export_fields text[] not null default '{}';
