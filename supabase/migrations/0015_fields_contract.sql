-- Contract step: the columns migration 0014 emptied into `extra` are dropped.
--
-- IRREVERSIBLE. Every value these columns held was copied into attendees.extra by 0014 and
-- verified there (see the runbook's six counting queries, all of which must return zero
-- before this runs). After this, `extra` is the only copy: recovering a mistake means a
-- database restore, not a re-read.
--
-- Run this AFTER the code that stops naming these columns is deployed. Every read path is
-- safe either way — nothing has read a column since the expand step — but
-- purgeAttendeePersonalData in the previous build still names phone and company in its
-- update, so dropping first breaks purge for archived events until the deploy lands.

alter table attendees
  drop column company,
  drop column phone,
  drop column table_no;

-- The concept that gated those three. Nothing has read it since the expand step.
alter table events drop column collected_fields;
