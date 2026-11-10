// Executable evidence that migration 0134 (personality passport results, D882) holds against a real
// database. vitest has no database (D141), so the pure rules are unit-tested and this proves the SQL.
//
// WHAT THIS PROVES:
//   1. A result inserts, and activities take a passport_test value.
//   2. A second result for the same passport and guest is refused (23505): taken once.
//   3. Deleting the guest deletes their result.
//   4. Deleting the passport deletes its results.
//   5. The anon key reads no rows.
//
// HOW TO RUN: npm run check:passport-test (node --env-file=.env.local scripts/passport-test-db-check.mjs).
// SAFE TO RE-RUN: it creates its own draft event with a random slug and deletes it in `finally`.
// It never touches the event with slug `ecphub`.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key || !anonKey) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/passport-test-db-check.mjs");
  process.exit(1);
}
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const db = createClient(url, key, opts);
const anon = createClient(url, anonKey, opts);
const runId = randomUUID().replaceAll("-", "");
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
};
const must = ({ data, error }) => { if (error) throw error; return data; };

const org = must(await db.from("organisations").select("id").limit(1).single());
const event = must(await db.from("events").insert({ org_id: org.id, name: `Passport test check ${runId}`, slug: `passport-test-check-${runId}` }).select("id, org_id").single());

try {
  const person = (name) => ({ org_id: event.org_id, event_id: event.id, name, source: "import", token: `${runId.slice(0, 10)}${name}` });
  const people = must(await db.from("attendees").insert([person("A"), person("B")]).select("id, name").order("name"));
  const [a, b] = people;
  const passport = must(await db.from("activities").insert({
    org_id: event.org_id, event_id: event.id, name: "Passport", kind: "passport", required: false, is_open: true,
    max_per_attendee: null, questions: [], per_day: false, passport_test: { on: true, questions: [], personalities: [] },
  }).select("id, passport_test").single());
  check("an activity takes a passport_test value", passport.passport_test?.on === true);

  const row = (attendee) => ({
    org_id: event.org_id, event_id: event.id, activity_id: passport.id, attendee_id: attendee.id,
    personality_id: "p-00000001", answers: [{ questionId: "q-00000001", answerId: "a-00000001" }], holder_name: attendee.name,
  });
  // 1.
  const first = await db.from("passport_results").insert(row(a)).select("id").single();
  check("a result inserts", !first.error, first.error?.message);
  // 2.
  const again = await db.from("passport_results").insert(row(a));
  check("a second result for the same guest is refused", again.error?.code === "23505", again.error?.code ?? "no error");
  must(await db.from("passport_results").insert(row(b)));
  // 5.
  const peek = await anon.from("passport_results").select("id").eq("activity_id", passport.id);
  check("the anon key reads no rows", (peek.data ?? []).length === 0, peek.error?.message ?? `${peek.data?.length} rows`);
  // 3.
  must(await db.from("attendees").delete().eq("id", a.id));
  const afterGuest = must(await db.from("passport_results").select("attendee_id").eq("activity_id", passport.id));
  check("deleting the guest deletes their result", afterGuest.length === 1 && afterGuest[0].attendee_id === b.id, `${afterGuest.length} left`);
  // 4.
  must(await db.from("activities").delete().eq("id", passport.id));
  const afterPassport = must(await db.from("passport_results").select("id").eq("event_id", event.id));
  check("deleting the passport deletes its results", afterPassport.length === 0, `${afterPassport.length} left`);
} catch (e) {
  console.error("ERROR", e);
  failures += 1;
} finally {
  const { error } = await db.from("events").delete().eq("id", event.id);
  if (error) console.error("WARNING: could not delete the check event", event.id, error);
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
