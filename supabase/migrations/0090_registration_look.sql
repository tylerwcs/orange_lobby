-- The registration page's own look (D618-D620).
-- D618: an image shown full width above the page, at its own height. Null = none.
alter table public.events add column if not exists registration_banner_url text;
-- D619: the colour of the page's headings, #RRGGBB. Null = the usual ink.
alter table public.events add column if not exists registration_heading_color text
  check (registration_heading_color is null or registration_heading_color ~ '^#[0-9A-Fa-f]{6}$');
-- D620: the page background, #RRGGBB. Null = the usual ground.
alter table public.events add column if not exists registration_background_color text
  check (registration_background_color is null or registration_background_color ~ '^#[0-9A-Fa-f]{6}$');
