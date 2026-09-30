-- D367 — organisers can hide My group from the portal. On by default, so every event keeps
-- the tile it has today until someone turns it off.

alter table events add column group_tile boolean not null default true;
