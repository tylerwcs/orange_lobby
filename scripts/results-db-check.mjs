// Executable evidence that migration 0098 (tournament results, D669) holds against a real
// database. vitest has no database (D141), so the pure rules are unit-tested and this proves the SQL.
//
// WHAT THIS PROVES:
//   1. set_sport_plan writes pools, matches and slots, pointer slots included, in one call.
//   2. Once a result is in, a plan without force is refused ('has_results'); with force it replaces.
//   3. A slot can't be both a fixed group and a pointer.
//   4. Deleting a group empties its slots and drops its pool row; results elsewhere stay.
//   5. Deleting the event removes every pool, match and slot.
//
// HOW TO RUN: npm run check:results (node --env-file=.env.local scripts/results-db-check.mjs).
// SAFE TO RE-RUN: it creates its own draft event with a random slug and deletes it in `finally`.
// It never touches the event with slug `ecphub`.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/results-db-check.mjs");
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
const count = async (table, column, ids) => (await db.from(table).select(column, { count: "exact", head: true }).in(column, ids)).count ?? 0;

const org = must(await db.from("organisations").select("id").limit(1).single());
const event = must(await db.from("events").insert({ org_id: org.id, name: `Results check ${runId}`, slug: `results-check-${runId}` }).select("id, org_id").single());
let sportId = null;
let matchIds = [];

try {
  const groups = must(await db.from("event_groups").insert(["G1", "G2", "G3", "G4"].map((name) => ({ org_id: event.org_id, event_id: event.id, name }))).select("id, name").order("name"));
  const [g1, g2, g3, g4] = groups.map((g) => g.id);
  const activity = must(await db.from("activities").insert({
    org_id: event.org_id, event_id: event.id, name: "Carnival", kind: "tournament", required: false, is_open: true,
    max_per_attendee: null, questions: [], per_day: false, squad_fill: "captains", proxy_fields: [],
    squads_close_at: new Date(Date.now() + 86_400_000).toISOString(), place_points: [40, 35, 30, 29],
  }).select("id, show_overall, place_points").single());
  check("activities take place_points and default show_overall on", activity.show_overall === true && activity.place_points.length === 4);
  const sport = must(await db.from("tournament_sports").insert({ activity_id: activity.id, name: "Futsal", min_size: 1, max_size: 5 }).select("id, result_kind, format, pool_size").single());
  sportId = sport.id;
  check("a sport defaults to score, pools of 3", sport.result_kind === "score" && sport.format === "pools" && sport.pool_size === 3);

  // 1. Two pools of two: one match each, then a final from the two pool winners (as pointers).
  const [m1, m2, fin] = [randomUUID(), randomUUID(), randomUUID()];
  matchIds = [m1, m2, fin];
  const plan = {
    pools: [{ group_id: g1, pool: 0 }, { group_id: g2, pool: 0 }, { group_id: g3, pool: 1 }, { group_id: g4, pool: 1, forfeit: true }],
    matches: [
      { id: m1, stage: "pool", pool: 0, bracket: null, round: "pool", position: 0, slots: [{ slot: 0, group_id: g1 }, { slot: 1, group_id: g2 }] },
      { id: m2, stage: "pool", pool: 1, bracket: null, round: "pool", position: 1, slots: [{ slot: 0, group_id: g3 }, { slot: 1, group_id: g4 }] },
      { id: fin, stage: "bracket", pool: null, bracket: 0, round: "final", position: 2, slots: [
        { slot: 0, source_match_id: m1, source_outcome: "winner" }, { slot: 1, source_match_id: m2, source_outcome: "winner" },
      ] },
    ],
  };
  const first = must(await db.rpc("set_sport_plan", { p_sport_id: sport.id, p_plan: plan, p_force: false }));
  check("a plan is written", first === "ok", first);
  check("4 pool rows", (await count("tournament_pool_groups", "sport_id", [sport.id])) === 4);
  check("3 matches", (await count("tournament_matches", "sport_id", [sport.id])) === 3);
  check("6 slots", (await count("tournament_match_slots", "match_id", matchIds)) === 6);
  const pointers = must(await db.from("tournament_match_slots").select("source_match_id, source_outcome, group_id").eq("match_id", fin).order("slot"));
  check("the final's slots are pointers with no group", pointers.every((p) => p.source_outcome === "winner" && p.group_id === null) && pointers[0].source_match_id === m1);
  const forfeit = must(await db.from("tournament_pool_groups").select("forfeit").eq("sport_id", sport.id).eq("group_id", g4).single());
  check("the plan's forfeit flag is kept", forfeit.forfeit === true);
  check("a re-draw before any result is allowed", must(await db.rpc("set_sport_plan", { p_sport_id: sport.id, p_plan: plan, p_force: false })) === "ok");

  // 2. A result locks the plan.
  must(await db.from("tournament_match_slots").update({ score: 3 }).eq("match_id", m1).eq("slot", 0));
  check("a plan after a result is refused", must(await db.rpc("set_sport_plan", { p_sport_id: sport.id, p_plan: plan, p_force: false })) === "has_results");
  check("a forced plan replaces it", must(await db.rpc("set_sport_plan", { p_sport_id: sport.id, p_plan: plan, p_force: true })) === "ok");
  const cleared = must(await db.from("tournament_match_slots").select("score").eq("match_id", m1).eq("slot", 0).single());
  check("the forced plan starts with no scores", cleared.score === null);
  must(await db.from("tournament_matches").update({ walkover_to: g1 }).eq("id", m1));
  check("a walkover counts as a result too", must(await db.rpc("set_sport_plan", { p_sport_id: sport.id, p_plan: plan, p_force: false })) === "has_results");
  must(await db.rpc("set_sport_plan", { p_sport_id: sport.id, p_plan: plan, p_force: true }));

  // 3. Fixed or pointer, never both.
  const both = await db.from("tournament_match_slots").update({ group_id: g1 }).eq("match_id", fin).eq("slot", 0);
  check("a slot can't be a group and a pointer", !!both.error);
  const badScore = await db.from("tournament_match_slots").update({ score: 1000 }).eq("match_id", m1).eq("slot", 0);
  check("a score over 999 is refused", !!badScore.error);

  // 4. A deleted group.
  must(await db.from("tournament_match_slots").update({ score: 2 }).eq("match_id", m2).eq("slot", 0));
  must(await db.from("event_groups").delete().eq("id", g2));
  const empty = must(await db.from("tournament_match_slots").select("group_id").eq("match_id", m1).eq("slot", 1).single());
  check("a deleted group's slot goes empty", empty.group_id === null);
  check("its pool row goes", (await db.from("tournament_pool_groups").select("group_id").eq("sport_id", sport.id).eq("group_id", g2)).data.length === 0);
  const kept = must(await db.from("tournament_match_slots").select("score").eq("match_id", m2).eq("slot", 0).single());
  check("other results stay", kept.score === 2);
  check("a missing sport is missing", must(await db.rpc("set_sport_plan", { p_sport_id: randomUUID(), p_plan: plan, p_force: false })) === "missing");
} catch (e) {
  failures += 1;
  console.error("ERROR", e);
} finally {
  const { error } = await db.from("events").delete().eq("id", event.id);
  if (error) console.error("WARNING: could not delete the check event", event.id, error);
  else if (sportId) {
    const left = (await count("tournament_pool_groups", "sport_id", [sportId])) + (await count("tournament_matches", "sport_id", [sportId]))
      + (matchIds.length ? await count("tournament_match_slots", "match_id", matchIds) : 0);
    check("deleting the event removes every pool, match and slot", left === 0, `${left} left`);
  }
}
process.exit(failures ? 1 : 0);
