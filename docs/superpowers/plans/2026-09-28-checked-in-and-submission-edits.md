# Portal "Checked in" + Submission Edit/Revoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** This plan builds two features.
- Part A: the attendee portal shows "Checked in" on a booked activity once they were scanned at its booking door.
- Part B: admins can edit a submission's answers and revoke a submission so the attendee can resubmit.

**Architecture:** Part A reads the attendee's booking-door check-ins alongside their activity entries. A pure matcher, `sessionArrivals`, turns them into a per-session arrival map. The card, the section and the activity page read that map.

Part B keeps submissions append-only in shape but gives `status` two values, `submitted` and `revoked`, with audit columns. Only `submitted` rows count, both in the database (the RPC and the partial unique index) and in every reader. Admin edits go through the same `validateAnswers` as the portal.

**Tech Stack:** Next.js 16 app router (server components + server actions), Supabase (service-role client, plpgsql RPCs), Tailwind + shadcn/Base UI, vitest.

**Specs:** Read both first; they are the binding authority.
- Part A: `docs/superpowers/specs/2026-09-28-portal-checked-in-design.md` (D333–D336)
- Part B: `docs/superpowers/specs/2026-09-28-submission-edit-revoke-design.md` (D337–D342)

## Global Constraints

- **Next.js:** read `AGENTS.md`. This Next.js differs from training data. Use only APIs already used in this repo: server actions, `revalidatePath`, `redirect`, and `flashPath` from `@/lib/flash`.
- **Git and deploys:**
  - Work on `main` and commit locally only. No `git pull`, `git push` or `git rebase`; the controller pushes at the end.
  - Never stage `docs/superpowers/specs/2026-09-27-intro-video-design.md`. Never use `git add -A` or `git add .`.
  - Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Test data:**
  - Never read-modify or write anything in the event with slug `ecphub` (id 3fbf681f-9ee0-49b6-b522-5063c36d39a2), which is live.
  - Test only on `ecpkom` (id 4e64a90c-728c-4a08-af62-8c8046afa0c9).
  - Never type a password in the browser.
- **Database:** access goes through the service-role client only. The controller applies migrations with the Supabase MCP; implementers only write the file.
- **Copy (exact strings):**
  - `"Checked in"`
  - `"Checked in at {HH:MM} · {sessionLabel}"` (e.g. "Checked in at 10:31 · Wed 30 Sep · 10:30")
  - `"You've already checked in to this session."`
  - `"Edit answers"`
  - `"Revoke"` (confirm button reads "Yes, revoke")
  - `"Revoked"`
  - `"Edited"`
  - `"Updated by the organiser"`
  - `"{Name} submitted twice on {Wed 30 Sep}, so this can't become once a day. Revoke one of them first."`
- **Time:** Malaysian time comes from `nowInKL()`, and clock text from `shortTime(iso)`, both in `src/lib/time.ts` / `src/lib/text.ts`.
- **Commands:**
  - Typecheck: `npx tsc --noEmit -p .`
  - Tests: `npx vitest run`
  - Lint the files you touched: `npx eslint <files>`
  - Build: `npm run build`

---

## Part A — "Checked in" on the portal

### Task 1: Arrivals, the card and the section

**Files:**
- Modify: `src/lib/booking-door.ts` (add `sessionArrivals`)
- Modify: `src/lib/db/checkins.ts` (add `bookingArrivalsFor`)
- Modify: `src/lib/activity-card.ts` (`BookingCardInput.checkedIn`, "Checked in" state)
- Modify: `src/lib/portal-activities.ts` (`bookingSection(state, pending, checkedIn)`)
- Modify: `src/lib/portal-activity-entries.ts` (`ActivityEntry.arrivals`, load them)
- Modify: `src/lib/activity-cards.ts` (pass `checkedIn`, place Done bookings)
- Tests: `tests/booking-door.test.ts`, `tests/activity-card.test.ts`, `tests/portal-activities.test.ts`, `tests/activity-cards.test.ts`

**Interfaces:**
- Produces:
  - `type Arrival = { activity_id: string; day: string; scanned_at: string }`, exported from `src/lib/booking-door.ts`
  - `sessionArrivals(held: Pick<ActivitySession, "id" | "activity_id" | "day">[], arrivals: Arrival[]): Record<string, string>`, mapping session id to the earliest `scanned_at`
  - `bookingArrivalsFor(attendeeId: string): Promise<Arrival[]>`
  - `ActivityEntry = { state; controls; pendingId; arrivals: Record<string, string> }`
  - `BookingCardInput = { state; pending; checkedIn: boolean }`
  - `bookingSection(state, pending, checkedIn = false)`
  - `allCheckedIn(entry: { controls: Pick<ActivityControls, "held">; arrivals: Record<string, string> }): boolean`, exported from `src/lib/booking-door.ts`. It must stay in that pure module: `portal-activity-entries.ts` imports server-only database modules, and `activity-cards.ts` and its tests cannot import from it at runtime.

- [ ] **Step 1: Failing tests.**

Append to `tests/booking-door.test.ts`, adding `sessionArrivals` to its import:

```ts
describe("sessionArrivals (D333)", () => {
  const held = [
    { id: "s1", activity_id: "a1", day: "2026-09-30" },
    { id: "s2", activity_id: "a1", day: "2026-10-01" },
  ];
  it("matches an arrival by activity and day, earliest first", () => {
    expect(sessionArrivals(held, [
      { activity_id: "a1", day: "2026-09-30", scanned_at: "2026-09-30T02:09:00+00:00" },
      { activity_id: "a1", day: "2026-09-30", scanned_at: "2026-09-30T02:01:00+00:00" },
    ])).toEqual({ s1: "2026-09-30T02:01:00+00:00" });
  });
  it("ignores another activity's door and another day", () => {
    expect(sessionArrivals(held, [
      { activity_id: "a2", day: "2026-09-30", scanned_at: "2026-09-30T02:00:00+00:00" },
      { activity_id: "a1", day: "2026-10-02", scanned_at: "2026-10-02T02:00:00+00:00" },
    ])).toEqual({});
  });
});
```

Append to `tests/activity-card.test.ts`. Its `booking(over, pending)` helper builds the input; add `checkedIn: false` to the helper's returned object so it compiles, and take a third parameter `checkedIn = false`:

```ts
describe("bookingCard — checked in (D334)", () => {
  const held = { held: 1, sessions: [seat("2026-09-28", "12:30", 3, true), seat("2026-09-29", "09:00", 1)] };
  it("says Checked in, keeping the booked slot as the meta line", () => {
    const v = bookingCard(booking(held, false, true));
    expect(v.status).toEqual({ label: "Checked in", tone: "success" });
    expect(v.meta).toEqual(bookingCard(booking(held)).meta);
  });
  it("wins over a waiting request", () => {
    expect(bookingCard(booking(held, true, true)).status).toEqual({ label: "Checked in", tone: "success" });
  });
  it("is Booked when not checked in", () => {
    expect(bookingCard(booking(held)).status).toEqual({ label: "Booked", tone: "success" });
  });
});
```

Append to `tests/portal-activities.test.ts`:

```ts
describe("bookingSection — checked in (D335)", () => {
  it("moves a checked-in booking to Done, even with a request open", () => {
    expect(bookingSection(state({}, ["s1"]), false, true)).toBe("done");
    expect(bookingSection(state({}, ["s1"]), true, true)).toBe("done");
  });
  it("leaves it under Booked when not checked in", () => {
    expect(bookingSection(state({}, ["s1"]), false, false)).toBe("booked");
  });
});
```

In `tests/activity-cards.test.ts`:
- Extend its `booking(...)` entry helper with `arrivals: {}` (or `{ [heldSessionId]: "2026-09-30T02:00:00+00:00" }` when a new `checkedIn` parameter is true).
- Add a test that a checked-in booking sorts after open forms and before Done passports.
- Read that file's helpers first and follow them exactly.

- [ ] **Step 2: Run them.** Run `npx vitest run tests/booking-door.test.ts tests/activity-card.test.ts tests/portal-activities.test.ts tests/activity-cards.test.ts`. Expected: FAIL (missing export / wrong status).

- [ ] **Step 3: `sessionArrivals`.** Append to `src/lib/booking-door.ts`:

```ts
/** One check-in at a booking door, as the portal reads it (D333). */
export type Arrival = { activity_id: string; day: string; scanned_at: string };

/**
 * When the attendee arrived for each session they hold: an arrival at a door of that session's
 * activity on its day (D333, the per-door-per-day rule of D328). Earliest wins. Sessions with
 * no arrival are absent.
 */
export function sessionArrivals(held: Pick<ActivitySession, "id" | "activity_id" | "day">[], arrivals: Arrival[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of held) {
    for (const a of arrivals) {
      if (a.activity_id !== s.activity_id || a.day !== s.day) continue;
      if (!out[s.id] || a.scanned_at < out[s.id]) out[s.id] = a.scanned_at;
    }
  }
  return out;
}
```

- [ ] **Step 4: The reader.** Append to `src/lib/db/checkins.ts`, importing the `Arrival` type from `@/lib/booking-door`:

```ts
/**
 * This attendee's check-ins at booking doors (D333): their check-ins, then which of those doors
 * stand for an activity. Two small queries; an attendee has a handful of check-ins.
 */
export async function bookingArrivalsFor(attendeeId: string): Promise<Arrival[]> {
  const db = serviceClient();
  const { data: rows, error } = await db.from("checkins").select("checkpoint_id, scanned_at").eq("attendee_id", attendeeId);
  if (error) throw error;
  const ids = [...new Set((rows ?? []).map((r) => r.checkpoint_id as string))];
  if (ids.length === 0) return [];
  const { data: doors, error: e2 } = await db.from("checkpoints").select("id, activity_id, day").in("id", ids).not("activity_id", "is", null);
  if (e2) throw e2;
  const byId = new Map((doors ?? []).map((d) => [d.id as string, d as { activity_id: string; day: string }]));
  return (rows ?? []).flatMap((r) => {
    const d = byId.get(r.checkpoint_id as string);
    return d ? [{ activity_id: d.activity_id, day: d.day, scanned_at: r.scanned_at as string }] : [];
  });
}
```

- [ ] **Step 5: Load them into the entries.** In `src/lib/portal-activity-entries.ts`:
  - **Signature:** change it to `loadActivityEntries(event: Pick<Event, "id" | "check_in_enabled">, attendee)`. Check every caller still passes a full event; they do.
  - **Load:** add `event.check_in_enabled ? bookingArrivalsFor(attendee.id) : Promise.resolve([])` to the `Promise.all`.
  - **Map:** for each booking entry, compute `arrivals: sessionArrivals(controls.held.map((h) => h.session), found)`.
  - **Type:** `ActivityEntry` becomes `{ state: ActivityState; controls: ActivityControls; pendingId: string | null; arrivals: Record<string, string> }`.
  - **Helper:** add to `src/lib/booking-door.ts` (pure; `import type { ActivityControls } from "@/lib/activity-requests"`) and export

```ts
/** D334: every session they hold has an arrival. False when nothing is held. */
export function allCheckedIn(entry: { controls: Pick<ActivityControls, "held">; arrivals: Record<string, string> }): boolean {
  return entry.controls.held.length > 0 && entry.controls.held.every((h) => Boolean(entry.arrivals[h.session.id]));
}
```

  Check first that `src/lib/activity-requests.ts` is pure (no `server-only` or `@/lib/db` imports). If it is not, declare the `held` shape inline as `{ held: { session: { id: string } }[] }` instead.

  Add a test in `tests/booking-door.test.ts`: true when every held session has an arrival; false for none held; false when one of two is missing.

- [ ] **Step 6: Card and section.**
  - **`src/lib/activity-card.ts`:**
    - `BookingCardInput` gains `/** Every held session has an arrival at its door (D334). */ checkedIn: boolean;`.
    - In `bookingCard`, before the `pending` line, add `if (checkedIn && state.held > 0) return { status: { label: "Checked in", tone: "success" }, meta: booked, action: view };`, with a one-line comment: "Attended outranks a waiting request: once they have been, the request is moot (D334)."
  - **`src/lib/portal-activities.ts`:** add a third parameter to `bookingSection`, `checkedIn = false`. Insert `if (checkedIn && state.held > 0) return "done";` after the `eligible` check, with the comment "D335: done like a full passport, below what still needs attention".
  - **`src/lib/activity-cards.ts`:**
    - Compute `const checkedIn = allCheckedIn(entry);`, importing `allCheckedIn` from `@/lib/booking-door`.
    - Pass it to both `bookingSection(entry.state, pending, checkedIn)` and `bookingCard({ state: entry.state, pending, checkedIn })`.
    - In the returned order, insert `...inSection("done")` before `...passports.filter((p) => p.section === "done")`.

- [ ] **Step 7: Run the tests, then typecheck, lint and run the full suite.**
  - `npx vitest run tests/booking-door.test.ts tests/activity-card.test.ts tests/portal-activities.test.ts tests/activity-cards.test.ts` → PASS.
  - `npx tsc --noEmit -p .`: fix any other constructions of `ActivityEntry` or `BookingCardInput` in tests by adding `arrivals: {}` / `checkedIn: false`.
  - `npx eslint` on the touched files.
  - `npx vitest run` → PASS.

- [ ] **Step 8: Commit.**

```bash
git add src/lib/booking-door.ts src/lib/db/checkins.ts src/lib/activity-card.ts src/lib/portal-activities.ts src/lib/portal-activity-entries.ts src/lib/activity-cards.ts tests/booking-door.test.ts tests/activity-card.test.ts tests/portal-activities.test.ts tests/activity-cards.test.ts
git commit -m "feat(portal): a booked activity says Checked in once they arrive at its door (D333-D335)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The activity page, and refusing requests after check-in

**Files:**
- Modify: `src/app/e/[slug]/a/[token]/activities/[activityId]/page.tsx` (`BookingBody`)
- Modify: `src/components/portal/ActivityBooking.tsx`
- Modify: `src/app/e/[slug]/a/[token]/activities/actions.ts` (`requestSwitchAction`, `requestCancelAction`, `ASK_REFUSALS`)

**Interfaces:**
- Consumes, from Task 1: `ActivityEntry.arrivals`; `allCheckedIn` and `sessionArrivals` from `@/lib/booking-door`; `bookingArrivalsFor` from `@/lib/db/checkins`.
- Produces: `ActivityBooking` gains the prop `arrivals: Record<string, string>`.

- [ ] **Step 1: `ActivityBooking`.** Add the prop `arrivals: Record<string, string>` (session id → ISO). In the `held.map` row, when `arrivals[seat.session.id]` is set:
  - The label reads `Checked in at {shortTime(arrivals[seat.session.id])} · {sessionLabel(seat.session)}`. Keep the check icon and the success colours.
  - The right-hand `<span>` renders nothing: no calendar link, no `change`, no Ask to cancel.

  Then set `const allIn = held.length > 0 && held.every((s) => arrivals[s.session.id]);` and hide the trailing "To move, tap Change session…" `<p>` when `allIn`.

- [ ] **Step 2: `BookingBody`.**
  - Destructure `arrivals` from the entry, pass it to `ActivityBooking`, and compute `const done = allCheckedIn({ controls, arrivals });`.
  - When `done`, do not render the sticky Add to calendar block and do not pass a `change` dialog: pass `change={null}` when `single` is set.

- [ ] **Step 3: The server refusal (D336).** In `src/app/e/[slug]/a/[token]/activities/actions.ts`:
  - Add `checkedIn: "You've already checked in to this session."` to `ASK_REFUSALS`.
  - In both `requestSwitchAction` and `requestCancelAction`, right after the `holds` check, add

```ts
  // D336: a session they have attended is finished; a stale page must not reopen it.
  const arrived = sessionArrivals([from], event.check_in_enabled ? await bookingArrivalsFor(attendee.id) : []);
  if (arrived[from.id]) redirect(flashPath(path, ASK_REFUSALS.checkedIn, "error"));
```

  Import `sessionArrivals` from `@/lib/booking-door` and `bookingArrivalsFor` from `@/lib/db/checkins`.

- [ ] **Step 4: Typecheck, lint, test.** Run:
  - `npx tsc --noEmit -p .`
  - `npx eslint` on the three files
  - `npx vitest run`

  Expected: clean, PASS.

- [ ] **Step 5: Browser check on `ecpkom`.** Setup is by `execute_sql`, on ecpkom only; record every id you create in your report:
  - a booking activity, e.g. "Portal Check-in Test", `kind='booking'`, `is_open=true`, `max_per_attendee=1`;
  - one session today;
  - a booking for one attendee;
  - a booking-door checkpoint (`activity_id` set, today's date).
  - Get that attendee's `token`; the portal is `/e/ecpkom/a/<token>`. Then check:
    - **Before check-in:** the Activities tab card says "Booked", under Booked.
    - **Check in:** use the scanner, or insert a `checkins` row for the door.
    - **After reload:** the card says "Checked in" and sits under Done. The home row card says "Checked in". The activity page line reads "Checked in at HH:MM · …", with no calendar, change or cancel, and no sticky calendar button.
    - **The refusal:** from a tab opened before the check-in (a stale page), tap Ask to cancel. The flash reads "You've already checked in to this session."
  - Leave the data in place; the controller removes it.

- [ ] **Step 6: Commit.**

```bash
git add "src/app/e/[slug]/a/[token]/activities/[activityId]/page.tsx" src/components/portal/ActivityBooking.tsx "src/app/e/[slug]/a/[token]/activities/actions.ts"
git commit -m "feat(portal): a checked-in session is finished on its page; requests refused (D336)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Part B — Admin edit and revoke of submissions

### Task 3: Status, the database, and every reader counting only live rows

**Files:**
- Create: `supabase/migrations/0053_submission_status.sql` (the controller applies it)
- Modify: `src/lib/types.ts` (`ActivitySubmission`)
- Modify: `src/lib/db/activities.ts` (readers filter; `getSubmission`, `updateSubmissionAnswers`, `revokeSubmission`)
- Modify: `src/lib/submissions.ts` (`liveSubmissions`, `perDayCollision`)
- Modify: `src/app/admin/events/[id]/activities/actions.ts` (the per-day pre-check in `saveSubmissionActivityAction`)
- Modify: `src/app/admin/events/[id]/activities/[activityId]/page.tsx` (`SubmissionDetail` counts on live rows)
- Tests: `tests/submissions.test.ts`

**Interfaces:**
- Produces:
  - `ActivitySubmission.status: "submitted" | "revoked"`, plus `revoked_at: string | null`, `revoked_by: string | null`, `edited_at: string | null`, `edited_by: string | null`
  - `liveSubmissions<T extends Pick<ActivitySubmission, "status">>(subs: T[]): T[]`
  - `perDayCollision(subs: Pick<ActivitySubmission, "attendee_id" | "submitted_on" | "status">[]): { attendeeId: string; day: string } | null`
  - `getSubmission(id: string): Promise<ActivitySubmission | null>`
  - `updateSubmissionAnswers(id: string, activityId: string, answers: Record<string, string>, userId: string): Promise<boolean>`
  - `revokeSubmission(id: string, activityId: string, userId: string): Promise<boolean>`

- [ ] **Step 1: The migration file** `supabase/migrations/0053_submission_status.sql`. Write it with:
  - the spec's `alter table` and index statements, verbatim;
  - then `create or replace function submit_answers(...)`, copied from `supabase/migrations/0048_category_parts_in_writes.sql` (the whole function, with its exception handler), changing only the two `select`s against `activity_submissions`: each gains `and status = 'submitted'`.

  Head it with a comment: D338/D339 — revoke is a status, and only submitted rows count toward the limit, the day, and the one-a-day index. Do NOT apply it; the controller does.

- [ ] **Step 2: Failing tests.** Append to `tests/submissions.test.ts`, importing `liveSubmissions` and `perDayCollision`:

```ts
describe("liveSubmissions / perDayCollision (D339, D342)", () => {
  const row = (id: string, attendee_id: string, day: string, status: "submitted" | "revoked" = "submitted") =>
    ({ ...sub(day), id, attendee_id, status });
  it("drops revoked rows", () => {
    expect(liveSubmissions([row("1", "a1", "2026-09-28"), row("2", "a1", "2026-09-28", "revoked")]).map((s) => s.id)).toEqual(["1"]);
  });
  it("finds two live rows from one attendee on one day", () => {
    expect(perDayCollision([row("1", "a1", "2026-09-28"), row("2", "a2", "2026-09-28"), row("3", "a1", "2026-09-28")]))
      .toEqual({ attendeeId: "a1", day: "2026-09-28" });
  });
  it("does not count a revoked duplicate", () => {
    expect(perDayCollision([row("1", "a1", "2026-09-28"), row("2", "a1", "2026-09-28", "revoked")])).toBeNull();
  });
});
```

  The `sub()` helper in that file builds an `ActivitySubmission`; extend it with `revoked_at: null, revoked_by: null, edited_at: null, edited_by: null` once the type changes.

- [ ] **Step 3: Run them.** Run `npx vitest run tests/submissions.test.ts`. Expected: FAIL (missing exports).

- [ ] **Step 4: Types and pure helpers.**
  - **`src/lib/types.ts`:** set `ActivitySubmission.status: "submitted" | "revoked"` and replace its D170 comment with "D338: revoked rows stay for the record but never count (D339)". Add the four audit fields, `string | null`, each with a one-line comment.
  - **`src/lib/submissions.ts`:** add

```ts
/** The rows that count (D339): every reader of "who submitted" goes through this. */
export function liveSubmissions<T extends Pick<ActivitySubmission, "status">>(subs: T[]): T[] {
  return subs.filter((s) => s.status === "submitted");
}

/** D342: the first attendee with two live rows on one day — what makes once-a-day impossible. */
export function perDayCollision(subs: Pick<ActivitySubmission, "attendee_id" | "submitted_on" | "status">[]): { attendeeId: string; day: string } | null {
  const seen = new Set<string>();
  for (const s of liveSubmissions(subs)) {
    const k = `${s.attendee_id}|${s.submitted_on}`;
    if (seen.has(k)) return { attendeeId: s.attendee_id, day: s.submitted_on };
    seen.add(k);
  }
  return null;
}
```

- [ ] **Step 5: DB helpers** in `src/lib/db/activities.ts`:
  - `listSubmissions` and `submissionsForAttendee` add `.eq("status", "submitted")`, with the comment "revoked rows never count and never reach an attendee (D339, D341)".
  - `submissionsForActivity` stays as it is, returning all rows; say so in its comment ("the admin table shows revoked rows too, D340").
  - Add:

```ts
export async function getSubmission(id: string): Promise<ActivitySubmission | null> {
  const { data, error } = await serviceClient().from("activity_submissions").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as ActivitySubmission | null;
}

/** D337. Only a live row can be edited; false when it was revoked or is gone. */
export async function updateSubmissionAnswers(id: string, activityId: string, answers: Record<string, string>, userId: string): Promise<boolean> {
  const { data, error } = await serviceClient().from("activity_submissions")
    .update({ answers, edited_at: new Date().toISOString(), edited_by: userId })
    .eq("id", id).eq("activity_id", activityId).eq("status", "submitted").select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** D338. Status, not a delete: the row and its files stay. False when already revoked or gone. */
export async function revokeSubmission(id: string, activityId: string, userId: string): Promise<boolean> {
  const { data, error } = await serviceClient().from("activity_submissions")
    .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: userId })
    .eq("id", id).eq("activity_id", activityId).eq("status", "submitted").select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
```

- [ ] **Step 6: The per-day pre-check (D342).** In `saveSubmissionActivityAction`, before `syncSubmissionPerDay`, when `policy.per_day && !current.per_day`:
  - Load `submissionsForActivity(activityId)` and run `perDayCollision`.
  - If it finds one, look up the attendee's name with `getAttendee(attendeeId)` and redirect, deleting a just-uploaded image first exactly as the existing catch does, with `` `${name} submitted twice on ${shortDate(day)}, so this can't become once a day. Revoke one of them first.` ``.
  - Keep the existing `isPerDayCollision` catch as the race backstop, but change its message's last sentence to "Revoke the extra submission first."

- [ ] **Step 7: `SubmissionDetail` counts on live rows.**
  - Compute `const live = liveSubmissions(submissions);`.
  - Use `live` for `missingFrom`, `participation`, the tabs' `submissions` count and the header subtitle's count.
  - Pass all `submissions` to `SubmissionTable`; Task 4 renders revoked rows.
  - Check `src/app/admin/events/[id]/activities/page.tsx` and the `submissions.xlsx` export: both read `listSubmissions`, which now returns only live rows. Confirm that by reading them; no change should be needed.

- [ ] **Step 8: Typecheck, lint, test.** Run:
  - `npx tsc --noEmit -p .`: every other `ActivitySubmission` literal in tests needs the four new fields.
  - `npx eslint` on the touched files
  - `npx vitest run`

  Expected: PASS.

- [ ] **Step 9: Commit.**

```bash
git add supabase/migrations/0053_submission_status.sql src/lib/types.ts src/lib/db/activities.ts src/lib/submissions.ts "src/app/admin/events/[id]/activities/actions.ts" "src/app/admin/events/[id]/activities/[activityId]/page.tsx" tests/submissions.test.ts
git commit -m "feat(submissions): revoked is a status that never counts; per-day refusal names the case (D338, D339, D342)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

  Add to the commit any other test files you had to touch for the type change.

---

### Task 4: Admin edit and revoke in the Submissions tab

**Files:**
- Modify: `src/components/portal/SubmissionFields.tsx` (`defaults`, `fileLinks`)
- Modify: `src/app/admin/events/[id]/activities/actions.ts` (`editSubmissionAction`, `revokeSubmissionAction`)
- Modify: `src/components/admin/SubmissionTable.tsx` (⋯ menu, Revoked/Edited display)
- Modify: `src/app/admin/events/[id]/activities/[activityId]/page.tsx` (pass the bound actions and the admin names)

**Interfaces:**
- Consumes, from Task 3: `getSubmission`, `updateSubmissionAnswers`, `revokeSubmission`, `ActivitySubmission` audit fields.
- Produces:
  - `SubmissionFields({ questions, defaults?, fileLinks? })`
  - `editSubmissionAction(eventId, activityId, submissionId, fd)`
  - `revokeSubmissionAction(eventId, activityId, submissionId)`
  - `SubmissionTable` props gain `edit: (submissionId: string, fd: FormData) => Promise<void>`, `revoke: (submissionId: string) => Promise<void>` and `adminNames: Record<string, string>`.

- [ ] **Step 1: `SubmissionFields` pre-fill.**
  - **New props:** `defaults?: Record<string, string>` (question key → answer) and `fileLinks?: Record<string, string | null>` (key → signed URL of the current file).
  - **Initial state:** seed the `show_when` state with `defaults ?? {}`, so conditional questions open correctly.
  - **Non-file fields:** render with `defaultValue={defaults?.[q.key] ?? ""}`.
  - **File questions, when `defaults` holds a value:**
    - Show above the input a line "Current file: View file", linking `fileLinks[key]` (or "Unavailable" when null) in a new tab.
    - Make the input not `required`; leaving it empty keeps the current file.
    - Add the description "Choose a file only to replace it."
  - **The portal's own use** (no `defaults`) must render exactly as before.

- [ ] **Step 2: The actions** in `src/app/admin/events/[id]/activities/actions.ts`. Follow the file's existing patterns for `requireAdmin` + event, `submissionOf`, `flashPath` and `revalidatePath`. Read `submitAnswersAction` in the portal actions file for the upload/cleanup pattern.

`editSubmissionAction(eventId, activityId, submissionId, fd)`:
  1. Get `{ orgId, userId }` from `requireAdmin()`, then the event and `submissionOf(ev, activityId)`.
  2. Load `getSubmission(submissionId)`. If it is missing, belongs to another activity, or `status !== "submitted"`, flash "That submission can no longer be edited." (error).
  3. For each `file` question with a non-empty `File` in `fd`, upload it with the same `uploadSubmissionFile` call the portal uses, and use the new path as that key's input. Otherwise the input is the existing answer.
  4. For each other question, the input is `String(fd.get(key) ?? "")`.
  5. Run `validateAnswers(input, activity.questions)`. On `!ok`, delete the new uploads and flash the first error (error).
  6. Merge: `{ ...retired, ...result.answers }`, where `retired` holds the existing answers whose keys are not among the current questions (D337 keeps them).
  7. Call `updateSubmissionAnswers(...)`. If it returns false, delete the new uploads and flash "That submission was revoked while you were editing." (error).
  8. After success, delete replaced old file paths (non-empty and different from the new path) with `deleteSubmissionFiles`. Wrap that in try/catch: a leftover object must not fail the save.
  9. Revalidate the activity page and flash "Answers updated." back to `?tab=submissions`, using the existing `activityHref` / tab URL helper the page uses.

`revokeSubmissionAction(eventId, activityId, submissionId)`:
  1. Admin + event + `submissionOf`.
  2. Load the submission; if it is not found or not in this activity, flash "That submission no longer exists." (error).
  3. `revokeSubmission(...)`: if false, flash "That submission was already revoked." (error).
  4. Otherwise look up the attendee's name and flash `` `${name}'s submission is revoked. They can submit again${activity.is_open ? "." : " once it's open."}` `` back to the submissions tab.

- [ ] **Step 3: `SubmissionTable`.** It stays an async server component. It gains props `edit`, `revoke` and `adminNames` (user id → email, from the existing `scannerNames` in `@/lib/db/users`, built by the page from every row's `edited_by`/`revoked_by`).
  - **Actions column:** add a trailing header cell with a screen-reader label "Actions". Each **live** row renders `<RowActions name={`${who.name}'s submission`} edit={{ title: "Edit answers", form: <form action={edit.bind(null, s.id)} className="grid gap-4"><SubmissionFields questions={questions} defaults={s.answers} fileLinks={…signed links for file keys…} /><SubmitButton>Save answers</SubmitButton></form> }} remove={{ action: revoke.bind(null, s.id), label: "Revoke", message: "It stops counting and they can submit again. It stays here, marked Revoked." }} />`. Check `RowActions`' `edit` and `remove` props in `src/components/admin/RowActions.tsx`, and `SubmitButton` in `src/components/admin/SubmitButton.tsx`.
  - **Revoked rows:** the row is `opacity-60`, with no menu. Under the date, show `<Badge variant="secondary" title={`Revoked by ${adminNames[s.revoked_by] ?? "an admin"} on ${shortDateTime(s.revoked_at)}`}>Revoked</Badge>`.
  - **Edited rows:** under the date, show `<Badge variant="outline" title="Edited by … on …">Edited</Badge>`.
  - **Date cell:** stack the badge under the date.

- [ ] **Step 4: The page.** In `SubmissionDetail`:
  - Build `adminNames` with `scannerNames([...edited_by, ...revoked_by])`. Check its return shape; it is already used for `deciderEmails` in `BookingDetail`.
  - Pass `edit={editSubmissionAction.bind(null, ev.id, activity.id)}` and `revoke={revokeSubmissionAction.bind(null, ev.id, activity.id)}`.

- [ ] **Step 5: Typecheck, lint, test.** Run:
  - `npx tsc --noEmit -p .`
  - `npx eslint` on the touched files
  - `npx vitest run`

  Expected: PASS.

- [ ] **Step 6: Browser check on `ecpkom`.** If ecpkom has no submission activity, create one by SQL on ecpkom: `kind='submission'`, `is_open=true`, `max_per_attendee=1`, `per_day=false`, with `questions` holding one required text question and one optional file question. Copy the `questions` jsonb shape from `RegistrationQuestion`. Submit once from an attendee's portal (`/e/ecpkom/a/<token>`), including a small PNG. Then in the admin Submissions tab:
  - **Edit answers:**
    - The dialog is pre-filled.
    - Change the text and save. The flash reads "Answers updated.", the row shows the new text and an "Edited" badge, and the portal history shows the new answer.
    - Replace the file. The new file opens, and the old object is gone (check `storage.objects` by `name`).
  - **Revoke:**
    - Confirm "Yes, revoke". The row greys out with "Revoked", and the header count drops.
    - The portal no longer lists it and offers the form again. Submit again: a second, live row appears.
  - Leave the data; record every id you created.

- [ ] **Step 7: Commit.**

```bash
git add src/components/portal/SubmissionFields.tsx "src/app/admin/events/[id]/activities/actions.ts" src/components/admin/SubmissionTable.tsx "src/app/admin/events/[id]/activities/[activityId]/page.tsx"
git commit -m "feat(submissions): admins edit answers and revoke a submission from its row (D337, D340)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The attendee's note, the concurrency script, and a full pass

**Files:**
- Modify: `src/components/portal/SubmissionHistory.tsx`
- Modify: `scripts/submit-concurrency.mjs`

- [ ] **Step 1: The note (D341).** In `SubmissionHistory`, when `s.edited_at` is set, add a small muted line under the date in the card header: "Updated by the organiser".

- [ ] **Step 2: Concurrency scenario.** Add Scenario 3 to `scripts/submit-concurrency.mjs`, following its existing scenario structure: its own throwaway event, attendee and cleanup in `finally`.
  - A form with `max_per_attendee = 1` and `per_day = true`. Submit once → 'ok'.
  - `update activity_submissions set status = 'revoked'` on that row.
  - 20 simultaneous `submit_answers` for the same attendee and the same `p_today` → exactly one 'ok', the rest 'limit' or 'today'.
  - Exactly two rows exist: one revoked, one submitted.
  - Update the header comment's WHAT THIS PROVES.
  - Run `npm run check:submit` and paste the output into your report. It creates and deletes its own event, so it never touches ecphub or ecpkom.

- [ ] **Step 3: Full verification.** Run `npx tsc --noEmit -p .`, `npx eslint` on the touched files, `npx vitest run` and `npm run build` (stop any preview server first).

- [ ] **Step 4: Browser pass on `ecpkom`.**
  - Check that the portal history shows "Updated by the organiser" on the edited submission from Task 4.
  - Check the per-day refusal (D342): on the Task 4 submission activity, make one attendee have two live rows on one day. Temporarily raise `max_per_attendee` and insert a second row by SQL on ecpkom. Then tick "once a day" in Setup and save. The flash names the attendee and the day. Revoke one of the two and save again; it succeeds. Set it back afterwards.
  - Re-check Part A's portal card quickly.

- [ ] **Step 5: Commit.**

```bash
git add src/components/portal/SubmissionHistory.tsx scripts/submit-concurrency.mjs
git commit -m "feat(submissions): attendees see Updated by the organiser; concurrency proof covers resubmit after revoke (D341)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
