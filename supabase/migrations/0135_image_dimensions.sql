-- D895: each uploaded picture's own size in pixels, keyed by its object path in the event-media
-- bucket. The portal reads it to reserve a picture's space before the picture arrives, so a
-- poster, an Info image or a popup never pushes the page down as it loads.
--
-- Written by uploadEventImage (src/lib/db/media.ts) as it stores each image; the images uploaded
-- before this were filled in once by scripts/backfill-image-dimensions.mjs. A path with no row is
-- simply drawn at whatever shape it turns out to be.

create table if not exists public.image_dimensions (
  path text primary key,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  created_at timestamptz not null default now()
);

-- Read and written only by the service role on the server; no policies, so the anon key sees nothing.
alter table public.image_dimensions enable row level security;
