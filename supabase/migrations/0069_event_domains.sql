-- D423: an event's addresses. One is primary and is used for links; the rest forward to it.
-- Adds a table and nothing else: no existing table, row or policy changes.
create table public.event_domains (
  domain     text primary key check (domain = lower(domain) and domain !~ '[^a-z0-9.-]' and domain like '%.%'),
  event_id   uuid not null references public.events (id) on delete cascade,
  org_id     uuid not null references public.organisations (id),
  is_primary boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index event_domains_one_primary on public.event_domains (event_id) where is_primary;
create index event_domains_event on public.event_domains (event_id);
-- Read and written only by the server with the service role: no policies on purpose.
alter table public.event_domains enable row level security;
