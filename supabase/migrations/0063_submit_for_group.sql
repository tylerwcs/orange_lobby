-- D392 — someone may submit on behalf of a member of their own group: a Captain, say. Which
-- people may is per activity: the attendee fields listed in proxy_fields, where a Yes (read
-- from attendees.extra, as fieldValue reads it) marks them. The entry is the MEMBER's row -
-- their day, their team, their limits - and submitted_by records who actually sent it.

alter table activities add column proxy_fields text[] not null default '{}';
alter table activity_submissions add column submitted_by uuid references attendees(id) on delete set null;
create index activity_submissions_submitted_by_idx on activity_submissions (submitted_by) where submitted_by is not null;

-- As 0057, plus p_submitted_by. A new signature, so the old one is dropped rather than
-- overloaded: a 4-argument call would otherwise match both. The default keeps that call working.
drop function submit_answers(uuid, uuid, jsonb, date);

create function submit_answers(
  p_activity_id uuid,
  p_attendee_id uuid,
  p_answers jsonb,
  p_today date,
  p_submitted_by uuid default null
) returns text
language plpgsql
as $$
declare
  a activities%rowtype;
  att attendees%rowtype;
  v_proxy attendees%rowtype;
  used int;
  v_constraint text;
begin
  select * into a from activities where id = p_activity_id for update;
  if not found then return 'missing'; end if;
  if a.kind <> 'submission' then return 'missing'; end if;

  select * into att from attendees where id = p_attendee_id;
  if not found or att.event_id <> a.event_id then return 'missing'; end if;

  if not a.is_open then return 'closed'; end if;

  if a.scoring is not null and (
    p_today < (a.scoring->>'starts_on')::date or p_today > (a.scoring->>'ends_on')::date
  ) then
    return 'closed';
  end if;

  -- D392: the sender must share the member's group and hold a Yes in one of the proxy fields.
  if p_submitted_by is not null and p_submitted_by <> p_attendee_id then
    select * into v_proxy from attendees where id = p_submitted_by;
    if not found or v_proxy.event_id <> a.event_id or v_proxy.group_id is null
       or v_proxy.group_id is distinct from att.group_id
       or not exists (
         select 1 from unnest(a.proxy_fields) as f(k)
          where lower(btrim(coalesce(v_proxy.extra->>f.k, ''))) in ('yes', 'y', 'true')
       ) then
      return 'proxy';
    end if;
  end if;

  if not category_matches(a.categories, att.category) then return 'ineligible'; end if;

  if a.group_mode <> 'off' then
    if att.group_id is null then return 'nogroup'; end if;
    if a.group_mode = 'entries' then
      select count(*) into used from activity_submissions
       where activity_id = a.id and group_id = att.group_id and status = 'submitted';
      if used >= a.group_target then return 'groupdone'; end if;
    elsif a.group_mode = 'everyone' and exists (
      select 1 from activity_submissions
       where activity_id = a.id and attendee_id = p_attendee_id
         and group_id = att.group_id and status = 'submitted'
    ) then
      return 'limit';
    end if;
    -- 'members': no limit at all - one entry per workout (D368).
  else
    if a.max_per_attendee is not null then
      select count(*) into used from activity_submissions
       where activity_id = a.id and attendee_id = p_attendee_id and status = 'submitted';
      if used >= a.max_per_attendee then return 'limit'; end if;
    end if;

    if a.per_day and exists (
      select 1 from activity_submissions
       where activity_id = a.id and attendee_id = p_attendee_id and submitted_on = p_today and status = 'submitted'
    ) then
      return 'today';
    end if;
  end if;

  insert into activity_submissions (event_id, activity_id, attendee_id, group_id, answers, submitted_on, per_day, submitted_by)
  values (
    a.event_id, a.id, p_attendee_id,
    case when a.group_mode <> 'off' then att.group_id end,
    coalesce(p_answers, '{}'::jsonb), p_today, a.per_day,
    case when p_submitted_by is distinct from p_attendee_id then p_submitted_by end
  );

  return 'ok';
exception
  -- Scoped to that one constraint BY NAME, as in 0053: anything else is a genuine fault.
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'activity_submissions_one_a_day' then
      return 'today';
    end if;
    raise;
end;
$$;

revoke execute on function submit_answers(uuid, uuid, jsonb, date, uuid) from public, anon, authenticated;
grant execute on function submit_answers(uuid, uuid, jsonb, date, uuid) to service_role;
