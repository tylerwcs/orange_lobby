-- The only thing allowed to create a submission.
--
-- `count(*)` then `insert` is two statements and supabase-js has no transaction, so two
-- phones one short of the cap both read "one short" and both get in. This locks the FORM row,
-- re-counts under that lock and inserts or refuses - the same shape, and the same reasoning,
-- as book_session (D125, D167).
--
-- The form is the right row to lock: the cap is counted across the whole form, so two
-- submissions by one attendee have to serialise against each other, and they only both touch
-- this one row.
--
-- Returns a reason code rather than a boolean (D140): the portal says different things for a
-- form the desk closed and one this person has already filled in today.
--
-- p_today is passed in rather than read from current_date, so which Malaysian day it is gets
-- decided in one place (nowInKL) instead of depending on the database server's timezone (D165).
create or replace function submit_form(
  p_form_id uuid,
  p_attendee_id uuid,
  p_answers jsonb,
  p_today date
) returns text
language plpgsql
as $$
declare
  f forms%rowtype;
  att attendees%rowtype;
  used int;
begin
  select * into f from forms where id = p_form_id for update;
  if not found then return 'missing'; end if;

  select * into att from attendees where id = p_attendee_id;
  -- An attendee from another event is not a submission, it is a posted id from elsewhere.
  if not found or att.event_id <> f.event_id then return 'missing'; end if;

  if not f.submissions_open then return 'closed'; end if;

  -- The same rule as categoryMatches in src/lib/agenda.ts: empty means everyone, and the
  -- comparison is trimmed and case-folded because these values are typed by hand.
  if f.categories is not null and array_length(f.categories, 1) > 0 then
    if att.category is null or not exists (
      select 1 from unnest(f.categories) c
      where lower(btrim(c)) = lower(btrim(att.category))
    ) then
      return 'ineligible';
    end if;
  end if;

  if f.max_per_attendee is not null then
    select count(*) into used from form_submissions
     where form_id = f.id and attendee_id = p_attendee_id;
    if used >= f.max_per_attendee then return 'limit'; end if;
  end if;

  if f.per_day and exists (
    select 1 from form_submissions
     where form_id = f.id and attendee_id = p_attendee_id and submitted_on = p_today
  ) then
    return 'duplicate';
  end if;

  insert into form_submissions (event_id, form_id, attendee_id, answers, submitted_on, per_day)
  values (f.event_id, f.id, p_attendee_id, coalesce(p_answers, '{}'::jsonb), p_today, f.per_day);

  return 'ok';
exception
  -- The partial unique index is the real authority on one-a-day. The check above is the
  -- fast, friendly path; this is what catches the race the check cannot.
  when unique_violation then return 'duplicate';
end;
$$;

-- Postgres grants EXECUTE to public by default, and PostgREST exposes a function as an rpc
-- endpoint. The anon key travels in the client bundle, so leaving the default would put a
-- submission write behind a key everybody has. Same reasoning as 0017.
--
-- `revoke ... from public` alone is not enough on this project: Supabase provisions every
-- project with `alter default privileges in schema public grant execute on functions to
-- anon, authenticated, service_role`, which fires at CREATE FUNCTION time and grants EXECUTE
-- to anon and authenticated directly, not through the public pseudo-role. Revoking only from
-- public leaves those direct grants in place. Both roles must be revoked explicitly.
revoke execute on function submit_form(uuid, uuid, jsonb, date) from public, anon, authenticated;
grant execute on function submit_form(uuid, uuid, jsonb, date) to service_role;
