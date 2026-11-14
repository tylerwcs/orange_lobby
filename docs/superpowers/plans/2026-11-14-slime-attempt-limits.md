# Slime Splat Attempt Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per event, cap Slime Splat at N practice runs and M official runs a day, count only official runs on the leaderboard, and refuse starts outside set hours of the Malaysia day.

**Architecture:** A run gets a `kind`; the three settings live on `qualifier_settings`; `qualifier_start` enforces hours and the daily count under the attendee lock it already takes. Pure hour maths lives in a new `hours.ts` shared by server and browser. The view carries limits, today's used counts and the hours so the page can draw two buttons and a "opens again at" line.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before touching routes), Supabase Postgres RPCs, vitest.

**Spec:** `docs/superpowers/specs/2026-11-14-slime-attempt-limits-design.md`

## Global Constraints

- Malaysia time is fixed UTC+8 (`Asia/Kuala_Lumpur`), no daylight saving. A "day" is a Malaysia calendar day.
- Blank / null setting = no limit / any time. An event with all three null must behave exactly as today (one Play button, Enter plays, same copy).
- An attempt is used when the run row is inserted (any status counts: live, done, abandoned, disqualified).
- Existing runs are `official`.
- The migration must not break the code that is live while it is applied: new RPC parameters come last and have defaults.
- Test only on `zz-tracks-test`; never `ecphub` or `zp-my-best-me`.
- Decision numbers: D907 run kinds + daily limits, D908 play hours, D909 player page, D910 admin settings. Cite them in comments as the feature does.
- Plain, non-technical copy. Times shown to players as `12:00 pm`.
- Commit straight to `main`; end commit messages with the Co-Authored-By line.

## Review Focus

1. Run started at 23:59:58 whose countdown ends after midnight: it counts for the day of `starts_at`, and the check uses that same day.
2. Two tabs starting the last official attempt at once: exactly one gets a run, the other `limit`.
3. Page left open across midnight: the buttons show the new day's full allowance without a reload.
4. Page left open across an hours boundary (9:59 → 10:00): buttons turn off / on by the clock.
5. A practice score higher than the official best: board, "Your best" and "New best!" do not move.

---

### Task 1: Hours maths (`hours.ts`)

**Files:**
- Create: `src/features/qualifier/hours.ts`
- Modify: `src/features/qualifier/client.ts` (add `export * from "./hours";`)
- Test: `tests/qualifier/hours.test.ts`

**Interfaces — Produces:**

```ts
/** Flat pairs of minutes of the Malaysia day, [from, to, from, to…], 0–1440, ascending, to exclusive. null = any time. */
export type PlayHours = number[] | null;
export type RunKind = "practice" | "official";
/** "00:00-10:00, 12:00-14:00, 19:00-24:00" → [0,600,720,840,1140,1440]; blank → null; anything else → "invalid". */
export function parsePlayHours(text: string): PlayHours | "invalid";
/** The inverse, for the admin field. null → "". */
export function formatPlayHours(h: PlayHours): string;
/** For players: "before 10:00 am, 12:00 pm – 2:00 pm, after 7:00 pm". A pair from 0 reads "before", to 1440 reads "after". */
export function hoursText(h: NonNullable<PlayHours>): string;
/** Minute of the Malaysia day at `now` (epoch ms). */
export function klMinute(now: number): number;
/** Epoch ms of the Malaysia midnight at or before `now`. */
export function klDayStart(now: number): number;
/** Malaysia date "YYYY-MM-DD" at `now`. */
export function klDay(now: number): string;
/** Whether a start is allowed now; when not, `opensAt` is the epoch ms of the next opening (may be tomorrow). */
export function hoursState(h: PlayHours, now: number): { open: true } | { open: false; opensAt: number };
/** "12:00 pm" for an epoch ms, Malaysia time. */
export function klClock(ms: number): string;
```

- [ ] **Step 1: Write the failing tests** — at least:

```ts
const H = [0, 600, 720, 840, 1140, 1440];
const at = (hhmm: string) => Date.parse(`2026-11-16T${hhmm}:00+08:00`);
expect(parsePlayHours("00:00-10:00, 12:00-14:00, 19:00-24:00")).toEqual(H);
expect(parsePlayHours("  ")).toBeNull();
for (const bad of ["10:00-09:00", "12:00-14:00, 13:00-15:00", "25:00-26:00", "noon", "10:00-10:00", "19:00-24:00, 00:00-10:00"]) expect(parsePlayHours(bad)).toBe("invalid");
expect(formatPlayHours(H)).toBe("00:00-10:00, 12:00-14:00, 19:00-24:00");
expect(hoursText(H)).toBe("before 10:00 am, 12:00 pm – 2:00 pm, after 7:00 pm");
expect(hoursState(H, at("09:59"))).toEqual({ open: true });
expect(hoursState(H, at("10:00"))).toEqual({ open: false, opensAt: at("12:00") });
expect(hoursState(H, at("13:59"))).toEqual({ open: true });
expect(hoursState(H, at("14:00"))).toEqual({ open: false, opensAt: at("19:00") });
expect(hoursState(H, at("23:59"))).toEqual({ open: true });
expect(hoursState([720, 840], at("15:00"))).toEqual({ open: false, opensAt: Date.parse("2026-11-17T12:00:00+08:00") });
expect(hoursState(null, at("15:00"))).toEqual({ open: true });
expect(klDay(Date.parse("2026-11-16T16:30:00Z"))).toBe("2026-11-17");
expect(klDayStart(at("15:00"))).toBe(at("00:00"));
expect(klClock(at("12:00"))).toBe("12:00 pm");
```

- [ ] **Step 2:** `npx vitest run tests/qualifier/hours.test.ts` → fails (module missing).
- [ ] **Step 3:** Implement with plain arithmetic on `now + 8h` (no `Intl`, so server and browser agree).
- [ ] **Step 4:** Run again → passes.
- [ ] **Step 5:** Commit `feat(slime): play-hours maths (D908)`.

### Task 2: Migration 0139

**Files:**
- Create: `supabase/migrations/0139_slime_attempt_limits.sql`
- Modify: `scripts/qualifier-db-check.mjs` (new cases)
- Test: `tests/qualifier/sql-constants.test.ts` (pin the SQL literals below)

**Interfaces — Produces:**
- `qualifier_runs.kind text not null default 'official' check (kind in ('practice','official'))`
- `qualifier_settings.practice_per_day int`, `official_per_day int` (null or 0–99), `play_hours int[]` (null, or even length, every value 0–1440)
- `qualifier_start(p_event_id uuid, p_attendee_id uuid, p_seed int, p_countdown_ms int, p_kind text default 'official')` → same row shape; `refused` gains `'hours'` and `'limit'`. Drop the 4-argument function first; re-grant to `service_role` only.
- `qualifier_save_settings(p_event_id, p_opens_at, p_closes_at, p_excluded, p_practice_per_day int default null, p_official_per_day int default null, p_play_hours int[] default null)`; drop the 4-argument one; same grants.
- `qualifier_refresh_player`: best run additionally requires `r.kind = 'official'`. `runs_played` unchanged.

Rules inside `qualifier_start`, after the eligibility check and before abandoning the live run (so a refused start abandons nothing):
1. An unknown `p_kind` is treated as `'official'`.
2. Compute `v_starts` first (as today). Hours: `m` = minute of day of `now() at time zone 'Asia/Kuala_Lumpur'`; allowed when `play_hours` is null or some pair has `from <= m < to`; else `'hours'`.
3. Limit: when that kind's per-day setting is not null, count this attendee's runs in this event of that kind whose `(starts_at at time zone 'Asia/Kuala_Lumpur')::date` equals `v_starts`'s; if count >= limit → `'limit'`.
4. Insert with `kind`.

- [ ] **Step 1:** Add to `sql-constants.test.ts`: the 0139 file contains `'Asia/Kuala_Lumpur'`, `p_kind text default 'official'`, `r.kind = 'official'`, and both drops of the old signatures.
- [ ] **Step 2:** Run → fails (file missing).
- [ ] **Step 3:** Write the migration, copying the current bodies of the three functions from 0120/0117 and changing only what is listed. Keep their comments' style; say D907/D908.
- [ ] **Step 4:** Run the test → passes.
- [ ] **Step 5:** Apply 0139 to the Supabase project (it is additive and the live code keeps working through the defaults). Check advisors for new warnings.
- [ ] **Step 6:** Extend `scripts/qualifier-db-check.mjs` in its existing style, on its existing test event/attendees, restoring settings afterwards: (a) limits 3/1 → 4th practice start `limit`, 2nd official `limit`, practice still allowed after official is used; (b) two official starts fired together → exactly one run; (c) `play_hours` set to a window that excludes now → `hours`, and one that includes now → a run; (d) a practice run submitted with a higher score leaves `qualifier_players.best_score` unchanged; (e) the 4-named-argument call still starts an official run. Run it; all pass.
- [ ] **Step 7:** Commit `feat(slime): practice and official runs, daily limits, play hours in the database (D907, D908, 0139)`.

### Task 3: Server code

**Files:**
- Modify: `src/features/qualifier/phase.ts` (settings type), `db.ts`, `view.ts`, `src/app/api/qualifier/[token]/start/route.ts`, `src/app/api/qualifier/[token]/submit/route.ts`, `src/features/qualifier/game/timeline.ts` or wherever `SubmitAnswer` is typed
- Test: `tests/qualifier/phase.test.ts`, `tests/qualifier/view.test.ts` (update fixtures; add cases)

**Interfaces — Consumes:** Task 1's `PlayHours`, `RunKind`, `klDayStart`, `klDay`, `hoursState`, `klClock`; Task 2's RPCs.

**Produces:**

```ts
// phase.ts
export type QualifierSettings = { opens_at; closes_at; excluded_categories; confirmed_at;
  practice_per_day: number | null; official_per_day: number | null; play_hours: PlayHours };
/** Two kinds on offer: true when either daily number is set. */
export const hasKinds = (s: Pick<QualifierSettings, "practice_per_day" | "official_per_day"> | null): boolean;

// db.ts
startRun(eventId, attendeeId, seed, kind: RunKind): Promise<{ runId; startsAt } | { refused: "closed" | "ineligible" | "hours" | "limit" }>;
getRun(...) // adds kind: RunKind
RunRow // adds kind: RunKind
/** Runs of each kind started (starts_at) since `sinceIso`. */
usedSince(eventId: string, attendeeId: string, sinceIso: string): Promise<{ practice: number; official: number }>;

// view.ts — QualifierView gains
limits: { practice: number | null; official: number | null };   // both null = no kinds
used: { day: string; practice: number; official: number };     // day = klDay(now)
playHours: PlayHours;
```

- Start route: reads `{ kind }` from the JSON body (missing or unknown → `"official"`); when `!hasKinds(settings)` forces `"official"`. Checks `hoursState` before the RPC so it can name the time. Messages: hours → `The game is closed right now. It opens again at ${klClock(opensAt)}.`; limit → `You've used today's practice runs.` / `You've used today's official attempt.` (plural "attempts" when the limit is over 1); both 403. Answer also carries `kind`.
- Submit route: `prevBest` stays as read; the answer gains `kind` (from `getRun`). For a practice run the route still returns the fresh view.
- `saveSettings` passes the three new values; `addSlime` passes nulls.

- [ ] **Step 1:** Update fixtures and add tests: `hasKinds` (null/null false; 3/null true; null/1 true); view test that `limits`, `used.day` and `playHours` come through (follow the file's existing mocking).
- [ ] **Step 2:** Run `npx vitest run tests/qualifier` → the new cases fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx vitest run tests/qualifier` and `npx tsc --noEmit` → clean.
- [ ] **Step 5:** Commit `feat(slime): starts carry a kind; view carries limits and hours (D907, D908)`.

### Task 4: Player page

**Files:**
- Modify: `src/features/qualifier/screen.ts`, `components/QualifierClient.tsx`, `components/ResultCard.tsx`, `components/game/SlimeGame.tsx`, `components/game/Results.tsx`
- Test: `tests/qualifier/screen.test.ts`

**Interfaces — Produces (screen.ts, pure):**

```ts
/** What is left today of each kind (null = unlimited), resetting when the Malaysia day has moved on from `used.day`. */
export function leftToday(v: Pick<QualifierView, "limits" | "used">, now: number): { practice: number | null; official: number | null };
/** "Practice · 2 left today", "Practice · none left today", "Practice" (unlimited). Official: "Official attempt · 1 today" / "· used today" / "Official attempt". */
export function kindLabel(kind: RunKind, left: number | null): string;
/** The rule lines under the buttons, built from the settings actually set. */
export function ruleLines(v: Pick<QualifierView, "limits" | "playHours">): string[];
```

`ruleLines` copy, each only when its setting is set: `Practice: up to 3 runs a day. They don't count.` / `Official: 1 attempt a day. Only official attempts go on the leaderboard.` / `Play ${hoursText(h)}.` Add `An attempt is used as soon as it starts.` when either limit is set.

Behaviour:
- No kinds (`limits` both null): exactly today's page, except hours (if set) still turn Play off with `Opens again at 12:00 pm`.
- Kinds: Ready, result and failed screens show two buttons (one shared component), each disabled at 0 left; outside hours both are replaced by `Opens again at …` (computed each tick from `hoursState(view.playHours, now)`). The how-to line "Play as often as you like — your best run counts." is replaced by `ruleLines`, always shown (not only before the first play).
- `play(kind)` stores the kind for the mounted game; `start` posts `{ kind }`; on a started run bump `view.used` for that kind locally (reset first if the day moved).
- Enter never starts a run when kinds are on (an official attempt must be a deliberate tap).
- Practice result (page and in-game `Results`): heading `Practice run`, the score, `Not on the leaderboard`; never "New best!". Official result unchanged.
- Any in-game "play again" path must go through the same kind choice and counts, or be hidden when kinds are on.

- [ ] **Step 1:** Tests for `leftToday` (3 used of 3 → 0; day moved → full; null limit → null), `kindLabel` (the strings above), `ruleLines` (all three set; hours only; none → `[]`).
- [ ] **Step 2:** Run → fail.
- [ ] **Step 3:** Implement the pure functions, then the components.
- [ ] **Step 4:** `npx vitest run tests/qualifier`, `npx tsc --noEmit`, `npm run lint` → clean.
- [ ] **Step 5:** Commit `feat(slime): practice and official buttons, hours on the player page (D909)`.

### Task 5: Admin

**Files:**
- Modify: `src/features/qualifier/admin/SettingsCard.tsx`, `admin/RunsTable.tsx`, `src/app/admin/events/[id]/games/slime-splat/actions.ts`
- Test: `tests/qualifier/input.test.ts` or a new `tests/qualifier/limits-input.test.ts`

**Interfaces — Produces (hours.ts or phase.ts, pure):**

```ts
/** "" → null; "0"–"99" whole → the number; anything else → "invalid". */
export function parsePerDay(text: string): number | null | "invalid";
```

- Settings card: a second group "Daily limits" with fields `practice_per_day` ("Practice runs a day"), `official_per_day` ("Official attempts a day"), both described "Leave blank for no limit."; and `play_hours` ("Play hours", placeholder `00:00-10:00, 12:00-14:00, 19:00-24:00`, description "Malaysia time, 24-hour. Leave blank to allow any time. Outside these hours the game won't start."). The card description's "as often as they like; their best run goes on the leaderboard" becomes accurate for both cases: "Attendees can play between these two times, Malaysia time. Their best official run goes on the leaderboard. A run started before the close still counts."
- Action: invalid number → flash `Runs a day must be a whole number from 0 to 99.`; invalid hours → flash `Play hours should look like 12:00-14:00, 19:00-24:00.`
- Runs table: a "Type" column after Started: `Practice` (outline badge) or `Official`.
- The leaderboard export needs no change (it lists bests, which are official only).

- [ ] **Step 1:** Tests for `parsePerDay` ("" null; "3" 3; "0" 0; "100", "-1", "1.5", "x" invalid).
- [ ] **Step 2:** Run → fail. **Step 3:** Implement. **Step 4:** vitest, tsc, lint clean.
- [ ] **Step 5:** Commit `feat(slime): daily limits and play hours on the settings card (D910)`.

### Task 6: Verify in the browser

- [ ] On `zz-tracks-test` (extend its window if shut): set 3 / 1 and hours that include now. At phone width: two buttons with counts; a practice run ends in "Practice run · Not on the leaderboard" and the count drops; the official run lands on the board and its button turns off; a 4th practice is off.
- [ ] Set hours that exclude now: both buttons replaced by "Opens again at …"; a direct POST to the start route answers 403 with the hours message.
- [ ] Clear all three settings: page is as before (one Play, Enter works).
- [ ] Admin: settings save and reload; bad input flashes; runs table shows Type.
- [ ] Leave `zz-tracks-test` with limits cleared. Console free of errors.
