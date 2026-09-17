-- Contract step: the columns migration 0014 emptied into `extra` are dropped.
--
-- IRREVERSIBLE. Every value these columns held that agreed with `extra` was already covered by
-- 0014 and this section's own verification (see docs/runbook.md, "Attendee fields: contract
-- (migration 0015)", for the nine queries — the counts and the three value-divergence checks —
-- that must be re-run and checked immediately before this runs, and the backup step that must
-- come before that). After this, `extra` is the only copy that survives: recovering a mistake
-- means a database restore, not a re-read.
--
-- Run this AFTER the code that stops naming these columns is deployed and confirmed live. Every
-- read path is safe either way — nothing has read a column since the expand step — but
-- purgeAttendeePersonalData in a build older than the one retiring these columns still names
-- phone and company in its update, so dropping first breaks purge for archived events until
-- that deploy lands.
--
-- Wrapped in a transaction so a dropped connection mid-run leaves the schema exactly as it was,
-- not half-contracted. Not idempotent: a second run fails with `column "company" of relation
-- "attendees" does not exist` — that failure is what success looks like the second time. The
-- runbook's information_schema check is the authority on whether this ran, not this output.

begin;

alter table attendees
  drop column company,
  drop column phone,
  drop column table_no;

-- The concept that gated those three. Nothing has read it since the expand step.
alter table events drop column collected_fields;

commit;
