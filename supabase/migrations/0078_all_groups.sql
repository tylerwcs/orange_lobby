-- Groups page with All groups (spec 2026-10-13-all-groups-design.md, D506–D515). Two additive
-- columns; no existing row changes meaning.

-- D506: one optional picture per group, a public MEDIA_BUCKET URL like the other event images.
alter table public.event_groups add column if not exists image_url text;

-- D507: the All groups tab. Off by default, so every event keeps the page it has today until
-- an admin turns it on. group_tile still hides the whole tile and page.
alter table public.events add column if not exists all_groups boolean not null default false;
