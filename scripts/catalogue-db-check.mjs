// Executable evidence that the catalogue's tables (supabase/migrations/0070_event_features.sql)
// behave as the spec says against a real database. vitest has no database (D141).
//
// WHAT THIS PROVES:
//   1. Every event created before the migration has all seven stored add-ons (D435).
//   2. A new event starts with none.
//   3. event_features refuses `custom` and unknown keys, and a duplicate row (D434, D436).
//   4. Turning an add-on off (deleting its row) leaves the event's games untouched (D439).
//   5. event_custom_modules refuses an empty name, a name over 80 characters and a description
//      over 2,000 (D436).
//   6. Deleting the event removes its feature rows and custom modules (cascade).
//
// HOW TO RUN: npm run check:catalogue (node --env-file=.env.local scripts/catalogue-db-check.mjs).
// SAFE TO RE-RUN: it creates its own draft event with a random slug and deletes it in `finally`.
// It never writes to the event with slug `ecphub`; it only reads every event created before the migration (ecphub included).
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// When 0070 was applied: events created before this must have been backfilled. Set it to the
// time Task 1 applied the migration (Malaysia time).
const MIGRATED_AT = "2026-10-10T20:09:12+08:00";
const STORED = ["whatsapp", "booking", "engagement", "live_games", "lucky_draw", "custom_domain", "slido"];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/catalogue-db-check.mjs");
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

// 1. The backfill.
const older = must(await db.from("events").select("id, slug").lt("created_at", MIGRATED_AT));
const rows = must(await db.from("event_features").select("event_id, feature").in("event_id", older.map((e) => e.id)));
const short = older.filter((e) => rows.filter((r) => r.event_id === e.id).length !== STORED.length);
check("every event from before the migration has all seven add-ons", short.length === 0, short.map((e) => e.slug).join(", "));

const org = must(await db.from("organisations").select("id").limit(1).single());
const event = must(await db.from("events").insert({ org_id: org.id, name: `Catalogue check ${runId}`, slug: `catalogue-check-${runId}` }).select("id, org_id").single());

try {
  // 2. A new event starts empty.
  check("a new event starts with no add-ons", must(await db.from("event_features").select("feature").eq("event_id", event.id)).length === 0);

  // 3. What event_features accepts.
  must(await db.from("event_features").insert({ event_id: event.id, feature: "lucky_draw" }));
  check("custom is refused", Boolean((await db.from("event_features").insert({ event_id: event.id, feature: "custom" })).error));
  check("an unknown key is refused", Boolean((await db.from("event_features").insert({ event_id: event.id, feature: "raffle" })).error));
  check("a duplicate row is refused", Boolean((await db.from("event_features").insert({ event_id: event.id, feature: "lucky_draw" })).error));

  // 4. Turning off keeps the data.
  const game = must(await db.from("games").insert({ org_id: event.org_id, event_id: event.id, kind: "draw", title: "Check draw" }).select("id").single());
  must(await db.from("event_features").delete().eq("event_id", event.id).eq("feature", "lucky_draw"));
  const kept = must(await db.from("games").select("id").eq("id", game.id));
  check("turning Lucky draw off keeps the draw", kept.length === 1);

  // 5. What event_custom_modules accepts.
  const base = { org_id: event.org_id, event_id: event.id };
  must(await db.from("event_custom_modules").insert({ ...base, name: "Photo mosaic wall", description: "Live wall" }));
  check("an empty name is refused", Boolean((await db.from("event_custom_modules").insert({ ...base, name: "   " })).error));
  check("an 81-character name is refused", Boolean((await db.from("event_custom_modules").insert({ ...base, name: "x".repeat(81) })).error));
  check("a 2,001-character description is refused", Boolean((await db.from("event_custom_modules").insert({ ...base, name: "Long", description: "x".repeat(2001) })).error));
  must(await db.from("event_features").insert({ event_id: event.id, feature: "whatsapp" }));
} finally {
  // 6. Cascade.
  must(await db.from("events").delete().eq("id", event.id));
  const left = [
    ...must(await db.from("event_features").select("event_id").eq("event_id", event.id)),
    ...must(await db.from("event_custom_modules").select("id").eq("event_id", event.id)),
  ];
  check("deleting the event removes its add-ons and custom modules", left.length === 0);
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
