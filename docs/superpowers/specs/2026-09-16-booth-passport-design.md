# Booth Passport — design

Date: 2026-09-16
Status: approved for implementation
Extends `2026-09-07-orange-lobby-pilot.md`. Decisions D89–D103.
Mockups: `.design/booth-passport/` (canvas: Attendee passport / Booth scanner / Admin and print).

## 1. Why

Booths in a foyer have no reason for an attendee to walk to the far end of the room, and the
organiser has no count of who came to which stand.

The rest of the platform already knows how to do most of this. `checkins` carries
`unique (checkpoint_id, attendee_id)` — one row per person per place, duplicates caught, undo
supported. The crew scanner reads a badge, resolves a token to an attendee and writes such a row in
one round trip. What is missing is not the machinery; it is a *place* that is a stand rather than a
door, an authority to stamp that is not an Ecopia admin login, and a surface on the attendee's phone
that turns a list of visits into something worth finishing.

## 2. Decisions

- **D89** A booth is **its own entity**, not a `checkpoints` row with a kind. A checkpoint is a
  moment on a date that crew work; a booth is a stand that stands for the whole event, carries its
  own scanner token, and is run by someone who is not crew. Considered and rejected: adding
  `kind text` to `checkpoints`, which would have inherited dedupe, undo, search and the export for
  free and cost roughly two days less. Rejected because the two rows would then disagree about what
  `day` means (a checkpoint's is `not null`; a booth has none), and every door-side query —
  `activeCheckpoint()`, the dashboard counts, the scanner's landing screen — would need a `kind`
  filter that is invisible when forgotten and lands the crew on a booth.
- **D90** Booth staff **scan the attendee's badge**; the attendee does not scan the booth. The
  alternative — a printed QR per booth that attendees scan from their own portal — needs no device at
  the stand, but a photograph of that QR stamps the passport from anywhere in the building. With the
  booth holding the scanner, the stamp is witnessed, and cheating stops being a design problem.
- **D91** The booth's authority is an **unguessable link**, `/booth/<token>`, not an admin login.
  `requireAdmin` grants the attendee list, the exports, Settings and delete; there is one role
  (D18), and the booth is staffed by a department rep at KOM and by a third-party exhibitor after
  it. The token is minted by `generateToken()` — the same 12-character alphabet as an attendee
  token — and the route authorises by it alone.
- **D92** One stamp per booth **for the whole event**: `unique (booth_id, attendee_id)`. A second
  scan on day two is an "already stamped" with the original time, not a second stamp. Per-day
  stamping was rejected: nobody has asked for it, and it would make "3 of 5" ambiguous.
- **D93** A booth carries **name and location only** — no logo, no description. Most stands are in
  the foyer and their location line is three words. An exhibitor logo was cut: it means chasing five
  image files in the week before a freeze, for decoration.
- **D94** There is **no `active` flag**. A booth that has stamped somebody can be renamed but
  **not deleted**; delete stays available until its first stamp. Deleting a stamped booth would take
  its stamps with it, silently dropping people out of "completed". A booth that no-shows mid-event is
  handled by lowering `stamps_required`, which is one number and instantly correct for everybody.
- **D95** Completion is **N of M**, where `events.stamps_required` is a per-event integer and M is
  the number of booths. Requiring every booth was rejected: one booth packing up early would strand
  the whole room.
- **D96** The reward is **words, not a mechanism**. `events.stamps_message` is admin-authored text
  shown when the card fills. The prize and its wording are the two things nobody knows until the week
  of the event; both must be editable without a deploy.
- **D97** Collecting the prize is a **checkpoint**, not a new subsystem. The counter opens the crew
  scanner on a checkpoint named "Prize counter"; a second attempt reports "already collected at
  14:32". A `claimed_at` column plus a third scanner would rebuild, worse, what `checkins` already
  does — and the prize log lands in the attendance export where an organiser would look for it.
- **D98** The booth sees **the attendee's name and their progress**, and nothing else. Not company,
  not table, not phone. The crew scanner's field card exists so a door can identify a guest; a booth
  is a stranger's stand, and after KOM it is a third party. Progress is included deliberately rather
  than as decoration: "two more to go" is what makes the booth person point at the last two stands.
- **D99** The booth scanner keeps the crew scanner's **name-search fallback** and loses its
  **walk-in add**. A booth whose camera will not start must not be dead for the day, but a booth must
  not be able to create attendee records. The search returns **name and category only** — enough to
  separate two Sarahs, nothing worth harvesting.
- **D100** Stamps are **not attendance**. The attendance export and the Overview check-in counts stay
  about doors. Booths get their own sheet: a row per attendee, a column per booth, a stamps total and
  a completed yes/no. Five booths folded into the attendance sheet would have added fifteen columns
  to a file that answers a different question.
- **D101** The passport reaches the portal home through **`TILE_ROUTES`**, not a new built-in key, so
  the tile's label, subtitle and icon are authored per event — "Booth Passport" for one client,
  "Chop Chop" for another. The Modules page offers it as a one-tap preset.
- **D102** The passport page **lists every booth**, showing the name and location of ones not yet
  visited. The card is a wayfinding tool as much as a reward; hiding unvisited booths would buy
  suspense and cost the only thing that makes the card actionable.
- **D103** Stamping requires an attendee, so the passport lives at `/e/<slug>/a/<token>/stamps`. The
  generic portal shows the page **locked** — where the passport lives, plus the booth list, because
  somebody reading the signage QR still wants to know where the stands are. Stamps are nevertheless
  earned whether or not the attendee has ever opened their link: the booth scans the badge, and the
  card is waiting when they find it.

## 3. Out of scope

- Attendee-side scanning of any kind (D90).
- Exhibitor accounts, exhibitor-visible attendee data, lead capture (D98).
- Prize stock, redemption limits, or a draw mechanism. Completion is a list; the draw is a human
  with a bowl (D97).
- Per-day stamping and per-booth opening hours (D92).
- Live update of the card while it is open. D20 stands: the portal refetches on open, so a stamp
  appears the next time the page is opened, and the page says so.
- Booth logos (D93).

## 4. Schema

```sql
create table booths (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  location text,
  token text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table booth_stamps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  event_id uuid not null references events(id) on delete cascade,
  booth_id uuid not null references booths(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,
  stamped_at timestamptz not null default now(),
  unique (booth_id, attendee_id)
);

alter table events add column stamps_required int;
alter table events add column stamps_message text;
```

`booths.token` is unique across the table, not per event: it is looked up on its own, before any
event is known.

`booth_stamps` has no `scanned_by`. The scan is authorised by a booth token, not by a user, so there
is no `auth.users` id to record; the booth is the `booth_id`.

`stamps_required` is nullable and means "all booths" when null, so an event that adds a booth before
setting a target still behaves sensibly.

Additive. The currently deployed code neither knows nor reads any of it, and `events` gains two
nullable columns that no existing query selects by name.

## 5. Sequencing

Straight off `main`, which is clean as of 174c70d. This does not touch agenda, breakouts, modules
parsing or the crew scanner's own code path; the only shared file it edits is `src/lib/modules.ts`
(one entry appended to `TILE_ROUTES`, which that file's own comment permits).

Against the pilot calendar — content final 22 Sep, dry run 23 Sep, badges print 24 Sep, freeze
26 Sep — the order matters more than the total: the **printable booth sheet must exist before
24 Sep**, because that is when things go to print, and it is produced by Task 6.

## 6. Risks

- **Ten days to freeze, four surfaces.** A migration, a public route with its own auth, a portal page
  and an admin page with an export. Mitigated only by sequencing: schema and pure libraries first,
  then the surfaces in the order the calendar needs them. If the window closes, the honest cut is
  D100's export sheet and D96's message, both of which can ship after the event; the scanner and the
  card cannot.
- **A public route that writes.** `/booth/<token>` takes an unauthenticated request and inserts a
  row. The token is 12 characters from a 31-symbol alphabet (about 2^59), and `allow()` rate-limits
  by token — but `ratelimit.ts` is an in-memory `Map`, so on Vercel it is per-instance and therefore
  weak. This matches what registration already relies on; it is not fixed here, and it is written
  down so nobody believes otherwise.
- **The booth link is the stamping authority.** A photo of a printed sheet in an attendee's camera
  roll is a booth that stamps itself. The print sheet says so in as many words; there is no technical
  mitigation short of the login this design deliberately avoids (D91).
- **`stamps_required` can exceed the booth count** if a booth is added and later deleted, or if the
  number is typed high. The portal must clamp to the number of booths rather than render "7 of 5".
- **Verification gap, unchanged.** The admin and the booth scanner are both unverifiable by Claude —
  one is login-gated, the other needs a camera. Both go on the user's checklist. The attendee
  passport can be driven in the browser pane.

## 7. Verification

`npm test`, `npm run lint`, `next build` per task. The passport page verified in the browser pane
against the live event. Booth scanner and admin on the user's checklist, alongside a dry-run
rehearsal on 23 Sep: print one sheet, open it on a second phone, stamp a real badge, confirm the card
updates on reopen. Migration 0010 applied at merge, not before.
