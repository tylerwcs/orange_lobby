-- Submit together with someone from another team (spec 2026-10-14-submit-with-partner-design.md,
-- D524-D535). Two rows per tagged submit, one per person, sharing pair_id and one set of files.

-- D524: per activity, off by default.
alter table public.activities add column if not exists allow_pair boolean not null default false;
-- D525: the two rows of one tagged submit; null on every other row.
alter table public.activity_submissions add column if not exists pair_id uuid;
create index if not exists activity_submissions_pair_idx on public.activity_submissions (pair_id) where pair_id is not null;

-- As 0064, plus p_pair_id stamped on the row. A new signature, so the old one is dropped rather
-- than overloaded; every default keeps the existing 6-argument call working.
drop function submit_answers(uuid, uuid, jsonb, date, uuid, jsonb);

create function submit_answers(
  p_activity_id uuid,
  p_attendee_id uuid,
  p_answers jsonb,
  p_today date,
  p_submitted_by uuid default null,
  p_file_hashes jsonb default '{}'::jsonb,
  p_pair_id uuid default null
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

  insert into activity_submissions (event_id, activity_id, attendee_id, group_id, answers, submitted_on, per_day, submitted_by, file_hashes, pair_id)
  values (
    a.event_id, a.id, p_attendee_id,
    case when a.group_mode <> 'off' then att.group_id end,
    coalesce(p_answers, '{}'::jsonb), p_today, a.per_day,
    case when p_submitted_by is distinct from p_attendee_id then p_submitted_by end,
    coalesce(p_file_hashes, '{}'::jsonb),
    p_pair_id
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

revoke execute on function submit_answers(uuid, uuid, jsonb, date, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function submit_answers(uuid, uuid, jsonb, date, uuid, jsonb, uuid) to service_role;

-- D526/D527: the tagged submit, all or nothing. The pair rules first, then submit_answers for
-- the member and for the partner with one shared pair_id. A partner refusal raises inside the
-- sub-block, which rolls the member's insert back, and is caught here to return its code.
-- `who` says whose refusal it is, so the message can name the partner.
create function submit_answers_pair(
  p_activity_id uuid,
  p_attendee_id uuid,
  p_partner_id uuid,
  p_answers jsonb,
  p_today date,
  p_submitted_by uuid,
  p_file_hashes jsonb
) returns table (code text, who text)
language plpgsql
as $$
declare
  a activities%rowtype;
  m attendees%rowtype;
  p attendees%rowtype;
  v_pair uuid := gen_random_uuid();
  c text;
begin
  select * into a from activities where id = p_activity_id;
  if not found or a.kind <> 'submission' then return query select 'missing'::text, 'self'::text; return; end if;
  if not a.allow_pair then return query select 'pairoff'::text, 'partner'::text; return; end if;

  select * into m from attendees where id = p_attendee_id;
  if not found or m.event_id <> a.event_id then return query select 'missing'::text, 'self'::text; return; end if;
  select * into p from attendees where id = p_partner_id;
  if not found or p.event_id <> a.event_id then return query select 'missing'::text, 'partner'::text; return; end if;

  if p.id = m.id then return query select 'pairself'::text, 'partner'::text; return; end if;
  if m.group_id is null then return query select 'pairnoteam_self'::text, 'self'::text; return; end if;
  if p.group_id is null then return query select 'pairnoteam'::text, 'partner'::text; return; end if;
  if p.group_id = m.group_id then return query select 'pairsame'::text, 'partner'::text; return; end if;

  begin
    c := submit_answers(p_activity_id, p_attendee_id, p_answers, p_today, p_submitted_by, p_file_hashes, v_pair);
    if c <> 'ok' then return query select c, 'self'::text; return; end if;
    c := submit_answers(p_activity_id, p_partner_id, p_answers, p_today, null, p_file_hashes, v_pair);
    if c <> 'ok' then raise exception using errcode = 'P0001', message = c; end if;
  exception when raise_exception then
    return query select sqlerrm::text, 'partner'::text;
    return;
  end;

  return query select 'ok'::text, 'self'::text;
end;
$$;

revoke execute on function submit_answers_pair(uuid, uuid, uuid, jsonb, date, uuid, jsonb) from public, anon, authenticated;
grant execute on function submit_answers_pair(uuid, uuid, uuid, jsonb, date, uuid, jsonb) to service_role;
