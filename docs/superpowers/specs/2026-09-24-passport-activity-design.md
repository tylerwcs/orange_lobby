# Booth Passport as an activity — design

Date: 2026-09-24
Status: awaiting user review
Extends `2026-09-16-booth-passport-design.md` (D89–D103) and D178 (`0029_merge_forms_into_activities.sql`).
Decisions D179–D192. Lands before the 26 Sep code freeze, by the user's choice (24 Sep).

## 1. Why

Bookings and submissions are already one thing: two `kind`s of an `activities` row, one admin
list, one portal tab, one page shape (D178). The Booth Passport is the third format of the same
idea — something an attendee takes part in during the event — and it is the only one still
standing apart:

- Admin: "Booths" is its own item in the *Onsite* nav group; "Activities" is in *Portal*.
- Portal: the passport is not in the Activities tab. It is reached only by a "Booth Passport"
  home tile (`TILE_ROUTES` `stamps`) or the signage QR.
- Data: `booths` and `booth_stamps` do not reference `activities`, and the passport's settings
  (`stamps_required`, `stamps_message`) live on `events` — so an event has exactly one passport.

An organiser thinks "activities: the InBody scan, the photo contest, the booth passport". The
product should say the same.

Out of scope: per-day stamping (D92 stands), booth logos (D93 stands), a claim mechanism for the
prize (D97 stands — it is a checkpoint), attendee-scans-booth (D90 stands).

## 2. Decisions

- **D179** A passport is **an `activities` row with `kind = 'passport'`**, not a nav regrouping
  and not a card that links to the old booths screen. It takes the half of the activity shape
  that already fits — name, description, cover image, sort order, categories, the open flag —
  and gets it from the same editor, list and page as the other two kinds. A surface-only merge
  was considered and rejected: the passport would look like an activity and be edited like
  something else, and it would stay one per event.

- **D180** Booths are the passport's **children**, the way sessions are a booking's and
  submissions a submission's: `booths.activity_id → activities(id) on delete cascade, not null`.
  `booth_stamps` is unchanged; a stamp still points at a booth, and a booth now points at its
  passport. A stamp gets no denormalised `activity_id` — nothing needs to count stamps per
  passport without the booth list in hand, and the booth list is always loaded alongside.

- **D181** **More than one passport per event** is allowed, because nothing forbids it once the
  settings live on the activity. Each passport's completion is independent: its own booths, its
  own N-of-M.

- **D182** Passport-only settings are **two new nullable columns on `activities`**:
  `stamps_required int` (null = every booth, as today) and `reward_message text`. They move off
  `events`, in the same way `questions` and `per_day` are submission-only columns. Reusing
  `max_per_attendee` for the target was rejected: that column is "the most one attendee may
  take", and a passport's target is the fewest that counts as done — the opposite bound.

- **D183** A passport is **never `required`** and has **no cap** (`required = false`,
  `max_per_attendee = null`). Nothing can be owed before a booth stamps you, so a nav dot for an
  untouched passport would nag about something the attendee cannot do from their phone. The
  editor does not offer either field for this kind.

- **D184** Categories and the open flag are **enforced at the booth**, meaning the same thing
  they mean on the other kinds. Categories decide who sees the passport *and* whom a booth may
  stamp; a closed passport is visible but a booth cannot stamp into it. The risk — an organiser
  forgets to open it and the booths are dead on the day — is accepted and mitigated by D186 and
  by the booth scanner saying plainly that the passport is closed (§4).

- **D185** Stamping becomes **an RPC, `record_stamp(p_booth_id, p_attendee_id)`**, returning
  `'ok' | 'duplicate' | 'closed' | 'ineligible' | 'missing'`. `recordStamp` is a bare insert
  today, which was fine while there was nothing to check. D184 adds two checks; doing them in the
  server action would make them a read-then-write, and every other activity write in this
  codebase is decided in one database function for exactly that reason (D125, D178). The
  function locks the activity row, refuses a non-passport kind as `'missing'` (the 0030
  convention), refuses an attendee from another event as `'missing'`, then checks open, then
  categories with the same `lower(btrim())` match `book_session` uses, then inserts
  `on conflict do nothing` and reports `'duplicate'` if nothing was inserted. Grants follow 0030:
  revoked from `public, anon, authenticated`, granted to `service_role`.

- **D186** The migration **backfills one open, everyone passport per event that has booths**:
  name from the event's `stamps` tile label if it has one, else "Booth Passport";
  `is_open = true`, `categories = null`, `required = false`, `max_per_attendee = null`,
  `stamps_required` and `reward_message` copied from `events`. The test event's 3 booths and 3
  stamps keep working with no admin action. Events with no booths get nothing — an empty passport
  nobody created is clutter. Written for the data that might exist (the 0029 lesson), not the
  data believed to exist.

- **D187** **Undo stays a plain delete**, not gated by open or categories. Undoing the stamp you
  made four seconds ago must not fail because the organiser closed the passport in between.

- **D188** **Deleting a passport is D94-safe without new code.** The cascade from `activities`
  to `booths` meets `booth_stamps.booth_id … on delete restrict`, so the database refuses (23503)
  once anyone has been stamped. A passport is deletable until its first stamp, exactly as a booth
  is. The delete action turns 23503 into a message, as `deleteBoothIfUnstamped` already does.

- **D189** Expand and contract, as 0014/0015 did. **0036** adds the kind, the columns,
  `booths.activity_id` and the backfill, and leaves `events.stamps_required` /
  `events.stamps_message` in place. **0037** drops those two columns, and is applied only after
  the code that stops reading them is deployed, so production never reads a column that has gone.

- **D190** **"Booths" leaves the admin nav.** `/admin/events/[id]/booths` stays as a redirect —
  to the passport's page when the event has exactly one, else to Activities — so a bookmark or
  a runbook link lands somewhere useful.

- **D191** **Every printed or shared URL keeps working.** `/booth/<token>` is unchanged (tokens
  do not move). `/e/<slug>/a/<token>/stamps` redirects to the first passport's activity page
  (by `sort_order`), or to the Activities tab when there is none. The signage page
  `/e/<slug>/stamps` keeps its locked view, reading the first passport. The `stamps` tile route
  and the Modules "Booth Passport" preset stay; they are now a shortcut into a passport.

- **D192** On the portal, a passport sits in **Open to you** while collecting and in a new
  **Done** section, drawn last, once complete. Done is new and holds only completed passports;
  bookings keep **Booked**, which is the right word for a seat and the wrong one for a stamp
  card. A passport never appears under **To choose**, which means "you owe a pick" (D183). The
  Activities tab appears for an event whose only activity is a passport (`activityNav.show`); a
  passport never sets `owed`.

## 3. Data

`supabase/migrations/0036_passport_kind.sql`:

```sql
alter table activities drop constraint activities_kind_check;
alter table activities add constraint activities_kind_check
  check (kind in ('booking', 'submission', 'passport'));
alter table activities
  add column if not exists stamps_required int check (stamps_required is null or stamps_required >= 1),
  add column if not exists reward_message text;

alter table booths add column if not exists activity_id uuid references activities(id) on delete cascade;
-- backfill: one passport per event with booths (D186), then point that event's booths at it
alter table booths alter column activity_id set not null;
create index if not exists booths_activity_id_idx on booths (activity_id);

create or replace function record_stamp(p_booth_id uuid, p_attendee_id uuid) returns text ...;
revoke execute on function record_stamp(uuid, uuid) from public, anon, authenticated;
grant execute on function record_stamp(uuid, uuid) to service_role;
```

The exact constraint name is read from the live database before writing the drop. The backfill
inserts with `org_id` and `event_id` from the event, `sort_order` after the event's existing
activities, and is idempotent (skips an event that already has a passport) so a re-run is safe.

`supabase/migrations/0037_drop_event_stamps.sql` drops `events.stamps_required` and
`events.stamps_message`.

Types (`src/lib/types.ts`): `ActivityKind` gains `"passport"`; `Activity` gains
`stamps_required: number | null` and `reward_message: string | null` (passport only, documented
like the submission-only fields); `Booth` gains `activity_id`. `Event` loses the two stamp
fields after 0037.

Data access (`src/lib/db/booths.ts`): `listBooths` gains a by-activity form; `createBooth` takes
the passport; `setBoothOrder` scopes by `activity_id` as well as `event_id`; `recordStamp` calls
`record_stamp` and maps its codes. `listActivities(eventId, kind?)` already filters by kind.

## 4. Surfaces

### Booth scanner — `/booth/<token>`

`authoriseBooth` loads the booth's passport alongside the event. The header names the passport.
While the passport is closed a banner says stamping has not opened, and a scan returns "This
passport isn't open for stamping yet." An ineligible badge returns "Not part of this passport"
and **no name** — D98's shape carries a name only for someone this booth may stamp. The progress
line and `collected`/`target` count this passport's booths only. Name search is unchanged
(name and category only, D99).

### Admin

- **Nav** (`src/components/admin/nav.ts`): "Booths" removed from *Onsite* (D190).
- **Activities list**: a third trigger, **New passport** — name, description, image, categories,
  stamps needed, reward message, "Open for stamping now". No required, no cap (D183). Passport
  rows in `ActivityRows` carry a "Passport" tag and a count like "3 booths · 18 completed". The
  subtitle is reworded to name all three formats.
- **Activity detail**: the `kind` branch gains **`PassportDetail`**, which is today's booths page
  moved, not rebuilt: `BoothList` (add, rename, reorder, delete-while-unstamped), scanner links
  and the `?qr=` print sheet, completion counts, and the settings form (shared fields plus stamps
  needed and reward message). `booths/actions.ts` folds into `activities/actions.ts`, every
  action scoped by `activity_id` and `event_id`. `savePassportAction` writes to the activity.
- **Overview**: `activitySummaries` / `ActivityOverview` gain a passport line
  ("18 of 40 completed").
- **Exports**: the Booth Passport export stays at `passport.xlsx` and becomes one sheet per
  passport, built with the existing `buildPassportWorkbook`.

### Portal

- **Activities tab**: passport cards use the shared cover; `KindTag` reads "Passport";
  `StatusChip` reads "2 of 3 stamps" or "Complete". Sectioned per D192.
- **Activity page**: a third body, **`PassportBody`**, renders the existing `PassportGrid` —
  the stamp grid, unvisited booths with their location (D102), and the reward message when
  complete — under the shared cover and head. No action dialog: the attendee does nothing, the
  booth scans their badge. Closed: the grid, with "Stamping opens soon". Ineligible: not found,
  as for the other kinds.
- **Routes**: per D191.

### Unchanged

The prize counter is a checkpoint (D97). Stamps are not attendance (D100). The booth sees name
and progress only (D98). Purge: `booth_stamps` still cascades from `attendees`.

## 5. Testing

Vitest (pure `src/lib`):

- `buildPassport` / `completionByAttendee` scoped to one passport's booths, with a second
  passport's stamps present and ignored.
- A new `passportSection(passport)` in `src/lib/portal-activities.ts` returns `"open"` while
  collecting and `"done"` when complete, never `"choose"`; `bookingSection` is unchanged.
- `activityNav`: a passport-only event shows the tab; a passport never sets `owed`.
- Card and summary text for a passport.
- Admin nav without Booths (`tests/nav.test.ts`).
- The `/stamps` redirect target: first passport by `sort_order`, none → Activities.

Database, against the test event via SQL, before and after 0036:

- Backfill: one passport, 3 booths pointing at it, 3 stamps intact, `stamps_required = 2`,
  message carried; a second run inserts nothing.
- `record_stamp` returns each code: `ok`, `duplicate`, `closed`, `ineligible`, and `missing` for
  a booking activity's id, an unknown booth and an attendee from another event.
- Deleting a stamped passport is refused; deleting an unstamped one takes its booths.

End to end in the browser: admin creates a passport and a booth; the booth link stamps a test
badge; the portal card and page show the new count; closing the passport makes the booth refuse
and undo still works; the export opens with a sheet per passport; `/booths`, `/a/<token>/stamps`
and `/e/<slug>/stamps` land where D190 and D191 say.
