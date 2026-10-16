-- D635: whether the organiser's line breaks (D633) also apply to the top bar. Off: the bar keeps
-- the plain name and the browser's own wrapping; the breaks apply to the big page title only.
alter table public.events add column if not exists display_name_in_bar boolean not null default false;
