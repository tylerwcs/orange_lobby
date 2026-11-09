// Executable evidence that migration 0133 (bowling lane draw, D860-D866) holds against a real
// database. vitest has no database (D141), so the pure rules are unit-tested and this proves the SQL.
//
// WHAT THIS PROVES:
//   1. A sport can be a lane draw; lanes 0 and games 11 are refused.
//   2. set_lane_draw writes the pool rows and the seats.
//   3. A bowler can't have two seats in one game.
//   4. A score is 0-300.
//   5. Once a score is in, a redraw is refused ('has_scores') and the seats stay.
//   6. A forced write with nothing clears the seats and the pool rows (Reset).
//   7. An unknown sport is 'missing'.
//   8. Swapping a bowler (update by sport + attendee) moves their seat in every game.
//
// HOW TO RUN: npm run check:lanes (node --env-file=.env.local scripts/lanes-db-check.mjs).
// SAFE TO RE-RUN: it creates its own draft event with a random slug and deletes it in `finally`.
// It never touches the event with slug `ecphub`.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/lanes-db-check.mjs");
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
const event = must(await db.from("events").insert({ org_id: org.id, name: `Lanes check ${runId}`, slug: `lanes-check-${runId}` }).select("id, org_id").single());

try {
  const [t1, t2] = must(await db.from("event_groups").insert([
    { org_id: event.org_id, event_id: event.id, name: "T1" },
    { org_id: event.org_id, event_id: event.id, name: "T2" },
  ]).select("id, name").order("name"));
  const person = (name, group) => ({ org_id: event.org_id, event_id: event.id, name, group_id: group, source: "import", token: `${runId.slice(0, 10)}${name}` });
  const people = must(await db.from("attendees").insert([person("A", t1.id), person("B", t1.id), person("C", t2.id), person("D", t2.id), person("E", t2.id)]).select("id, name"));
  const id = Object.fromEntries(people.map((r) => [r.name, r.id]));
  const activity = must(await db.from("activities").insert({
    org_id: event.org_id, event_id: event.id, name: "Cup", kind: "tournament", required: false, is_open: true,
    max_per_attendee: null, questions: [], per_day: false, squad_fill: "captains",
  }).select("id").single());

  // 1. The format and its bounds.
  const sportRes = await db.from("tournament_sports").insert({ activity_id: activity.id, name: "Bowling", min_size: 2, max_size: 2, format: "lanes", lane_count: 2, games: 2 }).select("id").single();
  check("a lane-draw sport is accepted", !sportRes.error, sportRes.error?.message);
  const sport = sportRes.data;
  const bad1 = await db.from("tournament_sports").insert({ activity_id: activity.id, name: "X", min_size: 1, max_size: 1, format: "lanes", lane_count: 0 });
  check("lanes 0 is refused", !!bad1.error);
  const bad2 = await db.from("tournament_sports").insert({ activity_id: activity.id, name: "Y", min_size: 1, max_size: 1, format: "lanes", games: 11 });
  check("games 11 is refused", !!bad2.error);
  if (!sport) throw new Error("no sport; stopping");

  const seat = (game, lane, n, group, who, number) => ({ sport_id: sport.id, game, lane, seat: n, group_id: group, attendee_id: id[who], number });
  const pools = [{ group_id: t1.id, forfeit: false }, { group_id: t2.id, forfeit: false }];
  const seats = [
    seat(1, 1, 1, t1.id, "A", 1), seat(1, 1, 2, t2.id, "C", 1), seat(1, 2, 1, t1.id, "B", 2), seat(1, 2, 2, t2.id, "D", 2),
    seat(2, 1, 1, t1.id, "A", 1), seat(2, 1, 2, t2.id, "D", 2), seat(2, 2, 1, t1.id, "B", 2), seat(2, 2, 2, t2.id, "C", 1),
  ];
  const draw = async (p, s, force = false) => must(await db.rpc("set_lane_draw", { p_sport_id: sport.id, p_pools: p, p_seats: s, p_force: force }));
  const seatsNow = async () => must(await db.from("tournament_lane_seats").select("game, lane, seat, attendee_id, score").eq("sport_id", sport.id));
  const poolsNow = async () => must(await db.from("tournament_pool_groups").select("group_id").eq("sport_id", sport.id));

  // 2. The draw is written.
  const r2 = await draw(pools, seats);
  check("set_lane_draw answers ok", r2 === "ok", r2);
  check("8 seats and 2 pool rows", (await seatsNow()).length === 8 && (await poolsNow()).length === 2);

  // 3. One seat per bowler per game.
  const dup = await db.from("tournament_lane_seats").insert(seat(1, 3, 1, t1.id, "A", 1));
  check("a second seat for A in game 1 is refused", !!dup.error);

  // 4. Score bounds.
  const hi = await db.from("tournament_lane_seats").update({ score: 301 }).eq("sport_id", sport.id).eq("game", 1).eq("lane", 1).eq("seat", 1);
  check("a score of 301 is refused", !!hi.error);
  const zero = await db.from("tournament_lane_seats").update({ score: 0 }).eq("sport_id", sport.id).eq("game", 1).eq("lane", 1).eq("seat", 1);
  check("a score of 0 is kept", !zero.error);

  // 5. No redraw once a score is in.
  const r5 = await draw(pools, seats.slice(0, 4));
  check("a redraw after a score is has_scores", r5 === "has_scores", r5);
  check("the seats stay", (await seatsNow()).length === 8);

  // 8. Swap B for E in every game.
  must(await db.from("tournament_lane_seats").update({ attendee_id: id.E }).eq("sport_id", sport.id).eq("attendee_id", id.B));
  const after = await seatsNow();
  check("E holds B's seat in both games", after.filter((s) => s.attendee_id === id.E).length === 2 && !after.some((s) => s.attendee_id === id.B));

  // 6. Reset.
  const r6 = await draw([], [], true);
  check("a forced empty write is ok", r6 === "ok", r6);
  check("no seats and no pool rows left", (await seatsNow()).length === 0 && (await poolsNow()).length === 0);

  // 7. Unknown sport.
  const r7 = must(await db.rpc("set_lane_draw", { p_sport_id: randomUUID(), p_pools: [], p_seats: [], p_force: false }));
  check("an unknown sport is missing", r7 === "missing", r7);
} catch (e) {
  failures += 1;
  console.error("ERROR", e.message ?? e);
} finally {
  const { error } = await db.from("events").delete().eq("id", event.id);
  if (error) console.error("WARNING: could not delete the check event", event.id, error);
}
process.exit(failures ? 1 : 0);
