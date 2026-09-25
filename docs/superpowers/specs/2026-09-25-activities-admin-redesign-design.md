# Activities admin redesign — design

Date: 2026-09-25
Status: built 2026-09-25 (not yet deployed)
Decisions D234–D247.

## 1. Why

An activity's admin page is one long column. InBody Scan (32 sessions) is ~5,300px tall:
monitoring panels and setup are stacked, and Settings sits at the very bottom. Sessions are a
flat list added one form at a time, so 15-minute slots across two days are 32 separate
submissions. The question editor is an 8-column table with fixed empty rows and exposes
internal keys ("Key", "depends on key").

The organiser mostly comes back to an activity to **edit its setup**, not to monitor it. So
the page opens on setup, and monitoring is one tab away instead of stacked on top.

Out of scope: the Activities list page and the New activity dialog layout (they were not the
pain). They pick up the new question editor automatically because it is shared.

## 2. Decisions

### Page structure

- **D234** **Every activity page is a header plus tabs.** The header keeps what it has today:
  name, the count subtitle, the Open switch and the ⋯ menu. Under it, a tab strip. The tab is
  a query parameter (`?tab=`), rendered on the server, so a tab is linkable, survives reload,
  and Back works. An unknown or missing `tab` means Setup.

- **D235** **Tabs per kind**, worked out by one pure function `activityTabs(kind, counts)`:
  - Booking: **Setup** · **Bookings** *(booked people count)* · **Not booked** *(count)*
  - Submission: **Setup** · **Submissions** *(count)* · **Not submitted** *(count)* ·
    **Participation** *(per-day activities only)*
  - Passport: **Setup** only, and a kind with one tab shows no strip.

  A tab's count is a plain number beside its label. Bookings shows an attention dot while
  change requests are pending, so the queue is not missed now that it is off the landing view.

- **D236** **Setup is the default tab.** Its content, top to bottom:
  1. **Details and rules**: one form, one Save. Name, description, cover image, then the
     kind's rules (categories, sessions per person / required; dates, venue, button wording,
     per-day, cap; stamps needed, reward message). For a submission activity the questions
     are part of this same form, as today.
  2. The kind's building blocks, each saving on its own as today: **Sessions** (booking) or
     **Booths** (passport). Submission has none; its questions live in the form above.

  The form keeps D127: no `is_open` field; the header switch owns it. The `#settings` anchor
  the ⋯ menu uses becomes a link to `?tab=setup`.

- **D237** **Bookings tab** (new, booking only): the change-request queue at the top when
  there are any requests, then every session grouped by day, each with `booked / capacity` and
  the names of the people booked. This view does not exist today (only an export does). It
  reads `listBookings`, which the page already loads.

- **D238** **Not booked / Not submitted / Participation tabs** hold exactly today's panels
  (`UnbookedPanel`, `MissingPanel` with its `?day=` picker, `ParticipationPanel`), unchanged.

- **D239** **Redirects land on the tab the action came from.** Placing people returns to Not
  booked; approving or declining a request returns to Bookings; saving setup, adding or
  deleting sessions, and booth changes return to Setup. `detailPath(eventId, activityId, tab)`
  builds them, so no action hand-writes a query string.

### Sessions

- **D240** **Sessions are grouped by day and kept in time order automatically.** Each day is a
  section headed `Mon 28 Sep · 16 sessions · 0 of 48 booked`, with the day's sessions as
  compact rows: time range, booked/capacity, and the location only where it differs from the
  day's usual one. Clicking a row opens the existing edit dialog, which now also holds Delete.
  **Manual drag reorder is removed.** `listSessions` already orders by day, then start time,
  then `sort_order`, for the admin and the portal alike, so the drag only ever decided the
  order of sessions starting at the same moment. Those now keep the order they were added in.
  `reorderSessionsAction` and `setSessionOrder` are deleted.

- **D241** **Add sessions in bulk.** The "Add sessions" dialog takes: days (one or more date
  inputs, first one prefilled with the event's start date, "+ Add day"), from and to times,
  length (5–240 minutes), optional breaks to skip (from–to, "+ Add break"), seats per session,
  and location. Before submitting it says how many sessions it will make ("Makes 32 sessions").
  One pure function `generateSlots` does the maths and is unit-tested:
  - A slot runs start → start + length and is kept only if it ends by the "to" time.
  - A slot overlapping a break at all is dropped. Slots continue after the break at the next
    whole step from the "from" time (11:00, 11:15 … 12:45, [break 13:00–14:00], 14:00 …).
  - A slot matching an existing session of this activity (same day and start time) is
    skipped, and the flash says so: "Added 28 sessions. 4 already existed."
  - Refused with a message rather than truncated if it would make more than 200.
  A single session is the same dialog with one day and a "to" one step after "from".

- **D242** **Delete a whole day.** Each day section has "Delete day", confirmed with the
  number of sessions and bookings it takes (bookings cascade as today, D135).

### Questions

- **D243** **Questions are cards.** The table is replaced by one card per question, used by
  both the registration form in Settings and a submission activity (D174 stays: one editor).
  A collapsed card reads `2 · Before photo — File · required · conditional`. Clicking expands
  it; one is expanded at a time. Expanded fields: label, type, required, choices (Choice
  only, one per line), help text, and Show only when. **Add question** appends an expanded
  card; the button is replaced by a note at the limit. No fixed empty rows.

- **D244** **Keys are never shown.** A saved question carries its key in a hidden input, so
  relabelling it cannot orphan stored answers. A new question posts no key, and
  `questionsFromForm` derives it from the label as it does today for a blank key.

- **D245** **"Show only when" picks a question, not a key.** A dropdown of the questions above
  this one (by label), then: for a Choice question, a dropdown of its choices; for anything
  else, a "contains" text box. A question not yet saved is offered under the key its label will
  get, computed with the same slug rule the parser uses.

- **D246** **Reorder by drag, arrow buttons, or arrow keys on the handle**, the same idiom as
  `SortableList`. Remove is immediate and needs no confirmation, because nothing is saved
  until the form's Save.

- **D247** **The field contract with `questionsFromForm` is unchanged.** The cards post the
  same `q_${n}_*` fields as the table, numbered 1…count in on-screen order. A pure
  `questionFormEntries(questions)` produces them, and a round-trip test proves
  `questionsFromForm(questionFormEntries(qs))` returns `qs`. The server side of both forms
  does not change. Choices are typed one per line but still posted comma-joined, so a choice
  still cannot contain a comma (true today as well); the card says so under the box.

## 3. Units

| Unit | Kind | Purpose |
|---|---|---|
| `activityTabs(kind, counts)` | pure, `src/lib/activity-tabs.ts` | Which tabs exist, their counts, dots, the resolved current tab |
| `generateSlots(input, existing)` | pure, `src/lib/session-slots.ts` | Bulk session maths (D241) |
| `groupSessionsByDay(seats)` | pure, same file | Day sections with totals (D240) |
| `questionFormEntries(qs)` | pure, `src/lib/questions-form.ts` | Cards → form fields (D247) |
| `ActivityTabs` | component | The tab strip (links) |
| `SessionDays` | client component | Replaces `SessionList`: day sections, rows, edit/delete, Delete day |
| `AddSessionsDialog` | client component | The bulk form with its live count |
| `QuestionCards` | client component | Replaces `QuestionEditor` in both places |
| `BookingsByDay` | component | The Bookings tab list (D237) |
| `addSessionsAction`, `deleteSessionDayAction` | server actions | Bulk insert; delete a day |
| `createSessions`, `deleteSessionsOnDay` | db | One insert for a batch; one delete for a day |

The detail route keeps its three kind branches (D178), each reduced to "header + tabs + the
current tab's content".

## 4. Errors

- The bulk dialog refuses empty days, from ≥ to, length out of range, seats < 1, and more
  than 200 slots, with the message shown in the dialog (flash) and nothing written.
- A bulk insert is one insert statement, so it either all lands or none does.
- Deleting a day uses the same event and activity scoping as deleting one session.

## 5. Testing

- Unit: `generateSlots` (steps, end cut-off, breaks, duplicates, the 200 cap, multi-day),
  `groupSessionsByDay`, `activityTabs` for each kind, and the question round-trip including
  show-when and choices.
- Browser, on a test event (never ECP Hub): generate InBody's 32 slots in one go; delete a
  day; edit a session; move through every tab of each kind; add, reorder and remove questions
  on a test submission activity and on a test event's registration form, save, reload, and
  confirm stored answers still show under their questions.
