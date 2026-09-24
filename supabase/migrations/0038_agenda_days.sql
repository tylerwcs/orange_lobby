-- Agenda days (D193-D197). A day is a row of its own, created before anything is put on it,
-- with a name for the portal's tab. Agenda rows point at their day, gain a kind (a session,
-- or an image with no time), and are ordered by hand within the day.

-- 1. The days. One per date per event: the portal addresses a day by its date (`?day=`), so
--    two days on one date could never both be reached.
create table if not exists agenda_days (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  event_id uuid not null references events(id) on delete cascade,
  date date not null,
  name text,
  created_at timestamptz not null default now(),
  unique (event_id, date)
);
-- Read and written only through the service client, exactly like agenda_items.
alter table agenda_days enable row level security;

-- 2. One unnamed day per date already in use. Unnamed days are labelled by their date, so
--    nothing an attendee sees changes until an organiser names one.
insert into agenda_days (org_id, event_id, date)
select distinct org_id, event_id, day from agenda_items
on conflict (event_id, date) do nothing;

-- 3. Every row onto its day.
alter table agenda_items add column if not exists day_id uuid references agenda_days(id) on delete cascade;
update agenda_items i set day_id = d.id
from agenda_days d
where d.event_id = i.event_id and d.date = i.day and i.day_id is null;
alter table agenda_items alter column day_id set not null;

-- 4. Kinds (D196). An image row has no time; a session still must have one.
alter table agenda_items add column if not exists kind text not null default 'session';
alter table agenda_items add constraint agenda_items_kind_check check (kind in ('session', 'image'));
alter table agenda_items alter column starts_at drop not null;
alter table agenda_items add constraint agenda_items_session_has_time check (kind = 'image' or starts_at is not null);
alter table agenda_items add constraint agenda_items_image_has_url check (kind = 'session' or image_url is not null);

-- 5. Hand order (D197), seeded from the order attendees see today: by time, then the old
--    sort_order, then creation. A breakout round is one row, placed at its earliest room, and
--    every room of it gets the same number.
with keyed as (
  select id, day_id, starts_at, sort_order, created_at,
    case when nullif(trim(slot), '') is not null then 'slot:' || trim(slot) else 'item:' || id::text end as row_key
  from agenda_items
), led as (
  select id, day_id, row_key,
    first_value(starts_at) over w as lead_starts,
    first_value(sort_order) over w as lead_sort,
    first_value(created_at) over w as lead_created
  from keyed
  window w as (partition by day_id, row_key order by starts_at, sort_order, created_at)
), ranked as (
  select id, (dense_rank() over (partition by day_id order by lead_starts, lead_sort, lead_created, row_key)) * 10 as new_order
  from led
)
update agenda_items i set sort_order = r.new_order from ranked r where r.id = i.id;

-- 6a. The row's date is a copy of its day's (D194), and a write from code that predates days
--     - carrying a date and no day_id, or changing the date on an existing row - is resolved
--     to the day for that date, which is created if missing (D195).
create or replace function agenda_items_sync_day() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.day_id is not distinct from old.day_id and new.day is distinct from old.day then
    new.day_id := null;
  end if;
  if new.day_id is null then
    insert into agenda_days (org_id, event_id, date) values (new.org_id, new.event_id, new.day)
    on conflict (event_id, date) do nothing;
    select id into new.day_id from agenda_days where event_id = new.event_id and date = new.day;
  end if;
  select date into new.day from agenda_days where id = new.day_id and event_id = new.event_id;
  if new.day is null then
    raise exception 'agenda day % does not belong to event %', new.day_id, new.event_id;
  end if;
  return new;
end $$;

drop trigger if exists agenda_items_sync_day on agenda_items;
create trigger agenda_items_sync_day before insert or update of day_id, day on agenda_items
for each row execute function agenda_items_sync_day();

-- 6b. Re-dating a day moves its rows with it (D194). Their day_id is unchanged, so the
--     trigger above resolves the new date straight back to this same day.
create or replace function agenda_days_move_items() returns trigger
language plpgsql set search_path = public as $$
begin
  update agenda_items set day = new.date where day_id = new.id;
  return new;
end $$;

drop trigger if exists agenda_days_move_items on agenda_days;
create trigger agenda_days_move_items after update of date on agenda_days
for each row when (old.date is distinct from new.date) execute function agenda_days_move_items();

-- 7. Indexes for the new reads: a day's rows in order, and the event's agenda in order.
drop index if exists agenda_items_event_day_idx;
create index if not exists agenda_items_event_order_idx on agenda_items (event_id, day, sort_order);
create index if not exists agenda_items_day_order_idx on agenda_items (day_id, sort_order);
