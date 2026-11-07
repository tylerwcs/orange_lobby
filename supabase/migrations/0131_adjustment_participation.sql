-- 0131: ad hoc points the organisers give as a week's participation points (D843). They count in
-- the Participation (bonus) column of that week instead of Ad hoc, so they need a week.
alter table public.activity_adjustments add column participation boolean not null default false;
alter table public.activity_adjustments add constraint activity_adjustments_participation_week
  check (not participation or week_of is not null);
