-- D338/D339 — revoke is a status, and only submitted rows count toward the limit, the day, and
-- the one-a-day index. Do NOT apply it; the controller does.

alter table activity_submissions
  add constraint activity_submissions_status_check check (status in ('submitted', 'revoked')),
  add column revoked_at timestamptz,
  add column revoked_by uuid references auth.users(id) on delete set null,
  add column edited_at timestamptz,
  add column edited_by uuid references auth.users(id) on delete set null;

drop index activity_submissions_one_a_day;
create unique index activity_submissions_one_a_day
  on activity_submissions (activity_id, attendee_id, submitted_on)
  where per_day and status = 'submitted';

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

  if not category_matches(a.categories, att.category) then return 'ineligible'; end if;

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

  insert into activity_submissions (event_id, activity_id, attendee_id, answers, submitted_on, per_day)
  values (a.event_id, a.id, p_attendee_id, coalesce(p_answers, '{}'::jsonb), p_today, a.per_day);

  return 'ok';
exception
  -- Scoped to that one constraint BY NAME, not to unique_violation in general: the primary key
  -- fires the same error class, and reporting a genuine fault as an ordinary 'today' refusal
  -- would hide it behind a friendly sentence.
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'activity_submissions_one_a_day' then
      return 'today';
    end if;
    raise;
end;
$$;
