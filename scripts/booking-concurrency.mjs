// Executable regression evidence that book_session's row lock actually enforces capacity
// under contention (supabase/migrations/0017_book_session.sql). Committed alongside
// scripts/book-session-fixture.sql (Task 2's serial evidence for the same functions) because
// vitest has no database (D141): `count(*)` then `insert` passes every unit test ever written
// for it and still seats 31 people in a room of 30, and only a real concurrent run can see that.
//
// WHAT THIS PROVES:
//   - Exactly one of 50 simultaneous book_session calls against a one-seat session wins ('ok').
//   - Capacity holds under 50-way contention: the other 49 all come back 'full', and exactly
//     one row lands in activity_bookings — not zero, not two.
//
// HOW TO RUN: npm run check:booking (equivalent to
// `node --env-file=.env.local scripts/booking-concurrency.mjs`). Requires .env.local with
// NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the target project.
//
// SAFE TO RE-RUN: every event slug and attendee token this script creates embeds a freshly
// generated `runId` (crypto.randomUUID(), hyphens stripped), so back-to-back runs never collide
// on events.slug or attendees.token (both `unique`) even if a previous run died before its own
// cleanup ran. The event is deleted in a `finally` block on every exit path, cascading its
// activity, session, attendees and bookings with it; a failed delete is reported as a WARNING
// rather than swallowed silently.
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

// Not wrapped in the try/catch below: nothing has been created yet if either of these two
// calls fails, so there is nothing to clean up — a direct FAIL + exit is enough.
const { data: org, error: orgErr } = await db.from("organisations").select("id").limit(1).single();
if (orgErr) { console.error(`FAIL: ${orgErr.message}`); process.exit(1); }
const { data: event, error: eventErr } = await db.from("events")
  .insert({ org_id: org.id, slug: `concurrency-${runId}`, name: "Concurrency check", status: "draft" })
  .select("id").single();
if (eventErr) { console.error(`FAIL: ${eventErr.message}`); process.exit(1); }

try {
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

    const tally = results.reduce((acc, r) => ({ ...acc, [r]: (acc[r] ?? 0) + 1 }), {});
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
} catch (err) {
  console.error(`FAIL: ${err.message}`);
  process.exit(1);
}
