-- D738: whether this event's portal offers Bahasa Malaysia beside English. Off: no switcher, and
-- the portal reads English whatever a device picked elsewhere. Only the app's own wording
-- changes; anything the organiser typed shows as typed.
alter table public.events add column if not exists language_switch boolean not null default false;
