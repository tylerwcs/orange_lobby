-- D467: the week a disqualification voids, when the challenge voids one week (scoring.void = 'week').
-- Null keeps D380's whole-season Void, so Mileage's rows are unchanged.
alter table challenge_disqualifications add column week_of date;
