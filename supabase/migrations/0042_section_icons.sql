-- Per-event pictures for the portal launcher's own sections (D222). Keys are section names
-- ("agenda", "info"); values are uploaded image URLs. A missing key means the portal's default
-- illustration. jsonb rather than a column per section so a new section needs no migration.
alter table events add column if not exists section_icons jsonb not null default '{}'::jsonb;
