// Executable evidence that the slime qualifier's RPCs (supabase/migrations/0117_typing_qualifier.sql,
// reshaped by 0119_slime_qualifier.sql, D769/D792) enforce their rules against a real database.
// vitest has no database (D141), so the pure mirrors in src/features/qualifier/ are unit-tested
// there and this proves the SQL agrees. The RPCs trust the score the route computed by replaying
// the timeline, so this sends made-up scores straight to them.
//
// WHAT THIS PROVES:
//   1. qualifier_start is refused ('closed') before the window, after it, and after the confirm;
//      and ('ineligible') for a cancelled attendee, the event's preview attendee, someone in a
//      left-out category ("KOM, Crew" with " crew " left out: one part is enough, trimmed and
//      case-folded) and someone not in the event.
//   2. A start stores its seed. A second start abandons the first (one live run per attendee);
//      the first's submit then answers 'done', and so does a second submit of a counted run. A
//      submit for someone else's run is 'refused'. qualifier_live_count counts the one live run.
//   3. qualifier_submit answers 'early' before starts_at + ended_ms - 2 s (right after the start,
//      with ended_ms 60000), 'late' after starts_at + 21 minutes (starts_at is backdated in the
//      table, measured from the database's own clock), 'refused' for an ended_ms over 1200000, a
//      negative score or more than 20,000 keys, and 'ok' with ended_ms 60000 at 70 s. The counted
//      run stores score, ended_ms, popped, bosses, peak_cps, keys and key_times; the player's
//      best_score follows. A bad device is stored as 'unknown'.
//   4. The best is the highest score, then the earlier run (equal scores: the earlier starts_at).
//      Disqualifying the best falls back to the next best; restoring brings it back. runs_played
//      counts every counted run. Disqualifying a run of no such id is 'missing'.
//   5. The board orders by score, then the earlier best (an equal score with an earlier start
//      ranks first), then attendee id, ranks 1..n, pages with limit/offset, and qualifier_rank
//      (for every row, a full tie included) and qualifier_board_size agree with it. Its flagged,
//      device, name and extra are carried. An attendee moved into a left-out category leaves the
//      board and their runs remain.
//   6. qualifier_live_count counts live runs within their 21 minutes only. A run started before
//      closes_at and submitted after it counts ('ok'); while it can still be submitted, confirm
//      waits ('not_closed'). A cancelled attendee leaves the board, runs kept.
//   7. Confirm then snapshots exactly the board's top 10 (rank, attendee, best_score); a second
//      confirm is 'already'; settings save and disqualify are 'locked' afterwards; a live run
//      submitted after the confirm, even inside its own window, answers 'done' and does not
//      reach the board; the snapshot does not change.
//   8. Deleting the event removes every qualifier row (cascade).
//
// HOW TO RUN: npm run check:qualifier (node --env-file=.env.local scripts/qualifier-db-check.mjs).
// It needs migrations 0117 and 0119 applied to the database in .env.local.
// SAFE TO RE-RUN: it creates its own draft event with a random slug and deletes it in `finally`.
// It never touches the events with slug `ecphub` or `zp-my-best-me`.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/qualifier-db-check.mjs");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const runTag = randomUUID().replaceAll("-", "");
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
};
const must = ({ data, error }) => { if (error) throw error; return data; };

// Mirrors of src/features/qualifier/game/rules.ts (and the literals in 0119).
const COUNTDOWN_MS = 3000; // COUNTDOWN_MS
const RUN_CAP_MS = 1_200_000; // RUN_CAP_MS; a submit is taken until starts_at + RUN_CAP_MS + SUBMIT_GRACE_MS (21 min)
const MIN = 60_000;
const HOUR = 3_600_000;
const EXCLUDED = [" crew "];

const org = must(await db.from("organisations").select("id").limit(1).single());
const event = must(await db.from("events").insert({ org_id: org.id, name: `Qualifier check ${runTag}`, slug: `qualifier-check-${runTag}` }).select("id, org_id").single());

try {
  // --- People ---
  const specs = [
    ["Ann Lee", "Staff", false], ["Ben Tan", "Staff", false], ["Cai Wong", "Staff", false],
    ["Dev Raj", "Staff", true], ["Eve Lim", "KOM, Crew", false], ["Pre View", "Staff", false],
    ...Array.from({ length: 12 }, (_, i) => [`P${String(i + 1).padStart(2, "0")}`, "KOM", false]),
  ];
  const people = must(await db.from("attendees").insert(specs.map(([name, category, cancelled], i) => ({
    org_id: event.org_id, event_id: event.id, name, category, source: "import",
    token: `q${runTag.slice(0, 10)}${String(i).padStart(2, "0")}`,
    cancelled_at: cancelled ? new Date().toISOString() : null,
  }))).select("id, name"));
  const by = new Map(people.map((p) => [p.name, p.id]));
  const [ann, ben, cai, dev, eve, pre] = ["Ann Lee", "Ben Tan", "Cai Wong", "Dev Raj", "Eve Lim", "Pre View"].map((n) => by.get(n));
  const P = Array.from({ length: 12 }, (_, i) => by.get(`P${String(i + 1).padStart(2, "0")}`));
  must(await db.from("events").update({ preview_attendee_id: pre }).eq("id", event.id));

  // --- Helpers ---
  const save = (opensMs, closesMs) => db.rpc("qualifier_save_settings", {
    p_event_id: event.id, p_opens_at: new Date(opensMs).toISOString(),
    p_closes_at: new Date(closesMs).toISOString(), p_excluded: EXCLUDED,
  });
  // The database's clock, as an offset from this machine's: each start answers starts_at =
  // now() + COUNTDOWN_MS, taken as of the middle of its round trip (off by half of it at most).
  let clockOffset = 0;
  const dbNow = () => Date.now() + clockOffset;
  let nextSeed = 1000;
  const start = async (attendeeId) => {
    const seed = nextSeed++;
    const t0 = Date.now();
    const row = must(await db.rpc("qualifier_start", {
      p_event_id: event.id, p_attendee_id: attendeeId, p_seed: seed, p_countdown_ms: COUNTDOWN_MS,
    }))[0];
    if (row?.starts_at) clockOffset = Date.parse(row.starts_at) - COUNTDOWN_MS - (t0 + Date.now()) / 2;
    return row ? { ...row, seed } : row;
  };
  // A game that ended a minute in (ended_ms 60000), unless `extra` says otherwise.
  const submit = async (runId, attendeeId, score, extra = {}) => must(await db.rpc("qualifier_submit", {
    p_run_id: runId, p_attendee_id: attendeeId, p_score: score, p_ended_ms: extra.endedMs ?? 60_000,
    p_popped: 7, p_bosses: 1, p_peak_cps: 6.5, p_keys: extra.keys ?? "cat\bt", p_key_times: [100, 200, 300, 400, 500],
    p_device: extra.device ?? "keyboard", p_multi: extra.multi ?? 0, p_flagged: extra.flagged ?? false,
  }));
  // Moves the run's start to `agoMs` before the database's clock now. A game that ended at
  // 60000 ms is taken from 58 s (ended_ms - 2 s) to 21 minutes after the start, so 70 s leaves a
  // 12 s margin on the early side.
  const backdate = async (run, agoMs) => {
    const at = new Date(dbNow() - agoMs).toISOString();
    must(await db.from("qualifier_runs").update({ starts_at: at }).eq("id", run.run_id));
    return at;
  };
  const runRow = async (id) => must(await db.from("qualifier_runs").select("*").eq("id", id).single());
  const player = async (attendeeId) => must(await db.from("qualifier_players").select("*").eq("event_id", event.id).eq("attendee_id", attendeeId).maybeSingle());
  // A full counted run: start, 70 s ago on the database's clock, submit. Each play's start is
  // later than the previous one's, so equal scores rank in play order.
  const play = async (attendeeId, score, extra) => {
    const run = await start(attendeeId);
    if (!run?.run_id) throw new Error(`start refused for ${attendeeId}: ${run?.refused}`);
    await backdate(run, 70_000);
    const res = await submit(run.run_id, attendeeId, score, extra);
    if (res !== "ok") throw new Error(`play ${attendeeId} answered ${res}`);
    return run.run_id;
  };
  const board = async (limit = 100, offset = 0) => must(await db.rpc("qualifier_board", { p_event_id: event.id, p_limit: limit, p_offset: offset }));
  const size = async () => must(await db.rpc("qualifier_board_size", { p_event_id: event.id }));
  const rank = async (attendeeId) => must(await db.rpc("qualifier_rank", { p_event_id: event.id, p_attendee_id: attendeeId }));
  const liveCount = async () => must(await db.rpc("qualifier_live_count", { p_event_id: event.id }));
  const disq = async (runId, on) => must(await db.rpc("qualifier_set_disqualified", { p_event_id: event.id, p_run_id: runId, p_on: on }));
  const confirm = async () => must(await db.rpc("qualifier_confirm", { p_event_id: event.id, p_by: randomUUID() }));

  // 1. Before the window
  const now0 = Date.now();
  check("settings save answers ok", must(await save(now0 + HOUR, now0 + 2 * HOUR)) === "ok");
  const before = await start(ann);
  check("start before the window is refused 'closed'", before?.refused === "closed" && before.run_id === null, JSON.stringify(before));
  check("confirm before the close is 'not_closed'", (await confirm()) === "not_closed");

  // Open the window.
  must(await save(now0 - HOUR, now0 + HOUR));
  check("confirm while the window is open is 'not_closed'", (await confirm()) === "not_closed");
  const refusedFor = async (id) => (await start(id))?.refused;
  check("start is refused 'ineligible' for a cancelled attendee", (await refusedFor(dev)) === "ineligible");
  check("start is refused 'ineligible' for the preview attendee", (await refusedFor(pre)) === "ineligible");
  check('start is refused \'ineligible\' for "KOM, Crew" with " crew " left out', (await refusedFor(eve)) === "ineligible");
  check("start is refused 'ineligible' for someone not in the event", (await refusedFor(randomUUID())) === "ineligible");
  const noRuns = must(await db.from("qualifier_runs").select("id").eq("event_id", event.id).in("attendee_id", [dev, pre, eve]));
  check("a refused start writes no run", noRuns.length === 0, `${noRuns.length} rows`);
  check("qualifier_live_count is 0 with no runs", (await liveCount()) === 0);

  // 2. One live run
  const r1 = await start(ann);
  const r2 = await start(ann);
  check("a start in the window returns a run and its start time", typeof r1?.run_id === "string" && typeof r1?.starts_at === "string" && r1.refused === null);
  check("the start stores its seed", (await runRow(r2.run_id)).seed === r2.seed);
  const startsIn = Date.parse(r2.starts_at) - Date.parse((await runRow(r2.run_id)).created_at);
  check("starts_at is the end of the countdown", startsIn > 2_000 && startsIn <= 3_100, `${startsIn} ms after created_at`);
  check("a second start abandons the first", (await runRow(r1.run_id)).status === "abandoned" && (await runRow(r2.run_id)).status === "live");
  const live = must(await db.from("qualifier_runs").select("id").eq("attendee_id", ann).eq("status", "live"));
  check("the attendee has exactly one live run", live.length === 1 && live[0].id === r2.run_id);
  check("qualifier_live_count counts the one live run", (await liveCount()) === 1);
  check("the abandoned run's submit answers 'done'", (await submit(r1.run_id, ann, 500)) === "done");
  check("a submit for someone else's run is 'refused'", (await submit(r2.run_id, ben, 500)) === "refused");

  // 3. Timing and bounds (ended_ms 60000 unless said)
  check("a submit right after the start answers 'early'", (await submit(r2.run_id, ann, 600)) === "early");
  await backdate(r2, 22 * MIN);
  check("a submit after starts_at + 21 minutes answers 'late'", (await submit(r2.run_id, ann, 600)) === "late");
  // ended_ms one over the cap: 'early' until starts_at + 1198 s, 'late' after 1260 s, so ask
  // at 1230 s, where only the bounds check is left to answer.
  await backdate(r2, 1_230_000);
  check("a submit with ended_ms over 1200000 is 'refused'", (await submit(r2.run_id, ann, 600, { endedMs: RUN_CAP_MS + 1 })) === "refused");
  await backdate(r2, 70_000);
  check("a submit with a negative score is 'refused'", (await submit(r2.run_id, ann, -1)) === "refused");
  check("a submit with more than 20,000 keys is 'refused'", (await submit(r2.run_id, ann, 600, { keys: "a".repeat(20_001) })) === "refused");
  check("a refused run is still live", (await runRow(r2.run_id)).status === "live");
  check("a submit at 70 s with ended_ms 60000 answers 'ok'", (await submit(r2.run_id, ann, 600)) === "ok");
  const r2row = await runRow(r2.run_id);
  check("the counted run is stored", r2row.status === "done" && r2row.score === 600 && r2row.ended_ms === 60_000 && r2row.submitted_at !== null
    && r2row.popped === 7 && r2row.bosses === 1 && Number(r2row.peak_cps) === 6.5 && r2row.keys === "cat\bt"
    && JSON.stringify(r2row.key_times) === "[100,200,300,400,500]", JSON.stringify({ ...r2row, keys: undefined }));
  check("the player's best_score is the run's score", (await player(ann))?.best_score === 600);
  check("a second submit of a counted run answers 'done'", (await submit(r2.run_id, ann, 9999)) === "done");
  check("the second submit changed nothing", (await runRow(r2.run_id)).score === 600 && (await player(ann)).best_score === 600);
  const rb = await start(ben);
  await backdate(rb, 70_000);
  check("Ben's run answers 'ok'", (await submit(rb.run_id, ben, 500, { device: "phone" })) === "ok");
  check("a device outside touch/keyboard is stored as 'unknown'", (await runRow(rb.run_id)).device === "unknown");

  // 4. The best and its tie order (Ann: r2 600 already)
  const a2 = await play(ann, 700);
  await play(ann, 650);
  const a4 = await play(ann, 700);
  let annP = await player(ann);
  check("the best is the higher score, then the earlier run", annP.best_run_id === a2 && annP.best_score === 700,
    `best ${annP.best_run_id === a4 ? "a4" : annP.best_run_id}`);
  check("best_at is the best run's starts_at", Date.parse(annP.best_at) === Date.parse((await runRow(a2)).starts_at));
  check("runs_played counts counted runs only", annP.runs_played === 4, `got ${annP.runs_played}`);
  check("disqualifying the best answers ok", (await disq(a2, true)) === "ok");
  annP = await player(ann);
  check("disqualifying the best falls back to the next best", annP.best_run_id === a4 && annP.best_score === 700 && annP.runs_played === 4);
  check("restoring answers ok", (await disq(a2, false)) === "ok");
  annP = await player(ann);
  check("restoring brings the best back", annP.best_run_id === a2 && (await runRow(a2)).disqualified_at === null);
  check("disqualifying a run of no such id is 'missing'", (await disq(randomUUID(), true)) === "missing");

  // 5. The board. P03 and P04 tie on score (P03 started first); P07 ties Ann at 700, and Ann's
  // best started earlier.
  const scores = [900, 950, 850, 850, 800, 750, 700, 650, 640, 630, 620, 610];
  const pRuns = [];
  for (let i = 0; i < P.length; i += 1) {
    const extra = i === 7 ? { device: "touch", flagged: true, multi: 4 } : {};
    pRuns.push(await play(P[i], scores[i], extra));
  }
  const ids = (rows) => rows.map((r) => r.attendee_id);
  const names = (rows) => ids(rows).map((id) => people.find((p) => p.id === id)?.name).join(",");
  let rows = await board();
  const expectedTop = [P[1], P[0], P[2], P[3], P[4], P[5], ann, P[6], P[7], P[8], P[9], P[10], P[11], ben];
  check("the board orders by score, then the earlier best (equal scores: the earlier start first)",
    JSON.stringify(ids(rows)) === JSON.stringify(expectedTop), names(rows));
  check("ranks run 1..n", rows.every((r, i) => Number(r.rank) === i + 1));
  const p8 = rows.find((r) => r.attendee_id === P[7]);
  check("the board carries the best run's flagged and device", p8?.flagged === true && p8?.device === "touch" && rows.find((r) => r.attendee_id === P[0])?.flagged === false);
  check("the board carries name, extra and best_score", rows[0].name === "P02" && rows[0].extra !== null && typeof rows[0].extra === "object" && !Array.isArray(rows[0].extra) && rows[0].best_score === 950);
  const page = await board(3, 2);
  check("limit/offset pages the board", JSON.stringify(ids(page)) === JSON.stringify(ids(rows).slice(2, 5)));
  check("qualifier_board_size agrees with the board", (await size()) === rows.length, `size ${await size()} vs ${rows.length}`);
  check("qualifier_rank agrees with the board", (await rank(ann)) === 7 && (await rank(P[6])) === 8 && (await rank(P[1])) === 1 && (await rank(eve)) === null);
  // Same score and start: attendee id decides.
  const p3Start = (await runRow(pRuns[2])).starts_at;
  must(await db.from("qualifier_runs").update({ starts_at: p3Start }).eq("id", pRuns[3]));
  for (const id of [pRuns[2], pRuns[3]]) { await disq(id, true); await disq(id, false); }
  rows = await board();
  const [lo, hi] = [P[2], P[3]].sort();
  check("a full tie goes to the lower attendee id", ids(rows)[2] === lo && ids(rows)[3] === hi);
  // qualifier_rank counts who is ahead (qualifier_ahead) instead of ranking the board: it must
  // give every row the board's own rank, the full tie included.
  const ranks = await Promise.all(rows.map((r) => rank(r.attendee_id)));
  check("qualifier_rank agrees with every board row, ties included", ranks.every((k, i) => k === Number(rows[i].rank)),
    JSON.stringify(ranks));
  // Moved into a left-out category: off the board, runs kept.
  const sizeBefore = await size();
  must(await db.from("attendees").update({ category: "Crew" }).eq("id", ben));
  rows = await board();
  const benRuns = must(await db.from("qualifier_runs").select("id").eq("attendee_id", ben));
  check("someone moved into a left-out category leaves the board, runs kept",
    !ids(rows).includes(ben) && (await rank(ben)) === null && (await size()) === sizeBefore - 1 && benRuns.length === 1, `runs ${benRuns.length}`);

  // 6. Started before the close, submitted after it. The window closes 10 s before now; rc is
  // then backdated to 70 s ago, so it started before closes_at (as long as fewer than 60 s pass
  // between saving the close and the backdate) and its submit is well past 'early'.
  const rc = await start(cai);
  // A live run left past its 21 minutes: it can no longer be submitted, so it is not counted
  // live and doesn't hold up the confirm below.
  const rz = await start(P[11]);
  await backdate(rz, 22 * MIN);
  check("qualifier_live_count counts live runs within their 21 minutes only", (await liveCount()) === 1, `got ${await liveCount()}`);
  const n = dbNow();
  check("closing the window answers ok", must(await save(n - HOUR, n - 10_000)) === "ok");
  check("start after the window is refused 'closed'", (await start(ann))?.refused === "closed");
  await backdate(rc, 70_000);
  check("confirm waits while a run started in the window can still be submitted", (await confirm()) === "not_closed");
  check("a run started before closes_at and submitted after it answers 'ok'", (await submit(rc.run_id, cai, 580)) === "ok");
  const closesAt = must(await db.from("qualifier_settings").select("closes_at").eq("event_id", event.id).single()).closes_at;
  check("that run did start before closes_at", Date.parse((await runRow(rc.run_id)).starts_at) < Date.parse(closesAt));
  check("that run puts the attendee on the board", (await rank(cai)) !== null);
  check("qualifier_live_count is 0 once it is submitted", (await liveCount()) === 0);
  must(await db.from("attendees").update({ cancelled_at: new Date().toISOString() }).eq("id", cai));
  const caiRuns = must(await db.from("qualifier_runs").select("id").eq("attendee_id", cai));
  check("a cancelled attendee leaves the board, runs kept", (await rank(cai)) === null && caiRuns.length === 1);

  // 7. Confirm
  const boardAtConfirm = await board(20, 0);
  check("confirm after the close answers ok", (await confirm()) === "ok");
  const finalists = must(await db.from("qualifier_finalists").select("*").eq("event_id", event.id).order("rank"));
  const snap = (r) => JSON.stringify([Number(r.rank), r.attendee_id, r.best_score]);
  check("confirm snapshots exactly 10 rows in board order, with best_score",
    finalists.length === 10 && finalists.every((f, i) => snap(f) === snap(boardAtConfirm[i])), `${finalists.length} rows`);
  check("the snapshot's first row is the top score", finalists[0].best_score === 950);
  const settings = must(await db.from("qualifier_settings").select("confirmed_at, confirmed_by").eq("event_id", event.id).single());
  check("confirm stamps confirmed_at and confirmed_by", settings.confirmed_at !== null && settings.confirmed_by !== null);
  check("a second confirm answers 'already'", (await confirm()) === "already");
  check("settings save after the confirm is 'locked'", must(await save(Date.now() - HOUR, Date.now() + HOUR)) === "locked");
  check("disqualify after the confirm is 'locked'", (await disq(pRuns[1], true)) === "locked");
  check("the locked disqualify changed nothing", (await runRow(pRuns[1])).disqualified_at === null && (await rank(P[1])) === 1);
  const p12Rank = await rank(P[11]);
  await backdate(rz, 70_000);
  check("a live run submitted after the confirm answers 'done', even inside its window", (await submit(rz.run_id, P[11], 99_999)) === "done");
  check("that submit changed nothing", (await runRow(rz.run_id)).status === "live" && (await rank(P[11])) === p12Rank);
  // Reopen the window by hand (the RPC is locked): a confirmed qualifier still refuses starts.
  must(await db.from("qualifier_settings").update({ opens_at: new Date(Date.now() - HOUR).toISOString(), closes_at: new Date(Date.now() + HOUR).toISOString() }).eq("event_id", event.id));
  check("start after the confirm is refused 'closed', even inside a window", (await start(ann))?.refused === "closed");
  const after = must(await db.from("qualifier_finalists").select("*").eq("event_id", event.id).order("rank"));
  check("the snapshot is unchanged", JSON.stringify(after.map(snap)) === JSON.stringify(finalists.map(snap)));
} catch (e) {
  failures += 1;
  console.error("ERROR", e);
} finally {
  const { error } = await db.from("events").delete().eq("id", event.id);
  if (error) console.error("WARNING: could not delete the check event", event.id, error);
  else {
    const left = await Promise.all(["qualifier_settings", "qualifier_runs", "qualifier_players", "qualifier_finalists"].map((t) =>
      db.from(t).select("event_id", { count: "exact", head: true }).eq("event_id", event.id)));
    check("deleting the event removes every qualifier row", left.every((r) => !r.error && (r.count ?? 0) === 0));
  }
}
process.exit(failures ? 1 : 0);
