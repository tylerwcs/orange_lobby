-- Attendees cancel their own registration (spec 2026-10-15-attendee-self-cancel-design.md, D580-D592).

-- D580: cancel marks, it does not delete. Null = active.
alter table public.attendees add column if not exists cancelled_at timestamptz;
create index if not exists attendees_event_active_idx on public.attendees (event_id) where cancelled_at is null;

-- D583: off by default; the optional cut-off is when self-cancel stops.
alter table public.events add column if not exists self_cancel boolean not null default false;
alter table public.events add column if not exists self_cancel_closes_at timestamptz;
