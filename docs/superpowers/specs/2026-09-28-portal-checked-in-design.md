# Portal "Checked in" on a booked activity — design

Approved in chat on 28 Sep 2026. Follows booking doors (D324–D332): once an attendee has been
checked in at a booking door for the session they booked, their portal says so. It says it on the
activity's card (the Activities tab and the home row) and on the activity's own page.

## Decisions

- **D333 — "Checked in" means an arrival at a door of that activity on that session's day.**
  This is the per-door-per-day rule the scanner uses (D328). A walk-in with no booking keeps
  the ordinary card; the state belongs to a *booked* session.
- **D334 — The card says "Checked in" once every session they hold has an arrival.** It is a
  green chip, and the meta line keeps the session's day, time and place. It wins over "Waiting
  for the committee": once someone has attended, the request is moot. A partly attended
  multi-session booking still reads "Booked".
- **D335 — A checked-in booking moves to "Done".** It leaves the Booked section for Done at the
  end of the Activities tab, as a full passport does, so what still needs attention stays on
  top. The home row follows the same order.
- **D336 — A checked-in session is finished on its page.**
  - Its line reads "Checked in at 10:31 · Wed 30 Sep · 10:30".
  - That line has no Add to calendar, Change session or Ask to cancel.
  - When every held session is checked in, the sticky Add to calendar button, the Change
    session dialog and the "To move…" note go too.
  - The switch and cancel request actions refuse a checked-in session with "You've already
    checked in to this session.", so a stale page cannot send one.

- **D343 — Checking in closes a pending request for that session.** Added 28 Sep 2026.
  - **What closes:** a check-in at a booking door closes this attendee's *pending* change or
    cancel request for the door's activity, when the request's session is on the door's day.
  - **The status:** `closed` (migration 0054), stamped with when and by whom (the scanning
    admin, or empty for the crew link). Not "withdrawn", which would say the attendee withdrew it.
  - **Where:** every check-in path — scan, name search, Mark arrived, the crew link and the
    Attendees bulk check-in.
  - **Undo:** the scanner's Undo reopens it.
  - **What people see:**
    - the committee queue lists it as "closed, they checked in";
    - it stops counting toward the hourly committee reminder;
    - approving it from a stale page gets the usual "already decided" answer;
    - the attendee's page drops "Waiting for approval" for "Checked in at…".
  - **Left alone:** a request about another day's session.

## Data

- One reader in `src/lib/db/checkins.ts`: `bookingArrivalsFor(attendeeId)` returns the attendee's
  check-ins at booking doors as `{ activity_id, day, scanned_at }[]`. It is two small queries:
  their check-ins, then those checkpoints that have an `activity_id`.
- `loadActivityEntries` calls it only while the event has check-in on. Each `ActivityEntry` gains
  `arrivals: Record<sessionId, scanned_at>` for the sessions this attendee holds.
- The pure helper `sessionArrivals(held, arrivals)` in `src/lib/booking-door.ts` does the
  matching. For each held session it takes the earliest arrival with the same activity and day.

## Where it shows

- `bookingCard` (`src/lib/activity-card.ts`) gains `checkedIn: boolean`, and `bookingSection`
  (`src/lib/portal-activities.ts`) gains the same flag. Both are pure and tested.
- `activityCards` places Done bookings before Done passports.
- The activity page's `BookingBody` and `ActivityBooking` read `arrivals`.

## Testing

- Vitest:
  - `sessionArrivals`: matching by activity and day, earliest arrival, a session with no door,
    and another activity's door;
  - `bookingCard`: "Checked in" wins over pending, and a partial multi-session booking stays
    "Booked";
  - `bookingSection`: checked in → "done";
  - `activityCards` order.
- In the browser, on `ecpkom` (never ecphub): seed a booking, a door and a check-in, then view
  the portal card, the home row and the activity page. Try to cancel from a stale page and see
  the refusal.
