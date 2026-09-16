-- One shared link per event, so a second person can work a door without an admin login (D104).
--
-- Nullable: an event has no crew link until an admin mints one. Unique across the table rather
-- than per event, because it is looked up on its own before any event is known — the same reason
-- booths.token is.
--
-- There is deliberately no expiry column. The link's life is computed from the event's own dates
-- (D106): a stored expiry would be a second date to keep in step, and it would be wrong the first
-- time somebody moved the event.
alter table events add column crew_token text unique;
