# Registration Limit, Waiting List and Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cap form registrations per event, queue the overflow on a first-come waiting list that fills freed places automatically, and optionally hold every registration for organiser approval.

**Architecture:** Waiting and pending people live in a new `registration_entries` table, never in `attendees`, so every existing attendee reader stays correct. All place-taking decisions (register / pending / waiting, filling freed places, moving in, approving, declining, leaving) are Postgres functions that lock the event row, so the last place cannot be taken twice. TypeScript calls them through one feature module (`src/features/registration-queue/`), then sends WhatsApp for whoever became registered.

**Tech Stack:** Next.js 16 App Router (read `AGENTS.md`), Supabase Postgres (`rpc`), TypeScript, Vitest (pure logic only, `tests/**/*.test.ts`, Node), node db-check scripts for SQL (`scripts/*-db-check.mjs`, run with `node --env-file=.env.local`).

**Spec:** `docs/superpowers/specs/2026-10-19-registration-limit-waitlist-design.md` (D677–D703). Read it before Task 1; where the approval amendment (D696–D703) differs from earlier sections, it wins.

## Global Constraints

- Only form registrations count: active attendees with `source = 'registration'` **plus** entries in state `pending` (D677, D697). Imports and admin adds never count and are never blocked.
- While a limit is set, the event is **full** when places taken ≥ limit **or** any entry is `waiting` (D691).
- Nothing moves automatically while registration is closed: `registration_open` false, `registration_closes_at` past, or event archived (D683). Organiser actions (Move in, Restore, Approve) work regardless (D685, D694, D699).
- With approval on, nothing becomes registered without an organiser: every move from the waiting list goes to `pending` (D701).
- An active attendee who submits the form is updated as today, never queued (D692). A cancelled person re-registering counts as new; becoming registered always sets `source = 'registration'` (D692).
- A returning person keeps their existing token (D695); an entry's token stays the same through every state change.
- WhatsApp: `ecphub_waitlist_moved_in` when someone becomes registered from the waiting list with approval off (D684); `ecphub_registration_approved` when an organiser approves (D699). Body {{1}} first name, {{2}} event name, button = token. No message on join, leave, remove, decline, or move into pending. A failed send never blocks the move.
- Events with no limit and approval off behave exactly as today.
- Decision numbers in comments: D677–D703 as the spec assigns them. Next migration: `0100`.
- New code lives in `src/features/registration-queue/` with `client.ts` (pure) and `index.ts` (server) entries (D403).
- Test on any event except slug `ecphub`; db-check scripts create and delete their own events.

## Review Focus

1. **Two people press Register for the last place at once** → exactly one registered, the other waiting. (Task 1 db-check, parallel calls.)
2. **A cancellation approved twice / two tabs** → one place freed, one person moved in. (Task 1 db-check: `fill_free_places` twice in parallel.)
3. **Organiser raises the limit while registration is closed** → nobody moves; on reopening, the queue fills first and a newcomer cannot jump it. (Task 1 db-check.)
4. **A waiting person opens a portal page URL directly** (e.g. `/e/slug/a/<token>/activities`) → sees only their waiting-list page, never portal content. (Task 3 browser check.)
5. **Person on the list re-submits the form** → answers updated, position unchanged. (Task 1 db-check.)

---

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/0100_registration_queue.sql` | event columns, `registration_entries`, all queue functions |
| `scripts/registration-queue-db-check.mjs` + `package.json` script `check:queue` | SQL evidence |
| `src/features/registration-queue/lib/rules.ts` | pure: open/full/labels/limit parsing |
| `src/features/registration-queue/db.ts` | rpc wrappers + entry reads |
| `src/features/registration-queue/notify.ts` | WhatsApp for newly registered people |
| `src/features/registration-queue/portal/*` | waiting / pending / declined / left card + leave action |
| `src/features/registration-queue/admin/*` | Waiting list and Pending approval tables + actions |
| register page/action, token layout, `/a/[token]`, done page, settings, attendees page, admin layout, cancel/delete/status/add/import actions | wiring |

---

### Task 1: Database — entries table and the queue functions

**Files:**
- Create: `supabase/migrations/0100_registration_queue.sql`, `scripts/registration-queue-db-check.mjs`
- Modify: `package.json` (add `"check:queue": "node --env-file=.env.local scripts/registration-queue-db-check.mjs"`)

**Interfaces — Produces** (plain `sql`/`plpgsql` functions run by the service role; `revoke execute ... from public, anon, authenticated` on each, as 0086 does):
- `events.registration_limit integer` (null = none, check `> 0`), `events.registration_needs_approval boolean not null default false`.
- Table `registration_entries`: `id uuid pk default gen_random_uuid()`, `org_id`, `event_id` (fk events on delete cascade), `token text not null`, `name text not null`, `email text not null` (lower-cased), `extra jsonb not null default '{}'`, `consented_at timestamptz`, `consent_notice text`, `terms_agreed_at timestamptz`, `state text not null check in ('waiting','pending','declined','left','removed','registered')`, `joined_at timestamptz not null default now()` (queue order), `decided_at timestamptz`, `attendee_id uuid` (fk attendees on delete set null), `created_at`, `updated_at`. Unique `(event_id, lower(email))` (one row per person per event, reused on return, D702). Unique `(token)`. RLS enabled, no policies (service role only), as 0097.
- `registration_places(p_event_id uuid) returns table(taken int, waiting int, pending int, lim int, full_ boolean, open_ boolean)` — `taken` = registration-source active attendees + pending entries; `full_` per D691; `open_` per D683.
- `register_or_queue(p_event_id uuid, p_name text, p_email text, p_extra jsonb, p_new_token text, p_consent_notice text, p_terms boolean) returns table(outcome text, token text, attendee_id uuid, entry_id uuid, position int)` — locks the event row (`select ... for update`). `outcome` ∈ `updated` (active attendee, D692: name and `extra || p_extra` updated, consent kept/terms re-stamped as today) · `waiting` · `pending` · `registered`. Re-submit of a waiting/pending entry updates name/extra/consent and keeps `joined_at` (D679). New decisions: full → `waiting`; else approval on → `pending`; else registered (insert attendee with `p_new_token`, or reactivate the cancelled row: `cancelled_at = null`, `cancel_reason = null`, `source = 'registration'`, `extra || p_extra`). Token for a new/returning entry: the cancelled attendee's token if one exists, else the person's existing entry token, else `p_new_token` (D695). Becoming registered stamps `consented_at`/`consent_notice` if null and `terms_agreed_at` if `p_terms`. `position` = 1-based place among `waiting` entries (null otherwise). `p_extra` arrives with blank answers already dropped.
- `fill_free_places(p_event_id uuid) returns table(entry_id uuid, attendee_id uuid, new_state text)` — no-op unless `open_`; while places are free and entries wait, takes the earliest `waiting` entry: approval on → `pending`; off → registered (create/reactivate attendee exactly as above, `state='registered'`, `attendee_id` set). With no limit, moves everyone waiting (D691 clear-limit case).
- `move_in_entry(p_entry_id uuid)` — organiser override from `waiting`: → `pending` (approval on) or registered (off); ignores limit and open. Same return shape as `fill_free_places` (one row, or none if not waiting).
- `approve_entry(p_entry_id uuid) returns table(attendee_id uuid)` — `pending` → registered. Works when closed.
- `decline_entry(p_entry_id uuid)` — `pending` → `declined`, then `perform`s the fill; returns the fill's rows.
- `leave_entry(p_event_id uuid, p_token text)` — `waiting`/`pending` → `left`; if it was pending, fills; returns the fill's rows.
- `remove_entry(p_entry_id uuid)` — `waiting` → `removed` (no fill: a waiting person held no place).
- `close_entry_for_attendee(p_event_id uuid, p_email text, p_attendee_id uuid)` — D693: an active `waiting`/`pending` entry with that email → `registered`, `attendee_id` set. Returns its token or null.
- Extend the personal-data purge: `purge_event_personal_data` (or the TS wrapper in Task 4) must delete the event's `registration_entries`.

- [ ] **Step 1: Write `scripts/registration-queue-db-check.mjs`** in the style of `scripts/scheduled-open-db-check.mjs` (header comment saying what it proves; random-slug events created and deleted in `finally`; `check(label, ok)`; anon-key refusal check). It must prove:
  1. limit 2, approval off: two `register_or_queue` → `registered`; the third → `waiting`, `position` 1.
  2. **race**: on a fresh event with limit 1, ten parallel `register_or_queue` with different emails → exactly one `registered`, nine `waiting` with positions 1–9.
  3. re-submit of a waiting email → `waiting`, same `position`, `extra` updated.
  4. active attendee's email re-submitted when full → `updated`, no entry created.
  5. a cancelled `source='import'` attendee re-registering when full → `waiting` with the attendee's token; after a place frees and `fill_free_places` runs → the attendee row is active, `source='registration'`, same token.
  6. `fill_free_places` twice **in parallel** after one place frees → one entry moved, total registered never above the limit.
  7. registration closed (switch off) + place free → `fill_free_places` moves nobody; set `registration_open=true` → the next call moves the first waiting entry; a new `register_or_queue` while anyone waits returns `waiting` (D691).
  8. limit cleared with people waiting and registration open → `fill_free_places` moves all of them.
  9. approval on: new registration → `pending` and counts toward the limit; `decline_entry` → `declined` and the first waiting entry becomes `pending` (not registered); `approve_entry` → attendee active with `source='registration'`.
  10. `leave_entry` on a pending entry frees the place (next waiting → pending); on a waiting entry, nothing else moves.
  11. `move_in_entry` works when full and closed; `remove_entry` changes nothing else.
  12. `close_entry_for_attendee` closes a waiting entry.
  12a. a declined email registering again → `pending` (or `waiting` when full) on the same entry row and token, with a new `joined_at` (D702).
  13. the anon key cannot run `register_or_queue` or `fill_free_places`.
- [ ] **Step 2: Run it before the migration exists** — `npm run check:queue` → fails (function does not exist).
- [ ] **Step 3: Write `0100_registration_queue.sql`** with the columns, table, indexes, functions and grants above. Comment each block with its decision number.
- [ ] **Step 4: Apply 0100** to Supabase project `wfmqwwcolfigjylkgrsv` (Supabase MCP `apply_migration`), then run `npm run check:queue` → every line `PASS`, exit 0.
- [ ] **Step 5: Commit** — `git add supabase/migrations/0100_registration_queue.sql scripts/registration-queue-db-check.mjs package.json && git commit -m "feat(registration): queue table and place-taking functions (D677-D703, 0100)"`

---

### Task 2: Feature module — rules, db wrappers, WhatsApp

**Files:**
- Create: `src/features/registration-queue/lib/rules.ts`, `src/features/registration-queue/db.ts`, `src/features/registration-queue/notify.ts`, `src/features/registration-queue/client.ts`, `src/features/registration-queue/index.ts`
- Modify: `src/lib/types.ts` (Event: `registration_limit?: number | null; registration_needs_approval?: boolean`; new `RegistrationEntry` type), `src/lib/db/attendees.ts` (`purgeAttendeePersonalData` also deletes the event's entries if Task 1 did not do it in SQL)
- Test: `tests/registration-queue.test.ts`

**Interfaces — Produces:**
- `rules.ts` (pure): `registrationOpen(ev: Pick<Event,"status"|"registration_open"|"registration_closes_at">, now: Date): boolean` — the single open test, replacing the three copies (register page, `registerAction`, `registrationOpenNow` in `src/features/cancel/lib/rules.ts`, which becomes a re-export); `parseLimit(raw: string | null): number | null` (positive whole number, else null); `placesLabel(taken: number, limit: number | null): string | null` → `"12 of 50 places taken"` (null without a limit); `firstName(name: string): string`.
- `db.ts`: `type Places = { taken: number; waiting: number; pending: number; limit: number | null; full: boolean; open: boolean }`; `getPlaces(eventId): Promise<Places>`; `registerOrQueue(ev, input: { name: string; email: string; extra: Record<string,string> }, opts: { terms: boolean }): Promise<{ outcome: "updated"|"waiting"|"pending"|"registered"; token: string; attendeeId: string|null; entryId: string|null; position: number|null }>`; `fillFreePlaces(eventId): Promise<Moved[]>` with `type Moved = { entryId: string; attendeeId: string | null; newState: "pending" | "registered" }`; `moveInEntry(entryId)`, `approveEntry(entryId)`, `declineEntry(entryId)`, `leaveEntry(eventId, token)` (each `Promise<Moved[]>`; approve returns the registered row), `removeEntry(entryId)`, `closeEntryForAttendee(eventId, email, attendeeId): Promise<string | null>`; `findEntryByToken(eventId, token): Promise<RegistrationEntry | null>`; `listEntries(eventId, state: "waiting" | "pending"): Promise<RegistrationEntry[]>` (oldest first); `countEntries(eventId, state)`; `waitingPosition(entry): Promise<number | null>`.
- `notify.ts`: `notifyRegistered(ev: Event, moved: Moved[], reason: "moved_in" | "approved"): Promise<{ sent: number; failed: number }>` — for each `newState === "registered"` row loads the attendee, sends via `runSend` with template `reason === "approved" ? "ecphub_registration_approved" : "ecphub_waitlist_moved_in"`, `bodyParams: [firstName(name), ev.name]`, `buttonParam: token`, `dedupeKey: \`${reason}:${entryId}\``; never throws (pattern: `src/features/activities/lib/request-notify.ts`). Rows that became `pending` are skipped (D700/D701).

- [ ] **Step 1: Failing tests** in `tests/registration-queue.test.ts`:
  - `registrationOpen`: closed when switch off, when `registration_closes_at` is past, when archived; open otherwise.
  - `parseLimit("50") === 50`; `parseLimit("") === null`; `parseLimit("0") === null`; `parseLimit("-3") === null`; `parseLimit("2.5") === null`; `parseLimit(" 12 ") === 12`.
  - `placesLabel(12, 50) === "12 of 50 places taken"`; `placesLabel(52, 50) === "52 of 50 places taken"`; `placesLabel(3, null) === null`.
  - `firstName("Mei Ling Tan") === "Mei"` (reuse `displayName` from `src/lib/text`, as `fillName` does).
- [ ] **Step 2: Run** `npx vitest run tests/registration-queue.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** the three files and entries; replace the two other open-test copies with `registrationOpen`; existing tests (`tests/cancel-rules.test.ts` `registrationOpenNow`) must still pass.
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit -p . && npx eslint src/features/registration-queue src/features/cancel` → PASS.
- [ ] **Step 5: Commit** — `feat(registration): queue module - open/full rules, rpc wrappers, WhatsApp on registering (D677-D703)`

---

### Task 3: Attendee side — full page, joining, waiting/pending link pages

**Files:**
- Create: `src/features/registration-queue/portal/QueueCard.tsx`, `src/features/registration-queue/portal/actions.ts`
- Modify: `src/app/e/[slug]/register/page.tsx`, `src/app/e/[slug]/register/actions.ts`, `src/app/e/[slug]/register/RegisterForm.tsx` (a `waitlist` prop for the heading only), `src/app/e/[slug]/register/done/page.tsx`, `src/app/e/[slug]/a/[token]/layout.tsx`, `src/lib/portal.ts`, `src/lib/db/events.ts` (`getEventByAttendeeToken` also finds an entry's event), `src/app/a/[token]/page.tsx`

**Interfaces:**
- Consumes: Task 2 `registrationOpen`, `getPlaces`, `registerOrQueue`, `findEntryByToken`, `waitingPosition`, `leaveEntry`, `fillFreePlaces`, `notifyRegistered`.
- Produces: `leaveQueueAction(slug: string, token: string): Promise<void>` (server action); `QueueCard({ event, entry, position, filledWhileRegistering }: …)`.

Behaviour (copy is fixed by the spec where quoted; the rest follows the portal's tone):
- Register page: closed (via `registrationOpen`) → today's "Registration is closed". Open and `places.full` and no `?waitlist=1` → Empty state **Registration is full** with a **Join the waiting list** button to `?waitlist=1`. `?waitlist=1` → the same form, with a line above it saying they are joining the waiting list (D678).
- `registerAction`: after the existing checks, `registerOrQueue(...)` replaces `upsertByEmail` + `recordConsent` + `recordTermsAgreed` (the function stamps consent/terms). `outcome` `updated`/`registered` → as today (done page if D634 on, else their link). `waiting`/`pending` → their link (never the done page, D690); when `waiting` and the form was **not** the `?waitlist=1` one, append `?filled=1` (D695). A `registered` outcome from the queue sends nothing (they registered directly).
- Token layout: resolve in this order — active attendee → today's flow; else an entry with that token in `waiting`/`pending`/`declined`/`left`/`removed` → `QueueCard`; else cancelled attendee → `CancelledCard`; else 404. `loadPortalAttendee` stays the gate for every portal page and action (a token with only an entry is refused there, so no portal write runs, Review Focus 4).
- `QueueCard` states: `waiting` → **You're on the waiting list** + "You're number N" + event name/date + **Leave the waiting list** (confirm dialog) and, with `?filled=1`, a line that the event filled up while they were registering; `pending` → **Your registration is waiting for the organiser's approval** + **Withdraw my registration** (confirm); `declined` → **The organiser couldn't confirm your place for this event.**; `left`/`removed` → you're no longer on the list, with **Register again** when `registrationOpen`. Themed like the cancelled card (`ThemeStyle`).
- `leaveQueueAction`: rate-limited like `requestCancelAction`; `leaveEntry` then `notifyRegistered(ev, moved, "moved_in")` for anyone it moved straight into registered; redirect to the link with a flash.
- `/a/<token>` short link and `getEventByAttendeeToken`: also resolve an entry's token (so WhatsApp buttons and shared links work before and after moving in).
- Done page: a token with no active attendee → redirect to the link.

- [ ] **Step 1:** Implement the above. (No new pure logic beyond Task 2; behaviour is proven in the browser.)
- [ ] **Step 2: Run** `npx vitest run && npx tsc --noEmit -p . && npx eslint src/app/e src/features/registration-queue src/lib` → PASS (the attendee-reads guard must still pass).
- [ ] **Step 3: Browser check** on a throwaway event (not `ecphub`) with limit 1: register A (→ portal), open the form as B (→ **Registration is full** → Join → waiting page "number 1"); open `/e/<slug>/a/<B token>/activities` directly → still the waiting page (Review Focus 4); leave the list → left page. Approval on: register C → pending page; withdraw. Screenshot each state.
- [ ] **Step 4: Commit** — `feat(registration): full page, waiting list and pending pages on the attendee's link (D678-D681, D695, D697)`

---

### Task 4: Organiser side — settings, waiting list and pending views, triggers

**Files:**
- Create: `src/features/registration-queue/admin/QueueTable.tsx`, `src/features/registration-queue/admin/actions.ts`
- Modify: `src/app/admin/events/[id]/settings/page.tsx` + `actions.ts` (`updateSettingsAction`, `setStatusAction`, `addAttendeeAction`, `importMasterlistAction`, `deleteAttendeeAction`, `deleteAttendeesAction`), `src/features/cancel/admin/actions.ts` (`approveCancelRequestAction`), `src/app/admin/events/[id]/attendees/page.tsx`, `src/app/admin/events/[id]/layout.tsx`, `src/lib/db/attendees.ts` (purge)

**Interfaces:**
- Consumes: Task 2 everything; `notifyRegistered`.
- Produces: `moveInAction(eventId, entryId)`, `removeEntryAction(eventId, entryId)`, `approveEntryAction(eventId, entryId)`, `declineEntryAction(eventId, entryId)` (server actions, `requireEventAccess`, plain forms like `CancelRequestsTable`, archived → refused like approve-cancel); `afterPlacesChange(ev: Event): Promise<string>` in the feature's `admin/actions.ts` (non-action helper in a server-only file) = `fillFreePlaces` + `notifyRegistered(..., "moved_in")`, returning a flash suffix like `decisionFlash` ("Moved in Aisyah from the waiting list." / "" when nobody moved).

Behaviour:
- Settings → Registration form tab: **Limit registrations to** (number input, blank = no limit) with `placesLabel` under it (D686), and checkbox **Registrations need approval** (D696). Both in the form's `formKey` list. `updateSettingsAction` saves them (`parseLimit`) and then calls `afterPlacesChange` (covers raise/clear limit and reopening by switch or close time, D682/D691).
- `setStatusAction`: after un-archiving to draft/live, `afterPlacesChange`.
- `approveCancelRequestAction`: when `approveCancelRequest` returned true and the attendee's `source === 'registration'`, `afterPlacesChange`; append its suffix to the flash.
- `deleteAttendeeAction` / `deleteAttendeesAction`: after deleting, `afterPlacesChange` when any deleted row was an active `source='registration'` attendee.
- `addAttendeeAction` / `importMasterlistAction` (D693): for each email, if an active entry exists, create the attendee with the entry's token (pass a token through `createAttendee`/`createAttendees` — add an optional `token` to `AttendeeInput` handling) and then `closeEntryForAttendee`. Imported/added people stay non-counted (their `source` unchanged).
- Restore (D694): unchanged — no limit check.
- Attendees page: header buttons **Waiting list (N)** (`?show=waitlist`) and **Pending approval (N)** (`?show=pending`) beside Cancelled / Cancellation requests, shown when N > 0; `QueueTable` lists position (waiting only), name, email, mobile (the event's phone field from `extra`), joined/applied date; row actions Move in + Remove (waiting) or Approve + Decline (pending). Subtitle shows `placesLabel` when a limit is set (D686).
- Sidebar badge: `attendees` = cancellation requests + pending entries (D698).
- Move in / Approve flash: the person's name plus what WhatsApp did (`notifyRegistered` result), like `decisionFlash`.
- Purge: the event's entries are deleted with the personal-data purge.

- [ ] **Step 1:** Implement the above.
- [ ] **Step 2: Run** `npx vitest run && npx tsc --noEmit -p . && npx eslint src` → PASS.
- [ ] **Step 3: Browser check** (signed-in admin; throwaway event): set limit 1, see "0 of 1 places taken"; fill it and queue two people; Waiting list (2) shows them in order; approve a cancellation of the registered person → first waiting person moved in, flash names them; raise the limit → the second moves in; approval on → new registrant appears under Pending approval, badge counts it; Decline → their link shows the declined line; Approve another → registered. WhatsApp sends show in the event's WhatsApp log (failed until the templates are approved in Meta — expected).
- [ ] **Step 4: Commit** — `feat(registration): organiser limit, approval switch, waiting list and pending views (D682-D686, D691-D694, D696-D701)`

---

### Task 5: Post-build

- [ ] Run `npm run check:queue` again against the final code's database → all PASS.
- [ ] Tell the user the two Meta templates to create (Utility; body variables {{1}} first name, {{2}} event name; URL button `https://ecphub.vercel.app/a/{{1}}` like the existing ones): `ecphub_waitlist_moved_in`, `ecphub_registration_approved`.
