# Optional check-in — design

Date: 2026-09-23
Status: built
Decision D159.

## 1. Why

Not every event has a door. ECP Wellness 2026 runs from September to December; people wander
in, nobody stands at a desk with a scanner, and no badge is read. On an event like that the
admin Overview is a dashboard of arrivals that will never happen, the sidebar offers a
Scanner nobody opens, Exports offers an attendance sheet with no attendance in it, and the
attendee's badge carries a line about a check-in time that will always be blank.

The app already had a half-version of this state: an event with no checkpoints. Six surfaces
degraded for it — `settings/page.tsx`, `crew/[token]/page.tsx`, `scan/[eventId]/page.tsx`,
`AttendeeDetail.tsx`, `BulkBar.tsx` — but every one of them said some variant of **"No
checkpoints *yet*"**. That is the language of an unfinished setup, and it is exactly wrong
for an organiser who has finished deciding. The work is mostly turning an implicit "not set
up" into an explicit "not applicable", and filling the surfaces that had no guard at all.

## 2. Decision

- **D159** An event carries **`check_in_enabled boolean not null default true`**
  (`0022_check_in_optional.sql`). Off hides every check-in surface and refuses every
  check-in write; it **never deletes a checkpoint or a checkin row**.

  *Defaulting to true is the migration strategy.* Every event that already exists keeps its
  check-in untouched, and the column only matters where an organiser turns it off. There is
  no backfill and nothing to roll back.

  *It hides, it does not destroy.* An organiser who switches the door off after a morning of
  scanning and then changes their mind gets their morning back. This is why the flag is a
  column and not a `delete from checkins` — a display switch that throws data away is not a
  switch, it is a migration the user performed by accident.

  *Booths are not affected.* The Booth Passport shares none of the check-in machinery
  (`booths.ts` mentions `recordCheckin` only in a comment), so stamps keep working with the
  door shut. Considered and rejected: one "onsite scanning" flag governing both. They are
  different questions — a wellness fair with no desk may still run a stand with a stamp.

## 3. What each surface does

| Surface | With check-in off |
|---|---|
| Admin Overview | Activity/booking stats instead of arrivals (`ActivityOverview`) |
| Sidebar | Scanner item dropped; Overview, Booths, Attendees stay |
| Settings › Checkpoints | Only the Check-in card; checkpoints, crew link and scan card hidden |
| `/scan/[eventId]`, `/crew/[token]` | "Check-in is off for this event" |
| `doCheckin`, `markCheckedInAction` | Refuse the write |
| Attendees | Check-in queries skipped; `BulkBar` already hides on empty checkpoints |
| `AttendeeDetail` | "This event has no check-in." rather than "No checkpoints yet." |
| Portal home | `listCheckinsForEvent` not called at all; badge drops the arrival line |
| Exports | Attendance sheet not offered |

Two points are load-bearing.

**The Overview's replacement reuses `seatsFor` and `unbookedByActivity`.** `activitySummaries`
groups and adds; it computes no count of its own. The activity detail page already warns that
"two implementations of 'who has not booked' is how they end up disagreeing", and an Overview
that quietly disagreed with the page it links to would be worse than no Overview.

**The refusal is on the write, not only on the page.** `doCheckin` is the single place a
checkin is recorded, so the guard sits beside the existing `status === "archived"` check.
A crew phone with the scanner still open when the flag is switched off would otherwise keep
posting. Hiding the nav item is for the reader; refusing in `doCheckin` is for the POST.

## 4. Testing

`tests/nav.test.ts` — the Scanner comes and goes, and **nothing else in the nav moves** with
it. `tests/activity-summary.test.ts` — seats add up across sessions, never go negative when a
capacity is lowered under its bookings, respect category eligibility, keep each activity's
sessions to itself, and an activity with no sessions keeps its row rather than vanishing.

Verified in the browser against ECP Wellness 2026: the Overview renders the activity branch
(1 of 96 seats), the sidebar reads Overview / Booths / Attendees, the Settings toggle moves
the flag both ways and brings the three checkpoint cards back with it, and `/scan/<id>`
answers "Check-in is off for this event".
