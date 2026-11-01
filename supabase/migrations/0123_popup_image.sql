-- 0123: an optional picture at the top of a portal popup (D808). Shown whole, above the heading.
alter table public.portal_popups add column image_url text;
