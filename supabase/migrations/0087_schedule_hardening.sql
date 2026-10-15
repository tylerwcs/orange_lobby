-- Scheduled opening, hardened after its final review (D610-D612).

-- D612: the timer's function with a pinned search_path and qualified names, so nothing on the
-- caller's path can stand in for `activities` or `events`. Same body as 0086.
create or replace function public.open_scheduled_activities() returns integer
language sql
set search_path = ''
as $$
  with opened as (
    update public.activities a set is_open = true, opens_at = null
    from public.events e
    where e.id = a.event_id and e.status <> 'archived'
      and not a.is_open and a.opens_at is not null and a.opens_at <= now()
    returning a.id
  )
  select count(*)::int from opened;
$$;
revoke execute on function public.open_scheduled_activities() from public, anon, authenticated;

select cron.unschedule('open-scheduled-activities');
select cron.schedule('open-scheduled-activities', '* * * * *', $$select public.open_scheduled_activities()$$);

-- D611: the Schedule dialog's write. Sets opens_at only while the activity is still closed and
-- its event is not archived, and says why not otherwise - so an activity the timer (or another
-- organiser) opened a moment ago gets 'open', not a check-constraint error. The event row is
-- share-locked so an archive cannot slip in between the status check and the write.
create or replace function public.schedule_opening(p_activity_id uuid, p_event_id uuid, p_at timestamptz) returns text
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
  v_rows int;
begin
  select e.status into v_status from public.events e where e.id = p_event_id for share;
  if v_status is null then return 'missing'; end if;
  if v_status = 'archived' then return 'archived'; end if;

  update public.activities set opens_at = p_at
  where id = p_activity_id and event_id = p_event_id and not is_open;
  get diagnostics v_rows = row_count;
  if v_rows = 1 then return 'ok'; end if;

  if exists (select 1 from public.activities where id = p_activity_id and event_id = p_event_id) then return 'open'; end if;
  return 'missing';
end;
$$;
revoke execute on function public.schedule_opening(uuid, uuid, timestamptz) from public, anon, authenticated;

-- D610: archiving an event drops every schedule in it. An archived event's portal would
-- otherwise show "Opens <a date long past>" for good, and setting it back to Live would open
-- all of those within a minute.
create or replace function public.clear_schedules_on_archive() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.activities set opens_at = null where event_id = new.id and opens_at is not null;
  return new;
end;
$$;

create trigger events_archive_clears_schedules
after update of status on public.events
for each row
when (new.status = 'archived' and old.status is distinct from 'archived')
execute function public.clear_schedules_on_archive();
