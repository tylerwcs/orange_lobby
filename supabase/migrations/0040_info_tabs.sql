-- Info tabs (D202-D203). The Info page's single body becomes the first of any number of
-- named, hand-ordered tabs. events.info_page_title keeps naming the whole section;
-- events.info_page_html is copied into a "Details" tab here and dropped by 0041 once the
-- code that stopped reading it is live.
create table if not exists info_tabs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  event_id uuid not null references events(id) on delete cascade,
  title text not null,
  html text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
-- Read and written only through the service client, exactly like agenda_days.
alter table info_tabs enable row level security;
create index if not exists info_tabs_event_order_idx on info_tabs (event_id, sort_order);

insert into info_tabs (org_id, event_id, title, html, sort_order)
select e.org_id, e.id, 'Details', e.info_page_html, 10
from events e
where nullif(trim(e.info_page_html), '') is not null
  and not exists (select 1 from info_tabs t where t.event_id = e.id);
