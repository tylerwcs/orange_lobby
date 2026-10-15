// Executable evidence that migrations 0086-0087 (scheduled opening, D600-D601, D610-D612) hold
// against a real database. vitest has no database (D141), so the pure rules are unit-tested and
// this proves the SQL.
//
// WHAT THIS PROVES:
//   1. An open activity cannot carry opens_at (activities_open_unscheduled).
//   2. open_scheduled_activities() opens a due activity and clears its opens_at.
//   3. It leaves a future one alone, and a due one in an archived event alone.
//   4. The anon key cannot run it.
//   5. schedule_opening() writes only to a closed activity of a non-archived event, and says why
//      not otherwise ('open', 'archived', 'missing') - never a constraint error (D611).
//   6. Archiving an event clears its activities' schedules (D610).
//   7. The anon key cannot run schedule_opening either.
//
// HOW TO RUN: npm run check:schedule (node --env-file=.env.local scripts/scheduled-open-db-check.mjs).
// SAFE TO RE-RUN: it creates its own two events with random slugs and deletes them in `finally`.
// It never touches the event with slug `ecphub`. Running the function opens any other activity
// that is genuinely due - which is exactly what the timer would do within the minute anyway.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key || !anonKey) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/scheduled-open-db-check.mjs");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const runId = randomUUID().replaceAll("-", "");
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
};
const must = ({ data, error }) => { if (error) throw error; return data; };

const org = must(await db.from("organisations").select("id").limit(1).single());
const live = must(await db.from("events").insert({ org_id: org.id, name: `Schedule check ${runId}`, slug: `schedule-check-${runId}`, status: "live" }).select("id, org_id").single());
const archived = must(await db.from("events").insert({ org_id: org.id, name: `Schedule check old ${runId}`, slug: `schedule-old-${runId}`, status: "archived" }).select("id, org_id").single());

const base = { required: false, max_per_attendee: 1, questions: [], per_day: false, kind: "booking" };
const minute = 60_000;
const at = (ms) => new Date(Date.now() + ms).toISOString();

try {
  // 1. The constraint.
  const bad = await db.from("activities").insert({ ...base, org_id: live.org_id, event_id: live.id, name: "Bad", is_open: true, opens_at: at(minute) });
  check("an open activity cannot carry opens_at", bad.error?.code === "23514", bad.error?.code ?? "no error");

  const due = must(await db.from("activities").insert({ ...base, org_id: live.org_id, event_id: live.id, name: "Due", is_open: false, opens_at: at(-minute) }).select("id").single());
  const later = must(await db.from("activities").insert({ ...base, org_id: live.org_id, event_id: live.id, name: "Later", is_open: false, opens_at: at(60 * minute) }).select("id").single());
  const old = must(await db.from("activities").insert({ ...base, org_id: archived.org_id, event_id: archived.id, name: "Old", is_open: false, opens_at: at(-minute) }).select("id").single());

  // 4. Anon first, so a refusal is not masked by the service-role run below.
  const anonRun = await anon.rpc("open_scheduled_activities");
  check("the anon key cannot run open_scheduled_activities", Boolean(anonRun.error), anonRun.error?.code ?? "it ran");

  // 2 and 3. The timer may already have opened `due` in the minute since it was inserted, so
  // the count only has to be a number; the rows below are what prove the behaviour.
  const opened = must(await db.rpc("open_scheduled_activities"));
  check("it reports how many it opened", typeof opened === "number", String(opened));
  const rows = must(await db.from("activities").select("id, is_open, opens_at").in("id", [due.id, later.id, old.id]));
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  check("a due activity opens", byId[due.id].is_open === true);
  check("a due activity's opens_at clears", byId[due.id].opens_at === null);
  check("a future activity stays closed and scheduled", byId[later.id].is_open === false && byId[later.id].opens_at !== null);
  check("an archived event's due activity stays closed", byId[old.id].is_open === false && byId[old.id].opens_at !== null);

  // 5. schedule_opening (D611).
  const when = at(2 * 60 * minute);
  const sched = (id, eventId) => db.rpc("schedule_opening", { p_activity_id: id, p_event_id: eventId, p_at: when });
  const closed = must(await db.from("activities").insert({ ...base, org_id: live.org_id, event_id: live.id, name: "Closed", is_open: false }).select("id").single());
  const r1 = await sched(closed.id, live.id);
  check("schedule_opening schedules a closed activity", r1.data === "ok", r1.error?.message ?? r1.data);
  const closedRow = must(await db.from("activities").select("opens_at").eq("id", closed.id).single());
  check("... and writes its opens_at", closedRow.opens_at !== null && new Date(closedRow.opens_at).getTime() === new Date(when).getTime());
  // `due` was opened above: the race the action used to lose with a 23514.
  const r2 = await sched(due.id, live.id);
  check("schedule_opening answers 'open' for an open activity, without an error", r2.data === "open", r2.error?.message ?? r2.data);
  const r3 = await sched(old.id, archived.id);
  check("schedule_opening answers 'archived' in an archived event", r3.data === "archived", r3.error?.message ?? r3.data);
  const r4 = await sched(closed.id, randomUUID());
  check("schedule_opening answers 'missing' when the activity is not that event's", r4.data === "missing", r4.error?.message ?? r4.data);
  const r5 = await sched(randomUUID(), live.id);
  check("schedule_opening answers 'missing' for no such activity", r5.data === "missing", r5.error?.message ?? r5.data);

  // 7.
  const anonSched = await anon.rpc("schedule_opening", { p_activity_id: closed.id, p_event_id: live.id, p_at: when });
  check("the anon key cannot run schedule_opening", Boolean(anonSched.error), anonSched.error?.code ?? "it ran");

  // 6. Archiving clears schedules (D610). `later` and `closed` are both scheduled on `live`.
  must(await db.from("events").update({ status: "archived" }).eq("id", live.id));
  const afterArchive = must(await db.from("activities").select("id, opens_at").in("id", [later.id, closed.id]));
  check("archiving an event clears its schedules", afterArchive.every((r) => r.opens_at === null), JSON.stringify(afterArchive.map((r) => r.opens_at)));
} finally {
  const { error } = await db.from("events").delete().in("id", [live.id, archived.id]);
  if (error) console.error("cleanup failed", error);
}

if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
console.log("All checks passed");
