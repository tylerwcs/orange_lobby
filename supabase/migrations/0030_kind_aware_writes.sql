-- The write functions, taught about `kind` (D178).
--
-- Each one now refuses the other kind outright. That is not defensive padding: `activities`
-- holds both kinds behind one id space, so a booking id and a submission id are the same shape
-- and a posted one can no longer be told apart by the route it arrived on. Before the merge
-- that was structural; now it has to be checked.
--
-- 'missing' rather than a new code, deliberately. A submission activity is not a booking
-- activity that happens to be closed or full - from book_session's point of view it does not
-- exist, and every caller already says the right thing for 'missing'.

create or replace function book_session(
  p_session_id uuid,
  p_attendee_id uuid,
  p_ignore_open boolean default false
) returns text
language plpgsql
as $$
declare
  s activity_sessions%rowtype;
  a activities%rowtype;
  att attendees%rowtype;
  taken int;
  held int;
begin
  select * into s from activity_sessions where id = p_session_id for update;
  if not found then return 'missing'; end if;

  -- Locked, not merely selected: `held` below counts across every session of this activity, so
  -- the activity row is what actually serialises two different bookers (D125).
  select * into a from activities where id = s.activity_id for update;
  if not found then return 'missing'; end if;
  -- A submission activity has no sessions, so this is unreachable through the UI. It is here
  -- because "unreachable through the UI" is not the same as unreachable (D178).
  if a.kind <> 'booking' then return 'missing'; end if;

  select * into att from attendees where id = p_attendee_id;
  -- An attendee from another event is not a booking, it is a posted id from somewhere else.
  if not found or att.event_id <> s.event_id then return 'missing'; end if;

  -- Placement from the admin ignores open/closed, never capacity (D126, D130).
  if not p_ignore_open and not a.is_open then return 'closed'; end if;

  if a.categories is not null and array_length(a.categories, 1) > 0 then
    if att.category is null or not exists (
      select 1 from unnest(a.categories) c
      where lower(btrim(c)) = lower(btrim(att.category))
    ) then
      return 'ineligible';
    end if;
  end if;

  select count(*) into taken from activity_bookings where session_id = s.id;
  if taken >= s.capacity then return 'full'; end if;

  -- Null is no cap at all, now that both kinds share this column (D178). Checked explicitly
  -- rather than left to `held >= null` evaluating to NULL: that happens to behave correctly,
  -- and correct-by-accident is how a rule stops holding the day somebody rewrites it.
  if a.max_per_attendee is not null then
    select count(*) into held from activity_bookings
     where activity_id = a.id and attendee_id = p_attendee_id;
    if held >= a.max_per_attendee then return 'limit'; end if;
  end if;

  insert into activity_bookings (event_id, activity_id, session_id, attendee_id)
  values (s.event_id, a.id, s.id, p_attendee_id)
  on conflict (attendee_id, session_id) do nothing;

  return 'ok';
end;
$$;

create or replace function switch_session(
  p_from_session uuid,
  p_to_session uuid,
  p_attendee_id uuid,
  p_ignore_open boolean default false
) returns text
language plpgsql
as $$
declare
  s_from activity_sessions%rowtype;
  s_to activity_sessions%rowtype;
  a activities%rowtype;
  att attendees%rowtype;
  taken int;
begin
  if p_from_session = p_to_session then return 'ok'; end if;

  perform 1 from activity_sessions
   where id in (p_from_session, p_to_session)
   order by id
     for update;

  select * into s_from from activity_sessions where id = p_from_session;
  if not found then return 'missing'; end if;
  select * into s_to from activity_sessions where id = p_to_session;
  if not found then return 'missing'; end if;
  -- Switching across activities is not a switch, it is two decisions.
  if s_from.activity_id <> s_to.activity_id then return 'missing'; end if;

  if not exists (
    select 1 from activity_bookings
     where session_id = p_from_session and attendee_id = p_attendee_id
  ) then return 'missing'; end if;

  -- `found` reflects only the immediately preceding statement, so this needs its own check.
  select * into a from activities where id = s_to.activity_id;
  if not found then return 'missing'; end if;
  if a.kind <> 'booking' then return 'missing'; end if;

  select * into att from attendees where id = p_attendee_id;
  if not found or att.event_id <> s_to.event_id then return 'missing'; end if;

  -- D156: the desk approving a queued switch after booking has closed. Bypasses open/closed
  -- ONLY - capacity and eligibility below are never bypassed by it. Keep this guard above both
  -- of those checks if this function is ever edited.
  if not p_ignore_open and not a.is_open then return 'closed'; end if;

  if a.categories is not null and array_length(a.categories, 1) > 0 then
    if att.category is null or not exists (
      select 1 from unnest(a.categories) c
      where lower(btrim(c)) = lower(btrim(att.category))
    ) then
      return 'ineligible';
    end if;
  end if;

  select count(*) into taken from activity_bookings where session_id = s_to.id;
  if taken >= s_to.capacity then return 'full'; end if;

  delete from activity_bookings
   where session_id = p_from_session and attendee_id = p_attendee_id;
  -- With max_per_attendee > 1 an attendee can already hold both sessions; without `on conflict`
  -- this insert would raise instead of returning a code. Do-nothing rather than an early 'ok'
  -- so the delete above still runs and the end state is "holds the target only".
  insert into activity_bookings (event_id, activity_id, session_id, attendee_id)
  values (s_to.event_id, a.id, s_to.id, p_attendee_id)
  on conflict (attendee_id, session_id) do nothing;

  return 'ok';
end;
$$;

-- Renamed from submit_form: there is no `forms` table left for it to be named after, and the
-- pairing with book_session is the point - two writes, one parent, one kind each.
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
  -- An attendee from another event is not a submission, it is a posted id from elsewhere.
  if not found or att.event_id <> a.event_id then return 'missing'; end if;

  if not a.is_open then return 'closed'; end if;

  -- The same rule as categoryMatches in src/lib/agenda.ts: empty means everyone, and the
  -- comparison is trimmed and case-folded because these values are typed by hand.
  if a.categories is not null and array_length(a.categories, 1) > 0 then
    if att.category is null or not exists (
      select 1 from unnest(a.categories) c
      where lower(btrim(c)) = lower(btrim(att.category))
    ) then
      return 'ineligible';
    end if;
  end if;

  if a.max_per_attendee is not null then
    select count(*) into used from activity_submissions
     where activity_id = a.id and attendee_id = p_attendee_id;
    if used >= a.max_per_attendee then return 'limit'; end if;
  end if;

  if a.per_day and exists (
    select 1 from activity_submissions
     where activity_id = a.id and attendee_id = p_attendee_id and submitted_on = p_today
  ) then
    return 'today';
  end if;

  insert into activity_submissions (event_id, activity_id, attendee_id, answers, submitted_on, per_day)
  values (a.event_id, a.id, p_attendee_id, coalesce(p_answers, '{}'::jsonb), p_today, a.per_day);

  return 'ok';
exception
  -- The partial unique index is the real authority on one-a-day; the explicit check above is
  -- only the fast, friendlier path. Scoped to that one constraint BY NAME, not to
  -- unique_violation in general: the primary key fires the same error class, and reporting a
  -- genuine fault as an ordinary 'today' refusal would hide it behind a friendly sentence.
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'activity_submissions_one_a_day' then
      return 'today';
    end if;
    raise;
end;
$$;

drop function if exists submit_form(uuid, uuid, jsonb, date);

-- Same reasoning as every other rpc here: Supabase's default privileges grant EXECUTE to anon
-- at CREATE FUNCTION time, so revoking from public alone leaves the anon key able to call it.
revoke execute on function book_session(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function book_session(uuid, uuid, boolean) to service_role;
revoke execute on function switch_session(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function switch_session(uuid, uuid, uuid, boolean) to service_role;
revoke execute on function submit_answers(uuid, uuid, jsonb, date) from public, anon, authenticated;
grant execute on function submit_answers(uuid, uuid, jsonb, date) to service_role;
