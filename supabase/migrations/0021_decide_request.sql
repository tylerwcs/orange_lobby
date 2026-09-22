-- Approving or declining a request becomes one atomic decision, not two round trips a race can
-- tear apart.
--
-- Before this migration, `approveRequestAction` read the request, called `switch_session`/
-- `cancel_booking`, and only then stamped the row via `markDecided` (scoped by
-- `status = 'pending'`) — three separate statements with nothing serialising them against a
-- concurrent `declineRequestAction`, which only ever touched `markDecided`. The failure this
-- allows (Task 7 review's Important finding): desk A approves and its RPC is in flight; desk B
-- declines the same still-`pending` row, and B's scoped update succeeds, writing `declined`; A's
-- RPC then returns `ok` — the booking has genuinely moved — but A's own `markDecided` now matches
-- zero rows, because B got there first. A is told "somebody decided it first" (true), B is told
-- its decline succeeded (also true), and the persisted record permanently reads `declined` for a
-- change that actually happened. Two locally-true messages, one queue that lies about who decided
-- what — the one failure that matters for a table whose entire purpose is answering that question
-- in November (D154, D155).
--
-- The fix is the same one D154 already applies to writing a booking: do it under a row lock, in
-- the database, in one transaction. `decide_request` selects the request `for update` before
-- doing anything else — a concurrent call for the same id blocks on that lock rather than racing
-- past it — and only stamps the decision after (for an approve) the underlying `switch_session`/
-- `cancel_booking` call has itself returned `'ok'` inside the SAME transaction. plpgsql calling
-- plpgsql is not a new client round trip; the nested call joins the caller's transaction, which is
-- the entire point: a decline that arrives while an approval's nested call is still running simply
-- waits for the row lock, and by the time it gets it the approval has either committed (row is no
-- longer `pending`, decline returns `'gone'`) or the approval's own refusal has left the row
-- `pending` with nothing stamped (decline can proceed normally). Either way there is exactly one
-- true story, because there was only ever one transaction that could win the lock first.
--
-- Returns `'gone'` when the request does not exist or is no longer `pending` — covers both a
-- stale click racing a decision that already landed and a two-desk race on the same row, which is
-- indistinguishable from the caller's point of view and does not need to be told apart.
--
-- An approve that the underlying function refuses (`full`, `closed`, `limit`, `ineligible`,
-- `missing`, `required` — the `DecisionResult` union) returns that code UNCHANGED and stamps
-- nothing: the request stays `pending`, exactly as `approveRequestAction` already required before
-- this migration (D144-style — the desk has not decided anything, they have been told they cannot
-- do it yet).
--
-- "A refusal writes nothing" is only true because `switch_session` and `cancel_booking` are
-- themselves write-free on every non-'ok' path — both do their delete/insert strictly after
-- every refusal check, today. That is a property of THEIR bodies, not of this function: a
-- nested refusal returns a plain text value, it does not raise, so this function has no way to
-- detect or roll back a write a future edit to either of them might make before returning
-- something other than 'ok'. If that guarantee is ever loosened in 0017/0020's definitions,
-- this function's "refused means untouched" claim breaks silently along with it.
--
-- LOCK ORDER. This is the first function to lock `activity_change_requests`, which none of
-- `book_session`, `switch_session` or `cancel_booking` (0017/0018/0020) ever touch. It takes
-- that lock FIRST, via the `for update` select above, before either of those functions is ever
-- called — so from this function's own body, the order is request row, then whatever session(s)
-- and activity row the nested call locks in ITS already-established order (session(s) before
-- activity, per 0017/0020's header). A lock that every member of this function family takes
-- strictly before any lock the others take cannot itself be part of a cycle among them: nothing
-- else in the family ever waits on a request row while holding a session or activity row, so
-- there is nothing for this function's own request-row lock to deadlock against.
--
-- That is NOT the whole deadlock picture, for the same reason 0017's header already records for
-- the other three functions: it is true of the four RPCs, not of the database as a whole.
-- `activity_change_requests` cascades from `events`, `activities`, `attendees`, and both
-- `from_session_id`/`to_session_id` (0019_activity_change_requests.sql), and `deleteActivity`
-- (src/lib/db/activities.ts) is a plain delete relying on that cascade — it never calls this
-- function. So an admin deleting an activity, holding the activity row and cascading a delete
-- into its pending requests, can now meet an in-flight `decide_request` approve that holds a
-- request row and is waiting on that same activity row (via the nested `switch_session`/
-- `cancel_booking` call) — the reverse of this function's own order, and a genuine new cycle this
-- migration introduces. Same disposition as the gap 0017 already records for book_session/
-- switch_session/cancel_booking against a cascading delete: low probability (an admin's delete
-- and an in-flight approve landing in the same instant), self-detecting (Postgres's own deadlock
-- detector breaks the cycle, nothing here has to notice it), non-corrupting (the loser's
-- transaction rolls back whole, not half-applied), and deliberately not handled with a retry —
-- the loser can simply be retried by the caller. Recorded here, not silently left for the one
-- lock-discipline migration in this feature to say nothing about it.
--
-- Same grant story as every write path in this feature: a fresh `create function` inherits no
-- grants from any function it replaces, and Supabase's default privileges hand EXECUTE to `anon`
-- and `authenticated` directly at CREATE TIME, not through the `public` pseudo-role — 0017
-- documents this the hard way, and 0020 repeats it because it is not a one-time fact about one
-- function, it is true of every function this project ever creates. Both roles are revoked
-- explicitly below.
create or replace function decide_request(
  p_request_id uuid,
  p_status text,
  p_user uuid
) returns text
language plpgsql
as $$
declare
  r activity_change_requests%rowtype;
  outcome text;
begin
  if p_status not in ('approved', 'declined') then
    raise exception 'decide_request: p_status must be ''approved'' or ''declined'', got %', p_status;
  end if;

  -- The lock that makes this whole function correct: a second call for the same id — whether
  -- another approve, another decline, or a retry of this one — waits here rather than reading a
  -- 'pending' row this call is about to change out from under it.
  select * into r from activity_change_requests where id = p_request_id for update;
  if not found or r.status <> 'pending' then return 'gone'; end if;

  if p_status = 'declined' then
    update activity_change_requests
       set status = 'declined', decided_at = now(), decided_by = p_user
     where id = p_request_id;
    return 'ok';
  end if;

  -- Approve: carry it out through the same locked functions every other write in this feature
  -- goes through (D154) — never a direct insert/delete/update of activity_bookings here.
  if r.kind = 'switch' then
    outcome := switch_session(r.from_session_id, r.to_session_id, r.attendee_id, true);
  else
    outcome := cancel_booking(r.from_session_id, r.attendee_id);
  end if;

  -- Refused: the booking did not move, so the request must not look decided. Return the code
  -- unstamped and let the caller explain it (APPROVE_REFUSALS in actions.ts).
  if outcome <> 'ok' then return outcome; end if;

  update activity_change_requests
     set status = 'approved', decided_at = now(), decided_by = p_user
   where id = p_request_id;
  return 'ok';
end;
$$;

revoke execute on function decide_request(uuid, text, uuid) from public, anon, authenticated;
grant execute on function decide_request(uuid, text, uuid) to service_role;
