# Tournament super teams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a tournament pair the event's groups into super teams of two. Each super team plays as one side and fills one squad per sport from both groups. Both groups get the side's place points on a per-group leaderboard.

**Architecture:** A **side** is the unit a tournament plays with: `{ id, name, groupIds }`.
- **Switch off:** every group is its own side, with `id = group id`. Every existing tournament stays byte-for-byte the same.
- **Switch on:** each super team is a side, and its id is its **lead group's id**. The lead is position 0, fixed when the pair is saved.
- **Results:** pools, match slots and manual places keep storing a group id (the lead's), so the results tables and `lib/results.ts` don't change shape.
- **Squads:** squad rows keep the player's own group (D825). They are counted and re-keyed to side ids by `sideRows` before any per-squad count.
- **Leaderboard:** `tournamentOverall` takes the sides and expands each side's places to its groups. The bonus stays per group (D832).

**Tech Stack:** Next.js (repo's version; read `node_modules/next/dist/docs/` before touching routing or server actions), Supabase Postgres (plpgsql RPCs, service-role client), vitest (pure modules only), node DB-check scripts.

**Spec:** `docs/superpowers/specs/2026-11-05-super-teams-design.md` (D821–D834). It builds on `2026-10-16-tournament-squads-design.md` and `2026-10-16-tournament-results-design.md`.

## Global Constraints

- Migration file: `supabase/migrations/0126_super_teams.sql`. Check that 0126 is still free (`ls supabase/migrations | tail -3`) before writing it.
- Use "Super team" / "super teams" in all copy. Never "alliance" (D834).
- Unnamed super team label: `` `${groupA.name} + ${groupB.name}` ``, with the lead group first (D822).
- With `activities.super_teams = false`, every screen, export and RPC answer must be identical to today. The existing `npm test`, `npm run check:squads` and `npm run check:results` must pass unchanged.
- Never test on the event with slug `ecphub`. Use a script-made event, ecpkom, or a new `zz-` event.
- Commit to `main` (the user works on main). Commit message trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push only when the user says so.
- Apply the migration live (Supabase MCP `apply_migration`) before any code that reads the new tables is pushed. It is additive, and the RPC changes are a no-op while `super_teams = false`.

## Review Focus

1. **A Team 02 captain removes a Team 03 player from their shared squad.** This must succeed. Today `remove_squad_member` compares the actor's group with the row's group (Task 1 test 3).
2. **Both captains add the last place at once.** Exactly one gets `full`. The count has to cover both groups' rows, not just the actor's (Task 1 test 4).
3. **A player is moved by the admin from Team 02 to Team 03, the same pair.** They stay in the squad, while a move to Team 05 drops them (Task 2 `sideRows` tests; Task 1 test 6).
4. **The switch is off, as for the Rally Cup.** `tournamentOverall(..., null)` and `sideRows` with group-sides must give exactly what the old functions gave (Task 2, Task 6 regression tests).
5. **Group "Sean" is unpaired while the switch is on.** Sean gets no tournament card or page, the admin can't add Sean's member to a squad, and Sean isn't in the draw or on the leaderboard (Task 1 test 5; Task 2 `tournamentSides` test; Task 5 loader).

---

### Task 1: Migration 0126 and its DB check

**Files:**
- Create: `supabase/migrations/0126_super_teams.sql`
- Create: `scripts/super-teams-db-check.mjs`
- Modify: `package.json` (script `"check:superteams": "node --env-file=.env.local scripts/super-teams-db-check.mjs"`)
- Modify: `src/lib/types.ts` (the `Activity` type: `super_teams?: boolean | null;` beside `show_overall`)

**Interfaces:**
- Produces, in the database:
  - `activities.super_teams boolean not null default false`;
  - table `tournament_super_teams (id uuid pk default gen_random_uuid(), activity_id uuid not null → activities on delete cascade, name text null check (name is null or length(btrim(name)) between 1 and 60), created_at timestamptz default now())`;
  - table `tournament_super_team_groups (super_team_id uuid not null → tournament_super_teams on delete cascade, activity_id uuid not null → activities on delete cascade, group_id uuid not null → event_groups on delete cascade, position smallint not null check (position in (0, 1)), primary key (activity_id, group_id), unique (super_team_id, position))`. RLS is enabled on both new tables, with no policies (service role only, as 0097);
  - function `public.tournament_side_groups(p_activity_id uuid, p_group_id uuid) returns uuid[]`, stable, `set search_path = ''`:
    - when the activity's `super_teams` is false, it returns `array[p_group_id]`;
    - when it's true and the group is in a super team, it returns every group of that super team;
    - when it's true and the group is unpaired, it returns `'{}'`.
- Both `add_squad_member` and `remove_squad_member` keep their exact signatures and answers.

- [ ] **Step 1: Write the failing DB check** `scripts/super-teams-db-check.mjs`. Copy the scaffolding of `scripts/squads-db-check.mjs`: its own draft event with a random slug, deleted in `finally`, and never `ecphub`.
  - **Setup:** groups T1, T2, T3. T1 has captain C1 (`extra.captain = "Yes"`) and members A, B. T2 has captain C2 and member D. T3 has member E. One tournament with `super_teams: true`, `proxy_fields: ["captain"]`, open, deadline tomorrow. Sport min 2 / max 3. One super team holds T1 (position 0) and T2 (position 1). T3 is unpaired.
  - **Checks**, one `check(label, ok)` each:
    1. C1 adds D (T2) → `ok`, and C2 adds A (T1) → `ok`.
    2. C2 adds C1 → `ok`, so the squad is 3 = max. C1 then adds B → `full`, because the count covers both groups.
    3. C2 removes A (a T1 row) → `ok`.
    4. Race: with the squad at 2, C1 and C2 add different people at once (`Promise.all`). Exactly one `ok` and one `full`, with max set to 3.
    5. Admin adds E (unpaired T3) → `not_member`, and C1 adds E → `not_member`.
    6. Move D from T2 to T1 by SQL update: a fresh add of D answers `already`, and the squad still holds 3 rows. Move D to T3: a removal by C1 answers `not_member`, which is the same rule as today for a row outside the actor's side.
    7. Set `super_teams = false`: C1 adding someone from T2 is now `not_member`, as before the migration.
    8. `tournament_side_groups` returns both ids (in any order) for T1, and `{}` for T3.
- [ ] **Step 2: Run it and see it fail.** `npm run check:superteams` should FAIL, because the relation `tournament_super_teams` doesn't exist.
- [ ] **Step 3: Write `0126_super_teams.sql`.** Add the column, both tables, an index on `tournament_super_team_groups (super_team_id)`, and `tournament_side_groups`. Then `create or replace` both RPCs from 0097, with only these changes:
  - in `add_squad_member`, after the category test: `v_side := public.tournament_side_groups(v_act.id, v_att.group_id); if cardinality(v_side) = 0 then return 'not_member'; end if;`. This runs on both paths;
  - the actor test `v_actor.group_id is distinct from v_att.group_id` becomes `v_actor.group_id is null or not (v_actor.group_id = any(v_side))`;
  - `already`: `m.group_id = any(v_side)` in place of `m.group_id = v_att.group_id`;
  - the count: `m.group_id = any(v_side) and x.group_id = any(v_side)` in place of `m.group_id = v_att.group_id and x.group_id = m.group_id`;
  - in `remove_squad_member`: `v_side := public.tournament_side_groups(v_act.id, v_row.group_id)`, and the actor test becomes `v_actor.group_id is null or not (v_actor.group_id = any(v_side))`;
  - re-issue the `revoke` / `grant` lines from 0097. Grant `tournament_side_groups` to `service_role` only.
- [ ] **Step 4: Apply live.** Use Supabase MCP `apply_migration` with name `super_teams` and the file's SQL. Then `npm run check:superteams` should show 8× PASS. `npm run check:squads` (25/25) and `npm run check:results` (20/20) must still pass.
- [ ] **Step 5: Commit.** `feat(tournaments): super teams in the database - pairs, side groups, squad rules (D821-D826, 0126)`

### Task 2: Pure sides module

**Files:**
- Create: `src/features/tournaments/lib/sides.ts`
- Modify: `src/features/tournaments/client.ts` (`export * from "./lib/sides";`)
- Test: `tests/tournaments/sides.test.ts`

**Interfaces:**
- Produces:
  ```ts
  /** A saved pair, groups lead first (position 0, then 1). */
  export type SuperTeam = { id: string; activity_id: string; name: string | null; groupIds: string[] };
  /** What a tournament plays with: a group on its own, or a super team (id = its lead group's id). */
  export type Side = { id: string; name: string; groupIds: string[]; superTeamId: string | null };
  export function superTeamLabel(team: Pick<SuperTeam, "name" | "groupIds">, groupNames: Map<string, string>): string;
  export function tournamentSides(groups: { id: string; name: string }[], teams: SuperTeam[] | null): Side[];
  export function sideOfGroup(sides: Side[], groupId: string | null): Side | null;
  export function sideRows(rows: SquadRow[], people: Map<string, SquadPerson>, sides: Side[]): SquadRow[];
  export function partnerOf(sides: Side[], groupId: string, groupNames: Map<string, string>): string | null;
  export function pairProblem(teams: SuperTeam[], groupIds: string[], editingId: string | null): string | { clash: string } | null;
  ```
- Rules:
  - `tournamentSides`, with `teams === null`: one side per group, in `groups` order, `name = group.name`, `superTeamId: null`.
  - `tournamentSides`, with teams: one side per team whose lead group still exists, ordered by the lead's index in `groups`. `groupIds` is filtered to groups that exist; `id = groupIds[0]`. Unpaired groups are absent.
  - `sideRows`: a row counts when its person exists, is not cancelled, and `sideOfGroup(person.group_id)` is the same side as `sideOfGroup(row.group_id)`. Counted rows come back with `group_id` set to the side id. Rows of unpaired groups are dropped.
  - `pairProblem` answers:
    - `"Pick two different teams."` for the same group twice, or fewer than 2 groups;
    - `{ clash: groupId }` when one of them is already in another team. That check skips `editingId`. The caller words the flash, because it knows the group's name;
    - `null` when the pair is fine.

- [ ] **Step 1: Write the failing tests** in `tests/tournaments/sides.test.ts`. Reuse `R`/`P` helpers in the style of `squads.test.ts`.
  - `tournamentSides(groups, null)` equals `groups.map(g => ({ id: g.id, name: g.name, groupIds: [g.id], superTeamId: null }))`.
  - With teams `[{ id: "st1", name: null, groupIds: ["g03", "g02"] }]` over groups g01–g03: one side `{ id: "g03", name: "Team 3 + Team 2", groupIds: ["g03", "g02"], superTeamId: "st1" }`. g01 is absent. A named team uses its name.
  - `sideRows` with group-sides gives exactly `countedRows` (same array contents) on a fixture with a cancelled person and a moved person.
  - `sideRows` with a pair (g01, g02): a g02 row comes back with `group_id: "g01"`. A person moved g02 → g01 still counts. A person moved g02 → g03 is dropped. A g03 row is dropped.
  - `partnerOf(sides, "g02", names)` gives `"Team 1"`. For a solo side it gives `null`.
  - `pairProblem`: `["g01", "g01"]` gives `"Pick two different teams."`. `["g01", "g04"]` while g01 is in st1 gives `{ clash: "g01" }`. The same call with `editingId: "st1"` gives `null`.
- [ ] **Step 2: Run them and see them fail.** `npx vitest run tests/tournaments/sides.test.ts` should FAIL, because the module isn't found.
- [ ] **Step 3: Implement `lib/sides.ts`.** Import `SquadRow` and `SquadPerson` from `./squads`.
- [ ] **Step 4: Run them and see them pass.** `npx vitest run tests/tournaments` should all PASS.
- [ ] **Step 5: Commit.** `feat(tournaments): sides - a group or a super team as one tournament side (D821-D825)`

### Task 3: Super teams data layer

**Files:**
- Create: `src/features/tournaments/db/super-teams.ts`
- Modify: `src/features/tournaments/index.ts` (`export * from "./db/super-teams";`)

**Interfaces:**
- Consumes: `SuperTeam`, `Side`, `tournamentSides` (Task 2); `listGroups` from `@/lib/db/groups`.
- Produces:
  ```ts
  export async function listSuperTeams(activityId: string): Promise<SuperTeam[]>;            // groupIds ordered by position
  export async function listSuperTeamsFor(activityIds: string[]): Promise<SuperTeam[]>;
  export async function loadSides(activity: Activity, groups?: Group[]): Promise<{ groups: Group[]; sides: Side[] }>;
  export async function anyDrawn(activityId: string): Promise<boolean>;                       // any pool row or match in any of its sports
  export async function setSuperTeamsOn(activityId: string, on: boolean): Promise<void>;
  export async function saveSuperTeam(activityId: string, input: { id: string | null; name: string | null; groupIds: [string, string] }): Promise<"ok" | "taken">;
  export async function deleteSuperTeam(activityId: string, superTeamId: string): Promise<void>;
  ```
- `loadSides` passes `activity.super_teams ? await listSuperTeams(activity.id) : null` to `tournamentSides`.
- `saveSuperTeam` orders the two groups by `listGroups` order, so the lead is first in group order and position 0 is the lead. For an edit, it deletes the team's group rows and re-inserts them. A unique violation (`23505`) answers `"taken"`.

- [ ] **Step 1: Implement the file.** It follows `db/tournaments.ts` style: `serviceClient()`, throw on error, `selectAll` for lists. There is no unit test (vitest has no DB); Task 4's check covers it.
- [ ] **Step 2: Extend the DB check.** Add a check to `scripts/super-teams-db-check.mjs`: inserting the same group into a second super team of the same activity fails with code `23505`. Run `npm run check:superteams` and expect all PASS.
- [ ] **Step 3: Type-check.** `npx tsc --noEmit -p .` should report no errors.
- [ ] **Step 4: Commit.** `feat(tournaments): read and write super teams`

### Task 4: Admin "Super teams" card on the Sports tab

The spec puts the switch "in the tournament's Setup". Putting it on the Sports tab with the pairs is my call while planning. The generic Setup save can't refuse just this field, and the switch and the pairs share the same lock (D821, D823).

**Files:**
- Create: `src/features/tournaments/admin/SuperTeamsCard.tsx`
- Create: `src/features/tournaments/admin/super-team-actions.ts`
- Modify: `src/features/tournaments/admin/SportsPanel.tsx` (render `<SuperTeamsCard ev activity />` above the sports list; with the switch on, the hint line reads `Every super team sends a squad to every sport.`)
- Modify: `src/features/tournaments/index.ts` (export the actions)

**Interfaces:**
- Consumes: everything in Task 3; `pairProblem` and `superTeamLabel` (Task 2); `tournament`, `done`, `formOf` and `tabPath(…, "sports")` from `admin/guard.ts`.
- Produces the server actions:
  - `setSuperTeamsAction(eventId, activityId, on: boolean)`;
  - `saveSuperTeamAction(eventId, activityId, superTeamId: string | null, fd)`, with fields `name`, `group_a`, `group_b`;
  - `deleteSuperTeamAction(eventId, activityId, superTeamId)`.
- Exact copy:
  - card title `Super teams`; the switch form's checkbox label `Teams play as super teams of two`; save button `Save`;
  - with the switch on: a table with columns `Super team` and `Teams`, and a ⋯ `RowActions` per row (Edit / Remove). Under it, `Not paired: Sean. They sit this tournament out.` (names via `namesLine`), shown only when some group is unpaired. The add button is `Add super team`, which opens a modal titled `Add a super team` with `Name (optional)`, `Team 1` and `Team 2` selects listing unpaired groups (plus this pair's own on Edit), and a submit button `Save super team`;
  - when `anyDrawn` is true, every write refuses with `Super teams can't change once a sport has been drawn. Reset its matches first.`, and the card shows that line with no add/edit/remove;
  - flashes: `Super teams on.`, `Super teams off.`, `Super team saved.`, `Super team removed.`, `Pick two different teams.`, and `` `${groupName} is already in a super team.` `` for `{ clash }` or `"taken"`;
  - Remove confirm: `` `Remove ${label}? Their squads stay; each player keeps their own team.` ``.

- [ ] **Step 1: Implement the actions and the card.** Follow `SportsPanel.tsx` / `admin/actions.ts` patterns: `Modal`, `RowActions`, `SubmitButton`, and the approved admin style.
- [ ] **Step 2: Type-check and lint.** `npx tsc --noEmit -p .` and `npm run lint` should both be clean.
- [ ] **Step 3: Commit.** `feat(tournaments): admin pairs teams into super teams (D821-D824)`

### Task 5: Squads run on sides (admin and portal)

**Files:**
- Modify: `src/features/tournaments/context.ts`
  - `portalSquadContext` returns `null` when `activity.super_teams` and the attendee's group is unpaired.
  - `members` = the members of every group in the attendee's side.
  - It adds `side: Side` to `SquadContext`.
- Modify: `src/features/activities/lib/portal-activity-entries.ts`
  - `loadTournaments` loads `listSuperTeamsFor(cupIds)` and builds sides per cup.
  - It drops a cup whose `super_teams` is on and where the attendee's group has no side (D824).
  - `rows` becomes `sideRows(…)` (keyed by side).
  - `TournamentEntry` gains `sides: Side[] | null` (null when off) and `sideId: string` (= `groupId` when off).
- Modify: `src/features/activities/cards.ts` (the squad count uses `squadMembers(rows, s.id, sideId)`).
- Modify: `src/features/activities/kinds/tournament/TournamentBody.tsx`
  - It loads `groupMembers` for each group of the side and names captains per group.
  - It passes `title` (the side name), `teams: { id, name }[]` (1 or 2), and members with `groupId`.
- Modify: `src/features/tournaments/components/SquadsPage.tsx`
  - Props: `groupId` becomes `sideId`, and `groupName` becomes `title`.
  - New props: `teams: { id: string; name: string }[]` and `captainNames: string[]`.
  - `Member` becomes `{ id: string; name: string; groupId: string }`.
- Modify: `src/features/tournaments/admin/SquadsPanel.tsx`, `src/features/activities/kinds/tournament/TournamentDetail.tsx` and `src/app/admin/events/[id]/activities/page.tsx`. Each uses `loadSides` + `sideRows`, iterating sides where it iterated groups. The SquadsPanel's add-player list is filtered to `side.groupIds`.
- Test: `tests/tournaments/squads.test.ts` (add the `idleByTeam` test)

**Interfaces:**
- Consumes: `Side`, `sideRows`, `sideOfGroup`, `tournamentSides` (Task 2); `listSuperTeamsFor` and `loadSides` (Task 3).
- Produces `export function idleByTeam(members: { id: string; groupId: string }[], teams: { id: string; name: string }[], rows: SquadRow[]): { team: string; ids: string[] }[]` in `lib/squads.ts`. It returns one entry per team, in `teams` order, built on `notInAnySport`.
- Exact copy in `SquadsPage`, applied only when `teams.length === 2`. With one team, every line stays as today.
  - Heading: `title` (the super team name).
  - Picker lead: `` `You and ${otherTeam} pick your super team's squads together.${lockWords}` ``.
  - Member lead: `` `Your captains ${namesLine(captainNames)} pick the squads.${lockWords}` ``. With no captain names, it reads `Your super team's captains pick the squads.${lockWords}`.
  - Idle notice: one line per team, `` `${team}: ${n} member${n === 1 ? " isn't" : "s aren't"} in any sport yet: ${namesLine(names)}.` `` or `` `${team}: everyone's in ✓` ``. The block shows while either team has someone idle.
  - Picker option label: `` `${name} · ${teamName}` ``.

- [ ] **Step 1: Write the failing test.** In `tests/tournaments/squads.test.ts`, `idleByTeam` over teams g01/g02, where g01 has one idle member, gives `[{ team: "Team 1", ids: ["a2"] }, { team: "Team 2", ids: [] }]`.
- [ ] **Step 2: Run it and see it fail.** `npx vitest run tests/tournaments/squads.test.ts` should FAIL, because `idleByTeam` isn't exported.
- [ ] **Step 3: Implement `idleByTeam` and the file changes listed above.**
- [ ] **Step 4: Run the checks.** `npm test`, `npx tsc --noEmit -p .` and `npm run lint` should all be clean.
- [ ] **Step 5: Check it in the browser**, on a `zz-super-teams` test event: groups ZZ A/B/C, A+B paired, a captain in each, C unpaired. The checks:
  - captain A's portal page shows both teams' members and the split idle notice;
  - adding a B member works;
  - captain B sees it;
  - C's member has no tournament card;
  - the admin Squads tab shows one row per super team;
  - the admin activities list shows the short count by super team.

  Use the Playwright MCP for portal clicks (the app's pane doesn't hydrate portal pages), and `window.next.router.push` for admin pages, per the testing notes in memory. Set test attendees' `consented_at` by SQL. Tokens are 12 chars from `abcdefghjkmnpqrstuvwxyz23456789`.
- [ ] **Step 6: Commit.** `feat(tournaments): squads per super team - either captain picks from both teams (D825-D828)`

**Milestone A:** after Task 5, with the user's go-ahead, push. Captains can fill squads before Tue 10 Nov.

### Task 6: Draw, matches, forfeits and leaderboard on sides

**Files:**
- Modify: `src/features/tournaments/lib/results.ts`. `tournamentOverall(results, groups, table, bonus = null, sides: Side[] | null = null)`:
  - with `sides` null, it behaves exactly as today;
  - otherwise it resolves names from the sides, works out each sport's places per side, then expands every `Place` and forfeit set to the side's `groupIds`;
  - the rows are the groups (in `groups` order) whose side plays some sport.
- Modify: `src/features/tournaments/admin/MatchesPanel.tsx` and `src/features/tournaments/admin/results-actions.ts`. `listGroups(ev.id)` becomes `(await loadSides(cup)).sides`, mapped to `{ id, name }`, wherever the groups stand for players: names, the Draw ticks, Edit pools, the by-hand match pickers and the Places card. `defaultPlaying` is fed `sideRows` output.
- Modify: `src/features/tournaments/admin/forfeits.ts`. `markForfeitsIfDue` and `shortGroups` count with `sideRows(rows, people, (await loadSides(cup)).sides)`.
- Modify: `src/features/tournaments/admin/LeaderboardPanel.tsx`, `src/features/tournaments/components/OverallTable.tsx` and `src/features/tournaments/components/ResultViews.tsx` (`OverallView`). Add an optional `partners?: Map<string, string>` prop, shown as a muted second line `with Team 03` under the group name. Pass `sides` to `tournamentOverall`.
- Modify: `src/features/tournaments/components/TournamentPage.tsx`:
  - new props `sides: Side[] | null` and `sideId: string`;
  - results views use side names and `mine = sideId`;
  - Leaderboard uses group names, `mine = groupId`, `partners`, and `tournamentOverall(…, sides)`.
- Modify: `src/features/activities/cards.ts`. `tournamentOverall(results, groups, table, bonus, sides)`, so `mine` is still found by `groupId`.
- Test: `tests/tournaments/results.test.ts`

**Interfaces:**
- Consumes: `Side`, `sideRows` and `partnerOf` (Task 2); `loadSides` (Task 3); `TournamentEntry.sides` / `sideId` (Task 5).

- [ ] **Step 1: Write the failing tests** in the `tournamentOverall (D662)` describe block:
  - **Regression:** for a 12-group fixture, `tournamentOverall(results, groups, table, bonus, null)` deep-equals `tournamentOverall(results, groups, table, bonus)`.
  - **Pairs:** 6 sides from pairs (g01+g02 … g11+g12), one sport drawn with `planPools` into 2 pools of 3 sides and played out so side g01 wins Gold. The rows for g01 and g02 both have `bySport[0] === 40` and the same rank (tied).
  - **Bonus per group:** with `{ points: 100, earned: new Set(["g01"]) }`, g01's total is 140 and g02's is 40.
  - **Forfeit:** side g03 is marked forfeit (`withForfeit(sr, "g03", true)`), so g03 and g04 both show `"F"`.
  - **Unpaired:** a 13th group that is in no side isn't in the rows.
- [ ] **Step 2: Run them and see them fail.** `npx vitest run tests/tournaments/results.test.ts` should FAIL on the pairs, bonus, forfeit and unpaired cases.
- [ ] **Step 3: Implement the `tournamentOverall` change and the file changes listed above.**
- [ ] **Step 4: Run the checks.** `npm test`, `npx tsc --noEmit -p .`, `npm run lint`, and `npm run check:results` (20/20) should all pass.
- [ ] **Step 5: Check it in the browser** on `zz-super-teams`, with 6 pairs of ZZ groups and a sport with pool size 3:
  - the Draw lists 6 super teams and gives 2 pools plus Gold/Silver/Bronze, 9 matches;
  - keying results gives places;
  - the admin Leaderboard shows 12 rows with `with …` lines;
  - the portal Results shows super team names, and the Leaderboard shows the viewer's own team highlighted;
  - a short squad after a past deadline is marked forfeit for the side, and both teams show `0 F`;
  - a by-hand sport (the Bowling setup) takes places 1–6 per super team on the Places card.
- [ ] **Step 6: Commit.** `feat(tournaments): draw, results and leaderboard on super teams (D829-D832)`

### Task 7: Exports

**Files:**
- Modify: `src/features/tournaments/lib/squads.ts`. `squadExportRows` input `groups` becomes `sides: Side[]` and adds `teamNames: Map<string, string>`. It counts with `sideRows`. `SquadExportRow` gains `team: string | null`, the player's own group name, set only when the side has 2 groups. `group` holds the side's name.
- Modify: `src/features/tournaments/export.ts`:
  - `buildSquadsWorkbook` adds a `Team` column after the group column when any row has `team`, and the group column's header reads `Super team` then;
  - `resultSheets` input gains `sides?: Side[] | null`, used for the matches/places names;
  - the Leaderboard sheet passes `sides` to `tournamentOverall` and adds a `Partner` column after `Group` when sides are paired.
- Modify: `src/app/admin/events/[id]/export/squads.xlsx/route.ts` and `src/app/admin/events/[id]/export/results.xlsx/route.ts` (`loadSides(cup)`).
- Test: `tests/tournaments/export.test.ts` and `tests/tournaments/squads.test.ts`

- [ ] **Step 1: Write the failing tests.**
  - `squadExportRows` with a pair gives rows `{ group: "Team 1 + Team 2", team: "Team 2", … }` for a g02 player.
  - With group-sides, every row has `team: null`, and the rest is as today (update the existing tests' input from `groups` to `sides: tournamentSides(groups, null)`).
  - `resultSheets` with pairs: the leaderboard header is `["Rank", "Group", "Partner", …]`, and g02's row has `"Team 1"` in Partner.
- [ ] **Step 2: Run them and see them fail.** `npx vitest run tests/tournaments` should show the new tests failing.
- [ ] **Step 3: Implement the changes listed above.**
- [ ] **Step 4: Run the checks.** `npm test`, `npx tsc --noEmit -p .` and `npm run lint` should all be clean. Download both exports from the `zz-super-teams` admin page and open them to check the columns.
- [ ] **Step 5: Commit.** `feat(tournaments): exports name super teams and partners (D833)`

### Task 8: Wrap-up

- [ ] **Step 1: Re-run every check.** `npm test`, `npm run check:squads`, `npm run check:results`, `npm run check:superteams` and `npm run build` must all pass.
- [ ] **Step 2: Delete the `zz-super-teams` test event** and its groups and attendees (it's test data on a non-ecphub event).
- [ ] **Step 3: Get a whole-branch review.** Use a fresh reviewer, then fix what it confirms.
- [ ] **Step 4: Push to `origin/main`,** only with the user's yes.
- [ ] **Step 5: Set up ecphub, only with the user's yes.** Create the new Tournament activity:
  - About text from the deck;
  - sports Captain Ball 5–6, Volleyball 6–8 and Dodgeball 6–8 (pools of 3, score), and Bowling 4 (by hand);
  - points `40, 35, 30, 28, 26, 24` and bonus 100;
  - the squad deadline the user gives, and `proxy_fields` as the Rally Cup's;
  - super teams on, kept closed until the user opens it.

  The user's team keys in the 6 pairs.
