-- The organiser decides what the attendee's Me page shows (D536) and what the registration
-- success page says (D537).

-- D536: item keys hidden on the Me page. Hidden rather than shown, so a question added later shows by default.
alter table public.events add column if not exists me_hidden jsonb not null default '[]'::jsonb;
-- D537: null for the default wording; `{name}` is the attendee's first name.
alter table public.events add column if not exists registration_done_title text;
alter table public.events add column if not exists registration_done_message text;
