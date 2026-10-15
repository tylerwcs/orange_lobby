-- Scheduled opening (D600-D609): an organiser sets when a closed activity opens, and a
-- one-minute timer opens it. Attendees see it as Coming soon until then (D603).
alter table activities add column opens_at timestamptz;

-- D600: only a closed activity carries a schedule. Without this, an activity closed while a
-- stale past opens_at was still on it would be reopened by the timer a minute later.
alter table activities add constraint activities_open_unscheduled check (not is_open or opens_at is null);

create index activities_opens_at_due_idx on activities (opens_at) where opens_at is not null and not is_open;

-- D601: opens every due activity, outside archived events, exactly as the Open switch would,
-- and clears its schedule. Returns how many it opened. A function rather than a bare UPDATE in
-- the job so scripts/scheduled-open-db-check.mjs can run it without waiting for the clock.
create or replace function open_scheduled_activities() returns integer
language sql
as $$
  with opened as (
    update activities a set is_open = true, opens_at = null
    from events e
    where e.id = a.event_id and e.status <> 'archived'
      and not a.is_open and a.opens_at is not null and a.opens_at <= now()
    returning a.id
  )
  select count(*)::int from opened;
$$;

-- Only the timer (postgres) and the service role run it; nothing in the browser should.
revoke execute on function open_scheduled_activities() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('open-scheduled-activities', '* * * * *', $$select open_scheduled_activities()$$);
