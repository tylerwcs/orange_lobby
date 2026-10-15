-- Cancellation needs an organiser's approval (spec amendment D593-D599).
-- D593: when the attendee asked; null = no waiting request.
alter table public.attendees add column if not exists cancel_requested_at timestamptz;
-- D596: when an organiser last declined; shown to the attendee until they ask again.
alter table public.attendees add column if not exists cancel_declined_at timestamptz;
-- D598: the requests view and the sidebar badge.
create index if not exists attendees_event_cancel_requests_idx on public.attendees (event_id)
  where cancel_requested_at is not null and cancelled_at is null;
