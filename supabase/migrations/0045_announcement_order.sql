-- Announcements in the organiser's order (D249). Until now the order was fixed: pinned first,
-- then newest. It becomes a column the admin list's drag sets, and pinning keeps only its other
-- meaning — the highlighted one the home banner shows.
--
-- Backfilled from the old rule, so what attendees see does not move until somebody drags.
-- Steps of 10, as info tabs use (setInfoTabOrder), so a new announcement can go above the
-- first without renumbering the rest.
alter table announcements add column sort_order integer not null default 0;

update announcements a
   set sort_order = ranked.n * 10
  from (
    select id, row_number() over (partition by event_id order by pinned desc, created_at desc) as n
      from announcements
  ) ranked
 where ranked.id = a.id;
