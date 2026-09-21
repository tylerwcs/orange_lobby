# Activity booking — design

Date: 2026-09-20
Status: awaiting user review
Extends `2026-09-07-orange-lobby-pilot.md`. Picks up what `2026-09-13-breakout-sessions-design.md`
parked at D82. Decisions D122–D141.

## 1. Why

Some things at an event are chosen, not assigned. A workshop track, a dinner sitting, a tour with
one minibus: the attendee picks, and the picking stops when the seats run out.

The app has no way to express that. Breakouts come closest — a round, its rooms, one room per
person — but D82 ruled self-selection out of scope precisely because it needs four things breakouts
never had: a capacity, a rule for two people claiming the last seat at the same moment, an opening
and closing time, and an answer for whoever never picks. Those four are this document.

The gap costs the organiser a spreadsheet and a WhatsApp thread, and costs the attendee a printed
list on a wall. Both are the same failure the portal exists to remove: the truth is somewhere the
person who needs it is not.

## 2. Decisions

- **D122** An activity is **its own kind of thing**, not an agenda item. Two alternatives were
  considered and rejected. Extending breakouts would hang capacity off `agenda_items.slot`, which is
  a bare text column with nowhere to put the policy an activity carries — `required`,
  `booking_open`, `max_per_attendee` and `categories` would be repeated on every room and drift. Making sessions agenda items would give `agenda_items` a third
  identity, after "ordinary row" and "breakout room", and every reader of that table — `visibleTo`,
  `agendaRows`, the editor, the exports — would have to disambiguate it. The cost accepted instead is
  a read-time merge (D133).
- **D123** Three tables: `activities` holds policy, `activity_sessions` holds the timetable and the
  capacity, `activity_bookings` holds who has a seat.
- **D124** The booking row carries a **denormalised `activity_id`**, for the same reason
  `breakout_assignments` carries `slot` (D80): the per-activity cap is counted without a join.
  It brings the same trap — moving a session to another activity would have to update its bookings
  in the same breath. **Resolved by removing the move rather than by handling it:** `updateSession`
  cannot change a session's `activity_id`, nothing in the admin offers a move, and the constraint is
  documented at the function. If a move is ever wanted it belongs in a function of its own that
  writes both tables, with a test proving the bookings followed.
- **D125** Capacity is enforced by a **database function under a row lock**, called via `rpc`.
  `count(*)` then `insert` is two statements and supabase-js has no transaction, so two phones at
  29 of 30 both read 29 and the room seats 31. The function locks the session row, re-counts, and
  inserts or refuses. A seat-number column with `unique (session_id, seat_no)` and an application
  retry was considered — it needs no plpgsql — but cancellations leave holes in the numbering and
  choosing the lowest free seat under contention is harder to get right than the lock.
- **D126** A full session is a **hard stop for everybody**. No waitlist, no organiser override. A
  waitlist needs a promotion rule, a notification channel this app does not have, and someone
  watching it; an override needs a story for what "31 of 30" means to the caterer. The desk's answer
  to a full session is to raise the capacity or add a session, both of which are one field.
- **D127** Booking is **open or closed per activity**, flipped by hand. No scheduled close. The
  registration pair (`registration_open` + `registration_closes_at`) is the obvious analogue and was
  left for later deliberately: a timestamp is additive, and nothing yet says the organiser wants
  booking to shut itself at 3am on the day of the event.
- **D128** `max_per_attendee` defaults to **1** and is set per activity. One is the common case —
  pick a workshop, pick a sitting — but a Tours activity with a morning and an afternoon run has no
  reason to forbid both. A unique index cannot express a cap of N, so the cap is enforced inside the
  function; `unique (attendee_id, session_id)` stays, because booking the same session twice is a
  duplicate rather than a policy question.
- **D129** An attendee may **switch freely**. A switch is one named booking moving to another
  session of the same activity, done atomically by `switch_session` (see §4) rather than as a
  cancel followed by a booking; it must name *which* booking is moving when `max_per_attendee` is
  above one. They may cancel outright only
  when the activity is optional: cancelling out of a required activity would put them in the state
  the activity exists to prevent, and the portal has somewhere better to send them — the other
  sessions. **Required means at least one booking in that activity**, not `max_per_attendee` of
  them: an activity that is both required and allows two is satisfied by one, and a cancel is
  refused only when it would take the attendee to zero.
- **D130** **Nobody is placed automatically.** The admin shows who has not booked — on every
  activity, since the desk chases an optional tour too, though only a required one makes the list a
  problem to solve — and the organiser places them. Auto-filling at close was rejected: it seats people in the one session they were
  avoiding, and it needs a rule for when the remaining seats do not go round — which is exactly the
  moment a human should be looking. Placement goes through the same function as an attendee booking,
  so capacity refuses an organiser too (D126); it does ignore `booking_open`, because closing
  booking must not stop the desk working.
- **D131** Eligibility reuses **`categories text[]`** and the rule `agenda_items` already has:
  null or empty means everyone. One concept, one mental model, and `categoryVisible` is already
  written and tested. The function re-checks it on write — a session the portal declined to draw is
  not a session the database has refused.
- **D132** The **portal surface is personal-only**, at `/e/[slug]/a/[token]/activities`. Booking
  needs an identity, and a page on the anonymous portal that lists sessions nobody can book is a
  phone call to the desk.
- **D133** A booked session appears on the attendee's **agenda as a derived row**, merged at read
  time, and is never written to `agenda_items`. `loadHomeData` already merges a personal fact into
  the agenda for breakouts and already guards the extra query on the event actually using the
  feature; this follows it. The consequence to accept is that an agenda row can now come from two
  tables, so the merge is a pure function with tests rather than a `concat` at the call site.
- **D134** **Losing the race is a normal outcome**, not an error. The counts on screen were true when
  the page rendered and the function is the only authority, so a refused booking re-renders the list
  with fresh numbers and a flash that says the session filled up. A full session shows as full and
  offers no button; a stale page that posts anyway is refused safely.
- **D135** Deleting a session **cascades its bookings**, matching how deleting a checkpoint cascades
  its check-ins and a breakout item its assignments (D88).
- **D136** `TILE_ROUTES` gains `"activities"`. The list is validated against stored jsonb, so it may
  gain entries but never lose them; `TILE_ROUTE_LABELS` is a `Record`, so the label is not optional.
- **D137** Booking writes are **rate limited per token** through the existing `allow()`. The route is
  reachable by anyone holding a personal link, and a tight loop against it is a denial of seats.
- **D138** **Breakouts stay as they are.** Activities do not absorb them, and breakouts gain no
  capacity. They are genuinely different operations — one is the organiser placing people from a
  spreadsheet, the other is people choosing — and merging them would mean rewriting a feature that
  is about to run a live event. The cost is two similar-looking things in the admin, mitigated by
  naming the difference in the page copy: breakouts are assigned, activities are booked.
- **D139** The rosters export ships **last and is droppable**: one sheet per session plus a sheet of
  the unbooked, in the shape D87 already established. An activity you cannot print a list for is
  hard to run at the door, but nothing else depends on it, so it is the first thing to cut if the
  work runs long.
- **D140** The booking functions return a **reason code**, not a boolean. Seven exist across the
  three functions: `ok`, `full`, `closed`, `limit`, `ineligible`, `missing` (the row is gone, or
  belongs to another event), and `required` (returned by `cancel_booking` alone, for the last
  booking of a required activity). `switch_session` never returns `limit`, because both its
  sessions belong to one activity so the count cannot move. The portal says different things for a session that filled and an
  activity the desk closed, and a boolean would make the portal guess.
- **D141** Verification includes a **concurrency script**, not only unit tests. The suite is pure
  functions with no database, so the one rule this feature exists to enforce is the one it
  structurally cannot see.

## 3. Out of scope

- Waitlists and promotion (D126), and any notification when a seat frees up.
- Payment, or an activity that costs money.
- Per-person invitations beyond the category rule (D131).
- Automatic placement of people who never booked (D130).
- Browsing activities without a personal link (D132).
- Scanning at an activity door. A booking is not attendance, and nothing yet asks whether the person
  who booked turned up.
- Capacity on breakouts (D138).

## 4. Schema

```sql
create table activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  description text,
  required boolean not null default false,
  booking_open boolean not null default false,
  max_per_attendee int not null default 1 check (max_per_attendee between 1 and 10),
  categories text[],
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table activity_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade,
  title text not null,
  day date not null,
  starts_at time not null,
  ends_at time,
  location text,
  capacity int not null check (capacity > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table activity_bookings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade,
  session_id uuid not null references activity_sessions(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (attendee_id, session_id)
);

create index activities_event_idx on activities (event_id, sort_order);
create index activity_sessions_activity_idx on activity_sessions (activity_id, day, starts_at, sort_order);
create index activity_bookings_session_idx on activity_bookings (session_id);
create index activity_bookings_attendee_idx on activity_bookings (attendee_id);

alter table activities enable row level security;
alter table activity_sessions enable row level security;
alter table activity_bookings enable row level security;
```

RLS is enabled with no policies, as every table since `0001_init.sql` has been: only the service
role, which bypasses RLS, may touch data. `0007` forgot these lines and `0011` had to go back for
them.

The booking function, in outline:

```
book_session(p_session_id uuid, p_attendee_id uuid, p_ignore_open boolean) returns text
  select ... from activity_sessions where id = p_session_id for update   -- the seat being taken
  select ... from activities where id = s.activity_id for update         -- the cap being counted
  load the activity and the attendee
  if not p_ignore_open and not activity.booking_open                      -> 'closed'
  if activity.categories is non-empty and attendee.category is not in it  -> 'ineligible'
  if count(bookings for this session) >= session.capacity                 -> 'full'
  if count(bookings for this activity by this attendee) >= max_per_attendee -> 'limit'
  insert; return 'ok'
```

`book_session` and `cancel_booking` lock the session row they are about, and then the **activity**
row, in that order. (`switch_session` locks its two session rows in id order and takes no explicit
activity lock, because both its sessions belong to one activity so no count moves.)
The activity lock is not decoration: `max_per_attendee` is a count across the activity, not the
session, so locking only the session lets two concurrent bookings of two *different* sessions of
one activity both read the same count and both pass the cap. The same hole, in the opposite
direction, would let two concurrent cancels empty a required activity. Locking session-then-activity
everywhere closes both, and none of the three functions takes the locks the other way round.

One cycle does exist, and it is worth knowing about rather than claiming it away: a cascading
delete goes the other direction — `delete from activities` locks the activity row and then
cascades into its sessions, while a booking in flight holds a session row and waits for the
activity. An admin deleting an activity at the same instant somebody books it can therefore
deadlock. Postgres detects it, aborts one side with `40P01`, and nothing is corrupted; the
attendee sees a failure rather than a reason code, and retrying works. Deleting an event does the
same thing one level up. Not worth defending against in code — an admin deleting an activity
mid-event is already destroying bookings on purpose — but it should not be a surprise.

The cost is that two people acting on the same activity now wait on each other for the length of
one function call, where previously only two people on the same session did. At an event of
hundreds that is the right trade: the cap is a promise to the caterer and the room, and throughput
here is measured in a handful of concurrent taps.

Cancelling is not an ordinary delete either — it goes through `cancel_booking`, which holds the
same locks, because "you may not cancel your last booking of a required activity" is a count over
the activity and has exactly the same race if it is checked in application code.

Switching is **not** a delete plus a `book_session`, and the first draft of this spec had it
wrong. Two steps cannot work: an attendee in a required activity with a cap of one cannot cancel
(D129) and so could never reach the second step, and even where the cancel is allowed, a target
that fills between the two leaves them holding nothing — the state a required activity exists to
prevent. So switching is its own function, `switch_session`, which locks both session rows in id
order (so two people swapping in opposite directions cannot deadlock), checks the target, and then
deletes and inserts in one transaction. The per-attendee cap needs no check there: both sessions
belong to the same activity, so the count does not move.

## 5. Sequencing

**After the KOM pilot on 30 Sep.** The dry run is 23 Sep and nothing about this feature is needed for
either. It adds the first plpgsql in the repo and the first contended write; landing that in the ten
days before a live event would trade a feature nobody has asked for yet against the one that is
already booked.

Within the feature: schema and function first, then the portal (the half that can be verified in the
browser pane), then the admin, then the export (D139).

## 6. Risks

- **Business rules now live in two languages.** Capacity, eligibility and the per-attendee cap are in
  plpgsql; everything else is in TypeScript. A rule changed in one and not the other is a silent
  disagreement. Mitigated by keeping the function's job small and naming it in the module's doc
  comment, and by the reason codes (D140) being the only contract between them.
- **The counts on screen are stale by definition.** Accepted (D134). The mitigation is that the
  function is the only authority and the refusal path is a designed screen, not a 500.
- **The denormalised `activity_id` can drift** (D124), exactly as `slot` can on a breakout
  assignment. Same mitigation: one line in the move path, one test.
- **Vitest cannot see the rule that matters most.** Mitigated by D141's script, which is a real
  deliverable and not a checklist line.
- **Two similar features in the admin** (D138). Mitigated by copy, which is the weakest kind of
  mitigation; if organisers still confuse them, the answer is a later merge, not a rename.
- **Verification gap, unchanged.** The admin is login-gated and Claude cannot enter credentials; the
  portal can be driven in the browser pane. The admin half goes on the user's checklist.

## 7. Verification

- `npm test` — pure functions: eligibility, seats-left and full, the per-attendee cap, the agenda
  merge and its ordering, the required-not-booked rule, and the cancel rule for required activities.
- Concurrency script (D141): ~50 parallel `book_session` calls at a capacity-1 session against the
  Supabase test project; exactly one `ok`, the rest `full`, and one booking row afterwards.
- `npm run lint` and `next build` per task.
- Portal verified in the browser pane: book, switch, cancel, a full session, a closed activity, and
  the booked session appearing on the agenda.
- Admin added to the user's checklist.
- Migration applied at merge, not before.
