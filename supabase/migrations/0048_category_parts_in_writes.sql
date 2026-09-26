-- The write functions, taught that one attendee can be in several programmes.
--
-- bdb979f let an attendee's category list several parts ("KOM, Wellness", "KOM + Wellness",
-- "KOM/Wellness") and taught the app's categoryMatches (src/lib/agenda.ts) to match any one of
-- them. The database kept comparing the whole string, so "kom, wellness" never equalled
-- "wellness": the portal showed Book and the database answered 'ineligible' - for every
-- multi-programme attendee, on bookings, switches, submissions and passport stamps alike.
--
-- category_matches is that rule in SQL - same separators, same trim and case-folding - and the
-- four functions below are their live definitions with only the category check replaced.

create or replace function category_matches(p_categories text[], p_category text)
returns boolean
language sql
immutable
as $$
  -- No categories means everyone; otherwise one of the attendee's parts must be one of them.
  select coalesce(array_length(p_categories, 1), 0) = 0
      or exists (
        select 1
          from unnest(p_categories) c,
               regexp_split_to_table(coalesce(p_category, ''), '[,+/;]') part
         where btrim(part) <> ''
           and lower(btrim(c)) = lower(btrim(part))
      );
$$;

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
  if not found or att.event_id <> s.event_id then return 'missing'; end if;

  -- Placement from the admin ignores open/closed, never capacity (D126, D130).
  if not p_ignore_open and not a.is_open then return 'closed'; end if;

  if not category_matches(a.categories, att.category) then return 'ineligible'; end if;

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
  if s_from.activity_id <> s_to.activity_id then return 'missing'; end if;

  if not exists (
    select 1 from activity_bookings
     where session_id = p_from_session and attendee_id = p_attendee_id
  ) then return 'missing'; end if;

  select * into a from activities where id = s_to.activity_id;
  if not found then return 'missing'; end if;
  if a.kind <> 'booking' then return 'missing'; end if;

  select * into att from attendees where id = p_attendee_id;
  if not found or att.event_id <> s_to.event_id then return 'missing'; end if;

  -- D156: bypasses open/closed ONLY - capacity and eligibility below are never bypassed.
  if not p_ignore_open and not a.is_open then return 'closed'; end if;

  if not category_matches(a.categories, att.category) then return 'ineligible'; end if;

  select count(*) into taken from activity_bookings where session_id = s_to.id;
  if taken >= s_to.capacity then return 'full'; end if;

  delete from activity_bookings
   where session_id = p_from_session and attendee_id = p_attendee_id;
  insert into activity_bookings (event_id, activity_id, session_id, attendee_id)
  values (s_to.event_id, a.id, s_to.id, p_attendee_id)
  on conflict (attendee_id, session_id) do nothing;

  return 'ok';
end;
$$;

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

create or replace function record_stamp(p_booth_id uuid, p_attendee_id uuid) returns text
language plpgsql
as $$
declare
  b booths%rowtype;
  a activities%rowtype;
  att attendees%rowtype;
  inserted int;
begin
  select * into b from booths where id = p_booth_id;
  if not found then return 'missing'; end if;

  -- FOR SHARE, not FOR UPDATE: a close (an UPDATE of this row) waits for stamps in flight and
  -- they wait for it, so a stamp is either before the close or after it — but two booths
  -- stamping at once do not queue behind each other.
  select * into a from activities where id = b.activity_id for share;
  if not found then return 'missing'; end if;
  -- The 0030 convention: another kind's id is not a closed passport, it is no passport.
  if a.kind <> 'passport' then return 'missing'; end if;

  select * into att from attendees where id = p_attendee_id;
  if not found or att.event_id <> b.event_id then return 'missing'; end if;

  if not a.is_open then return 'closed'; end if;

  if not category_matches(a.categories, att.category) then return 'ineligible'; end if;

  insert into booth_stamps (org_id, event_id, booth_id, attendee_id)
  values (b.org_id, b.event_id, b.id, p_attendee_id)
  on conflict (booth_id, attendee_id) do nothing;
  get diagnostics inserted = row_count;

  return case when inserted = 1 then 'ok' else 'duplicate' end;
end;
$$;
