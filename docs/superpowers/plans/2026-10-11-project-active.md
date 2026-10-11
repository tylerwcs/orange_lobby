# Project Active Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the km-based Project Mileage challenge into the minutes-based Project Active (12 Oct – 4 Dec 2026), as a new scored activity in ecphub.

**Architecture:**
- The scoring setting (`activities.scoring`, D372) gains four optional fields: `unit`, `week_origin`, `void` and a team-minutes ranking.
- The ranking is derived; it isn't stored.
- Every rule is a pure function in `src/features/activities/lib/`, so tests run without a database.
- The UI reads the unit instead of the hard-coded "km".
- Phase 1 (Tasks 1–3) must be live before Mon 12 Oct 00:00 MYT. Phase 2 (Tasks 4–5) must be live before Sun 18 Oct.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before touching routing or server actions), Supabase Postgres, Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-11-project-active-design.md` (D462–D468)

## Global Constraints

- Never build or test on the `ecphub` event. Use a throwaway event and delete it afterwards. Writes to ecphub (Task 3) are confirmed in chat first.
- Points are computed from live entries and never stored (D375).
- Existing Mileage behaviour must not change. The defaults are `unit` "km", `week_origin` "event" and `void` "season".
- The unit only labels values. Rounding stays `round2`, which is harmless for whole minutes.
- Run `npm test`, `npx tsc --noEmit` and `npm run lint` before each commit.
- Commits go on main and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Mileage reads exactly as before:**
   - Scoring saved with no unit, origin or void still says "km" and Week 2–10, and is Void for the
     whole season.
   - Test: `readScoring` round-trips the old MILEAGE object unchanged (Task 1). The existing
     scoring tests still pass (Task 4).
2. **The Setup save with blank new fields:**
   - Saving the Scoring section with Unit left blank must not store `unit: ""`.
   - Test: in Task 1, a blank `scoring_unit` leaves `unit` out.
3. **The week-origin boundary:**
   - When the challenge starts on a Monday, Week 1 is that week. When it starts mid-week, Week 1
     is still that partial week.
   - Test: in Task 1, a Wednesday start gives Week 1.
4. **Disqualifying an already-ended week:**
   - The podium for that week is re-ranked without the team, and the other weeks keep their points.
   - Test: in Task 4.
5. **The disqualified person in Tier 2:**
   - Their missed days after the void week must not cost teammates the bonus. Their days before
     it still count.
   - Test: in Task 4.

---

### Task 1: `unit` and `week_origin` on the scoring setting

**Files:**
- Modify: `src/lib/types.ts` (the `ChallengeScoring` type)
- Modify: `src/features/activities/lib/challenge.ts` (`challengeWeeks`, `readScoring`, plus a new `unitOf`)
- Modify: `src/features/activities/kinds/submission/scoring/ScoringFields.tsx`
- Test: `tests/activities/challenge.test.ts`

**Interfaces:**
- Produces:
  - `ChallengeScoring.unit?: string`
  - `ChallengeScoring.week_origin?: "event" | "challenge"`
  - `unitOf(s: Pick<ChallengeScoring, "unit">): string`, which returns `s.unit || "km"`
  - `challengeWeeks(s: Pick<ChallengeScoring, "starts_on" | "ends_on" | "week_origin">, eventStartsOn)`

- [ ] **Step 1: Write the failing tests** (append to `tests/activities/challenge.test.ts`)

```ts
describe("week_origin and unit (D463, D464)", () => {
  const ACTIVE: ChallengeScoring = { metric_key: "minutes", daily_min: 20, starts_on: "2026-10-12", ends_on: "2026-12-04", week_origin: "challenge", unit: "min" };

  it("numbers Project Active Week 1 to Week 8 from the challenge start", () => {
    const weeks = challengeWeeks(ACTIVE, "2026-09-28");
    expect(weeks.map((w) => w.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(weeks[7].days).toEqual(["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04"]);
  });

  it("keeps a mid-week start as Week 1", () => {
    expect(challengeWeeks({ ...ACTIVE, starts_on: "2026-10-14" }, "2026-09-28")[0].number).toBe(1);
  });

  it("defaults to the event origin", () => {
    expect(challengeWeeks({ ...ACTIVE, week_origin: undefined }, "2026-09-28")[0].number).toBe(3);
  });

  it("falls back to km", () => {
    expect(unitOf({})).toBe("km");
    expect(unitOf({ unit: "min" })).toBe("min");
  });
});
```

Add `unitOf` to the import list at the top of the file. Inside the existing `describe("readScoring (D372)")`, add:

```ts
  it("reads the unit and week origin, leaving blanks out (D463, D464)", () => {
    expect(readScoring(form({ scoring_unit: " min ", scoring_week_origin: "challenge" }), questions))
      .toEqual({ ...MILEAGE, unit: "min", week_origin: "challenge" });
    expect(readScoring(form({ scoring_unit: "", scoring_week_origin: "event" }), questions)).toEqual(MILEAGE);
  });

  it("refuses a long unit", () => {
    expect(() => readScoring(form({ scoring_unit: "kilometres!!!" }), questions)).toThrow(/unit/);
  });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/activities/challenge.test.ts`. Expected: FAIL, because `unitOf` isn't exported and the numbers come out as 3..10.

- [ ] **Step 3: Implement**

In `src/lib/types.ts`, add to `ChallengeScoring`:

```ts
  /** D463: the metric's short label ("min"); km when missing, so Mileage reads as before. */
  unit?: string;
  /** D464: Week 1 is the event's first week (D378, the default) or the challenge's. */
  week_origin?: "event" | "challenge";
```

In `challenge.ts`:

```ts
export function unitOf(s: Pick<ChallengeScoring, "unit">): string {
  return s.unit || "km";
}
```

In `challengeWeeks`, change the Pick to `"starts_on" | "ends_on" | "week_origin"` and the origin line to:

```ts
  const fromEvent = s.week_origin !== "challenge" && eventStartsOn && eventStartsOn <= s.starts_on;
  const origin = mondayOf(fromEvent ? eventStartsOn : s.starts_on);
```

Update the doc comment to mention D464. In `readScoring`, before the `return`, add:

```ts
  const unit = val("scoring_unit");
  if (unit.length > 8) throw new Error("Keep the unit short, like km or min.");
  const week_origin = val("scoring_week_origin") === "challenge" ? "challenge" as const : null;
```

Then add these to the returned object:

```ts
    ...(unit ? { unit } : {}),
    ...(week_origin ? { week_origin } : {}),
```

In `ScoringFields.tsx`, change the grid holding Starts, Ends and Daily minimum to `sm:grid-cols-3`. After it, add a second grid:

```tsx
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm"><span className="font-bold">Unit (optional)</span>
              <input name="scoring_unit" maxLength={8} defaultValue={s?.unit ?? ""} placeholder="km" className={input} />
              <span className="text-xs text-muted-foreground">How the score reads on the tracker, like km or min.</span></label>
            <label className="grid gap-1.5 text-sm"><span className="font-bold">Number weeks from</span>
              <select name="scoring_week_origin" defaultValue={s?.week_origin ?? "event"} className={input}>
                <option value="event">The event&apos;s first week</option>
                <option value="challenge">The challenge&apos;s first week</option>
              </select></label>
          </div>
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/activities/challenge.test.ts`. Expected: PASS. Then run `npx tsc --noEmit`, which should be clean.

- [ ] **Step 5: Commit**

Commit message: `feat(scoring): a unit and a week origin on the scoring setting (D463, D464)`.

---

### Task 2: Every "km" label reads the unit

**Files:**
- Modify: `src/features/activities/lib/tracker.ts` (`teamSummary`)
- Modify: `src/features/activities/kinds/submission/scoring/TrackerBody.tsx` (pass `unit` to `DayRing` and `EntryTimeline`)
- Modify: `src/features/activities/kinds/submission/scoring/tracker/MyTeam.tsx`
- Modify: `src/features/activities/kinds/submission/scoring/LeaderboardPanel.tsx` (the "km" column header)
- Modify: `src/lib/exports.ts` (`leaderboardRows` header)
- Modify: every caller of `leaderboardRows` (find them with `grep -rn leaderboardRows src`)
- Test: `tests/activities/tracker.test.ts`, `tests/exports.test.ts`

**Interfaces:**
- Consumes: `unitOf` from Task 1.
- Produces:
  - `teamSummary` takes `unit: string`.
  - `leaderboardRows(score, unit = "km")`.
  - `LeaderboardPanel` takes a `unit` prop.

- [ ] **Step 1: Write the failing tests**

`tests/activities/tracker.test.ts`: in the `teamSummary` cases, add `unit: "km"` to every existing input. Then add:

```ts
  it("names the unit (D463)", () => {
    expect(teamSummary({ day: "2026-10-13", today: "2026-10-13", startsOn: "2026-10-12", logged: 3, members: 10, weekKm: 140, weekHasToday: true, unit: "min" }))
      .toBe("3 of 10 logged today · 140 min this week");
  });
```

`tests/exports.test.ts`: next to the existing `leaderboardRows` test, add:

```ts
  it("heads the total column with the unit (D463)", () => {
    expect(leaderboardRows(score, "min")[0][2]).toBe("min");
  });
```

Use the `score` fixture the existing leaderboard test builds. If that fixture is built inside an `it`, lift it into the `describe`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/activities/tracker.test.ts tests/exports.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

- `teamSummary`: add `unit: string` to the input type, and change `${input.weekKm} km` to `${input.weekKm} ${input.unit}`.
- `leaderboardRows(score: ChallengeScore, unit = "km")`: the header's third cell becomes `unit`.
- In each caller, pass `unitOf(activity.scoring!)` (or the scoring object it already has in hand).
- `TrackerBody.tsx`:
  - Add `const unit = unitOf(scoring);`.
  - Render `<DayRing t={t} unit={unit} />` and `<EntryTimeline … unit={unit} />`.
- `MyTeam.tsx`:
  - Add `const unit = unitOf(scoring);`.
  - Pass `unit` to `teamSummary`.
  - Change `{r.km} km` to `{r.km} {unit}`.
- `LeaderboardPanel.tsx`:
  - Add a `unit: string` prop and render it in the header `<TableHead>` in place of `km`.
  - In `SubmissionDetail.tsx`, pass `unit={unitOf(scoring)}`, using the scoring variable already in
    scope there.
- `TeamGrid` shows bare numbers, so it doesn't change.

- [ ] **Step 4: Run all checks**

Run `npm test`, `npx tsc --noEmit` and `npm run lint`. All should pass.

- [ ] **Step 5: Browser check on a test event (never ecphub)**

Use the preview server.
- Create a test event with 2 groups, then a submission activity.
- Give it the D465 questions: `minutes` with min 20, max 300 and decimals 0.
- Set scoring to: metric `minutes`, unit `min`, week origin challenge, daily min 20, steps `20=1, 30=2, 45=3, 60=4`, bonus 10, podium `15, 10, 5`, dates today → 2026-12-04, and `group_mode` members.

Then, as an attendee in a group:
- Submitting 19 is refused.
- Submitting 25 and then 35 makes the ring read "60 min today · 4 pts" and "Top score reached".
- The week label reads "Week 1".
- The machine photo appears only for the Indoor machine method.
- The "What activity?" box appears only for Other.

Finally, delete the test event.

- [ ] **Step 6: Commit**

Commit message: `feat(scoring): the tracker, leaderboard and export read the unit (D463)`.

---

### Task 3: Go live on ecphub (data only; confirm in chat first)

Show the user the SQL and wait for their yes, then run it with `execute_sql` on project `wfmqwwcolfigjylkgrsv`.

- [ ] **Step 1: Push Tasks 1–2.** Run `git push`, then wait for the Vercel deploy to be Ready (check with `npx vercel ls` or the dashboard).

- [ ] **Step 2: Create Project Active.**
  - Insert a new row into `activities`, copying the Mileage row (`3b89b3a2-eabc-49fe-b50e-0f2f55ce7f18`).
  - Copy these fields: `org_id`, `event_id`, `kind`, `group_mode`, `proxy_fields`, `attendee_edit`, `categories`, `pinned`, `show_leaderboard`, `per_day`, `required`, `max_per_attendee`, `sort_order`.
  - Change these:
    - `name` = 'Project Active 💪'
    - `starts_on` = '2026-10-12', `ends_on` = '2026-12-04'
    - `image_url` = null (the committee uploads the eDM)
    - `questions` = the D465 table as JSON, using exactly the option strings in the spec
    - `scoring` = `{"metric_key":"minutes","unit":"min","week_origin":"challenge","daily_min":20,"starts_on":"2026-10-12","ends_on":"2026-12-04","daily_steps":[{"at":20,"pts":1},{"at":30,"pts":2},{"at":45,"pts":3},{"at":60,"pts":4}],"team_bonus":10,"podium":[15,10,5]}`
    - `description` = a short summary of the eDM rules
  - Check the column list with `select column_name from information_schema.columns where table_name='activities'` before writing the insert.

- [ ] **Step 3: Close Mileage.** Run `update activities set is_open=false, pinned=false where id='3b89b3a2-eabc-49fe-b50e-0f2f55ce7f18'`.

- [ ] **Step 4: Read-only portal check** as one real team member, without submitting:
  - The page shows Week 1 · 12–18 Oct, the ring reads "0 min", and the form shows the questions.
  - Mileage no longer shows.

---

### Task 4: Disqualifying voids one week (Phase 2, D467)

**Files:**
- Create: `supabase/migrations/0075_disqualify_week.sql`
- Modify: `src/lib/types.ts` (`ChallengeScoring.void?: "season" | "week"`)
- Modify: `src/features/activities/lib/challenge.ts` (`readScoring` reads `scoring_void`)
- Modify: `src/features/activities/kinds/submission/scoring/ScoringFields.tsx` (a "Disqualifying voids" select)
- Modify: `src/features/activities/db/challenge.ts` (`Disqualification.week_of`, and `disqualify` takes `weekOf`)
- Modify: `src/features/activities/lib/challenge-score.ts`
- Modify: `src/features/activities/lib/challenge-data.ts` (pass the disqualifications as a map)
- Modify: `DisqualifyForm.tsx`, `TeamGrid.tsx` and the disqualify server action (find it with `grep -rn "disqualify(" src`)
- Modify: `LeaderboardPanel.tsx`, `tracker/Leaderboard.tsx`, `lib/leaderboard.ts`, `exports.ts`, to show a per-week Void
- Test: `tests/activities/challenge-score.test.ts`, `tests/activities/challenge.test.ts`

**Interfaces:**
- `scoreChallenge` input changes from `disqualified: Set<string>` to `disqualified: Map<string, string | null>`, mapping each attendee to the `week_of` Monday, or null for the whole season.
- `TeamWeek` gains `void: boolean`.
- Under `void: "week"`, `Standing.void` stays false, and only `TeamWeek.void` is set.

- [ ] **Step 1: Migration**

```sql
-- D467: the week a disqualification voids, when the challenge voids one week (scoring.void = 'week').
-- Null keeps D380's whole-season Void, so Mileage's rows are unchanged.
alter table challenge_disqualifications add column week_of date;
```

Apply it with `apply_migration`, named `0075_disqualify_week`.

- [ ] **Step 2: Write the failing tests** (in `tests/activities/challenge-score.test.ts`, reusing the file's team and totals helpers)

  - **Week void:**
    - Team A has the most minutes in weeks 1 and 2, and a member is disqualified with
      `week_of` = week 1's Monday under `void: "week"`.
    - Expect week 1's team A to be `{ tier1: 0, bonus: 0, podium: 0, void: true }`, and team B to
      take podium[0] for week 1.
    - Expect week 2's team A to have its normal points, except that the disqualified person's
      minutes in week 2 count 0.
    - Expect the A standing to be `void: false`, with its total = week 2's points.
  - **Tier 2:**
    - In week 2, every member of A except the disqualified one logs every day.
    - Expect A's week 2 bonus = `team_bonus`, and `members` to be one fewer.
  - **Season void unchanged:** the existing D380 tests pass once `new Set([...])` becomes
    `new Map([[id, null]])`.
  - **readScoring:** `scoring_void: "week"` gives `void: "week"`, and `"season"` or blank leaves
    it out.

- [ ] **Step 3: Implement `scoreChallenge`**

```ts
  const weekVoid = scoring.void === "week";
  // D467: from the void week on, a disqualified person counts nothing and is not on the team for Tier 2.
  const outFrom = (id: string) => (weekVoid && disqualified.has(id) ? disqualified.get(id) ?? "0000-01-01" : null);
  const counts = (id: string, day: string) => { const f = outFrom(id); return f === null || day < f; };
```

  - In the week loop, skip totals with `!counts(t.attendeeId, t.day)`.
  - For Tier 2 and `onTrack`, use `members = team.memberIds.filter((id) => counts(id, week.days[0]))`.
  - A team-week is void when some `id` in `team.memberIds` was disqualified with
    `mondayOf(week.days[0]) === disqualified.get(id)`. Mark it `void: true`, zero its tier1, bonus
    and podium, and leave it out of `racing`.
  - `isVoid` (the season void) applies only when `!weekVoid`.
  - In `rows`, sum the minutes only over non-void team-weeks. This feeds D468.

- [ ] **Step 4: Wire it up**
  - `challenge-data.ts`: build `new Map(disqualifications.map((d) => [d.attendee_id, d.week_of]))`.
  - `disqualify()` takes `weekOf: string | null` and upserts `week_of`.
  - The server action reads the grid's week (`DisqualifyForm` already receives `week`) and passes
    its first day's Monday when `scoring.void === "week"`, and null otherwise.
  - `DisqualifyForm` confirm text under week void: "`{teamName}` scores 0 for Week N."
  - Leaderboards and the export show "Void" on a team-week with `void: true`.

- [ ] **Step 5: Run the tests, then do the browser check on a test event.**
  - Disqualify a member in week 1: that week reads Void, the season total stays live, and Undo
    restores the week.

- [ ] **Step 6: Commit and push**

Commit message: `feat(scoring): disqualifying can void one week (D467)`.

- [ ] **Step 7: Set `void: "week"` on Project Active.**
  - Use the Setup tab, or a confirmed `update activities set scoring = scoring || '{"void":"week"}'`.

---

### Task 5: The Ultra-Effort ranking (Phase 2, D468)

**Files:**
- Modify: `src/features/activities/lib/challenge-score.ts` (`Standing.volumeRank`)
- Modify: `LeaderboardPanel.tsx` (a "Total {unit}" column with its rank, shown in the all-weeks view)
- Modify: `src/lib/exports.ts` (`leaderboardRows` all-weeks rows get a last column, "Ultra-Effort rank")
- Test: `tests/activities/challenge-score.test.ts`, `tests/exports.test.ts`

- [ ] **Step 1: Write the failing tests**
  - Three teams have season minutes 900, 1200 and 1200. Expect `volumeRank` to be 3, 1 and 1.
  - A team with 0 minutes gets `volumeRank: null`.
  - Under the season void, a Void team has `volumeRank: null`.
  - Export: an all-weeks row ends with its `volumeRank`. Week rows end with "".

- [ ] **Step 2: Implement**
  - After `rows` is built, collect the `eligible` rows: those that aren't season-void and have
    km > 0.
  - Give each eligible row `volumeRank = rankOf(eligible, (x) => x.km, r)`, and every other row
    null.

- [ ] **Step 3: UI**
  - In the all-weeks view of `LeaderboardPanel`, add a "#" (the volumeRank) beside the unit total,
    with an "Ultra-Effort" caption over the column.
  - Attendees' views don't change (D379).

- [ ] **Step 4: Run the tests, check the browser on a test event, then commit and push**

Commit message: `feat(scoring): Ultra-Effort ranking by season total (D468)`.
