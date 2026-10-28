-- Portal popups (spec 2026-10-28-portal-popups-design.md, D757): an organiser-written message
-- that pops up each time an attendee opens their portal, until they have done what it asks.
-- Like every table here: RLS on, no policies, only the service role reads or writes it.
create table if not exists public.portal_popups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  heading text not null,
  message_html text not null,
  button_label text not null,
  -- The situation it shows in. One today: the attendee hasn't done activity_id. Widen the check to add one.
  trigger_kind text not null default 'not_done' check (trigger_kind in ('not_done')),
  activity_id uuid references public.activities(id) on delete cascade,
  is_on boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  check (trigger_kind <> 'not_done' or activity_id is not null)
);
create index if not exists portal_popups_event on public.portal_popups (event_id, sort_order);
create index if not exists portal_popups_activity on public.portal_popups (activity_id);
alter table public.portal_popups enable row level security;
