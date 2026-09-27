// Executable evidence that the live-games RPCs (supabase/migrations/0049_games.sql) enforce
// their rules against a real database. vitest has no database (D141), so the pure mirrors in
// src/lib/games/ are unit-tested there and this proves the SQL agrees.
//
// WHAT THIS PROVES:
//   1. game_stage_write refuses a stale expected version (two crew phones pressing Next).
//   2. race_add_taps caps a batch at ceil(15 × elapsed), refuses taps outside the live window,
//      and refuses a player who never joined.
//   3. survival_reveal eliminates wrong and missing answers; when everyone still in is wrong,
//      nobody is eliminated; a second Reveal with the old version is refused.
//   4. draw_spin draws only checked-in, non-excluded, not-yet-won attendees, and a voided
//      winner can be drawn again. Leaving out "Crew" also leaves out a "KOM, Crew" attendee:
//      one excluded part is enough (category_matches, 0048).
//   5. Deleting the event removes every game row (cascade).
//
// HOW TO RUN: npm run check:games (node --env-file=.env.local scripts/games-db-check.mjs).
// SAFE TO RE-RUN: it creates its own draft event with a random slug and deletes it in `finally`.
// It never touches the event with slug `ecphub`.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/games-db-check.mjs");
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const org = must(await db.from("organisations").select("id").limit(1).single());
const event = must(await db.from("events").insert({ org_id: org.id, name: `Games check ${runId}`, slug: `games-check-${runId}` }).select("id, org_id").single());

try {
  const people = must(await db.from("attendees").insert(
    [["Ann Lee", "Staff"], ["Ben Tan", "Staff"], ["Cai Wong", "Staff"], ["Dev Raj", "Crew"], ["Eve Lim", "KOM, Crew"]].map(([name, category], i) => ({
      org_id: event.org_id, event_id: event.id, name, token: `${runId}`.slice(0, 11) + "abcde"[i],
      category, source: "import",
    })),
  ).select("id, name"));
  const byName = new Map(people.map((p) => [p.name, p]));
  const [ann, ben, cai, dev, eve] = ["Ann Lee", "Ben Tan", "Cai Wong", "Dev Raj", "Eve Lim"].map((n) => byName.get(n));

  // 1. Compare-and-set
  const v1 = must(await db.rpc("game_stage_write", { p_event_id: event.id, p_expected: 0, p_run_id: null, p_game_id: null, p_phase: "idle", p_phase_data: {}, p_phase_ends_at: null }));
  const stale = must(await db.rpc("game_stage_write", { p_event_id: event.id, p_expected: 0, p_run_id: null, p_game_id: null, p_phase: "idle", p_phase_data: {}, p_phase_ends_at: null }));
  check("stage write moves the version on", v1 === 1, `got ${v1}`);
  check("stale stage write is refused", stale === -1, `got ${stale}`);

  // 2. Taps
  const race = must(await db.from("games").insert({ org_id: event.org_id, event_id: event.id, kind: "tap_race", title: "Race" }).select("id").single());
  const raceRun = must(await db.from("game_runs").insert({ event_id: event.id, game_id: race.id }).select("id").single());
  must(await db.from("race_taps").insert({ run_id: raceRun.id, attendee_id: ann.id, lane_key: "Staff" }));
  const liveFrom = new Date(Date.now() - 1000).toISOString();
  const liveUntil = new Date(Date.now() + 60_000).toISOString();
  const first = must(await db.rpc("race_add_taps", { p_run_id: raceRun.id, p_attendee_id: ann.id, p_n: 500, p_live_from: liveFrom, p_live_until: liveUntil }));
  check("a batch is capped at ceil(15 × elapsed)", first >= 15 && first <= 30, `accepted ${first} of 500 after ~1 s`);
  const early = must(await db.rpc("race_add_taps", { p_run_id: raceRun.id, p_attendee_id: ann.id, p_n: 5, p_live_from: new Date(Date.now() + 10_000).toISOString(), p_live_until: liveUntil }));
  check("taps before the race starts are refused", early === 0, `got ${early}`);
  const late = must(await db.rpc("race_add_taps", { p_run_id: raceRun.id, p_attendee_id: ann.id, p_n: 5, p_live_from: liveFrom, p_live_until: new Date(Date.now() - 2000).toISOString() }));
  check("taps after the grace window are refused", late === 0, `got ${late}`);
  const stranger = must(await db.rpc("race_add_taps", { p_run_id: raceRun.id, p_attendee_id: ben.id, p_n: 5, p_live_from: liveFrom, p_live_until: liveUntil }));
  check("a player who never joined gets nothing", stranger === 0, `got ${stranger}`);

  // 3. Reveal
  const quiz = must(await db.from("games").insert({ org_id: event.org_id, event_id: event.id, kind: "survival", title: "Quiz" }).select("id").single());
  const quizRun = must(await db.from("game_runs").insert({ event_id: event.id, game_id: quiz.id }).select("id").single());
  must(await db.from("survival_players").insert([ann, ben, cai].map((p) => ({ run_id: quizRun.id, attendee_id: p.id }))));
  const vq = must(await db.rpc("game_stage_write", { p_event_id: event.id, p_expected: 1, p_run_id: quizRun.id, p_game_id: quiz.id, p_phase: "survival_locked", p_phase_data: { question: 0 }, p_phase_ends_at: null }));
  // Ann right, Ben wrong, Cai no answer.
  must(await db.from("survival_answers").insert([{ run_id: quizRun.id, attendee_id: ann.id, question_no: 0, choice: 1 }, { run_id: quizRun.id, attendee_id: ben.id, question_no: 0, choice: 0 }]));
  const vr = must(await db.rpc("survival_reveal", { p_event_id: event.id, p_expected: vq, p_run_id: quizRun.id, p_game_id: quiz.id, p_question: 0, p_correct: 1 }));
  const after = must(await db.from("survival_players").select("attendee_id, out_at_question").eq("run_id", quizRun.id));
  const outIds = after.filter((r) => r.out_at_question === 0).map((r) => r.attendee_id).sort();
  check("wrong and missing answers are eliminated", JSON.stringify(outIds) === JSON.stringify([ben.id, cai.id].sort()));
  const again = must(await db.rpc("survival_reveal", { p_event_id: event.id, p_expected: vq, p_run_id: quizRun.id, p_game_id: quiz.id, p_question: 0, p_correct: 1 }));
  check("a second Reveal with the old version is refused", again === -1, `got ${again}`);
  // Question 1: Ann (the only one left) answers wrong -> everyone survives.
  must(await db.from("survival_answers").insert({ run_id: quizRun.id, attendee_id: ann.id, question_no: 1, choice: 0 }));
  must(await db.rpc("survival_reveal", { p_event_id: event.id, p_expected: vr, p_run_id: quizRun.id, p_game_id: quiz.id, p_question: 1, p_correct: 1 }));
  const annRow = must(await db.from("survival_players").select("out_at_question").eq("run_id", quizRun.id).eq("attendee_id", ann.id).single());
  const stage = must(await db.from("game_stage").select("phase_data").eq("event_id", event.id).single());
  check("everyone wrong means nobody is eliminated", annRow.out_at_question === null && stage.phase_data.everyone_survived === true);

  // 4. Draw
  const cp = must(await db.from("checkpoints").insert({ org_id: event.org_id, event_id: event.id, name: "Day 1", day: "2026-10-01" }).select("id").single());
  must(await db.from("checkins").insert([ann, ben, dev, eve].map((p) => ({ org_id: event.org_id, event_id: event.id, checkpoint_id: cp.id, attendee_id: p.id }))));
  const draw = must(await db.from("games").insert({ org_id: event.org_id, event_id: event.id, kind: "draw", title: "Draw" }).select("id").single());
  const drawRun = must(await db.from("game_runs").insert({ event_id: event.id, game_id: draw.id }).select("id").single());
  let version = must(await db.from("game_stage").select("version").eq("event_id", event.id).single()).version;
  const drawn = [];
  const spin = async (count) => {
    const ids = must(await db.rpc("draw_spin", { p_event_id: event.id, p_expected: version, p_run_id: drawRun.id, p_game_id: draw.id, p_prize_no: 0, p_count: count, p_checkpoint_id: cp.id, p_exclude: [" crew "], p_spin_ends_at: new Date(Date.now() + 5000).toISOString() }));
    version += 1;
    drawn.push(...ids);
    return ids;
  };
  const all = await spin(10);
  check("draw takes only checked-in, non-excluded people", JSON.stringify([...all].sort()) === JSON.stringify([ann.id, ben.id].sort()), `drew ${all.length}`);
  const none = await spin(1);
  check("past winners are excluded", none.length === 0, `drew ${none.length}`);
  must(await db.from("draw_winners").update({ void: true }).eq("game_id", draw.id).eq("attendee_id", ann.id));
  const redraw = await spin(1);
  check("a voided winner can be drawn again", redraw.length === 1 && redraw[0] === ann.id);
  const staleSpin = must(await db.rpc("draw_spin", { p_event_id: event.id, p_expected: version - 1, p_run_id: drawRun.id, p_game_id: draw.id, p_prize_no: 0, p_count: 1, p_checkpoint_id: cp.id, p_exclude: [], p_spin_ends_at: new Date().toISOString() }));
  check("a stale draw is refused", staleSpin === null);
  check('"KOM, Crew" is never drawn when Crew is left out', !drawn.includes(eve.id) && !drawn.includes(dev.id), `drew ${drawn.length} in all`);

  await sleep(0);
} catch (e) {
  failures += 1;
  console.error("ERROR", e);
} finally {
  const { error } = await db.from("events").delete().eq("id", event.id);
  if (error) console.error("WARNING: could not delete the check event", event.id, error);
  else {
    const left = await Promise.all(["games", "game_runs", "game_stage", "draw_winners"].map((t) =>
      db.from(t).select("event_id", { count: "exact", head: true }).eq("event_id", event.id)));
    check("deleting the event removes every game row", left.every((r) => (r.count ?? 0) === 0));
  }
}
process.exit(failures ? 1 : 0);
