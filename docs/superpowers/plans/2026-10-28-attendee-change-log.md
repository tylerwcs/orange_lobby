# Attendee Change Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record every change an admin or committee member makes to an event's attendees, and show it as a Change log view on the Attendees page.

**Architecture:** A new feature folder `src/features/attendee-log/` owns one table (`attendee_changes`), pure helpers that turn attendees into labelled values and diffs, a `recordChange()` writer, and the admin view. Each existing server action that changes attendees calls `recordChange()` with the `actor` it already gets from `requireEventAccess`. No database triggers: every write uses the service role, so only app code knows who acted.

**Tech Stack:** Next.js (this repo's version — read `node_modules/next/dist/docs/` before touching routing or server actions), Supabase Postgres via `serviceClient()`, vitest for pure code, a `scripts/*-db-check.mjs` script for the SQL.

**Spec:** `docs/superpowers/specs/2026-10-28-attendee-change-log-design.md` (read it first; this plan argues from it).

## Global Constraints

- Decisions D742–D747 (the language-switch work used up to D741 on 28 Oct; re-check `grep -rhoE "D7[4-9][0-9]" docs src` before committing and shift if taken). Migration `0112_attendee_changes.sql` (0111 is the language switch; re-check `ls supabase/migrations`).
- Works on `main`, commits straight to it; never push without the user's say-so.
- Test only on a non-`ecphub` event (the `ecphub` slug is the real event).
- Every new event-scoped entry point uses `requireEventAccess`; `tests/access-guard.test.ts` must stay green with its counts unchanged.
- Every new `.from("attendees").select(` either filters `.is("cancelled_at", null)` or carries an `any-status:` comment in the statement (`tests/attendee-reads-guard.test.ts`).
- Table: RLS on, no policies, service role only — like every table here.
- Nothing in the app edits or deletes `attendee_changes` rows, except the event's own deletion (cascade) and the personal-data purge.
- A failed log write is never silent: `recordChange` throws; where a caller must not throw (`afterPlacesChange`), it returns a flash line saying the log could not be written.
- Times shown in Kuala Lumpur time (`MY_TZ`, `src/lib/time.ts`; `shortDateTime` in `src/lib/text.ts`).
- Fields are shown by their **labels** at the time of the change; blank shows as "(blank)".

## Review Focus

1. **A big import or bulk action** (3,000 rows) must stay inside the page's 60 s `maxDuration`: one log insert per action, values computed from rows already loaded, no per-person reads. → Task 2 test `builds an import change for 3,000 people in under 300 ms`.
2. **A save that changes nothing** (edit panel saved untouched; bulk set to the value everyone already has) writes no row. → Task 2 tests `editChange returns null when nothing changed` and `bulkSetChange skips people whose value is unchanged`.
3. **Blank, missing and whitespace values** (`""`, `undefined`, `null`, `"  "`) are the same thing and never show as a change. → Task 2 test `treats null, undefined and whitespace as blank`.
4. **Search text with `%`, `,`, `(` or quotes** (names like "O'Neil (KL)") must not break the PostgREST filter or match everything. → Task 2 test `searchPattern escapes ilike and or-filter characters`.
5. **A committee member removed later** still shows under the name they had when they acted; a field renamed later keeps its old label on old rows. → Task 1 db-check step 4 (actor name stored on the row), and Task 2's value snapshot stores labels, not keys.

---

### Task 1: The table, its db check, and the erasure SQL (D742, D744)

**Files:**
- Create: `supabase/migrations/0112_attendee_changes.sql`
- Create: `scripts/attendee-log-db-check.mjs`
- Create: `src/features/attendee-log/README.md`
- Modify: `package.json` (add `"check:log": "node --env-file=.env.local scripts/attendee-log-db-check.mjs"`)

**Interfaces:**
- Produces: table `public.attendee_changes` with columns
  `id uuid pk default gen_random_uuid()`, `event_id uuid not null references public.events(id) on delete cascade`,
  `at timestamptz not null default now()`, `actor_user_id uuid` (no FK — the row outlives the login),
  `actor_email text not null`, `actor_name text not null`, `actor_kind text not null check (actor_kind in ('admin','committee'))`,
  `kind text not null` (no check constraint — the list lives in code, Task 2), `summary text not null`,
  `attendee_ids uuid[] not null default '{}'`, `search text not null default ''`, `detail jsonb not null default '{}'::jsonb`.
  Indexes: `(event_id, at desc)`, GIN on `attendee_ids`.
- Produces: `public.erase_from_attendee_changes(p_attendee_id uuid) returns integer` (rows touched), `security definer`, `set search_path = ''`, execute revoked from `public`/`anon`/`authenticated` — for the developer's by-hand PDPA erasure only; no app code calls it. It deletes rows where `attendee_ids = array[p_attendee_id]`, and for other rows containing the id removes it from `attendee_ids`, drops that person from `detail->'people'`, and rewrites `search` from the remaining summary + people.

- [ ] **Step 1: Write the migration.** Header comment cites the spec and D742; a comment above `attendee_ids` says it exists for by-hand PDPA erasure (D744). `alter table … enable row level security;` with no policies.

- [ ] **Step 2: Write `scripts/attendee-log-db-check.mjs`** in the shape of `scripts/registration-queue-db-check.mjs` (own event with a random slug, deleted in `finally`, never touches `ecphub`, PASS/FAIL lines, exit 1 on any FAIL). It proves:
  1. An inserted row reads back with its `detail` intact.
  2. The anon key cannot select from `attendee_changes` (empty result or error).
  3. `attendee_ids @> array[<id>]` finds the row (GIN path).
  4. Deleting the `event_committee` row for an actor leaves `actor_name` on past rows unchanged.
  5. A bulk row whose `detail.people` holds 3,000 people inserts and reads back in one call.
  6. `erase_from_attendee_changes` for one person removes them from a two-person bulk row (row stays, one person left in `detail.people` and `attendee_ids`, their email gone from `search`) and deletes their one-person row; the anon key cannot execute it.
  7. Deleting the event deletes its log rows (cascade).

- [ ] **Step 3: Run it before the migration** — `npm run check:log`. Expected: FAIL (relation `attendee_changes` does not exist).

- [ ] **Step 4: Apply the migration** with the Supabase MCP `apply_migration` (name `attendee_changes`).

- [ ] **Step 5: Write `README.md`** for the feature: what it records (link the spec), and how to handle a PDPA erasure by hand: run `select public.erase_from_attendee_changes('<attendee id>');` in the Supabase SQL editor (find the id with `select id, at, summary from attendee_changes where search ilike '%<email>%'` if the attendee row is already gone — `detail.people[].attendeeId`).

- [ ] **Step 6: Run** `npm run check:log`. Expected: all PASS.

- [ ] **Step 7: Commit** `feat(attendee-log): attendee_changes table, db check, erasure SQL (D742, D744, 0112)`.

---

### Task 2: Pure helpers — values, diffs, kinds, search (D742)

**Files:**
- Create: `src/features/attendee-log/types.ts`, `src/features/attendee-log/lib/values.ts`, `src/features/attendee-log/lib/changes.ts`, `src/features/attendee-log/lib/kinds.ts`, `src/features/attendee-log/client.ts` (re-exports types + lib, no `server-only`)
- Test: `tests/attendee-log/values.test.ts`, `tests/attendee-log/changes.test.ts`, `tests/attendee-log/kinds.test.ts`

**Interfaces (Produces):**
```ts
// types.ts
export type FieldValue = { label: string; value: string };
export type FieldChange = { label: string; before: string; after: string };
export type PersonChange = { attendeeId: string; name: string; email: string | null; fields?: FieldChange[]; snapshot?: FieldValue[] };
export type ChangeKind =
  | "edit" | "add" | "delete" | "bulk_delete" | "bulk_set" | "import"
  | "column_add" | "column_delete" | "cancel_approve" | "cancel_decline" | "restore"
  | "queue_approve" | "queue_move_in" | "move_in_auto"
  | "group_move" | "group_delete" | "room_assign" | "room_delete" | "round_rename";
export type NewChange = { kind: ChangeKind; summary: string; people: PersonChange[] };
export type AttendeeChange = NewChange & { id: string; at: string; actorName: string; actorEmail: string; actorKind: "admin" | "committee" };
/** What turns an attendee row into labelled values: fields at the time, group names, rooms by attendee. */
export type LogLabels = { fields: AttendeeField[]; groupName: Map<string, string>; roomsOf: Map<string, Record<string, string>> };
```
```ts
// lib/values.ts
export const blank = (v: string | null | undefined): string;               // trims; null/undefined → ""
export function attendeeValues(a: Pick<Attendee, "name" | "email" | "category" | "extra" | "group_id"> & { id: string }, labels: LogLabels): FieldValue[];
  // Name, Email, Category, each labels.fields entry (via fieldValue), Group, then one per breakout round ("Round 1 room"); blanks left out
export function diffValues(before: FieldValue[], after: FieldValue[]): FieldChange[]; // by label, in `after` order then labels only in `before`; "" vs missing is no change
// lib/changes.ts — builders the actions call; each returns null when there is nothing to log
export function editChange(before: Attendee, after: Attendee, labels: LogLabels): NewChange | null;
export function deleteChange(gone: Attendee[], labels: LogLabels): NewChange | null;      // 1 → "delete", >1 → "bulk_delete"
export function bulkSetChange(columnLabel: string, value: string, before: { a: Attendee; old: string }[]): NewChange | null;
export function importChange(added: Attendee[], updated: { before: Attendee; after: Attendee }[], labels: LogLabels): NewChange | null;
export const people = (n: number): string;                                                // "1 person" / "6 people"
export function searchText(change: NewChange, actorName: string, actorEmail: string): string; // lower-cased summary + actor + every person's name/email
export function searchPattern(q: string): string;                                          // escapes % _ \ , ( ) " for `.or(...ilike...)`
// lib/kinds.ts
export const KIND_GROUPS: Record<"edits" | "adds" | "deletes" | "bulk" | "columns" | "cancellations" | "groups_rooms", ChangeKind[]>;
export const KIND_GROUP_LABELS: Record<keyof typeof KIND_GROUPS, string>;  // "Edits", "Added", "Deletes", "Bulk changes", "Columns", "Cancellations", "Groups & rooms"
export const VERB: Record<ChangeKind, string>;                             // "Edited", "Deleted", "Bulk set", "Imported", …
```
Summary copy (exact): edit `Edited ${name}`; delete `Deleted ${name}`; bulk_delete `Deleted ${people(n)}`; bulk_set `Set ${label} to ${value || "(blank)"} for ${people(n)}`; import `Imported masterlist: ${a} added, ${u} updated`.

- [ ] **Step 1: Write failing tests.**
  - `values.test.ts`: `treats null, undefined and whitespace as blank` (`diffValues([{label:"Phone",value:" "}], [])` → `[]`); `attendeeValues lists Name, Email, Category, fields, Group, rooms by label` (one attendee with `extra.shirt="L"`, field label "Shirt size", group id mapped to "Team A", room `{ "Round 1": "B2" }` → labels in that order, blanks omitted); `diffValues reports old → new by label` (Table 12 → 14 gives `[{label:"Table",before:"12",after:"14"}]`; a value cleared gives `after: ""`).
  - `changes.test.ts`: `editChange returns null when nothing changed`; `editChange summary and fields` (`"Edited Lee Mei Ling"`, one FieldChange); `deleteChange keeps a full snapshot` (kind `"delete"`, `people[0].snapshot` includes Group); `deleteChange of 6 is bulk_delete` (summary `"Deleted 6 people"`); `bulkSetChange skips people whose value is unchanged` (3 people, one already "L" → 2 people, summary `"Set Shirt size to L for 2 people"`; all unchanged → null); `importChange counts and diffs` (2 added with snapshots, 1 updated with fields, summary `"Imported masterlist: 2 added, 1 updated"`); `builds an import change for 3,000 people in under 300 ms` (`performance.now()` around `importChange` with 1,500 added + 1,500 updated, 10 fields each); `searchPattern escapes ilike and or-filter characters` (`searchPattern("O'Neil (KL), 50%")` contains no unescaped `,`/`(`/`)`/`%`); `searchText includes every person's name lower-cased`.
  - `kinds.test.ts`: `every kind is in exactly one group`; `every kind has a verb`.

- [ ] **Step 2: Run** `npx vitest run tests/attendee-log`. Expected: FAIL (modules not found).

- [ ] **Step 3: Implement** the files above. `attendeeValues` uses `fieldValue` from `src/lib/attendee-values.ts`. The `searchPattern` result is used as `%${pattern}%` inside `.or("search.ilike.…")`; quote the value per PostgREST rules (wrap in double quotes, escape `"` and `\`).

- [ ] **Step 4: Run** `npx vitest run tests/attendee-log`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(attendee-log): labelled values, diffs and change builders (D742)`.

---

### Task 3: The writer and reader, and the purge (D742)

**Files:**
- Create: `src/features/attendee-log/db.ts` (`import "server-only"`), `src/features/attendee-log/labels.ts` (server), `src/features/attendee-log/index.ts`
- Modify: `src/app/admin/events/[id]/actions.ts` (`purgeEventAction`)

**Interfaces:**
- Consumes: Task 2 types and builders; `Actor` from `src/lib/access.ts`.
- Produces:
```ts
export async function recordChange(eventId: string, by: Actor, change: NewChange | null): Promise<void>; // null → no-op; throws on error
export async function listChanges(eventId: string, f: { q?: string; by?: string; group?: keyof typeof KIND_GROUPS }, page: number, pageSize: number): Promise<{ rows: AttendeeChange[]; total: number }>;
export async function listChangeActors(eventId: string): Promise<{ email: string; name: string; kind: "admin" | "committee" }[]>; // distinct, by name
export async function deleteChangesForEvent(eventId: string): Promise<void>;
export async function loadLabels(ev: Pick<Event, "id" | "registration_questions" | "attendee_fields">): Promise<LogLabels>; // eventFields + listGroups + listAssignments/listAgenda → room code per round
```
`recordChange` resolves `actor_name`: committee → `event_committee.name` for (`event_id`, `user_id`), newest `added_at`, falling back to the email; admin → the email. It fills `attendee_ids` from `people`, `search` from `searchText`. `index.ts` re-exports `client.ts`, `db.ts`, `labels.ts` and (Task 6) the view, following `src/features/cancel/index.ts`.

- [ ] **Step 1: Implement `db.ts`, `labels.ts`, `index.ts`.** The SQL itself is proven by Task 1's db check and the builders by Task 2's tests, so this thin layer is checked by types: `npx tsc --noEmit`. Expected: no new errors.
- [ ] **Step 2:** In `purgeEventAction`, call `deleteChangesForEvent(eventId)` right after `purgeAttendeePersonalData`. (Admin-only already; no guard count changes.)
- [ ] **Step 3: Run** `npx vitest run` (whole suite, the two guard tests included). Expected: PASS.
- [ ] **Step 4: Commit** `feat(attendee-log): recordChange, listChanges, purge clears the log (D742)`.

---

### Task 4: Log the Attendees page's own actions (D742)

**Files:**
- Modify: `src/app/admin/events/[id]/actions.ts` — `updateAttendeeAction`, `deleteAttendeeAction`, `deleteAttendeesAction`, `addAttendeeAction`, `importMasterlistAction`, `setColumnAction`, `addAttendeeFieldAction`, `deleteAttendeeFieldsAction`, `assignFromColumnAction` and its helper `assignRoundsFromColumns`.

**Interfaces:**
- Consumes: `recordChange`, `loadLabels`, Task 2 builders.
- Produces: `assignRoundsFromColumns(ev, only, overwrite, by: Actor, overwriteHint?)` — gains `by` and records one `room_assign` row (summary `Assigned ${slot} rooms for ${people(n)}`, each person's room before → after) for what it wrote.

Each action takes `actor` from its existing `requireEventAccess` call, builds the change from rows it already holds (read **before** the write for deletes, edits and erasures), writes, then `await recordChange(ev.id, actor, change)` before `revalidatePath`/`redirect`.

- [ ] **Step 1: Edit / delete / bulk delete.** `updateAttendeeAction`: `editChange(existing, {...existing, ...input}, labels)`. `deleteAttendeeAction`: `deleteChange([gone], labels)` (labels loaded before the delete — rooms vanish by cascade). `deleteAttendeesAction`: `deleteChange(roster.filter(chosen), labels)`.
- [ ] **Step 2: Add.** `addAttendeeAction`: when `upsertByEmail` returns `created: false`, read the existing row first (`findByEmail`) and log `editChange` with summary `Updated ${name} (already on the list)`; otherwise kind `"add"`, summary `Added ${name}`, snapshot of the new row.
- [ ] **Step 3: Import.** Collect `{before, after}` for each `updateAttendee` call. Change `createAttendees` (`src/lib/db/attendees.ts`) to return the inserted `Attendee[]` (`.insert(chunk).select("*")`); its one caller uses `.length` for the count. One `importChange` row. `assignRoundsFromColumns` writes its own `room_assign` row.
- [ ] **Step 4: Set column.** Before writing, capture each chosen person's old value: own column via `fieldValue`, Group via group names, breakout via `listAssignments` + room codes. `bulkSetChange(label, value, before)`.
- [ ] **Step 5: Columns.** `addAttendeeFieldAction`: when `adopted > 0`, kind `"column_add"`, summary `Added column ${label}, filled for ${people(adopted)}`, each person's snapshot `[{label, value}]`. `deleteAttendeeFieldsAction`: before erasing, every attendee holding a non-blank value in a doomed field → kind `"column_delete"`, summary `Deleted column ${label}` (or `Deleted ${n} columns`), snapshot of the erased values; no row if nobody held a value.
- [ ] **Step 6: Run** `npx tsc --noEmit && npx vitest run`. Expected: no type errors; PASS.
- [ ] **Step 7: Commit** `feat(attendee-log): log edits, deletes, adds, imports, bulk sets and columns (D742)`.

---

### Task 5: Log cancellations, the waiting list, groups and rooms (D743, D745)

**Files:**
- Modify: `src/features/cancel/admin/actions.ts`, `src/features/registration-queue/admin/actions.ts`, `src/features/registration-queue/admin/places.ts`, every `afterPlacesChange` call site (`src/app/admin/events/[id]/actions.ts` ×6, `src/features/cancel/admin/actions.ts`), `src/app/admin/events/[id]/groups/actions.ts`, `src/app/admin/events/[id]/actions.ts` (agenda: `deleteAgendaDayAction`, `deleteAgendaItemAction`, `updateBreakoutRoundAction`, `deleteBreakoutRoundAction`, `updateAgendaItemAction`)
- Create: `src/features/attendee-log/rooms.ts` (server)

**Interfaces:**
- Changes: `afterPlacesChange(eventId: string, by: Actor, cause: string): Promise<string>` — required params, so TypeScript finds every caller. When `fillFreePlaces` registers people, records kind `"move_in_auto"`, summary `Moved in ${people(n)} from the waiting list after ${cause}` (people via `listAttendeesByIds`). The log write sits in its own try: on failure it appends `"The waiting-list move-in could not be logged."` to the returned line; it still never throws (D743 — automatic move-ins get their own row next to the action that freed the place, not folded into it; see Notes).
- Produces (`rooms.ts`): `logRoomLoss(ev, by: Actor, items: AgendaItem[], what: string): Promise<void>` — reads assignments for those item ids and their attendees **before** the caller deletes, records `"room_delete"` (`${what}: ${people(n)} lost their room`); no row when nobody is assigned. `logRoundRename(ev, by, itemIds: string[], from: string, to: string)` — `"round_rename"`, `Renamed ${from} → ${to} (${people(n)})`, no row when empty.

- [ ] **Step 1: Cancellations.** Approve → `"cancel_approve"` `Approved ${name}'s cancellation` (snapshot: reason); decline → `"cancel_decline"` `Declined ${name}'s cancellation`; restore → `"restore"` `Restored ${name}`. Only when the db call reports it happened (`ok`). The checked-in withdraw path logs nothing (no staff choice).
- [ ] **Step 2: Waiting list.** `moveInAction` → `"queue_move_in"` `Moved in ${name}` for each `moved` row with an `attendeeId`; `approveEntryAction` → `"queue_approve"` `Approved ${name}`; `declineEntryAction` logs only what its fill registered, as `"move_in_auto"` with cause `declining ${entry.name}`. Snapshots from the attendee rows.
- [ ] **Step 3: `afterPlacesChange` signature.** Change it, then pass `actor` and a cause at each call site: `deleting ${name}`, `deleting ${people(n)}`, `cancelling ${name}`, `adding ${name}`, `the masterlist import`, `a Settings change`, `reopening the event`.
- [ ] **Step 4: Groups.** `addToGroupAction` and `buildGroupsFromColumnAction` → `"group_move"` (each person's previous group → new; skip people already in it); `removeFromGroupAction` → `"group_move"` `Removed ${name} from ${group}`; `deleteGroupAction` → before `deleteGroup`, read members (`listAttendees(ev.id)` filtered by `group_id`, the call already marked) → `"group_delete"` `Deleted group ${name}: ${people(n)} left without a group`; no row when the group was empty.
- [ ] **Step 5: Agenda.** Call `logRoomLoss` before each delete: `deleteAgendaItemAction` (only when the item has a `slot`; `what` = `Deleted room ${code} (${slot})`), `deleteAgendaDayAction` (rooms on that day; `Deleted ${dayLabel(day)}`), `deleteBreakoutRoundAction` (`Deleted ${slot}`), `updateBreakoutRoundAction`'s remove-missing loop (`Removed room ${code} from ${slot}`). Call `logRoundRename` after a successful `renameSlotAssignments` in `updateBreakoutRoundAction` (all items of the round, once) and `updateAgendaItemAction`.
- [ ] **Step 6: Run** `npx tsc --noEmit && npx vitest run`. Expected: PASS, guard tests included.
- [ ] **Step 7: Commit** `feat(attendee-log): log cancellations, waiting list, groups and rooms (D743, D745)`.

---

### Task 6: The Change log view (D746)

**Files:**
- Create: `src/features/attendee-log/admin/ChangeLogView.tsx` (server component), `src/features/attendee-log/admin/ChangeDetail.tsx`
- Modify: `src/app/admin/events/[id]/attendees/page.tsx`, `src/features/attendee-log/index.ts`

**Interfaces:**
- Consumes: `listChanges`, `listChangeActors`, `KIND_GROUPS`, `KIND_GROUP_LABELS`, `VERB`.
- Produces: `ChangeLogView({ eventId, sp }: { eventId: string; sp: Record<string, string | undefined> })`.

Matches the mockup the organiser chose (`.superpowers/brainstorm/6554-1793175021/content/log-placement.html`, option A) and the admin design style (capped, header actions, table-style list).

- [ ] **Step 1: Page wiring.** In `page.tsx`, `sp.show === "log"` is another view: `otherView` includes it, the roster queries are skipped, the subtitle is `Change log · ${total} changes`, the header shows "Back to registered". In the normal header add an always-visible outline `PendingLink` "Change log" → `viewHref("log")` (extend `viewHref`'s union). Render `<ChangeLogView eventId={ev.id} sp={sp} />` in the view switch.
- [ ] **Step 2: The view.** `SearchInput` for `q` (it keeps the other params); two GET selects, "Anyone" (`by`, actor emails) and "All changes" (`kind`, group keys), each keeping `show=log`; table columns When (`shortDateTime`), Who (name + "Admin"/"Committee" badge), Did (`summary`), detail trigger. Paged like the roster (`PageSizePicker` not needed; fixed 50, Previous/Next keep filters). Empty state: `No changes recorded yet.` / `No changes match.`
- [ ] **Step 3: Detail.** `ChangeDetail` inside the existing `Modal` (trigger "View", `iconOnly` false): for each person, name + email, then either `label: before → after` lines or the snapshot as a read-only field list. Over 200 people: show the first 200 and `and ${n - 200} more`.
- [ ] **Step 4: Run** `npx tsc --noEmit && npx vitest run && npm run lint`. Expected: PASS, no new lint errors.
- [ ] **Step 5: Commit** `feat(attendee-log): Change log view on the Attendees page (D746)`.

---

### Task 7: Browser check and memory (D747)

- [ ] **Step 1:** Start the dev server (`.claude/launch.json`), sign in as an admin, open a **non-`ecphub`** test event's Attendees page. Edit one attendee's field, delete one, bulk set a column on two, bulk delete two, add then delete a column, move someone into a group.
- [ ] **Step 2:** Open Change log: each action is one row, newest first, with the right summary, Admin tag and detail; the filters and search narrow it; an untouched save added no row.
- [ ] **Step 3:** If a committee login exists for that event, repeat one edit as committee and check the Committee tag and name. Otherwise say it was not checked.
- [ ] **Step 4:** Screenshot the view for the user. Update memory (`attendee-change-log.md` + index line) with commits, D-numbers and what was / wasn't browser-checked.
- [ ] **Step 5: Commit** any fixes found.

## Notes

- **D743 deviates from the spec's example on purpose:** the spec shows automatic move-ins on the same row as the delete ("Deleted Tan Wei Jie · moved in 2"). `afterPlacesChange` is shared by seven callers, two of which (Settings save, reopening) have no row of their own, so move-ins get their own row with the same person and time and a cause ("after deleting Tan Wei Jie"). Same information, one code path.
- Group **rename** is not logged: it changes the group, not anyone's data, and the spec's table does not list it.
