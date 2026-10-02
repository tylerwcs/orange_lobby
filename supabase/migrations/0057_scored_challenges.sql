-- D369, D372, D373 — scored challenges (Project Mileage).
-- 'members': each member submits their own entries, stamped with their team; no group target.
-- scoring: the setting that turns a submission activity into a scored challenge. Null is off.

alter table activities drop constraint activities_group_mode_check;
alter table activities add constraint activities_group_mode_check
  check (group_mode in ('off', 'entries', 'everyone', 'members'));
-- activities_group_per_day_check (0055) already refuses per_day for every mode but 'off'.

alter table activities add column scoring jsonb;
alter table activities add constraint activities_scoring_kind_check
  check (scoring is null or kind = 'submission');

-- As 0055, plus: 'members' needs a group and has no per-person limit (D369), and a scored
-- activity refuses days outside its challenge dates with 'closed' (D373).
create or replace function submit_answers(
  p_activity_id uuid,
  p_attendee_id uuid,
  p_answers jsonb,
  p_today date
) returns text
language plpgsql
as $$
declare
  a activities%rowtype;
  att attendees%rowtype;
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

  insert into activity_submissions (event_id, activity_id, attendee_id, group_id, answers, submitted_on, per_day)
  values (
    a.event_id, a.id, p_attendee_id,
    case when a.group_mode <> 'off' then att.group_id end,
    coalesce(p_answers, '{}'::jsonb), p_today, a.per_day
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

revoke execute on function submit_answers(uuid, uuid, jsonb, date) from public, anon, authenticated;
grant execute on function submit_answers(uuid, uuid, jsonb, date) to service_role;
