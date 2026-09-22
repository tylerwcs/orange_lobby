// Executable regression evidence that the row locks in book_session, and now cancel_booking,
// actually enforce their invariants under contention (supabase/migrations/0017_book_session.sql,
// 0018_cancel_booking.sql). Committed alongside scripts/book-session-fixture.sql (Task 2's serial
// evidence for the same functions) because vitest has no database (D141), and because a
// sequential fixture is structurally unable to prove serialisation at all: two calls made one
// after the other can never race, no matter what the SQL does. Only a real concurrent run can
// show that.
//
// WHAT THIS PROVES:
//   - Scenario 1 (single session): exactly one of 50 simultaneous book_session calls against a
//     one-seat session wins ('ok'). Capacity holds under 50-way contention: the other 49 all come
//     back 'full', and exactly one row lands in activity_bookings - not zero, not two.
//   - Scenario 2 (cap across many DIFFERENT sessions): one attendee fires book_session at 20
//     different sessions of the same max_per_attendee=1 activity at once. Locking only the
//     session row (as book_session originally did) cannot serialise this - each call locks a
//     different row, all can read held=0, and all can insert. Two concurrent calls raced this
//     unreliably in practice (the interleaving window is narrow), so this uses the same
//     higher-parallelism trick as Scenario 1, against many rows instead of one. book_session now
//     also locks the activity row, which is what the per-attendee cap actually counts across, so
//     exactly one call wins ('ok'), the other 19 are refused ('limit'), and exactly one booking
//     row exists.
//   - Scenario 3 (required-activity cancel across many DIFFERENT sessions): an attendee holding
//     all 10 sessions of a required, max_per_attendee=10 activity (10 is the schema's own cap on
//     max_per_attendee) fires cancel_booking at all of them at once. The same hole as Scenario 2
//     but on the way out: locking only the session row cannot serialise a count that spans the
//     activity, so every call could read the same held count and all of them pass "required and
//     held<=1" - leaving zero bookings for an activity whose whole point is holding one.
//     cancel_booking now also locks the activity row: exactly 9 calls win ('ok'), the last one is
//     refused ('required'), and exactly one booking row survives.
//   - Scenario 4 (two approvals racing for one seat): two attendees hold the same source
//     session and each has a pending switch request into the same one-seat target session.
//     The desk approves both requests at once through decide_request (0021_decide_request.sql)
//     - the only path that decides a request. decide_request's own row lock only serialises two
//     calls against the SAME request row, which these are not; what has to hold here is
//     switch_session's session-row lock, taken inside the transaction each decide_request call
//     opens. Exactly one call returns 'ok' and moves its attendee into the target, the other
//     returns 'full' and is a no-op, and exactly one booking row lands in the target session.
//
// HOW TO RUN: npm run check:booking (equivalent to
// `node --env-file=.env.local scripts/booking-concurrency.mjs`). Requires .env.local with
// NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the target project.
//
// SAFE TO RE-RUN: every event slug and attendee token this script creates embeds a freshly
// generated `runId` (crypto.randomUUID(), hyphens stripped), so back-to-back runs never collide
// on events.slug or attendees.token (both `unique`) even if a previous run died before its own
// cleanup ran. Each scenario deletes its own event in a `finally` block on every exit path,
// cascading its activities, sessions, attendees and bookings with it; a failed delete is reported
// as a WARNING rather than swallowed silently. Scenarios run one after another - if one fails, it
// still cleans up after itself before the process exits non-zero, but later scenarios do not run.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const PARALLEL = 50;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/booking-concurrency.mjs");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// A plain throw, not process.exit(): process.exit() terminates immediately and does not run
// a pending `finally` block, which would skip the event cleanup below on exactly the failure
// path (an assertion catching a real problem) where leaving orphan test data behind matters
// most. Throwing lets `finally` run first; the outer catch turns it into the non-zero exit.
const fail = (message) => { throw new Error(message); };

// Unique per run: attendees.token and events.slug are both globally unique, so fixed values
// would collide with leftovers from a run that died before its own cleanup ran.
const runId = randomUUID().replace(/-/g, "");

// Not wrapped in a try/catch: nothing has been created yet if this fails, so there is nothing
// to clean up - a direct FAIL + exit is enough.
const { data: org, error: orgErr } = await db.from("organisations").select("id").limit(1).single();
if (orgErr) { console.error(`FAIL: ${orgErr.message}`); process.exit(1); }

/** Tallies an array of RPC results (or `error:<message>` for a failed call) by value. */
const tallyOf = (results) => results.reduce((acc, r) => ({ ...acc, [r]: (acc[r] ?? 0) + 1 }), {});

async function scenarioCapacityOneSeat() {
  console.log("\n--- Scenario 1: one seat, 50-way contention ---");
  const { data: event, error: eventErr } = await db.from("events")
    .insert({ org_id: org.id, slug: `concurrency-1-${runId}`, name: "Concurrency check 1", status: "draft" })
    .select("id").single();
  if (eventErr) fail(eventErr.message);

  try {
    const { data: activity, error: activityErr } = await db.from("activities")
      .insert({ org_id: org.id, event_id: event.id, name: "Race", booking_open: true, max_per_attendee: 1 })
      .select("id").single();
    if (activityErr) fail(activityErr.message);

    const { data: session, error: sessionErr } = await db.from("activity_sessions")
      .insert({ event_id: event.id, activity_id: activity.id, title: "One seat", day: "2026-10-01", starts_at: "09:00", capacity: 1 })
      .select("id").single();
    if (sessionErr) fail(sessionErr.message);

    const people = Array.from({ length: PARALLEL }, (_, i) => ({
      org_id: org.id, event_id: event.id, token: `race-${runId}-${String(i).padStart(4, "0")}`, name: `Racer ${i}`, source: "walkin",
    }));
    const { data: attendees, error: attendeesErr } = await db.from("attendees").insert(people).select("id");
    if (attendeesErr) fail(attendeesErr.message);

    const results = await Promise.all(attendees.map((a) =>
      db.rpc("book_session", { p_session_id: session.id, p_attendee_id: a.id, p_ignore_open: false })
        .then((r) => (r.error ? `error:${r.error.message}` : r.data))));

    const tally = tallyOf(results);
    const { count, error: countErr } = await db.from("activity_bookings")
      .select("id", { count: "exact", head: true }).eq("session_id", session.id);
    if (countErr) fail(countErr.message);

    console.log(`${PARALLEL} parallel calls ->`, tally);
    console.log(`rows in activity_bookings: ${count}`);

    if (tally.ok !== 1) fail(`expected exactly 1 'ok', got ${tally.ok ?? 0}`);
    if (tally.full !== PARALLEL - 1) fail(`expected ${PARALLEL - 1} 'full', got ${tally.full ?? 0}`);
    if (count !== 1) fail(`expected 1 booking row, found ${count}`);
    console.log("PASS: one seat, one winner.");
  } finally {
    const { error: delErr } = await db.from("events").delete().eq("id", event.id);
    if (delErr) console.error(`WARNING: failed to clean up event ${event.id}: ${delErr.message}`);
  }
}

// Only 2 concurrent calls raced the pre-fix (session-only-lock) book_session unreliably in
// practice - the timing window where BOTH calls read `held` before EITHER inserts is narrow
// enough with just two sessions that it did not reproduce on every run. Scenario 1 gets
// reliable contention from 50-way parallelism against one row; this scenario needs the same
// trick against many DIFFERENT rows instead, since the whole point is that a session-only lock
// cannot serialise them against each other.
const CAP_RACE_SESSIONS = 20;

/**
 * The hole a session-only lock cannot close: the per-attendee cap is a count across every
 * session of the activity, and two DIFFERENT session rows never serialise a count that spans
 * the activity they both belong to. Only one attendee is needed - the race is between the
 * calls, not between people.
 */
async function scenarioCapAcrossSessions() {
  console.log(`\n--- Scenario 2: max_per_attendee=1, one attendee books ${CAP_RACE_SESSIONS} different sessions at once ---`);
  const { data: event, error: eventErr } = await db.from("events")
    .insert({ org_id: org.id, slug: `concurrency-2-${runId}`, name: "Concurrency check 2", status: "draft" })
    .select("id").single();
  if (eventErr) fail(eventErr.message);

  try {
    const { data: activity, error: activityErr } = await db.from("activities")
      .insert({ org_id: org.id, event_id: event.id, name: "Cap race", booking_open: true, max_per_attendee: 1 })
      .select("id").single();
    if (activityErr) fail(activityErr.message);

    // Plenty of room in each session: this scenario is about the per-attendee CAP, not
    // per-session capacity, so capacity must never be the thing that refuses any call.
    const sessionRows = Array.from({ length: CAP_RACE_SESSIONS }, (_, i) => ({
      event_id: event.id, activity_id: activity.id, title: `Room ${i}`,
      day: "2026-10-01", starts_at: "09:00", capacity: 5,
    }));
    const { data: sessions, error: sessionsErr } = await db.from("activity_sessions").insert(sessionRows).select("id");
    if (sessionsErr) fail(sessionsErr.message);

    const { data: attendee, error: attendeeErr } = await db.from("attendees")
      .insert({ org_id: org.id, event_id: event.id, token: `cap-${runId}`, name: "Capper", source: "walkin" })
      .select("id").single();
    if (attendeeErr) fail(attendeeErr.message);

    const results = await Promise.all(sessions.map((s) =>
      db.rpc("book_session", { p_session_id: s.id, p_attendee_id: attendee.id, p_ignore_open: false })
        .then((r) => (r.error ? `error:${r.error.message}` : r.data))));

    const tally = tallyOf(results);
    const { count, error: countErr } = await db.from("activity_bookings")
      .select("id", { count: "exact", head: true }).eq("activity_id", activity.id).eq("attendee_id", attendee.id);
    if (countErr) fail(countErr.message);

    console.log(`${CAP_RACE_SESSIONS} concurrent book_session calls, different sessions, same attendee ->`, tally);
    console.log(`rows in activity_bookings for this attendee: ${count}`);

    if (tally.ok !== 1) fail(`expected exactly 1 'ok', got ${tally.ok ?? 0}`);
    if (tally.limit !== CAP_RACE_SESSIONS - 1) fail(`expected ${CAP_RACE_SESSIONS - 1} 'limit', got ${tally.limit ?? 0}`);
    if (count !== 1) fail(`expected 1 booking row for this attendee, found ${count}`);
    console.log("PASS: the per-attendee cap held across many different sessions.");
  } finally {
    const { error: delErr } = await db.from("events").delete().eq("id", event.id);
    if (delErr) console.error(`WARNING: failed to clean up event ${event.id}: ${delErr.message}`);
  }
}

// activities.max_per_attendee has a check constraint of 1-10 (0016_activities.sql), so 10 is
// the most sessions one attendee can ever hold of one activity - and, for the same reason as
// CAP_RACE_SESSIONS above, the most reliable width for forcing the pre-fix race to reproduce.
const REQUIRED_RACE_SESSIONS = 10;

/**
 * The same hole, on the way out. `cancel_booking`'s "required, held<=1" guard is also a count
 * across every session of the activity: an attendee holding every session of a required,
 * max_per_attendee=10 activity fires cancel_booking at all of them at once. A session-only lock
 * lets every call read the same held count and all of them pass; the activity lock serialises
 * them so only the calls that leave at least one booking behind succeed, and the last one is
 * refused.
 */
async function scenarioRequiredCancelAcrossSessions() {
  console.log(`\n--- Scenario 3: required activity, one attendee cancels all ${REQUIRED_RACE_SESSIONS} held sessions at once ---`);
  const { data: event, error: eventErr } = await db.from("events")
    .insert({ org_id: org.id, slug: `concurrency-3-${runId}`, name: "Concurrency check 3", status: "draft" })
    .select("id").single();
  if (eventErr) fail(eventErr.message);

  try {
    const { data: activity, error: activityErr } = await db.from("activities")
      .insert({ org_id: org.id, event_id: event.id, name: "Required race", required: true, booking_open: true, max_per_attendee: REQUIRED_RACE_SESSIONS })
      .select("id").single();
    if (activityErr) fail(activityErr.message);

    const sessionRows = Array.from({ length: REQUIRED_RACE_SESSIONS }, (_, i) => ({
      event_id: event.id, activity_id: activity.id, title: `Room ${i}`,
      day: "2026-10-01", starts_at: "09:00", capacity: 5,
    }));
    const { data: sessions, error: sessionsErr } = await db.from("activity_sessions").insert(sessionRows).select("id");
    if (sessionsErr) fail(sessionsErr.message);

    const { data: attendee, error: attendeeErr } = await db.from("attendees")
      .insert({ org_id: org.id, event_id: event.id, token: `reqrace-${runId}`, name: "Needs a choice", source: "walkin" })
      .select("id").single();
    if (attendeeErr) fail(attendeeErr.message);

    // Setup, not the race: booked one after another, so the attendee reliably holds all of
    // them before the concurrent cancels fire.
    for (const s of sessions) {
      const { data, error } = await db.rpc("book_session", { p_session_id: s.id, p_attendee_id: attendee.id, p_ignore_open: false });
      if (error) fail(error.message);
      if (data !== "ok") fail(`setup booking failed: expected 'ok', got '${data}'`);
    }

    const results = await Promise.all(sessions.map((s) =>
      db.rpc("cancel_booking", { p_session_id: s.id, p_attendee_id: attendee.id })
        .then((r) => (r.error ? `error:${r.error.message}` : r.data))));

    const tally = tallyOf(results);
    const { count, error: countErr } = await db.from("activity_bookings")
      .select("id", { count: "exact", head: true }).eq("activity_id", activity.id).eq("attendee_id", attendee.id);
    if (countErr) fail(countErr.message);

    console.log(`${REQUIRED_RACE_SESSIONS} concurrent cancel_booking calls, different sessions, same attendee ->`, tally);
    console.log(`rows in activity_bookings for this attendee: ${count}`);

    if (tally.ok !== REQUIRED_RACE_SESSIONS - 1) fail(`expected ${REQUIRED_RACE_SESSIONS - 1} 'ok', got ${tally.ok ?? 0}`);
    if (tally.required !== 1) fail(`expected exactly 1 'required', got ${tally.required ?? 0}`);
    if (count !== 1) fail(`expected 1 booking row left for this attendee, found ${count}`);
    console.log("PASS: the required-activity guard held across many different sessions.");
  } finally {
    const { error: delErr } = await db.from("events").delete().eq("id", event.id);
    if (delErr) console.error(`WARNING: failed to clean up event ${event.id}: ${delErr.message}`);
  }
}

/**
 * The queue's own contended path, exercised through the one function that ever decides a
 * request (decide_request, 0021_decide_request.sql) rather than switch_session directly.
 * Two attendees hold the same source session; each has a pending switch request into the
 * same one-seat target. The desk approves both at once.
 *
 * decide_request selects each request row `for update` before doing anything else, but that
 * lock only serialises two calls against the SAME row - these are two DIFFERENT rows, one per
 * attendee, so that lock never contends here. What has to hold instead is switch_session's own
 * session-row lock (0017/0020's `for update` over both session ids, in id order), taken inside
 * the same transaction each decide_request call opens for its nested approve. This proves that
 * chain end to end through the real admin path: exactly one approval wins ('ok') and moves its
 * attendee into the target, the other is refused ('full') and is a no-op - the attendee it
 * belongs to still holds the source session - and exactly one booking row lands in the target.
 */
async function scenarioApprovalsRaceForSeat() {
  console.log("\n--- Scenario 4: two approvals racing for one seat ---");

  // Nothing created yet if this fails, so a direct FAIL + exit is enough - same reasoning as
  // the org lookup above. decided_by is a foreign key to auth.users(id) (activity_change_
  // requests.decided_by, 0019_activity_change_requests.sql); any real row will do, the way
  // book-session-fixture.sql's Section G picks one, and this fails loudly rather than silently
  // if the target environment has no auth.users row to test against at all.
  const { data: userList, error: userErr } = await db.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (userErr) { console.error(`FAIL: ${userErr.message}`); process.exit(1); }
  const decidedBy = userList.users[0]?.id;
  if (!decidedBy) { console.error("FAIL: no auth.users row exists to use as decided_by"); process.exit(1); }

  const { data: event, error: eventErr } = await db.from("events")
    .insert({ org_id: org.id, slug: `concurrency-4-${runId}`, name: "Concurrency check 4", status: "draft" })
    .select("id").single();
  if (eventErr) fail(eventErr.message);

  try {
    const { data: activity, error: activityErr } = await db.from("activities")
      .insert({ org_id: org.id, event_id: event.id, name: "Queue race", booking_open: true, max_per_attendee: 1 })
      .select("id").single();
    if (activityErr) fail(activityErr.message);

    const { data: sessionA, error: sessionAErr } = await db.from("activity_sessions")
      .insert({ event_id: event.id, activity_id: activity.id, title: "Source", day: "2026-10-01", starts_at: "09:00", capacity: 2 })
      .select("id").single();
    if (sessionAErr) fail(sessionAErr.message);

    const { data: sessionB, error: sessionBErr } = await db.from("activity_sessions")
      .insert({ event_id: event.id, activity_id: activity.id, title: "Target", day: "2026-10-01", starts_at: "09:00", capacity: 1 })
      .select("id").single();
    if (sessionBErr) fail(sessionBErr.message);

    const { data: attendees, error: attendeesErr } = await db.from("attendees").insert([
      { org_id: org.id, event_id: event.id, token: `queue-x-${runId}`, name: "Racer X", source: "walkin" },
      { org_id: org.id, event_id: event.id, token: `queue-y-${runId}`, name: "Racer Y", source: "walkin" },
    ]).select("id");
    if (attendeesErr) fail(attendeesErr.message);
    const [attendeeX, attendeeY] = attendees;

    // Setup, not the race: both attendees booked into the source session one after another, so
    // each reliably holds a seat there before their switch requests are raised.
    for (const a of [attendeeX, attendeeY]) {
      const { data, error } = await db.rpc("book_session", { p_session_id: sessionA.id, p_attendee_id: a.id, p_ignore_open: false });
      if (error) fail(error.message);
      if (data !== "ok") fail(`setup booking failed: expected 'ok', got '${data}'`);
    }

    // Also setup: raising the requests is not the race, deciding them concurrently is. One
    // open request per attendee per activity is all either insert needs to satisfy
    // (activity_change_requests_one_open, 0019_activity_change_requests.sql).
    const { data: requests, error: requestsErr } = await db.from("activity_change_requests").insert([
      { event_id: event.id, activity_id: activity.id, attendee_id: attendeeX.id, kind: "switch", from_session_id: sessionA.id, to_session_id: sessionB.id },
      { event_id: event.id, activity_id: activity.id, attendee_id: attendeeY.id, kind: "switch", from_session_id: sessionA.id, to_session_id: sessionB.id },
    ]).select("id");
    if (requestsErr) fail(requestsErr.message);

    const results = await Promise.all(requests.map((r) =>
      db.rpc("decide_request", { p_request_id: r.id, p_status: "approved", p_user: decidedBy })
        .then((res) => (res.error ? `error:${res.error.message}` : res.data))));

    const tally = tallyOf(results);
    const { count, error: countErr } = await db.from("activity_bookings")
      .select("id", { count: "exact", head: true }).eq("session_id", sessionB.id);
    if (countErr) fail(countErr.message);

    console.log("2 concurrent decide_request approvals, same target session ->", tally);
    console.log(`rows in activity_bookings for the target session: ${count}`);

    if (tally.ok !== 1) fail(`expected exactly 1 'ok', got ${tally.ok ?? 0}`);
    if (tally.full !== 1) fail(`expected exactly 1 'full', got ${tally.full ?? 0}`);
    if (count !== 1) fail(`expected 1 booking row in the target session, found ${count}`);
    console.log("PASS: one seat, one winner, through the real admin approval path.");
  } finally {
    const { error: delErr } = await db.from("events").delete().eq("id", event.id);
    if (delErr) console.error(`WARNING: failed to clean up event ${event.id}: ${delErr.message}`);
  }
}

try {
  await scenarioCapacityOneSeat();
  await scenarioCapAcrossSessions();
  await scenarioRequiredCancelAcrossSessions();
  await scenarioApprovalsRaceForSeat();
  console.log("\nALL PASS");
} catch (err) {
  console.error(`\nFAIL: ${err.message}`);
  process.exit(1);
}
