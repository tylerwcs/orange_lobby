-- D777: the feature registry. Two more add-ons are stored in event_features, so an organiser can
-- switch the portal language switch and Popups per event: 'language' and 'popups'.
-- Additive: a widened check, then a backfill so no event loses what it already uses.

-- The check swap takes ACCESS EXCLUSIVE on event_features. The database also hosts live events:
-- give up after 5 s rather than queue every request behind a long lock.
set local lock_timeout = '5s';

-- The check was named event_features_feature_check (0070, widened in 0117). Same eight keys
-- plus language and popups; nothing else changes.
alter table public.event_features drop constraint if exists event_features_feature_check;
alter table public.event_features add constraint event_features_feature_check
  check (feature in ('whatsapp', 'booking', 'engagement', 'live_games', 'lucky_draw', 'custom_domain', 'slido', 'typing_qualifier', 'language', 'popups'));
-- If the live check had another name, the drop above did nothing and the old check still
-- stands beside the new one: fail the apply instead.
do $$
declare
  v_checks int;
begin
  select count(*) into v_checks
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute att
      on att.attrelid = c.conrelid and att.attname = 'feature' and att.attnum = any (c.conkey)
   where c.conrelid = 'public.event_features'::regclass and c.contype = 'c';
  if v_checks <> 1 then
    raise exception '0118: event_features has % check constraints on feature, expected exactly 1 (event_features_feature_check)', v_checks;
  end if;
end $$;

-- Backfill: an event that already uses the language switch or has popups keeps them.
insert into public.event_features (event_id, feature)
  select id, 'language' from public.events where language_switch
  on conflict do nothing;
insert into public.event_features (event_id, feature)
  select distinct event_id, 'popups' from public.portal_popups
  on conflict do nothing;
