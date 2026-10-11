-- The polaroid wall (spec 2026-10-11-polaroid-wall-design.md, D471–D485): the fourth kind of
-- activity, its posts and its photo bucket. Adds three columns to activities, one table and one
-- bucket; no existing row changes.

alter table activities drop constraint if exists activities_kind_check;
alter table activities add constraint activities_kind_check
  check (kind in ('booking', 'submission', 'passport', 'polaroid'));

-- D474: the LED's link and the walk-in link, each its own token so neither opens the other.
-- `polaroid` is the kind's settings (D475); the app reads it with every default filled in.
alter table activities
  add column if not exists wall_token text unique,
  add column if not exists public_token text unique,
  add column if not exists polaroid jsonb;

create table if not exists public.polaroids (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete cascade,
  -- Null is a walk-in (D481). A deleted attendee's posts stay, unattributed.
  attendee_id uuid references public.attendees (id) on delete set null,
  -- Unique: one upload is one post, so a replayed path cannot post twice.
  photo_path  text not null unique,
  photo_w     int not null check (photo_w between 1 and 4000),
  photo_h     int not null check (photo_h between 1 and 4000),
  message     text not null default '' check (length(message) <= 80),
  stickers    jsonb not null default '[]'::jsonb
              check (jsonb_typeof(stickers) = 'array' and jsonb_array_length(stickers) <= 8),
  tilt        real not null default 0 check (tilt between -3 and 3),
  status      text not null default 'live' check (status in ('live', 'removed')),
  removed_by  text,
  removed_at  timestamptz,
  -- D480: sha-256 of a per-device cookie id, and an HMAC of the IP. Neither is reversible.
  client_key  text not null,
  ip_hash     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists polaroids_wall on public.polaroids (activity_id, status, created_at);
create index if not exists polaroids_client on public.polaroids (activity_id, client_key, created_at);
create index if not exists polaroids_ip on public.polaroids (activity_id, ip_hash, created_at);
create index if not exists polaroids_attendee on public.polaroids (attendee_id, created_at);

alter table public.polaroids enable row level security;

-- D474: public read, so the LED loads photos without signed links that change every poll. No
-- write policy: only a server-minted signed upload URL puts anything in it. 4 MB, JPEG/WebP.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('polaroids', 'polaroids', true, 4194304, array['image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
