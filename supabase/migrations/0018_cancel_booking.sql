-- The only way a booking is ever removed by the attendee themselves.
--
-- cancelAction (src/app/e/[slug]/a/[token]/activities/actions.ts) used to read the attendee's
-- held count, evaluate canCancel in the app, and only then delete - three separate round trips
-- with nothing serialising them. For a required activity with max_per_attendee >= 2, two
-- overlapping cancels (one per held session) could each read the same "held = 2" snapshot,
-- each pass the guard, and each delete - leaving the attendee holding zero sessions of an
-- activity whose entire purpose is that they hold one. Every other seat-affecting rule in this
-- feature (book_session, switch_session) is enforced under a row lock precisely because two
-- phones race; this closes the one rule that was not.
--
-- Locks the session row exactly as book_session does, but that alone was not enough: `held`
-- (below) counts bookings across the WHOLE activity, and two cancels on two DIFFERENT sessions
-- of the same activity would lock two different rows and never wait on each other - each could
-- still read the same held count and both pass "required and held<=1". The activity row is
-- locked too, for the same reason book_session now locks it (see 0017_book_session.sql's
-- header for the full argument, and its switch_session comment for why the lock order across
-- all three functions - session(s) before activity, never the reverse - cannot deadlock).
create or replace function cancel_booking(
  p_session_id uuid,
  p_attendee_id uuid
) returns text
language plpgsql
as $$
declare
  s activity_sessions%rowtype;
  a activities%rowtype;
  held int;
begin
  select * into s from activity_sessions where id = p_session_id for update;
  if not found then return 'missing'; end if;

  -- Locked, not merely selected: `held` below counts across every session of this activity, so
  -- the activity row is what actually needs to serialise two different cancellers. The
  -- `if not found` is still unreachable today (the FK from activity_sessions to activities
  -- guarantees this row exists) - mirrors book_session's and switch_session's own copies of
  -- this check, kept for the same reason: a silently-skipped guard behind a coincidence is not
  -- something to leave uncorrected once noticed.
  select * into a from activities where id = s.activity_id for update;
  if not found then return 'missing'; end if;

  -- Covers both a stale second tab re-cancelling a booking already gone, and a posted session
  -- id the attendee never held in the first place - either way there is nothing to cancel, and
  -- the caller can now tell that apart from an actual 'ok' (D140-style: a reason code, not a
  -- boolean).
  if not exists (
    select 1 from activity_bookings
     where session_id = p_session_id and attendee_id = p_attendee_id
  ) then return 'missing'; end if;

  select count(*) into held from activity_bookings
   where activity_id = a.id and attendee_id = p_attendee_id;

  -- Required means AT LEAST ONE booking, never max_per_attendee of them (D129) - so cancelling
  -- out of the last one is refused, but cancelling one of several is not.
  if a.required and held <= 1 then return 'required'; end if;

  delete from activity_bookings
   where session_id = p_session_id and attendee_id = p_attendee_id;

  return 'ok';
end;
$$;

-- Same reasoning as 0017: Postgres grants EXECUTE to public by default, and PostgREST exposes
-- a function as an rpc endpoint reachable with the anon key that travels in the client bundle.
-- A bare `revoke ... from public` is not enough on this project - Supabase's default privileges
-- grant EXECUTE to anon and authenticated directly at CREATE FUNCTION time, not through the
-- public pseudo-role, so both must be revoked explicitly.
revoke execute on function cancel_booking(uuid, uuid) from public, anon, authenticated;
grant execute on function cancel_booking(uuid, uuid) to service_role;
