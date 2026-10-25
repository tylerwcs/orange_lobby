# Mileage × Active Tracks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two linked scored challenges (Track A km, Track B minutes). Captains put each member on one track, members can submit only to their own track, and the teams get one combined score.

**Architecture:**
- **New feature folder:** a `src/features/tracks/` folder owns the pair, the assignments, the captain's Tracks tab, the admin Tracks tab and, in Phase 2, the combined scorer.
- **The database decides,** as with squads (D642). A `set_challenge_track` RPC does every assignment, and `submit_answers` refuses an entry from the wrong track.
- **Each track still scores alone** through `scoreChallenge`. The combined board is a pure merge of the two `ChallengeScore`s plus the cross-track bonus.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before touching routing or server actions; AGENTS.md), Supabase Postgres + RPCs, vitest (no database, D141), node db-check scripts for SQL.

**Spec:** `docs/superpowers/specs/2026-10-25-mileage-x-active-tracks-design.md` (D721–D730)

## Global Constraints

- **Never write to the ecphub event** (slug `ecphub`) without the user's yes in chat. Test on another event, or on a db-check script's own throwaway event.
- **Migrations:** the next file is `supabase/migrations/0106_challenge_tracks.sql`. They are additive: no existing row changes, and unpaired activities behave exactly as before.
- **Track labels:** "Track A" is the pair's `a_activity_id` (km, Project Mileage) and "Track B" is `b_activity_id` (minutes, Project Active).
- **Target per track:** 5, never enforced. Over target is shown, not refused.
- **Who counts as a captain:** a Yes (`yes`/`y`/`true`, trimmed, any case) in any field ticked in either pair activity's `proxy_fields`.
- **Which assignment counts:** only while its `group_id` equals the attendee's current `group_id` and the attendee isn't cancelled.
- **Order of refusals in `submit_answers` and `canSubmit`:** closed, then the scoring window, then proxy, then ineligible, then **notrack/othertrack**, then the rest.
- **The track is checked on the attendee the entry is for,** never on the captain sending it.
- **Copy:**
  - Page notes:
    - notrack: "Your captain hasn't put you on a track yet."
    - othertrack: "You're on {Track X} — submit under {activity name}."
  - Server messages:
    - notrack: "You're not on a track yet. Ask your captain to put you on one."
    - othertrack: "This entry belongs to the other track. Submit it there instead."
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on `main` ([[works-on-main]]). Each commit's subject names its D-number.

## Review Focus

1. **Unpaired activities:** Mileage-only and other events' challenges must submit exactly as today. Task 1's script and Task 3's tests prove it.
2. **Moved teams:** an attendee who moved team, with an old row, reads as *no track*, not their old track (Task 2 test).
3. **Captain on a stale page:** a captain submitting for someone who was just moved to the other track gets `othertrack`, not a silent insert (Task 1 script).
4. **Before the start:** before 26 Oct a paired activity says "hasn't started", not "no track". Closed comes first (Task 3 test).
5. **Phase 2 week alignment:** two pair activities with different dates must not produce a board that mixes up weeks. `loadPairScore` refuses with a committee-visible message (Task 7 test).

---

# Phase 1 — ship 25 Oct (D721–D726, D729)

### Task 1: Migration 0106 — pair, assignments, `set_challenge_track`, the track lock in `submit_answers` (D721–D723, D725)

**Files:**
- Create: `supabase/migrations/0106_challenge_tracks.sql`
- Create: `scripts/tracks-db-check.mjs`
- Modify: `package.json` (add `"check:tracks": "node --env-file=.env.local scripts/tracks-db-check.mjs"`)

**Interfaces:**
- Produces, in SQL:
  - **Table `challenge_track_pairs`:** `id uuid pk`, `event_id uuid → events on delete cascade`, `a_activity_id uuid → activities on delete cascade`, `b_activity_id uuid → activities on delete cascade`, `target int not null default 5 check (target between 1 and 30)`, `bonus int not null default 0 check (bonus between 0 and 999)`, `created_at`.
    - Checks: `a_activity_id <> b_activity_id`.
    - Unique indexes on `a_activity_id` and on `b_activity_id`, so an activity is in at most one pair.
    - RLS on.
  - **Table `challenge_track_members`:** `pair_id → challenge_track_pairs on delete cascade`, `attendee_id → attendees on delete cascade`, `group_id → event_groups on delete cascade`, `activity_id → activities on delete cascade`, `assigned_by uuid null → attendees on delete set null` (null is an organiser), `assigned_at`.
    - Primary key `(pair_id, attendee_id)`.
    - RLS on.
  - **Function `set_challenge_track(p_pair_id uuid, p_attendee_id uuid, p_activity_id uuid, p_actor_id uuid, p_admin boolean) returns text`:**
    - Answers `ok | missing | not_member | not_allowed | closed`.
    - A null `p_activity_id` takes the person off their track (deletes the row).
    - A non-null one must be the pair's a or b, or the answer is `missing`.
    - Upserts on `(pair_id, attendee_id)`, setting `group_id` to the target's current group.
    - `set search_path = ''`. Service role only.
  - **Function `submit_answers(...)`:** `create or replace` with the 0080 signature unchanged. New codes: `notrack`, `othertrack`.
- Consumes: nothing.

- [ ] **Step 1: Write `scripts/tracks-db-check.mjs`.** Copy the setup and teardown of `scripts/squads-db-check.mjs`: its own draft event with a random slug, deleted in `finally`, and never `ecphub`.
  - **Seed:** two groups; a pair of two scored submission activities (open, `group_mode 'members'`, `proxy_fields ['captain']`, scoring dated today); a captain C1 in group 1; members M1 and M2 in group 1; M3 in group 2; a third unpaired scored activity U.
  - **Checks:**
    1. C1 puts M1 on A → `ok`. M3 (another group) → `not_member`. M1 (not a captain) assigning M2 → `not_allowed`.
    2. `submit_answers` for M2 (no row) on A → `notrack`. For M1 on B → `othertrack`. For M1 on A → `ok`.
    3. C1 submitting for M1 on B (`p_submitted_by` C1) → `othertrack`. C1 has no track and still submits for M1 on A → `ok`.
    4. M1 moves to group 2 → M1 on A is `notrack`, because the stale row is ignored.
    5. U accepts M2 → `ok` (unpaired is unchanged).
    6. With A's scoring starting tomorrow, M2 on A → `closed`, not `notrack`.
    7. `p_admin` true assigns M3 regardless of captain fields. `p_activity_id` null removes the row.
    8. A closed pair activity refuses the portal with `closed`. Admin still works.
    9. Deleting the event removes the pair and member rows.

- [ ] **Step 2: Run the script to see it fail.**
  - Run: `npm run check:tracks`
  - Expected: it throws on the missing table `challenge_track_pairs`.

- [ ] **Step 3: Write `0106_challenge_tracks.sql`.**
  - **Tables and `set_challenge_track`:** as in Interfaces. Model the portal checks on `add_squad_member` (0097).
    - The target is in the pair's event, not cancelled, and has a group. Otherwise `not_member`.
    - On the portal path:
      - Either pair activity must be `is_open`. Otherwise `closed`.
      - The actor must be in the event, not cancelled, and in the same group as the target. Otherwise `not_member`.
      - The actor must hold a Yes in the union of both activities' `proxy_fields`. Otherwise `not_allowed`.
  - **`submit_answers`:** copy 0080's body. Directly after the `category_matches → 'ineligible'` line, insert:
    ```sql
    select p.* into v_pair from challenge_track_pairs p where a.id in (p.a_activity_id, p.b_activity_id);
    if found then
      select m.activity_id into v_track from challenge_track_members m
       where m.pair_id = v_pair.id and m.attendee_id = p_attendee_id and m.group_id = att.group_id;
      if v_track is null then return 'notrack'; end if;
      if v_track <> a.id then return 'othertrack'; end if;
    end if;
    ```
    - Declare `v_pair challenge_track_pairs%rowtype; v_track uuid;`.
    - Keep the revoke/grant lines.
    - `submit_answers_pair` needs no change. It calls `submit_answers` for the partner, so the partner is checked too.

- [ ] **Step 4: Apply the migration** with the Supabase MCP `apply_migration` (project `wfmqwwcolfigjylkgrsv`, name `0106_challenge_tracks`). It is additive, and no ecphub row changes.

- [ ] **Step 5: Run the script.**
  - Run: `npm run check:tracks`
  - Expected: every line `PASS`, exit 0.

- [ ] **Step 6: Commit.** `feat(tracks): pair, assignments and the track lock in submit_answers (D721-D723, D725, 0106)`

### Task 2: The tracks module — types, reads, pure rules (D722, D724)

**Files:**
- Create: `src/features/tracks/types.ts`, `src/features/tracks/lib.ts`, `src/features/tracks/db.ts`, `src/features/tracks/index.ts`
- Test: `tests/tracks/lib.test.ts`

**Interfaces:**
- Produces:
  - `type TrackPair = { id: string; event_id: string; a_activity_id: string; b_activity_id: string; target: number; bonus: number }`
  - `type TrackRow = { pair_id: string; attendee_id: string; group_id: string; activity_id: string }`
  - `type TrackStatus = "this" | "other" | "none"` (null where the activity isn't paired)
  - `type TrackSplit = { a: Attendee[]; b: Attendee[]; none: Attendee[] }`
  - `trackOf(rows: TrackRow[], attendee: Pick<Attendee, "id" | "group_id" | "cancelled_at">): string | null`. This is the counted activity id.
  - `trackStatus(pair: TrackPair | null, activityId: string, track: string | null): TrackStatus | null`
  - `otherActivityId(pair: TrackPair, activityId: string): string`
  - `trackLabel(pair: TrackPair, activityId: string): "Track A" | "Track B"`
  - `splitTracks(pair: TrackPair, rows: TrackRow[], members: Attendee[]): TrackSplit`. Members keep their input order; cancelled members are left out.
  - `isTrackCaptain(activities: Pick<Activity, "proxy_fields">[], attendee: Pick<Attendee, "extra">): boolean`. This is `isProxy` over the union.
  - DB (server-only): `pairForActivity(activityId: string): Promise<TrackPair | null>`, `pairsForEvent(eventId: string): Promise<TrackPair[]>`, `trackRows(pairId: string): Promise<TrackRow[]>`, `trackRowsFor(attendeeId: string): Promise<TrackRow[]>`, `setTrack(input: { pairId: string; attendeeId: string; activityId: string | null; actorId: string | null; admin: boolean }): Promise<"ok" | TrackRefusal>`
  - `type TrackRefusal = "missing" | "not_member" | "not_allowed" | "closed"`
- Consumes: Task 1's tables and RPC.

- [ ] **Step 1: Write the failing tests** in `tests/tracks/lib.test.ts`:
  - `trackOf`: a row in the current group gives its activity id. A row whose `group_id` differs from the attendee's gives `null`. A cancelled attendee gives `null`. No row gives `null`.
  - `trackStatus`: a null pair gives `null`; on A with track A gives `"this"`; on A with track B gives `"other"`; with no track gives `"none"`.
  - `trackLabel`: the a id gives `"Track A"` and the b id gives `"Track B"`.
  - `splitTracks`: with 11 members, 6 on A, 4 on B and 1 with none, the lengths are `{ a: 6, b: 4, none: 1 }`. The order follows `members`. A cancelled member appears nowhere.
  - `isTrackCaptain`: `captain` ticked only on B, and the attendee's `extra.captain = " Yes "`, gives `true`. `"no"` gives `false`.

- [ ] **Step 2: Run the tests to see them fail.**
  - Run: `npx vitest run tests/tracks/lib.test.ts`
  - Expected: FAIL, because the module can't be found.

- [ ] **Step 3: Implement `types.ts`, `lib.ts` and `db.ts`** to the signatures above.
  - `db.ts` uses `serviceClient()` like `src/features/tournaments/db/tournaments.ts`.
  - `index.ts` re-exports the public names, as `src/features/adjustments` does.

- [ ] **Step 4: Run the tests to see them pass.**
  - Run: `npx vitest run tests/tracks/lib.test.ts`
  - Expected: PASS.

- [ ] **Step 5: Commit.** `feat(tracks): pair and assignment reads and rules (D722, D724)`

### Task 3: Locking the portal form to the track (D725)

**Files:**
- Modify:
  - `src/features/activities/lib/submissions.ts`: `SubmitReason` and `canSubmit`
  - `src/features/activities/db/activities.ts:364`: `SubmitCode`
  - `src/features/activities/portal/actions.ts:207`: `SUBMIT_RESULT_MESSAGES`
  - `src/features/activities/lib/portal-activity-entries.ts`: `SubmissionEntry` and the `forms` map
  - `src/features/activities/kinds/submission/SubmissionBody.tsx`: `proxyFor`
  - `src/features/activities/kinds/submission/scoring/TrackerBody.tsx`: the `TrackerStats` notes
- Test: `tests/activities/submissions.test.ts`

**Interfaces:**
- Consumes: from Task 2, `TrackPair`, `TrackStatus`, `trackOf`, `trackStatus`, `trackLabel`, `otherActivityId`, `pairsForEvent`, `trackRowsFor` and `trackRows`.
- Produces:
  - `SubmitReason` gains `"notrack" | "othertrack"`, and `SubmitCode` gains the same two.
  - `canSubmit(activity, mine, category, today, group = null, teamId = null, track: TrackStatus | null = null): SubmitState`
  - `SubmissionEntry` gains `track: { status: TrackStatus; label: string; other: { id: string; name: string; label: string } } | null`

- [ ] **Step 1: Write the failing tests** in `submissions.test.ts`, using the file's existing scored-challenge fixture with `group_mode "members"` and a team:
  - `track` of `"none"` → `{ can: false, reason: "notrack" }`.
  - `"other"` → `"othertrack"`.
  - `"this"` → `{ can: true, reason: "ok" }`.
  - `null` → `"ok"`, unchanged.
  - Before `starts_on` with `"none"` → `"closed"` with `startsOn`.
  - An ineligible category with `"none"` → `"ineligible"`.

- [ ] **Step 2: Run the tests to see them fail.**
  - Run: `npx vitest run tests/activities/submissions.test.ts`
  - Expected: the new cases FAIL.

- [ ] **Step 3: Implement the change.**
  - **`canSubmit`:** after the category line, return `notrack` when `track === "none"` and `othertrack` when `track === "other"`.
  - **Server messages:** add the two `SUBMIT_RESULT_MESSAGES` entries (Global Constraints copy).
  - **`portal-activity-entries`:**
    - Read `pairsForEvent(event.id)` alongside the existing `Promise.all`. Read `trackRowsFor(attendee.id)` only when there's a pair.
    - Build each form's `track` and pass `track?.status ?? null` to `canSubmit`.
  - **`proxyFor`:** when the form is paired, keep only members whose `trackOf(rows, m) === f.id` (one `trackRows(pair.id)` read). `canAdd` needs no change, because the new reasons aren't in its block list, so a captain's dialog still opens.
  - **`TrackerStats`:** add the two notes next to the `nogroup` note. The othertrack note links to `/e/${slug}/a/${token}/activities/${track.other.id}`.

- [ ] **Step 4: Run the tests and typecheck.**
  - Run: `npx vitest run tests/activities && npx tsc --noEmit`
  - Expected: PASS, with no type errors.

- [ ] **Step 5: Commit.** `feat(tracks): submit only under your own track (D725)`

### Task 4: The captain's Tracks tab on the portal (D723, D724)

**Files:**
- Create: `src/features/tracks/context.ts`, `src/features/tracks/actions.ts`, `src/features/tracks/components/TracksPanel.tsx`
- Modify: `src/features/activities/lib/tracker.ts` (`TrackerTab`, `trackerTab`, `trackerTabs`), `src/features/activities/kinds/submission/scoring/TrackerBody.tsx` (render the tab), `src/features/activities/portal/ActivityPage.tsx` (pass `hasTracks`)
- Test: `tests/activities/tracker.test.ts`

**Interfaces:**
- Consumes: Task 2 (`pairForActivity`, `trackRows`, `splitTracks`, `isTrackCaptain`, `setTrack`, `trackLabel`), plus `groupMembers` and `findByToken` as in `src/features/tournaments/context.ts`.
- Produces:
  - `TrackerTab = "info" | "stats" | "tracks" | "leaderboard"`
  - `trackerTab(raw, showLeaderboard = true, hasTracks = false)`
  - `trackerTabs(showLeaderboard: boolean, hasTracks = false): TrackerTab[]`. With tracks, the order is info, stats, tracks, then leaderboard when shown.
  - `portalTrackContext(slug, token, activityId): Promise<TrackContext | null>`, where `TrackContext = { event; attendee; pair: TrackPair; activities: [Activity, Activity]; members: Attendee[]; rows: TrackRow[]; captain: boolean }`. It is null for a cancelled or groupless attendee, an unpaired activity, or one outside the attendee's category.
  - Server actions:
    - `assignTrackAction(slug, token, activityId, targetActivityId, fd: FormData)` reads `attendee` from the form.
    - `unassignTrackAction(slug, token, activityId, attendeeId)`.
    - Both redirect back to `?tab=tracks` with a flash, following the shape of `src/features/tournaments/actions.ts`'s `write()`.
- Refusal copy:
  - `not_allowed`: "Only your captains can change tracks."
  - `not_member`: "They aren't in your team."
  - `closed`: "Tracks can't be changed right now."
  - `missing`: "That track no longer exists."
- Success copy: "{Name} is on {Track X}." / "{Name} is off {Track X}." (or "You're on …").

- [ ] **Step 1: Write the failing tests** in `tracker.test.ts`:
  - `trackerTabs(true, true)` gives `["info","stats","tracks","leaderboard"]`.
  - `trackerTabs(false, true)` gives `["info","stats","tracks"]`.
  - `trackerTab("tracks", false, false)` gives `"stats"`, and `trackerTab("tracks", false, true)` gives `"tracks"`.

- [ ] **Step 2: Run the tests to see them fail.**
  - Run: `npx vitest run tests/activities/tracker.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implement the tab.**
  - **Tab helpers:** the changes in Interfaces.
  - **`TracksPanel`:** a server component taking `ctx: TrackContext` and the paths.
    - **Two cards,** "Track A · {name} ({unit})" and "Track B · …". Each has a count pill `{n} of {target}`: amber when under, green when equal, red when over.
    - **Member chips.** A captain gets an ✕ (`unassignTrackAction`) and an "Add a member" select listing team members not on that card (`assignTrackAction`).
    - **Captains** also see a "Not on a track yet" list.
    - **Non-captains** see read-only cards, plus their own line: "You're on {Track X} — submit under {name}" with a link, or "Your captain {first captain's name} hasn't put you on a track yet."
    - Reuse `src/features/tournaments/components/AddMemberSelect.tsx` and `FormButtons.tsx` (`ChipRemoveButton`) where their props fit. Otherwise copy their markup.
  - **`ActivityPage`:** passes `hasTracks` from `found.entry.track !== null`.
  - **`TrackerBody`:** renders `TracksPanel` for `tab === "tracks"`.

- [ ] **Step 4: Run the tests, typecheck and lint.**
  - Run: `npx vitest run tests/activities && npx tsc --noEmit && npm run lint`
  - Expected: PASS.

- [ ] **Step 5: Commit.** `feat(tracks): the captain's Tracks tab (D724)`

### Task 5: The admin Tracks tab (D723)

**Files:**
- Modify: `src/features/activities/tabs.ts` (`ActivityTab` gains `"tracks"`, `TabCounts` gains `tracks?: boolean`, and the submission tabs add `item("tracks", "Tracks")` after Submissions when `c.tracks` is set), `src/features/activities/kinds/submission/SubmissionDetail.tsx` (read `pairForActivity` and render the panel)
- Create: `src/features/tracks/admin/TracksAdmin.tsx`, `src/features/tracks/admin/actions.ts`
- Test: `tests/activities/tabs.test.ts`

**Interfaces:**
- Consumes: Task 2 (`pairForActivity`, `trackRows`, `splitTracks`, `setTrack` with `admin: true`, `actorId: null`).
- Produces: `setTrackAdminAction(eventId: string, activityId: string, attendeeId: string, fd: FormData)`. The form field `track` is `"a" | "b" | ""`, where `""` means no track.
  - The action checks admin access the way `src/features/adjustments/actions.ts` does, then redirects back to the Tracks tab with a flash.

- [ ] **Step 1: Write the failing test** in `tabs.test.ts`: `activityTabs("submission", { scored: true, tracks: true, perDay: false })` lists `tracks` straight after `submissions`.

- [ ] **Step 2: Run the test to see it fail.**
  - Run: `npx vitest run tests/activities/tabs.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implement the tab and `TracksAdmin`.**
  - **Layout:** one table per team, in group name order.
    - **Header:** "Group 01 · A 5 · B 6 · none 0", with any count over target in red.
    - **Rows:** one per member, showing the name and a small form (a select of No track / Track A / Track B, plus a Save button).
  - Follow the admin style ([[admin-design-style]]): capped and centred, table-style lists.

- [ ] **Step 4: Run the tests and typecheck.**
  - Run: `npx vitest run tests/activities && npx tsc --noEmit`
  - Expected: PASS.

- [ ] **Step 5: Commit.** `feat(tracks): committee places anyone on a track (D723)`

### Task 6: Browser check on a test event, ship, and set up ecphub (D729, D730 Phase 1)

**Files:** none (data and deploy only).

- [ ] **Step 1: Set up the test event.** Use a non-ecphub event, e.g. `ecpkom` or a fresh test event, created through the admin or `execute_sql`.
  - Two scored submission activities, km and min, dated today to 4 Dec, with `proxy_fields` captain.
  - A pair row.
  - One group with a captain and three members, each with portal tokens and `consented_at` set ([[project-mileage]] gotchas).

- [ ] **Step 2: Check it in the browser** on the dev server (`preview_start`).
  - **Captain's Tracks tab:** the captain places two members on A and one on B. A 6th placement shows red "6 of 5".
  - **Member on A:** opens B and sees the othertrack note with a link. Their own entry on A succeeds.
  - **Member with no track:** sees the notrack note.
  - **Admin Tracks tab:** moves someone, and the portal reflects it.
  - Screenshot each.

- [ ] **Step 3: Run the full suite.**
  - Run: `npm test && npx tsc --noEmit && npm run lint`
  - Expected: all pass.

- [ ] **Step 4: Push `main`** (Vercel deploys). Confirm the deploy is live with `curl -s -o /dev/null -w "%{http_code}" https://ecphub.vercel.app/` → `200`.

- [ ] **Step 5: Stop for the user.** Ask in chat:
  - (a) whether the user has exported Week 1 from Project Active;
  - (b) for a yes to the ecphub setup below.
  - Do not continue without both.

- [ ] **Step 6: Apply the ecphub setup** (spec D729), each change checked by a read-back query.
  - **Re-check Week 1 baggage:** Project Active (`e1704208-…`) still has 0 `challenge_disqualifications` and 0 `activity_adjustments`. If not, stop and ask.
  - **Project Active's scoring:**
    - `starts_on 2026-10-26`, `ends_on 2026-12-04`
    - `daily_steps 20=1, 30=2, 45=3, 60=4, 120=5`
    - remove `team_bonus`
    - keep `podium [15,10,5]`, `daily_min 20`, `unit min`, `week_origin challenge`, `void week`
  - **Project Active's form:**
    - Remove the `device` and `phone_activity` questions and the `machine` photo.
    - The watch activity question becomes the only activity list, with the poster's Track B choices: Gym & Conditioning (HIIT, Strength, Circuit); Swimming; Cycling (Indoor/Outdoor); Dance; Court & Racquet Sports (Badminton, Tennis, Pickleball, Squash); Skipping; Ergs (Row/Ski/Bike); "Other — approved by the committee". Drop Mind-Body & Studio.
    - Clear any `show_when` that pointed at `device`.
  - **New "Project Mileage" activity:**
    - Copy Project Active's `group_mode`, `proxy_fields`, `attendee_edit`, `health_data`, `categories` and `per_day`. Copy the Oct archive's (`3b89b3a2-…`) questions.
    - Scoring: `metric_key km`, `unit km`, `daily_min 1`, steps `1=1, 3=2, 5=3, 8=4, 10=5`, `podium [15,10,5]`, no `team_bonus`, `week_origin challenge`, `void week`, 26 Oct – 4 Dec.
  - **Rename the archive** "Project Mileage (Oct archive)".
  - **Insert the pair:** a = Mileage, b = Active, `target 5`, `bonus 10`.
  - **Open and pin both.** Leave `show_leaderboard` **off** on both until Phase 2 ships.

- [ ] **Step 7: Smoke-check ecphub read-only.** Load an ecphub captain's portal link and check that the Tracks tab shows. Do not submit or assign anything. Report to the user.

---

# Phase 2 — during Week 1, before Sun 1 Nov ends (D726–D728)

### Task 7: Disqualifications across the pair, and the combined scorer (D726, D727)

**Files:**
- Modify: `src/features/activities/lib/challenge-data.ts` (`loadChallenge` merges the pair's disqualifications)
- Create: `src/features/tracks/combined.ts`, `src/features/tracks/combined-data.ts`
- Test: `tests/tracks/combined.test.ts`

**Interfaces:**
- Consumes: `ChallengeScore`, `Standing`, `Team` and `WeekResult` from `challenge-score.ts`; `pairForActivity`; `loadChallenge`.
- Produces:
  - `mergeDisqualified(a: Map<string, string | null>, b: Map<string, string | null>): Map<string, string | null>`. A null (season) wins, otherwise the earliest Monday wins.
  - `type PairTeamWeek = { a: number; b: number; bonus: number; onTrack: number; members: number; void: boolean }`. Here `a` and `b` are each track's tier1 + podium that week.
  - `type PairWeek = { week: ChallengeWeek; ended: boolean; teams: Record<string, PairTeamWeek> }`
  - `type PairStanding = Standing & { a: number; b: number }`. `total` is a + b + bonus. `tier1`, `podium` and `adjust` are summed across tracks. `km` is 0 and `volumeRank` is null, both unused.
  - `type PairScore = { weeks: PairWeek[]; standings: PairStanding[] }`
  - `scorePair(input: { a: ChallengeScore; b: ChallengeScore; aScoring: ChallengeScoring; bScoring: ChallengeScoring; teams: Team[]; bonus: number; today: string }): PairScore`
  - `loadPairScore(event: Pick<Event, "id" | "starts_on">, pair: TrackPair, today: string): Promise<{ ok: true; score: PairScore; a: Awaited<ReturnType<typeof loadChallenge>>; b: Awaited<ReturnType<typeof loadChallenge>> } | { ok: false; reason: string }>`. `reason` is "The two tracks must have the same dates and week numbering." when their `starts_on`, `ends_on` or `week_origin` differ.
- Bonus rule (spec D727). For each ended week and team:
  ```
  members = team.memberIds.filter(id => a.counts(id, week.days[0]))
  logged(id, d) = a.personKm(id, d) >= aScoring.daily_min || b.personKm(id, d) >= bScoring.daily_min
  bonus = !(aWeek.void || bWeek.void) && ended && members.length > 0
          && members.every(id => week.days.every(d => logged(id, d))) ? input.bonus : 0
  ```
  `onTrack` uses the elapsed days, as `scoreChallenge` does. Ranking is `rankOf` on `total`, with season-void teams last, as in `scoreChallenge`.

- [ ] **Step 1: Write the failing tests** in `tests/tracks/combined.test.ts`. Build `a` and `b` with `scoreChallenge` from tiny fixtures; reuse the helpers in `tests/activities/challenge-score.test.ts`.
  1. **Bonus across tracks:** member X logs 1 km daily on A and Y logs 20 min daily on B, every day of an ended week, with team {X, Y} → bonus 10.
  2. **One missed day:** Y misses one day → bonus 0.
  3. **Members with no track count:** member Z has no entries at all → bonus 0.
  4. **A move mid-week:** X logs A on Mon–Wed and B on Thu–Sun → bonus 10, and both tracks' tier1 counts.
  5. **A void week:** a week voided on A → that week's bonus is 0, and B's points still count.
  6. **Merging disqualifications:** `mergeDisqualified(new Map([["x","2026-11-02"]]), new Map([["x","2026-10-26"]])).get("x")` is `"2026-10-26"`, and a null in either gives null.
  7. **Totals:** with A {tier1 10, podium 15, adjust 2}, B {tier1 8, podium 5, adjust 0} and bonus 10, `total` is 50, `a` is 27 and `b` is 13.
  8. **Week alignment:** `loadPairScore` refuses mismatched dates. Test the pure guard `sameCalendar(aScoring, bScoring): boolean`, exported from `combined.ts`.

- [ ] **Step 2: Run the tests to see them fail.**
  - Run: `npx vitest run tests/tracks/combined.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implement the change.**
  - **`loadChallenge`:** when `pairForActivity(activity.id)` returns a pair, also `listDisqualifications(other)` and pass `mergeDisqualified(...)` as `disqualified`. Every per-track board then agrees with the combined one.
  - **`combined.ts`:** `scorePair`, `mergeDisqualified` and `sameCalendar`.
  - **`combined-data.ts`:** `loadPairScore`, which calls `loadChallenge` for both activities.

- [ ] **Step 4: Run the tests.**
  - Run: `npx vitest run tests/tracks tests/activities/challenge-score.test.ts`
  - Expected: PASS.

- [ ] **Step 5: Commit.** `feat(tracks): combined score and pair-wide disqualification (D726, D727)`

### Task 8: The combined board on the portal (D728)

**Files:**
- Modify: `src/features/activities/kinds/submission/scoring/TrackerBody.tsx` (`TrackerLeaderboard` uses `loadPairScore` when paired; `TrackerStats` renders the pair card)
- Create: `src/features/tracks/components/PairWeekCard.tsx`

**Interfaces:**
- Consumes: Task 7's `loadPairScore` and `PairStanding`; the existing `Leaderboard` and `standingLine`, which take `Standing[]`, and `PairStanding` extends it.
- Produces: `PairWeekCard({ week: PairTeamWeek; weekInfo: ChallengeWeek; split: TrackSplit; units: [string, string]; bonus: number })`.
  - "This week: {km} km · {min} min"
  - "Bonus: {onTrack} of {members} on track" ("+10 earned" once ended and earned)
  - "Track A: names · Track B: names"

- [ ] **Step 1: Wire the board.**
  - **`TrackerLeaderboard`:** for a paired form, pass `score.standings` from `loadPairScore` to `Leaderboard`. Under each row, show a breakdown line: "{a} km pts · {b} min pts · {bonus} bonus". If `ok` is false, show the reason as a note.
  - **`TrackerStats`:** for a paired form, render `PairWeekCard` under `MyTeam`. `MyTeam`'s own bonus line is already absent, because `team_bonus` is cleared.

- [ ] **Step 2: Check it in the browser** on the Task 6 test event, with entries on both tracks, using `execute_sql` inserts or real submits.
  - The board's totals equal the hand sum.
  - The bonus appears after a full week; set `today` by using past-dated scoring on the test event.
  - Screenshot it.

- [ ] **Step 3: Typecheck, lint and test.**
  - Run: `npx tsc --noEmit && npm run lint && npm test`
  - Expected: PASS.

- [ ] **Step 4: Commit.** `feat(tracks): combined leaderboard and team week on the portal (D728)`

### Task 9: The committee's Combined panel and export sheet (D728)

**Files:**
- Modify: `src/features/activities/kinds/submission/SubmissionDetail.tsx` (a Combined panel above the per-track panel on the Leaderboard tab when paired), `src/lib/exports.ts` (`pairLeaderboardRows(score: PairScore): (string | number)[][]` and a sheet named "Combined"), `src/app/admin/events/[id]/export/submissions.xlsx/route.ts` (add the sheet once per pair, not once per activity)
- Create: `src/features/tracks/admin/CombinedPanel.tsx`
- Test: `tests/exports.test.ts` (or the existing export test file; match its location)

**Interfaces:**
- Consumes: Task 7's `PairScore`.
- Produces: `pairLeaderboardRows`.
  - **Header:** `["Week", "Team", "Track A pts", "Track B pts", "Bonus", "Total", "Rank"]`.
  - **Rows:** one per week and team, then "All weeks" rows from `standings`, with the rank blank for void teams.
  - The `CombinedPanel` shows the same columns, with a week picker like `LeaderboardPanel`'s.

- [ ] **Step 1: Write the failing test.** For a two-team, one-week `PairScore` fixture, `pairLeaderboardRows` returns the header, two week rows and two "All weeks" rows with the expected numbers.

- [ ] **Step 2: Run the test to see it fail.**
  - Run: `npx vitest run tests/exports.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implement the rows, the sheet and the panel.**

- [ ] **Step 4: Run the tests and typecheck.**
  - Run: `npm test && npx tsc --noEmit`
  - Expected: PASS.

- [ ] **Step 5: Commit.** `feat(tracks): committee combined panel and export sheet (D728)`

### Task 10: Ship Phase 2 and show the board (D730)

- [ ] **Step 1:** Push `main` and confirm the deploy (`curl` → 200).
- [ ] **Step 2:** Ask the user for a yes to turn `show_leaderboard` on for both ecphub track activities. Apply it on their yes and read it back.
- [ ] **Step 3:** Update the memory file `mileage-x-active-tracks.md` with what shipped, its commits and migration 0106.
