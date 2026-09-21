// Fires N bookings at a one-seat session at the same moment and asserts exactly one wins.
//
// Run: npm run check:booking
//
// This exists because vitest has no database (D141). `count(*)` then `insert` passes every
// unit test ever written for it and still seats 31 people in a room of 30.
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

const fail = (message) => { console.error(`FAIL: ${message}`); process.exit(1); };

// Unique per run: attendees.token and events.slug are both globally unique, so fixed values
// would collide with leftovers from a run that died before its own cleanup ran.
const runId = randomUUID().replace(/-/g, "");

const { data: org } = await db.from("organisations").select("id").limit(1).single();
const { data: event } = await db.from("events")
  .insert({ org_id: org.id, slug: `concurrency-${runId}`, name: "Concurrency check", status: "draft" })
  .select("id").single();

try {
  const { data: activity } = await db.from("activities")
    .insert({ org_id: org.id, event_id: event.id, name: "Race", booking_open: true, max_per_attendee: 1 })
    .select("id").single();
  const { data: session } = await db.from("activity_sessions")
    .insert({ event_id: event.id, activity_id: activity.id, title: "One seat", day: "2026-10-01", starts_at: "09:00", capacity: 1 })
    .select("id").single();

  const people = Array.from({ length: PARALLEL }, (_, i) => ({
    org_id: org.id, event_id: event.id, token: `race-${runId}-${String(i).padStart(4, "0")}`, name: `Racer ${i}`, source: "walkin",
  }));
  const { data: attendees } = await db.from("attendees").insert(people).select("id");

  const results = await Promise.all(attendees.map((a) =>
    db.rpc("book_session", { p_session_id: session.id, p_attendee_id: a.id, p_ignore_open: false })
      .then((r) => (r.error ? `error:${r.error.message}` : r.data))));

  const tally = results.reduce((acc, r) => ({ ...acc, [r]: (acc[r] ?? 0) + 1 }), {});
  const { count } = await db.from("activity_bookings")
    .select("id", { count: "exact", head: true }).eq("session_id", session.id);

  console.log(`${PARALLEL} parallel calls ->`, tally);
  console.log(`rows in activity_bookings: ${count}`);

  if (tally.ok !== 1) fail(`expected exactly 1 'ok', got ${tally.ok ?? 0}`);
  if (tally.full !== PARALLEL - 1) fail(`expected ${PARALLEL - 1} 'full', got ${tally.full ?? 0}`);
  if (count !== 1) fail(`expected 1 booking row, found ${count}`);
  console.log("PASS: one seat, one winner.");
} finally {
  await db.from("events").delete().eq("id", event.id);
}
