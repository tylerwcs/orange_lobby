# Attendee change log — design

Date: 28 Oct 2026. Decisions from the next free D-number (D741 was the last in use when this was
written; another session is active today, so check before numbering). Migration: next free number
(0111 is taken by the portal language switch).

## Why

Several people now change one event's attendees: Ecopia admins, plus each event's committee
members (D550–D564), who have the same attendee powers as an admin — edit, delete one, bulk
delete, bulk set a column, import a masterlist. Nothing records who did any of it. When a record
looks wrong or someone is missing, there is no way to find out who changed it, when, or what it
said before. The organiser wants every staff change to an attendee to be **traceable**.

## Goals

- Every change an admin or committee member makes to an event's attendees is written to a log:
  who (and whether they are Admin or Committee), when, what they did, to whom, and what changed.
- The Attendees page gets a **Change log** view, opened from a header button the way Cancelled
  and Waiting list are (`?show=log`). One event-wide list, newest first.
- A deleted attendee's record survives in the log as it was the moment before deletion, so
  "where did this person go?" has an answer.
- Both admins and committee members of the event can open the log (`requireEventAccess`).

## Non-goals

- **No per-attendee history in the attendee panel.** The organiser picked the event-wide view
  only (option A of the mockup).
- **No undo or restore from the log.** It is a record to refer back to.
- **Changes nobody on staff made are not logged:** attendees registering, ticking consent or
  terms, requesting or withdrawing a cancellation, the scheduled opening, cron jobs.
- **Check-ins are not repeated in the log.** `checkins` already stores who scanned (Claude's call).
- No log for other admin areas (agenda, activities, settings) except where an action there wipes
  or changes attendees' own data in bulk — those are in (see the table, organiser's answer 28 Oct).
- No in-app way to erase one person from the log. A PDPA erasure request is handled by the
  developer by hand in the database (organiser's answer 28 Oct); the stored shape must make that
  easy (below).

## Anti-goals (failure even if it works)

- A log someone can tidy up. Nobody — admin included — can edit or delete log rows from the app.
  The only removals are the event's own deletion and the personal-data purge (below).
- A staff change that lands but leaves no row, silently. If the log write fails, the action
  reports an error rather than a success toast.
- Logging that makes a big import or bulk action noticeably slower or time out (`maxDuration`
  is 60s on the Attendees page; a few thousand rows must still fit).
- A log that outlives the event's personal-data purge with names, emails and answers in it.

## What gets a row

One row per staff **action**, not per attendee touched. A bulk action is one row that opens to
the people it affected (Claude's call; matches the mockup the organiser picked from).

| Action (server action today) | Row says | Detail it opens to |
|---|---|---|
| Edit one attendee (`updateAttendeeAction`) | Edited *name* | each changed field, old → new; no row if nothing changed |
| Delete one (`deleteAttendeeAction`) | Deleted *name* | full record as it was |
| Bulk delete (`deleteAttendeesAction`) | Deleted *n* people | every record as it was |
| Bulk set column (`setColumnAction`: own column, Group, breakout round) | Set *Column* to *value* for *n* people | each person and what they had before |
| Import masterlist (`importMasterlistAction`) | Imported masterlist: *a* added, *u* updated | who was added; for updated people, field old → new |
| Add attendee (`addAttendeeAction`) | Added *name* (or Updated, when it matched an existing email) | the values entered / old → new |
| Delete column(s) (`deleteAttendeeFieldsAction`) | Deleted column *Label* | each person's value that was erased |
| Add column that adopts existing values (`addAttendeeFieldAction`) | Added column *Label*, filled for *n* | who got which value |
| Cancel requests (`features/cancel/admin`: approve, decline, restore) | Approved / Declined cancellation, Restored *name* | — |
| Group moves on the Groups page (`groups/actions.ts`, calls to `setGroupMembers`) | Moved *n* people to *Group* / Removed *name* from *Group* | each person's previous group |
| Assign rooms from column (`assignFromColumnAction`) | Assigned *Round* rooms for *n* people | each person's room before → after |
| Waiting list: approve / move in (`features/registration-queue/admin/actions.ts`: `approveEntryAction`, `moveInAction`) | Approved / Moved in *name* | the values they registered with (Claude's call) |
| Delete a group (`deleteGroupAction`; `group_id` is `on delete set null`) | Deleted group *Group*: *n* people left without a group | who was in it — read **before** the delete |
| Delete a breakout room or day on the Agenda page (`deleteAgendaItem` / `deleteAgendaDay`; assignments cascade) | Deleted room *Code*: *n* people lost their *Round* room | who was in it — read **before** the delete; no row if nobody was |
| Rename a breakout round (`renameSlotAssignments`) | Renamed round *Old* → *New* (*n* people) | who it affected |

**Automatic move-ins** (`afterPlacesChange`, triggered by a delete, cancellation approval or
import that frees a place): logged as part of the staff action that caused them — e.g. "Deleted
Tan Wei Jie · moved in 2 from the waiting list", detail listing who moved in. That means
`afterPlacesChange` returns who it moved (Claude's call).

The builder should grep for any other staff path that writes `attendees`, `breakout_assignments`
or group membership for an attendee — directly or by cascade — and add it; the table above is
what was found on 28 Oct.

"Fields" means what the organiser sees: name, email, category, every registration question and
custom column (`extra`), Group, breakout rooms — shown by their **labels**, not keys. Internal
columns (`updated_at`, `token`, timestamps) are not shown as changes.

## The view

Mockup the organiser chose: `.superpowers/brainstorm/6554-1793175021/content/log-placement.html`
(option A). Follows the admin design style (capped, header actions, table-style list).

- Header: "Attendees", subtitle "Change log · *N* changes", "Back to registered" button.
- Filters: a search box (attendee name or who), "Anyone ▾" (each person who has made a change),
  "All changes ▾" (by kind: edits, deletes, bulk, imports, columns, cancellations, groups).
- Columns: When (KL time), Who (name + Admin/Committee tag), Did (verb + attendee or count),
  What changed (short summary; for one-field edits the old → new inline).
- A row with detail opens it (a panel or modal, builder's choice) — deleted records shown as
  read-only field lists, bulk rows as a list of people with before/after.
- Paged like the roster.

## Decided how (Claude's calls)

- **Recorded in app code, not by database triggers.** Every write goes through the service role,
  so a trigger cannot know who acted; the server action has `actor` from `requireEventAccess`.
- **One table** for the log, keyed by event, with no foreign key to `attendees` (rows must survive
  the delete). RLS on, no policies, service role only — like every table here. `on delete cascade`
  from `events`.
- **Who** is stored as it was at the time: user id, email, kind (admin/committee) and display
  name (committee: `event_committee.name`; admin: their email, unless the builder finds a name on
  file). Removing a committee member later does not change their past rows.
- **Detail** stored as JSON on the row (field-level before/after, deleted snapshots, bulk lists).
  Every person inside a detail carries their attendee id and email, and the row keeps an array of
  every attendee id it touched (indexed), so a by-hand PDPA erasure can find all rows naming one
  person and strip them out of bulk entries with a single query. The builder writes that query
  down (a commented SQL snippet beside the migration or in the feature folder's README).
- Lives in `src/features/attendee-log/` per the modular-features convention; call sites in the
  existing actions call one helper.
- **Purge:** the personal-data purge (`purgeEventAction` → `purgeAttendeePersonalData`) deletes
  the event's log rows too.

## Left to the builder

- Table and column names, the JSON shape, indexes.
- Whether the log write sits inside an RPC with the change or straight after it — as long as a
  failed log write is never silent.
- Panel vs modal for row detail; empty state wording.
- How to keep import / bulk logging inside the time budget (one insert per action, diffs computed
  from data already loaded).
- Tests in the style of the repo (the access-guard test must still pass; the new view uses
  `requireEventAccess`).
