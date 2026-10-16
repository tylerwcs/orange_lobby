-- D619/D620's registration-only colours, superseded by the event theme (D622-D632). 0091 copied
-- their values into events.theme; run only once the theme deploy is live (the old deploy wrote them).
alter table public.events
  drop column if exists registration_heading_color,
  drop column if exists registration_background_color;
