-- D634 amended: the QR-only switch from 0093 was replaced by registration_done_page (0094).
-- Applied once the 0094 deploy was live (the 0093 deploy wrote this column on Settings save).
alter table public.events drop column if exists registration_show_qr;
