-- switch_session gains p_ignore_open, so the desk can approve a queued switch after booking
-- has closed (D156).
--
-- Without this the feature defeats itself: closing booking is what the desk does when the
-- headcount is committed, and that is precisely when the request queue needs working.
--
-- THE SIGNATURE CHANGE IS THIS MIGRATION'S WHOLE RISK. Postgres keys a function by its
-- argument list, so `create or replace` with a fourth argument creates a SECOND function
-- rather than replacing the first. The old three-argument one must be dropped explicitly, or
-- both exist and which one runs depends on how the caller names its arguments.
--
-- And the new signature is a new object with no inherited grants: Supabase provisions every
-- project with `alter default privileges in schema public grant execute on functions to
-- anon, authenticated, service_role`, which fires at CREATE time. Revoking from `public`
-- alone does not remove those direct grants — 0017 documents this the hard way. Both roles
-- must be named.
--
-- The lock order and deadlock/cycle argument attached to switch_session's original definition
-- in 0017_book_session.sql applies unchanged to the body below; nothing in this migration
-- alters it. Both session rows are still locked in id order before either is read, the activity
-- row is still deliberately left unlocked here (relying on the final insert's implicit FOR KEY
-- SHARE via the activity_bookings.activity_id foreign key), and the file-wide rule that every
-- one of these three functions locks session(s) before activity, never the reverse, still
-- holds. Nothing in this migration changes what is locked, when, or in what order — see that
-- comment for why each piece is where it is, including the recorded 40P01 gap against a
-- cascading delete of an activity or its event. switch_session's live definition is now here,
-- not there; 0017 and 0018 have been updated to point at this file.
drop function if exists switch_session(uuid, uuid, uuid);

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

  -- Mirrors book_session:27-28: `found` reflects only the immediately preceding statement, so
  -- the activities lookup needs its own check rather than sharing the attendees one below it.
  -- Unreachable today (the FK from activity_sessions to activities plus the row lock above
  -- guarantee `a` exists), but a silently-skipped closed/eligibility check behind a coincidence
  -- is not something to leave uncorrected once noticed.
  select * into a from activities where id = s_to.activity_id;
  if not found then return 'missing'; end if;

  select * into att from attendees where id = p_attendee_id;
  if not found or att.event_id <> s_to.event_id then return 'missing'; end if;

  -- D156: the desk approving a queued switch after booking has closed. Bypasses open/closed
  -- ONLY — capacity and eligibility below are never bypassed by it. Keep this guard here, above
  -- both of those checks, if this function is ever edited: moving it below either would let the
  -- flag do more than it is meant to.
  if not p_ignore_open and not a.booking_open then return 'closed'; end if;

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
  -- Same guard as book_session:57. With max_per_attendee > 1 an attendee can already hold both
  -- p_from_session and p_to_session; without on conflict this insert would raise an unhandled
  -- unique violation instead of returning one of the six codes. Choosing do-nothing over an
  -- early 'ok' means the delete above still runs, so the end state is "holds p_to_session only"
  -- (the from-session seat is actually released) rather than "holds both, untouched" — that
  -- matches what switch is asked to do even when the target was already held.
  insert into activity_bookings (event_id, activity_id, session_id, attendee_id)
  values (s_to.event_id, a.id, s_to.id, p_attendee_id)
  on conflict (attendee_id, session_id) do nothing;

  return 'ok';
end;
$$;

revoke execute on function switch_session(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function switch_session(uuid, uuid, uuid, boolean) to service_role;
