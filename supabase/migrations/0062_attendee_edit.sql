-- D391 — organisers can let attendees edit their own submissions, on the day they sent them.
-- Off by default, so every form keeps today's rule (D166: what was sent stays as sent).
-- The attendee's own stamp is separate from the organiser's (edited_at/edited_by, D337), which
-- names an auth user and reads as "Updated by the organiser" everywhere it shows.

alter table activities add column attendee_edit boolean not null default false;
alter table activity_submissions add column attendee_edited_at timestamptz;
