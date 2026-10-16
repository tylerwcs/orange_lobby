# Tournament results and leaderboard (layer 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins key in each sport's match results, and pools, brackets, places, points and an overall leaderboard follow from them. Attendees see it all, Reclub-style, on the tournament's portal page.

**Architecture:** The database stores only pools (`tournament_pool_groups`), matches (`tournament_matches`) and their slots (`tournament_match_slots`; a slot is a fixed group or a winner/loser pointer). One pure module, `lib/results.ts`, works out everything else on every read: who is in each slot, outcomes, pool standings, places, points and the overall table. A plpgsql function writes a sport's whole match plan in one transaction.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before writing routes or actions; see AGENTS.md), Supabase Postgres, TypeScript, vitest, ExcelJS, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-10-16-tournament-results-design.md` (D653–D672). Layer 1: `docs/superpowers/specs/2026-10-16-tournament-squads-design.md`.

## Global Constraints

- Test only on ecpkom or a throwaway event. Never write to the event with slug `ecphub`.
- Work on main, with no worktree. Commit after each task. Don't push without asking the user.
- New SQL functions pin `search_path = ''`. RLS is on, with no anon or authenticated policies.
- Words (D667): "Pool" for A–D, never "group". "Places", "Overall", "Walkover", "Forfeit", "Draw".
- Points table text format: comma-separated whole numbers, 1st first. ecphub's is `40, 35, 30, 29, 28, 27, 26, 25, 24, 23, 22, 20`.
- Scores are whole numbers from 0 to 999. Times are `m:ss.hh` or `ss.hh` (and `DNF`), stored as whole milliseconds.
- Pool size runs from 2 to 8. Score sports with the pools format need exactly 2 or 4 pools.
- Import tournament code from outside the feature only through `@/features/tournaments` (server) or `@/features/tournaments/client` (D402).
- Admin pages follow the approved admin style: tables with ⋯ `RowActions`, `Modal` dialogs, `SubmitButton`, flash via `flashPath`.

## Review Focus

- **A corrected semi after its final has a result:** the save is refused, and the message names the final (`Clear the Gold final's result first: its teams would change.`). Tested in Task 2 (`blockedBy`).
- **Two forfeiting groups in one match:** no winner, both take a loss, and neither is a winner pointer's group. The final slot then shows `Winner Gold Semi 1` with no group. Tested in Task 2.
- **A level bracket score with no "went through" picked:** the match isn't played, and the save flashes `Pick who went through.`. Tested in Task 2 (`resolveSport`) and enforced in Task 4's action.
- **A sport with matches, then a format or pool-size edit:** refused with `Reset this sport's matches to change its format.`, while name and squad-size edits still save. Tested in Task 3.
- **Groups added or deleted after the draw:** a deleted group's slots go empty (`on delete set null`) and its pool row cascades away. Pages must still render, with the empty slot reading `To be picked`. Tested in Task 2 (resolving an empty fixed slot) and in Task 1's db check.

---

### Task 1: Migration 0098, types and the results db layer

**Files:**
- Create: `supabase/migrations/0098_tournament_results.sql`
- Create: `src/features/tournaments/db/results.ts`
- Create: `scripts/results-db-check.mjs`; add `"check:results": "node --env-file=.env.local scripts/results-db-check.mjs"` to `package.json`
- Modify: `src/lib/types.ts` (Activity: `place_points?: number[] | null; show_overall?: boolean | null`)
- Modify: `src/features/tournaments/lib/squads.ts` (`TournamentSport` gains `result_kind: "score" | "time"; format: "pools" | "manual"; pool_size: number; forfeits_marked_at: string | null`)
- Modify: `src/features/tournaments/db/tournaments.ts` (both sport selects read the four new columns)
- Modify: `src/features/tournaments/index.ts` (export `./db/results`)

**Interfaces:**
- Produces (types, defined in `lib/results.ts` in Task 2, but used here; create that file now with the types only):
  ```ts
  export type PoolGroup = { sport_id: string; group_id: string; pool: number; forfeit: boolean; manual_place: number | null };
  export type Match = { id: string; sport_id: string; stage: "pool" | "bracket" | "manual"; pool: number | null; bracket: number | null; round: string; position: number; walkover_to: string | null; went_through: string | null };
  export type Slot = { match_id: string; slot: number; group_id: string | null; source_match_id: string | null; source_outcome: "winner" | "loser" | null; score: number | null; time_ms: number | null; dnf: boolean };
  export type SportResults = { sport: TournamentSport; pools: PoolGroup[]; matches: Match[]; slots: Slot[] };
  export type MatchPlan = { pools: Omit<PoolGroup, "sport_id">[]; matches: (Omit<Match, "sport_id" | "walkover_to" | "went_through"> & { slots: Pick<Slot, "slot" | "group_id" | "source_match_id" | "source_outcome">[] })[] };
  ```
- Produces (db, `db/results.ts`, server-only, service client):
  - `loadResults(activityId: string): Promise<SportResults[]>`: one per sport, in sport order. Paged with `selectAll`.
  - `writePlan(sportId: string, plan: MatchPlan, force: boolean): Promise<"ok" | "has_results">`: calls rpc `set_sport_plan`.
  - `resetSport(sportId: string): Promise<void>`: rpc `set_sport_plan` with an empty plan and force. Also clears `forfeits_marked_at`.
  - `saveSlots(matchId: string, slots: Pick<Slot, "slot" | "score" | "time_ms" | "dnf">[], match: Pick<Match, "walkover_to" | "went_through">): Promise<void>`
  - `setSlotGroups(matchId: string, groups: { slot: number; group_id: string | null }[]): Promise<void>`
  - `setForfeit(sportId: string, groupId: string, forfeit: boolean): Promise<void>`
  - `setManualPlaces(sportId: string, places: { group_id: string; place: number | null }[]): Promise<void>`
  - `addManualMatch(sportId: string, round: string, groupIds: string[]): Promise<void>` (position = max + 1, and it upserts a pool row with pool 0 for each group)
  - `deleteMatch(sportId: string, matchId: string): Promise<void>`
  - `claimForfeitMarking(sportId: string): Promise<boolean>`: `update tournament_sports set forfeits_marked_at = now() where id = $1 and forfeits_marked_at is null`, returning whether a row changed.
  - `setPlacePoints` is not needed here: Task 3 saves it through the activity update. `setShowOverall(activityId: string, show: boolean): Promise<void>`
  - `hasMatches(sportId: string): Promise<boolean>`

- [ ] **Step 1: Write the migration.** Columns per D669:
  - `activities`: `place_points int[]` and `show_overall boolean not null default true`.
  - `tournament_sports`: `result_kind text not null default 'score' check in ('score','time')`, `format text not null default 'pools' check in ('pools','manual')`, `pool_size int not null default 3 check between 2 and 8`, `forfeits_marked_at timestamptz`.
  - The three tables, as listed under Interfaces. Their FKs:
    - group ids (`group_id`, `walkover_to`, `went_through`) → `event_groups` `on delete set null`, except `tournament_pool_groups.group_id`, which is `on delete cascade`;
    - `source_match_id` → `tournament_matches` `on delete cascade`;
    - `sport_id` and `match_id` cascade.
  - Checks:
    - score between 0 and 999;
    - `time_ms > 0`;
    - `not (group_id is not null and source_match_id is not null)`;
    - `(source_match_id is null) = (source_outcome is null)`.
  - Indexes on `tournament_matches(sport_id)` and on the FK columns `tournament_match_slots(source_match_id)` and `(group_id)`.
  - RLS enabled.
  - Function `set_sport_plan(p_sport_id uuid, p_plan jsonb, p_force boolean) returns text`:
    - lock the sport row (`for update`);
    - unless `p_force`, return `'has_results'` if any slot of the sport has a score, a time or dnf, or any match has `walkover_to`/`went_through`;
    - delete the sport's matches and pool rows;
    - insert `p_plan->'pools'`, then the matches with their given ids, then the slots;
    - return `'ok'`.
- [ ] **Step 2: Apply it** with the Supabase MCP `apply_migration` (project `wfmqwwcolfigjylkgrsv`, name `tournament_results`). Expected: success, and `list_tables` shows the three tables.
- [ ] **Step 3: Write `scripts/results-db-check.mjs`**, modelled on `squads-db-check.mjs`: its own throwaway event, deleted in `finally`. It checks:
  - `set_sport_plan` writes 4 pool rows, 3 matches and 6 slots for a 2×2 plan with one pointer slot;
  - a second call without force after a score is set returns `has_results`, and with force it replaces the plan;
  - the pointer-and-group check refuses a slot with both;
  - deleting a group empties its slots and drops its pool row;
  - deleting the sport removes all of it.
- [ ] **Step 4: Run** `npm run check:squads` and then `npm run check:results`. Expected: every line PASS.
- [ ] **Step 5: Implement `db/results.ts`** and the type changes. Run `npx tsc --noEmit`. Expected: no errors.
- [ ] **Step 6: Commit** `feat(tournaments): results tables, plan function and db layer (D669)`.

### Task 2: Pure results rules

**Files:**
- Modify: `src/features/tournaments/lib/results.ts` (the types from Task 1, plus everything below)
- Modify: `src/features/tournaments/client.ts` (`export * from "./lib/results"`)
- Test: `tests/tournaments/results.test.ts`

**Interfaces (all exported from `lib/results.ts`):**
- `MAX_SCORE = 999`, `MIN_POOL = 2`, `MAX_POOL = 8`
- `poolName(i: number): string` → `"Pool A"`. `bracketName(i: number): string` → `"Gold"`, `"Silver"`, `"Bronze"`, then `"4th placing"`, `"5th placing"`…
- `parseTime(text: string): number | "dnf" | null`. `"1:52.30"` → 112300, `"52.3"` → 52300, `"DNF"`/`"dnf"` → `"dnf"`, and anything else → null. `formatTime(ms: number): string` → `"1:52.30"` (or `"52.30"` under a minute).
- `readPlacePoints(text: string): number[] | null`: blank → null. Otherwise the whole numbers ≥ 0, at most 50 of them. Throws `Points per place must be whole numbers, 1st first, separated by commas.`
- `formatProblem(groups: number, poolSize: number, kind: ResultKind): string | null`, with exact copy:
  - `` `${groups} groups don't split into pools of ${poolSize}. Change the pool size, or switch this sport to Matches I add by hand.` ``
  - `"Placing brackets need 2 or 4 pools. Use Matches I add by hand for this sport."` (score sports only)
  - It also returns a problem for fewer than 2 pools.
- `drawPools(groupIds: string[], poolSize: number, random?: () => number): string[][]`: a Fisher–Yates shuffle, chunked.
- `planPools(sport: Pick<TournamentSport, "result_kind" | "pool_size">, pools: string[][], newId: () => string): MatchPlan`. It creates:
  - pool rows;
  - pool matches: round-robin pairs in circle-method order (for 3 teams: 0v1, 1v2, 0v2), round `"pool"`, or one `"race"` per pool for time sports;
  - per bracket *b*, with p = pools:
    - score sports, p = 4: `semi` positions 0 and 1 with 2 empty slots each, `final` with slots winner(semi0) and winner(semi1), and `third` with loser(semi0) and loser(semi1);
    - score sports, p = 2: one `final` with 2 empty slots;
    - time sports: one `race` with p empty slots.
- `resolveSport(sr: SportResults, names: Map<string, string>): Resolved[]` (names: group id → group name, for notes and pointer copy). Each entry is `{ match: Match; label: string; entries: Entry[]; played: boolean; winner: string | null; loser: string | null; draw: boolean; note: string | null; order: string[] }`.
  - `Entry = { slot: number; groupId: string | null; pointer: string | null; score: number | null; timeMs: number | null; dnf: boolean; forfeit: boolean }`, where `pointer` is the copy `"Winner Gold Semi 1"`.
  - `label`: `"Pool A"`, `"Gold · Semi 1"`, `"Gold · Final"`, `"Gold · 3rd place"`, `"Gold · Final race"`, or the manual round name.
  - Rules: D658–D660, worked in match order so pointers resolve (a pointer to an unplayed match gives `groupId: null`).
  - Notes: `"Draw"`, `` `Walkover · ${name} forfeits` ``, `"Walkover"`, and `` `${name} went through` ``.
  - `order`: for races, group ids fastest first, then DNF, then forfeit. For score matches, `[winner, loser]` when played.
- `poolStandings(sr: SportResults, resolved: Resolved[]): PoolTable[]`. `PoolTable = { pool: number; name: string; rows: StandingRow[] }`.
  - `StandingRow = { groupId: string; rank: number; tied: boolean; played: number; won: number; drawn: number; lost: number; diff: number; scored: number; timeMs: number | null; dnf: boolean; forfeit: boolean }`.
  - Ranked per D659: forfeits last, competition ranking, `tied` when an equal row exists.
- `sportPlaces(sr: SportResults, resolved: Resolved[]): Place[]`, with `Place = { place: number; groupId: string; forfeit: boolean }`. Only settled places are included (D661). Manual format reads `manual_place`.
- `pointsFor(place: Place, table: number[] | null): number`: 0 when forfeit or past the table.
- `overallTable(input: { sports: TournamentSport[]; places: Map<string, Place[]>; groupIds: string[]; table: number[] }): OverallRow[]`.
  - `OverallRow = { groupId: string; rank: number; tied: boolean; total: number; bySport: (number | "F" | null)[] }`, where null means no place yet.
  - Only groups present in some sport's pools (the caller passes those ids). Tie-break per D662.
- `blockedBy(before: SportResults, after: SportResults, names: Map<string, string>): string | null`: the label of the first match that has a result in `before` and whose resolved groups differ in `after`.
- `matchesLeft(resolved: Resolved[]): number`

- [ ] **Step 1: Write the failing tests** in `tests/tournaments/results.test.ts`. Helpers build a 12-group, 4-pools-of-3 score sport through `planPools` with sequential ids. Cases:
  - `parseTime`/`formatTime` round trip: `"1:52.30"` ↔ 112300, `"DNF"`, and `"abc"` → null.
  - `readPlacePoints("40, 35, 30, 29, 28, 27, 26, 25, 24, 23, 22, 20")` gives the 12 numbers, blank gives null, and `"40, x"` throws.
  - `formatProblem(13, 3, "score")` contains `13 groups don't split into pools of 3`. `formatProblem(9, 3, "score")` is the 2-or-4-pools copy. `formatProblem(9, 3, "time")` is null. `formatProblem(12, 3, "score")` is null.
  - `planPools` for 4×3 score gives 12 pool matches, 3 brackets × 4 matches, and the finals' slots point at the semis. For time, 4 heats and 3 races of 4.
  - `drawPools` with a fixed `random` is deterministic, and every group appears exactly once.
  - Standings: A beats B 3–1, B draws C 2–2, A beats C 1–0 → A 1st (2W), then B and C by diff (B −2, C −1 → C 2nd).
  - A three-way tie on wins, diff and scored gives `rank` 1 with `tied: true` for all three.
  - A forfeit group's matches are walkovers with no points: the opponents' diff is unchanged, the forfeit group ranks last, and two forfeit groups in one match both get a loss and no winner.
  - Time heat: times 112300, 121100 and DNF give the order with DNF last, and a forfeit after the DNF.
  - Bracket: semi 4–2 and semi 1–1 with `went_through` set → the final shows both winners. 1–1 without `went_through` → not played, and the final's slot has `groupId: null` and pointer `"Winner Gold Semi 2"`.
  - Places for a finished Gold bracket are 1–4. With only the final played, only places 1 and 2.
  - Race final with two equal times shares the place: both get place 1, and the next is 3.
  - `pointsFor` gives 40 for place 1, 0 for a forfeit, and 0 for place 13 on a 12-entry table.
  - `overallTable`: totals add up, unplaced sports show null and forfeits show `"F"`. A tie on total is broken by more 1st places. A full tie is `tied: true` with an equal rank.
  - `blockedBy`: changing semi 1's scores so the other side wins, after the final has a score, returns `"Gold · Final"`. The same change before the final is played returns null.
  - Manual format places come from `manual_place`, and ties are allowed.
- [ ] **Step 2: Run** `npx vitest run tests/tournaments/results.test.ts`. Expected: FAIL (functions not defined).
- [ ] **Step 3: Implement** in `lib/results.ts`. Reuse `rankOf`-style competition ranking (`1 + count strictly ahead`). The comparator for score pools is: forfeit last, then won desc, diff desc, scored desc.
- [ ] **Step 4: Run** the test. Expected: PASS. Run `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(tournaments): pure results rules - pools, brackets, standings, places, overall (D655-D662)`.

### Task 3: Sport format settings, points table

**Files:**
- Modify: `src/features/tournaments/lib/sports.ts` (`readSport` returns `result_kind`, `format` and `pool_size` too, from form keys `result_kind`, `format`, `pool_size`)
- Modify: `src/features/tournaments/admin/SportFields.tsx` (two selects plus a pool-size number shown only for `pools`. All three are disabled, with the hint `Reset this sport's matches to change its format.`, when the prop `locked` is true)
- Modify: `src/features/tournaments/admin/SportsPanel.tsx` (pass `locked = await hasMatches(s.id)`, and add a Format column: `Pools of 3 · Score`, `By hand · Time`)
- Modify: `src/features/tournaments/db/tournaments.ts` (`updateSport` accepts the three fields)
- Modify: `src/features/tournaments/admin/actions.ts` (`saveSportAction`: when `hasMatches` and any of the three fields differ from the stored ones, flash the error `Reset this sport's matches to change its format.` and save nothing)
- Modify: `src/features/activities/kinds/tournament/settings.ts` (`place_points: readPlacePoints(form.text("place_points"))`, carried by the `TournamentKindSettings` type)
- Modify: `src/features/activities/kinds/tournament/TournamentSetupFields.tsx` (field `Points per place (optional)`, hint `1st first, separated by commas. Leave blank for no overall leaderboard.`, default value `activity?.place_points?.join(", ")`)
- Test: `tests/tournaments/sports.test.ts`, plus a settings test next to the existing kind settings tests (find them with `grep -rl readTournamentKindSettings tests`)

- [ ] **Step 1: Failing tests.**
  - `readSport` with `result_kind=time, format=pools, pool_size=3` returns them.
  - A missing `result_kind` defaults to `score`/`pools`/3.
  - `pool_size=9` throws `Pool size must be from 2 to 8.`
  - `readTournamentKindSettings` with `place_points="40, 35"` → `[40, 35]`, and blank → null.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** the files above. Disabled inputs don't post, so when `locked` the form posts hidden inputs with the stored values.
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit`. Expected: PASS, no errors.
- [ ] **Step 5: Commit** `feat(tournaments): each sport's results type and format, points per place (D653, D654)`.

### Task 4: Admin Matches tab - pools, forfeits, results, brackets, by hand

**Files:**
- Create: `src/features/tournaments/admin/MatchesPanel.tsx` (server component)
- Create: `src/features/tournaments/admin/results-actions.ts` (`"use server"`)
- Create: `src/features/tournaments/admin/forfeits.ts` (`markForfeitsIfDue(cup: Activity, sport: TournamentSport, eventId: string): Promise<void>`)
- Create: `src/features/tournaments/admin/ResultRow.tsx` (one match's form. Client only if needed for "went through" appearing on a level score. Otherwise always render the select for bracket matches, labelled `Went through (if level)`)
- Modify: `src/features/activities/tabs.ts` (`ActivityTab` gains `"matches"`. Tournament tabs become Setup, Squads, Sports, Matches, plus Leaderboard when `c.scored`)
- Modify: `src/features/activities/kinds/tournament/TournamentDetail.tsx` (render `MatchesPanel` for `matches`, pass `scored: !!activity.place_points?.length`)
- Modify: `src/features/tournaments/index.ts` (export `MatchesPanel` and the actions)

**Interfaces:**
- Consumes: Task 1's db, and Task 2's `drawPools`, `planPools`, `formatProblem`, `resolveSport`, `poolStandings`, `sportPlaces`, `pointsFor`, `blockedBy`, `matchesLeft`, `parseTime` and `poolName`. Also layer 1's `squadRows`, `countedRows`, `squadMembers` and `isLocked`.
- Produces (actions, all `(eventId, activityId, sportId, …)`, guarded like `tournament()` in `admin/actions.ts` and landing back on `?tab=matches&sport=<id>`):
  - `drawPoolsAction(…, fd)`: `fd.getAll("groups")`.
  - `savePoolsAction(…, fd)`: `pool:<groupId>` = `""` (sits out) or a pool index.
  - `resetSportAction(…)`
  - `setForfeitAction(…, groupId, forfeit: boolean)`
  - `saveResultAction(…, matchId, fd)`: `score:<slot>` / `time:<slot>`, and `went_through`.
  - `walkoverAction(…, matchId, groupId)` and `clearResultAction(…, matchId)`
  - `pickTeamsAction(…, matchId, fd)`: `slot:<n>` = group id or `""`.
  - `addMatchAction(…, fd)`: `round`, `getAll("groups")`.
  - `deleteMatchAction(…, matchId)`
  - `savePlacesAction(…, fd)`: `place:<groupId>`.

Panel layout, top to bottom, per spec D664 and the approved mockup:
1. A sport strip, as in SquadsPanel, with `` `${name} · ${left} left` `` or `· done`.
2. The format problem, if any.
3. **Pools**, which depends on whether pools exist:
   - with no pools: Draw at random opens a Modal with group checkboxes, defaulting to groups with any counted squad player in this tournament (D655);
   - with pools: pool cards, where each group has ⋯ Mark forfeit / Lift forfeit and a `Forfeit` badge, Edit pools (a Modal with one select per group: Pool A…, or Sits out), and ⋯ Reset this sport's matches (with the confirm `` `Clear every ${sport} result and its pools?` ``);
   - before forfeit marking, the warning `` `${n} squads are short. They'll be marked forfeit when squads lock.` `` with names.
4. **Pool matches** table, with header `` `${played} of ${total} played` ``.
5. **Playoffs** table per bracket. Pickers list groups whose pool place matches the bracket first (`Team 4 · A1`). Ones used elsewhere in the sport are disabled with `` `already in ${label}` ``.
6. **Places**: 1st to last with points (`0 · Forfeit`). Manual format has a number input per group instead and a Save places button.

Under manual format, sections 3–5 are replaced by an **Add match** Modal (round name; two group selects for score, checkboxes for time) and a table of matches grouped by round.

Action rules:
- `saveResultAction`:
  - parse every input: score sports need both scores as whole numbers 0–999, else `Scores must be whole numbers from 0 to 999.`; time sports need each slot as `parseTime` ≠ null, else `Times look like 1:52.30, or DNF.`;
  - a level bracket score needs `went_through` (one of the two groups), else `Pick who went through.`;
  - then build `after` by applying the change to `before`, and refuse with `` `Clear the ${label}'s result first: its teams would change.` `` when `blockedBy` returns a label;
  - then `saveSlots`.
  - Flash `Result saved.`
- `pickTeamsAction` also runs `blockedBy`.
- `drawPoolsAction`/`savePoolsAction`:
  - refuse with `formatProblem`;
  - refuse with `Pools can't change once a result is in. Reset this sport's matches first.` when `writePlan` answers `has_results`;
  - after writing, if squads are locked, run `markForfeitsIfDue`.
- `markForfeitsIfDue`:
  - only when `isLocked(cup.squads_close_at, now)`, pools exist and `claimForfeitMarking(sport.id)` is true;
  - then `setForfeit(true)` for each pool group whose counted squad is below `min_size`.
  - The panel calls it on render, for the shown sport, before loading results. `saveResultAction` calls it too.

- [ ] **Step 1: Implement** tabs, the panel, the actions and forfeits. Pure logic stays in Task 2's module; anything new and pure goes there with a test. For example, add `defaultPlaying(groupIds: string[], counted: SquadRow[]): string[]` and `pickerOptions(…)` to `lib/results.ts` and test them in `results.test.ts` first (red, then green).
- [ ] **Step 2: Run** `npm test` and `npx tsc --noEmit`, then `npm run lint`. Expected: all pass, no errors.
- [ ] **Step 3: Check in the browser on ecpkom.**
  - Start the dev server with `preview_start` (see `.claude/launch.json`).
  - Add 11 test groups named `ZZ Test 01`…`ZZ Test 11` to ecpkom with SQL, giving it 12 with Team 1, and one test attendee each.
  - Create a tournament with Futsal (score, pools of 3) and Swimming (time).
  - Draw pools, enter results including a draw and a walkover, pick semis, save a level semi without and then with "went through", and see the final fill.
  - Try to change semi 1 after the final has a score, and see the refusal.
  - Set a squad deadline in the past, then check the forfeit marking.
  - Do the swimming heat and final race with a DNF.
- [ ] **Step 4: Commit** `feat(tournaments): admin Matches tab - pools, forfeits, results, brackets, matches by hand (D655-D661, D664, D665)`.

### Task 5: Admin Leaderboard tab and reveal switch

**Files:**
- Create: `src/features/tournaments/admin/LeaderboardPanel.tsx`
- Create: `src/features/tournaments/components/OverallTable.tsx` (shared with the portal: props `{ rows: OverallRow[]; sports: TournamentSport[]; names: Map<string, string>; highlight?: string | null }`. Short sport names are the first 3 letters, with the full name in `title` and `sr-only`)
- Modify: `results-actions.ts` (`toggleOverallAction(eventId, activityId, show: boolean)`)
- Modify: `TournamentDetail.tsx` (`leaderboard` tab)

- [ ] **Step 1: Implement.**
  - The switch uses the existing `OpenSwitch`-style switch pattern with the label `Show the overall leaderboard to attendees`.
  - The table is `overallTable` over every sport's `sportPlaces`, with the groups in any sport's pools.
  - Under it, a points line: `` `Points: 1st ${t[0]} · 2nd ${t[1]} · … · ${n}th ${t[n-1]}` ``.
- [ ] **Step 2: Run** `npm test`, `npx tsc --noEmit` and `npm run lint`. Expected: pass.
- [ ] **Step 3: Check in the browser on ecpkom.** The totals match the places from Task 4, and the switch flips with a flash.
- [ ] **Step 4: Commit** `feat(tournaments): admin Leaderboard tab and reveal switch (D662, D664)`.

### Task 6: Portal results views and card line

**Files:**
- Create: `src/features/tournaments/components/ResultsPage.tsx` (server component: the nav plus the views)
- Create: `src/features/tournaments/components/MatchCard.tsx`, `StandingsView.tsx`, `PlayoffsView.tsx`, `OverallView.tsx` (podium plus `OverallTable`)
- Modify: `src/features/activities/kinds/tournament/TournamentBody.tsx`
- Modify: `src/features/activities/portal/ActivityPage.tsx` (pass `sport`, `view` and `show` search params through to `TournamentBody`)
- Modify: `src/features/activities/lib/portal-activity-entries.ts` (`TournamentEntry` gains `results: SportResults[]`, loaded by `loadResults` in `loadTournaments`)
- Modify: `src/features/activities/lib/activity-card.ts` and `src/features/activities/cards.ts` (`tournamentCard` input gains `results: { overall: { rank: number; tied: boolean; total: number } | null; any: boolean }`)
- Test: `tests/activities/` card test (find it with `grep -rl tournamentCard tests`)

**Interfaces:**
- Consumes: everything from Task 2, plus `OverallTable` from Task 5.
- `ResultsPage` props: `{ activity: Activity; results: SportResults[]; names: Map<string, string>; groupId: string; sportId: string | null; view: "matches" | "standings" | "playoffs" | "squads" | null; show: "all" | "mine" | "left" | "done"; squads: ReactNode; slug: string; token: string }`
- URLs: `?sport=overall`, `?sport=<id>&view=standings`, `&show=mine`. The links are plain `Link`s; there's no client state.

Rules:
- `TournamentBody` renders today's `SquadsPage` unchanged while squads aren't locked and no sport has pools. Otherwise it renders `ResultsPage`.
- `ResultsPage` defaults: with no `sport` param, Overall when `place_points?.length && show_overall !== false`, else the first sport. With no `view`, `matches`.
- The Squads view passes `SquadsPage` with `sports=[thatSport]`.
- The Overall chip is hidden when there's no table or `show_overall === false`.
- Standings is hidden for manual format, and so is Playoffs. Playoffs lists places with points under the brackets.
- Match cards:
  - the viewer's group is tinted `bg-primary/5`;
  - a tick when played, and the winner in bold;
  - notes in small type;
  - empty slots read `To be picked`, or the pointer copy.
- Bracket drawing: a two-column flex per bracket, semis on the left, Final and 3rd place on the right. Races are listed in order with times.
- Card:
  - after lock with `results.any`: the status is `` `Your group: ${ordinal(rank)}${tied ? "=" : ""} overall · ${total} pts` `` when the overall is shown, else `Results are in`;
  - the action is `View results`;
  - with locked and no results, it stays `Squads locked`.

- [ ] **Step 1: Failing card test.**
  - `tournamentCard({ …, locked: true, results: { overall: { rank: 3, tied: false, total: 104 }, any: true } })` gives the status label `Your group: 3rd overall · 104 pts` and the action `View results`.
  - With `overall: null, any: true` the status is `Results are in`.
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement** the card, then the views.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit` and `npm run lint`. Expected: pass.
- [ ] **Step 5: Check in the browser** with the Playwright MCP (the app's pane doesn't hydrate portal pages), as an ecpkom test attendee in a test group, at 375 px wide:
  - every chip and view;
  - Your matches;
  - a forfeit note;
  - the reveal switch off, which hides Overall.
- [ ] **Step 6: Commit** `feat(tournaments): portal results - matches, standings, playoffs, overall (D663)`.

### Task 7: Export results

**Files:**
- Create: `src/app/admin/events/[id]/export/results.xlsx/route.ts` (copy the squads route's guard and 404 rule)
- Modify: `src/features/tournaments/export.ts` (`resultSheets(input: { results: SportResults[]; names: Map<string, string>; table: number[] | null; showOverall: boolean }): { matches: string[][]; places: string[][]; leaderboard: string[][] | null }` and `buildResultsWorkbook(…): ExcelJS.Workbook`)
- Modify: `TournamentDetail.tsx` (header link `Export results`)
- Test: `tests/tournaments/export.test.ts`

The sheets:
- **Matches** header: `Sport, Stage, Team 1, Score 1, Team 2, Score 2, Note`. Time sports get one row per squad: `Sport, Stage, Team, Time, Place, Note`, in the same sheet with that header repeated per time sport block. My call.
- **Places** header: `Sport, Place, Group, Points`.
- **Leaderboard**: `Rank, Group, <sport names…>, Total`, only when the table is set (always exported to admins, whatever the reveal switch says).
- File name: `` `${ev.slug}-${slugify(cup.name) || "tournament"}-results.xlsx` ``.

- [ ] **Step 1: Failing test.** For a played 2-pool score sport, `resultSheets(…).matches[1]` equals `["Futsal", "Pool A", "Team 1", "3", "Team 2", "1", ""]`. Places and leaderboard rows match `sportPlaces`/`overallTable`.
- [ ] **Step 2: Run** it. Expected: FAIL. **Step 3: Implement.** **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Check in the browser:** download from ecpkom and open it with ExcelJS in a node one-liner to read the sheet names.
- [ ] **Step 6: Commit** `feat(tournaments): export results (D666)`.

### Task 8: Whole-feature check and cleanup

- [ ] Run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run check:squads` and `npm run check:results`. Expected: all pass.
- [ ] Fresh review of the whole change (superpowers:requesting-code-review) against the spec. Fix what it finds.
- [ ] Remove ecpkom test data: the tournament, the `ZZ Test` groups and their attendees. Confirm ecpkom is back to 1 group and 0 tournaments.
- [ ] Update the memory file `tournament-results.md` with the commits and migration state.
