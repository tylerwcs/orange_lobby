-- The purge has been broken since 0029, and it never reached two tables added after it.
--
-- 0028 wrote `delete from form_submissions` into purge_event_personal_data. 0029 renamed that
-- table to activity_submissions. plpgsql resolves table names when a statement first runs,
-- not when the function is created, so the rename went through cleanly and left the function
-- naming a table that no longer exists. Every purge since has failed with "relation
-- form_submissions does not exist" — AFTER purgeAttendeePersonalData had already swept the
-- uploaded files from Storage, so an organiser who pressed Purge got an error, lost the
-- files, and kept every name, email and answer. The Privacy Policy promises erasure twelve
-- months after an event; this is what makes that promise keepable again.
--
-- Two tables reached the live database after 0028 without joining the purge, and both hold
-- personal data the attendee rows no longer would:
--   * whatsapp_sends.to_e164 is the attendee's mobile number, written per send (0016). The rows
--     are deleted outright: they are delivery records for an event that is over, the dedupe
--     key they carry only matters while sends can still happen, and an archived event cannot
--     send.
--   * challenge_disqualifications.reason is an organiser's free text about one person (0058).
--     The row stays, so a purged event's leaderboard still leaves out whoever was disqualified,
--     but the reason is replaced. 'Purged' satisfies its 1-500 character check.
--
-- Everything else is unchanged from 0028. create or replace keeps 0031's grants: execute stays
-- with service_role alone.
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

  delete from activity_submissions where event_id = p_event_id;
  delete from whatsapp_sends where event_id = p_event_id;
  update challenge_disqualifications set reason = 'Purged' where event_id = p_event_id;

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
