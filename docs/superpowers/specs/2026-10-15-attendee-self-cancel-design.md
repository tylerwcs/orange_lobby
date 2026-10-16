# Attendees cancel their own registration — design

Date: 15 Oct 2026. Decisions D580–D592. Migration 0084.
**Amended 15 Oct 2026 (D593–D599, migration 0085): cancelling needs an organiser's approval** — see
"Amendment: approval" below. Where it disagrees with D582/D585/D586, the amendment wins: the
attendee now *asks* to cancel, and the cancel itself (D580–D582) happens when an organiser approves.

## Amendment: approval (D593–D599)

**D593 — The attendee asks; an organiser approves.** The same button and dialog, but confirming
sends a request: `attendees.cancel_requested_at` is set. Nothing else changes until an organiser
approves. Dialog: title `Ask to cancel your registration for <event>?`, body `Your request goes to
the organiser. You stay registered until they approve it.`, buttons `Yes, ask to cancel` /
`Keep my place`. Flash after sending: `Request sent. The organiser will confirm.`

**D594 — While a request waits, they are fully registered.** Counted, listed, can book, can check
in, can use the portal. D581's exclusions apply only once approved (`cancelled_at` set).

**D595 — Waiting state and withdraw.** Instead of the Cancel card/link, the Me page (live) and the
draft page show `You asked to cancel on <d MMM>. The organiser will confirm.` and a plain-form
button `Withdraw request` (no dialog). Flash: `Request withdrawn.` `canSelfCancel` refuses a second
request with `You've already asked to cancel.`

**D596 — Decline.** Declining clears the request and sets `attendees.cancel_declined_at`. The Me
page (live) / draft page then show `The organiser declined your cancellation request.` above the
usual Cancel card (they may ask again while D584 allows it). Asking again clears
`cancel_declined_at`.

**D597 — Turning up withdraws the request.** Any check-in (scanner, crew link, admin bulk
check-in) clears `cancel_requested_at` for that attendee: they came.

**D598 — Organisers approve in Attendees.** A `Cancellation requests (<n>)` view
(`?show=requests`) beside `Cancelled (<n>)` lists waiting requests — Name, Email, Asked on — with
**Approve** and **Decline** per row (plain server forms). Approve runs the D580–D582 cancel (mark,
free bookings, withdraw change requests) and clears the request; flash `Cancelled <name>.`.
Decline: flash `Declined <name>'s request.`. Both stay on the requests view. Admins and committee
alike (`requireEventAccess`, D588). The cut-off (D583) limits *asking*; approving works any time
until archive. The sidebar's **Attendees** item shows a badge with the waiting count. No WhatsApp
alert (D589 still holds).

**D599 — Data.** Migration 0085 adds `attendees.cancel_requested_at timestamptz` and
`attendees.cancel_declined_at timestamptz`, plus a partial index on `(event_id)` where a request
is waiting and the row is not cancelled.

## Amendment: reason (D613–D616), 16 Oct 2026

Replaces the "A reason field on cancel" line under Out of scope.

**D613 — A reason is required to ask.** The D593 dialog gains one open text box, label `Reason`,
placeholder `Let the organiser know why you can't make it.` `Yes, ask to cancel` stays disabled
until something is typed. The action trims it and refuses an empty one (`Tell the organiser why
you're cancelling.`) or one over 500 characters (`Keep the reason to 500 characters or fewer.`).

**D614 — It belongs to the request.** Stored in `attendees.cancel_reason` when they ask. Withdraw,
decline, a check-in (D597), Restore (D588) and registering again (D587) clear it; approving keeps
it, so a cancelled row still says why.

**D615 — Organisers see it.** A `Reason` column on the requests view (D598), a `Reason` line under
the cancelled badge on the attendee page, and a `Cancel reason` column after `Cancelled at` in the
Attendance export. Requests made before this change show `—`.

**D616 — Data.** Migration 0088 adds `attendees.cancel_reason text`, 1–500 characters when set.

## Goal

A registered attendee can cancel their own registration from their personal link, on events
where the organiser allows it. The organiser keeps a record of who cancelled and when, and a
cancelled person stops counting anywhere the event counts people.

Two moments, one action:
- **Live event (portal open):** a button at the bottom of the **Me** page.
- **Draft event (portal shows "Coming soon"):** a small link under the Coming soon card on
  their personal link — the only page they can reach while the event is draft.

Success looks like:
- An attendee cancels in two taps and sees a clear "You've cancelled" page on their link.
- Organisers see them under a **Cancelled** filter in Attendees and in exports, and nowhere else
  (counts, scanner, WhatsApp, groups, games, booths).
- If registration is still open, they can register again with the same email and get their
  original record and link back.

## Today (what this changes)

- `attendees.status` exists (`'active'` default) but nothing reads or writes it. There is no
  cancelled state; withdrawing means emailing admin@ecopiaevents.com and an admin hard-deletes
  the row (check-ins, bookings, entries and the WhatsApp log go with it).
- A draft event's personal link renders only "Coming soon" (`isUnpublished`, `PortalChrome`).
- Re-registering the same email updates the existing row and returns the same token
  (`upsertByEmail`).

## Decisions

### The record

**D580 — Cancel marks, it does not delete.** A new `attendees.cancelled_at timestamptz` (null =
active). Everything else on the row stays. The unused `status` column is left alone.

**D581 — Cancelled people drop out of everything except the record.** Every read that lists,
counts or finds attendees excludes `cancelled_at is not null` by default:
- counts (`countAttendees`: events list, overview, exports page, booth page, door counts);
- lists (`listAttendees`, `listAttendeesByIds`, `listCategories`) and therefore the admin
  table's default view, every xlsx export, `qr.zip`, groups and rosters, agenda assignment,
  WhatsApp audiences and sends;
- scanner and booth **search** (name/email): cancelled people are not offered;
- games player lists (`features/games/db.ts`), group reads (`src/lib/db/groups.ts`).

**Lookups by token are the exception, and each caller decides.** `findByToken` (and the games
token lookup) return a cancelled row with its `cancelled_at`, because the caller must say something
specific: the portal shows the cancelled page (D585); the scanner and booth show
**"Cancelled registration"** and refuse the check-in or stamp; the games play page refuses to join.
The only places that see them are the ones in D588 (Attendees' Cancelled filter, exports' cancelled
column, the attendee detail panel) and the portal's own cancelled page (D585).

**D582 — What cancelling also does.** In the same step:
- their activity **bookings are deleted** (the slots open for others) and any **pending change
  requests** are withdrawn;
- they are **not** removed from their group row, but D581 hides them from rosters and counts;
- entries already submitted, points already earned, check-ins and polaroids **stay** (history is
  history; a team's earned points do not drop because a member later cancelled);
- nothing is sent to them or to the organiser (D589).

### When an attendee may cancel

**D583 — Off by default, per event.** Settings → Registration form gets
"Attendees can cancel their own registration" (`events.self_cancel boolean not null default
false`) and an optional **"Cancelling closes at"** date-time (`events.self_cancel_closes_at
timestamptz`), the same input as "Closes automatically at". Saved with the big Settings form, so
both join `updateSettingsAction` and its `formKey`.

**D584 — Refused when:** the switch is off; the cut-off has passed; the event is archived; or they
have **any check-in** on this event (they turned up). Refused cancels show why, in plain words, and
the button does not render in those cases (the server re-checks anyway).

### What the attendee sees

**D585 — The button and the cancelled page.**
- **Live:** a "Cancel my registration" section at the bottom of Me, below the cards — a short line
  ("Can't make it any more? You can cancel until <cut-off>.") and an outline destructive button
  that opens a confirm dialog: "Cancel your registration for <event>? You'll lose your place and any
  activity bookings. This can't be undone from here." → **Yes, cancel** / **Keep my place**.
- **Draft:** under the Coming soon card, a small text link "Can't make it? Cancel my registration"
  opening the same dialog.
- **After cancelling (live or draft):** every page on their personal link shows one card:
  "You've cancelled your registration for <event>." plus, while registration is open,
  **Register again** (links to the event's register page). No nav, no portal pages, no consent gate.
- The Me page item is **not** part of the Me-page show/hide checklist (D536): the event switch is the
  one control.

**D586 — Authorised by the token, like every portal action.** A server action bound to
`(slug, token)` re-loads the attendee and event, re-checks D584, rate-limits `cancel:<token>`, then
writes. The confirm dialog needs JavaScript; the action itself is a plain server action re-checked
on the server.

**D587 — Register again reactivates.** `upsertByEmail` on a cancelled row clears `cancelled_at`
(same token, same record, answers merged as today). Registration's own open/closed rules decide
whether that is possible. The "You're in" page then behaves as for any registration.

### What the organiser sees

**D588 — Attendees and exports.**
- Attendees: a **Cancelled** filter alongside the existing ones (count in the label), hidden from
  the default list. Cancelled rows show a "Cancelled · 15 Oct" badge in the table and detail panel.
- The attendee detail panel of a cancelled person offers **Restore** (clears `cancelled_at`, same as
  D587; bookings are not restored). Restore uses `requireEventAccess` like other attendee edits.
- Exports: the Attendance export (the Attendees table's export) includes cancelled rows with a
  **Cancelled at** column; every other export excludes them.
- Committee members (D550–D566) see and can restore cancellations like admins — it is event data.

**D589 — No notification in this version.** A WhatsApp alert needs a new Meta-approved template;
it can follow later. The Attendees filter is the place to look.

### Guarding the filter

**D590 — One place decides "active".** All attendee reads go through `src/lib/db/attendees.ts`
(plus the two existing direct readers, `groups.ts` and `games/db.ts`, which add the same filter).
List and count readers take an explicit `{ includeCancelled: true }` only where D588 needs it;
token lookups always return the row and every caller handles `cancelled_at` (D581).

**D591 — A guard test** (`tests/attendee-reads-guard.test.ts`) reads `src/` and fails if a file other
than the allowed list queries `.from("attendees")`, and if an allowed reader's `select` chain lacks
the cancelled filter or an `includeCancelled` branch. New readers must opt in on purpose.

**D592 — Privacy wording.** The privacy notice and consent gate keep saying data is deleted within
twelve months or on request; a cancelled row is personal data like any other and goes with the
event purge. No copy change in this version.

## Out of scope

- Notifying organisers or the attendee (D589).
- A reason field on cancel.
- Cancelling from the "You're in" page right after registering.
- Hard-deleting on cancel, or an attendee-side "delete my data".
- Admin bulk "mark cancelled" (admins keep Delete as today).

## Testing

- **Unit:** the pure rule `canSelfCancel(event, attendee, hasCheckin, now)` (switch off, cut-off
  passed, archived, checked in, already cancelled, allowed; draft allowed); the guard test (D591);
  `upsertByEmail` reactivation decision as a pure helper.
- **Browser, on ecpkom only (never ecphub), with a throwaway attendee:** switch on → Me shows the
  section → cancel → link shows the cancelled card; Attendees default list and counts drop by one,
  Cancelled filter shows them, Attendance export includes them with the date; Links and other
  exports exclude them; scanner scan of their token shows "Cancelled registration"; register again
  with the same email → same link works again; set the event to draft → cancel link under Coming soon works;
  switch off / cut-off passed / checked-in → no button and the action refuses.
- **Cleanup:** delete the throwaway attendee, switch the setting back off, restore ecpkom's status.
