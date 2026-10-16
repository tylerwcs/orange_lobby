-- Event theme (D622-D632). {} = no theme: the portal looks as it always has.
alter table public.events add column if not exists theme jsonb not null default '{}'::jsonb
  check (jsonb_typeof(theme) = 'object');
-- D619/D620 were registration-only; their values become the theme's (spec "What happens to D619-D621").
update public.events set theme = jsonb_strip_nulls(jsonb_build_object(
    'background', registration_background_color,
    'overrides', jsonb_strip_nulls(jsonb_build_object('heading', registration_heading_color))))
  where registration_background_color is not null or registration_heading_color is not null;
