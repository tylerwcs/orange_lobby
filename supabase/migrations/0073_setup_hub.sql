-- D458, D459: files and a note on every setup checklist item. D455: the agenda's Apply as one
-- function. Adds two tables, one bucket and one function; no existing row or policy changes.

-- D458: one row per event and checklist item, made with its first file or note. Status is worked
-- out from updated_at and handled_at (and the item's files), never stored.
create table public.event_setup_items (
  event_id   uuid not null references public.events (id) on delete cascade,
  item_key   text not null check (length(item_key) between 1 and 80),
  notes      text not null default '' check (length(notes) <= 4000),
  updated_at timestamptz not null default now(),
  handled_at timestamptz,
  primary key (event_id, item_key)
);
alter table public.event_setup_items enable row level security;

-- D459: one row per file an organiser sent. The object lives in the setup-files bucket at `path`.
create table public.event_setup_files (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  item_key     text not null check (length(item_key) between 1 and 80),
  path         text not null unique,
  name         text not null check (length(name) between 1 and 200),
  size_bytes   bigint not null check (size_bytes > 0),
  content_type text not null,
  uploaded_at  timestamptz not null default now()
);
create index event_setup_files_item_idx on public.event_setup_files (event_id, item_key, uploaded_at);
-- Read and written only by the server with the service role: no policies on purpose.
alter table public.event_setup_files enable row level security;

-- D459: private, like form-uploads (0027): attendee lists are personal data. Reads go through
-- one-minute signed links; writes through signed upload URLs the server mints.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'setup-files', 'setup-files', false,
  26214400, -- 25 MB, SETUP_FILE_MAX_BYTES in src/features/setup/hub.ts
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint',
    'text/plain', 'image/png', 'image/jpeg', 'image/webp'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- D451, D455: an organiser's agenda is applied in one transaction: its days and sessions, the
-- applied_map and the applied snapshot commit together or not at all. The plan is worked out in
-- the app (src/features/setup/sections/agenda-apply.ts); this only runs it. It writes only the
-- fields the Agenda step owns (D453) and every write is scoped to p_event.
create or replace function setup_apply_agenda(p_event uuid, p_plan jsonb, p_map jsonb, p_reviewed_at timestamptz, p_submitted jsonb)
returns boolean language plpgsql set search_path = public as $$
declare
  v_org uuid;
  r jsonb;
begin
  select org_id into v_org from events where id = p_event;
  if v_org is null then raise exception 'event % not found', p_event; end if;

  -- Deletes first, so a date they free can be used below. The plan deletes only a day nothing else is on.
  delete from agenda_items where event_id = p_event
    and id in (select (jsonb_array_elements_text(coalesce(p_plan->'items'->'delete', '[]')))::uuid);
  delete from agenda_days where event_id = p_event
    and id in (select (jsonb_array_elements_text(coalesce(p_plan->'days'->'delete', '[]')))::uuid);

  -- Days. A new date moves the day's rows with it (agenda_days_move_items, D194).
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
