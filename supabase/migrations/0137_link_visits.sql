-- 0137: tracked registration links (D899). A link handed to a partner carries ?utm_source=<tag>;
-- each browser that opens the registration form through it adds one 'visit', and each form sent
-- through it that adds someone new (registered, waiting or pending approval) adds one
-- 'registration'. Counts only: no person, address, IP or browser is stored, so the privacy page's
-- "attendees are not tracked" still holds.

create table link_visits (
  id bigint generated always as identity primary key,
  event_id uuid not null references events(id) on delete cascade,
  source text not null check (source ~ '^[a-z0-9._-]{1,50}$'),
  kind text not null check (kind in ('visit', 'registration')),
  created_at timestamptz not null default now()
);

create index link_visits_event_source on link_visits (event_id, source);

-- Written and read with the service key only.
alter table link_visits enable row level security;

create function link_source_counts(p_event_id uuid)
returns table (source text, visits bigint, registrations bigint, last_at timestamptz)
language sql
stable
as $$
  select v.source,
         count(*) filter (where v.kind = 'visit'),
         count(*) filter (where v.kind = 'registration'),
         max(v.created_at)
  from link_visits v
  where v.event_id = p_event_id
  group by v.source
  order by 2 desc, 1;
$$;

revoke execute on function link_source_counts(uuid) from public, anon, authenticated;
