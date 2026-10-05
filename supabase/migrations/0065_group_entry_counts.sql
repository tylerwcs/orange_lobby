-- D400: the Groups list's entry count per group, counted in the database. The app used to fetch
-- one row per grouped entry and count them itself, and PostgREST returns at most 1,000 rows a
-- request - so once a challenge (Project Mileage: every entry carries its team) passed 1,000
-- live entries, every group's count silently stopped growing. One row per group comes back
-- instead: a dozen rows, however many entries there are.

create function live_entry_counts_by_group(p_event_id uuid)
returns table (group_id uuid, entries bigint)
language sql
stable
set search_path = public
as $$
  select s.group_id, count(*)
    from activity_submissions s
   where s.event_id = p_event_id
     and s.status = 'submitted'
     and s.group_id is not null
   group by s.group_id
$$;

revoke execute on function live_entry_counts_by_group(uuid) from public, anon, authenticated;
grant execute on function live_entry_counts_by_group(uuid) to service_role;
