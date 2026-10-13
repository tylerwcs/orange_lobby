-- Submission verifiers and revoke reasons (spec 2026-10-13-submission-verifiers-design.md,
-- D492–D502). One table, two submission columns, one event column; no existing row changes
-- except that every event gets the default reason templates.

-- D492/D493: one link per person. Removing stamps removed_at so past revokes still name them;
-- replacing issues a new token on the same row.
create table if not exists public.verifier_links (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  token       text not null unique,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  removed_at  timestamptz
);
create index if not exists verifier_links_event_idx on public.verifier_links (event_id);
-- No policies: only the service role reads or writes, as on every table (0001).
alter table public.verifier_links enable row level security;

-- D499: a copy of the wording, so editing a template never rewrites what an attendee was told.
-- A verifier's revoke sets revoked_by_verifier and leaves revoked_by (an auth user) null.
alter table public.activity_submissions
  add column if not exists revoke_reason text
    check (revoke_reason is null or char_length(revoke_reason) between 1 and 300),
  add column if not exists revoked_by_verifier uuid references public.verifier_links (id) on delete set null;

-- D497: the templates, per event. Existing events get the defaults too.
alter table public.events
  add column if not exists revoke_reasons text[] not null default array[
    'Photo or file is unclear',
    'Duplicate entry',
    'Doesn''t meet the activity''s requirements',
    'Submitted to the wrong activity',
    'Inappropriate content'
  ]::text[];
