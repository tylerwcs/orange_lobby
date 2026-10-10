// Executable evidence that the setup tables (supabase/migrations/0071_event_setup.sql and
// 0072's seed column) behave as the spec says against a real database. vitest has no database
// (D141); the apply rules are pure and tested in tests/setup.
//
// WHAT THIS PROVES:
//   1. setup_token is unique across events (D441).
//   2. event_setup_sections refuses an unknown section and a second row for the same section.
//   3. The rev guard (D446): an update carrying the current rev lands and bumps it; one carrying
//      a stale rev changes nothing.
//   4. The seed (D450): a row inserted with a seed stores it, and an update that only sets
//      answers and rev leaves the seed unchanged.
//   5. Deleting the event removes its section rows (cascade).
//
// HOW TO RUN: npm run check:setup (node --env-file=.env.local scripts/setup-db-check.mjs).
// SAFE TO RE-RUN: it creates two draft events with random slugs and deletes them in `finally`.
// It never writes to any other event.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/setup-db-check.mjs");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const runId = randomUUID().replaceAll("-", "");
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
};
const must = ({ data, error }) => { if (error) throw error; return data; };

const org = must(await db.from("organisations").select("id").limit(1).single());
const token = `zz${runId.slice(0, 10)}`;
const a = must(await db.from("events").insert({ org_id: org.id, name: `Setup check ${runId}`, slug: `setup-check-${runId}`, setup_token: token }).select("id").single());
const b = must(await db.from("events").insert({ org_id: org.id, name: `Setup check b ${runId}`, slug: `setup-check-b-${runId}` }).select("id").single());

try {
  // 1. Unique token.
  const dup = await db.from("events").update({ setup_token: token }).eq("id", b.id);
  check("a setup token can't be given to a second event", Boolean(dup.error), dup.error?.code);

  // 2. Section rows. The first row also carries a seed (checked in 4).
  const seed = { name: "x", venue: "seed venue" };
  must(await db.from("event_setup_sections").insert({ event_id: a.id, section: "basics", answers: { name: "x" }, seed, rev: 1 }));
  const bad = await db.from("event_setup_sections").insert({ event_id: a.id, section: "raffle", answers: {} });
  check("an unknown section is refused", bad.error?.code === "23514", bad.error?.code);
  const twice = await db.from("event_setup_sections").insert({ event_id: a.id, section: "basics", answers: {} });
  check("a second basics row is refused", twice.error?.code === "23505", twice.error?.code);

  // 3. Rev guard.
  const ok = must(await db.from("event_setup_sections").update({ answers: { name: "y" }, rev: 2 }).eq("event_id", a.id).eq("section", "basics").eq("rev", 1).select("rev"));
  check("a save with the current rev lands and bumps it", ok.length === 1 && ok[0].rev === 2);
  const stale = must(await db.from("event_setup_sections").update({ answers: { name: "z" }, rev: 2 }).eq("event_id", a.id).eq("section", "basics").eq("rev", 1).select("rev"));
  const after = must(await db.from("event_setup_sections").select("answers, rev, seed").eq("event_id", a.id).eq("section", "basics").single());
  check("a save with a stale rev changes nothing", stale.length === 0 && after.answers.name === "y" && after.rev === 2);

  // 4. Seed: stored on insert, untouched by an update that sets only answers and rev.
  check("a row inserted with a seed stores it", JSON.stringify(after.seed) === JSON.stringify(seed));
  check("an update that only sets answers and rev leaves the seed unchanged", after.answers.name === "y" && JSON.stringify(after.seed) === JSON.stringify(seed));
} finally {
  // 5. Cascade.
  must(await db.from("events").delete().in("id", [a.id, b.id]));
  const left = must(await db.from("event_setup_sections").select("event_id").eq("event_id", a.id));
  check("deleting the event removes its section rows", left.length === 0);
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
