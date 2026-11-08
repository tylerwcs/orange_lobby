# Booth passport: stamp artwork, Show my QR and the reveal — design

Date: 8 Nov 2026. Decisions D844 onwards (next free number when built). Migration 0132 (next free
number when built).

Builds on the booth passport as it is today: `src/features/activities/kinds/passport/`, the booth
scanner at `src/app/booth/[token]/`, and the `booths` / `booth_stamps` tables (`0010_booths.sql`).

## Why

Most events have a theme, and clients want the booth passport to look like part of it. The first
one is UOB Innovation Hub 2 (`uobih2`, passport "Booth Passport", two booths). Their designer
has approved two round gold stamps, "Jom Knockdown" and "Rangoli Fiesta". Each is a transparent
PNG about 940 px square with the booth's name drawn into the artwork.

Today every passport looks the same: a brand-coloured ring with a tick per booth. And the
attendee has no moment where a stamp *arrives*. A booth scans the badge and the page only
changes on the next reload.

So this adds three things:
1. A booth can carry the designer's stamp artwork.
2. The passport page has a **Show my QR** button. While the QR is open, the page notices the
   booth's scan by itself and plays a reveal.
3. A tidier page for every passport.

Booth staff scan exactly as they do today. Nothing changes on the booth's side.

## Goals

- An organiser uploads one image per booth, and the passport shows it once that booth is stamped.
- Collecting a stamp is a visible moment on the attendee's own phone.
- Works for any number of booths and on any phone. The layout stays the app's, the pictures are
  the designer's.
- The passport takes its colours from the event theme (D622, D636). Nothing passport-specific
  needs setting for colour.

## Non-goals

- Attendee-side stamping: NFC tags, or stamps pressed on the screen. These were considered on
  20 Oct and dropped. The current booth-scans-attendee flow stays.
- A passport background image or header art. Only per-booth stamp artwork is in scope.
- Tracing the artwork line by line. That would need SVG line art from the designer, and the
  reveal below works from flat PNGs.
- Changes to the booth scanner page, exports, stamp target or reward message logic.

## Anti-goals

- The designer must not have to lay out a page. Separate pieces (one image per booth) were
  chosen over one finished page, because a fixed page breaks when the booth count or phone width
  changes.
- The reveal must be clearly visible on a dark theme. An earlier rubber-stamp slam was rejected
  as "not visible enough".

## What the attendee sees

Mockups (local only, `.superpowers/` is gitignored), served by the brainstorm companion:
- `.superpowers/brainstorm/1156-1794126020/content/passport-page-v2.html`: the page in three
  states on the UOB theme.
- `.superpowers/brainstorm/1156-1794126020/content/outline-flow.html`: the reveal. **"Grow from
  centre"** is the chosen style.

### The page (every passport)

The activity page keeps its shape (`ActivityPage.tsx`): back link, cover if any, title,
description, then the passport block. The progress card ("0 of 2 stamps … 2 more to go" with
the bar) stays.

**Removed from every passport, decided by the user:**
- The info row "N booths to visit" (`PassportBody` `InfoRows`). The "For …" groups row, if any,
  is a separate item. Builder: keep it unless it would leave an empty row.
- The stamped time under each booth (`shortTime(cell.stampedAt)` in `PassportGrid` cells).
- On the completed card (`CompleteHeader`): the stamp glyph and the attendee's name. The card
  keeps the "All N stamps collected" pill, "Completed {date, time}" and the reward message.
  - Known trade-off, accepted: the name was there so a reward counter could check it against
    the badge, which made a forwarded screenshot useless. Without it, any completed screenshot
    looks genuine. Update the comment on `CompleteHeader` that explains the old reason.

### Booth slots

- **When a passport has artwork on at least one booth, every booth shows as a round slot.** In
  a two-column grid, each slot is a square holding a circle. *(My call: it keeps one look per
  passport rather than mixing boxes and circles.)*
  - **Not stamped:** a dashed circle with a large "?" and the booth name, plus the location
    under it if set. *(The user chose this "hidden until stamped" look, option C.)*
  - **Stamped, with artwork:** the artwork on a white disc with a soft shadow, tilted slightly
    (reuse the passport's `TILTS`). The booth name is not repeated, because it's in the
    artwork. *(My call.)*
  - **Stamped, no artwork** (a mixed passport): the white disc with today's `StampGlyph` in the
    middle. *(My call.)*
  - The map link (`MapLink`, D798) stays on slots that have a `location_url`. Placement is the
    builder's call.
  - An odd last booth: today a lone last cell spans both columns. For round slots, centre it in
    the row instead. *(My call.)*
- **A passport with no artwork at all** keeps today's rectangular cells, minus the stamped time.

The white disc is deliberate. The gold artwork is faint on cream and on navy, and the disc makes
it read on any theme (found while mocking up on the UOB navy).

### Show my QR

- A full-width button pinned at the foot of the page, the same place other activity kinds put
  their one button (BookingBody uses `sticky bottom-4`). Label: "Show my QR".
- It is shown only when the attendee has a passport (not the locked, no-attendee view, D103),
  the passport is open, and at least one booth on it is still unstamped. *(My call.)*
  - This is not the same as "complete". When `stamps_required` is below the booth count, the
    card is complete (`collected >= target`) while booths remain, and the scanner keeps
    stamping them (`record_stamp` has no target check). Those extra stamps still get the
    button and the live reveal.
- It opens the attendee's QR in a dialog. Reuse the QR from `qrDataUrl` and the look of
  `BadgeQrDialog`, with a line such as "Show this to the booth" and a small "Waiting for the
  booth…" indicator. Whether to extend `BadgeQrDialog` or wrap it is the builder's call. The
  QR image and layout match the badge dialog. The help line is the passport's own (see
  Constraints, Language).
- **While the dialog is open, the page asks the server every ~2 seconds** whether this attendee
  has a stamp on this passport that they haven't seen yet. *(My call: polling, not Supabase
  Realtime. Nothing in the app uses Realtime, and attendee access is by link token, not a
  session.)* Polling stops when the dialog closes or the page is hidden.
- When a new stamp arrives, the dialog closes and the reveal plays.
- A repeat scan (the booth sees "already stamped") makes no new stamp, so the dialog stays open.

### The reveal ("grow from centre")

Plays over the page, centred, at about 240 px:
1. The page dims (dark scrim, about 0.75 opacity, fading in over 0.3 s).
2. A white disc fades and scales in (0.9 → 1, about 0.35 s).
3. A gold outline draws once around the disc, clockwise from 12 o'clock, in about 0.9 s, with a
   small glowing dot leading the line. Gold is `#C08552` → `#F0C88E`, matching the artwork.
   *(Builder: a fixed gold, or one derived from the theme. Either is fine.)*
4. The artwork spreads out from the centre to fill the disc (a radial mask growing outward),
   about 0.7 s.
5. The booth name and "Stamp collected" show under it for about 1.5 s.
6. The disc moves and shrinks into its slot (about 0.55 s), the scrim lifts, and the slot
   settles with a small squash. The progress card updates.

For a booth with no artwork, the same sequence runs with the `StampGlyph` on the disc. The step 6
target is then the rectangular cell.

`prefers-reduced-motion`: skip steps 3–6. Fade the stamped disc in on its slot with the name and
"Stamp collected" briefly shown. *(My call.)*

### Stamps collected while the dialog was closed

A booth may scan the printed badge, or a saved screenshot of the QR. **The next time the
attendee opens the passport page, each unseen stamp plays the reveal, one after another**, in
the order collected. *(My call. The question was asked several times without an answer, and
without it someone stamped from their badge never sees the moment.)*

"Seen" is stored on the server, so it holds across devices and browsers:
- `booth_stamps.seen_at timestamptz null`. Set when the reveal for that stamp has played (or
  been skipped by reduced motion).
- The migration back-fills `seen_at = stamped_at` for every existing stamp, so nobody gets a
  backlog of old reveals.
- Marking seen is an attendee action authorised by the portal token, like other portal actions.
  The builder decides whether one call marks a batch.
- **A draft preview never marks seen** (`isDraftPreview`, D714/D716). The reveal may still
  play there so staff can see it, but nothing is written. *(My call.)*
  - Other people opening the attendee's own link can't be told apart from the attendee, for
    example an admin from `AttendeeDetail` or someone scanning a printed badge. Their views do
    use up the reveal. Accepted: it's a moment, not a record, and the stamp itself is never
    lost.

## What the organiser does

- In the passport's booth list (`BoothList.tsx`, the edit form with name, location and map
  link), each booth gets an optional **Stamp artwork** image. Upload, preview and remove.
- Storage: the existing event image upload (`uploadEventImage` in `src/lib/db/media.ts`, as used
  by `uploadActivityImageAction`). Stored as `booths.stamp_image_url text null`.
- Guidance next to the field: a transparent PNG, square, about 1000 px, with the booth's name in
  the artwork if the designer wants it shown. Builder sets a sensible size limit, at least
  enough for 1000 px PNGs (the UOB files are 250–350 KB).
- The booth list in admin shows a small thumbnail when a booth has artwork. *(My call.)*

## Data

- `booths.stamp_image_url text null`: the uploaded artwork, null for none.
- `booth_stamps.seen_at timestamptz null`, back-filled to `stamped_at`.
- The `Booth` and stamp types gain the new fields. The passport building (`buildPassport`) passes
  artwork and seen state through to the portal.
- A stamp that a booth undoes (`deleteStamp`) disappears as today. A reveal that has not played
  yet just never plays.

## Constraints

- Next.js in this repo has breaking changes from what you may know. Read
  `node_modules/next/dist/docs/` before writing code (AGENTS.md).
- New code follows the feature layout (`src/features/activities/kinds/passport/`).
- Colours come from theme tokens (`bg-feature`, `text-brand`, `bg-card` and so on), not
  hard-coded, except the white disc and the gold outline. Those are fixed on purpose and marked
  `theme-fixed`, as the QR's white tile is (D627).
- Text must read on the event's theme (D624). The "?" ring sits on the page background, not on a
  card.
- Every passport gets the removals and the Show my QR flow. Only passports with artwork get round
  slots.
- Language: the passport is English-only today (`PassportGrid` and `PassportBody` hard-code
  their strings), and the new words stay hard-coded in English the same way. *(My call.)*
  - The new words are "Show my QR", "Show this to the booth", "Waiting for the booth…" and
    "Stamp collected".
  - The passport dialog has its own help line, because the badge dialog's `qrHelp` is about
    check-in. "In step with the badge dialog" means the same QR image and layout, not the
    same words.
  - Translating the passport for EN | BM events is a separate piece of work.

## Left to the builder

- Component split, and where the polling and seen-marking actions live.
- Exact easing, durations within about ±20%, and the glow on the leading dot.
- How the reveal finds its slot's position (measure the slot element, as the mockup does).
- Query shape for "unseen stamps on this passport for this attendee".
- Tests: at least the "unseen" query, back-fill behaviour, and that a repeat scan creates nothing
  new to reveal.

## Test data

`uobih2` is a real client event *(my assumption, as with ecphub)*. Build and check on a test event with a passport, two or three booths,
the stamp PNGs uploaded, and a dark theme. Don't upload to or stamp on UOB's passport.
