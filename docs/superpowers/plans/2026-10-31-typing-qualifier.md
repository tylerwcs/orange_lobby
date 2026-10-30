# Typing qualifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A week-long, single-player 30-second typing sprint in the attendee portal. Each attendee's best wpm ranks them on one board. After the close, admins review the runs and confirm the top 10 as the finale list.

**Architecture:** A new add-on feature `typing_qualifier` lives in `src/features/qualifier/`. The rules are pure (typing reducer, scoring, ranks, phase, eligibility) and unit-tested.
- **The server owns each run:** `POST /api/qualifier/[token]/start` draws the words and stores the run with its start time. `POST .../submit` re-scores what the phone sent, then a `security definer` RPC checks the timing and updates the attendee's best.
- **The portal page** is a client state machine (ready → countdown → sprint → result). Typing goes into one native input, with a lazily loaded R3F tunnel behind it.
- **The admin page** sets the window and the left-out categories, shows the board, disqualifies runs, confirms finalists and exports a CSV.

**Tech Stack:** Next.js 16.3.4 App Router. Read `node_modules/next/dist/docs/` before touching routes, actions or `next/dynamic`, because this Next has breaking changes. Also: React 19.2, TypeScript, Tailwind v4 with shadcn on `@base-ui/react`, three plus @react-three/fiber (no drei), and Supabase Postgres. Migrations are applied with the Supabase MCP `apply_migration` on project `wfmqwwcolfigjylkgrsv`. Tests use vitest on pure logic only (`tests/**/*.test.ts`, node env, no DB) plus `scripts/*-db-check.mjs` for the SQL.

**Spec:** `docs/superpowers/specs/2026-10-31-typing-qualifier-design.md`

## Global Constraints

- Decisions are numbered from **D767**. Cite them in comments and commit subjects the way the code does today, e.g. `feat(qualifier): … (D767)`.
- The migration file is `supabase/migrations/0117_typing_qualifier.sql`.
- Work on branch `feat/typing-qualifier`. Do not push; the user decides. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never test on live events (`ecphub`, `zp-my-best-me`). Create or reuse a test event.
- **The score is wpm and nothing else.** Ranks, streaks, skins and effects never change it. Ties go to higher wpm, then higher accuracy, then the earlier best run.
- Constants: `RUN_MS = 30_000`, `COUNTDOWN_MS = 3_000`, `GRACE_MS = 3_000`, `WORDS_PER_RUN = 120`, `HARD_CEILING_WPM = 250` (refused), `REVIEW_WPM = 150` (flagged), `FINALISTS = 10`. Tiers: Cadet < 40, Pilot 40–60, Commander 60–80, Ace 80+.
- Words are lowercase `a–z` only, about 1,000 common English words, with no proper nouns and nothing `obscenity` flags. The game text is English only.
- Days and times use `MY_TZ` / `nowInKL` from `src/lib/time.ts`. Events have no timezone of their own (D165).
- Feature imports go only through `@/features/qualifier` (server) or `@/features/qualifier/client` (D403). The folder layout follows D402.
- RLS is on with no policies. Every RPC is `security definer`, revoked from `public, anon, authenticated` and granted to `service_role`, as in `0049_games.sql`.
- The share text never contains the attendee's token. Use `genericLink(addr)` from `src/lib/links.ts`.
- The 3D scene must never delay the input. It loads after the input is ready and falls back to 2D.

## Review Focus

1. **A slow phone or a clock that's off:** a submit that arrives after `starts_at + RUN_MS + GRACE_MS` is refused. The phone must show "That run didn't reach us in time — it doesn't count" and offer Fly again, not hang. The countdown runs on server time (start returns `serverNow`; the client keeps the offset). → Task 1 `late` test, Task 6 browser step.
2. **Android keyboards that commit whole words** (Gboard, Samsung): an insert of `"planet "` must complete the word and advance, be counted in `multiInserts`, and flag the run without blocking it. A capital letter from auto-capitalise must count as lowercase. → Task 1 typing tests.
3. **Window closes mid-run:** a run started before `closes_at` and submitted inside its own grace counts. A start after `closes_at` is refused. → Task 3 db-check cases.
4. **Two tabs or devices:** starting a run in tab B abandons tab A's live run. A's submit gets `done`, and A shows "You started another run elsewhere". → Task 3 db-check, Task 6 browser step.
5. **Moved into a left-out category, or cancelled, after playing:** the attendee drops off the board (runs kept), can't start, and sees "This challenge isn't open to you". An admin's run list for them still loads. → Task 2 eligibility tests, Task 3 db-check.

---

### Task 1: Words, the typing reducer and scoring (D767)

**Files:**
- Create: `src/features/qualifier/words.ts`, `src/features/qualifier/typing.ts`, `src/features/qualifier/scoring.ts`
- Test: `tests/qualifier/words.test.ts`, `tests/qualifier/typing.test.ts`, `tests/qualifier/scoring.test.ts`

**Interfaces:**
- Produces:
  - `words.ts`: `WORDS: readonly string[]`; `drawWords(n: number, rand?: () => number): string[]`.
  - `typing.ts`: `type TypingState = { index: number; typed: string; keys: number; correctKeys: number; multiInserts: number; offsets: number[] }`; `initialTyping: TypingState`; `typeText(s: TypingState, words: readonly string[], text: string, tMs: number): TypingState`; `backspace(s: TypingState): TypingState`; `prefixOf(s: TypingState, words: readonly string[]): number`; `ghostIndexAt(offsets: readonly number[], tMs: number): number`.
  - `scoring.ts`: the constants from Global Constraints; `type Device = "touch" | "keyboard" | "unknown"`; `type Submission = { wordsDone: number; offsets: number[]; prefix: number; keys: number; correctKeys: number; device: Device; multiInserts: number }`; `type Scored = { wpm: number; accuracy: number; flagged: boolean }`; `type Refusal = "shape" | "offsets" | "too_fast"`; `parseSubmission(body: unknown): Submission | null`; `wpmOf(words: readonly string[], wordsDone: number, prefix: number): number`; `accuracyOf(keys: number, correctKeys: number): number`; `tooEven(offsets: readonly number[]): boolean`; `scoreRun(words: readonly string[], s: Submission): Scored | { refused: Refusal }`.

- [ ] **Step 1: Failing tests.**
```ts
// words.test.ts
it("is ~1,000 lowercase a–z words with nothing offensive", () => {
  expect(WORDS.length).toBeGreaterThanOrEqual(900);
  expect(WORDS.every((w) => /^[a-z]{2,10}$/.test(w))).toBe(true);
  expect(new Set(WORDS).size).toBe(WORDS.length);
  const m = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
  expect(WORDS.filter((w) => m.hasMatch(w))).toEqual([]);
});
it("draws n words from the list", () => {
  expect(drawWords(120, () => 0)).toHaveLength(120);
  expect(drawWords(5, () => 0).every((w) => w === WORDS[0])).toBe(true);
});
// typing.test.ts — words = ["planet", "orbit"]
it("advances on space only when the word is exact", () => {
  let s = typeText(initialTyping, words, "planex", 100);
  s = typeText(s, words, " ", 200);
  expect(s.index).toBe(0);                        // wrong word: space ignored…
  expect(s.keys).toBe(7); expect(s.correctKeys).toBe(5); // …and counted as a wrong keystroke
  s = typeText(backspace(s), words, "t ", 900);
  expect(s.index).toBe(1); expect(s.typed).toBe(""); expect(s.offsets).toEqual([900]);
});
it("accepts a whole-word commit and counts it", () => {
  const s = typeText(initialTyping, words, "planet ", 1500);
  expect(s.index).toBe(1); expect(s.multiInserts).toBe(1); expect(s.offsets).toEqual([1500]);
});
it("treats capitals as lowercase", () => {
  expect(typeText(initialTyping, words, "P", 50).correctKeys).toBe(1);
});
it("prefixOf counts only the correct leading letters", () => {
  expect(prefixOf(typeText(initialTyping, words, "plx", 10), words)).toBe(2);
});
it("ghostIndexAt replays words done by a time", () => {
  expect(ghostIndexAt([1000, 2500], 2000)).toBe(1);
  expect(ghostIndexAt([1000, 2500], 2500)).toBe(2);
});
// scoring.test.ts — words = ["the", "cat"] etc.
it("wpm = (completed chars + spaces + prefix) / 5 / 0.5 min, 1 decimal", () => {
  expect(wpmOf(["planet", "orbit"], 2, 3)).toBe(6.4); // (7 + 6 + 3) / 5 / 0.5
});
it("accuracy is a whole percent, 100 with no keys", () => {
  expect(accuracyOf(200, 197)).toBe(99); expect(accuracyOf(0, 0)).toBe(100);
});
it("refuses bad shapes", () => {
  expect(scoreRun(w, { ...ok, offsets: [500, 400] })).toEqual({ refused: "offsets" });     // not increasing
  expect(scoreRun(w, { ...ok, offsets: [31_000] })).toEqual({ refused: "offsets" });       // past RUN_MS
  expect(scoreRun(w, { ...ok, wordsDone: 2, offsets: [100] })).toEqual({ refused: "shape" });
  expect(scoreRun(w, { ...ok, correctKeys: ok.keys + 1 })).toEqual({ refused: "shape" });
  expect(scoreRun(w, { ...ok, prefix: w[ok.wordsDone].length + 1 })).toEqual({ refused: "shape" });
});
it("refuses above the hard ceiling and flags for review", () => {
  expect(scoreRun(long, fastest)).toEqual({ refused: "too_fast" });            // > 250 wpm
  expect((scoreRun(long, at155) as Scored).flagged).toBe(true);                // ≥ 150
  expect((scoreRun(w, { ...ok, multiInserts: 1 }) as Scored).flagged).toBe(true);
});
it("tooEven flags machine-regular gaps (≥ 15 words, gap CV < 0.08)", () => {
  expect(tooEven(Array.from({ length: 20 }, (_, i) => (i + 1) * 400))).toBe(true);
  expect(tooEven([300, 900, 1200, 2000, 2300, 3100, 3500, 4400, 4700, 5600, 6000, 6800, 7100, 8000, 8600])).toBe(false);
});
it("parseSubmission rejects junk and clamps device", () => {
  expect(parseSubmission({ wordsDone: "x" })).toBeNull();
  expect(parseSubmission({ ...ok, device: "toaster" })?.device).toBe("unknown");
});
```
- [ ] **Step 2:** `npx vitest run tests/qualifier` → FAIL (modules missing).
- [ ] **Step 3: Implement.**
  - `WORDS`: hand-curated common English words, kept in the file.
  - `drawWords` picks with replacement but never twice in a row.
  - The `typeText` rules:
    - Lowercase the text and process it a character at a time.
    - A space completes the word only when `typed === words[index]`. It then pushes `tMs` to `offsets` and resets `typed`. Otherwise the space is a wrong keystroke and is dropped.
    - A letter is always appended. It's correct when `typed + ch` is a prefix of the word.
    - `text.length > 1` adds 1 to `multiInserts`.
  - `scoreRun`:
    - Refuse `shape` when `wordsDone > words.length - 1`, `offsets.length !== wordsDone`, `prefix` is outside `0..words[wordsDone].length`, `correctKeys > keys`, or `keys` is lower than the characters counted.
    - Refuse `offsets` unless they strictly increase within `(0, RUN_MS]`.
    - Refuse `too_fast` above `HARD_CEILING_WPM`.
    - Flag when `wpm >= REVIEW_WPM || multiInserts > 0 || tooEven(offsets)`.
  - The client only sends a count, so "completed words are the start of the run's list" holds by construction.
- [ ] **Step 4:** `npx vitest run tests/qualifier` → PASS. `npx tsc --noEmit` is clean.
- [ ] **Step 5: Commit** `feat(qualifier): words, typing rules and scoring (D767)`.

### Task 2: Phase, eligibility, ranks, streak, skins, near-miss line (D768)

**Files:**
- Create: `src/features/qualifier/phase.ts`, `src/features/qualifier/progress.ts`, `src/features/qualifier/client.ts` (re-exports the pure modules from Tasks 1–2 plus later client components)
- Test: `tests/qualifier/phase.test.ts`, `tests/qualifier/progress.test.ts`

**Interfaces:**
- Consumes: `categoryParts` (`src/lib/agenda.ts`).
- Produces:
  - `phase.ts`: `type QualifierSettings = { opens_at: string | null; closes_at: string | null; excluded_categories: string[]; confirmed_at: string | null }`; `type Phase = "unset" | "before" | "open" | "review" | "confirmed"`; `phaseOf(s: QualifierSettings | null, now: number): Phase`; `type Ineligible = "cancelled" | "preview" | "excluded"`; `ineligibility(a: { id: string; category: string | null; cancelled_at: string | null }, previewId: string | null | undefined, excluded: readonly string[]): Ineligible | null`.
  - `progress.ts`: `type Tier = "cadet" | "pilot" | "commander" | "ace"`; `TIER_LABELS: Record<Tier, string>`; `tierOf(best: number | null): Tier`; `streakDays(days: readonly string[], today: string): number`; `SKINS = ["violet", "teal", "coral", "sky", "amber", "gold"] as const`; `type SkinId`; `unlockedSkins(p: { runs: number; streak: number; best: number | null }): SkinId[]`; `nearMiss(r: { wpm: number; prevBest: number | null; rank: number | null; cutWpm: number | null }): string`; `byStanding(a: Entry, b: Entry): number` where `Entry = { wpm: number; accuracy: number; at: string }`.

- [ ] **Step 1: Failing tests.**
```ts
it("phaseOf", () => {
  expect(phaseOf(null, t)).toBe("unset");
  expect(phaseOf({ ...s, opens_at: null }, t)).toBe("unset");
  expect(phaseOf(s, opens - 1)).toBe("before");
  expect(phaseOf(s, opens)).toBe("open");
  expect(phaseOf(s, closes)).toBe("review");              // closes_at is exclusive
  expect(phaseOf({ ...s, confirmed_at: iso }, closes + 1)).toBe("confirmed");
});
it("ineligibility: cancelled, preview, one excluded category part is enough", () => {
  expect(ineligibility({ ...a, cancelled_at: iso }, null, [])).toBe("cancelled");
  expect(ineligibility(a, a.id, [])).toBe("preview");
  expect(ineligibility({ ...a, category: "KOM, Crew" }, null, ["crew"])).toBe("excluded");
  expect(ineligibility({ ...a, category: null }, null, ["Crew"])).toBeNull();
});
it("tierOf bands", () => {
  expect([null, 39.9, 40, 59.9, 60, 80].map(tierOf)).toEqual(["cadet", "cadet", "pilot", "pilot", "commander", "ace"]);
});
it("streakDays counts back from today, or from yesterday when today has no run yet", () => {
  expect(streakDays(["2026-11-02", "2026-11-03", "2026-11-04"], "2026-11-04")).toBe(3);
  expect(streakDays(["2026-11-02", "2026-11-03"], "2026-11-04")).toBe(2);
  expect(streakDays(["2026-11-01", "2026-11-03"], "2026-11-03")).toBe(1);
  expect(streakDays([], "2026-11-03")).toBe(0);
});
it("unlockedSkins milestones", () => {
  expect(unlockedSkins({ runs: 0, streak: 0, best: null })).toEqual([]);
  expect(unlockedSkins({ runs: 1, streak: 1, best: 30 })).toEqual(["violet"]);
  expect(unlockedSkins({ runs: 10, streak: 3, best: 82 })).toEqual(["violet", "teal", "coral", "sky", "amber", "gold"]);
});
it("nearMiss lines", () => {
  expect(nearMiss({ wpm: 76, prevBest: 77.4, rank: 14, cutWpm: 79.5 })).toBe("Only 1.4 short of your best");
  expect(nearMiss({ wpm: 80, prevBest: 77.4, rank: 9, cutWpm: 79.5 })).toBe("New best! You're in the top 10!");
  expect(nearMiss({ wpm: 78, prevBest: 77.4, rank: 12, cutWpm: 79.5 })).toBe("New best! 1.5 wpm to the top 10");
  expect(nearMiss({ wpm: 50, prevBest: null, rank: 40, cutWpm: null })).toBe("First flight: 50 wpm");
});
it("byStanding: wpm, then accuracy, then earlier", () => {
  expect([e(70, 95, "b"), e(70, 98, "c"), e(70, 98, "a"), e(71, 80, "z")].sort(byStanding).map((x) => x.at)).toEqual(["z", "a", "c", "b"]);
});
```
- [ ] **Step 2:** `npx vitest run tests/qualifier` → FAIL.
- [ ] **Step 3: Implement.**
  - Skin unlocks:
    - `violet`: 1 run.
    - `teal`: 10 runs.
    - `coral`: a 3-day streak.
    - `sky`: Pilot.
    - `amber`: Commander.
    - `gold`: Ace.
  - `nearMiss`, by precedence:
    1. First run.
    2. New best: then top 10, or the gap to the cut.
    3. Short of the best: the gap to the best. Gaps use 1 decimal.
  - `byStanding` is the pure mirror of the SQL `order by` in Task 3.
- [ ] **Step 4:** Tests PASS. `tsc` is clean.
- [ ] **Step 5: Commit** `feat(qualifier): phase, eligibility and progression rules (D768)`.

### Task 3: Migration 0117, the data layer and the DB check (D769)

**Files:**
- Create: `supabase/migrations/0117_typing_qualifier.sql`, `src/features/qualifier/db.ts`, `src/features/qualifier/index.ts`, `scripts/qualifier-db-check.mjs`
- Modify: `package.json` (add `"check:qualifier": "node --env-file=.env.local scripts/qualifier-db-check.mjs"`)

**Interfaces:**
- Consumes: `QualifierSettings`, `Device`, `Scored`, `SkinId` (Tasks 1–2).
- Produces (all in `db.ts`, server-only, re-exported by `index.ts`):
  - `getSettings(eventId: string): Promise<QualifierSettings | null>`
  - `saveSettings(ev: { id: string; org_id: string }, s: Omit<QualifierSettings, "confirmed_at">): Promise<"ok" | "locked">`
  - `startRun(eventId: string, attendeeId: string, words: string[]): Promise<{ runId: string; startsAt: string } | { refused: "closed" | "ineligible" }>`
  - `getRun(runId: string, attendeeId: string): Promise<{ id: string; event_id: string; words: string[]; starts_at: string; status: "live" | "abandoned" | "done" } | null>`
  - `submitRun(runId: string, attendeeId: string, r: Scored & { wordsDone: number; offsets: number[]; device: Device; multiInserts: number }): Promise<"ok" | "early" | "late" | "done" | "refused">`
  - `type BoardRow = { rank: number; attendee_id: string; name: string; extra: Record<string, unknown> | null; best_wpm: number; best_accuracy: number; best_at: string; best_run_id: string; skin: SkinId | null; runs_played: number; flagged: boolean; device: Device }`
  - `listBoard(eventId: string, limit: number, offset: number): Promise<BoardRow[]>`; `boardSize(eventId: string): Promise<number>`
  - `type Player = { best_wpm: number | null; best_accuracy: number | null; best_run_id: string | null; runs_played: number; run_days: string[]; skin: SkinId | null; last_seen_rank: number | null }`; `getPlayer(eventId: string, attendeeId: string): Promise<Player | null>`
  - `rankOf(eventId: string, attendeeId: string): Promise<number | null>`; `runOffsets(runId: string, eventId: string): Promise<number[] | null>`
  - `setSkin(eventId: string, attendeeId: string, skin: SkinId): Promise<void>`; `markSeen(eventId: string, attendeeId: string, rank: number | null): Promise<void>`
  - `type RunRow = { id: string; starts_at: string; status: string; wpm: number | null; accuracy: number | null; words_done: number | null; device: Device; multi_inserts: number; flagged: boolean; disqualified_at: string | null }`; `listRuns(eventId: string, attendeeId: string): Promise<RunRow[]>`
  - `setDisqualified(eventId: string, runId: string, on: boolean): Promise<"ok" | "locked" | "missing">`
  - `confirmFinalists(eventId: string, by: string): Promise<"ok" | "not_closed" | "already">`
  - `type Finalist = { rank: number; attendee_id: string; best_wpm: number; best_accuracy: number; skin: SkinId | null }`; `listFinalists(eventId: string): Promise<Finalist[]>`

- [ ] **Step 1: Write the migration.**
  - **Tables** (each has `org_id` and `event_id references events on delete cascade`, as games do):
    - **`qualifier_settings`**: `event_id` pk, `opens_at`, `closes_at`, `excluded_categories text[] not null default '{}'`, `confirmed_at`, `confirmed_by uuid`, `updated_at`. Check `closes_at > opens_at`.
    - **`qualifier_runs`**: `id`, `attendee_id references attendees on delete cascade`, `words text[] not null`, `starts_at timestamptz not null`, `submitted_at`, `status text not null default 'live' check (status in ('live','abandoned','done'))`, `wpm numeric(5,1)`, `accuracy smallint`, `words_done smallint`, `offsets int[]`, `device text not null default 'unknown'`, `multi_inserts smallint not null default 0`, `flagged boolean not null default false`, `disqualified_at`, `created_at`.
      - Add a unique partial index on `(attendee_id) where status = 'live'` (one live run per attendee) and an index on `(event_id, attendee_id)`.
    - **`qualifier_players`**: pk `(event_id, attendee_id)`, `best_run_id references qualifier_runs on delete set null`, `best_wpm`, `best_accuracy`, `best_at`, `runs_played int not null default 0`, `run_days date[] not null default '{}'`, `skin text`, `last_seen_rank int`.
    - **`qualifier_finalists`**: pk `(event_id, rank)`, `attendee_id`, `best_wpm`, `best_accuracy`, `skin`.
  - **Functions:**
    - **Eligibility** (internal SQL): the attendee is in the event, `cancelled_at is null`, is not `events.preview_attendee_id`, and is not `(cardinality(excluded) > 0 and category_matches(excluded, category))` (0048).
    - **`qualifier_start(p_event_id, p_attendee_id, p_words text[], p_countdown_ms int)`** returns `(run_id, starts_at)` or a refusal code:
      - It refuses unless `opens_at <= now() < closes_at`, the event is not confirmed, and the attendee is eligible.
      - It sets that attendee's `live` runs to `abandoned` in the same statement block, then inserts with `starts_at = now() + countdown`.
    - **`qualifier_submit(p_run_id, p_attendee_id, p_wpm, p_accuracy, p_words_done, p_offsets, p_device, p_multi, p_flagged)`** returns `text`:
      - `done` when the run is not `live`.
      - `early` when `now() < starts_at + 30 s − 1 s`.
      - `late` when `now() > starts_at + 30 s + 3 s`.
      - `refused` when `p_wpm > 250`. The route already refuses it; this is the backstop.
      - Otherwise it writes the run as `done` and calls the refresh below.
      - Do **not** check `closes_at` here, so a run started inside the window always counts.
    - **`qualifier_refresh_player(p_event_id, p_attendee_id)`** (internal):
      - Best = the best non-disqualified `done` run, ordered `wpm desc, accuracy desc, starts_at asc`.
      - `runs_played` = count of `done` runs.
      - `run_days` = the distinct `(starts_at at time zone 'Asia/Kuala_Lumpur')::date` of `done` runs.
      - Upsert the row.
    - **`qualifier_board(p_event_id, p_limit, p_offset)`** joins `attendees` for `name` and `extra`, plus the best run's `flagged` and `device`. It keeps eligible players with a best only, orders by `best_wpm desc, best_accuracy desc, best_at asc, attendee_id`, and returns `row_number()` as the rank.
      - **`qualifier_rank(p_event_id, p_attendee_id)`** and **`qualifier_board_size(p_event_id)`** follow the same rule.
    - **`qualifier_set_disqualified(p_event_id, p_run_id, p_on)`** returns `locked` once confirmed. Otherwise it sets or clears `disqualified_at` and refreshes the player.
    - **`qualifier_confirm(p_event_id, p_by)`**:
      - `not_closed` when `now() < closes_at` (or unset).
      - `already` when confirmed.
      - Otherwise it inserts the board's top 10 into `qualifier_finalists` and sets `confirmed_at` and `confirmed_by`.
    - **Settings writes** go through **`qualifier_save_settings(...)`**, which returns `locked` once confirmed.
  - `revoke` / `grant` every function with its exact signature, as at the end of `0049_games.sql`.
- [ ] **Step 2: Apply** with the Supabase MCP `apply_migration` (name `typing_qualifier`).
- [ ] **Step 3: Write `db.ts`** with thin wrappers over the tables and RPCs, in the style of `src/features/games/db.ts`.
- [ ] **Step 4: Write `scripts/qualifier-db-check.mjs`** in the style of `games-db-check.mjs`. Its header lists what it proves, and it creates and deletes its own event. Cases:
  - Start is refused before the window, after it, after the confirm, for a cancelled attendee, for the preview attendee, and for an excluded category ("KOM, Crew" with Crew left out).
  - A second start abandons the first; the first's submit returns `done`.
  - A submit before 29 s returns `early`, and one after 33 s returns `late`. Backdate `starts_at` in SQL to test this.
  - A run started before `closes_at` and submitted after it returns `ok`.
  - The best follows the tie order. Disqualifying the best falls back to the next best, and restoring brings it back. Disqualify returns `locked` after the confirm.
  - The board leaves out an attendee who was moved into an excluded category or cancelled, and their runs remain.
  - Confirm returns `not_closed` before the close and snapshots exactly 10 rows in board order; a second confirm returns `already`. Settings save returns `locked` after the confirm.
  - Deleting the event removes every qualifier row.
- [ ] **Step 5:** `npm run check:qualifier` → all pass. `npx tsc --noEmit` is clean. `npm test` is green.
- [ ] **Step 6: Commit** `feat(qualifier): migration 0117 and data layer (D769)`.

### Task 4: The add-on, the sidebar, the tile route and the admin settings (D770)

**Files:**
- Modify: `src/features/catalogue/catalogue.ts` (`ADDON_KEYS`, `FEATURES`, `NavKey`)
- Modify: `src/features/catalogue/features.ts:52` (`hiddenNav`)
- Modify: `src/components/admin/nav.ts` (Portal group, after Activities)
- Modify: `src/lib/modules.ts` (`TILE_ROUTES`, `TILE_ROUTE_LABELS`, `PERSONAL_ONLY_ROUTES`)
- Create: `src/app/admin/events/[id]/qualifier/page.tsx`, `src/app/admin/events/[id]/qualifier/actions.ts`, `src/features/qualifier/admin/SettingsCard.tsx`
- Test: `tests/catalogue/*` (extend the existing hiddenNav test), `tests/qualifier/phase.test.ts`

**Interfaces:**
- Consumes: `getSettings`, `saveSettings`, `phaseOf`.
- Produces: the add-on key `"typing_qualifier"`; `NavKey` gains `"qualifier"`; `TileRoute` gains `"qualifier"` (label "Typing qualifier", personal-only); `saveQualifierSettingsAction(eventId: string, fd: FormData)` reads `opens_at`, `closes_at` (`datetime-local` in KL via `localInputToIso`) and `excluded_categories` (comma-separated, via `parseCategories`).

- [ ] **Step 1: Failing test:** `hiddenNav` hides `"qualifier"` without the add-on and shows it with `typing_qualifier`.
- [ ] **Step 2:** It FAILs.
- [ ] **Step 3: Implement.**
  - `FEATURES.typing_qualifier = addon("Typing qualifier", "A week of 30-second typing sprints; the top 10 go to the finale.", { nav: ["qualifier"] }, [{ key: "typing-qualifier", kind: "card", title: "Typing qualifier", send: ["When the qualifier week opens and closes", "Any categories to leave out, e.g. staff or committee"] }])`.
  - In `hiddenNav`, push `"qualifier"` when `!nav.has("qualifier")`, in sidebar order.
  - In the nav, add `{ href: `${b}/qualifier`, label: "Typing qualifier", icon: <an existing IconName, e.g. "star">, key: "qualifier" }`.
  - **The admin page:**
    - Call `requireEventAccess(id)`. Without the add-on, show `NotInEvent` with `keys={["typing_qualifier"]}`, as on the games page.
    - Render an `AdminHeader` with a phase subtitle: "Not scheduled", "Opens <date>", "Open until <date>", "Closed — under review", or "Finalists confirmed".
    - `SettingsCard` holds the open and close fields, the left-out categories, and a Save button. The fields are disabled with a note once confirmed.
  - The action calls `requireEventAccess` and `requireFeature`, refuses `closes <= opens` with "Close must be after open", and flashes "Saved." or "Finalists are confirmed — settings are locked."
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit` and `npm run lint` are clean.
- [ ] **Step 5: Browser check** on the test event:
  - The Features tab turns it on and the sidebar item appears.
  - Save a window, and the subtitle follows.
  - The Modules tile editor offers "Typing qualifier", and the public portal home does not show that tile.
- [ ] **Step 6: Commit** `feat(qualifier): add-on, nav, tile route and window settings (D770)`.

### Task 5: The start and submit endpoints, the portal view, and the load test (D771)

**Files:**
- Create: `src/features/qualifier/view.ts` (server-only), `src/app/api/qualifier/[token]/start/route.ts`, `src/app/api/qualifier/[token]/submit/route.ts`, `scripts/qualifier-load.mjs`
- Modify: `src/features/qualifier/index.ts`, `package.json` (`"load:qualifier": "node --env-file=.env.local scripts/qualifier-load.mjs"`)
- Test: `tests/qualifier/view.test.ts` (the pure `boardSlices`)

**Interfaces:**
- Consumes: `playContext` (`@/features/games`), `allow`, `json`, `createMemo`, `tagsFor`, `drawWords`, `scoreRun`, `parseSubmission`, `ineligibility`, `phaseOf`, the progress functions and the Task 3 db functions.
- Produces:
  - `type BoardEntry = { rank: number; label: string; skin: SkinId | null; wpm: number; me: boolean }`
  - `boardSlices(rows: BoardEntry[], myRank: number | null): { top: BoardEntry[]; around: BoardEntry[] }`. `top` is ranks 1–20. `around` is ranks myRank−1 to myRank+1 when myRank > 20, otherwise empty.
  - `type QualifierView = { phase: Phase; opensAt: string | null; closesAt: string | null; ineligible: Ineligible | null; me: { best: number | null; accuracy: number | null; rank: number | null; total: number; tier: Tier; streak: number; runDays: string[]; skins: SkinId[]; skin: SkinId | null; runs: number; dropped: { from: number; to: number | null } | null }; cutWpm: number | null; finalist: boolean | null; board: { top: BoardEntry[]; around: BoardEntry[] } }`
  - `qualifierView(ctx: PlayContext, now: number): Promise<QualifierView>`. Board rows are memoised per event for 3 s; `dropped` comes from `last_seen_rank` against the current rank (a fall out of the top 10, or any fall).
  - **Start** `POST /api/qualifier/[token]/start` → `{ runId, startsAt, serverNow, words, ghosts: { best: number[] | null; cut: number[] | null } }`. The cut ghost is the #10 row's best run, left out when the caller *is* #10 or fewer than 10 players are ranked. Errors: 403 `{ error }` for ineligible or closed, 429 for the rate limit (`allow("qstart:"+token, 20, 60_000)`).
  - **Submit** `POST /api/qualifier/[token]/submit` with body `{ runId } & Submission` → `{ ok: true; wpm: number; accuracy: number; prevBest: number | null; line: string; view: QualifierView }` or `{ ok: false; reason: "late" | "early" | "done" | "refused" }`. Rate limit `allow("qsub:"+token, 20, 60_000)`. The line comes from `nearMiss`.

- [ ] **Step 1: Failing test** for `boardSlices`: with 25 rows and myRank 23 → `top` is 1–20 and `around` is 22–24; with myRank 21 → `around` is 20–22 minus those already in `top`; with myRank null → `around` is `[]`.
- [ ] **Step 2:** It FAILs. **Step 3:** Implement `view.ts` and both routes. The start route checks `ineligibility` before the RPC so a clear 403 message comes back. The submit route reads the run with `getRun`, calls `scoreRun(run.words, sub)`, and maps a refusal to `refused`. Labels use `tagsFor` over the slice's rows.
  - After an `ok` submit, the route calls `markSeen` with the new rank, so a player's own climb during a visit is the baseline for the next "dropped" check, not their rank when the page opened.
- [ ] **Step 4: Write `qualifier-load.mjs`** in the style of `games-load.mjs`. It runs N virtual players (default 500) against a URL argument, each looping start → wait 30 s → submit with a plausible run for 3 minutes, and prints p50/p95 latency and the error count.
- [ ] **Step 5:** Tests, `tsc` and lint are clean. Run `npm run load:qualifier` against a local prod build (`npm run build && npm start`) on the test event. Expected: no 5xx, and p95 under 500 ms locally.
- [ ] **Step 6: Commit** `feat(qualifier): start and submit endpoints, portal view, load script (D771)`.

### Task 6: The portal page and the run screens, in 2D (D772)

**Files:**
- Create: `src/app/e/[slug]/(portal)/a/[token]/qualifier/page.tsx`, `src/app/e/[slug]/(portal)/a/[token]/qualifier/actions.ts`, `src/features/qualifier/components/QualifierClient.tsx`, `src/features/qualifier/components/TypingInput.tsx`, `src/features/qualifier/components/RunHud.tsx`, `src/features/qualifier/components/ResultCard.tsx`, `src/features/qualifier/components/Board.tsx`, `src/features/qualifier/components/Tunnel2D.tsx`
- Modify: `src/features/qualifier/client.ts` (export `QualifierClient`)

**Interfaces:**
- Consumes: `QualifierView`, the start and submit endpoints (Task 5), `typeText` / `backspace` / `prefixOf` / `ghostIndexAt` (Task 1), `loadPortalAttendee`, `isUnpublished`.
- Produces:
  - `QualifierClient({ token, slug, initial }: { token: string; slug: string; initial: QualifierView })`.
  - `markSeenAction(slug: string, token: string): Promise<void>`, called once on mount.
  - `TypingInput({ onText, onBackspace, disabled }: { onText(text: string, tMs: number): void; onBackspace(): void; disabled: boolean })`.
  - `type Tunnel2DProps = { progress: number; ghosts: { best: number | null; cut: number | null }; skin: SkinId | null }` and `Tunnel2D(props: Tunnel2DProps)`. `progress` and the ghosts are counts of completed words, which Task 7's `Tunnel3D` uses the same way.

- [ ] **Step 1: The page.**
  - Start with `loadPortalAttendee`. A draft returns null; an archived event shows "The qualifier is closed for this event."
  - Show "This challenge isn't open to you" when `view.ineligible` is set.
  - Otherwise render `<h1>` "Typing qualifier" (with `TITLE_INK`) and `QualifierClient`.
- [ ] **Step 2: `TypingInput`.**
  - It's a single `<input>` with `autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} inputMode="text" enterKeyHint="next"`, kept empty after every event.
  - It reads `beforeinput`: `insertText` and `insertCompositionText` (or the committed text) go to `onText`, and `deleteContentBackward` goes to `onBackspace`. It `preventDefault`s `insertFromPaste` and `insertFromDrop`.
  - Times come from `performance.now()` relative to the server-aligned start.
  - It detects the device: `matchMedia("(pointer: coarse)")` with no physical `keydown` whose `key.length === 1` → `"touch"`; else `"keyboard"`.
- [ ] **Step 3: `QualifierClient` states.**
  - **ready:** best, rank, the gap to #10, and **Fly** (Enter works). On the first visit, a two-line how-to.
  - **countdown:** 3-2-1, timed against `startsAt` using the offset `serverNow − Date.now()`. The input is focused at "1".
  - **sprint:** the current word large, with correct letters green and wrong letters red, and the next 3 words small. `RunHud` shows the time left and live wpm (`wpmOf` over the elapsed time). `Tunnel2D` shows the ghosts from `ghostIndexAt`. Enter does nothing during the sprint.
  - **result:** submit at 30 s. On `ok`, show `ResultCard` (wpm, accuracy, the line, a best-vs-#10 bar, **Fly again** as primary with Enter or a tap, and **Share** as secondary).
    - `late`: "That run didn't reach us in time — it doesn't count".
    - `done`: "You started another run elsewhere".
    - `refused`: "That run couldn't be counted".
  - **Swipe notice:** the first time `multiInserts` goes above 0 in a session, show "Type letter by letter — swipe typing may be disqualified" once.
  - **Fly again** starts the next run straight away (the start request plus the countdown). It's under 1 s before the countdown appears.
  - **Phases:** before → "Opens <date>" with a countdown. Review → the board plus "Results under review — finalists announced soon", with no top-10 claims. Confirmed → the final board, the final rank, and "You're through to the finale!" when `finalist`.
- [ ] **Step 4: `Board`.** Show the top 10, a dashed **Finale cut** line, 11–20, then `around` after a "…" row. Your own row is highlighted. Show a countdown to the close while open. The dropped banner shows when `me.dropped`: "You were knocked to #11 — 0.6 wpm to get back in" (or "down to #N").
- [ ] **Step 5:** `tsc`, lint and `npm test` are clean.
- [ ] **Step 6: Browser check** on the test event, on a phone-sized viewport and on a desktop:
  - The full loop works, and so does restarting with Enter.
  - A wrong word blocks Space until it's fixed. Paste does nothing.
  - Ghosts appear after a second run, and the cut ghost appears with 10 or more players. Seed them with `check:qualifier` fixtures or SQL.
  - A second tab's run makes the first show "started elsewhere".
  - Throttle the network (DevTools "Slow 3G") and delay the submit past 33 s: the "didn't reach us" message appears.
  - On a real Android phone with Gboard, the words advance and the run is flagged only when swipe typing is used.
- [ ] **Step 7: Commit** `feat(qualifier): portal page and run screens (D772)`.

### Task 7: The 3D gate tunnel, loaded lazily with a 2D fallback (D773)

**Files:**
- Create: `src/features/qualifier/components/Tunnel3D.tsx`, `src/features/qualifier/components/Tunnel.tsx`
- Modify: `QualifierClient.tsx` (render `Tunnel` instead of `Tunnel2D`)

**Interfaces:**
- Consumes: `Tunnel2D` and its props (Task 6). Reuse patterns from `src/features/games/components/display/three/` (for example `useAnimating`), but no LED-only code.
- Produces: `Tunnel(props: Tunnel2DProps)`, which picks 3D or 2D. `Tunnel3D(props: Tunnel2DProps & { onSlow(): void })`.

- [ ] **Step 1: `Tunnel`.**
  - It renders `Tunnel2D` until the input is ready. Then it loads `Tunnel3D` with `next/dynamic` and `ssr: false` (check the Next docs for the current API).
  - It stays on 2D when `prefers-reduced-motion` is set, when WebGL can't be created, or after `onSlow`.
- [ ] **Step 2: `Tunnel3D`.**
  - It's an R3F `<Canvas>` behind the word card (`pointer-events: none`, `aria-hidden`).
  - Gates are rounded-rect rings receding down −z. The ship is a simple low-poly mesh in the skin colour. Ghosts are translucent ships at their `ghostIndexAt` positions.
  - Each completed word eases the camera through one gate.
  - Colours come from the event theme where the portal exposes them; otherwise use the violet / amber defaults.
  - `frameloop="always"` only during the sprint, `"demand"` otherwise. `dpr={[1, 1.5]}`.
  - It calls `onSlow` when the average frame time is over 50 ms for 2 s.
- [ ] **Step 3:** `tsc` and lint are clean, and `npm run build` succeeds. The qualifier page's first-load JS doesn't include three: check the build output or the network tab, where three arrives only after the input is ready.
- [ ] **Step 4: Browser check:**
  - Typing latency feels the same with 3D on and off. Use the Performance panel: no long task over 50 ms on keypress.
  - Emulating reduced motion gives 2D.
  - With CPU throttled 6×, it falls back to 2D within a few seconds.
- [ ] **Step 5: Commit** `feat(qualifier): 3D gate tunnel with 2D fallback (D773)`.

### Task 8: Ranks, streak, skins, the dropped notice and share (D774)

**Files:**
- Create: `src/features/qualifier/components/Progress.tsx`, `src/features/qualifier/components/SkinPicker.tsx`, `src/features/qualifier/components/ShareButton.tsx`
- Modify: `src/app/e/[slug]/(portal)/a/[token]/qualifier/actions.ts` (add `chooseSkinAction(slug: string, token: string, skin: string): Promise<{ ok: boolean }>`), `QualifierClient.tsx`, `src/features/qualifier/view.ts` (add `shareUrl: string` to `QualifierView`, from `genericLink`)
- Test: `tests/qualifier/progress.test.ts` (add `shareText`)

**Interfaces:**
- Consumes: `tierOf`, `TIER_LABELS`, `streakDays`, `unlockedSkins`, `SKINS`, `setSkin`.
- Produces: `shareText(wpm: number, rank: number | null, url: string): string` in `progress.ts`, e.g. `"I flew 76 wpm in the Typing Qualifier — #14 so far. <url>"`.

- [ ] **Step 1: Failing test.** `shareText(76, 14, "https://x/e/demo")` equals `"I flew 76 wpm in the Typing Qualifier — #14 so far. https://x/e/demo"`. A rank of null leaves out "— #N so far". The text never matches `/\/a\/[A-Za-z0-9]{12}/`.
- [ ] **Step 2:** It FAILs. **Step 3: Implement.**
  - `Progress` shows the tier badge (four steps, current highlighted), 7 streak dots for the window's days (from `runDays`), and the unlocked skins with the next milestone ("Next skin at 60 wpm").
  - `SkinPicker` calls `chooseSkinAction`. The action calls `loadPortalAttendee`, checks the skin is in `unlockedSkins` for that player, and saves it.
  - `ShareButton` uses `navigator.share({ text })` when available, otherwise copies to the clipboard and shows "Copied".
  - The ship and the board row use the chosen skin colour.
- [ ] **Step 4:** Tests, `tsc` and lint are clean. **Browser check:** the skin unlocks after the 1st run and persists after a reload; share copies text without the token; the streak dots fill after runs on two days (backdate `starts_at` in SQL on the test event).
- [ ] **Step 5: Commit** `feat(qualifier): ranks, streak, skins and share (D774)`.

### Task 9: Admin review — board, runs, disqualify, confirm finalists, export (D775)

**Files:**
- Create: `src/features/qualifier/admin/BoardTable.tsx`, `src/features/qualifier/admin/RunsTable.tsx`, `src/features/qualifier/admin/ConfirmCard.tsx`, `src/app/admin/events/[id]/qualifier/[attendeeId]/page.tsx`, `src/app/admin/events/[id]/qualifier/export/route.ts`, `src/features/qualifier/export.ts`
- Modify: `src/app/admin/events/[id]/qualifier/page.tsx`, `src/app/admin/events/[id]/qualifier/actions.ts`
- Test: `tests/qualifier/export.test.ts`

**Interfaces:**
- Consumes: `listBoard`, `boardSize`, `listRuns`, `setDisqualified`, `confirmFinalists`, `listFinalists`, `phaseOf`, `tagsFor`.
- Produces: `setRunDisqualifiedAction(eventId: string, attendeeId: string, runId: string, on: boolean)`; `confirmFinalistsAction(eventId: string)`; `exportCsv(rows: BoardRow[], finalists: Finalist[] | null): string`.

- [ ] **Step 1: Failing test** for `exportCsv`:
  - The header is `Rank,Name,Best wpm,Accuracy,Runs,Device,Flagged,Finalist`.
  - Names with commas or quotes are escaped.
  - With finalists, the `Finalist` column is `yes` for exactly those 10. Without finalists, it's empty.
- [ ] **Step 2:** It FAILs. **Step 3: Implement.**
  - **`BoardTable`**: paged at 50, using `selectAll` only if it pages the whole event. Columns: rank, name (linking to the attendee's runs), best wpm, accuracy, runs, device, and a "Review" badge when the best run is flagged. A cut line after #10.
  - **The attendee page** (`requireEventAccess` and `requireFeature`) has a `RunsTable`, newest first, with **Disqualify** / **Restore** (a `ConfirmButton`) hidden once confirmed.
  - **`ConfirmCard`** shows only in `review`. It lists the current top 10 and how many are flagged ("2 of the top 10 need review"). **Confirm finalists** opens a `ConfirmButton` with "Lock the top 10 as the finale list? The board and settings can't change after this."
  - **After the confirm**, the card shows the finalist list and the confirmed time.
  - **The export route** returns `text/csv` named `<slug>-typing-qualifier.csv`, after `requireEventAccess`.
  - The actions flash "Run disqualified.", "Run restored.", "Finalists confirmed.", or the refusal: "Close the qualifier first.", "Already confirmed." or "Settings are locked."
- [ ] **Step 4:** Tests, `tsc` and lint are clean.
- [ ] **Step 5: Browser check** on the test event, with the window moved into the past:
  - The portal shows "under review".
  - Disqualifying a top-10 run moves #11 up on both the admin and the portal (within the 3 s memo).
  - Confirming freezes it: the buttons are gone, the settings are locked, and the portal says "You're through to the finale!" for the ten.
  - The CSV opens in Excel with the right columns.
  - A committee member (not an Ecopia admin) can see and use this page.
- [ ] **Step 6: Commit** `feat(qualifier): admin review, confirm finalists and export (D775)`.

### Task 10: Wrap-up

**Files:**
- Modify: `docs/superpowers/specs/2026-10-31-typing-qualifier-design.md` (header: "Decisions D767–D775.")

- [ ] **Step 1:** `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run check:qualifier` → all clean.
- [ ] **Step 2: A full pass on the test event**, with one phone and one laptop:
  - Turn the add-on on, set the window and add the tile.
  - Play several runs on each device. Check the board, ghosts, ranks, a skin, share, and the dropped banner (have the second device overtake the first).
  - Close the window, review, confirm, and export.
  - Note anything off in the commit message.
- [ ] **Step 3: Commit** `docs(qualifier): decisions D767–D775`, then do the whole-branch review.
