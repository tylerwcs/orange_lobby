# Bowling Lane Draw Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A third tournament sport format, "Lane draw", that seats every ready side's bowlers on lanes for each game, takes per-bowler scores from an admin, and ranks sides by total.

**Architecture:** Seats are stored rows (`tournament_lane_seats`); totals and places are worked out on read, like every other tournament result (D670). The draw is a pure function in `lib/lanes.ts`; `sportPlaces` gains a `lanes` branch so the overall table, the leaderboard and the activity card need no change. Pool rows keep recording who plays and forfeits.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before touching routing or server actions), Supabase Postgres + plpgsql, vitest for pure modules, node DB-check scripts.

**Spec:** `docs/superpowers/specs/2026-11-09-bowling-lanes-design.md` (D860–D868)

## Global Constraints

- Migration number 0133; decisions D860–D868; apply the migration live with Supabase MCP `apply_migration` (project `wfmqwwcolfigjylkgrsv`).
- Never test on the ecphub event; seed a `zz-` test event and delete it afterwards. Task 8 writes to ecphub (the user approved the design including D868).
- Format value `'lanes'`; form label "Lane draw (bowling)"; `lane_count` default 6 (1–20), `games` default 4 (1–10); score whole number 0–300.
- Words: "Lane", "Game", "Seat" only in the export; bowler name + side name on screen; "Scores are hidden until the organisers reveal the results." exactly.
- With the reveal switch off (`activities.show_overall === false`), attendees get no lane scores, totals or places; admins always do.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on main; push only with the user's yes.

## Review Focus

1. A side forfeited after the draw: its blank seats must not hold back places; it ranks last with forfeit (D861a). Test in Task 2.
2. Scores keyed for every seat but one: no places, running totals only. Test in Task 2.
3. Reveal switch off: the portal must not leak scores through the Totals view, the Lanes view or the activity card. Test in Task 6 (pure gate) + browser.
4. Redraw after a score: refused by the database function, not just the UI. Test in Task 1 DB check.
5. Swap where the incoming person is already seated in this sport: refused, nothing changed. Test in Task 4 (pure check) + Task 5 action.

---

### Task 1: Database

**Files:**
- Create: `supabase/migrations/0133_lane_draw.sql`, `scripts/lanes-db-check.mjs`
- Modify: `package.json` (script `check:lanes`), `src/features/tournaments/lib/squads.ts` (`TournamentSport`), `src/features/tournaments/db/tournaments.ts` (`SPORT_COLUMNS`)

**Interfaces:**
- Produces: `TournamentSport.format: "pools" | "manual" | "lanes"`, `lane_count: number`, `games: number`; table `tournament_lane_seats(sport_id, game, lane, seat, group_id, attendee_id, number, score)`; rpc `set_lane_draw(p_sport_id uuid, p_pools jsonb, p_seats jsonb, p_force boolean) returns text` ∈ `'ok' | 'has_scores' | 'missing'`.

- [ ] **Step 1: Write `scripts/lanes-db-check.mjs`** in the style of `scripts/super-teams-db-check.mjs` (seed a zz event with 3 groups, a tournament, a lanes sport; clean up at the end). Checks:
  1. format `'lanes'` accepted; `lane_count` 0 and `games` 11 refused.
  2. `set_lane_draw` with 2 pool rows and 4 seats → `ok`; rows present.
  3. a second seat with the same `(sport_id, game, attendee_id)` → unique violation.
  4. score 301 refused, 0 accepted.
  5. after a score, `set_lane_draw(..., false)` → `has_scores`, seats unchanged.
  6. `set_lane_draw(..., true)` with empty arrays → `ok`, no seats, no pool rows.
  7. unknown sport → `missing`.
- [ ] **Step 2: Run it** — `npm run check:lanes`. Expected: FAIL (format check / function missing).
- [ ] **Step 3: Write 0133** — widen `tournament_sports_format_check` to `('pools','manual','lanes')`; add `lane_count int not null default 6 check (lane_count between 1 and 20)`, `games int not null default 4 check (games between 1 and 10)`; create `tournament_lane_seats` (FKs: sport cascade, group `event_groups` cascade, attendee `attendees` cascade; `game >= 1`, `lane >= 1`, `seat >= 1`, `number >= 1`, `score between 0 and 300`; PK `(sport_id, game, lane, seat)`, unique `(sport_id, game, attendee_id)`, index on `attendee_id`); RLS on, no policies; `set_lane_draw` security definer, `search_path = ''`, locks the sport row, `has_scores` when any seat score is not null and not forced, deletes seats + pool rows, inserts pool rows from `p_pools` (`group_id`, `forfeit`, pool 0) and seats from `p_seats`; execute to service_role only. Apply with `apply_migration`.
- [ ] **Step 4: Run** — `npm run check:lanes`. Expected: 7/7 PASS. Add `lane_count, games` to `SPORT_COLUMNS` and the type; `npx tsc --noEmit` clean (fix fixtures that build `TournamentSport` by adding `lane_count: 6, games: 4`).
- [ ] **Step 5: Commit** — `feat(tournaments): lane draw in the database (D860, 0133)`.

### Task 2: The draw and the totals (pure)

**Files:**
- Create: `src/features/tournaments/lib/lanes.ts`, `tests/tournaments/lanes.test.ts`
- Modify: `src/features/tournaments/lib/results.ts` (`SportResults.seats?: LaneSeat[]`, `sportPlaces` lanes branch), `src/features/tournaments/client.ts` (export)

**Interfaces:**
- Produces:
  - `type LaneSeat = { sport_id: string; game: number; lane: number; seat: number; group_id: string; attendee_id: string; number: number; score: number | null }`
  - `drawLanes(sides: { id: string; bowlers: string[] }[], lanes: number, games: number, random?: () => number): Omit<LaneSeat, "sport_id" | "score">[]`
  - `laneTotals(seats: LaneSeat[], sideIds: string[]): { groupId: string; total: number; keyed: number; seats: number }[]` (in `sideIds` order)
  - `lanePlaces(sr: SportResults): Place[]`
  - `laneComplete(sr: SportResults): boolean` (every non-forfeit side's seats scored, and some seat exists)
  - `canSwapIn(seats: LaneSeat[], sportId: string, inId: string): boolean`

- [ ] **Step 1: Write the failing tests** (seeded `random` from a fixed LCG in the test):
  - `drawLanes` with 6 sides × 4 bowlers, 6 lanes, 4 games: 96 seats; each bowler once per game; every lane has 4 seats each game; no lane holds two of one side; each side's `number`s are {1,2,3,4} and the same in every game; total repeated lane-mate pairs across the 4 games ≤ 24.
  - 5 sides × 4 on 6 lanes: lane sizes per game are 4,4,3,3,3,3 in some order; still no same-side lane.
  - `laneTotals` sums by side, counts keyed vs seats.
  - `lanePlaces`: all keyed → places by total descending, equal totals share (40-pin tie → two 2nds, next is 4th); one blank → `[]`; side marked forfeit with blank seats → other sides placed 1..n−1 and the forfeit side last with `forfeit: true`.
  - `sportPlaces` on a lanes sport equals `lanePlaces`.
  - `canSwapIn` false for someone seated in this sport, true otherwise.
- [ ] **Step 2: Run** — `npx vitest run tests/tournaments/lanes.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `lib/lanes.ts`. Draw: per game, try ~400 arrangements (shuffle bowlers, place each on a random lane with room and no same-side bowler, restart on a dead end), score = pairs already met in earlier games, keep the lowest; lane capacity = `ceil`/`floor` split of the bowler count. Numbers: shuffle each side's bowlers once, number 1…n. Add the `lanes` branch at the top of `sportPlaces` returning `lanePlaces(sr)`; `seats` defaults to `[]`.
- [ ] **Step 4: Run** — the test file, then `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** — `feat(tournaments): draw bowlers onto lanes, rank by total (D862, D866)`.

### Task 3: Sport form

**Files:**
- Modify: `src/features/tournaments/lib/sports.ts`, `src/features/tournaments/admin/SportFields.tsx`, `src/features/tournaments/admin/actions.ts` (format-change guard), `src/features/tournaments/admin/SportsPanel.tsx` (format column text), `tests/tournaments/sports.test.ts` (or the existing readSport test file)

**Interfaces:**
- Produces: `SportSettings.format` includes `"lanes"`, plus `lane_count`, `games`.

- [ ] **Step 1: Failing tests** — `readSport` with `format=lanes, lanes=6, games=4` → `{ format: "lanes", lane_count: 6, games: 4, result_kind: "score" }`; `lanes=0` throws "Lanes must be from 1 to 20."; `games=11` throws "Games must be from 1 to 10."; other formats keep `lane_count: 6, games: 4`.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** — `readSport` reads them; SportFields adds the option "Lane draw (bowling)" and, when chosen, Lanes and Games number fields (hides pool size and result type; shows "Squads should be one fixed size: a side's total is the sum of its bowlers' scores." when min ≠ max). `saveSportAction`'s `changed` also compares `lane_count`/`games`, and the "has results" guard uses a `hasDraw(sportId)` that counts matches, pool rows or seats. Sports table shows "Lane draw · 6 lanes · 4 games".
- [ ] **Step 4: Run** — tests + `npx tsc --noEmit`. Expected: pass.
- [ ] **Step 5: Commit** — `feat(tournaments): lane draw in the sport form (D860)`.

### Task 4: Data layer

**Files:**
- Modify: `src/features/tournaments/db/results.ts`

**Interfaces:**
- Produces: `loadResults` fills `seats`; `writeLaneDraw(sportId, pools: {group_id: string; forfeit: boolean}[], seats: Omit<LaneSeat,"score">[], force: boolean): Promise<"ok"|"has_scores"|"missing">`; `saveLaneScores(sportId, game, scores: {lane: number; seat: number; score: number | null}[])`; `swapLaneBowler(sportId, outId, inId)` (updates every seat of `outId` in the sport); `resetSport` also deletes the sport's seats; `hasDraw(sportId)`.

- [ ] **Step 1:** Extend `scripts/lanes-db-check.mjs` with a check that `swapLaneBowler`'s SQL shape (update by sport + attendee) moves all games' seats — or cover by the Task 5 browser pass; ledger the choice.
- [ ] **Step 2: Implement** the functions above with the service client and `selectAll` (seats ordered by game, lane, seat).
- [ ] **Step 3: Run** — `npx tsc --noEmit`, `npm run check:lanes`. Expected: clean / pass.
- [ ] **Step 4: Commit** — `feat(tournaments): read and write lane seats`.

### Task 5: Admin Matches tab

**Files:**
- Create: `src/features/tournaments/admin/LanesSport.tsx`, `src/features/tournaments/admin/lane-actions.ts`
- Modify: `src/features/tournaments/admin/MatchesPanel.tsx` (branch + chip suffix "· 2 of 4 games" / "· done")

**Interfaces:**
- Consumes: Task 2 pure functions, Task 4 data functions, `sideRows`, `loadSides`, `markForfeitsIfDue`, existing `adminSwap` squad logic (`removeSquadMember` / `addSquadMember` with `admin: true`).
- Produces: `drawLanesAction(eventId, activityId, sportId, fd)` (ticked side ids `side:<id>`), `saveLaneGameAction(eventId, activityId, sportId, game, fd)` (fields `score:<lane>:<seat>`), `swapBowlerAction(eventId, activityId, sportId, outId, fd)` (field `attendee`).

- [ ] **Step 1:** Actions — draw: ready sides pre-ticked like the pool draw; bowlers = each ticked side's counted squad rows (`sideRows`); `writeLaneDraw` with existing forfeit flags kept; `has_scores` → "The lanes can't change once a score is in. Reset this sport's results first."; then `markForfeitsIfDue`. Save game: each field blank → null, else integer 0–300 or flash "Scores are whole numbers from 0 to 300."; flash "Game 2 saved.". Swap: refuse when `!canSwapIn` ("They're already bowling."), or the incoming person isn't in the side's groups; squad swap (remove out, add in; put back on refusal) then `swapLaneBowler`; flash "Swapped X for Y."
- [ ] **Step 2:** `LanesSport` — header row "Draw the lanes" / "Draw again" (hidden once any score) with the tick-list modal; per game a card "Game N" with Lane 1…n rows, each seat: bowler name, side name (muted), score input (`inputMode="numeric"`), ⋯ menu "Swap bowler" (modal: select of side members not seated); one "Save game N" button per card; below, a Totals table (rank once complete, else running total and "N of M keyed"); forfeit sides show "Forfeit" badge. Follow the admin design style.
- [ ] **Step 3: Verify** — `npx tsc --noEmit`, `npm test`; then browser on a seeded `zz-lanes` event (6 super teams × 4 bowlers): draw, redraw, key Game 1, refusal on redraw, key all games, places shown, swap one bowler (squad tab shows the change), forfeit one side and lift it.
- [ ] **Step 4: Commit** — `feat(tournaments): lane draw, scores and swaps on the Matches tab (D861-D866)`.

### Task 6: Portal

**Files:**
- Create: `src/features/tournaments/components/LanesView.tsx`
- Modify: `src/features/tournaments/components/TournamentPage.tsx` (views for lanes: `totals`, `lanes`; game chip via `?game=`), `src/features/tournaments/lib/lanes.ts` (`laneScoresVisible`), tests

**Interfaces:**
- Produces: `laneScoresVisible(activity: { show_overall?: boolean | null }): boolean` (false only when `show_overall === false`).

- [ ] **Step 1: Failing test** — `laneScoresVisible({ show_overall: false })` false; `true` / `null` / missing true.
- [ ] **Step 2: Implement** — the lanes sport's Results tab shows views "Totals" and "Lanes". Totals: as admin's table without inputs, or the hidden sentence. Lanes: chips Game 1…n, Lane rows, seats with name + side name + score (omitted when hidden); the viewer's seat bold/primary, their side's seats tinted. Before any seat: "The lanes haven't been drawn yet."
- [ ] **Step 3: Verify** — tests, tsc; browser as a seeded attendee with the switch on and off.
- [ ] **Step 4: Commit** — `feat(tournaments): everyone sees the lanes; scores follow the reveal switch (D867)`.

### Task 7: Export

**Files:**
- Modify: `src/features/tournaments/export.ts`, `tests/tournaments/export.test.ts`

- [ ] **Step 1: Failing test** — a lanes sport's results add to the Matches sheet a header `["Sport", "Game", "Lane", "Seat", "Bowler", "Super team" | "Group", "Score"]` and one row per seat in game/lane/seat order; Places sheet has its places once complete.
- [ ] **Step 2: Implement** — `resultSheets` needs bowler names: add optional `people?: Map<string, string>` input; the route passes attendee names for the seats.
- [ ] **Step 3: Run** — tests, tsc. **Step 4: Commit** — `feat(tournaments): lanes in the results export (D867)`.

### Task 8: ecphub + finish

- [ ] Final whole-branch review (fresh reviewer, most capable model); fix pass per executing-plans.
- [ ] With the user's push yes: push, watch Vercel.
- [ ] Switch ecphub cup cb8fd074's Bowling to `format='lanes', lane_count=6, games=4` (nothing drawn there yet) and update the About Bowling line (D868). Verify in the live admin.
- [ ] Delete the zz test events; memory file + MEMORY.md line.
