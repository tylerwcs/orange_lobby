-- D674: a tournament's full participation bonus - the points a group adds to its overall total
-- when every member is in at least one sport's squad. Null is no bonus. One column; no row changes.
alter table public.activities
  add column if not exists participation_bonus int check (participation_bonus between 1 and 9999);
