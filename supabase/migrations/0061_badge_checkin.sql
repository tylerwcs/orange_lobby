-- D388 — organisers can hide the check-in pill on the portal badge. On by default, so every
-- event keeps the pill it has today; what the pill says now follows the running checkpoint.

alter table events add column badge_checkin boolean not null default true;
