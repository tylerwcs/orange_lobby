# Scheduled opening for activities — design

Date: 16 Oct 2026. Decisions D600–D609. Migration 0086.

An organiser sets a date and time; the activity opens itself then. Until it does, attendees see
its card marked Coming soon, with when it opens. Every kind — booking, submission, passport,
polaroid — gets it the same way, because they share the Open switch (D127) and its header.

## Decisions

**D600 — `activities.opens_at`.** A nullable `timestamptz`. Entered by the organiser in Malaysia
time (`MY_TZ`), stored as the instant. Null means no schedule. Only meaningful while the activity
is closed: an open activity never carries one.

**D601 — A database timer opens it.** A `pg_cron` job, `open-scheduled-activities`, every minute:

```sql
update activities a set is_open = true, opens_at = null
from events e
where e.id = a.event_id and e.status <> 'archived'
  and not a.is_open and a.opens_at is not null and a.opens_at <= now();
```

Plain SQL in the job, no `net.http_post` and no secret (unlike 0051): nothing outside the
database is needed. Afterwards the activity is exactly as if the switch had been flipped by
hand, so `book_session`, `switch_session`, `submit_answers`, `record_stamp`, the polaroid post
rules and every other `is_open` check are unchanged. It may open up to a minute late; that is
accepted. Archived events are skipped and keep their `opens_at` (nothing reads it there).

**D602 — Scheduling rules.**
- A schedule can be set only on a closed activity. The action refuses an open one with
  `It's already open.`
- The time must be in the future (compared with `now()` on the server). Otherwise:
  `Pick a time in the future.`
- Turning the Open switch **on** by hand (`toggleOpenAction`) opens it now and clears
  `opens_at` in the same update.
- Turning it **off** writes only `is_open = false`; `opens_at` is already null on an open
  activity, so no old schedule comes back.
- Removing the schedule sets `opens_at = null`; the activity is plainly Closed again, hidden as
  D384 says.
- Like `is_open` (D127), `opens_at` is written only by its own actions. No settings form reads
  or writes it, so saving Setup can never clear a schedule.

**D603 — Scheduled is the one closed state attendees see.** D384 stands for everything else. A
closed activity with `opens_at` set appears as a Coming soon card on the Activities tab and the
home row, and nowhere else: not the agenda, not `/stamps`, no page of its own (`findEntry` does
not find it; its URL 404s as a closed one does today). `shownToAttendees` keeps returning open
activities only; a new `comingSoonForAttendees` returns the scheduled ones, and only the card
list reads it. Category eligibility still applies: a card is shown only to attendees whose
category could use the activity once open.

**D604 — The Coming soon card.** Same cover, kind tag and name as any card, then:
- status chip `Coming soon`, muted tone;
- meta line, clock icon: `Opens Fri 17 Oct, 10:00am` (Malaysia time; `shortDate` plus the time,
  lower-case am/pm, minutes always shown);
- no action pill. The card is not a link and not focusable: a plain `div` with the same
  outline, no hover/press transform.

**D605 — Where it sits.** A new `coming` section, titled **Coming soon**, after Open to you and
before Done: `pinned, choose, booked, open, coming, done`. A pinned scheduled activity stays
under Pinned (D387), still drawn as a Coming soon card. On the home row it orders by the same
list, so it comes after everything that needs attention.

**D606 — Nothing is owed before it opens.** A required booking that is still scheduled is not
`mustPick`: no brand ring, not under To choose, no dot on the Activities button. Those begin
when it opens. The Activities button itself appears when the attendee has any open **or** Coming
soon activity, so a Coming soon card always has somewhere to show.

**D607 — Admin: the Schedule button.** On every kind's page header, beside the Open switch, while
the activity is closed:
- No schedule: an outline button **Schedule**.
- Scheduled: the same button reads **Opens Fri 17 Oct, 10:00am**.
- Open: no button.

It opens a dialog (the `dialog` component, as Add sessions does) titled `Schedule opening`, with
**Date** and **Time** fields in Malaysia time, prefilled when a schedule exists, and buttons
**Save** and, when scheduled, **Remove schedule**. The switch still reads Closed while
scheduled; flipping it opens now (D602).

Flashes: `Opening scheduled for Fri 17 Oct, 10:00am.`, `Schedule removed.`,
`Pick a time in the future.`, `It's already open.` Both actions land back on the tab they came
from, as `toggleOpenAction` does.

**D608 — Admin: the list row.** A scheduled row's status pill reads **Scheduled**, brand tone,
with `17 Oct, 10:00am` beneath it in muted text (and in the mobile cell). The row's switch is
unchanged. `listSummary` counts a scheduled activity as closed.

**D609 — Not in scope.** No schedule field on the Add activity forms (create closed, then
schedule). No scheduled closing. No WhatsApp or other notice when something opens. A portal page
already open does not change by itself; it shows the opened card on its next load.

## Pieces

- `supabase/migrations/0086_scheduled_open.sql` — column, a partial index
  `where opens_at is not null and not is_open`, the cron job (D601).
- `src/lib/types.ts` and `src/features/activities/db/activities.ts` — `opens_at: string | null`.
- `src/features/activities/lib/schedule.ts` (new, pure) — `scheduleCheck(activity, at, now)`
  for D602's refusals, `opensLabel(iso)` for D604/D607's wording, `opensShort(iso)` for D608.
- `src/features/activities/lib/portal-activities.ts` — `comingSoonForAttendees`, the `coming`
  section, `activityNav` counting Coming soon (D606).
- `src/features/activities/lib/activity-card.ts` — `comingSoonCard(opensAt)` → `CardView` with
  `action: null`; `CardView.action` becomes nullable.
- `src/features/activities/cards.ts` — Coming soon items with `href: null`, `section: "coming"`,
  `emphasis: false`; eligibility filtered by category.
- `src/features/activities/portal/ActivitiesTab.tsx`, `HomeActivities.tsx` — the section, and
  `ActivityCard` drawing a `div` without an action pill when `href` is null.
- `src/lib/portal.ts` — load the scheduled activities beside `portalActivities`.
- `src/features/activities/admin/actions.ts` — `scheduleOpenAction`, `removeScheduleAction`;
  `toggleOpenAction` clears `opens_at` when opening.
- `src/features/activities/admin/ScheduleOpen.tsx` (new) — the button and dialog (D607), used
  by all four `*Detail.tsx` headers.
- `src/features/activities/admin/ActivityRows.tsx` — `StatusPill` gains the Scheduled state.

## Testing

- Pure: `scheduleCheck` (past, now, future, already open), `opensLabel` across midnight and the
  MY offset, `comingSoonCard`, `activityCards` ordering with a `coming` item (pinned and not),
  `comingSoonForAttendees` with categories, `activityNav` with only Coming soon.
- Database (script, test event only): a closed activity with `opens_at` one minute ago opens on
  the next run and its `opens_at` clears; one in an archived event is left alone; one in the
  future is left alone.
- Browser on a test event — never `ecphub` — admin: schedule, change, remove, refuse a past time,
  flip open early; portal: card under Coming soon, not tappable, right time, then the normal card
  after the timer runs.
