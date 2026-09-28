// Executable regression evidence that the row lock in submit_answers actually enforces its
// invariants under contention (supabase/migrations/0030_kind_aware_writes.sql). Committed for the
// same reason as scripts/booking-concurrency.mjs: vitest has no database (D141), and a
// sequential fixture is structurally unable to prove serialisation at all — two calls made one
// after the other can never race, no matter what the SQL does. Only a real concurrent run can
// show that.
//
// WHAT THIS PROVES:
//   - Scenario 1 (total cap): a submission activity with max_per_attendee=1 gets 20 simultaneous submit_answers
//     calls from the same attendee. `count(*)` then `insert` is two statements, and without the
//     form-row lock, enough parallel callers can all read "0 used" before any of them inserts.
//     Locking the form row and re-counting under that lock means exactly one of the 20 wins
//     ('ok'), the other 19 are refused ('limit'), and exactly one row lands in activity_submissions.
//   - Scenario 2 (one-a-day): a form with per_day=true and no total cap gets 20 simultaneous
//     submit_answers calls from the same attendee for the same p_today. The explicit per_day check
//     is the same read-then-write shape as the cap check above and races the same way; the
//     partial unique index (activity_submissions_one_a_day, 0025_forms.sql, renamed in 0029) is the backstop the
//     unique_violation handler turns back into a reason code. Exactly one call wins ('ok'), the
//     other 19 are refused ('today'), and exactly one row lands in activity_submissions.
//   - Scenario 3 (revoke frees both checks): a form with max_per_attendee=1 AND per_day=true gets
//     one submission ('ok'), which is then revoked directly (status='submitted' -> 'revoked') -
//     the admin action, done by SQL here since only the write matters, not the route around it.
//     D339 says a revoked row stops counting toward the cap and the day, so 20 simultaneous
//     submit_answers calls for the same attendee and the same p_today should behave exactly like
//     a fresh attendee's first submission: one 'ok', 19 refusals ('limit' or 'today' - which one
//     depends on the check order inside submit_answers, not on anything this script controls),
//     and, at the end, exactly two rows for that attendee: the original, still revoked, and the
//     new one, submitted. Proves D338/D339 hold under contention, not just sequentially.
//
// HOW TO RUN: npm run check:submit (equivalent to
// `node --env-file=.env.local scripts/submit-concurrency.mjs`). Requires .env.local with
// NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the target project.
//
// SAFE TO RE-RUN: the event slug and attendee token this script creates embed a freshly
// generated `runId` (crypto.randomUUID(), hyphens stripped), so back-to-back runs never collide
// on events.slug or attendees.token (both `unique`) even if a previous run died before its own
// cleanup ran. Each scenario deletes its own event in a `finally` block on every exit path,
// cascading its forms, submissions and attendees with it; a failed delete is reported as a
// WARNING rather than swallowed silently. Scenarios run one after another — if one fails, it
// still cleans up after itself before the process exits non-zero, but later scenarios do not run.
//
// SCOPE: every statement this script issues is scoped to the throwaway event it creates for
// that scenario (by event_id, activity_id or attendee_id all rooted in that event). It never reads
// or writes any pre-existing event, attendee, form or submission.
import { randomUUID, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const PARALLEL = 20;
const ORG_ID = "2433ade8-4292-45f2-92e8-c7b2db2c9356";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/submit-concurrency.mjs");
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

// Mirrors src/lib/tokens.ts (TOKEN_ALPHABET, TOKEN_LENGTH) — that module is TypeScript, so this
// script generates its own valid, unique 12-char tokens inline rather than importing it.
const TOKEN_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const TOKEN_LENGTH = 12;
function freshToken() {
  const bytes = randomBytes(TOKEN_LENGTH * 2);
  let out = "";
  for (let i = 0; out.length < TOKEN_LENGTH && i < bytes.length; i++) {
    const b = bytes[i];
    if (b >= 248) continue; // reject to avoid modulo bias (248 = 31*8)
    out += TOKEN_ALPHABET[b % TOKEN_ALPHABET.length];
  }
  return out.length === TOKEN_LENGTH ? out : freshToken();
}

/** Tallies an array of RPC results (or `error:<message>` for a failed call) by value. */
const tallyOf = (results) => results.reduce((acc, r) => ({ ...acc, [r]: (acc[r] ?? 0) + 1 }), {});

/**
 * The hole a check-then-insert without a lock leaves open: `used >= max_per_attendee` reads a
 * stale count for every caller that arrives before the first insert commits. One attendee
 * fires submit_answers at the same activity 20 times at once; if the activity row is not locked, enough
 * of those 20 can each read "0 used" and all insert. Locking the form row and re-counting under
 * it means only the first to acquire the lock ever sees "0 used" — everyone behind it sees "1
 * used" once it commits.
 */
async function scenarioTotalCap() {
  console.log(`\n--- Scenario 1: max_per_attendee=1, ${PARALLEL}-way contention ---`);
  const { data: event, error: eventErr } = await db.from("events")
    .insert({ org_id: ORG_ID, slug: `zz-test-submit-1-${runId}`, name: "TEMP submit-concurrency check 1" })
    .select("id").single();
  if (eventErr) fail(eventErr.message);

  try {
    const { data: form, error: formErr } = await db.from("activities")
      .insert({ org_id: ORG_ID, event_id: event.id, name: "Cap race", kind: "submission", is_open: true, max_per_attendee: 1 })
      .select("id").single();
    if (formErr) fail(formErr.message);

    const { data: attendee, error: attendeeErr } = await db.from("attendees")
      .insert({ org_id: ORG_ID, event_id: event.id, token: freshToken(), name: "Capper", source: "walkin", status: "active" })
      .select("id").single();
    if (attendeeErr) fail(attendeeErr.message);

    const results = await Promise.all(Array.from({ length: PARALLEL }, () =>
      db.rpc("submit_answers", { p_activity_id: form.id, p_attendee_id: attendee.id, p_answers: {}, p_today: "2026-10-01" })
        .then((r) => (r.error ? `error:${r.error.message}` : r.data))));

    const tally = tallyOf(results);
    const { count, error: countErr } = await db.from("activity_submissions")
      .select("id", { count: "exact", head: true }).eq("activity_id", form.id).eq("attendee_id", attendee.id);
    if (countErr) fail(countErr.message);

    console.log(`${PARALLEL} parallel calls ->`, tally);
    console.log(`rows in activity_submissions: ${count}`);

    if (tally.ok !== 1) fail(`expected exactly 1 'ok', got ${tally.ok ?? 0}`);
    if (tally.limit !== PARALLEL - 1) fail(`expected ${PARALLEL - 1} 'limit', got ${tally.limit ?? 0}`);
    if (count !== 1) fail(`expected 1 submission row, found ${count}`);
    console.log("PASS: total cap held, one winner.");
  } finally {
    const { error: delErr } = await db.from("events").delete().eq("id", event.id);
    if (delErr) console.error(`WARNING: failed to clean up event ${event.id}: ${delErr.message}`);
  }
}

/**
 * The same shape, on the daily cap: a form with per_day=true and no total cap gets 20
 * simultaneous submit_answers calls from one attendee for the same p_today. The explicit
 * "already submitted today" check races exactly like the total-cap check above; the partial
 * unique index (activity_submissions_one_a_day) is what actually stops a second row from landing
 * if two callers both pass the check, and the unique_violation handler - scoped to that one
 * constraint by name, so a genuine fault elsewhere in the table still re-raises - turns that
 * into 'today' rather than an unhandled error. 'today' names the situation the attendee is in,
 * the same word canSubmit (src/lib/forms.ts) uses for it, not 'duplicate' (the mechanism that
 * caught it) - the two vocabularies must agree, since the portal turns this code into a
 * sentence (D167).
 */
async function scenarioPerDay() {
  console.log(`\n--- Scenario 2: per_day=true, ${PARALLEL}-way contention, same day ---`);
  const { data: event, error: eventErr } = await db.from("events")
    .insert({ org_id: ORG_ID, slug: `zz-test-submit-2-${runId}`, name: "TEMP submit-concurrency check 2" })
    .select("id").single();
  if (eventErr) fail(eventErr.message);

  try {
    const { data: form, error: formErr } = await db.from("activities")
      .insert({ org_id: ORG_ID, event_id: event.id, name: "Daily race", kind: "submission", is_open: true, max_per_attendee: null, per_day: true })
      .select("id").single();
    if (formErr) fail(formErr.message);

    const { data: attendee, error: attendeeErr } = await db.from("attendees")
      .insert({ org_id: ORG_ID, event_id: event.id, token: freshToken(), name: "Dupper", source: "walkin", status: "active" })
      .select("id").single();
    if (attendeeErr) fail(attendeeErr.message);

    const results = await Promise.all(Array.from({ length: PARALLEL }, () =>
      db.rpc("submit_answers", { p_activity_id: form.id, p_attendee_id: attendee.id, p_answers: {}, p_today: "2026-10-01" })
        .then((r) => (r.error ? `error:${r.error.message}` : r.data))));

    const tally = tallyOf(results);
    const { count, error: countErr } = await db.from("activity_submissions")
      .select("id", { count: "exact", head: true }).eq("activity_id", form.id).eq("attendee_id", attendee.id);
    if (countErr) fail(countErr.message);

    console.log(`${PARALLEL} parallel calls ->`, tally);
    console.log(`rows in activity_submissions: ${count}`);

    if (tally.ok !== 1) fail(`expected exactly 1 'ok', got ${tally.ok ?? 0}`);
    if (tally.today !== PARALLEL - 1) fail(`expected ${PARALLEL - 1} 'today', got ${tally.today ?? 0}`);
    if (count !== 1) fail(`expected 1 submission row, found ${count}`);
    console.log("PASS: one-a-day held, one winner.");
  } finally {
    const { error: delErr } = await db.from("events").delete().eq("id", event.id);
    if (delErr) console.error(`WARNING: failed to clean up event ${event.id}: ${delErr.message}`);
  }
}

/**
 * D338/D339: revoking a submission stops it counting toward the cap AND the day, so the
 * attendee can submit again under the very rule that blocked them, on the very day it blocked
 * them. This activity carries max_per_attendee=1 and per_day=true together, so a resubmit that
 * races past a revoke has to clear both live checks under the same row lock scenarios 1 and 2
 * exercise separately. Which of the two refusals ('limit' or 'today') the 19 losers get depends
 * on submit_answers' internal check order (0053_submission_status.sql checks max_per_attendee
 * before per_day) - an implementation detail this script does not pin down, because what
 * actually matters is that revoking frees the slot at all, and that only one caller ever gets it.
 */
async function scenarioResubmitAfterRevoke() {
  console.log(`\n--- Scenario 3: revoke frees the cap and the day, then ${PARALLEL}-way contention over the resubmit ---`);
  const { data: event, error: eventErr } = await db.from("events")
    .insert({ org_id: ORG_ID, slug: `zz-test-submit-3-${runId}`, name: "TEMP submit-concurrency check 3" })
    .select("id").single();
  if (eventErr) fail(eventErr.message);

  try {
    const { data: form, error: formErr } = await db.from("activities")
      .insert({ org_id: ORG_ID, event_id: event.id, name: "Revoke-and-resubmit race", kind: "submission", is_open: true, max_per_attendee: 1, per_day: true })
      .select("id").single();
    if (formErr) fail(formErr.message);

    const { data: attendee, error: attendeeErr } = await db.from("attendees")
      .insert({ org_id: ORG_ID, event_id: event.id, token: freshToken(), name: "Resubmitter", source: "walkin", status: "active" })
      .select("id").single();
    if (attendeeErr) fail(attendeeErr.message);

    const { data: first, error: firstErr } = await db.rpc("submit_answers",
      { p_activity_id: form.id, p_attendee_id: attendee.id, p_answers: {}, p_today: "2026-10-01" });
    if (firstErr) fail(firstErr.message);
    if (first !== "ok") fail(`expected the first submit to be 'ok', got ${first}`);

    const { data: original, error: originalErr } = await db.from("activity_submissions")
      .select("id").eq("activity_id", form.id).eq("attendee_id", attendee.id).single();
    if (originalErr) fail(originalErr.message);

    const { error: revokeErr } = await db.from("activity_submissions")
      .update({ status: "revoked" }).eq("id", original.id);
    if (revokeErr) fail(revokeErr.message);

    const results = await Promise.all(Array.from({ length: PARALLEL }, () =>
      db.rpc("submit_answers", { p_activity_id: form.id, p_attendee_id: attendee.id, p_answers: {}, p_today: "2026-10-01" })
        .then((r) => (r.error ? `error:${r.error.message}` : r.data))));

    const tally = tallyOf(results);
    const { data: rows, error: rowsErr } = await db.from("activity_submissions")
      .select("id, status").eq("activity_id", form.id).eq("attendee_id", attendee.id);
    if (rowsErr) fail(rowsErr.message);

    console.log(`${PARALLEL} parallel calls ->`, tally);
    console.log(`rows in activity_submissions: ${rows.length}`, rows.map((r) => r.status));

    if (tally.ok !== 1) fail(`expected exactly 1 'ok', got ${tally.ok ?? 0}`);
    const refused = (tally.limit ?? 0) + (tally.today ?? 0);
    if (refused !== PARALLEL - 1) fail(`expected ${PARALLEL - 1} refusals ('limit' or 'today'), got ${refused}`);
    if (rows.length !== 2) fail(`expected 2 rows for this attendee, found ${rows.length}`);
    const revokedCount = rows.filter((r) => r.status === "revoked").length;
    const submittedCount = rows.filter((r) => r.status === "submitted").length;
    if (revokedCount !== 1 || submittedCount !== 1) {
      fail(`expected 1 revoked and 1 submitted row, got ${revokedCount} revoked, ${submittedCount} submitted`);
    }
    console.log("PASS: revoke freed both the cap and the day; exactly one resubmit won.");
  } finally {
    const { error: delErr } = await db.from("events").delete().eq("id", event.id);
    if (delErr) console.error(`WARNING: failed to clean up event ${event.id}: ${delErr.message}`);
  }
}

try {
  await scenarioTotalCap();
  await scenarioPerDay();
  await scenarioResubmitAfterRevoke();
  console.log("\nALL PASS");
} catch (err) {
  console.error(`\nFAIL: ${err.message}`);
  process.exit(1);
}
