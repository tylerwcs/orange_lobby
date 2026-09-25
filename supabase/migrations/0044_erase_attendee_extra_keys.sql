-- Deleting an attendee column now erases what was stored under it (D248). Until now a delete
-- only dropped the column's definition and left every value in `attendees.extra`, so the
-- confirmation's "cannot be undone" was untrue and a same-named column came back pre-filled.
-- That was deliberate while columns were typed in by hand; an import now makes one per
-- spreadsheet header, and clearing out "Pax" and "Phone Note" should actually clear them.
--
-- One statement for the whole event rather than an update per attendee: supabase-js has no
-- transaction, and a loop that failed halfway would leave a column half erased.
--
-- `extra - p_keys` removes every listed key; `?|` limits the write to rows holding any of them.
create or replace function erase_attendee_extra_keys(p_event_id uuid, p_keys text[])
returns integer
language sql
set search_path = public
as $$
  with changed as (
    update attendees
       set extra = extra - p_keys, updated_at = now()
     where event_id = p_event_id and extra ?| p_keys
    returning 1
  )
  select count(*)::integer from changed;
$$;

-- Supabase grants new functions to anon and authenticated by default (see 0031). This one
-- erases data for an event id the caller chooses, so only the server may call it.
revoke execute on function erase_attendee_extra_keys(uuid, text[]) from public, anon, authenticated;
grant execute on function erase_attendee_extra_keys(uuid, text[]) to service_role;
