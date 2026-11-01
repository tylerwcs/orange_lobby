-- 0121: map links beside every activity location (D798), and topping up seats (D797).

-- D798: an optional web link (a Google Maps share link, usually) next to each place an
-- activity names. Free text like the location itself; the app only accepts http(s) links.
alter table activity_sessions add column location_url text;
alter table booths add column location_url text;
alter table activities add column venue_url text;

-- D797: adds seats to the given sessions of one activity, in place. `capacity + n` in one
-- statement rather than read-then-write, so a booking that lands in between is neither lost
-- nor counted twice: book_session locks the same row FOR UPDATE, so each waits for the other.
-- Which sessions (upcoming only, one day or all) is the app's call; this only refuses ids that
-- are not this activity's. Returns how many sessions it changed.
create or replace function public.top_up_sessions(p_event_id uuid, p_activity_id uuid, p_session_ids uuid[], p_seats int) returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_rows int;
begin
  if p_seats is null or p_seats < 1 then raise exception 'seats must be at least 1'; end if;
  update public.activity_sessions set capacity = capacity + p_seats
  where event_id = p_event_id and activity_id = p_activity_id and id = any(p_session_ids);
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
revoke execute on function public.top_up_sessions(uuid, uuid, uuid[], int) from public, anon, authenticated;
