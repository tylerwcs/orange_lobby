-- D715: a draft event's preview link, for the client to see the portal as it will look live
-- without signing in. Null means the link is off. Unique, like setup_token, so a token alone
-- names one event. Adds one column; no existing row or policy changes.
alter table public.events add column preview_token text unique;
