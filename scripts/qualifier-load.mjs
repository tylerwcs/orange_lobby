// Load test for the typing qualifier (D771): N simulated players against a running app. Each one
// loops start -> type for 30 s -> submit, for the length of the test, the way the page does.
//
//   run <base-url> <event-id> [n=500] [seconds=180]
//
// HOW TO RUN: npm run load:qualifier -- run <base-url> <event-id> [n] [seconds]
// (node --env-file=.env.local scripts/qualifier-load.mjs). Locally: npm run build && npm start,
// then point it at http://localhost:3000.
//
// SETUP: use a TEST event, never a live one. Seed the players with the games script, which tags
// them extra.seed = "load" (npm run load:games -- seed <event-id> 500), and give the event a
// qualifier window that is open now (admin > Typing qualifier). Remove them afterwards with
// npm run load:games -- cleanup <event-id>: their runs and player rows go with them by cascade.
//
// PASS: no 5xx or network errors, and p95 under 500 ms for start and for submit.
//
// SAFETY: refuses the events with slug `ecphub` and `zp-my-best-me` (the live ones), refuses a
// draft event or a window that is not open, and only ever plays as attendees seeded with
// extra.seed = "load". It writes nothing directly; every write goes through the endpoints.
import { createClient } from "@supabase/supabase-js";

const LIVE_SLUGS = ["ecphub", "zp-my-best-me"];
const SEED = "load";
const PAGE = 1000;
// src/features/qualifier/scoring.ts: a run lasts RUN_MS from startsAt, and the database accepts
// a submit from 29 s to 33 s after it. Submit just after the 30 s mark.
const RUN_MS = 30_000;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/qualifier-load.mjs ...");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const must = ({ data, error }) => { if (error) throw error; return data; };
const refuse = (msg) => { console.error(`Refusing: ${msg}`); process.exit(1); };
const pct = (xs, p) => (xs.length ? xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : 0);

/** Every load attendee of the event, paged: PostgREST caps a response at 1,000 rows. */
async function loadAttendees(eventId) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const page = must(await db.from("attendees").select("id, token, category, cancelled_at")
      .eq("event_id", eventId).eq("extra->>seed", SEED).order("id").range(from, from + PAGE - 1));
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

/** src/features/qualifier/phase.ts ineligibility, for the categories a test event leaves out. */
function canPlay(a, previewId, excluded) {
  if (a.cancelled_at || a.id === previewId) return false;
  const out = new Set(excluded.map((x) => String(x).trim().toLowerCase()).filter(Boolean));
  const parts = String(a.category ?? "").split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
  return !parts.some((p) => out.has(p));
}

/**
 * A plausible run: a typist of `wpm` finishing each word in its length's worth of time, give or
 * take 30%, so the gaps are uneven the way a person's are (an even run is flagged for review).
 * Returns the body the page sends, minus runId.
 */
function plausibleRun(words, wpm) {
  const msPerChar = 60_000 / (wpm * 5);
  const offsets = [];
  let t = 0;
  let chars = 0;
  let prefix = 0;
  for (const w of words) {
    const cost = (w.length + 1) * msPerChar * (0.7 + Math.random() * 0.6);
    if (t + cost > RUN_MS) {
      prefix = Math.min(w.length, Math.floor(((RUN_MS - t) / cost) * w.length));
      chars += prefix;
      break;
    }
    t += cost;
    offsets.push(Math.max(Math.round(t), (offsets.at(-1) ?? 0) + 1));
    chars += w.length + 1;
  }
  const keys = chars + Math.floor(chars * 0.04);
  return { wordsDone: offsets.length, offsets, prefix, keys, correctKeys: chars, device: "keyboard", multiInserts: 0 };
}

async function run(base, eventId, n, seconds) {
  if (!/^https?:\/\//.test(base ?? "")) refuse("the base URL must start with http:// or https://.");
  if (!eventId) refuse("no event id given.");
  if (!Number.isInteger(n) || n < 1 || !(seconds > 0)) refuse("n and seconds must be positive numbers.");
  const ev = must(await db.from("events").select("id, slug, status, preview_attendee_id").eq("id", eventId).maybeSingle());
  if (!ev) refuse(`no event with id ${eventId}.`);
  if (LIVE_SLUGS.includes(ev.slug)) refuse(`${ev.slug} is a live event. Use a test event.`);
  if (ev.status === "draft") refuse("the event is a draft; phones are refused on a draft. Publish it first.");
  const settings = must(await db.from("qualifier_settings")
    .select("opens_at, closes_at, excluded_categories, confirmed_at").eq("event_id", ev.id).maybeSingle());
  const now = Date.now();
  if (!settings?.opens_at || !settings?.closes_at || settings.confirmed_at
    || now < Date.parse(settings.opens_at) || now >= Date.parse(settings.closes_at) - (seconds + 40) * 1000) {
    refuse("the qualifier window must be open for the whole test (and not confirmed). Set it in admin first.");
  }
  const excluded = Array.isArray(settings.excluded_categories) ? settings.excluded_categories : [];
  const people = (await loadAttendees(ev.id)).filter((a) => canPlay(a, ev.preview_attendee_id, excluded)).slice(0, n);
  if (people.length < n) refuse(`only ${people.length} eligible load-test attendees; run: npm run load:games -- seed ${ev.id} ${n}.`);
  const root = base.replace(/\/+$/, "");

  const stats = new Map();
  const outcomes = new Map();
  const record = (name, ms, code) => {
    const s = stats.get(name) ?? { ms: [], codes: new Map() };
    s.ms.push(ms);
    s.codes.set(code, (s.codes.get(code) ?? 0) + 1);
    stats.set(name, s);
  };
  const call = async (name, tok, body) => {
    const t = performance.now();
    try {
      const res = await fetch(`${root}/api/qualifier/${tok}/${name}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}),
      });
      record(name, performance.now() - t, res.status);
      return res.ok ? await res.json() : null;
    } catch {
      record(name, performance.now() - t, "network");
      return null;
    }
  };

  const until = Date.now() + seconds * 1000;
  // One player: start, type until the run's 30 s are up, submit, and fly again.
  const player = async (tok, wpm) => {
    await sleep(Math.random() * 3000);
    while (Date.now() < until) {
      const s = await call("start", tok);
      if (!s) { await sleep(2000); continue; }
      // The page waits on the server's clock; so does this, by the offset serverNow gave.
      const skew = Date.now() - s.serverNow;
      const submitAt = Date.parse(s.startsAt) + RUN_MS + 300 + Math.random() * 700 + skew;
      await sleep(Math.max(0, submitAt - Date.now()));
      const r = await call("submit", tok, { runId: s.runId, ...plausibleRun(s.words, wpm) });
      const outcome = r ? (r.ok ? "ok" : r.reason) : "no answer";
      outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
      await sleep(1000 + Math.random() * 2000);
    }
  };

  console.log(`${n} players for ${seconds} s against ${root}.`);
  await Promise.all(people.map((p) => player(p.token, 25 + Math.random() * 85)));

  let failed = false;
  let errors = false;
  for (const [name, s] of stats) {
    s.ms.sort((a, b) => a - b);
    const codes = [...s.codes].map(([c, k]) => `${c}x${k}`).join(" ");
    console.log(`${name.padEnd(6)} n=${s.ms.length} p50=${pct(s.ms, 50).toFixed(0)}ms p95=${pct(s.ms, 95).toFixed(0)}ms p99=${pct(s.ms, 99).toFixed(0)}ms max=${(s.ms.at(-1) ?? 0).toFixed(0)}ms  ${codes}`);
    if ([...s.codes.keys()].some((c) => c === "network" || c >= 500)) errors = true;
    if (pct(s.ms, 95) >= 500) { console.log(`FAIL  ${name} p95 is 500 ms or more`); failed = true; }
  }
  console.log(`Submit outcomes: ${[...outcomes].map(([k, v]) => `${k}x${v}`).join(" ") || "none"}`);
  if (errors) { console.log("FAIL  5xx or network errors above"); failed = true; }
  if ((outcomes.get("ok") ?? 0) === 0) { console.log("FAIL  no submit was accepted"); failed = true; }
  console.log(`Done. When finished with this event: npm run load:games -- cleanup ${ev.id}`);
  process.exit(failed ? 1 : 0);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "run") await run(args[0], args[1], Number(args[2] ?? 500), Number(args[3] ?? 180));
else {
  console.error("Usage: qualifier-load.mjs run <base-url> <event-id> [n] [seconds]");
  process.exit(1);
}
