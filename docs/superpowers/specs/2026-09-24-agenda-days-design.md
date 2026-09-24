# Agenda days — design

Date: 2026-09-24
Status: approved, not built
Decisions D193–D201. Target: live for the KOM pilot (30 Sep 2026).

## 1. Why

A day on the agenda exists today only because some session carries its date. An organiser
cannot set up "Day 2 (Teambuilding)" before its sessions exist, cannot name a day, and the
portal's tabs can only ever say "Wed 30 Sep". Sessions are ordered by start time alone, so
nothing without a time — a poster, a map, a dress-code card — can sit in the programme.

The organiser wants to build the agenda the way they think about it: create the day first,
name it, then fill it with sessions and images in the order they want them shown.

## 2. Decisions

- **D193** Days are rows in a new **`agenda_days`** table (`id`, `org_id`, `event_id`,
  `date`, `name`), one per date per event (`unique (event_id, date)`). `name` is optional; an
  unnamed day is labelled by its date everywhere. Days sort by date — there is no day-level
  ordering to maintain.

  *Chosen over a jsonb list on `events`* (the `modules` / `pinned_fields` idiom), which was
  recommended as the smaller change for the pilot deadline. The organiser preferred the
  relational model: a day has an identity of its own, independent of its date.

- **D194** `agenda_items.day_id` (not null, `on delete cascade`) points at the day, and
  **`agenda_items.day` stays as a copy of the day's date that the database maintains**:
  - a `before insert or update of day_id` trigger on `agenda_items` sets `day` from the day;
  - an `after update of date` trigger on `agenda_days` rewrites `day` on every child row.

  *Why keep the copy.* Every reader of the agenda — `isNow`, `nextSession`, `groupByDay`,
  `mergeAgenda`, `myBreakouts`, the rosters export, the day tabs — reads `item.day`. Keeping
  it means none of them change. *Why a trigger rather than application code.* The last
  denormalised copy in this area (`breakout_assignments.slot`, D80) depends on every rename
  path remembering to call `renameSlotAssignments()`. A trigger cannot be forgotten.

- **D195** Transitional insert rule. For the minutes between applying the migration and
  deploying the code, the old "Add session" form inserts a row with a `day` date and no
  `day_id`. The insert trigger resolves such a row to the day for that date, **creating the
  day if none exists**, and an old-code edit that changes `day` moves the row to that date's
  day the same way. Applying the migration before the deploy is therefore safe. The reverse
  is not: the new code reads `agenda_days`, so it must not deploy before the migration. Once
  the code is deployed every write sends `day_id`, and the fallback is dead but harmless.

- **D196** Agenda rows gain a **`kind`**: `'session'` (default) or `'image'`. An image row
  carries `image_url` (required for the kind), an optional caption in `title`, optional
  `categories`, and **no time**: `starts_at` becomes nullable, with
  `check (kind = 'image' or starts_at is not null)`. `ends_at`, `location`, `slot`, `code`
  and `color` are always null on an image. Images use the same bucket, upload field and
  cleanup as session images (D160).

  *Not a reversal of D160.* D160 rejected a full-width picture *inside a session row*,
  because a day of them stops being a schedule. An image row is the organiser choosing to
  put a picture in the programme as an item of its own; a session's picture stays a
  thumbnail.

- **D197** **Each day is hand-ordered** by `sort_order`, replacing time order everywhere
  the agenda is sorted. Placement rules:
  - a **new session or round**, or one whose **start time is edited**, is placed by time:
    immediately before the first *timed* row in its day that starts later (images are
    skipped when comparing), otherwise at the end;
  - editing anything else leaves the row where it is;
  - a **new image** goes to the end of its day;
  - a **breakout round** is one row: all its rooms share one position and move together;
  - moving a session or round to **another day** (its Edit form's day picker) places it in
    the new day by time.

  Organisers reorder by drag or by move-up/move-down buttons, saving immediately, the
  `CheckpointList` idiom (`moveItem`, `useOptimistic`, snap back on failure).

- **D198** An attendee's **booked activity sessions** (`bookedAgendaRows`, D133) are folded
  into the hand-ordered day by the same rule as a new session: before the first timed
  organiser row that starts later. `mergeAgenda` changes from a sort to that insertion.
  Two booked rows at the same time keep their session `sort_order` between themselves.

- **D199** **Portal day tabs** come from the defined days, in date order, **plus** any date
  that has one of this attendee's bookings but no day (labelled by date, as today) — a booking
  is never hidden for want of an agenda day. A named tab shows the name with the short date
  small beneath it; an unnamed tab shows the date alone. The strip scrolls horizontally when
  it does not fit rather than wrapping. **The tab URL stays `?day=YYYY-MM-DD`** — dates are
  unique per event — so links already shared keep working and `pickDay` is unchanged. A day
  with nothing visible to this attendee still has a tab and says "Nothing scheduled on this
  day."

- **D200** **Anything that needs a time goes through one helper** that narrows to timed
  sessions: "happening now" / "up next" on the home page, booked-row placement, breakout
  rows, and the rosters export. Images never appear there. `AgendaItem.starts_at` becomes
  `string | null`, so TypeScript finds every reader that has not been narrowed.

- **D201** **Deleting a day** deletes its rows (cascade) and, through the existing cascade,
  their breakout assignments. The action reads the day's `image_url`s before the delete and
  removes those objects from the bucket afterwards, in the D160 order. The confirmation names
  the cost: "Delete Day 1 and its 14 sessions? Anyone assigned to its breakout rooms loses
  their room."

## 3. Migration 0038 — conversion of existing events

In one migration, in this order:

1. Create `agenda_days` (RLS enabled, no policies — reads go through the service client, as
   for `agenda_items`). Index `(event_id, date)` via the unique constraint.
2. Insert one **unnamed** day per distinct `(event_id, day)` already in `agenda_items`.
3. Add `day_id` nullable, backfill it from `(event_id, day)`, then set it `not null`.
4. Add `kind` with default `'session'`; relax `starts_at` to nullable; add the check.
5. **Rewrite `sort_order`** within each day as 10, 20, 30… in the order attendees see *today*:
   `day, starts_at, sort_order, created_at`. Stored `sort_order` values on ecpkom do not
   follow time order, so the conversion must reproduce the current display, not the stored
   numbers. Rooms of one breakout round receive the same value.
6. Create both triggers (D194, D195).
7. Replace `agenda_items_event_day_idx` with `(day_id, sort_order)`.

Because every converted day is unnamed and every day's order equals today's display, **the
portal renders identically after the migration** until an organiser names a day or drags a
row. That is the conversion's acceptance test (§6).

## 4. Admin — the Agenda page

- Header: "N days · M sessions". Buttons: **Add day**, and the existing **Image** (the event's
  single agenda banner, unchanged).
- **Add day** / **Edit day**: date (defaults to the first event date without a day) and
  optional name. A date already used is refused: "There's already a day on 30 Sep." Editing
  the date notes that attendees' activity bookings are dated separately and do not move.
- One card per day, in date order. Card header: name · date, **Edit**, **Delete** (D201).
  Card footer: **Add session**, **Add breakout round**, **Add image** — none of these forms
  asks for a date any more; the card supplies `day_id`.
- Rows render as today (time, title, room chips and counts, category badge, Edit, Delete)
  plus a drag handle and move-up/move-down buttons. An image row shows a thumbnail and its
  caption. An empty day reads "Nothing on this day yet."
- Session and round Edit forms gain a **Day** picker (the event's days), replacing the date
  input.
- The reorder action receives the day's full ordered list of row keys (item ids; a round's
  key is its slot) and **refuses** any list that is not exactly the rows of that day of that
  event — the optimistic list then snaps back.

## 5. Portal

- `AgendaList` (personal agenda, anonymous agenda, desktop home) takes the tab list from D199
  and renders rows in hand order.
- **Image row:** the picture at full column width, shown whole (`object-contain`, never
  cropped), caption beneath, tap to open full size in the same dialog `AgendaImage` uses.
  Category-filtered exactly as sessions are (`visibleTo`).
- Unchanged: the agenda banner above the tabs; breakout rooms show only the attendee's own
  room; the booked-session calendar download.

## 6. Testing and verification

Unit (vitest, pure functions):
- placement by time — new, retimed, moved-between-days; images skipped; ties; empty day;
- `mergeAgenda` insertion of booked rows into a hand-ordered day;
- tab list — defined days, booking-only dates, labels named/unnamed, date order;
- reorder validation — missing, extra, foreign, duplicated keys refused;
- now/next and breakout helpers ignore image rows.

Conversion, against the live database:
- **Before** applying: run step 5's ordering as a read-only `select` for ecpkom and the test
  event and compare it with the order the portal shows today.
- **After** applying (old code still deployed): fetch each event's portal agenda HTML for
  every day and diff against a copy saved beforehand — they must be identical.

By hand in the browser pane (test event `az-asia-rare-neurology-brand-forum`): add, rename,
re-date and delete a day; drag and arrow-key reorder; add an image restricted to a category
and view it as attendees in and out of that category; tabs at 375px with long names.

## 7. Rollout

- 24 Sep: this spec.
- 25–26 Sep: implementation plan and build.
- 27 Sep: apply 0038, verify (§6), deploy.
- 28 Sep: organiser names the ecpkom days and checks on phones.

## 8. Not doing

- Day-level images or per-day banners (one agenda banner stays on the event).
- Reordering days by hand — date order is the order.
- Moving attendees' activity bookings when a day's date changes.
- Collapsing `CheckpointList` / `TileList` / `PinList` and the new agenda list into one
  reorder component (task_df61815b, after the pilot).
