create extension if not exists pgcrypto;

create table organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table org_members (
  org_id uuid not null references organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'admin',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  slug text not null unique,
  name text not null,
  status text not null default 'draft' check (status in ('draft','live','archived')),
  starts_on date,
  ends_on date,
  venue_name text,
  venue_address text,
  venue_map_url text,
  contact_name text,
  contact_phone text,
  description text,
  logo_url text,
  banner_url text,
  primary_color text not null default '#F97316',
  floor_plan_url text,
  info_page_title text not null default 'Info',
  info_page_html text,
  registration_open boolean not null default false,
  registration_closes_at timestamptz,
  registration_questions jsonb not null default '[]'::jsonb,
  scan_extra_fields text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table attendees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  event_id uuid not null references events(id) on delete cascade,
  token text not null unique,
  name text not null,
  email text,
  phone text,
  company text,
  category text,
  table_no text,
  seat_no text,
  extra jsonb not null default '{}'::jsonb,
  source text not null check (source in ('import','registration','walkin')),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index attendees_event_email_uq on attendees (event_id, lower(email)) where email is not null;
create index attendees_event_name_idx on attendees (event_id, lower(name));

create table agenda_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  event_id uuid not null references events(id) on delete cascade,
  day date not null,
  starts_at time not null,
  ends_at time,
  title text not null,
  description text,
  location text,
  categories text[],
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index agenda_items_event_day_idx on agenda_items (event_id, day, starts_at, sort_order);

create table announcements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  event_id uuid not null references events(id) on delete cascade,
  title text not null,
  body text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create table checkpoints (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table checkins (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  event_id uuid not null references events(id) on delete cascade,
  checkpoint_id uuid not null references checkpoints(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,
  scanned_by uuid references auth.users(id),
  scanned_at timestamptz not null default now(),
  unique (checkpoint_id, attendee_id)
);

alter table organisations enable row level security;
alter table org_members  enable row level security;
alter table events       enable row level security;
alter table attendees    enable row level security;
alter table agenda_items enable row level security;
alter table announcements enable row level security;
alter table checkpoints  enable row level security;
alter table checkins     enable row level security;
-- No policies on purpose: only the service role (which bypasses RLS) may access data.
