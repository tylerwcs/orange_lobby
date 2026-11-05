// Executable evidence that migration 0126 (tournament super teams, D821-D826) holds against a real
// database. vitest has no database (D141), so the pure rules are unit-tested and this proves the SQL.
//
// WHAT THIS PROVES:
//   1. Either captain of a pair adds players from both teams.
//   2. The squad's max counts both teams' rows.
//   3. A captain removes a partner team's player.
//   4. Two captains racing for the last place: exactly one gets it, the other is told 'full'.
//   5. A group in no super team is not_member, for the admin and the portal alike.
//   6. A player moved between the paired teams is still counted ('already'); a row whose player
//      left the pair can still be removed by the pair's captain.
//   7. With the switch off, a partner's player is not_member again (the 0097 rule).
//   8. tournament_side_groups answers both groups for a pair, none for an unpaired group.
//   9. A group can be in only one super team per tournament.
//
// HOW TO RUN: npm run check:superteams (node --env-file=.env.local scripts/super-teams-db-check.mjs).
// SAFE TO RE-RUN: it creates its own draft event with a random slug and deletes it in `finally`.
// It never touches the event with slug `ecphub`.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/super-teams-db-check.mjs");
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
const event = must(await db.from("events").insert({ org_id: org.id, name: `Super teams check ${runId}`, slug: `superteams-check-${runId}` }).select("id, org_id").single());

try {
  const [t1, t2, t3] = must(await db.from("event_groups").insert([
    { org_id: event.org_id, event_id: event.id, name: "T1" },
    { org_id: event.org_id, event_id: event.id, name: "T2" },
    { org_id: event.org_id, event_id: event.id, name: "T3" },
  ]).select("id, name").order("name"));
  const person = (name, group, extra = {}) => ({
    org_id: event.org_id, event_id: event.id, name, group_id: group, extra, source: "import", token: `${runId.slice(0, 10)}${name}`,
  });
  const people = must(await db.from("attendees").insert([
    person("C1", t1.id, { captain: "Yes" }), person("A", t1.id), person("B", t1.id),
    person("C2", t2.id, { captain: "Yes" }), person("D", t2.id), person("E", t3.id),
  ]).select("id, name"));
  const id = Object.fromEntries(people.map((r) => [r.name, r.id]));

  const activity = must(await db.from("activities").insert({
    org_id: event.org_id, event_id: event.id, name: "Rally", kind: "tournament", required: false, is_open: true,
    max_per_attendee: null, questions: [], per_day: false, squad_fill: "captains", proxy_fields: ["captain"],
    squads_close_at: new Date(Date.now() + 86_400_000).toISOString(), super_teams: true,
  }).select("id").single());
  const sport = must(await db.from("tournament_sports").insert({ activity_id: activity.id, name: "Futsal", min_size: 2, max_size: 3 }).select("id").single());
  const team = must(await db.from("tournament_super_teams").insert({ activity_id: activity.id, name: null }).select("id").single());
  must(await db.from("tournament_super_team_groups").insert([
    { super_team_id: team.id, activity_id: activity.id, group_id: t1.id, position: 0 },
    { super_team_id: team.id, activity_id: activity.id, group_id: t2.id, position: 1 },
  ]));

  const add = async (who, actor, admin = false) => must(await db.rpc("add_squad_member", { p_sport_id: sport.id, p_attendee_id: id[who], p_actor_id: actor ? id[actor] : null, p_admin: admin }));
  const remove = async (who, actor, admin = false) => must(await db.rpc("remove_squad_member", { p_sport_id: sport.id, p_attendee_id: id[who], p_actor_id: actor ? id[actor] : null, p_admin: admin }));
  const rowCount = async () => must(await db.from("tournament_squad_members").select("attendee_id").eq("sport_id", sport.id)).length;

  // 1. Either captain, both teams.
  check("T1's captain adds T2's D", (await add("D", "C1")) === "ok");
  check("T2's captain adds T1's A", (await add("A", "C2")) === "ok");

  // 2. Max counts both teams.
  check("T2's captain adds T1's captain: 3 of 3", (await add("C1", "C2")) === "ok");
  check("a 4th is full, counting both teams", (await add("B", "C1")) === "full");

  // 3. Removing a partner team's player.
  check("T2's captain removes T1's A", (await remove("A", "C2")) === "ok");
  check("the squad holds 2", (await rowCount()) === 2);

  // 4. The race for the last place (2 of 3).
  const race = await Promise.all([add("B", "C1"), add("C2", "C2")]);
  check("two captains racing: one ok, one full", race.filter((r) => r === "ok").length === 1 && race.filter((r) => r === "full").length === 1, race.join(","));

  // 5. An unpaired group.
  check("the admin can't add an unpaired group's member", (await add("E", null, true)) === "not_member");
  check("a captain can't add an unpaired group's member", (await add("E", "C1")) === "not_member");

  // 6. Moves.
  must(await db.from("attendees").update({ group_id: t1.id }).eq("id", id.D));
  check("D moved to the partner team is still already in", (await add("D", "C1")) === "already");
  check("still 3 rows", (await rowCount()) === 3);
  must(await db.from("attendees").update({ group_id: t3.id }).eq("id", id.D));
  check("D left the pair: the pair's captain removes the row", (await remove("D", "C1")) === "ok");

  // 7. Switch off: the 0097 rule.
  must(await db.from("attendees").update({ group_id: t2.id }).eq("id", id.D));
  must(await db.from("activities").update({ super_teams: false }).eq("id", activity.id));
  check("switch off: a partner team's player is not_member", (await add("D", "C1")) === "not_member");
  check("switch off: side groups of T1 are just T1", JSON.stringify(must(await db.rpc("tournament_side_groups", { p_activity_id: activity.id, p_group_id: t1.id }))) === JSON.stringify([t1.id]));

  // 8. Side groups.
  must(await db.from("activities").update({ super_teams: true }).eq("id", activity.id));
  const pair = must(await db.rpc("tournament_side_groups", { p_activity_id: activity.id, p_group_id: t1.id }));
  check("a pair's side groups are both teams", Array.isArray(pair) && pair.length === 2 && pair.includes(t1.id) && pair.includes(t2.id), JSON.stringify(pair));
  const none = must(await db.rpc("tournament_side_groups", { p_activity_id: activity.id, p_group_id: t3.id }));
  check("an unpaired group has no side groups", Array.isArray(none) && none.length === 0, JSON.stringify(none));

  // 9. One super team per group.
  const other = must(await db.from("tournament_super_teams").insert({ activity_id: activity.id, name: "Other" }).select("id").single());
  const dup = await db.from("tournament_super_team_groups").insert({ super_team_id: other.id, activity_id: activity.id, group_id: t1.id, position: 0 });
  check("a group can't be in a second super team", dup.error?.code === "23505", dup.error?.code ?? "no error");
} catch (e) {
  failures += 1;
  console.error("ERROR", e);
} finally {
  const { error } = await db.from("events").delete().eq("id", event.id);
  if (error) console.error("WARNING: could not delete the check event", event.id, error);
}
process.exit(failures ? 1 : 0);
