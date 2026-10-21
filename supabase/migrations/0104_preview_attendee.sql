-- D716: the attendee a draft's preview link opens as, so the client sees a personal portal (badge,
-- Me, activities) rather than the general one. Null opens the general portal. Deleting the
-- attendee falls back to the general portal. Adds one column; no existing row or policy changes.
alter table public.events
  add column preview_attendee_id uuid references public.attendees (id) on delete set null;
