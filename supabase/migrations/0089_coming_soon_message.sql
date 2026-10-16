-- D617: what every portal link says while the event is a draft. Null for DEFAULT_COMING_SOON.
alter table public.events add column if not exists coming_soon_message text;
