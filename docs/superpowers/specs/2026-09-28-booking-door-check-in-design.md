# Booking door check-in — design

Approved in chat on 28 Sep 2026. A checkpoint can stand for a booking activity instead of the
whole event. Its scanner then shows who booked that day's sessions, lets crew mark them
arrived, and says who did not come. The activity's Bookings tab shows the same marks.

The only booking activity in the data today is ecphub's "InBody Scan": 32 fifteen-minute slots
over 2 days, 3 seats each, one session per person. That shape drove D325: one door per
activity per day, not one per slot.

## Decisions

- **D324 — A booking door is a checkpoint with an activity.** `checkpoints.activity_id` is
  nullable. Null is an ordinary door where everyone registered is expected. Set, it is a
  *booking door*: the expected people are those booked into that activity's sessions on the
  checkpoint's `day`. Only `kind = 'booking'` activities of the same event qualify.
- **D325 — One door per activity per day, not per session.** A door covers every slot of its
  activity on its day. The scanner groups the expected people by slot.
- **D326 — Not booked: warn, then allow.** A scan or search of someone with no booking at
  this door's activity that day does not record anything. It shows an amber "Not booked for
  this session" card with a **Let them in anyway** button. The button records an ordinary
  check-in.
- **D327 — A walk-in is derived, never stored.** A walk-in is a check-in at a booking door by
  someone with no booking there that day. `checkins` is unchanged.
- **D328 — Arrival is per door, not per slot.** `unique (checkpoint_id, attendee_id)` stays.
  Someone booked into two slots of the same activity on one day is marked arrived for both
  by one check-in. InBody Scan caps bookings at one per person, so this cannot happen there
  today.
- **D329 — Deleting the activity keeps the attendance.** `on delete set null`: the door
  becomes an ordinary one with its name and check-ins intact. Deleting the checkpoint still
  deletes its check-ins, as today.
- **D330 — No-show means the slot has ended without an arrival.** A slot ends at `ends_at`.
  With no `ends_at`, it ends when the next slot that day starts. The day's last slot with no
  end is open until the day is over.
- **D331 — The count is booked arrivals.** At a booking door, "n of m in" means bookers who
  arrived out of bookers that day. Walk-ins are counted separately ("+1 walk-in") and never
  push the meter past full.

## Data

Migration `0052_booking_door.sql`:

```sql
alter table checkpoints
  add column activity_id uuid references activities(id) on delete set null;
create index checkpoints_activity_id_idx on checkpoints (activity_id);
```

- `Checkpoint` in `src/lib/types.ts` gains `activity_id: string | null`.
- The same-event and booking-kind rules are checked in the server action, as the rest of the
  checkpoint rules are. There is no trigger.

## Setup — Settings › Checkpoints

- The "New checkpoint" modal gains a **Who's expected** select, placed before Name:
  *Everyone registered* (value empty, the default) and one option per booking activity of
  this event, by name. It is hidden when the event has no booking activities.
- Name becomes optional when an activity is picked; blank takes the activity's name. With
  *Everyone registered*, Name stays required.
- Refused, with nothing saved:
  - an activity id that isn't a booking activity of this event;
  - a day on which the activity has no sessions — "InBody Scan has no sessions on Wed 30 Sep."
- No edit. A checkpoint is still created, reordered and deleted, never changed (D15).
- `CheckpointList` rows for a booking door show the activity name as a secondary badge. The
  count reads "n of m booked in", with m the number of people booked into that activity on
  that day.

## The scanner at a booking door

Both doors, `/scan/[eventId]` and `/crew/[token]`, render the same `Scanner`. The page loads
the door's *board* when `activity_id` is set and passes it in. An ordinary door behaves
exactly as today.

### Header

- "41 of 46 in": booked arrivals over bookers that day (D331). The progress meter uses the
  same two numbers.
- Walk-ins, when there are any, as "+1 walk-in" beside it.

### A scan or a search tap

- **Booked, first time:** the green "Checked in" card. It carries an extra field, "Booked",
  with the slot's time (e.g. "10:30–10:45"), placed first.
- **Booked, already in:** the amber "Already in" card, with the same "Booked" field.
- **Not booked (D326):** a new result status `not_booked`. It gets an amber band, the
  `CircleAlert` icon and the label "Not booked for this session", then the name and the
  scan fields. A **Let them in anyway** button calls the check-in again with `walkIn: true`,
  which records it and returns `ok`. The band pair is asserted in `tests/contrast.test.ts`,
  as the others are.
- In name search, a non-booker's hit shows a "Not booked" badge in place of "Check in".
  Tapping it gives the `not_booked` card, so the override is always one deliberate tap.
- Undo works as it does today.

### The expected list

At a booking door it replaces "Recent", in the same place in the rail.

- Slots are grouped by time. Each group heading shows the time, the location if any, and
  "n of m".
- Groups are phased by Kuala Lumpur time (`nowInKL`):
  - **Now:** started and not ended. Several can be Now when slots run in parallel.
  - **Next:** the earliest start still to come; all slots sharing that start.
  - **Later:** the rest still to come, collapsed under one disclosure.
  - **Earlier:** ended, collapsed under one disclosure. Each slot line shows "n no-show"
    when it has any.
- Now and Next are always open. On a door dated before today every slot is Earlier; on one
  dated after today every slot is Later. With no Now or Next group, all groups are shown
  open, in order.
- Each person row shows the name and either "arrived 10:31" (green dot) or a **Mark arrived**
  button, which calls the same check-in by id. A no-show in an ended slot shows a "No-show"
  badge and still has **Mark arrived**, because late arrivals happen.
- **Walk-ins** close the list: name and time.
- **Keeping phones in step:** the page refreshes itself every 15 seconds while visible, like
  the Overview's recent scans. A device's own scans and undos update its list and count at
  once, without waiting for the refresh.

## Activity › Bookings tab

On `BookingsByDay`, for each day that has a booking door for this activity:

- Each name carries a mark: ✓ arrived, ✗ "no-show" once its slot has ended, nothing while
  still to come.
- The slot's count becomes "booked / capacity · n came".
- A "Walk-ins" line closes the day when there are any.

Days without a door look as they do today. If the activity has no booking door at all, one
line above the list says: "To track who turns up, add a checkpoint for this activity in
Settings › Checkpoints." It links there and is shown only while check-in is on for the
event.

## Other screens

- **Scanner door list:** a booking door's badge reads `booked-arrived/bookers`.
- **Overview:** when the running checkpoint is a booking door, `OverviewStats` uses that door's
  bookers as the total and its booked arrivals as the count. Recent scans are unchanged.
- **Attendees › bulk "mark checked in":** unchanged. A booking door can be picked; anyone
  marked there who didn't book shows as a walk-in.
- **Attendance export:** unchanged. The door is one more column.
- **Check-in off (D159):** booking doors are checkpoints, so they are hidden and refused
  along with every other door.

## Code

- `src/lib/booking-door.ts`: pure functions, no DB.
  - `slotEnds(sessions)`: each session's effective end (D330).
  - `doorBoard(sessions, bookings, checkins, names, now)`: the phased groups, each person's
    state, walk-ins, `arrived`, `expected`, `walkIns`.
  - `bookedSlot(attendeeId, sessions, bookings)`: the slot a person is booked into, or null.
  - `arrivalMarks(...)`: the per-booking marks for the Bookings tab.
- `src/lib/db/checkpoints.ts`: `createCheckpoint` takes an optional `activityId`.
- `src/app/scan/[eventId]/actions.ts`: `doCheckin` checks the booking for a booking door. It
  returns `not_booked` unless `walkIn` is set, and adds the "Booked" field.
  `checkInByTokenAction`, `checkInByIdAction` and `searchAttendeesAction` pass the door
  through; `SearchHit` gains `booked: boolean | null` (null at an ordinary door).
- The scanner pages and Settings compute per-door totals through one helper, so the door list,
  the header, Settings and the Overview agree.

## Testing

- Vitest, test-first, on `src/lib/booking-door.ts`:
  - phases across a day: before the first slot, mid-slot, between slots, after the last;
  - parallel slots;
  - `ends_at` null, both mid-day and last;
  - doors dated in the past and the future;
  - no-shows only in ended slots;
  - walk-ins;
  - the count ignores walk-ins.
- `tests/contrast.test.ts` gains the `not_booked` pairs.
- In the browser, on a test event (never ecphub):
  - a booking activity with a few slots today and bookings;
  - a booking door;
  - scan and search a booker, and a non-booker (warn, then allow);
  - mark arrived from the list, and undo;
  - watch a slot turn into a no-show;
  - the Bookings tab marks;
  - the crew link.
