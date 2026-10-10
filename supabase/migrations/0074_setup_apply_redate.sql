-- Fix to 0073's setup_apply_agenda (D455). Days were re-dated one row at a time, but agenda_days
-- has a non-deferrable unique (event_id, date): a one-day postponement (10, 11, 12 -> 11, 12, 13)
-- or a swap of two days failed midway with 23505. Dates now move in two passes, through
-- placeholder dates that are unique per row. The placeholder pass is safe with the day triggers
-- of 0038: agenda_days_move_items copies the new date onto the day's rows, and
-- agenda_items_sync_day (day_id unchanged, day changed) resolves that date straight back to this
-- same day, which already holds it, so each pass behaves like any single re-date.
--
-- Also defence in depth on the deletes: an item delete removes only a plain session (kind session,
-- no slot), and a day delete removes only a day with nothing left on it. Day deletes now run after
-- the sessions have been moved and added (the plan can move a session off a day it removes, which
-- the cascade would otherwise have deleted along with the day); a day removed that way gives up its
-- date first, to a placeholder, so its date is free for the rows above. If a removed day still has
-- a row on it at the end, the whole Apply is refused rather than leave it on a placeholder date.
create or replace function setup_apply_agenda(p_event uuid, p_plan jsonb, p_map jsonb, p_reviewed_at timestamptz, p_submitted jsonb)
returns boolean language plpgsql set search_path = public as $$
declare
  v_org uuid;
  r jsonb;
  gone uuid;
  n int := 0;
begin
  select org_id into v_org from events where id = p_event;
  if v_org is null then raise exception 'event % not found', p_event; end if;

  -- Sessions the plan removes go first: only a plain session (kind session, no slot).
  delete from agenda_items where event_id = p_event and kind = 'session' and slot is null
    and id in (select (jsonb_array_elements_text(coalesce(p_plan->'items'->'delete', '[]')))::uuid);

  -- Days. A new date moves the day's rows with it (agenda_days_move_items, D194). Two passes, so a
  -- shift or a swap never meets another day's date half way: first every re-dated day, and every
  -- day about to be deleted, to a placeholder date of its own; then the real dates.
  for r in select * from jsonb_array_elements(coalesce(p_plan->'days'->'update', '[]')) loop
    if r ? 'date' then
      n := n + 1;
      update agenda_days set date = date '1900-01-01' + n
      where id = (r->>'id')::uuid and event_id = p_event;
    end if;
  end loop;
  for gone in select (jsonb_array_elements_text(coalesce(p_plan->'days'->'delete', '[]')))::uuid loop
    n := n + 1;
    update agenda_days set date = date '1900-01-01' + n where id = gone and event_id = p_event;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p_plan->'days'->'update', '[]')) loop
    update agenda_days set
      date = case when r ? 'date' then (r->>'date')::date else date end,
      name = case when r ? 'name' then r->>'name' else name end
    where id = (r->>'id')::uuid and event_id = p_event;
  end loop;
  insert into agenda_days (id, org_id, event_id, date, name)
  select (d->>'id')::uuid, v_org, p_event, (d->>'date')::date, d->>'name'
  from jsonb_array_elements(coalesce(p_plan->'days'->'insert', '[]')) d;

  -- Sessions: only the fields a plan names are written, so an admin's edit to any other survives.
  for r in select * from jsonb_array_elements(coalesce(p_plan->'items'->'update', '[]')) loop
    update agenda_items set
      day_id      = case when r ? 'day_id'      then (r->>'day_id')::uuid else day_id end,
      starts_at   = case when r ? 'starts_at'   then (r->>'starts_at')::time else starts_at end,
      ends_at     = case when r ? 'ends_at'     then (r->>'ends_at')::time else ends_at end,
      title       = case when r ? 'title'       then r->>'title' else title end,
      description = case when r ? 'description' then r->>'description' else description end,
      location    = case when r ? 'location'    then r->>'location' else location end
    where id = (r->>'id')::uuid and event_id = p_event and kind = 'session' and slot is null;
  end loop;
  insert into agenda_items (id, org_id, event_id, day_id, kind, starts_at, ends_at, title, description, location, sort_order)
  select (i->>'id')::uuid, v_org, p_event, (i->>'day_id')::uuid, 'session', (i->>'starts_at')::time, (i->>'ends_at')::time,
    i->>'title', i->>'description', i->>'location', (i->>'sort_order')::int
  from jsonb_array_elements(coalesce(p_plan->'items'->'insert', '[]')) i;

  -- Days the plan removes, now that nothing it keeps is on them.
  delete from agenda_days where event_id = p_event
    and not exists (select 1 from agenda_items i where i.day_id = agenda_days.id)
    and id in (select (jsonb_array_elements_text(coalesce(p_plan->'days'->'delete', '[]')))::uuid);
  if exists (select 1 from agenda_days where event_id = p_event
    and id in (select (jsonb_array_elements_text(coalesce(p_plan->'days'->'delete', '[]')))::uuid)) then
    raise exception 'a day the plan removes still has sessions on it';
  end if;

  update agenda_items a set sort_order = (o->>'sort_order')::int
  from jsonb_array_elements(coalesce(p_plan->'order', '[]')) o
  where a.id = (o->>'id')::uuid and a.event_id = p_event;

  -- The map always lands with the rows it names. The snapshot only for the version reviewed.
  update event_setup_sections set applied_map = p_map where event_id = p_event and section = 'agenda';
  update event_setup_sections set applied = p_submitted, applied_at = now()
  where event_id = p_event and section = 'agenda' and submitted_at = p_reviewed_at;
  return found;
end $$;

revoke execute on function setup_apply_agenda(uuid, jsonb, jsonb, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function setup_apply_agenda(uuid, jsonb, jsonb, timestamptz, jsonb) to service_role;
