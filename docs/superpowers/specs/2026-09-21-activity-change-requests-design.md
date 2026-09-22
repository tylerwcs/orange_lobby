# Activity change requests — design

Date: 2026-09-21
Status: awaiting user review
Extends `2026-09-20-activity-booking-design.md`. Revises D129 and D134. Decisions D142–D158.

## 1. Why

Two problems, one page.

**The counts move under the desk.** Catering, transport and the screening vendor are given a
number, and that number is committed before anybody can un-commit it. Today an attendee can
switch or cancel instantly, so the roster the desk printed at nine is wrong at half past, with
nothing recording that it changed or who changed it. The desk does not need to *forbid* changes —
people genuinely fall ill and genuinely swap shifts — it needs to be the one who says yes, and to
be able to answer later why Room 2C seated nineteen.

**The page does not read.** On a phone, the seats left are the smallest grey text on the row while
the button beside them is the loudest thing on screen; Book fires on the first tap with nothing
between intent and a committed seat; and Switch and Cancel sit inline in the same column as Book,
so the control that undoes your afternoon looks exactly like the control that made it.

## 2. Decisions

- **D142** A change request is **its own row**, not a flag on the booking. `activity_bookings`
  keeps meaning exactly one thing — a seat somebody holds — which is what every count in this
  feature reads. Considered and rejected: `pending_to_session_id` and a status on the booking row,
  which needs no new table but has nowhere to put a *cancel* request (it would mark a row that is
  about to disappear), keeps no history once decided, and makes the row carry two lifecycles.
  The decisive reason is that a request is a **record**: when somebody asks in November why a room
  seated nineteen, the answer is a row saying who asked, what for, who decided, and when.
- **D143** The booking **does not move while a request is pending**. Counts stay exactly as they
  are until a human agrees, which is the whole point of the gate. The alternative — holding a seat
  in the target as well — makes approval infallible but counts the person twice, so the caterer
  over-orders and a popular session fills with requests nobody has approved.
- **D144** Therefore **approval can fail**, and that is a designed outcome rather than an error.
  The target may have filled while the request sat in the queue. Approval goes through the same
  `switch_session` / `cancel_booking` functions that already hold the row locks (D125), so a full
  target refuses the desk exactly as it refuses an attendee, and the desk is told which.
- **D145** **Every activity requires approval** for a switch or a cancel. No per-activity switch,
  no deadline after which it starts. Both were considered; both add a field, a rule to explain, and
  a second code path where an attendee sometimes gets an instant answer and sometimes does not.
  The cost accepted is a queue on activities where nobody would have minded.
- **D146** **One open request per attendee per activity**, enforced by a partial unique index
  rather than by application code. The attendee may **withdraw** it. A change of mind should not
  arrive at the desk as work, and the desk should never be deciding on a request the attendee has
  already replaced.
- **D147** Requests are reviewed **on the activity's own page**, in a card above the sessions,
  where the seat counts being decided against are already on screen. The **activity list row
  carries a pending count**, so the desk can see which activity has work without opening each one.
  A single event-wide queue was considered and left out: it is a second surface showing the same
  rows, and two places that can approve the same request is a race worth not having.
- **D148** A **required activity still offers no cancel at all** — the rule never reaches the
  queue. This keeps D129's refusal exactly as it stands: the portal shows only Request switch, and
  an attendee who genuinely must drop out is handled by the desk, not by a request the desk would
  have to decline.
- **D149** **Booking itself stays instant and unapproved.** Only changes need a human. A first
  booking adds to a count that nothing has committed against yet, and gating it would put the desk
  between every attendee and their first choice.
- **D150** Book gets a **confirmation step** naming the session, its time and its room. It is the
  one control that commits a seat in one tap, and on a phone it sits under the thumb.
- **D151** **Seats left gets visual weight** — it is the number the attendee is acting on, and it
  currently loses to its own button. Low remaining seats read as urgent rather than incidental.
- **D152** Decided requests are **kept, not deleted**. The history is the reason D142 chose a table.
- **D153** The attendee learns the outcome **when they next open the page**. This app has no
  notification channel — no email on write, no push — and inventing one for this is a larger
  feature than the one being built. The consequence to accept is that a decision made at 2pm may
  not be seen until the attendee looks, so the desk should assume nothing has been read.
- **D153a** A **decline is shown; an approval is not.** An approved switch announces itself — the
  attendee is now booked on the session they asked for, and the card says so. A decline leaves no
  trace at all: the pending block simply vanishes and the card looks exactly as it did before they
  ever asked, which reads as the request having been lost. So the card carries the most recent
  declined request for that activity — "The desk declined your request to move to Afternoon" —
  until the attendee raises another one. There is no dismiss control and no seen-flag: both are
  state to store for a line of text, and the line stops being shown the moment it stops being the
  latest word on the subject.
- **D154** Approval and decline write through the **existing database functions**, never through a
  direct insert or delete. Everything the feature promises about capacity holds only because those
  functions are the single write path (D125), and an approval that bypassed them would be the one
  caller that can overbook.
- **D155** A request records **who decided it**, as `auth.users(id)`, the same way `checkins`
  records `scanned_by`. `scannerNames()` in `src/lib/db/users.ts` already resolves those ids to
  emails and is reused rather than reimplemented.
- **D156** `switch_session` gains **`p_ignore_open boolean default false`**, and the approval path
  passes `true`. Without it the feature defeats itself: `0017_book_session.sql:160` refuses a
  switch whenever `booking_open` is false, so the desk would close booking at the headcount
  cut-off — the exact moment this gate exists for — and discover that every pending request in the
  queue had become un-approvable. `book_session` already carries this parameter for the same
  reason (D130); `cancel_booking` needs none, because it never looks at `booking_open`.
  **The signature change is the migration's whole risk.** Postgres keys a function by its argument
  list, so this adds a second `switch_session` rather than replacing the old one. The migration
  must `drop function switch_session(uuid, uuid, uuid)` and grant the new signature explicitly —
  `revoke ... from public, anon, authenticated` then `grant ... to service_role` — because a fresh
  `create` does not inherit the old function's grants and Supabase's default privileges will hand
  EXECUTE to `anon` at creation time. This is the hole 0017 documents.
- **D157** An attendee may still **request** a change after booking closes; only taking a *new*
  seat is blocked when closed, as today. Asking is not a write anybody has committed against, and
  a desk that has shut booking is precisely the desk that wants the requests in front of it rather
  than in a phone call.
- **D158** Deciding a request is **its own database function**, `decide_request`
  (`0021_decide_request.sql`), not the sequence of calls in a server action this design first
  specified. The original shape — load the request and check it is pending, call
  `switch_session`/`cancel_booking`, then stamp the row with an update scoped to
  `status = 'pending'` — is three statements with nothing serialising them against a concurrent
  *decline*, which only ever ran the third. The failure it allows: desk A's approve moves the
  booking and, while it is in flight, desk B's decline wins the scoped update; A's own stamp then
  matches zero rows. Both desks are told something locally true, and the record permanently reads
  `declined` for a change that actually happened — in the one table whose entire purpose is
  answering, in November, who decided what (D142, D155). Considered and rejected: narrowing the
  stamp further, which cannot cover the *apply* call it has to be atomic with; and an advisory
  lock taken around the action, which is a second lock discipline for one write path and invisible
  to anyone reading the SQL these writes actually go through. What it costs: a fourth function
  that calls the other three, so a signature change to `switch_session` or `cancel_booking` now
  breaks it too; the decision logic moves out of reviewable TypeScript into a migration; and it
  introduces a new lock order — the request row is taken **first**, before any session or activity
  row — which every future writer touching this table has to honour. It also has to return a
  refusal *code* rather than raise, so `'ok'` is the only outcome that stamps anything, and
  "refused means untouched" holds only while `switch_session` and `cancel_booking` stay write-free
  on every non-`'ok'` path (recorded in 0021's own header).

## 3. What this revises

- **D129** said an attendee "may switch freely" and may cancel an optional activity freely.
  Switching and cancelling now go through a request; the freedom is to *ask*, not to *do*. Its
  required-activity rule is unchanged and is reinforced by D148.
- **D134** said losing the race is a normal outcome shown as a flash. That still holds for booking,
  and now extends to approval: the desk can lose the same race on an attendee's behalf, and sees
  the same honest refusal.

## 4. Out of scope

- Notifying an attendee that their request was decided (D153).
- Approval for a first booking (D149).
- A single event-wide request queue (D147).
- Auto-approval rules, quotas, or a deadline after which requests close.
- Letting the desk *create* a request on somebody's behalf — the desk already has placement and
  session delete, which move seats directly.
- Any change to breakouts.

## 5. Schema

```sql
create table activity_change_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,
  kind text not null check (kind in ('switch', 'cancel')),
  -- The booking the attendee holds now. Cascades, so deleting a session takes its pending
  -- requests with it, exactly as it takes its bookings (D135).
  from_session_id uuid not null references activity_sessions(id) on delete cascade,
  -- Where they want to go. Null for a cancel, and the check below makes that structural
  -- rather than a convention somebody has to remember.
  to_session_id uuid references activity_sessions(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id),
  check ((kind = 'switch' and to_session_id is not null)
      or (kind = 'cancel' and to_session_id is null))
);

-- One open request per attendee per activity (D146). A partial unique index rather than a
-- check in the action: two tabs is exactly when application-side uniqueness fails, and this
-- is the same reasoning as `unique (attendee_id, session_id)` on the bookings table.
create unique index activity_change_requests_one_open
  on activity_change_requests (attendee_id, activity_id)
  where status = 'pending';

-- The desk's queue: one activity's pending rows, oldest first.
create index activity_change_requests_activity_idx
  on activity_change_requests (activity_id, status, created_at);

-- The portal's hot path: this attendee's own requests, read on every activities page load.
create index activity_change_requests_attendee_idx
  on activity_change_requests (attendee_id, status);

alter table activity_change_requests enable row level security;
```

No `org_id`, matching `activity_sessions` and `activity_bookings`: every query scopes by
`event_id`, and admin access is already gated by `requireEvent(eventId, orgId)`.

RLS enabled with no policies, as every table since `0001_init.sql`.

## 6. The approval path

Approving and declining are **one database function**, `decide_request`
(`0021_decide_request.sql`), not a sequence of calls in a server action (D158):

```
decide_request(request_id, status, user):
  select * from activity_change_requests where id = request_id FOR UPDATE
      -- the lock everything below depends on: a second call for this id waits here
  not found, or status <> 'pending'  -> 'gone'
  declined ->                           stamp declined, decided_at, decided_by; 'ok'
  approved, switch -> outcome := switch_session(from, to, attendee, p_ignore_open => true)  -- D156
  approved, cancel -> outcome := cancel_booking(from, attendee)
  outcome <> 'ok'  ->                   return outcome UNSTAMPED; the request stays pending
  outcome  = 'ok'  ->                   stamp approved, decided_at, decided_by; 'ok'
```

The nested `switch_session` / `cancel_booking` call is plpgsql calling plpgsql: it joins the
caller's transaction rather than opening a round trip of its own, so applying the change and
stamping the decision commit together or not at all. That is the whole point — a decline arriving
mid-approval waits on the request row's lock, and by the time it has it the approval has either
committed (the row is no longer pending, so the decline gets `'gone'`) or been refused with
nothing stamped (so the decline proceeds normally). There is exactly one true story because only
one transaction can hold the lock first.

The server action's remaining job is scoping and wording: `requireAdmin` + `requireEvent`, a
`getRequest` proving the posted id belongs to **this event and this activity** before it is acted
on, then a flash message per return code. `'gone'` covers both a stale click and a two-desk race,
which are indistinguishable from the caller's side and need not be told apart.

The refusal codes are the ones that already exist, returned by the nested function unchanged.
`closed` is not among them on this path, since D156 passes `p_ignore_open`; what remains reachable
is `full` (the target filled while the request waited), `missing` (the session or booking has since
gone), `ineligible` (the activity's categories were narrowed under them), and `required` — which
can only appear if an optional activity was made required *after* a cancel request was raised,
since D148 means a required activity never offers cancel in the first place. A refused approval
**leaves the request pending** and stamps nothing, because the desk has not decided anything; they
have been told they cannot do it yet. Declining is the deliberate act, and it is a separate control
that writes `declined` and touches no booking.

Withdrawing is the attendee's equivalent: status `withdrawn`, no booking touched, rate limited
through `allow()` on the token like every other portal write (D137).

## 7. The four portal changes

1. **Seats left carries weight.** The count moves up beside the session title in the row's own
   voice rather than trailing the location in muted text, and a session down to its last few seats
   says so in the warning colour the admin meters already use. "Full" keeps its current treatment.
2. **Book confirms.** Tapping Book opens a confirmation naming the session, its day, time and
   room, with Book and Cancel. It reuses the portal's existing dialog rather than introducing one.
3. **The change controls leave the session rows.** A session row's only action is Book. The
   attendee's own booking is stated once, below the sessions, with the controls that act on it —
   **Request switch** and, for an optional activity, **Request cancel** — so nothing that changes
   an existing seat sits in the same column as the control that takes a new one.
4. **Pending is a state the page shows.** With a request open, the card reads what was asked for
   and offers **Withdraw request**; Book and Request switch are not offered for that activity
   until it resolves. Book is withheld too, not just the change controls: on an activity allowing
   more than one session, taking a second seat while asking to move the first gives the desk a
   request whose meaning has changed under them. Withdraw is always one tap away, so nothing is
   trapped.

## 8. The admin surface

On the activity page, above Sessions: **Requests · N pending**, oldest first, each row naming the
attendee, what they asked for (`Morning → Afternoon`, or `Cancel Afternoon`), when they asked, and
**Approve** / **Decline**. Decided requests are behind a "Show decided" toggle rather than on
screen by default — the desk is working the queue, not reading the log.

The activity list row gains a pending count beside its seats, so an activity with work is visible
without opening it.

## 9. Sequencing

After the 30 Sep pilot, with the booking feature it extends. Nothing here is needed for the pilot,
and it changes the write path of a feature that has just been verified end to end.

Within the work: schema, then the request lifecycle and its portal surface, then the admin card,
then the list-row count. The three UI changes in §7 items 1–2 are independent of the request
lifecycle and can land first if a partial deploy is ever wanted.

## 10. Risks

- **The desk becomes a bottleneck nobody watches.** Every switch now waits on a human, and D153
  means the attendee cannot be told when it clears. If the desk does not work the queue, attendees
  are stuck holding a seat they have asked to leave. Mitigated by the pending count on the list
  row; not mitigated by anything that chases the desk.
- **A pending request can be silently invalidated.** Deleting a session cascades its requests away.
  The attendee who asked to move there sees their request vanish with no explanation, because there
  is no channel to explain it. Accepted; the alternative is a tombstone the portal must render.
- **Approval failing leaves the request pending**, which is correct but means a request can sit in
  the queue that can never succeed — a target that is full and stays full. The desk's escape is
  Decline, which they have to think to do.
- **Two lifecycles now describe one seat.** A booking says where somebody is; a request says where
  they want to be. Anything reading one and not the other will be subtly wrong — a roster export
  that ignored pending requests is correct, but a *headcount* that ignored them may not be what the
  desk means. The export stays booking-only, deliberately, and this is named so the next person
  decides rather than discovers.
- **Verification gap, unchanged.** The admin is login-gated; the portal can be driven in the
  browser pane. The admin half goes on `docs/activities-verification.md`.

## 11. Verification

- `npm test` — pure functions: the request state machine (which controls a given booking and
  request state offers), the one-open-request rule as the domain sees it, the pending count
  rollup, and the decline/approve outcome wording.
- A SQL fixture proving the partial unique index actually refuses a second pending request, and
  that the `kind`/`to_session_id` check rejects a malformed row. `scripts/book-session-fixture.sql`
  is the precedent, and is where the new sections live:
  - **Section F** — `switch_session`'s `p_ignore_open` (D156, 0020): refused `'closed'` without
    the flag and a no-op; `'ok'` with it; and, still with the flag set, `'full'` and `'ineligible'`
    still refuse and still leave the seat where it was. The flag bypasses open/closed and nothing
    else, and that is exercised rather than asserted.
  - **Section G** — `decide_request` (D158, 0021): an approve carries the booking and stamps
    `'approved'`; a second decision on that same row returns `'gone'`, leaves the row reading
    `'approved'`, and leaves the booking moved exactly once. Then a refused approval (a full
    target) leaves the request genuinely untouched — still `'pending'`, nothing stamped, the
    booking still on its original session — and a cancel request is approved end to end through
    the other branch, `cancel_booking`. A single script cannot interleave two live connections, so
    this is the evidence for the status guard the row lock is built on, not for the race itself.
- An addition to `scripts/booking-concurrency.mjs`: two approvals of two requests into a one-seat
  target, concurrently — exactly one `ok`, one refusal, one booking row.
- Portal driven in the browser pane: request, pending state, withdraw, and the confirmation on Book.
- Admin walkthrough added to `docs/activities-verification.md`.
- `npm run lint`, `npx next build`.
