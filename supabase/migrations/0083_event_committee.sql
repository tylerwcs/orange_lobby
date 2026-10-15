-- Event committee access (spec 2026-10-15-event-committee-access-design.md, D550-D564).

-- D558: one row per person per event. The row carries its one live link; a new link overwrites
-- link_token, which is what cancels the old one. Removed rows are kept (removed_at), so "done by"
-- history and re-adds stay readable.
create table if not exists public.event_committee (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  email text not null check (email = lower(btrim(email))),
  user_id uuid references auth.users(id) on delete set null,
  added_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  accepted_at timestamptz,
  removed_at timestamptz,
  link_token text unique,
  link_kind text check (link_kind in ('setup', 'reset')),
  link_expires_at timestamptz
);
create unique index if not exists event_committee_active_email on public.event_committee (event_id, email) where removed_at is null;
create index if not exists event_committee_active_user on public.event_committee (user_id) where removed_at is null;
-- Like every table here: RLS on, no policies, only the service role reads it.
alter table public.event_committee enable row level security;

-- D559: the set-up link has to know whether a login already exists for an email. The Auth admin
-- API has no lookup by email, so this reads auth.users directly, for the service role only.
create or replace function public.auth_user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1
$$;
revoke all on function public.auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.auth_user_id_by_email(text) to service_role;
