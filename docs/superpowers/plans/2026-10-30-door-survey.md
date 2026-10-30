# Door survey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a scan checks someone in at a checkpoint that names a survey, the crew device offers Fill survey / Skip and saves the answers as that attendee's submission; tick-box questions work in activity forms.

**Architecture:** `checkpoints.survey_activity_id` links a door to a submission activity. The scan result carries the survey state; the scanner opens a full-screen form (`SubmissionFields` + `HealthConsentField`) that posts to a new scan action, which writes through `submit_answers` with a new `p_checkpoint_id` that both bypasses the closed checks and is stored on the row.

**Tech Stack:** Next.js App Router (read `node_modules/next/dist/docs/` before touching routing/actions), TypeScript, Supabase Postgres (migrations applied with the Supabase MCP `apply_migration`, project `wfmqwwcolfigjylkgrsv`), vitest (pure logic only, no DB, `tests/**/*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-10-30-door-survey-design.md`

## Global Constraints

- Decisions numbered from **D759**; cite them in comments the way the code cites D-numbers today.
- Migration file `supabase/migrations/0114_door_survey.sql`.
- Never test on events `ecphub` or `zp-my-best-me` (both live). Create or reuse a test event.
- Scanner wording stays English. Crew-link writes are limited to the checkpoint's own survey, for an attendee checked in at that checkpoint.
- No answers ever travel back to the scanner. The form unmounts on submit and Skip.
- Commit on `main` (the user works on main). Do not push; the user decides.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A scan landing while the survey is open** (camera still sees badges, hand scanner fires) must be ignored, not check in the next person under the open form. → Task 5 browser check step.
2. **A tick-box question with `show_when` on it** must open/close the dependent question as boxes are ticked. → Task 1 browser check step.
3. **Two crew devices submitting the same person's survey** — second gets `limit` (max 1) shown in the form, not a crash. → Task 4 test of the refusal mapping + Task 6.
4. **A crew link posting a survey for someone not checked in at that door, or a different activity id** → refused. → Task 4 test of `doorSurveyRefusal`.
5. **Undo after the survey was saved** — the check-in is removed, the submission stays (an admin can revoke it). Accepted behaviour; Task 6 confirms it doesn't error.

---

### Task 1: Tick boxes in activity forms (D759)

**Files:**
- Modify: `src/lib/registration.ts:15` (`FORM_QUESTION_TYPES`)
- Modify: `src/features/activities/kinds/submission/SubmissionFields.tsx`
- Test: `tests/registration.test.ts`

**Interfaces:**
- Produces: `FORM_QUESTION_TYPES` includes `"multi"`. `SubmissionFields` renders `multi` questions; its props are unchanged.

- [ ] **Step 1: Failing test** in `tests/registration.test.ts`:
```ts
it("lets activity forms carry tick boxes (D759)", () => {
  expect(FORM_QUESTION_TYPES).toContain("multi");
});
```
- [ ] **Step 2:** `npx vitest run tests/registration.test.ts` → FAIL.
- [ ] **Step 3:** Add `"multi"` to `FORM_QUESTION_TYPES` (after `"select"`). In `SubmissionFields.tsx` add a `MultiChoice` client component following `RegisterForm`'s D732 pattern: a `role="group"` div with `id="q-<key>"`, one hidden `<input name={q.key}>` holding the joined answer, boxes with **no name** (`data-multi`, `value=o`), toggled with `toggleMulti` from `@/lib/multi-answer`, seeded from `current`. It reports each change up through an `onAnswer(key, value)` callback that `SubmissionFields` wires to `setAnswers`, because the fieldset's `onChange` ignores nameless boxes and hidden inputs fire no change event. Row style as in RegisterForm (`py-3 text-sm`, `size-5 accent-primary`). No `required` attribute (the server's `validateAnswers` already enforces required and listed choices for `multi`).
- [ ] **Step 4:** `npx vitest run tests/registration.test.ts` → PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5: Browser check** on a test event: add a submission activity with a tick-box question and a text question `show_when` one of its choices; the admin editor offers "Tick boxes"; the portal form shows boxes; ticking the choice opens the dependent question; submitting stores `"A, C"` in option order; the admin's Edit on that entry shows the boxes pre-ticked.
- [ ] **Step 6: Commit** `feat(forms): tick-box questions in activity forms (D759)`.

### Task 2: Migration 0114 — survey link, door column, submit_answers door flag (D760)

**Files:**
- Create: `supabase/migrations/0114_door_survey.sql`
- Modify: `src/lib/types.ts` (`Checkpoint`, `ActivitySubmission`)
- Modify: `src/features/activities/db/activities.ts:616` (`submitAnswers`)

**Interfaces:**
- Produces: `Checkpoint.survey_activity_id: string | null`; `ActivitySubmission.checkpoint_id?: string | null`; `submitAnswers(activityId, attendeeId, answers, today, submittedBy = null, fileHashes = {}, checkpointId: string | null = null): Promise<SubmitCode>`.

- [ ] **Step 1: Write the migration.**
  - `alter table checkpoints add column survey_activity_id uuid references activities(id) on delete set null;`
  - `alter table activity_submissions add column checkpoint_id uuid references checkpoints(id) on delete set null;`
  - `drop function submit_answers(uuid, uuid, jsonb, date, uuid, jsonb, uuid);` then re-create it from `0108_track_daily_places.sql` **verbatim** with one new trailing parameter `p_checkpoint_id uuid default null`, and two changes only: (a) both `return 'closed'` checks (the `is_open` one and the scoring date window) are skipped when `p_checkpoint_id is not null`; (b) the insert writes `checkpoint_id = p_checkpoint_id`. Comment both with D760.
  - `revoke execute ... from public, anon, authenticated;` / `grant execute ... to service_role;` with the new 8-argument signature.
  - Check `submit_answers_pair` (0108) calls `submit_answers` with positional args; if it does, it still resolves (new param has a default). Confirm by reading it; no change expected.
- [ ] **Step 2: Apply** with Supabase MCP `apply_migration` (name `door_survey`).
- [ ] **Step 3: Verify in SQL**, inside `begin; ... rollback;` on a test event: a closed submission activity → `submit_answers(..., p_checkpoint_id => null)` returns `closed`; with a checkpoint id returns `ok` and the row has that `checkpoint_id`; a second call returns `limit` when `max_per_attendee = 1`.
- [ ] **Step 4:** Add the type fields and the `checkpointId` parameter (passed as `p_checkpoint_id`). `npx tsc --noEmit` clean; `npm test` green.
- [ ] **Step 5: Commit** `feat(door-survey): migration 0114 (D760)`.

### Task 3: Admin — link a survey to a checkpoint (D761)

**Files:**
- Modify: `src/lib/db/checkpoints.ts` (`createCheckpoint`, new `setCheckpointSurvey`)
- Modify: `src/app/admin/events/[id]/actions.ts:977` (`addCheckpointAction`, new `setCheckpointSurveyAction`)
- Modify: `src/app/admin/events/[id]/settings/page.tsx:111-260`
- Modify: `src/components/admin/CheckpointList.tsx`

**Interfaces:**
- Consumes: `Checkpoint.survey_activity_id` (Task 2).
- Produces: `createCheckpoint(event, name, day, activityId = null, surveyId: string | null = null)`; `setCheckpointSurvey(id: string, eventId: string, surveyId: string | null): Promise<void>`; `setCheckpointSurveyAction(eventId: string, checkpointId: string, fd: FormData)` reading `survey_activity_id` ("" = none), redirecting to settings with a flash.

- [ ] **Step 1:** New-checkpoint form: a "Survey after check-in" select (`name="survey_activity_id"`, default "None"), listing `listActivities(ev.id, "submission")`, shown only when the event has at least one; help text: "Crew are offered this form on their device right after they scan someone in."
- [ ] **Step 2:** `addCheckpointAction` checks the posted id is one of this event's submission activities (same shape as the booking check; refuse "That form no longer exists.") and passes it to `createCheckpoint`.
- [ ] **Step 3:** `setCheckpointSurveyAction` (requireEventAccess, same check, checkpoint must be in this event) → `setCheckpointSurvey` → revalidate settings + overview → flash "Survey updated." / "Survey removed."
- [ ] **Step 4:** `CheckpointList`: new prop `surveyNames: Record<string, string>` and `surveyForm: (c: Checkpoint) => React.ReactNode` (rendered by the page, holding the select pre-set to the current survey and a Save button bound to `setCheckpointSurveyAction`). Badge `Survey: <name>` after the booking badge. RowActions gets `dialog={{ label: "Survey…", title: "Survey after check-in", form: surveyForm(c) }}` when the event has submission activities.
- [ ] **Step 5:** `npx tsc --noEmit` and `npm run lint` clean.
- [ ] **Step 6: Browser check** on the test event: create a checkpoint with a survey (badge shows), change it via ⋯ → Survey…, remove it (badge gone); a tampered id is refused.
- [ ] **Step 7: Commit** `feat(door-survey): link a survey to a checkpoint (D761)`.

### Task 4: Server — survey state on the scan, door submit action (D762)

**Files:**
- Create: `src/lib/door-survey.ts`
- Modify: `src/app/scan/[eventId]/actions.ts`
- Test: `tests/door-survey.test.ts`

**Interfaces:**
- Consumes: `submitAnswers(..., checkpointId)` (Task 2), `Checkpoint.survey_activity_id`.
- Produces:
  - `src/lib/door-survey.ts` (no server-only imports, so the scanner can use it):
    - `type DoorSurveyState = { activityId: string; done: boolean; needsConsent: boolean }`
    - `offersSurvey(status: "ok" | "duplicate" | "notfound" | "error" | "undone" | "not_booked"): boolean` — true for `ok` and `duplicate` only.
    - `doorSurveyRefusal(x: { hasSurvey: boolean; checkedInHere: boolean; cancelled: boolean; activityMatches: boolean }): string | null` — the crew-facing refusal, or null when allowed. Copy: no survey → "This door has no survey."; activity mismatch → "This door has no survey." ; not checked in here → "Scan them in at this door first."; cancelled → "This registration was cancelled."
  - `ScanResult.survey?: DoorSurveyState` — set on every `ok` and both `duplicate` returns (`actions.ts:81` and the one after `recordCheckin`) when the checkpoint has a survey. `done` = a live (`status = "submitted"`) entry exists (`entriesForAttendee`); `needsConsent` = activity `health_data` and no `hasHealthConsent`.
  - `submitDoorSurveyAction(eventId: string, checkpointId: string, attendeeId: string, fd: FormData, crewToken?: string): Promise<{ ok: true } | { ok: false; error: string }>`.

- [ ] **Step 1: Failing tests** in `tests/door-survey.test.ts`:
```ts
expect(["ok", "duplicate", "notfound", "error", "undone", "not_booked"].filter(offersSurvey)).toEqual(["ok", "duplicate"]);
expect(doorSurveyRefusal({ hasSurvey: true, checkedInHere: true, cancelled: false, activityMatches: true })).toBeNull();
expect(doorSurveyRefusal({ hasSurvey: false, checkedInHere: true, cancelled: false, activityMatches: true })).toBe("This door has no survey.");
expect(doorSurveyRefusal({ hasSurvey: true, checkedInHere: false, cancelled: false, activityMatches: true })).toBe("Scan them in at this door first.");
expect(doorSurveyRefusal({ hasSurvey: true, checkedInHere: true, cancelled: true, activityMatches: true })).toBe("This registration was cancelled.");
expect(doorSurveyRefusal({ hasSurvey: true, checkedInHere: true, cancelled: false, activityMatches: false })).toBe("This door has no survey.");
```
- [ ] **Step 2:** `npx vitest run tests/door-survey.test.ts` → FAIL.
- [ ] **Step 3:** Implement `src/lib/door-survey.ts`, then the action: `authorise` (same as check-in, so the crew rate limit applies); refuse archived / check-in off as `doCheckin` does; `getCheckpoint`; `getActivity(checkpoint.survey_activity_id, ev.id)` must be kind `submission` (`activityMatches`); `getAttendee` in this event; `getCheckin(checkpointId, attendeeId)`; `doorSurveyRefusal`. Health consent: when `health_data` and no consent on file, require `healthConsentTicked(fd)` (refuse with `HEALTH_CONSENT_REFUSED`) then `recordHealthConsent`. Then `readAnswers(activity, fd)` and `saveOrDiscard(... submitAnswers(activity.id, attendee.id, answers, nowInKL().date, null, hashes, checkpoint.id))`, `discardUploads` on a refusal, map codes with `t("en").submission.result` except `limit` → "They've already filled this survey." Return `{ ok: false, error }` on any refusal — never throw to the client, never return answers.
- [ ] **Step 4:** Tests PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(door-survey): survey state on scans + door submit action (D762)`.

### Task 5: Scanner — Fill survey / Skip and the survey screen (D763)

**Files:**
- Create: `src/app/scan/[eventId]/DoorSurvey.tsx`
- Modify: `src/app/scan/[eventId]/Scanner.tsx`, `src/app/scan/[eventId]/page.tsx`, `src/app/crew/[token]/page.tsx`

**Interfaces:**
- Consumes: `ScanResult.survey`, `offersSurvey`, `submitDoorSurveyAction` (Task 4); `SubmissionFields` (Task 1); `HealthConsentField`.
- Produces: `type DoorSurveyForm = Pick<Activity, "id" | "name" | "description" | "questions" | "health_data">`; `Scanner` gains optional prop `survey?: DoorSurveyForm`; both pages load it with `getActivity(active.survey_activity_id, ev.id)` when set and of kind `submission`.

- [ ] **Step 1:** Result card: when `offersSurvey(result.status) && result.survey && survey`: `done` → a line "Survey done" (CircleCheck); else two buttons, **Fill survey** (primary) and **Skip** (outline; clears `result.survey` locally so the buttons go). Undo keeps working beside them.
- [ ] **Step 2:** `DoorSurvey` component: `fixed inset-0 z-50 overflow-y-auto bg-background`, header "Survey · <attendee name>", the activity name and description (render as `SubmissionBody` does), `HealthConsentField` when `result.survey.needsConsent`, `SubmissionFields questions={survey.questions}`, sticky footer with **Submit** and **Skip**. Keyed by attendee id so a new person never inherits state. Submit posts the `FormData` to `submitDoorSurveyAction`; while pending, buttons disabled; on `{ ok: false }` show the error above the buttons and keep the form; on `{ ok: true }` close, set the result's `survey.done = true` so the card reads "Survey done", vibrate once. Skip closes without a call.
- [ ] **Step 3:** While the survey screen is open, `scanText` returns early (a `surveyOpenRef` checked first, before the busy check), so neither the camera nor the hand scanner records anyone. The hand-scanner keydown listener must not swallow typing inside the form: skip `onKey` when the survey is open.
- [ ] **Step 4:** `npx tsc --noEmit`, `npm run lint`, `npm test` all clean.
- [ ] **Step 5: Browser check** (prod launch config if dialogs/timers misbehave in dev — see popups memory note) on the test event, as admin and via the crew link, at an ordinary door and a booking door: scan → Fill survey → submit → "Survey done"; re-scan → "Already in" + "Survey done"; Skip → re-scan offers it again; health consent box shown first time only; a refusal (set max 1, submit from two tabs) shows in the form; scanning a badge while the form is open does nothing; tick boxes work; the entry in the admin submissions list.
- [ ] **Step 6: Commit** `feat(door-survey): fill or skip the survey on the scanner (D763)`.

### Task 6: Submissions list mark + wrap-up (D764)

**Files:**
- Modify: `src/features/activities/kinds/submission/SubmissionTable.tsx:122`
- Modify: `docs/superpowers/specs/2026-10-30-door-survey-design.md` (consent call: the existing `HealthConsentField` is already EN + BM, so no language work)

- [ ] **Step 1:** Under the attendee in the admin table, beside "Added by …": `checkpoint_id` set → "At the door".
- [ ] **Step 2:** Undo after a saved survey: confirm the check-in goes and the submission stays, no error.
- [ ] **Step 3:** `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean.
- [ ] **Step 4: Commit** `feat(door-survey): mark door entries in the submissions list (D764)`, then the whole-branch review.
