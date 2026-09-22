-- Executable regression evidence for book_session and switch_session
-- (supabase/migrations/0017_book_session.sql). Committed per controller ruling on the Task 2
-- review: verification SQL a human may need to re-run lives in the repo, not a scratch file.
--
-- WHAT THIS PROVES, in order:
--
--   A. book_session's six return codes, exercised end to end: closed, ok, full, ineligible,
--      ok (case-folded category match: ' vip ' against ['VIP']), limit.
--
--   B. switch_session's happy path (ok / moved / left), the same-session shortcut, and the
--      LOAD-BEARING SAFETY PROPERTY the brief calls out by name: a switch refused purely on
--      CAPACITY is a no-op — the attendee's source booking survives ("kept"). The activity used
--      here carries no category restriction, so the capacity check is what actually fires; the
--      first fixture written for this task set `categories = ['VIP']` on the activity two steps
--      before its own refusal test and never cleared it, so that refusal returned 'ineligible'
--      (switch_session's eligibility check runs before its capacity check) and never touched
--      this property at all. See task-2-report.md, "Finding 1" fix, for the full story.
--
--   C. Every 'missing' return site in both functions that is reachable without breaking a
--      foreign key: a nonexistent session (book_session, and both sides of switch_session), an
--      attendee posted from another event (book_session directly, and switch_session via a
--      hand-inserted booking row — see the note at C7), a cross-activity switch, and a switch
--      attempted by an attendee who holds no booking in the source session at all.
--      book_session's "activity not found" branch and switch_session's mirrored one are NOT
--      exercised here: activity_sessions.activity_id is a NOT NULL foreign key to activities,
--      so a session can't exist without its activity, and this script does not corrupt the
--      schema just to walk a branch that constraint already makes unreachable.
--
--   D. The fix for Finding 2 (switch_session raising an unhandled unique-violation instead of
--      returning a code): with max_per_attendee = 2, an attendee books both sessions of one
--      activity, then switches from one into the other. Before the fix this raised a Postgres
--      unique_violation instead of returning one of the six codes. It must now return 'ok', with
--      the source booking deleted and the target booking left exactly once (not duplicated).
--
--   E. cancel_booking (supabase/migrations/0018_cancel_booking.sql), added for the Task 6
--      review's Important finding: cancelAction's required-activity guard used to be an app-side
--      check-then-act with nothing serialising the read and the delete. An attendee holding two
--      sessions of a required activity (max_per_attendee = 2) cancels the first (held 2 -> 1,
--      allowed) then the second (held would drop to 0, refused with 'required' - the case the
--      whole fix exists for), and 'missing' is exercised both for a session id that does not
--      exist and for a real session this attendee never held a booking on.
--
--   F. switch_session's new p_ignore_open parameter (supabase/migrations/0020_switch_session_
--      ignore_open.sql), added so the desk can approve a queued switch after booking closes
--      (D156). An attendee holding session A of a closed activity: switching without the flag
--      is refused 'closed' and is a no-op (still holds A); switching with the flag set true
--      succeeds ('ok') and moves them onto B. Then, still with the flag set (the binding
--      constraint: it bypasses open/closed and NOTHING else), a switch onto a FULL session
--      still returns 'full', and a switch onto a session the attendee's category can't reach
--      still returns 'ineligible' - both still no-ops, so capacity and eligibility are actually
--      exercised under the flag, not merely asserted.
--
--   G. decide_request (supabase/migrations/0021_decide_request.sql), added for the Task 7
--      review's Important finding: approve-then-stamp used to be two separate statements, so a
--      concurrent decline could win the stamp after an approve's booking write had already
--      landed, leaving the record permanently reading 'declined' for a change that actually
--      happened. THIS SECTION IS SEQUENTIAL AND CANNOT DEMONSTRATE THE CONCURRENT INTERLEAVING
--      ITSELF — that needs two live connections racing on the same row, which a single script
--      issuing statements one after another can never open. What it proves instead is the status
--      guard the row lock is built on: approve a pending switch request (succeeds, moves the
--      booking, stamps 'approved'), then call decide_request AGAIN on that same now-decided row
--      (a decline, standing in for desk B arriving after desk A already won the lock). The second
--      call must return 'gone', the row must still read 'approved' — not overwritten — and the
--      booking must have moved exactly once (present on the target session, absent from the
--      source, and not duplicated). The row lock is the argument for why two REAL concurrent
--      calls resolve this same way instead of racing; this fixture is the evidence that the
--      guard behind that argument actually holds.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor, or run it through the
-- `execute_sql` MCP tool for this project, or `supabase db execute -f
-- scripts/book-session-fixture.sql --project-ref <ref>`. It ends with a plain SELECT of every
-- result row it collected — read that output, not `raise notice` (notices are not visible
-- through the Supabase MCP tool).
--
-- SAFE TO RE-RUN: every event slug and attendee token this script creates includes a
-- freshly generated suffix, so back-to-back runs never collide on events.slug or
-- attendees.token (both `unique`). Each section deletes its own event at the end, which
-- cascades every activity/session/attendee/booking it created.

drop table if exists results;
create temp table results (
  id serial primary key,
  step text,
  value text
);

-- ============================================================================================
-- Section A — book_session's six return codes.
-- ============================================================================================
do $$
declare
  v_org uuid;
  v_event uuid;
  v_act uuid;
  v_sess uuid;
  v_a1 uuid;
  v_a2 uuid;
  v_tok1 text := left(replace(gen_random_uuid()::text, '-', ''), 16);
  v_tok2 text := left(replace(gen_random_uuid()::text, '-', ''), 16);
begin
  select id into v_org from organisations limit 1;
  insert into events (org_id, slug, name, status)
    values (v_org, 'fixture-a-' || v_tok1, 'Fixture A', 'draft') returning id into v_event;
  insert into activities (org_id, event_id, name, required, booking_open, max_per_attendee)
    values (v_org, v_event, 'Workshops', true, false, 1) returning id into v_act;
  insert into activity_sessions (event_id, activity_id, title, day, starts_at, capacity)
    values (v_event, v_act, 'Only seat', current_date, '09:30', 1) returning id into v_sess;
  insert into attendees (org_id, event_id, token, name, source)
    values (v_org, v_event, v_tok1, 'First', 'walkin') returning id into v_a1;
  insert into attendees (org_id, event_id, token, name, source)
    values (v_org, v_event, v_tok2, 'Second', 'walkin') returning id into v_a2;

  insert into results (step, value) values ('A.closed', book_session(v_sess, v_a1, false));
  insert into results (step, value) values ('A.ignored_open', book_session(v_sess, v_a1, true));
  update activities set booking_open = true where id = v_act;
  insert into results (step, value) values ('A.full', book_session(v_sess, v_a2, false));
  update activity_sessions set capacity = 2 where id = v_sess;
  insert into results (step, value) values ('A.ok', book_session(v_sess, v_a2, false));
  update activities set categories = array['VIP'] where id = v_act;
  delete from activity_bookings where attendee_id = v_a2;
  insert into results (step, value) values ('A.ineligible', book_session(v_sess, v_a2, false));
  update attendees set category = ' vip ' where id = v_a2;
  insert into results (step, value) values ('A.folded_ok', book_session(v_sess, v_a2, false));
  update activity_sessions set capacity = 3 where id = v_sess;
  insert into results (step, value) values ('A.limit', book_session(v_sess, v_a2, false));

  delete from events where id = v_event;
end $$;

-- ============================================================================================
-- Section B — switch_session happy path, same-session shortcut, and the capacity-refusal
-- no-op property with NO category restriction confounding the result.
-- ============================================================================================
do $$
declare
  v_org uuid;
  v_event uuid;
  v_act uuid;
  v_sess1 uuid;
  v_sess2 uuid;
  v_sess3 uuid;
  v_a1 uuid;
  v_a2 uuid;
  v_tok1 text := left(replace(gen_random_uuid()::text, '-', ''), 16);
  v_tok2 text := left(replace(gen_random_uuid()::text, '-', ''), 16);
begin
  select id into v_org from organisations limit 1;
  insert into events (org_id, slug, name, status)
    values (v_org, 'fixture-b-' || v_tok1, 'Fixture B', 'draft') returning id into v_event;
  -- No categories on this activity: isolates the capacity check in switch_session from the
  -- eligibility check that pre-empted it in the original (uncommitted) fixture.
  insert into activities (org_id, event_id, name, required, booking_open, max_per_attendee)
    values (v_org, v_event, 'Workshops', true, true, 1) returning id into v_act;
  insert into activity_sessions (event_id, activity_id, title, day, starts_at, capacity)
    values (v_event, v_act, 'Room A', current_date, '09:30', 1) returning id into v_sess1;
  insert into activity_sessions (event_id, activity_id, title, day, starts_at, capacity)
    values (v_event, v_act, 'Room B', current_date, '11:30', 1) returning id into v_sess2;
  insert into activity_sessions (event_id, activity_id, title, day, starts_at, capacity)
    values (v_event, v_act, 'Room C', current_date, '13:30', 1) returning id into v_sess3;
  insert into attendees (org_id, event_id, token, name, source)
    values (v_org, v_event, v_tok1, 'First', 'walkin') returning id into v_a1;
  insert into attendees (org_id, event_id, token, name, source)
    values (v_org, v_event, v_tok2, 'Second', 'walkin') returning id into v_a2;

  -- Happy path: a1 books Room A, then switches into the empty Room C.
  insert into results (step, value) values ('B.book_a1_roomA', book_session(v_sess1, v_a1, false));
  insert into results (step, value) values ('B.switch_ok', switch_session(v_sess1, v_sess3, v_a1));
  insert into results (step, value) values ('B.moved', (select count(*)::text from activity_bookings
                                  where attendee_id = v_a1 and session_id = v_sess3));
  insert into results (step, value) values ('B.left', (select count(*)::text from activity_bookings
                                  where attendee_id = v_a1 and session_id = v_sess1));

  -- Same-session shortcut: switching to the session already held is a no-op 'ok'.
  insert into results (step, value) values ('B.same_session_ok', switch_session(v_sess3, v_sess3, v_a1));

  -- The load-bearing property. a2 fills Room B; a1 (holding Room C) tries to switch into it.
  -- No category restriction is in play, so this exercises the capacity check directly, not
  -- eligibility — unlike the original fixture's equivalent step.
  insert into results (step, value) values ('B.book_a2_roomB', book_session(v_sess2, v_a2, false));
  insert into results (step, value) values ('B.refused_full', switch_session(v_sess3, v_sess2, v_a1));
  insert into results (step, value) values ('B.kept', (select count(*)::text from activity_bookings
                                  where attendee_id = v_a1 and session_id = v_sess3));

  delete from events where id = v_event;
end $$;

-- ============================================================================================
-- Section C — 'missing' coverage for both functions.
-- ============================================================================================
do $$
declare
  v_org uuid;
  v_event1 uuid;
  v_event2 uuid;
  v_act1 uuid;
  v_act2 uuid;
  v_sess1 uuid;
  v_sess2 uuid;
  v_sess_other_act uuid;
  v_a1 uuid;
  v_a_other_event uuid;
  v_tok1 text := left(replace(gen_random_uuid()::text, '-', ''), 16);
  v_tok2 text := left(replace(gen_random_uuid()::text, '-', ''), 16);
  v_nonexistent uuid := gen_random_uuid();
begin
  select id into v_org from organisations limit 1;
  insert into events (org_id, slug, name, status)
    values (v_org, 'fixture-c-' || v_tok1, 'Fixture C', 'draft') returning id into v_event1;
  insert into events (org_id, slug, name, status)
    values (v_org, 'fixture-c-other-' || v_tok1, 'Fixture C other event', 'draft') returning id into v_event2;

  insert into activities (org_id, event_id, name, required, booking_open, max_per_attendee)
    values (v_org, v_event1, 'Activity 1', false, true, 1) returning id into v_act1;
  insert into activities (org_id, event_id, name, required, booking_open, max_per_attendee)
    values (v_org, v_event1, 'Activity 2', false, true, 1) returning id into v_act2;

  insert into activity_sessions (event_id, activity_id, title, day, starts_at, capacity)
    values (v_event1, v_act1, 'Act1 Room', current_date, '09:30', 5) returning id into v_sess1;
  insert into activity_sessions (event_id, activity_id, title, day, starts_at, capacity)
    values (v_event1, v_act1, 'Act1 Room 2', current_date, '10:30', 5) returning id into v_sess2;
  insert into activity_sessions (event_id, activity_id, title, day, starts_at, capacity)
    values (v_event1, v_act2, 'Act2 Room', current_date, '09:30', 5) returning id into v_sess_other_act;

  insert into attendees (org_id, event_id, token, name, source)
    values (v_org, v_event1, v_tok1, 'In event', 'walkin') returning id into v_a1;
  insert into attendees (org_id, event_id, token, name, source)
    values (v_org, v_event2, v_tok2, 'Other event', 'walkin') returning id into v_a_other_event;

  -- C1: book_session against a session id that does not exist.
  insert into results (step, value) values ('C1.book_missing_session', book_session(v_nonexistent, v_a1, false));

  -- C2: book_session with an attendee whose event does not match the session's event.
  insert into results (step, value) values ('C2.book_cross_event_attendee', book_session(v_sess1, v_a_other_event, false));

  -- C3: switch_session where the FROM session does not exist.
  insert into results (step, value) values ('C3.switch_missing_from', switch_session(v_nonexistent, v_sess1, v_a1));

  -- C4: switch_session where the TO session does not exist.
  insert into results (step, value) values ('C4.switch_missing_to', switch_session(v_sess1, v_nonexistent, v_a1));

  -- C5: switch_session across two different activities.
  insert into results (step, value) values ('C5.switch_cross_activity', switch_session(v_sess1, v_sess_other_act, v_a1));

  -- C6: switch_session where the attendee holds no booking in the FROM session at all.
  insert into results (step, value) values ('C6.switch_no_existing_booking', switch_session(v_sess1, v_sess2, v_a1));

  -- C7: switch_session's cross-event attendee guard on the TO side. book_session refuses to
  -- create a cross-event booking in the first place (see C2), so the only way to reach this
  -- branch is a booking row that never went through the RPC — exactly the "posted id from
  -- somewhere else" both functions guard against. We insert one directly, bypassing book_session
  -- (as a caller with raw DB access could), to prove the guard fires: an attendee whose own
  -- event does not match the target session's event is refused even though they hold a real
  -- booking row naming the source session.
  insert into activity_bookings (event_id, activity_id, session_id, attendee_id)
    values (v_event1, v_act1, v_sess1, v_a_other_event);
  insert into results (step, value) values ('C7.switch_cross_event_attendee', switch_session(v_sess1, v_sess2, v_a_other_event));

  delete from events where id = v_event1;
  delete from events where id = v_event2;
end $$;

-- ============================================================================================
-- Section D — Finding 2 fix: switching into an already-held session must return 'ok', not raise.
-- ============================================================================================
do $$
declare
  v_org uuid;
  v_event uuid;
  v_act uuid;
  v_sess1 uuid;
  v_sess2 uuid;
  v_a1 uuid;
  v_tok1 text := left(replace(gen_random_uuid()::text, '-', ''), 16);
begin
  select id into v_org from organisations limit 1;
  insert into events (org_id, slug, name, status)
    values (v_org, 'fixture-d-' || v_tok1, 'Fixture D', 'draft') returning id into v_event;
  -- max_per_attendee = 2: this attendee is allowed to hold both sessions of the activity at
  -- once — the precondition that reached the unhandled unique-violation before the fix.
  insert into activities (org_id, event_id, name, required, booking_open, max_per_attendee)
    values (v_org, v_event, 'Workshops', false, true, 2) returning id into v_act;
  insert into activity_sessions (event_id, activity_id, title, day, starts_at, capacity)
    values (v_event, v_act, 'Room A', current_date, '09:30', 5) returning id into v_sess1;
  insert into activity_sessions (event_id, activity_id, title, day, starts_at, capacity)
    values (v_event, v_act, 'Room B', current_date, '11:30', 5) returning id into v_sess2;
  insert into attendees (org_id, event_id, token, name, source)
    values (v_org, v_event, v_tok1, 'Double booked', 'walkin') returning id into v_a1;

  insert into results (step, value) values ('D.book_roomA', book_session(v_sess1, v_a1, false));
  insert into results (step, value) values ('D.book_roomB', book_session(v_sess2, v_a1, false));
  -- The attendee now holds BOTH sessions of the same activity. Before the fix, switching A -> B
  -- raised an unhandled unique_violation here; it must now return 'ok'.
  insert into results (step, value) values ('D.switch_into_already_held', switch_session(v_sess1, v_sess2, v_a1));
  insert into results (step, value) values ('D.holds_roomA_after', (select count(*)::text from activity_bookings
                                  where attendee_id = v_a1 and session_id = v_sess1));
  insert into results (step, value) values ('D.holds_roomB_after', (select count(*)::text from activity_bookings
                                  where attendee_id = v_a1 and session_id = v_sess2));

  delete from events where id = v_event;
end $$;

-- ============================================================================================
-- Section E — cancel_booking: the 'required' guard fires only once held would drop to zero,
-- and 'missing' covers both a nonexistent session and a session this attendee never held.
-- ============================================================================================
do $$
declare
  v_org uuid;
  v_event uuid;
  v_act uuid;
  v_sess1 uuid;
  v_sess2 uuid;
  v_sess3 uuid;
  v_a1 uuid;
  v_tok1 text := left(replace(gen_random_uuid()::text, '-', ''), 16);
  v_nonexistent uuid := gen_random_uuid();
begin
  select id into v_org from organisations limit 1;
  insert into events (org_id, slug, name, status)
    values (v_org, 'fixture-e-' || v_tok1, 'Fixture E', 'draft') returning id into v_event;
  -- max_per_attendee = 2 and required: this attendee is allowed to hold both sessions at once,
  -- which is the precondition for the guard to ever say 'ok' at all - with a cap of one,
  -- required and held<=1 would refuse the very first cancel forever (D129: at least one
  -- booking, never max_per_attendee of them).
  insert into activities (org_id, event_id, name, required, booking_open, max_per_attendee)
    values (v_org, v_event, 'Workshops', true, true, 2) returning id into v_act;
  insert into activity_sessions (event_id, activity_id, title, day, starts_at, capacity)
    values (v_event, v_act, 'Room A', current_date, '09:30', 5) returning id into v_sess1;
  insert into activity_sessions (event_id, activity_id, title, day, starts_at, capacity)
    values (v_event, v_act, 'Room B', current_date, '11:30', 5) returning id into v_sess2;
  insert into activity_sessions (event_id, activity_id, title, day, starts_at, capacity)
    values (v_event, v_act, 'Room C (never booked)', current_date, '13:30', 5) returning id into v_sess3;
  insert into attendees (org_id, event_id, token, name, source)
    values (v_org, v_event, v_tok1, 'Needs a choice', 'walkin') returning id into v_a1;

  insert into results (step, value) values ('E.book_roomA', book_session(v_sess1, v_a1, false));
  insert into results (step, value) values ('E.book_roomB', book_session(v_sess2, v_a1, false));

  -- Holds two sessions of a required activity: cancelling one is allowed (held drops 2 -> 1).
  insert into results (step, value) values ('E.cancel_first_ok', cancel_booking(v_sess1, v_a1));

  -- Now holds exactly one. This is the case the whole fix is for: refused, not silently
  -- reducing the attendee to zero sessions of an activity that requires at least one.
  insert into results (step, value) values ('E.cancel_second_refused', cancel_booking(v_sess2, v_a1));
  insert into results (step, value) values ('E.still_holds_roomB', (select count(*)::text from activity_bookings
                                  where attendee_id = v_a1 and session_id = v_sess2));

  -- 'missing': a session id that does not exist at all.
  insert into results (step, value) values ('E.cancel_missing_session', cancel_booking(v_nonexistent, v_a1));

  -- 'missing': a real session this attendee never booked - not the same branch as a
  -- nonexistent session, but the same code, exactly so the caller cannot tell them apart and
  -- has no need to.
  insert into results (step, value) values ('E.cancel_no_existing_booking', cancel_booking(v_sess3, v_a1));

  delete from events where id = v_event;
end $$;

-- ============================================================================================
-- Section F — switch_session's p_ignore_open (0020_switch_session_ignore_open.sql). Proves the
-- binding constraint from the spec, not just the happy path: the flag bypasses open/closed and
-- NOTHING else. A switch refused for 'closed' without the flag is a no-op; with the flag it
-- succeeds when nothing else refuses it, but still returns 'full' against a full target and
-- 'ineligible' against a target the attendee's category can't reach - each of those refusals
-- also a no-op.
-- ============================================================================================
do $$
declare
  v_org uuid;
  v_event uuid;
  v_act uuid;
  v_sess_a uuid;
  v_sess_b uuid;
  v_sess_c uuid;
  v_sess_d uuid;
  v_a1 uuid;
  v_a2 uuid;
  v_tok1 text := left(replace(gen_random_uuid()::text, '-', ''), 16);
  v_tok2 text := left(replace(gen_random_uuid()::text, '-', ''), 16);
begin
  select id into v_org from organisations limit 1;
  insert into events (org_id, slug, name, status)
    values (v_org, 'fixture-f-' || v_tok1, 'Fixture F', 'draft') returning id into v_event;
  -- booking_open starts true so book_session can place the attendees, then closes - mirroring
  -- the desk's actual sequence: book while open, close at the headcount cut-off, work the
  -- queue after. No categories yet - added partway through, once the capacity case below is
  -- done, for the same reason Section B keeps categories out of its capacity case: eligibility
  -- runs before capacity inside switch_session, so a category restriction in place early would
  -- pre-empt the capacity refusal and never let it fire.
  insert into activities (org_id, event_id, name, required, booking_open, max_per_attendee)
    values (v_org, v_event, 'Workshops', false, true, 1) returning id into v_act;
  insert into activity_sessions (event_id, activity_id, title, day, starts_at, capacity)
    values (v_event, v_act, 'Room A', current_date, '09:30', 5) returning id into v_sess_a;
  insert into activity_sessions (event_id, activity_id, title, day, starts_at, capacity)
    values (v_event, v_act, 'Room B', current_date, '11:30', 5) returning id into v_sess_b;
  -- Room C: capacity 1, filled by a second attendee below - the target for the capacity case.
  insert into activity_sessions (event_id, activity_id, title, day, starts_at, capacity)
    values (v_event, v_act, 'Room C (full)', current_date, '13:30', 1) returning id into v_sess_c;
  -- Room D: plenty of room, empty - the target for the eligibility case, so 'ineligible' is
  -- what fires there and not 'full'.
  insert into activity_sessions (event_id, activity_id, title, day, starts_at, capacity)
    values (v_event, v_act, 'Room D', current_date, '15:30', 5) returning id into v_sess_d;
  insert into attendees (org_id, event_id, token, name, source)
    values (v_org, v_event, v_tok1, 'Queued switch', 'walkin') returning id into v_a1;
  insert into attendees (org_id, event_id, token, name, source)
    values (v_org, v_event, v_tok2, 'Fills room C', 'walkin') returning id into v_a2;

  insert into results (step, value) values ('F.book_roomA', book_session(v_sess_a, v_a1, false));
  update activities set booking_open = false where id = v_act;
  -- a2 is placed into the (soon to be) full Room C by the desk, same as a1's later switch: the
  -- activity is already closed, so this also needs the flag.
  insert into results (step, value) values ('F.book_roomC_a2', book_session(v_sess_c, v_a2, true));

  -- No flag: refused 'closed', and must be a no-op - still holds A, not B.
  insert into results (step, value) values ('F.switch_closed', switch_session(v_sess_a, v_sess_b, v_a1));
  insert into results (step, value) values ('F.still_holds_roomA', (select count(*)::text from activity_bookings
                                  where attendee_id = v_a1 and session_id = v_sess_a));
  insert into results (step, value) values ('F.not_holding_roomB', (select count(*)::text from activity_bookings
                                  where attendee_id = v_a1 and session_id = v_sess_b));

  -- Flag set, nothing else refuses it: succeeds despite booking_open = false.
  insert into results (step, value) values ('F.switch_ignored_open', switch_session(v_sess_a, v_sess_b, v_a1, true));
  insert into results (step, value) values ('F.holds_roomB_after', (select count(*)::text from activity_bookings
                                  where attendee_id = v_a1 and session_id = v_sess_b));
  insert into results (step, value) values ('F.holds_roomA_after', (select count(*)::text from activity_bookings
                                  where attendee_id = v_a1 and session_id = v_sess_a));

  -- Flag set, target is FULL (Room C, capacity 1, held by a2, no category restriction yet so
  -- capacity is what actually fires): must still return 'full', and must still be a no-op - a1
  -- keeps Room B, does not gain Room C.
  insert into results (step, value) values ('F.switch_ignored_open_full', switch_session(v_sess_b, v_sess_c, v_a1, true));
  insert into results (step, value) values ('F.kept_roomB_after_full', (select count(*)::text from activity_bookings
                                  where attendee_id = v_a1 and session_id = v_sess_b));
  insert into results (step, value) values ('F.not_holding_roomC', (select count(*)::text from activity_bookings
                                  where attendee_id = v_a1 and session_id = v_sess_c));

  -- Flag set, target is INELIGIBLE (Room D has plenty of capacity, so this isolates eligibility
  -- from the capacity case above): a1's category is null, the activity now requires 'VIP', so
  -- this must return 'ineligible', and must still be a no-op - a1 keeps Room B.
  update activities set categories = array['VIP'] where id = v_act;
  insert into results (step, value) values ('F.switch_ignored_open_ineligible', switch_session(v_sess_b, v_sess_d, v_a1, true));
  insert into results (step, value) values ('F.kept_roomB_after_ineligible', (select count(*)::text from activity_bookings
                                  where attendee_id = v_a1 and session_id = v_sess_b));
  insert into results (step, value) values ('F.not_holding_roomD', (select count(*)::text from activity_bookings
                                  where attendee_id = v_a1 and session_id = v_sess_d));

  delete from events where id = v_event;
end $$;

-- ============================================================================================
-- Section G — decide_request's status guard, sequentially. See the header note above for
-- exactly what this can and cannot demonstrate about the concurrent race the migration closes.
-- ============================================================================================
do $$
declare
  v_org uuid;
  v_user uuid;
  v_event uuid;
  v_act uuid;
  v_sess_a uuid;
  v_sess_b uuid;
  v_a1 uuid;
  v_req uuid;
  v_tok1 text := left(replace(gen_random_uuid()::text, '-', ''), 16);
begin
  select id into v_org from organisations limit 1;
  -- Any real auth.users row will do: decided_by is a foreign key to auth.users(id), and this
  -- fixture is proving decide_request's status guard, not who a real desk account resolves to.
  select id into v_user from auth.users limit 1;
  insert into events (org_id, slug, name, status)
    values (v_org, 'fixture-g-' || v_tok1, 'Fixture G', 'draft') returning id into v_event;
  insert into activities (org_id, event_id, name, required, booking_open, max_per_attendee)
    values (v_org, v_event, 'Workshops', false, true, 1) returning id into v_act;
  insert into activity_sessions (event_id, activity_id, title, day, starts_at, capacity)
    values (v_event, v_act, 'Room A', current_date, '09:30', 5) returning id into v_sess_a;
  insert into activity_sessions (event_id, activity_id, title, day, starts_at, capacity)
    values (v_event, v_act, 'Room B', current_date, '11:30', 5) returning id into v_sess_b;
  insert into attendees (org_id, event_id, token, name, source)
    values (v_org, v_event, v_tok1, 'Queued switch', 'walkin') returning id into v_a1;

  insert into results (step, value) values ('G.book_roomA', book_session(v_sess_a, v_a1, false));

  -- The pending request, inserted directly the way createRequest (src/lib/db/activity-
  -- requests.ts) would: this fixture proves decide_request in isolation, not request creation,
  -- which is already covered by the app-level tests in tests/activity-requests.test.ts.
  insert into activity_change_requests (event_id, activity_id, attendee_id, kind, from_session_id, to_session_id)
    values (v_event, v_act, v_a1, 'switch', v_sess_a, v_sess_b) returning id into v_req;

  -- First call: approve. Must succeed, actually move the booking, and stamp the row as the
  -- winner of the (uncontested, here) row lock.
  insert into results (step, value) values ('G.approve_ok', decide_request(v_req, 'approved', v_user));
  insert into results (step, value) values ('G.status_after_approve',
    (select status from activity_change_requests where id = v_req));
  insert into results (step, value) values ('G.decided_by_is_user',
    (select (decided_by = v_user)::text from activity_change_requests where id = v_req));
  insert into results (step, value) values ('G.moved_to_roomB', (select count(*)::text from activity_bookings
                                  where attendee_id = v_a1 and session_id = v_sess_b));
  insert into results (step, value) values ('G.left_roomA', (select count(*)::text from activity_bookings
                                  where attendee_id = v_a1 and session_id = v_sess_a));
  insert into results (step, value) values ('G.total_bookings_for_attendee',
    (select count(*)::text from activity_bookings where attendee_id = v_a1));

  -- Second call, on the SAME row, now already decided: a decline arriving after the fact — the
  -- sequential stand-in for desk B losing the row lock to desk A's approve. Must be refused
  -- outright, not silently applied or allowed to overwrite the first decision.
  insert into results (step, value) values ('G.decline_after_approve_is_gone', decide_request(v_req, 'declined', v_user));
  insert into results (step, value) values ('G.status_still_approved',
    (select status from activity_change_requests where id = v_req));

  delete from events where id = v_event;
end $$;

select id, step, value from results order by id;
