// Executable evidence that migration 0112 (attendee change log, D742, D744) holds against a real
// database. vitest has no database (D141), so the builders are unit-tested and this proves the SQL.
//
// WHAT THIS PROVES:
//   1. An inserted row reads back with its detail intact.
//   2. The anon key cannot select from attendee_changes.
//   3. attendee_ids @> array[<id>] finds the row (the GIN index's query).
//   4. Deleting the event_committee row for an actor leaves actor_name on past rows unchanged.
//   5. A bulk row whose detail.people holds 3,000 people inserts and reads back in one call.
//   6. erase_from_attendee_changes removes one person from a two-person bulk row (the row stays,
//      one person left in detail.people and attendee_ids, their email gone from search) and deletes
//      their one-person row; the anon key cannot execute it.
//   7. Deleting the event deletes its log rows (cascade).
//
// HOW TO RUN: npm run check:log (node --env-file=.env.local scripts/attendee-log-db-check.mjs).
// SAFE TO RE-RUN: it creates its own event with a random slug and deletes it (and, by cascade, its
// log rows and committee row) in `finally`. It never touches the event with slug `ecphub`.
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key || !anonKey) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/attendee-log-db-check.mjs");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const runId = randomUUID().replaceAll("-", "").slice(0, 16);
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
};
const must = ({ data, error }) => { if (error) throw error; return data; };

let eventId = null;
try {
  const org = must(await db.from("organisations").select("id").limit(1).single());
  const ev = must(await db.from("events").insert({
    org_id: org.id, name: `Log check ${runId}`, slug: `log-check-${runId}`, status: "live",
  }).select("id, slug").single());
  if (ev.slug === "ecphub") throw new Error("refusing to touch ecphub");
  eventId = ev.id;

  const actor = { actor_email: `actor.${runId}@log-check.test`, actor_name: "Committee Actor", actor_kind: "committee" };
  const person = (n) => ({ attendeeId: randomUUID(), name: `Person ${n}`, email: `p${n}.${runId}@log-check.test` });
  const search = (summary, people) => [summary, actor.actor_name, actor.actor_email, ...people.flatMap((p) => [p.name, p.email])].join(" ").toLowerCase();
  const insert = (fields) => db.from("attendee_changes").insert({ event_id: eventId, ...actor, ...fields }).select("*").single();

  // 1. Round trip.
  const a = person(1);
  const detail = { people: [{ ...a, fields: [{ label: "Table", before: "12", after: "14" }] }], note: "ok" };
  const row1 = must(await insert({ kind: "edit", summary: "Edited Person 1", attendee_ids: [a.attendeeId], search: search("Edited Person 1", [a]), detail }));
  const back = must(await db.from("attendee_changes").select("*").eq("id", row1.id).single());
  check("1. an inserted row reads back with its detail intact", isDeepStrictEqual(back.detail, detail) && back.actor_name === actor.actor_name && back.at !== null && back.kind === "edit", JSON.stringify(back.detail));

  // 2. Anon cannot read.
  const anonRead = await anon.from("attendee_changes").select("id").eq("event_id", eventId);
  check("2. the anon key cannot select from attendee_changes", !!anonRead.error || (anonRead.data ?? []).length === 0, anonRead.error?.message ?? `${anonRead.data?.length} rows`);

  // 3. GIN lookup.
  const found = must(await db.from("attendee_changes").select("id").eq("event_id", eventId).contains("attendee_ids", [a.attendeeId]));
  check("3. attendee_ids @> array[id] finds the row", found.length === 1 && found[0].id === row1.id, `${found.length} rows`);

  // 4. Committee row removal leaves the name on past rows.
  const cm = must(await db.from("event_committee").insert({ event_id: eventId, name: actor.actor_name, email: actor.actor_email }).select("id").single());
  const row4 = must(await insert({ kind: "edit", summary: "Edited Person 1 again", attendee_ids: [a.attendeeId], actor_user_id: null }));
  must(await db.from("event_committee").delete().eq("id", cm.id));
  const after4 = must(await db.from("attendee_changes").select("actor_name, actor_email").eq("id", row4.id).single());
  check("4. deleting the committee row leaves actor_name on past rows", after4.actor_name === actor.actor_name && after4.actor_email === actor.actor_email, JSON.stringify(after4));

  // 5. Bulk row with 3,000 people.
  const crowd = Array.from({ length: 3000 }, (_, i) => ({ ...person(`c${i}`), fields: [{ label: "Shirt size", before: "M", after: "L" }] }));
  const row5 = must(await insert({ kind: "bulk_set", summary: "Set Shirt size to L for 3000 people", attendee_ids: crowd.map((p) => p.attendeeId), search: search("Set Shirt size to L for 3000 people", crowd), detail: { people: crowd } }));
  const back5 = must(await db.from("attendee_changes").select("attendee_ids, detail").eq("id", row5.id).single());
  check("5. a bulk row with 3,000 people inserts and reads back in one call", back5.detail.people.length === 3000 && back5.attendee_ids.length === 3000 && back5.detail.people[2999].attendeeId === crowd[2999].attendeeId);

  // 6. Erasure.
  const b = person("b");
  const c = person("c");
  const solo = must(await insert({ kind: "edit", summary: "Edited Person b", attendee_ids: [b.attendeeId], search: search("Edited Person b", [b]), detail: { people: [b] } }));
  const pair = must(await insert({ kind: "bulk_set", summary: "Set Table to 5 for 2 people", attendee_ids: [b.attendeeId, c.attendeeId], search: search("Set Table to 5 for 2 people", [b, c]), detail: { people: [b, c] } }));
  const touched = must(await db.rpc("erase_from_attendee_changes", { p_attendee_id: b.attendeeId }));
  const soloAfter = must(await db.from("attendee_changes").select("id").eq("id", solo.id).maybeSingle());
  const pairAfter = must(await db.from("attendee_changes").select("*").eq("id", pair.id).maybeSingle());
  check("6a. erasure deletes the person's one-person row", soloAfter === null);
  check(
    "6b. erasure keeps a two-person row with the other person only, email gone from search",
    pairAfter !== null
      && pairAfter.detail.people.length === 1 && pairAfter.detail.people[0].attendeeId === c.attendeeId
      && pairAfter.attendee_ids.length === 1 && pairAfter.attendee_ids[0] === c.attendeeId
      && !pairAfter.search.includes(b.email) && !pairAfter.search.includes("person b")
      && pairAfter.search.includes(c.email) && pairAfter.search.includes(actor.actor_email.toLowerCase()) && pairAfter.search.includes(actor.actor_name.toLowerCase()) && pairAfter.search.includes("set table to 5 for 2 people"),
    JSON.stringify({ search: pairAfter?.search, touched }),
  );
  check("6c. erasure reports the rows it touched", touched === 2, String(touched));
  const anonErase = await anon.rpc("erase_from_attendee_changes", { p_attendee_id: c.attendeeId });
  const stillThere = must(await db.from("attendee_changes").select("id").eq("id", pair.id).maybeSingle());
  check("6d. the anon key cannot execute the erasure", !!anonErase.error && stillThere !== null, anonErase.error?.message ?? "no error");

  // 7. Cascade.
  must(await db.from("events").delete().eq("id", eventId));
  const gone = must(await db.from("attendee_changes").select("id").eq("event_id", eventId));
  check("7. deleting the event deletes its log rows", gone.length === 0, `${gone.length} left`);
  eventId = null;
} catch (e) {
  check("script ran without a database error", false, e?.message ?? String(e));
} finally {
  if (eventId) {
    const { error } = await db.from("events").delete().eq("id", eventId);
    if (error) console.error("cleanup failed", error);
  }
}

if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
console.log("All checks passed");
