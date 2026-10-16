-- Asking to cancel needs a reason (spec amendment D613-D616).
-- D614: set with cancel_requested_at; cleared on withdraw, decline, check-in, restore and re-registering; kept on approve.
alter table public.attendees add column if not exists cancel_reason text
  check (cancel_reason is null or char_length(cancel_reason) between 1 and 500);
