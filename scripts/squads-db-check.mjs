// Executable evidence that migration 0097 (tournament squads, D637-D643) holds against a real
// database. vitest has no database (D141), so the pure rules are unit-tested and this proves the SQL.
//
// WHAT THIS PROVES:
//   1. Only a ticked-field holder may pick under Captains pick; someone from another group can't be added.
//   2. Two pickers racing for the last place: exactly one gets it, the other is told 'full'.
//   3. Someone already counted is 'already'; a moved member's stale row is replaced, never doubled.
//   4. A cancelled member stops counting.
//   5. The deadline locks the portal, never the admin; the admin may go over max.
//   6. Over max, the portal may remove but not add.
//   7. Members join themselves: only yourself, unless you hold a ticked field.
//   8. A closed tournament refuses the portal; a category outside the tournament's is not_member.
//   9. Deleting the event removes every squad row.
//
// HOW TO RUN: npm run check:squads (node --env-file=.env.local scripts/squads-db-check.mjs).
// SAFE TO RE-RUN: it creates its own draft event with a random slug and deletes it in `finally`.
// It never touches the event with slug `ecphub`.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/squads-db-check.mjs");
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
const event = must(await db.from("events").insert({ org_id: org.id, name: `Squads check ${runId}`, slug: `squads-check-${runId}` }).select("id, org_id").single());

try {
  const [g1, g2] = must(await db.from("event_groups").insert([
    { org_id: event.org_id, event_id: event.id, name: "G1" },
    { org_id: event.org_id, event_id: event.id, name: "G2" },
  ]).select("id, name").order("name"));
  const person = (name, group, extra = {}) => ({
    org_id: event.org_id, event_id: event.id, name, group_id: group, extra, source: "import", token: `${runId.slice(0, 10)}${name}`,
  });
  const rows = must(await db.from("attendees").insert([
    person("C", g1.id, { captain: "Yes" }), person("V", g1.id, { vice_captain: "Yes" }),
    person("M1", g1.id), person("M2", g1.id), person("M3", g1.id), person("M4", g2.id),
  ]).select("id, name"));
  const id = Object.fromEntries(rows.map((r) => [r.name, r.id]));

  const activity = must(await db.from("activities").insert({
    org_id: event.org_id, event_id: event.id, name: "Carnival", kind: "tournament", required: false, is_open: true,
    max_per_attendee: null, questions: [], per_day: false, squad_fill: "captains", proxy_fields: ["captain", "vice_captain"],
    squads_close_at: new Date(Date.now() + 86_400_000).toISOString(),
  }).select("id").single());
  const sport = must(await db.from("tournament_sports").insert({ activity_id: activity.id, name: "Badminton", min_size: 2, max_size: 2 }).select("id").single());

  const add = async (who, actor, admin = false) => must(await db.rpc("add_squad_member", { p_sport_id: sport.id, p_attendee_id: id[who], p_actor_id: actor ? id[actor] : null, p_admin: admin }));
  const remove = async (who, actor, admin = false) => must(await db.rpc("remove_squad_member", { p_sport_id: sport.id, p_attendee_id: id[who], p_actor_id: actor ? id[actor] : null, p_admin: admin }));
  const setActivity = async (patch) => must(await db.from("activities").update(patch).eq("id", activity.id));
  // D643: counted rows only - not cancelled, still in the row's group.
  const counted = async (groupId) => {
    const all = must(await db.from("tournament_squad_members").select("attendee_id, group_id").eq("sport_id", sport.id).eq("group_id", groupId));
    if (!all.length) return 0;
    const people = must(await db.from("attendees").select("id, group_id, cancelled_at").in("id", all.map((r) => r.attendee_id)));
    return all.filter((r) => people.some((p) => p.id === r.attendee_id && !p.cancelled_at && p.group_id === r.group_id)).length;
  };

  // 1. Who may pick.
  check("the captain adds M1", (await add("M1", "C")) === "ok");
  check("a plain member may not pick", (await add("M2", "M1")) === "not_allowed");
  check("someone from another group is not_member", (await add("M4", "C")) === "not_member");

  // 2. The race for the last place.
  const race = await Promise.all([add("M2", "C"), add("M3", "V")]);
  check("two pickers racing: one ok, one full", race.filter((r) => r === "ok").length === 1 && race.filter((r) => r === "full").length === 1, race.join(","));
  check("the squad holds exactly 2", (await counted(g1.id)) === 2);

  // 3. Already in, and a stale row replaced.
  check("adding M1 again is already", (await add("M1", "C")) === "already");
  must(await db.from("attendees").update({ group_id: g2.id }).eq("id", id.M1));
  must(await db.from("attendees").update({ extra: { captain: "Yes" } }).eq("id", id.M4));
  check("a moved member stops counting for the old group", (await counted(g1.id)) === 1);
  check("the new group's captain adds the moved member", (await add("M1", "M4")) === "ok");
  const m1Rows = must(await db.from("tournament_squad_members").select("group_id").eq("sport_id", sport.id).eq("attendee_id", id.M1));
  check("the stale row is replaced, not doubled", m1Rows.length === 1 && m1Rows[0].group_id === g2.id);

  // 4. A cancelled member stops counting.
  const left = must(await db.from("tournament_squad_members").select("attendee_id").eq("sport_id", sport.id).eq("group_id", g1.id));
  must(await db.from("attendees").update({ cancelled_at: new Date().toISOString() }).in("id", left.map((r) => r.attendee_id)));
  check("a cancelled member stops counting", (await counted(g1.id)) === 0);
  must(await db.from("attendees").update({ cancelled_at: null }).in("id", left.map((r) => r.attendee_id)));

  // 5. The deadline.
  await setActivity({ squads_close_at: new Date(Date.now() - 60_000).toISOString() });
  const lateWho = left.some((r) => r.attendee_id === id.M3) ? "M2" : "M3";
  check("after the deadline a portal add is locked", (await add(lateWho, "C")) === "locked");
  check("after the deadline a portal remove is locked", (await remove(left[0].attendee_id === id.M2 ? "M2" : "M3", "C")) === "locked");
  check("after the deadline the admin may add", (await add(lateWho, null, true)) === "ok");
  check("the admin may go over max", (await add("V", null, true)) === "ok" && (await counted(g1.id)) === 3);

  // 6. Over max: remove, not add.
  await setActivity({ squads_close_at: new Date(Date.now() + 86_400_000).toISOString() });
  check("over max, a portal add is full", (await add("C", "C")) === "full");
  check("over max, the captain may remove", (await remove("V", "C")) === "ok" && (await counted(g1.id)) === 2);

  // 7. Members join themselves.
  must(await db.from("tournament_squad_members").delete().eq("sport_id", sport.id));
  await setActivity({ squad_fill: "self" });
  check("self mode: a member joins", (await add("M2", "M2")) === "ok");
  check("self mode: a member may not add someone else", (await add("M3", "M2")) === "not_allowed");
  check("self mode: the captain may still add someone", (await add("M3", "C")) === "ok");
  check("self mode: a member leaves", (await remove("M2", "M2")) === "ok");
  check("self mode: a member may not remove someone else", (await remove("M3", "M2")) === "not_allowed");

  // 8. Closed, and categories.
  await setActivity({ is_open: false });
  check("a closed tournament refuses the portal", (await add("M2", "M2")) === "closed");
  await setActivity({ is_open: true, categories: ["VIP"] });
  check("a member outside the categories is not_member", (await add("M2", "C")) === "not_member");
  check("a missing sport is missing", must(await db.rpc("add_squad_member", { p_sport_id: randomUUID(), p_attendee_id: id.M2, p_actor_id: id.C, p_admin: false })) === "missing");
} catch (e) {
  failures += 1;
  console.error("ERROR", e);
} finally {
  const acts = must(await db.from("activities").select("id").eq("event_id", event.id));
  const sports = acts.length ? must(await db.from("tournament_sports").select("id").in("activity_id", acts.map((a) => a.id))) : [];
  const { error } = await db.from("events").delete().eq("id", event.id);
  if (error) console.error("WARNING: could not delete the check event", event.id, error);
  else if (sports.length) {
    const rest = await db.from("tournament_squad_members").select("sport_id", { count: "exact", head: true }).in("sport_id", sports.map((s) => s.id));
    check("deleting the event removes every squad row", (rest.count ?? 0) === 0);
  }
}
process.exit(failures ? 1 : 0);
