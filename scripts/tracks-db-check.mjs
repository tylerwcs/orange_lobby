// Executable evidence that migration 0106 (challenge tracks, D721-D725) holds against a real
// database. vitest has no database (D141), so the pure rules are unit-tested and this proves the SQL.
//
// WHAT THIS PROVES:
//   1. Only a captain (a Yes in either pair activity's proxy fields) may place someone, and only in their group.
//   2. submit_answers refuses someone with no track (notrack) and someone on the other track (othertrack).
//   3. The track checked is the person the entry is for, not the captain sending it.
//   4. A row left behind by a team move is ignored: the person reads as having no track.
//   5. An activity that is not in a pair submits exactly as before.
//   6. Before the challenge starts, closed comes first, not notrack.
//   7. The admin path places anyone; a null activity takes someone off their track.
//   8. A closed pair refuses the portal, never the admin.
//   9. Deleting the event removes the pair and every track row.
//
// HOW TO RUN: npm run check:tracks (node --env-file=.env.local scripts/tracks-db-check.mjs).
// SAFE TO RE-RUN: it creates its own draft event with a random slug and deletes it in `finally`.
// It never touches the event with slug `ecphub`.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/tracks-db-check.mjs");
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
const klDay = (offset = 0) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
const today = klDay();

const org = must(await db.from("organisations").select("id").limit(1).single());
const event = must(await db.from("events").insert({ org_id: org.id, name: `Tracks check ${runId}`, slug: `tracks-check-${runId}` }).select("id, org_id").single());

try {
  const [g1, g2] = must(await db.from("event_groups").insert([
    { org_id: event.org_id, event_id: event.id, name: "G1" },
    { org_id: event.org_id, event_id: event.id, name: "G2" },
  ]).select("id, name").order("name"));
  const person = (name, group, extra = {}) => ({
    org_id: event.org_id, event_id: event.id, name, group_id: group, extra, source: "import", token: `${runId.slice(0, 10)}${name}`,
  });
  const rows = must(await db.from("attendees").insert([
    person("C1", g1.id, { captain: "Yes" }), person("M1", g1.id), person("M2", g1.id), person("M3", g2.id),
  ]).select("id, name"));
  const id = Object.fromEntries(rows.map((r) => [r.name, r.id]));

  const scored = (name, metric, unit) => ({
    org_id: event.org_id, event_id: event.id, name, kind: "submission", required: false, is_open: true,
    max_per_attendee: null, per_day: false, group_mode: "members", proxy_fields: ["captain"],
    questions: [{ key: metric, label: metric, type: "number", required: true }],
    scoring: { metric_key: metric, daily_min: 1, starts_on: today, ends_on: klDay(30), unit },
  });
  const [actA, actB, actU] = must(await db.from("activities").insert([
    scored("Mileage", "km", "km"), scored("Active", "minutes", "min"), scored("Unpaired", "km", "km"),
  ]).select("id, name"));
  const acts = { A: actA, B: actB, U: actU };
  const pair = must(await db.from("challenge_track_pairs").insert({ event_id: event.id, a_activity_id: actA.id, b_activity_id: actB.id, target: 5, bonus: 10 }).select("id").single());

  const place = async (who, track, actor, admin = false) => must(await db.rpc("set_challenge_track", {
    p_pair_id: pair.id, p_attendee_id: id[who], p_activity_id: track ? acts[track].id : null, p_actor_id: actor ? id[actor] : null, p_admin: admin,
  }));
  const submit = async (who, act, by = null) => must(await db.rpc("submit_answers", {
    p_activity_id: acts[act].id, p_attendee_id: id[who], p_answers: { km: 2, minutes: 30 }, p_today: today,
    p_submitted_by: by ? id[by] : null, p_file_hashes: {}, p_pair_id: null,
  }));
  const setActivity = async (act, patch) => must(await db.from("activities").update(patch).eq("id", acts[act].id));

  // 1. Who may place.
  check("the captain puts M1 on A", (await place("M1", "A", "C1")) === "ok");
  check("someone from another group is not_member", (await place("M3", "A", "C1")) === "not_member");
  check("a plain member may not place", (await place("M2", "A", "M1")) === "not_allowed");
  check("an activity outside the pair is missing", (await place("M2", "U", "C1")) === "missing");

  // 2. The lock.
  check("no track: notrack", (await submit("M2", "A")) === "notrack");
  check("the other track: othertrack", (await submit("M1", "B")) === "othertrack");
  check("their own track: ok", (await submit("M1", "A")) === "ok");

  // 3. Whose track is checked.
  check("a captain sending for M1 on B: othertrack", (await submit("M1", "B", "C1")) === "othertrack");
  check("a captain with no track sends for M1 on A: ok", (await submit("M1", "A", "C1")) === "ok");

  // 4. A stale row after a team move.
  must(await db.from("attendees").update({ group_id: g2.id }).eq("id", id.M1));
  check("a moved member reads as no track", (await submit("M1", "A")) === "notrack");
  must(await db.from("attendees").update({ group_id: g1.id }).eq("id", id.M1));

  // 5. Unpaired.
  check("an unpaired activity takes someone with no track", (await submit("M2", "U")) === "ok");

  // 6. Before the start.
  await setActivity("A", { scoring: { metric_key: "km", daily_min: 1, starts_on: klDay(1), ends_on: klDay(30), unit: "km" } });
  check("before the start: closed, not notrack", (await submit("M2", "A")) === "closed");
  await setActivity("A", { scoring: { metric_key: "km", daily_min: 1, starts_on: today, ends_on: klDay(30), unit: "km" } });

  // 7. Admin, and taking someone off.
  check("the admin places M3 without captain fields", (await place("M3", "B", null, true)) === "ok");
  check("a null activity takes M1 off", (await place("M1", null, "C1")) === "ok");
  const left = must(await db.from("challenge_track_members").select("attendee_id").eq("pair_id", pair.id).eq("attendee_id", id.M1));
  check("M1's row is gone", left.length === 0);
  check("M1 is notrack again", (await submit("M1", "A")) === "notrack");

  // 8. Closed.
  await setActivity("A", { is_open: false });
  await setActivity("B", { is_open: false });
  check("a closed pair refuses the portal", (await place("M2", "A", "C1")) === "closed");
  check("a closed pair still lets the admin place", (await place("M2", "A", null, true)) === "ok");
  check("a missing pair is missing", must(await db.rpc("set_challenge_track", { p_pair_id: randomUUID(), p_attendee_id: id.M2, p_activity_id: null, p_actor_id: id.C1, p_admin: false })) === "missing");

  // 10. D726: a move removes what the person logged today on the track they leave - never another day's.
  await setActivity("A", { is_open: true });
  await setActivity("B", { is_open: true });
  const onDay = async (who, act, day) => (await db.from("activity_submissions").select("id", { count: "exact", head: true })
    .eq("activity_id", acts[act].id).eq("attendee_id", id[who]).eq("submitted_on", day)).count;
  check("M2 logs on A today", (await place("M2", "A", "C1")) === "ok" && (await submit("M2", "A")) === "ok");
  must(await db.from("activity_submissions").insert({ event_id: event.id, activity_id: acts.A.id, attendee_id: id.M2, group_id: g1.id, answers: { km: 3 }, submitted_on: klDay(-1), per_day: false }));
  check("moving M2 to B is ok", (await place("M2", "B", "C1")) === "ok");
  check("today's A entry is gone", (await onDay("M2", "A", today)) === 0);
  check("yesterday's A entry stays", (await onDay("M2", "A", klDay(-1))) === 1);
  check("M2 logs on B the same day", (await submit("M2", "B")) === "ok");
  check("taking M2 off a track removes today's B entry too", (await place("M2", null, "C1")) === "ok" && (await onDay("M2", "B", today)) === 0);
  check("placing someone with no track removes nothing", (await place("M3", "A", null, true)) === "ok" && (await onDay("M3", "B", today)) === 0);
  check("placing someone on the track they're on removes nothing", (await submit("M3", "A")) === "ok" && (await place("M3", "A", null, true)) === "ok" && (await onDay("M3", "A", today)) === 1);

  // 11. D730: at most `target` (5) people from one team log on one track per day; people already in may log again.
  const more = must(await db.from("attendees").insert([
    ...["P1", "P2", "P3", "P4", "P5", "P6"].map((n) => person(n, g1.id)), person("Q1", g2.id), person("R1", g2.id),
  ]).select("id, name"));
  for (const r of more) id[r.name] = r.id;
  for (const n of ["P1", "P2", "P3", "P4", "P5", "P6", "R1"]) await place(n, "A", null, true);
  await place("Q1", "B", null, true);
  const five = await Promise.all(["P1", "P2", "P3", "P4", "P5"].map((n) => submit(n, "A")));
  check("five people from one team log on A", five.every((r) => r === "ok"), five.join(","));
  check("a sixth from the same team is trackfull", (await submit("P6", "A")) === "trackfull");
  check("someone already in logs another session", (await submit("P1", "A")) === "ok");
  check("another team's people aren't counted", (await submit("R1", "A")) === "ok");
  must(await db.from("activity_submissions").update({ status: "revoked" }).eq("activity_id", acts.A.id).eq("attendee_id", id.P2));
  check("a revoked entry frees its place", (await submit("P6", "A")) === "ok");

  // 12. D725/D730: a tagged partner must be on the same track, with a place free - or nothing goes in.
  await setActivity("A", { allow_pair: true });
  const pairSubmit = async (who, partner) => must(await db.rpc("submit_answers_pair", {
    p_activity_id: acts.A.id, p_attendee_id: id[who], p_partner_id: id[partner], p_answers: { km: 2 }, p_today: today, p_submitted_by: null, p_file_hashes: {},
  }))[0];
  const p3Before = await onDay("P3", "A", today);
  const offTrack = await pairSubmit("P3", "Q1");
  check("tagging someone on the other track is refused as theirs", offTrack.code === "othertrack" && offTrack.who === "partner", JSON.stringify(offTrack));
  check("and the member's own entry is not kept either", (await onDay("P3", "A", today)) === p3Before);
  const sameTrack = await pairSubmit("P3", "R1");
  check("tagging someone on the same track goes through", sameTrack.code === "ok", JSON.stringify(sameTrack));
} catch (e) {
  failures += 1;
  console.error("ERROR", e);
} finally {
  // Not `must`: a failed read here must never stop the event being deleted.
  const pairs = (await db.from("challenge_track_pairs").select("id").eq("event_id", event.id)).data ?? [];
  const { error } = await db.from("events").delete().eq("id", event.id);
  if (error) console.error("WARNING: could not delete the check event", event.id, error);
  else if (pairs.length) {
    const rest = await db.from("challenge_track_members").select("pair_id", { count: "exact", head: true }).in("pair_id", pairs.map((p) => p.id));
    const gone = await db.from("challenge_track_pairs").select("id", { count: "exact", head: true }).in("id", pairs.map((p) => p.id));
    check("deleting the event removes the pair and every track row", (rest.count ?? 0) === 0 && (gone.count ?? 0) === 0);
  }
}
process.exit(failures ? 1 : 0);
