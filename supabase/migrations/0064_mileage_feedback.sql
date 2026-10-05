-- D396 - a fingerprint (SHA-256) of each uploaded file, per question key, so the same screenshot
-- sent twice by the same person is refused. Rows sent before this have none and match nothing.
alter table activity_submissions add column file_hashes jsonb not null default '{}'::jsonb;

-- D397 - organisers can hide a scored challenge's Leaderboard tab from attendees. Shown by default.
alter table activities add column show_leaderboard boolean not null default true;

-- As 0063, plus p_file_hashes and the 'duplicate' refusal. Checked here, after the activity row
-- is locked, so two sends of the same file racing each other cannot both get in. A new signature,
-- so the old one is dropped rather than overloaded; the default keeps a 5-argument call working.
drop function submit_answers(uuid, uuid, jsonb, date, uuid);

create function submit_answers(
  p_activity_id uuid,
  p_attendee_id uuid,
  p_answers jsonb,
  p_today date,
  p_submitted_by uuid default null,
  p_file_hashes jsonb default '{}'::jsonb
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

  -- D396: the same file already in one of this person's live entries to this activity.
  if exists (
    select 1 from activity_submissions s, jsonb_each_text(s.file_hashes) as h(k, v)
     where s.activity_id = a.id and s.attendee_id = p_attendee_id and s.status = 'submitted'
       and h.v in (select value from jsonb_each_text(coalesce(p_file_hashes, '{}'::jsonb)))
  ) then
    return 'duplicate';
  end if;

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

  insert into activity_submissions (event_id, activity_id, attendee_id, group_id, answers, submitted_on, per_day, submitted_by, file_hashes)
  values (
    a.event_id, a.id, p_attendee_id,
    case when a.group_mode <> 'off' then att.group_id end,
    coalesce(p_answers, '{}'::jsonb), p_today, a.per_day,
    case when p_submitted_by is distinct from p_attendee_id then p_submitted_by end,
    coalesce(p_file_hashes, '{}'::jsonb)
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

revoke execute on function submit_answers(uuid, uuid, jsonb, date, uuid, jsonb) from public, anon, authenticated;
grant execute on function submit_answers(uuid, uuid, jsonb, date, uuid, jsonb) to service_role;
