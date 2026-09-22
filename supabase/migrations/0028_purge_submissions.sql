-- The purge, extended to take form submissions with it (D169).
--
-- A purge that anonymises attendees and leaves their answers — and the photographs and
-- receipts attached to them — sitting untouched in form_submissions is not a purge; it is a
-- purge of half the personal data in the event. The delete goes INSIDE this function, in the
-- same statement-grouped body as the attendee update, so D172's all-or-nothing guarantee is
-- not handed straight back: either both go, or (on the tokens check failing) neither does.
-- It runs before the attendee update for no reason that matters — plpgsql wraps the whole
-- function body in one transaction regardless of statement order, so both succeed or both
-- roll back together either way.
--
-- Uploaded files themselves are NOT deleted here. They live in Storage, which a SQL function
-- cannot reach — see purgeAttendeePersonalData in src/lib/db/attendees.ts, which removes them
-- from the bucket in TypeScript before it ever calls this function.
--
-- Everything below this point, other than the new delete, is unchanged from 0024_purge_atomic.sql
-- and its reasoning still holds: the loop-of-updates history, why tokens are minted by the
-- caller, and why category survives while seat_no does not (D173).
create or replace function purge_event_personal_data(p_event_id uuid, p_tokens text[])
returns int
language plpgsql
as $$
declare
  purged int;
  needed int;
begin
  select count(*) into needed from attendees where event_id = p_event_id;
  -- Refuse up front rather than run out partway: a NULL token would violate NOT NULL and roll
  -- the whole thing back anyway, but with an error about a constraint instead of about a
  -- caller that did not send enough tokens.
  if needed > coalesce(array_length(p_tokens, 1), 0) then
    raise exception 'purge needs % tokens for event %, got %',
      needed, p_event_id, coalesce(array_length(p_tokens, 1), 0);
  end if;

  -- Every answer this event's attendees ever submitted, including whatever file paths were
  -- among them — the paths themselves were already removed from Storage by the caller before
  -- this function was ever invoked (files live outside the database; see the header comment).
  delete from form_submissions where event_id = p_event_id;

  with numbered as (
    select id, row_number() over (order by id) as rn
      from attendees
     where event_id = p_event_id
  )
  update attendees a
     set name       = 'Purged',
         email      = null,
         extra      = '{}'::jsonb,
         seat_no    = null,
         token      = p_tokens[numbered.rn],
         status     = 'purged',
         updated_at = now()
    from numbered
   where a.id = numbered.id;

  get diagnostics purged = row_count;
  return purged;
end;
$$;
