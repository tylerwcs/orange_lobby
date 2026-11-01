# Slime qualifier game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the typing qualifier's 30-second sprint with a first-person 3D slime-popping typing game, ranked by a server-replayed score, keeping the qualifier's window, board, admin review, confirm and CSV.

**Architecture:** One pure, deterministic game engine (`src/features/qualifier/game/`) runs the run on the phone and is replayed on the server from the run's seed and the player's keystroke timeline; the server stores the score it computes. A new migration (0120) reshapes the qualifier tables from wpm to score. The portal hosts the game in a fullscreen overlay rendered with React Three Fiber in a low-poly pastel world; the old sprint, tunnel, ghosts, skins, streaks, ranks, dropped banner, near-miss line and Share are deleted.

**Tech Stack:** Next.js 16.3 (App Router, route handlers), React 19.2, TypeScript, Supabase Postgres via `security definer` RPCs, three 0.186 + @react-three/fiber 9 (drei is NOT installed — don't add it), vitest.

**Spec:** `docs/superpowers/specs/2026-11-01-slime-qualifier-design.md` (read it first). The game it replaces: `docs/superpowers/specs/2026-10-31-typing-qualifier-design.md`. The look the user picked: `.superpowers/brainstorm/3982-1793467689/content/look-more.html`, card A "Low-poly pastel" (git-ignored mockup; read it for the world, slime, blaster and label styling).

## Global Constraints

- This is NOT the Next.js you know: read the relevant guide in `node_modules/next/dist/docs/` before writing route, page or `next/dynamic` code (AGENTS.md).
- The engine is **deterministic**: integer milliseconds and integer millimetres only; no `Math.random`, `Date`, `performance`, `Math.sin/cos/exp/pow` or other transcendental functions inside `src/features/qualifier/game/engine.ts`, `rng.ts`, `rules.ts`, `replay.ts`, `timeline.ts` (they can differ between browsers and Node). `+ - * /`, `Math.floor`, `Math.min/max`, `Math.abs` are fine. Randomness only from `mulberry32(seed)`.
- The client feeds the engine the same integer times it records: `t = Math.round(performance.now() - origin)`, used for both `press(game, key, t)` and the timeline entry.
- Keys the engine knows: `a`–`z` (input lowercased first) and `"\b"` (backspace). Everything else (space, digits, punctuation, Enter) is dropped before it reaches the engine or the timeline.
- Spec values, verbatim: 3 health; a slime that reaches the player sticks for **3 seconds** then explodes for **1 health**; a boss explosion costs **2 health**; first boss about **one minute** in, then about every minute after the previous boss is gone; small slimes don't spawn while a boss is out; small slime score = word length × 10 × combo multiplier; multiplier = 1 + floor(combo ÷ 5), capped at ×5; a wrong letter breaks the combo and costs no health; ties on the board go to the earlier run; run cap about 20 minutes.
- Game constants live in `src/features/qualifier/game/rules.ts` only; SQL literals that mirror them (`interval '21 minutes'`, `1200000`, `2000`) are pinned by a test (Task 3).
- English only, as today. Words from the existing `WORDS` list; boss sentences lowercase letters and single spaces only.
- Writes stay in `security definer` RPCs granted to `service_role` only, revoked from `public, anon, authenticated` (as 0117).
- Never run anything against the events with slug `ecphub` or `zp-my-best-me`. Migration 0120 is written in this plan but **applied to production only when the user says so** (it is the only database and hosts live events).
- Commits: stage named paths only (never `git add -A` / `.`; the checkout has the user's unrelated changes). Messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Decision numbers D790–D796.
- Attendee components may not use `text-white`, `bg-white`, `bg-black`, `bg-foreground`, `text-gray-*` without a `theme-fixed:` comment on the line (`tests/theme/fixed-colours-guard.test.ts`, which scans `src/features/qualifier/components` recursively). 3D colours are hex numbers in `game/palette.ts`, not classes.
- Test command: `npx vitest run <path>`; full checks: `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## Review Focus

1. **A real player's run refused because the phone and the server disagree on the replay** (float drift, a key fed at a different time). Pinned by the client-path-equals-replay test in Task 2.
2. **An Android keyboard committing a whole word at once** (composition / swipe): every letter must still reach the engine, marked as an insert, and the run flagged, not refused. Pinned in Task 5 (`keysFromInput`) and Task 2 (`checkTimeline` ignores inserts for the ceiling).
3. **Caps lock or auto-capitalised first letter**: "H" must count as "h". Pinned in Task 1.
4. **A boss word and a small slime starting with the same letter**: the nearest one wins, deterministically. Pinned in Task 1.
5. **A finished run whose submit never arrived** (tab killed, phone locked, offline): it is retried on the next visit and cleared on any final answer, and an "early" answer (clock skew) is retried, not lost. Pinned in Task 5 (`pending.ts`).

---

### Task 1: Game engine (pure rules)

**Files:**
- Create: `src/features/qualifier/game/rng.ts`, `src/features/qualifier/game/rules.ts`, `src/features/qualifier/game/sentences.ts`, `src/features/qualifier/game/engine.ts`
- Modify: `src/features/qualifier/words.ts` (keep `WORDS`; leave `drawWords` for now — Task 6 deletes it)
- Test: `tests/qualifier/game/engine.test.ts`, `tests/qualifier/game/sentences.test.ts`

**Interfaces:**
- Consumes: `WORDS` from `src/features/qualifier/words.ts`.
- Produces:
  - `rng.ts`: `mulberry32(seed: number): () => number` (returns [0,1)); `randInt(r: () => number, n: number): number`.
  - `rules.ts` (tuning; names fixed, values are starting points): `TICK_MS = 50`, `COUNTDOWN_MS = 3000`, `START_HEALTH = 3`, `STICK_MS = 3000`, `SMALL_HIT = 1`, `BOSS_HIT = 2`, `SPAWN_DIST_MM = 18000`, `BOSS_DIST_MM = 20000`, `SPEED_START_MM_S = 1600`, `SPEED_STEP_MM_S = 200`, `SPEED_MAX_MM_S = 4000`, `BOSS_SPEED_MM_S = 600`, `GAP_START_MS = 2200`, `GAP_STEP_MS = 150`, `GAP_MIN_MS = 700`, `GAP_JITTER_MS = 400`, `RAMP_EVERY_MS = 30000`, `MAX_SMALL = 8`, `BOSS_FIRST_MS = 60000`, `BOSS_GAP_MS = 60000`, `POINTS_PER_LETTER = 10`, `COMBO_STEP = 5`, `COMBO_MAX_MULT = 5`, `BOSS_BONUS = 100`, `RUN_CAP_MS = 1_200_000`, `SUBMIT_GRACE_MS = 60_000`, `EARLY_TOLERANCE_MS = 2000`, `CEILING_KEYS = 40`, `CEILING_WINDOW_MS = 2000`, `REVIEW_CPS = 12.5`, `REVIEW_WINDOW_MS = 10_000`; `multiplier(combo: number): number`; `lengthBand(elapsedMs: number): [min: number, max: number]` = `[min(3 + floor(e/60000), 6), min(5 + floor(e/30000), 10)]`; `speedAt(elapsedMs): number` (mm/s); `gapAt(elapsedMs): number` (ms).
  - `sentences.ts`: `SENTENCES: readonly string[]` (≥ 100 original everyday sentences, 4–14 words each, `/^[a-z]+( [a-z]+)*$/`, no proper nouns); `bossSentence(r: () => number, n: number): string[]` — boss `n` (1-based) gets a sentence of at least `3 + 2n` words, joining two sentences when none is long enough.
  - `engine.ts`:
    ```ts
    export type Slime = { id: number; kind: "small" | "boss"; words: string[]; wordIndex: number; typed: number;
      distMm: number; lane: number /* -30..30, degrees, render only */; stuckLeftMs: number | null;
      spawnedMs: number; look: number /* 0..3, render only */ };
    export type GameEvent = { t: number; type: "spawn" | "letter" | "wrong" | "word" | "pop" | "stick" | "explode" | "boss" | "end"; id?: number };
    export type Game = { seed: number; nowMs: number; health: number; score: number; combo: number; popped: number;
      bosses: number; slimes: Slime[]; lock: number | null; ended: boolean; endedMs: number | null; events: GameEvent[]; /* + private fields */ };
    export function newGame(seed: number): Game;
    export function advance(g: Game, tMs: number): void;        // runs whole ticks up to tMs; no-op once ended
    export function press(g: Game, key: string, tMs: number): void; // advance(g, tMs) then apply the key
    export function finish(g: Game): void;                        // advance with no input until ended or RUN_CAP_MS
    export const currentWord: (s: Slime) => string;
    ```
    `events` is an append-only log the renderer drains (it may splice it); the engine never reads it.

Engine behaviour the tests pin (the tick order inside `advance` is the implementer's choice, but it must be identical on every call):
- Spawning: a small slime appears at `SPAWN_DIST_MM` when the spawn timer is due, no boss is out and fewer than `MAX_SMALL` small slimes are out; its word comes from `WORDS` filtered to `lengthBand`, excluding any word whose first letter is the first letter of a live slime's current word (fall back to any word in the band if none is left); next spawn = now + `gapAt` + `randInt(rng, GAP_JITTER_MS)`.
- Moving: `distMm` drops by `floor(speed × TICK_MS / 1000)` per tick (speed fixed at spawn from `speedAt`; boss uses `BOSS_SPEED_MM_S`). At `distMm <= 0` it sticks (`distMm = 0`, `stuckLeftMs = STICK_MS`, event `stick`); while stuck `stuckLeftMs` counts down; at 0 it explodes: health −= `SMALL_HIT` / `BOSS_HIT`, combo = 0, slime removed, lock released if it was locked, event `explode`. Health ≤ 0 → `ended = true`, `endedMs = nowMs`, event `end`.
- Bosses: the first at `BOSS_FIRST_MS`; while one is out no small slime spawns; when it's gone (popped or exploded) the next is due `BOSS_GAP_MS` later and small spawns resume. Boss `n` carries `bossSentence(rng, n)`.
- Keys: lowercase the key first. No lock: lock the live slime whose current word starts with the letter (nearest by `distMm`, then lowest `id`), `typed = 1`; none → event `wrong`, combo = 0. Locked: the right next letter advances `typed`; a wrong one → event `wrong`, combo = 0, nothing else changes. Completing a word: combo += 1, score += length × `POINTS_PER_LETTER` × `multiplier(combo)` (multiplier after the increment); small slime → popped += 1, removed, event `pop`; boss → next word (event `word`), or on its last word bosses += 1, score += `BOSS_BONUS × n`, removed, event `pop`. Lock releases after a completed word. `"\b"`: typed −= 1; at 0 the lock releases; never touches the combo. Keys after `ended` are ignored.

- [ ] **Step 1: Write the failing tests** in `tests/qualifier/game/engine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { newGame, advance, press, finish, currentWord, type Game } from "@/features/qualifier/game/engine";
import { BOSS_FIRST_MS, START_HEALTH, STICK_MS, multiplier, RUN_CAP_MS } from "@/features/qualifier/game/rules";

const firstAt = (g: Game, t: number) => { advance(g, t); return g.slimes[0]; };
const typeWord = (g: Game, word: string, t: number) => { for (const c of word) press(g, c, t); };

describe("engine (D790)", () => {
  it("the same seed gives the same slimes", () => {
    const a = newGame(42), b = newGame(42);
    advance(a, 30_000); advance(b, 30_000);
    expect(a.slimes.map((s) => [s.words, s.distMm, s.lane])).toEqual(b.slimes.map((s) => [s.words, s.distMm, s.lane]));
  });
  it("advancing in many small steps equals one big step", () => {
    const a = newGame(7), b = newGame(7);
    for (let t = 0; t <= 20_000; t += 17) advance(a, t);
    advance(b, 20_000);
    expect(JSON.stringify(a.slimes)).toBe(JSON.stringify(b.slimes));
  });
  it("no two live slimes share a first letter", () => {
    const g = newGame(3); advance(g, 50_000);
    const firsts = g.slimes.map((s) => currentWord(s)[0]);
    expect(new Set(firsts).size).toBe(firsts.length);
  });
  it("typing a word pops it and scores length x 10 x multiplier", () => {
    const g = newGame(11); const s = firstAt(g, 3000); const w = currentWord(s);
    typeWord(g, w, 3000);
    expect(g.popped).toBe(1); expect(g.combo).toBe(1); expect(g.score).toBe(w.length * 10 * multiplier(1));
    expect(g.slimes.find((x) => x.id === s.id)).toBeUndefined();
  });
  it("an upper-case letter counts as lower case", () => {
    const g = newGame(11); const w = currentWord(firstAt(g, 3000));
    typeWord(g, w.toUpperCase(), 3000);
    expect(g.popped).toBe(1);
  });
  it("a wrong letter breaks the combo and costs no health", () => {
    const g = newGame(11); const w = currentWord(firstAt(g, 3000));
    typeWord(g, w, 3000); expect(g.combo).toBe(1);
    const used = new Set(g.slimes.map((s) => currentWord(s)[0]));
    const bad = "abcdefghijklmnopqrstuvwxyz".split("").find((c) => !used.has(c))!;
    press(g, bad, 3000);
    expect(g.combo).toBe(0); expect(g.health).toBe(START_HEALTH);
  });
  it("multiplier steps every 5 and caps at x5", () => {
    expect([0, 4, 5, 9, 10, 20, 99].map(multiplier)).toEqual([1, 1, 2, 2, 3, 5, 5]);
  });
  it("backspace releases the lock at zero letters and keeps the combo", () => {
    const g = newGame(11); const w = currentWord(firstAt(g, 3000));
    typeWord(g, w, 3000); const next = currentWord(g.slimes[0]);
    press(g, next[0], 3000); expect(g.lock).not.toBeNull();
    press(g, "\b", 3000); expect(g.lock).toBeNull(); expect(g.combo).toBe(1);
  });
  it("a slime that reaches the player sticks for 3 s, can still be popped, then explodes for 1 health", () => {
    const g = newGame(5); advance(g, 3000); const s = g.slimes[0];
    let t = 3000; while (s.stuckLeftMs === null) advance(g, (t += 50));
    advance(g, t + STICK_MS - 100);
    expect(g.health).toBe(START_HEALTH);
    advance(g, t + STICK_MS + 100);
    expect(g.health).toBe(START_HEALTH - 1); expect(g.combo).toBe(0);
  });
  it("with no typing the run ends at 0 health with endedMs set", () => {
    const g = newGame(9); finish(g);
    expect(g.ended).toBe(true); expect(g.health).toBeLessThanOrEqual(0); expect(g.endedMs).toBeGreaterThan(0);
    expect(g.endedMs!).toBeLessThan(RUN_CAP_MS);
  });
  it("a boss arrives at about one minute, stops small spawns, and costs 2 health", () => { /* keep the run alive to BOSS_FIRST_MS by popping every small slime as soon as it spawns (type its word at the tick it appears), then assert: a boss is out, its words.length >= 5, no small slime spawns while it is out, and letting it reach the player costs 2 health after STICK_MS. */ });
  it("a boss word and a small slime with the same first letter: the nearest wins", () => { /* build the position with newGame + advance, find a seed/time where the boss's current word and a small slime share a first letter (search seeds 1..500 in the test), press that letter, assert lock === the nearer slime's id. */ });
  it("keys after the end are ignored", () => {
    const g = newGame(9); finish(g); const score = g.score;
    press(g, "a", g.endedMs! + 1000); expect(g.score).toBe(score);
  });
});
```

and `tests/qualifier/game/sentences.test.ts`: every sentence matches `/^[a-z]+( [a-z]+)*$/`, has 4–14 words, `SENTENCES.length >= 100`, none is flagged by `obscenity` (same matcher setup as `tests/qualifier/words.test.ts`), and `bossSentence(mulberry32(1), n).length >= 3 + 2 * n` for n = 1..8.

The two boss tests are described in comments: write them out fully; they are part of this task.

- [ ] **Step 2: Run** `npx vitest run tests/qualifier/game` — expect FAIL (modules missing).
- [ ] **Step 3: Implement** `rng.ts`, `rules.ts`, `sentences.ts`, `engine.ts` per the Interfaces block (mulberry32 is the standard 32-bit version using `Math.imul` and `>>>`).
- [ ] **Step 4: Run** `npx vitest run tests/qualifier/game` — expect PASS. Then `npx tsc --noEmit` — clean.
- [ ] **Step 5: Commit** `git add src/features/qualifier/game tests/qualifier/game` → `feat(qualifier): deterministic slime game engine (D790)`.

---

### Task 2: Timeline, checks and replay

**Files:**
- Create: `src/features/qualifier/game/timeline.ts`, `src/features/qualifier/game/replay.ts`
- Test: `tests/qualifier/game/timeline.test.ts`, `tests/qualifier/game/replay.test.ts`

**Interfaces:**
- Consumes: Task 1 (`newGame`, `press`, `finish`, rules constants). `Device` is defined here; `scoring.ts` keeps its own copy until Task 6 re-exports this one.
- Produces:
  ```ts
  // timeline.ts
  export type Device = "touch" | "keyboard" | "unknown";
  export type Entry = { key: string; t: number; insert: boolean };
  export type Timeline = { keys: string; times: number[]; inserts: number[] }; // times are deltas (ms) from the previous key, the first from 0
  export type SubmitBody = Timeline & { runId: string; device: Device };
  export type SubmitReason = "early" | "late" | "done" | "refused" | "invalid"; // the submit route's `{ ok: false, reason }`
  export function encodeTimeline(entries: readonly Entry[]): Timeline;
  export function decodeTimeline(t: Timeline): Entry[];
  export function parseSubmitBody(body: unknown): SubmitBody | null; // keys only [a-z\b], ≤ 20000; times same length, non-negative ints; inserts strictly increasing indices < length; device one of the three
  export type TimelineRefusal = "too_fast" | "too_long";
  export function checkTimeline(entries: readonly Entry[]): TimelineRefusal | null; // too_long: last t > RUN_CAP_MS; too_fast: more than CEILING_KEYS non-insert keys inside any CEILING_WINDOW_MS window
  export type Review = { flagged: boolean; peakCps: number; inserts: number }; // peakCps: max non-insert keys per second over any REVIEW_WINDOW_MS window, one decimal
  export function reviewOf(entries: readonly Entry[]): Review; // flagged when inserts > 0, peakCps >= REVIEW_CPS, or ≥ 60 non-insert keys whose gaps have a coefficient of variation < 0.15
  // replay.ts
  export type RunResult = { score: number; endedMs: number; popped: number; bosses: number };
  export function replay(seed: number, entries: readonly Entry[]): RunResult | { refused: "after_end" };
  ```
  `replay` presses every entry in order at its `t`; an entry after the game ended → `{ refused: "after_end" }`; then `finish`.

- [ ] **Step 1: Write the failing tests.** `timeline.test.ts`: encode/decode round-trip (including inserts); `parseSubmitBody` rejects: a key outside `[a-z\b]`, a negative or fractional time, mismatched lengths, an unsorted or out-of-range insert index, an unknown device, a missing runId; accepts a well-formed body. `checkTimeline`: 41 normal keys inside 2 s → `"too_fast"`; the same 41 keys with 30 of them marked insert → `null`; last t = `RUN_CAP_MS + 1` → `"too_long"`. `reviewOf`: one insert → flagged; 60 keys exactly 100 ms apart → flagged (even timing); 60 human-jittered keys at ~5 cps → not flagged, `peakCps` ≈ 5.
  `replay.test.ts` — the **client path equals replay** test (Review Focus 1):
  ```ts
  it("a run played key by key on the client replays to the same result", () => {
    const g = newGame(1234); const entries: Entry[] = [];
    // a bot that types the nearest slime's word at 6 letters/s, with one wrong letter every 15 keys
    let t = 0;
    while (!g.ended && t < 400_000) {
      t += 160 + ((t / 160) % 7) * 10;
      advance(g, t);
      if (g.ended) break;
      const target = g.lock !== null ? g.slimes.find((s) => s.id === g.lock) : [...g.slimes].sort((a, b) => a.distMm - b.distMm)[0];
      if (!target) continue;
      const key = entries.length % 15 === 14 ? "q" : currentWord(target)[target.typed] ?? currentWord(target)[0];
      press(g, key, t); entries.push({ key, t, insert: false });
    }
    finish(g);
    expect(replay(1234, entries)).toEqual({ score: g.score, endedMs: g.endedMs, popped: g.popped, bosses: g.bosses });
  });
  ```
  plus: an entry after the death → `{ refused: "after_end" }`; an empty timeline replays to score 0 and the same `endedMs` as `finish(newGame(seed))`.
- [ ] **Step 2: Run** `npx vitest run tests/qualifier/game` — expect FAIL.
- [ ] **Step 3: Implement** `timeline.ts` and `replay.ts`.
- [ ] **Step 4: Run** `npx vitest run tests/qualifier/game` — PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(qualifier): keystroke timeline, checks and server replay (D791)`.

---

### Task 3: Migration 0120 and the DB check script

**Files:**
- Create: `supabase/migrations/0120_slime_qualifier.sql`
- Modify: `scripts/qualifier-db-check.mjs`
- Test: `tests/qualifier/sql-constants.test.ts`

**Interfaces:**
- Consumes: `RUN_CAP_MS`, `SUBMIT_GRACE_MS`, `EARLY_TOLERANCE_MS`, `COUNTDOWN_MS` from Task 1.
- Produces (SQL, all `security definer` unless noted, `set search_path = ''`, granted to `service_role` only like 0117):
  - **Guard first**: `do $$ begin if exists (select 1 from public.qualifier_runs) or exists (select 1 from public.qualifier_finalists) then raise exception '0120: qualifier data exists; reshape by hand'; end if; end $$;`, and `set local lock_timeout = '5s';`.
  - `qualifier_runs`: drop `words, wpm, accuracy, words_done, offsets`; add `seed int not null`, `ended_ms int`, `score int`, `popped int`, `bosses int`, `peak_cps numeric(4,1)`, `keys text`, `key_times int[]`. Keep `status, starts_at, submitted_at, device, multi_inserts, flagged, disqualified_at` and the indexes.
  - `qualifier_players`: drop `best_wpm, best_accuracy, run_days, skin, last_seen_rank`; add `best_score int`. Keep `best_run_id, best_at, runs_played`.
  - `qualifier_finalists`: drop `best_wpm, best_accuracy, skin`; add `best_score int not null`.
  - Drop and recreate (return types change): `qualifier_entrants(uuid)` (not definer, inlinable, as 0117) → `table(attendee_id uuid, best_score int, best_at timestamptz, best_run_id uuid, runs_played int)`; `qualifier_ahead(a_score int, a_at timestamptz, a_id uuid, b_score int, b_at timestamptz, b_id uuid) returns boolean` (not definer) — a ahead of b when higher score, then earlier `best_at`, then lower id; `qualifier_standings(uuid)` (not definer) → `table(rank bigint, attendee_id uuid, best_score int, best_at timestamptz, best_run_id uuid, runs_played int)` ordered `best_score desc, best_at asc, attendee_id asc`; `qualifier_board(uuid, int, int)` → `table(rank bigint, attendee_id uuid, name text, extra jsonb, best_score int, best_at timestamptz, best_run_id uuid, runs_played int, flagged boolean, device text)`; `qualifier_rank`, `qualifier_board_size` (same signatures, new bodies).
  - `qualifier_refresh_player`: best = the attendee's `done`, not disqualified run with the highest score, then earliest `starts_at`, then id; `best_at` = that run's `starts_at`; upserts `best_score, best_at, best_run_id, runs_played`.
  - `qualifier_start(p_event_id uuid, p_attendee_id uuid, p_seed int, p_countdown_ms int) returns table(run_id uuid, starts_at timestamptz, refused text)` — 0117's body with `seed` in place of `words` (window, eligibility, abandon-live, lock order unchanged).
  - `qualifier_submit(p_run_id uuid, p_attendee_id uuid, p_score int, p_ended_ms int, p_popped int, p_bosses int, p_peak_cps numeric, p_keys text, p_key_times int[], p_device text, p_multi int, p_flagged boolean) returns text`: `'done'` when confirmed or not live; `'early'` when `now() < starts_at + make_interval(secs => (p_ended_ms - 2000) / 1000.0)`; `'late'` when `now() > starts_at + interval '21 minutes'`; `'refused'` when score < 0, ended_ms < 0 or > 1200000, or keys longer than 20000; otherwise marks it done, stores everything, refreshes the player, `'ok'`. No `closes_at` check (a run started inside the window counts).
  - `qualifier_confirm`: the live-run wait becomes `now() <= r.starts_at + interval '21 minutes'`; the snapshot writes `(org_id, event_id, rank, attendee_id, best_score)` for `rank <= 10`.
  - New `qualifier_live_count(p_event_id uuid) returns int` (stable, definer): live runs of the event with `now() <= starts_at + interval '21 minutes'`.
  - Unchanged: `qualifier_may_play`, `qualifier_eligible`, `qualifier_set_disqualified`, `qualifier_save_settings`, the settings table, the feature check.

- [ ] **Step 1: Write the failing test** `tests/qualifier/sql-constants.test.ts`: read `supabase/migrations/0120_slime_qualifier.sql` as text and assert it contains `interval '21 minutes'` and `1200000` and `p_ended_ms - 2000`, and that `RUN_CAP_MS + SUBMIT_GRACE_MS === 21 * 60_000`, `RUN_CAP_MS === 1_200_000`, `EARLY_TOLERANCE_MS === 2000`. Run it — FAIL (file missing).
- [ ] **Step 2: Write the migration** per the Interfaces block. Copy 0117's comments style and lock-order notes; keep each helper's inlinable/non-definer status as in 0117.
- [ ] **Step 3: Run** `npx vitest run tests/qualifier/sql-constants.test.ts` — PASS.
- [ ] **Step 4: Update `scripts/qualifier-db-check.mjs`** to the new RPCs: start with a seed; one live run; `'early'` (submit right after start with `p_ended_ms = 60000`); `'late'` (backdate `starts_at` by 22 minutes); `'refused'` (ended_ms 1200001); a valid submit (backdate `starts_at` by 70 s, `p_ended_ms = 60000`) → `'ok'` and the player's `best_score`; tie order (equal scores → earlier `starts_at` ranks first); `qualifier_rank`; `qualifier_live_count`; disqualify falls back to the next best; confirm refuses while a run started before the close is live (`not_closed`), then succeeds and snapshots `best_score`; settings locked after confirm; cascade delete. Keep its safety rules (own throwaway draft event, never `ecphub`/`zp-my-best-me`, deletes in `finally`). Do **not** run it yet (0120 isn't applied).
- [ ] **Step 5: Commit** `git add supabase/migrations/0120_slime_qualifier.sql scripts/qualifier-db-check.mjs tests/qualifier/sql-constants.test.ts` → `feat(qualifier): migration 0120 reshapes the qualifier for the slime game (D792)`.

---

### Task 4: The 3D world (low-poly pastel)

**Files:**
- Create: `src/features/qualifier/game/palette.ts`, `src/features/qualifier/game/labels.ts`, `src/features/qualifier/game/quality.ts`, `src/features/qualifier/components/game/SlimeScene.tsx`, `.../game/World.tsx`, `.../game/Slimes.tsx`, `.../game/Blaster.tsx`, `.../game/WordLabels.tsx`
- Test: `tests/qualifier/game/labels.test.ts`, `tests/qualifier/game/quality.test.ts`

**Interfaces:**
- Consumes: `Game`, `Slime`, `GameEvent`, `currentWord` (Task 1); `slowTracker`, `SLOW_FRAME_MS`, `SLOW_WINDOW_MS` logic from `src/features/qualifier/tunnel-mode.ts` (copy what's needed into `quality.ts`; Task 6 deletes `tunnel-mode.ts`).
- Produces:
  - `palette.ts`: hex numbers for sky, fog, ground, tree greens, rock lavender-greys, mountain blues, snow, the four slime colours (pastel green, blue, pink, yellow), blaster colours — from mockup card A.
  - `labels.ts`: `type LabelBox = { id: number; x: number; y: number; w: number; h: number; near: number /* smaller = nearer */ }`; `layoutLabels(boxes: readonly LabelBox[], view: { w: number; h: number }): Map<number, { x: number; y: number }>` — nearer labels keep their place; farther ones move up until they don't overlap, clamped inside the view.
  - `quality.ts`: `type Quality = "full" | "lite"`; `qualityOf({ reducedMotion, slow, coarse }: { reducedMotion: boolean; slow: boolean; coarse: boolean }): Quality` (lite when slow or reduced motion); `hasWebGL(): boolean`; `slowTracker()` (moved).
  - `SlimeScene` (client, default-exportable for `next/dynamic` with `ssr: false`): props `{ game: React.RefObject<Game>; clock: () => number /* current run ms, may be fractional */; quality: Quality; lockId: number | null }`. Owns the `<Canvas>`; reads `game.current` every frame in `useFrame` (no React state per frame); drains `game.current.events` for effects (pop splat droplets + fading puddle, stick swell, explode goo flash via a callback prop `onHit?: () => void`, boss arrival). World position of a slime: `x = sin(lane°) × d`, `z = −cos(lane°) × d`, `d = distMm / 1000` (rendering may use trig — only the engine may not). Hop and squash-and-stretch are visual only, from time and id. The camera stands at eye height (1.6 m) facing −z and eases its yaw toward the locked slime (about 0.6 × its lane angle), back to centre with no lock.
  - `WordLabels`: DOM overlay above the canvas; projects each slime's head position, runs `layoutLabels`, shows the current word with typed letters coloured, the locked label highlighted; boss shows the whole sentence with the current word highlighted and a health bar. Label size is fixed on screen.
  - `World`: low-poly pastel per the mockup card A — flat-shaded `MeshStandardMaterial({ flatShading: true })`, faceted icosahedron and cone trees, dodecahedron rocks, five-sided mountains with snow caps, faceted clouds; open grass, **no path**, no flowers carpet, no butterflies. Trees and rocks keep out of a clear field in front (|x| < 7 for z > −22). `lite`: half the objects, no shadows, `dpr` 1.
  - `Blaster`: a chunky toy slime gun in the lower right of the view, recoil on `pop`.

- [ ] **Step 1: Write failing tests**: `layoutLabels` — 8 boxes at the same point come back with no two overlapping and all inside the view; the nearest box keeps its original position; a box already clear isn't moved. `qualityOf` — slow → lite; reduced motion → lite; neither → full. Run — FAIL.
- [ ] **Step 2: Implement** `palette.ts`, `labels.ts`, `quality.ts`; run the tests — PASS.
- [ ] **Step 3: Implement the components.** Read `src/features/games/components/display/three/*` for this repo's R3F patterns and `src/features/qualifier/components/Tunnel.tsx` for the lazy-load + WebGL guard + error boundary pattern. `frameloop="always"` only while a run is live.
- [ ] **Step 4: Verify** `npx tsc --noEmit` and `npm run lint` clean, `npx vitest run tests/theme` PASS.
- [ ] **Step 5: Commit** `feat(qualifier): low-poly pastel world, slimes, blaster and word labels (D793)`.

---

### Task 5: The run component (input, loop, fullscreen, sound, retry)

**Files:**
- Create: `src/features/qualifier/game/pending.ts`, `src/features/qualifier/game/sound.ts`, `src/features/qualifier/game/keys.ts`, `src/features/qualifier/components/game/SlimeGame.tsx`, `src/features/qualifier/components/game/GameInput.tsx`, `src/features/qualifier/components/game/GameHud.tsx`
- Test: `tests/qualifier/game/pending.test.ts`, `tests/qualifier/game/keys.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 4; `inputDiff`, `isPhysicalKey`, `deviceOf` from `src/features/qualifier/input.ts` (kept); `perfOrigin` from `src/features/qualifier/run.ts` (move it into `game/keys.ts`; Task 6 deletes `run.ts`).
- Produces:
  - `keys.ts`: `perfOrigin(startsAtMs, offset, dateNow, perfNow): number` (moved as is); `keysFromInput(prev: string, next: string): { keys: string[]; insert: boolean }` — uses `inputDiff`; each backspace → `"\b"`; inserted text lowercased, non-letters dropped; `insert` true when more than one letter arrived in one change.
  - `pending.ts`: `type Pending = { runId: string; body: SubmitBody; tries: number }`; `savePending(store: Storage | null, token: string, p: Pending): void`; `loadPending(store, token): Pending | null`; `clearPending(store, token): void`; `settle(answer: SubmitReason | "ok" | "network"): "clear" | "retry"` — `ok, done, late, refused, invalid` → clear; `early` and network failure → retry. All storage access in try/catch (private mode, blocked storage).
  - `sound.ts`: `sfx(kind: "pop" | "splat" | "hit" | "boss" | "wrong"): void` (WebAudio, synthesised, no asset files); `isMuted(): boolean`; `setMuted(on: boolean): void` (localStorage key `qualifier-muted`, try/catch).
  - `SlimeGame` (client): props
    ```ts
    type StartAnswer = { runId: string; startsAt: string; serverNow: number; seed: number } | { error: string };
    type SubmitAnswer = { ok: true; score: number; prevBest: number | null; view: QualifierView } | { ok: false; reason: SubmitReason };
    type SlimeGameProps = { token: string; start: () => Promise<StartAnswer>; submit: (body: SubmitBody) => Promise<SubmitAnswer>;
      onDone: (answer: SubmitAnswer, local: RunResult) => void; onExit: () => void };
    ```
    (`QualifierView` is the type Task 6 defines in `view.ts`; until then type it as `unknown` and narrow in Task 6.) Renders a `fixed inset-0 z-[100]` overlay (the polaroid composer's pattern, `lockBodyScroll()` from `src/features/polaroid/components/stage.ts`); its height follows `window.visualViewport.height` so on a phone the scene sits above the keyboard. The parent calls `overlayRef.requestFullscreen?.()` inside the Play click (a user gesture) on non-coarse pointers; `SlimeGame` survives the browser refusing it or the player pressing Esc. Flow: `start()` → countdown 3-2-1 to `startsAt` using `perfOrigin` and `serverNow` → rAF loop: `advance(game, round(perf - origin))` → `GameInput` changes: `keysFromInput` → for each key `press(game, key, t)` and append `{ key, t, insert }` (t is the same rounded integer) → when `game.ended`: build the body with `encodeTimeline`, `savePending`, `submit`, `settle` → clear or keep, call `onDone`. Keys before `startsAt` are dropped. The loop uses `advance` with the rounded clock, never a separate float simulation.
  - `GameInput`: the always-focused native input (copy the attributes from the current `TypingInput.tsx`: `autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}`, `inputMode="text"`, `enterKeyHint`, paste blocked) kept empty after each change; re-focuses on tap anywhere in the overlay.
  - `GameHud`: score, combo (×N), three hearts, the letters typed for the locked word, mute toggle. Theme-safe classes (see Global Constraints).

- [ ] **Step 1: Write failing tests**: `keysFromInput("", "a")` → `{ keys: ["a"], insert: false }`; `("", "Hello")` → five lowercase keys, `insert: true`; `("ab", "a")` → `["\b"]`; `("", "a1-b")` → `["a", "b"]`. `pending`: save/load/clear round-trip with an in-memory `Storage`; `loadPending(null, …)` → `null` and save with a throwing storage doesn't throw; `settle("ok" | "done" | "late" | "refused" | "invalid")` → `"clear"`, `settle("early")` and `settle("network")` → `"retry"`. Run — FAIL.
- [ ] **Step 2: Implement** `keys.ts`, `pending.ts`, `sound.ts`; tests PASS.
- [ ] **Step 3: Implement** `SlimeGame`, `GameInput`, `GameHud`; `SlimeScene` loaded with `next/dynamic(() => import("./SlimeScene"), { ssr: false })`; without WebGL (`hasWebGL()` false) show "This game needs a browser with 3D graphics turned on." and an exit button instead of starting.
- [ ] **Step 4: Verify** `npx tsc --noEmit`, `npm run lint`, `npx vitest run tests/qualifier tests/theme` clean.
- [ ] **Step 5: Commit** `feat(qualifier): the slime run: input, loop, fullscreen, sound and retry (D794)`.

---

### Task 6: Switch the qualifier over and delete the old game

**Files:**
- Modify: `src/features/qualifier/db.ts`, `board.ts`, `view.ts`, `scoring.ts` (keep only `FINALISTS`; move `Device` to `game/timeline.ts`), `screen.ts`, `export.ts`, `client.ts`, `index.ts`, `components/QualifierClient.tsx`, `components/Board.tsx`, `components/ResultCard.tsx`, `admin/BoardTable.tsx`, `admin/RunsTable.tsx`, `admin/ConfirmCard.tsx`, `admin/SettingsCard.tsx`, `src/app/api/qualifier/[token]/start/route.ts`, `src/app/api/qualifier/[token]/submit/route.ts`, `src/app/e/[slug]/(portal)/a/[token]/qualifier/page.tsx`, `src/app/admin/events/[id]/qualifier/page.tsx`, `src/app/admin/events/[id]/qualifier/actions.ts`, `src/app/admin/events/[id]/qualifier/[attendeeId]/page.tsx`, `src/features/catalogue/catalogue.ts` (description copy)
- Delete: `src/features/qualifier/typing.ts`, `run.ts`, `progress.ts`, `tunnel-mode.ts`, `components/TypingInput.tsx`, `RunHud.tsx`, `Tunnel.tsx`, `Tunnel2D.tsx`, `Tunnel3D.tsx`, `ShareButton.tsx`, `SkinPicker.tsx`, `Progress.tsx`, `src/app/e/[slug]/(portal)/a/[token]/qualifier/actions.ts`; `drawWords` in `words.ts`; the game-only halves of `screen.ts` (`droppedText`, `gapLine`, `claimFree`, `cutBar`, `failMessage`, `skinColour`); `ghostsFor`, `ghostFor`, `droppedOf` in `view.ts`; `runOffsets`, `setSkin`, `markSeen` in `db.ts`; `src/lib/within.ts` and `tests/within.test.ts` if nothing else uses `within` after the start route change.
- Tests: delete `tests/qualifier/typing.test.ts`, `run.test.ts`, `progress.test.ts`, `tunnel-mode.test.ts`, `scoring.test.ts`; update `screen.test.ts`, `view.test.ts` (board), `export.test.ts`, `words.test.ts` (drop `drawWords` cases), `tests/catalogue/*` if they pin the description.

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `db.ts`: `startRun(eventId: string, attendeeId: string, seed: number): Promise<{ runId: string; startsAt: string } | { refused: "closed" | "ineligible" }>`; `getRun(runId, attendeeId): Promise<{ id: string; event_id: string; seed: number; starts_at: string; status: string } | null>`; `submitRun(runId, attendeeId, r: RunResult & Review & { timeline: Timeline; device: Device }): Promise<"ok" | "early" | "late" | "done" | "refused">`; `type Player = { best_score: number | null; best_run_id: string | null; runs_played: number }`; `type Finalist = { rank: number; attendee_id: string; best_score: number }`; `type BoardRow = { rank: number; attendee_id: string; name: string; extra: Record<string, unknown> | null; best_score: number; best_at: string; best_run_id: string; runs_played: number; flagged: boolean; device: Device }`; `type RunRow = { id: string; starts_at: string; status: string; score: number | null; ended_ms: number | null; popped: number | null; bosses: number | null; peak_cps: number | null; device: Device; multi_inserts: number; flagged: boolean; disqualified_at: string | null }`; `liveRunCount(eventId: string): Promise<number>`. Settings, confirm, board, size, rank, disqualify, listRuns keep their names.
  - `board.ts`: `BoardEntry = { rank; label; score; me }` (no skin); `SeenRow = { rank; id; score }`; `RankedRow = { rank; id; label; score }`; `needsFreshSlice({ …, myScore })`; `confirmedBoard` reads `best_score`.
  - `view.ts`: `QualifierView = { phase: Phase; opensAt: string | null; closesAt: string | null; ineligible: Ineligible | null; me: { best: number | null; rank: number | null; total: number; runs: number }; cutScore: number | null; finalist: boolean | null; board: { top: BoardEntry[]; around: BoardEntry[]; cut: number } }`; `qualifierView(ctx, now, known?)` unchanged signature.
  - `screen.ts` (kept: `livePhase`, `untilText`, `boardLayout`) adds: `placeLine({ best, rank, cutScore, phase }): string` — `"You're in the top 10!"` when rank ≤ 10 and phase is `open`; `"#14 · 230 points to the top 10"` (gap = cutScore − best + 1) when below; `"Play to get on the board"` with no best; never a top-10 claim in `review`/`confirmed`. `closingNote(closesAtMs: number, now: number): string | null` — within 20 minutes of the close: `"Closes in 12 min — a run started now still counts."`, else null.
  - Start route: draws `seed = randomInt(0, 2 ** 31)` (`node:crypto`), calls `startRun`, returns `{ runId, startsAt, serverNow, seed }`; ghosts and `within` gone.
  - Submit route: `parseSubmitBody` → `getRun` (must be this attendee's run in this event) → `checkTimeline` → `replay` → `reviewOf` → `getPlayer` (prevBest) → `submitRun` → on ok `rankOf` + `qualifierView`; answers `{ ok: true, score, prevBest, view }` or `{ ok: false, reason }` with reason `invalid` for a bad body or a timeline/replay refusal.
  - `QualifierClient`: ready screen (best, `placeLine`, `closingNote`, how-to on first visit via localStorage `qualifier-howto-seen`, **Play** button and Enter) → `SlimeGame` → result (this run's score, best, "New best!" when `prevBest` is null or lower, `placeLine`, **Play again** + Enter, board) → board. Phase notices and the finale message as today. On mount and on `visibilitychange` to visible, retry a `loadPending` run.
  - Admin: `BoardTable` "Best score"; `RunsTable` columns Started, Status, Score, Duration (m:ss from `ended_ms`), Popped, Bosses, Peak (≈ `peak_cps × 12` wpm), Device, insert badge, Disqualify; `ConfirmCard` gets `liveRuns: number` and stays disabled with "N runs still being played" while > 0; `FinaleEntry` has `score` instead of `wpm`/`accuracy`; `SettingsCard` copy drops "30-second sprint". Admin page passes `liveRunCount`. Confirm action message: the wait can be up to 21 minutes after the close.
  - `export.ts`: `CSV_HEADER = ["Rank", "Name", "Best score", "Runs", "Device", "Flagged", "Finalist"]`.
  - Catalogue description: `"A week of slime-popping typing runs; the top 10 go to the finale."`

- [ ] **Step 1: Update the tests first**: `screen.test.ts` for `placeLine` (top-10 claim only while open; gap = cutScore − best + 1; no best) and `closingNote` (21 min → null, 12 min → the note, after close → null); `view.test.ts` board fields `score`; `export.test.ts` new header and a row; delete the old game test files listed above. Run `npx vitest run tests/qualifier` — FAIL where expected.
- [ ] **Step 2: Data layer**: `db.ts`, `board.ts`, `view.ts`, `scoring.ts`, `export.ts` per Interfaces.
- [ ] **Step 3: Routes**: start and submit per Interfaces.
- [ ] **Step 4: Portal**: `QualifierClient`, `Board`, `ResultCard`, the page (drop the `h1` while a run is live is handled by the overlay; keep it otherwise).
- [ ] **Step 5: Admin and copy**: tables, cards, pages, actions, catalogue description.
- [ ] **Step 6: Delete** the files and exports listed above; fix `client.ts` / `index.ts` re-exports.
- [ ] **Step 7: Verify** `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run build` — all clean; `grep -rn "wpm\|ghost\|skin\|tunnel" src/features/qualifier src/app/api/qualifier "src/app/e/[slug]/(portal)/a/[token]/qualifier" src/app/admin/events/[id]/qualifier` finds nothing but the `peak_cps × 12` "≈ wpm" label.
- [ ] **Step 8: Commit** `feat(qualifier): switch the qualifier to the slime game and remove the sprint (D795, D796)`.

---

### Task 7: Load script and final checks

**Files:**
- Modify: `scripts/qualifier-load.mjs`

**Interfaces:**
- Consumes: the start/submit API from Task 6.
- Produces: each simulated player loops start → wait for `startsAt` → after a random 20–40 s, submits a body with a plausible but harmless timeline (wrong letters at ~4 keys/s, so the replayed score is 0 and the run ends by slimes) → on `reason: "early"` retries every 2 s → next run. Report start and submit p50/p95/p99, status counts and submit outcomes as today. Safety rules unchanged (refuse `ecphub` / `zp-my-best-me`, drafts, closed windows; only `extra.seed = "load"` attendees). Header comment documents the new flow and that a pass is no 5xx and p95 under 500 ms at 150 players.

- [ ] **Step 1: Update the script.**
- [ ] **Step 2: Verify** `node --check scripts/qualifier-load.mjs` and `node --check scripts/qualifier-db-check.mjs` pass; full `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run build` clean.
- [ ] **Step 3: Commit** `chore(qualifier): load script plays the slime game (D791)`.

---

## After the plan (needs the user)

These touch the shared production database or need a person with phones; do them only when the user says so:

1. Apply `0120_slime_qualifier.sql` (the guard refuses if any qualifier run exists), then `npm run check:qualifier` and `npm run check:catalogue`.
2. On a throwaway published test event: seed 200 attendees, run `npm run load:qualifier -- run https://<deploy> <event> 150 180`; delete the event after.
3. Browser pass (spec Testing): Android and iPhone and a laptop — fullscreen in/out, keyboard stays open, autocorrect off, swipe flagged, a full run to death, Play again, a locked phone retrying its run, window closed, admin disqualify, confirm waiting for a live run, CSV.
4. Merge and deploy together with 0120 (the old code and the new schema don't mix; no event has the add-on on today).
