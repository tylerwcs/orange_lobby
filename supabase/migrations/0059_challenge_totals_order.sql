-- D375: challenge_daily_totals returns ~7,400 rows by the end of a challenge, past PostgREST's
-- 1,000-row cap, so the app pages it with .range(). Paging needs a stable order: the group-by
-- key is unique per row (a null group_id is at most one per attendee-day), so ordering by it
-- keeps pages from overlapping or skipping. Same body as 0058 otherwise.

create or replace function challenge_daily_totals(p_activity_id uuid)
returns table (attendee_id uuid, group_id uuid, day date, km numeric)
language sql
stable
as $$
  select s.attendee_id, s.group_id, s.submitted_on,
         sum(case when s.answers->>(a.scoring->>'metric_key') ~ '^\d+(\.\d+)?$'
                  then (s.answers->>(a.scoring->>'metric_key'))::numeric else 0 end)
    from activity_submissions s
    join activities a on a.id = s.activity_id
   where s.activity_id = p_activity_id
     and s.status = 'submitted'
     and a.scoring is not null
     and s.submitted_on between (a.scoring->>'starts_on')::date and (a.scoring->>'ends_on')::date
   group by s.attendee_id, s.group_id, s.submitted_on
   order by s.attendee_id, s.submitted_on, s.group_id
$$;

revoke execute on function challenge_daily_totals(uuid) from public, anon, authenticated;
grant execute on function challenge_daily_totals(uuid) to service_role;
