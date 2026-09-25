-- The line under the Register heading, set per event in Settings (D229). Null means the
-- portal's default ("A few details, once. It takes about a minute.").
alter table events add column if not exists registration_intro text;
