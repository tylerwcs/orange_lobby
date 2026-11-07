-- 0130: book_session refuses a session that has already started (D842). The portal strikes such
-- a time through and its action refuses it first; this is the last word, under the row lock.
-- Unchanged otherwise from 0048.

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

  -- D842: a session whose start time has passed, in Kuala Lumpur time, takes no more bookings
  -- from attendees. The admin's placement still may (it passes p_ignore_open), as it may into
  -- a closed activity: the desk seating a latecomer is a decision, not a race.
  if not p_ignore_open and (s.day + s.starts_at) <= (now() at time zone 'Asia/Kuala_Lumpur') then
    return 'started';
  end if;

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
