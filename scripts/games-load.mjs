// Load test for live games (spec 2026-09-26-live-games-design.md §5, D289): N simulated phones
// against a deployed app, while a person drives the host console as on the day.
//
//   seed    <event-id> [n=500]               add n attendees tagged extra.seed = "load", ~10 per table
//   checkin <event-id> <checkpoint-id>       check every load attendee in, so a draw has a pool
//   run     <base-url> <event-id> [n=500] [seconds=180] [display-token]
//   cleanup <event-id>                       delete the load attendees (and with them their game rows)
//
// HOW TO RUN: npm run load:games -- <command> ... (node --env-file=.env.local scripts/games-load.mjs).
//
// During `run`, from the host console: open a tap race (lanes by table), start it, let it
// finish; then open last one standing and run 3 questions. Phones join every lobby, tap 6–10
// times a second in batches, and answer at random 0.5–4 s into each question.
//
// PASS: state p95 < 300 ms, no 5xx, and the taps stored for the race on stage equal the taps the
// server accepted. Run once per race: taps from real phones in the same race, or a second race
// in the same run, make the numbers differ legitimately.
//
// SAFETY: refuses the event with slug `ecphub` (the live event) in every command, refuses a
// display token that is not this event's, and only ever touches attendees it seeded itself
// (extra.seed = "load"). `seed` removes what it added if it fails part-way. `cleanup` deletes
// the load attendees in pages until none are left; their check-ins, race taps, answers,
// players and draw winners go with them by cascade. `run` writes nothing directly.
//
// If Vercel's firewall answers with its own 403/429 pages (not this app's JSON), the test is
// tripping platform protection from one IP: run from two machines, or ask before adding a
// temporary bypass rule.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const LIVE_SLUG = "ecphub";
const SEED = "load";
const PAGE = 1000;
// src/lib/tokens.ts: 12 characters from this 31-symbol alphabet, or the endpoints refuse it.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
// src/features/games/phase.ts GRACE_MS, plus the taps memo and a margin for clock drift.
const SETTLE_MS = 1500 + 1500;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/games-load.mjs ...");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const newToken = () => Array.from({ length: 12 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const must = ({ data, error }) => { if (error) throw error; return data; };
const refuse = (msg) => { console.error(`Refusing: ${msg}`); process.exit(1); };

async function guardedEvent(eventId) {
  if (!eventId) refuse("no event id given.");
  const ev = must(await db.from("events")
    .select("id, org_id, slug, status, display_token, registration_questions, attendee_fields")
    .eq("id", eventId).maybeSingle());
  if (!ev) refuse(`no event with id ${eventId}.`);
  if (ev.slug === LIVE_SLUG) refuse(`${LIVE_SLUG} is the live event. Use a test event.`);
  return ev;
}

/** Every load attendee of the event, paged: PostgREST caps a response at 1,000 rows. */
async function loadAttendees(eventId, limit = Infinity) {
  const out = [];
  for (let from = 0; out.length < limit; from += PAGE) {
    const page = must(await db.from("attendees").select("id, token")
      .eq("event_id", eventId).eq("extra->>seed", SEED).order("id").range(from, from + PAGE - 1));
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out.slice(0, limit);
}

/** Deletes load attendees 200 at a time, until none are left or a round removes nothing. */
async function deleteLoadAttendees(eventId, onlyTokens = null) {
  let removed = 0;
  const batches = [];
  if (onlyTokens) for (let i = 0; i < onlyTokens.length; i += 200) batches.push(onlyTokens.slice(i, i + 200));
  for (;;) {
    let q = db.from("attendees").delete().eq("event_id", eventId).eq("extra->>seed", SEED);
    if (onlyTokens) {
      if (batches.length === 0) return removed;
      q = q.in("token", batches.shift());
    } else {
      const ids = (await loadAttendees(eventId, 200)).map((a) => a.id);
      if (ids.length === 0) return removed;
      q = q.in("id", ids);
    }
    const gone = must(await q.select("id"));
    if (!onlyTokens && gone.length === 0) return removed;
    removed += gone.length;
  }
}

/**
 * The key a race "by table" groups on: an event field whose key or label says table (they live
 * in `extra`, see src/lib/attendee-fields.ts), else `table_no`, which the host can only pick
 * once the event has a column with that key ("Table no").
 */
function tableKey(ev) {
  const fields = [...(Array.isArray(ev.registration_questions) ? ev.registration_questions : []),
    ...(Array.isArray(ev.attendee_fields) ? ev.attendee_fields : [])];
  return fields.find((f) => typeof f?.key === "string" && /table/i.test(`${f.key} ${f.label ?? ""}`))?.key ?? null;
}

/**
 * Most are "Staff"; some list several programmes, so a race by category and a draw that leaves
 * out "Crew" are rehearsed the way multi-programme attendees behave: "KOM, Wellness" races for
 * KOM (its first part), and "KOM, Crew" is left out with Crew (any excluded part is enough).
 */
function categoryFor(i) {
  if (i % 13 === 0) return "KOM, Crew";
  if (i % 7 === 0) return "Crew";
  if (i % 5 === 0) return "KOM, Wellness";
  return "Staff";
}

async function seed(eventId, n) {
  if (!Number.isInteger(n) || n < 1) refuse("n must be a positive whole number.");
  const ev = await guardedEvent(eventId);
  const field = tableKey(ev);
  const tableField = field ?? "table_no";
  const tables = Math.max(1, Math.round(n / 10));
  const rows = Array.from({ length: n }, (_, i) => ({
    org_id: ev.org_id, event_id: ev.id, token: newToken(), name: `Load Tester ${i + 1}`,
    email: `load${i + 1}-${randomUUID().slice(0, 8)}@example.test`, category: categoryFor(i + 1),
    source: "import", extra: { seed: SEED, [tableField]: String((i % tables) + 1) },
  }));
  try {
    for (let i = 0; i < rows.length; i += 500) must(await db.from("attendees").insert(rows.slice(i, i + 500)));
  } catch (err) {
    const removed = await deleteLoadAttendees(ev.id, rows.map((r) => r.token));
    console.error(`Seeding failed; removed the ${removed} attendees this seed had added.`);
    throw err;
  }
  console.log(`Added ${n} load-test attendees across ${tables} tables (extra.${tableField}).`);
  if (!field) console.log('Note: the event has no table column. Add an attendee column "Table no" so the host can race by table.');
  if (ev.status === "draft") console.log("Note: the event is a draft. Publish it before `run`: phones are refused on a draft.");
}

async function checkin(eventId, checkpointId) {
  const ev = await guardedEvent(eventId);
  const cp = must(await db.from("checkpoints").select("id").eq("id", checkpointId ?? "").eq("event_id", ev.id).maybeSingle());
  if (!cp) refuse(`checkpoint ${checkpointId} is not one of this event's.`);
  const people = await loadAttendees(ev.id);
  const rows = people.map((a) => ({ org_id: ev.org_id, event_id: ev.id, checkpoint_id: cp.id, attendee_id: a.id }));
  for (let i = 0; i < rows.length; i += 500) {
    must(await db.from("checkins").upsert(rows.slice(i, i + 500), { onConflict: "checkpoint_id,attendee_id", ignoreDuplicates: true }));
  }
  console.log(`Checked in ${rows.length} load-test attendees.`);
}

async function cleanup(eventId) {
  const ev = await guardedEvent(eventId);
  const removed = await deleteLoadAttendees(ev.id);
  const left = (await loadAttendees(ev.id)).length;
  console.log(`Removed ${removed} load-test attendees.${left ? ` ${left} are still there: run cleanup again.` : ""}`);
  console.log("If a draw was rehearsed, the stage may still show its winners: open another game or Reset draw in admin.");
  if (left) process.exit(1);
}

const pct = (xs, p) => (xs.length ? xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : 0);

async function run(base, eventId, n, seconds, displayToken) {
  if (!/^https?:\/\//.test(base ?? "")) refuse("the base URL must start with http:// or https://.");
  if (!Number.isInteger(n) || n < 1 || !(seconds > 0)) refuse("n and seconds must be positive numbers.");
  const ev = await guardedEvent(eventId);
  if (ev.status === "draft") refuse("the event is a draft; phones are refused on a draft. Publish it first.");
  if (displayToken && displayToken !== ev.display_token) refuse("that display token is not this event's display link.");
  const people = await loadAttendees(ev.id, n);
  if (people.length < n) refuse(`only ${people.length} load-test attendees; run seed first.`);
  const root = base.replace(/\/+$/, "");

  const stats = new Map();
  const record = (name, ms, code) => {
    const s = stats.get(name) ?? { ms: [], codes: new Map() };
    s.ms.push(ms);
    s.codes.set(code, (s.codes.get(code) ?? 0) + 1);
    stats.set(name, s);
  };
  const call = async (name, path, init) => {
    const t = performance.now();
    try {
      const res = await fetch(root + path, init);
      record(name, performance.now() - t, res.status);
      return res.ok ? await res.json() : null;
    } catch {
      record(name, performance.now() - t, "network");
      return null;
    }
  };
  const post = (body) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  let accepted = 0;
  const answers = [];
  const until = Date.now() + seconds * 1000;
  // One phone, as PlayClient behaves: poll the state (sending its key back, so an unchanged
  // stage costs one short answer), join a lobby, tap in batches, answer each question once.
  const phone = async (tok) => {
    let stateKey = "";
    let stage = null;
    let me = null;
    const answered = new Set();
    const take = (b) => { if (b && !b.unchanged) { stateKey = b.key; stage = b.stage ?? null; me = b.me ?? null; } };
    await sleep(Math.random() * 1000);
    while (Date.now() < until) {
      take(await call("state", `/api/play/${tok}/state${stateKey ? `?v=${encodeURIComponent(stateKey)}` : ""}`));
      const phase = stage?.phase;
      if ((phase === "race_lobby" || phase === "survival_lobby") && me && "joined" in me && !me.joined) {
        take(await call("join", `/api/play/${tok}/join`, { method: "POST" }));
      }
      if (phase === "race_live" && me?.kind === "race" && me.joined) {
        const r = await call("taps", `/api/play/${tok}/taps`, post({ n: 6 + Math.floor(Math.random() * 5) }));
        accepted += r?.accepted ?? 0;
      }
      const q = stage?.question;
      if (phase === "survival_question" && me?.kind === "survival" && me.joined && me.outAt === null && q && !answered.has(q.no)) {
        answered.add(q.no);
        const choice = Math.floor(Math.random() * q.options.length);
        answers.push(sleep(500 + Math.random() * 3500).then(() => call("answer", `/api/play/${tok}/answer`, post({ question: q.no, choice }))));
      }
      await sleep(phase && phase !== "idle" ? 1000 : 5000);
    }
  };

  console.log(`${n} phones for ${seconds} s against ${root}. Drive the host console now.`);
  await Promise.all(people.map((p) => phone(p.token)));
  await Promise.all(answers);

  let failed = false;
  let errors = false;
  for (const [name, s] of stats) {
    s.ms.sort((a, b) => a - b);
    const codes = [...s.codes].map(([c, k]) => `${c}×${k}`).join(" ");
    console.log(`${name.padEnd(6)} n=${s.ms.length} p50=${pct(s.ms, 50).toFixed(0)}ms p95=${pct(s.ms, 95).toFixed(0)}ms p99=${pct(s.ms, 99).toFixed(0)}ms max=${(s.ms.at(-1) ?? 0).toFixed(0)}ms  ${codes}`);
    if ([...s.codes.keys()].some((c) => c === "network" || c >= 500)) errors = true;
  }
  if (errors) { console.log("FAIL  5xx or network errors above"); failed = true; }
  const state = stats.get("state");
  if (state && pct(state.ms, 95) >= 300) { console.log("FAIL  state p95 is 300 ms or more"); failed = true; }
  console.log(`Taps accepted by the server: ${accepted}`);
  // D304 took tap totals off the LED, so the check reads the database: the taps the server
  // accepted must equal what race_taps holds for the run on stage, read after the grace so the
  // last batches have landed. Paged: one request stops at 1,000 rows.
  const stage = must(await db.from("game_stage").select("run_id, phase_data").eq("event_id", ev.id).maybeSingle());
  const liveUntil = stage?.phase_data?.live_until ? Date.parse(stage.phase_data.live_until) : 0;
  if (stage?.run_id && liveUntil) {
    const wait = liveUntil + SETTLE_MS - Date.now();
    if (wait > 0) await sleep(wait);
    let stored = 0;
    for (let from = 0; ; from += 1000) {
      const page = must(await db.from("race_taps").select("taps").eq("run_id", stage.run_id).order("attendee_id").range(from, from + 999));
      stored += page.reduce((sum, r) => sum + r.taps, 0);
      if (page.length < 1000) break;
    }
    const ok = stored === accepted;
    console.log(`${ok ? "PASS" : "FAIL"}  taps stored ${stored} vs accepted ${accepted}`);
    if (!ok) failed = true;
  } else {
    console.log("Skipped the tap-total check: no race on the stage.");
  }
  console.log(`Done. When finished with this event: npm run load:games -- cleanup ${ev.id}`);
  process.exit(failed ? 1 : 0);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "seed") await seed(args[0], Number(args[1] ?? 500));
else if (cmd === "checkin") await checkin(args[0], args[1]);
else if (cmd === "cleanup") await cleanup(args[0]);
else if (cmd === "run") await run(args[0], args[1], Number(args[2] ?? 500), Number(args[3] ?? 180), args[4]);
else {
  console.error("Usage: games-load.mjs seed <event-id> [n] | checkin <event-id> <checkpoint-id> | run <base-url> <event-id> [n] [seconds] [display-token] | cleanup <event-id>");
  process.exit(1);
}
