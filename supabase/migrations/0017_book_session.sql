-- The only thing allowed to create a booking.
--
-- `count(*)` then `insert` is two statements and supabase-js has no transaction, so two phones
-- at 29 of 30 both read 29 and the room seats 31. This locks the session row, re-counts under
-- that lock, and inserts or refuses (D125). The lock is per session, so two people booking
-- different sessions never wait on each other.
--
-- Returns a reason code rather than a boolean (D140): the portal says different things for a
-- session that filled and an activity the desk closed.
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

  select * into a from activities where id = s.activity_id;
  if not found then return 'missing'; end if;

  select * into att from attendees where id = p_attendee_id;
  -- An attendee from another event is not a booking, it is a posted id from somewhere else.
  if not found or att.event_id <> s.event_id then return 'missing'; end if;

  -- Placement from the admin ignores open/closed, never capacity (D126, D130).
  if not p_ignore_open and not a.booking_open then return 'closed'; end if;

  -- The same rule as categoryVisible in src/lib/agenda.ts: empty means everyone, and the
  -- comparison is trimmed and case-folded because these values are typed by hand.
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

  select count(*) into held from activity_bookings
   where activity_id = a.id and attendee_id = p_attendee_id;
  if held >= a.max_per_attendee then return 'limit'; end if;

  insert into activity_bookings (event_id, activity_id, session_id, attendee_id)
  values (s.event_id, a.id, s.id, p_attendee_id)
  on conflict (attendee_id, session_id) do nothing;

  return 'ok';
end;
$$;

-- Moving one booking to another session of the same activity, atomically.
--
-- NOT a cancel followed by a booking. An attendee in a required activity with a cap of one
-- cannot cancel (D129), so two steps would leave them unable to change their mind at all; and
-- even where the cancel is allowed, a target that fills between the two steps leaves them
-- holding nothing — the state a required activity exists to prevent.
--
-- Both session rows are locked in id order, so two people swapping in opposite directions
-- cannot deadlock. The per-attendee cap needs no check: both sessions belong to the same
-- activity, so the count does not move.
create or replace function switch_session(
  p_from_session uuid,
  p_to_session uuid,
  p_attendee_id uuid
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

  if not a.booking_open then return 'closed'; end if;

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

-- Postgres grants EXECUTE to public by default, and PostgREST exposes a function as an rpc
-- endpoint. The anon key travels in the client bundle, so leaving the default would put a
-- booking write behind a key everybody has. Same reasoning as 0011.
--
-- `revoke ... from public` alone is not enough on this project: Supabase provisions every
-- project with `alter default privileges in schema public grant execute on functions to
-- anon, authenticated, service_role`, which fires at CREATE FUNCTION time and grants EXECUTE
-- to anon and authenticated directly, not through the public pseudo-role. Revoking only from
-- public leaves those direct grants in place (verified live: has_function_privilege('anon', ...)
-- was still true after a public-only revoke). Both roles must be revoked explicitly.
revoke execute on function book_session(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function book_session(uuid, uuid, boolean) to service_role;
revoke execute on function switch_session(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function switch_session(uuid, uuid, uuid) to service_role;
