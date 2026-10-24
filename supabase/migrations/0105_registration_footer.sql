-- D720: an image shown full width under the registration page, at its own height, such as a
-- client's disclaimer. Null = none.
alter table public.events add column if not exists registration_footer_url text;
