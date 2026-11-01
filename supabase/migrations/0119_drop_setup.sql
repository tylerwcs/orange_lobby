-- D783: the organiser setup link and page are gone (removed from the code in D783, Task 1). This drops
-- what 0071-0074 created for them: the agenda-apply function, the three setup tables (their index
-- and row-level security go with them; they never had policies) and the events.setup_token column.
-- The setup-files bucket and its files are emptied and deleted through the storage API, not here.
-- Destructive: the user saw the per-event counts and agreed on 1 Nov 2026.

-- Dropping a column and tables takes ACCESS EXCLUSIVE on events. The database also hosts live
-- events: give up after 5 s rather than queue every request behind a long lock.
set local lock_timeout = '5s';

drop function if exists public.setup_apply_agenda(uuid, jsonb, jsonb, timestamptz, jsonb);

drop table if exists public.event_setup_files, public.event_setup_items, public.event_setup_sections;

alter table public.events drop column if exists setup_token;
