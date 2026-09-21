-- The only thing allowed to create a booking.
--
-- `count(*)` then `insert` is two statements and supabase-js has no transaction, so two phones
-- at 29 of 30 both read 29 and the room seats 31. This locks the session row, re-counts under
-- that lock, and inserts or refuses (D125).
--
-- The activity row is locked too (below), not only the session. `held` counts bookings across
-- every session of the activity, to enforce the per-attendee cap - and two different session
-- rows do not serialise a count that spans the activity. Locking only the session closes the
-- capacity race but leaves this one open: two attendees booking two different sessions of a
-- one-per-attendee activity could each lock their own session, each read held=0, and both get
-- in. So two people booking different sessions now DO wait on each other, briefly, whenever
-- those sessions share an activity - that used not to be true, and is the correct trade: the
-- per-attendee cap has to be right, and the lock is held for the length of one function call at
-- an event of hundreds of people, not thousands hammering one row at once. A comment claiming
-- otherwise would be wrong, so this replaces the one that used to say so.
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

  -- Locked, not merely selected: `held` below counts across every session of this activity, so
  -- the activity row is what actually needs to serialise two different bookers - see the
  -- switch_session comment below for the lock-order argument this depends on, and its limit.
  select * into a from activities where id = s.activity_id for update;
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
-- activity, so the count does not move - which is also why this function is the only one of
-- the three that never requests an explicit lock on the activity row. Its final insert still
-- takes an implicit FOR KEY SHARE lock on the activity row, because activity_bookings.activity_id
-- is a foreign key to it - that lock is compatible with another FOR KEY SHARE, but not with
-- book_session's or cancel_booking's FOR UPDATE, so this function's insert can now wait behind
-- either of them. It happens after both session locks are already held, so it does not change
-- the ordering argument below.
--
-- Lock order, across this file and cancel_booking (0018_cancel_booking.sql): every function
-- that touches both tables locks its session row(s) first and the activity row second, never
-- the reverse - book_session and cancel_booking both do explicitly; this one only ever does so
-- implicitly, via its insert. Among these three functions a cycle needs two transactions each
-- waiting on something the other already holds, and with a single consistent order that cannot
-- happen.
--
-- That is true of these three functions - it is NOT true of the database as a whole. Deleting
-- an activity (deleteActivity, src/lib/db/activities.ts) or its event locks the activity (or
-- event) row and cascades into activity_sessions (0016_activities.sql's `on delete cascade`),
-- which needs the child session row - the reverse of the order above. A book_session or
-- cancel_booking call already holding its session lock and waiting on the activity lock, racing
-- an admin's delete of that same activity (or event) which holds the activity lock and needs
-- the session row to cascade, is a genuine cycle. Postgres detects it after `deadlock_timeout`
-- and aborts one side with error 40P01, which `bookSession`/`cancelBooking`
-- (src/lib/db/activities.ts) currently rethrow as an unhandled error rather than one of the
-- reason codes above. This did not used to be reachable - book_session never waited on the
-- activity row before this fix. It is low probability (an admin's delete and an attendee's
-- booking or cancel would have to land in the same instant), self-detecting (Postgres breaks
-- the cycle itself, nothing here has to notice it), and non-corrupting (the loser's transaction
-- is rolled back whole, not left half-applied) - the loser can simply be retried. No retry or
-- special handling for 40P01 is implemented; that is a deliberate, recorded gap, not an
-- oversight.
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
