-- D633: the event name with the organiser's line breaks, for the big headings attendees see. Null = name.
alter table public.events add column if not exists display_name text;
-- D634: the QR on the "You're in" page, off unless the organiser turns it on.
alter table public.events add column if not exists registration_show_qr boolean not null default false;
