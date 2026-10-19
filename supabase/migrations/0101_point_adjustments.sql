-- Ad hoc points (D704-D707): an organiser gives a group bonus points, or takes some away, on a
-- tournament's or a scored challenge's overall leaderboard. Each adjustment is its own row, so a
-- mistake is removed on its own. The reason is for organisers only; attendees see the points.
-- One new table; nothing existing changes.

create table if not exists public.activity_adjustments (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  group_id    uuid not null references public.event_groups (id) on delete cascade,
  points      int not null check (points between -9999 and 9999 and points <> 0),
  reason      text not null check (length(btrim(reason)) between 1 and 120),
  -- The organiser's email, as signed in when they added it.
  added_by    text,
  created_at  timestamptz not null default now()
);
create index if not exists activity_adjustments_activity on public.activity_adjustments (activity_id, created_at);
create index if not exists activity_adjustments_group on public.activity_adjustments (group_id);

alter table public.activity_adjustments enable row level security;
