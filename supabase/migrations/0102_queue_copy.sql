-- D708: the organiser's own wording for the "Registration is full" page, the waiting page and the
-- pending page. Null for the defaults in src/features/registration-queue/lib/copy.ts.
alter table public.events
  add column if not exists registration_full_title text,
  add column if not exists registration_full_message text,
  add column if not exists registration_waiting_title text,
  add column if not exists registration_waiting_message text,
  add column if not exists registration_pending_title text,
  add column if not exists registration_pending_message text;
