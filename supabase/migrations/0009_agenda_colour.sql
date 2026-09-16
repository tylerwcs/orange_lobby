-- A colour an organiser may give a session, so a dense two-day programme can be scanned.
--
-- Free text rather than an enum: the palette is five keys defined in
-- src/lib/agenda-colours.ts, and a value outside it reads as "no colour" instead of
-- failing a row. That keeps retiring or renaming a palette entry a code change rather
-- than a migration, and a stale value can never take the agenda down on event day.
--
-- The colour carries no meaning on its own. Nothing filters on it, nothing reads it back;
-- an item with no colour renders exactly as it did before this column existed.
alter table agenda_items add column color text;
