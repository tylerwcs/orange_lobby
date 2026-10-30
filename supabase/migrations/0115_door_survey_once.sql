-- 0115: one live door-survey entry per person (D765). As 0114, plus one check: when the entry is
-- sent at a door (p_checkpoint_id set), a person who already has a live entry gets 'limit',
-- whatever the form's max_per_attendee. Every other caller is unchanged. Same signature.

create or replace function submit_answers(
  p_activity_id uuid,
  p_attendee_id uuid,
  p_answers jsonb,
  p_today date,
  p_submitted_by uuid default null,
  p_file_hashes jsonb default '{}'::jsonb,
  p_pair_id uuid default null,
  -- D760: the door this was filled at, on the crew's scanner. Set, it skips the closed checks.
  p_checkpoint_id uuid default null
) returns text
language plpgsql
as $$
declare
  a activities%rowtype;
  att attendees%rowtype;
  v_proxy attendees%rowtype;
  used int;
  v_constraint text;
  v_pair challenge_track_pairs%rowtype;
  v_track uuid;
begin
  select * into a from activities where id = p_activity_id for update;
  if not found then return 'missing'; end if;
  if a.kind <> 'submission' then return 'missing'; end if;

  select * into att from attendees where id = p_attendee_id;
  if not found or att.event_id <> a.event_id then return 'missing'; end if;

  -- D760: a door survey stays closed so it is off the portal; the door may still take it.
  if not a.is_open and p_checkpoint_id is null then return 'closed'; end if;

  if p_checkpoint_id is null and a.scoring is not null and (
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

  -- D725: in a track pair, only the person's own track takes their entry. The person checked is
  -- the one the entry is for, never a captain sending it. A row from another group (a team move)
  -- does not count (D722).
  select p.* into v_pair from challenge_track_pairs p where a.id in (p.a_activity_id, p.b_activity_id);
  if found then
    select m.activity_id into v_track from challenge_track_members m
     where m.pair_id = v_pair.id and m.attendee_id = p_attendee_id and m.group_id = att.group_id;
    if v_track is null then return 'notrack'; end if;
    if v_track <> a.id then return 'othertrack'; end if;

    -- D730: at most the pair's target (5) people from one team log on one track per day. Someone
    -- already logged today may add another session; revoked entries free their place. The row lock
    -- on the activity above makes two people racing for the last place take turns.
    if not exists (
      select 1 from activity_submissions s
       where s.activity_id = a.id and s.attendee_id = p_attendee_id and s.submitted_on = p_today and s.status = 'submitted'
    ) and (
      select count(distinct s.attendee_id) from activity_submissions s
       where s.activity_id = a.id and s.group_id = att.group_id and s.submitted_on = p_today and s.status = 'submitted'
    ) >= v_pair.target then
      return 'trackfull';
    end if;
  end if;

  -- D396: the same file already in one of this person's live entries to this activity.
  if exists (
    select 1 from activity_submissions s, jsonb_each_text(s.file_hashes) as h(k, v)
     where s.activity_id = a.id and s.attendee_id = p_attendee_id and s.status = 'submitted'
       and h.v in (select value from jsonb_each_text(coalesce(p_file_hashes, '{}'::jsonb)))
  ) then
    return 'duplicate';
  end if;

  -- D765: the door takes one live entry per person, whatever the form's own limit: two crew
  -- devices, or a retry after a lost response, must not store the same survey twice. The row lock
  -- on the activity above makes two doors racing for the same person take turns.
  if p_checkpoint_id is not null and exists (
    select 1 from activity_submissions
     where activity_id = a.id and attendee_id = p_attendee_id and status = 'submitted'
  ) then
    return 'limit';
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

  insert into activity_submissions (event_id, activity_id, attendee_id, group_id, answers, submitted_on, per_day, submitted_by, file_hashes, pair_id, checkpoint_id)
  values (
    a.event_id, a.id, p_attendee_id,
    case when a.group_mode <> 'off' then att.group_id end,
    coalesce(p_answers, '{}'::jsonb), p_today, a.per_day,
    case when p_submitted_by is distinct from p_attendee_id then p_submitted_by end,
    coalesce(p_file_hashes, '{}'::jsonb),
    p_pair_id,
    p_checkpoint_id
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
revoke execute on function submit_answers(uuid, uuid, jsonb, date, uuid, jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function submit_answers(uuid, uuid, jsonb, date, uuid, jsonb, uuid, uuid) to service_role;
