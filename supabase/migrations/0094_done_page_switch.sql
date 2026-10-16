-- D634 (amended): the whole "You're in" page is the organiser's choice, off by default - without it,
-- registering lands straight on the attendee's own event page. Replaces 0093's QR-only switch;
-- registration_show_qr is dropped once this deploy is live (the previous deploy still writes it).
alter table public.events add column if not exists registration_done_page boolean not null default false;
