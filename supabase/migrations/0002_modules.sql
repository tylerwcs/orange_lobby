alter table events add column if not exists modules jsonb not null default '[]'::jsonb;
