-- D434, D436: an event's add-ons and its custom modules. Adds two tables and backfills the
-- first; no existing table, row or policy changes.

-- D434: one row per add-on an event has. Base features are always on and never stored, and
-- `custom` is never stored either: an event has it when it has a custom module (D436).
create table public.event_features (
  event_id   uuid not null references public.events (id) on delete cascade,
  feature    text not null check (feature in ('whatsapp', 'booking', 'engagement', 'live_games', 'lucky_draw', 'custom_domain', 'slido')),
  created_at timestamptz not null default now(),
  primary key (event_id, feature)
);
-- Read and written only by the server with the service role: no policies on purpose.
alter table public.event_features enable row level security;

-- D436: bespoke work sold with an event. Nothing in the code is gated by these.
create table public.event_custom_modules (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations (id),
  event_id    uuid not null references public.events (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 2000),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index event_custom_modules_event on public.event_custom_modules (event_id, sort_order);
alter table public.event_custom_modules enable row level security;

-- D435: every event that exists today keeps every add-on, so nothing disappears when gating
-- arrives. Events created after this start with none.
insert into public.event_features (event_id, feature)
select e.id, f.feature
from public.events e
cross join (values ('whatsapp'), ('booking'), ('engagement'), ('live_games'), ('lucky_draw'), ('custom_domain'), ('slido')) as f (feature)
on conflict do nothing;
