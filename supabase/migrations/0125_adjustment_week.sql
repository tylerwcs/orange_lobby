-- 0125: ad hoc points that belong to one week of a scored challenge (D813). The Monday of that
-- week, as challenge_disqualifications.week_of; null is the season, as every row before this.
-- A dated row counts in that week's total and, once, in the season's.
alter table public.activity_adjustments add column week_of date
  check (week_of is null or extract(isodow from week_of) = 1);
