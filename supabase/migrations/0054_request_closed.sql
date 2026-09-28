-- D343: a check-in at a booking door closes a pending change or cancel request for that session's
-- day, and the scanner's undo reopens it. 'closed' says the system settled it - not the attendee
-- ('withdrawn') and not the committee ('approved' / 'declined').
alter table activity_change_requests drop constraint activity_change_requests_status_check;
alter table activity_change_requests add constraint activity_change_requests_status_check
  check (status in ('pending', 'approved', 'declined', 'withdrawn', 'closed'));
