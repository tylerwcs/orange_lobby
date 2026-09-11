-- A checkpoint is a moment on a date, not a whole day: one event day can hold
-- registration in the morning, lunch at noon and a dinner door in the evening.
-- Without a date, several checkpoints on the same day are indistinguishable in the
-- admin filters and in the crew's chooser.
--
-- Added `not null` with no default because the table was empty when this shipped.
-- Against a populated table this would need a backfill first, e.g. set every existing
-- checkpoint to the event's starts_on, then add the constraint.
alter table checkpoints add column day date not null;

-- The admin dashboard and the scanner both read checkpoints for one event grouped by
-- day and ordered within it.
create index checkpoints_event_day_idx on checkpoints (event_id, day, sort_order);
