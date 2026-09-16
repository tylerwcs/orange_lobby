-- Event images (logo, banner, floor plan) move from pasted links to uploaded files.
--
-- One public bucket holds them all. Public because the portal is open to anyone with the
-- link and the images are rendered in plain <img> tags; no read policy is needed for a
-- public bucket, and no write policy is wanted — uploads go through a Server Action using
-- the service role, which bypasses RLS, so the anon key can never write here.
--
-- The columns do not change: events.logo_url, events.banner_url and the floor_plan tile's
-- url still hold plain URLs. Only where those URLs point has changed, which is why every
-- link pasted before this migration keeps rendering until someone uploads over it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-media',
  'event-media',
  true,
  4194304, -- 4 MB, the same cap src/lib/storage.ts enforces before the upload starts
  array['image/png','image/jpeg','image/jpg','image/webp','image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
