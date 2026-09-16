# Breakout room sessions — design

Date: 2026-09-13
Status: approved for implementation
Extends `2026-09-07-orange-lobby-pilot.md`. Decisions D76–D87.

## 1. Why

Attendees split into rooms and the app cannot say which room is yours.

Today a breakout is one agenda row — "Breakout: regional teams", 13:30–15:00, location
"Rooms 3A to 3D", visible to everyone — plus an announcement telling people to find their group on
the floor plan. The room assignment lives in the client's spreadsheet and reaches the attendee by
paper, or not at all.

A per-attendee agenda filter already exists: `visibleTo()` hides an item unless the attendee's
`category` matches one of the item's `categories[]`, and the live event already uses it (the
Leadership session is tagged `["Management"]`). Its ceiling is one group per person, because
`attendees.category` is a single string — so it cannot express "Group A at 13:30, Group C at 15:30",
and spending an attendee's category on a breakout group costs whatever that category was doing
before.

## 2. Decisions

- **D76** A breakout **is an agenda item**, not a parallel schedule. It already has a day, a time, a
  room and a title, and it belongs on the agenda. The only new idea is *assignment*.
- **D77** An event has **several breakout rounds**, not one. Every part of this design assumes a
  second round exists, because discovering one in October would mean a migration during an event.
- **D78** `agenda_items` gains two nullable text columns. `slot` names the round
  ("Breakout 1") and groups items that are alternatives to each other; `code` is this room's value
  ("3A"). An item with a null `slot` behaves exactly as agenda items do today.
- **D79** Assignment is a **join table**, `breakout_assignments`, not a match against the imported
  spreadsheet value. Considered and rejected: matching `attendees.extra["Breakout 1"]` against
  `code` would have needed no new table and no import work, but a typo in the client's sheet — `3a `,
  `Room 3B` — would read as "unassigned" with nothing to catch it.
- **D80** The assignment row carries a **denormalised `slot`**, with `unique (attendee_id, slot)`, so
  the database refuses to put one person in two rooms of the same round. Enforcing that in
  application code was rejected: two organisers on two laptops at breakfast is exactly when it
  breaks and exactly when nobody reads logs. Renaming an item's `slot` must update its assignment
  rows.
- **D81** `visibleTo()` takes the **attendee**, not their category string, and applies two
  independent filters that must **both** pass: today's category rule, unchanged, and an assignment
  rule that applies only to items carrying a `slot`.
- **D82** Assignments arrive two ways: a re-runnable **"Assign from column"** action, and the
  existing bulk bar for day-of moves. Attendee self-selection is **out of scope** — it needs
  capacity, race handling, an opening and closing time, and a story for whoever never picks.
- **D83** "Assign from column" is **explicit and re-runnable**, not automatic on import. The
  masterlist is imported before the agenda exists, so anything automatic would silently assign
  nobody. It fills blanks by default; overwriting existing assignments is a separate tick, so
  re-importing on the morning of day 2 does not undo the desk's twelve moves at breakfast. Its report
  — how many matched, and which values matched no room — is the typo detector D79 exists to make
  possible.
- **D84** The imported value stays in `attendees.extra` as **provenance** and is never read by the
  portal. It is what you reconcile against when the client says "but we put her in 3B". Two-way sync
  was rejected: it has no correct answer when the two disagree. The consequence to accept is that the
  attendee table can show a "Breakout 1" column whose value differs from the room the person is in,
  so the roster view must be visibly the authority.
- **D85** An attendee with no assignment for a slot sees a **placeholder row** — the slot's time,
  "Room not assigned yet", and the desk's number — not a silently missing ninety-minute block. The
  admin sees a count of how many people that is, which is what lets the desk find them at breakfast
  rather than at 13:29.
- **D86** The portal shows breakouts **twice**: as ordinary agenda rows, filtered, with the room
  reading stronger than on a normal row; and as a "Your breakouts" card below the badge listing every
  round across the event. The card renders **only** for events that have breakout slots, so every
  event that does not run breakouts sees no change.
- **D87** The roster export is **one sheet per room**, printable, plus a sheet of the unassigned. A
  row-per-attendee-column-per-slot sheet was rejected: that is the file the client already has,
  because they sent it.
- **D88** Deleting a breakout agenda item **cascades** its assignments, matching how deleting a
  checkpoint already cascades its check-ins.

## 3. Out of scope

- Attendee self-selection, and therefore room capacity (D82).
- Scanning at a breakout room door. Breakout rooms do not become checkpoints; no scan gains a
  right-room verdict. Nobody has asked to police breakout doors.
- Automatic balancing across rooms.

## 4. Schema

```sql
alter table agenda_items add column slot text;
alter table agenda_items add column code text;

create table breakout_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  agenda_item_id uuid not null references agenda_items(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,
  slot text not null,
  created_at timestamptz not null default now(),
  unique (attendee_id, slot)
);
```

Additive; the currently deployed code neither knows nor reads any of it.

## 5. Sequencing

After `feat/custom-tiles` and `feat/pinned-fields` are verified by the user and merged. This is the
largest of the three features, and stacking a third unverified branch is how the 23 Sep dry run turns
into a debugging session.

## 6. Risks

- **The denormalised `slot` (D80) can drift** from its agenda item if a rename path misses it. One
  line in the update path, and a test that proves it.
- **Two records of the same fact (D84).** Accepted deliberately; mitigated by the roster view being
  the authority and by the report in D83.
- **`visibleTo()`'s signature change (D81) touches every agenda surface** — portal home, both agenda
  pages, `loadHomeData`. A missed call site fails closed (shows too little), not open.
- **Verification gap, unchanged.** The admin is login-gated and Claude cannot enter credentials; the
  portal can be driven in the browser pane. The admin half goes on a checklist for the user.

## 7. Verification

`npm test`, `npm run lint`, `next build` per task. Portal verified in the browser pane against the
live event. Admin added to the user's checklist. Migration 0007 applied at merge, not before.
