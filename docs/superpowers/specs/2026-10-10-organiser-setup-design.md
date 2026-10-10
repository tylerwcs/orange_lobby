# Organiser setup page — design

**Status: approved in chat on 10 Oct 2026. Built in two phases: Phase 1 (plan docs/superpowers/plans/2026-10-10-organiser-setup-phase-1.md) is the link, the checklist, Basics with its preview, and the admin review and Apply for Basics; Phase 2 adds the Agenda and Info steps and their Apply functions. Until Phase 2, Agenda and Info show on the checklist as guide cards. Phase 1 built 10 Oct 2026 (plan docs/superpowers/plans/2026-10-10-organiser-setup-phase-1.md); Phase 2 not built.**

Event organisers get one private link per event. It is the one place where they:

- see everything we need from them
- enter it, step by step, with a live preview of their portal showing where each thing will go
- come back later to update it

The setup page replaces the onboarding guide we drafted as a document on 9 Oct. That guide's
content (image sizes, attendee-list rules, WhatsApp rules) becomes the page's help text and its
guide cards.

Nothing an organiser submits changes the event by itself. Submissions wait in a Setup area in
admin. An admin reviews each section and applies it.

## Where we are (checked 10 Oct 2026)

- **Organisers have no access today.** Admin is for org members only: `requireAdmin` in
  `src/lib/auth.ts:19`, checked against `org_members`.
- **Private per-event links already exist.** `crew_token`, `host_token` and `display_token` live
  on `events` (`0012_crew_link.sql`, `0049_games.sql`). Lookups and rotation are in
  `src/lib/db/events.ts:50-100`. Tokens come from `generateToken()` (`src/lib/tokens.ts:6`).
- **Content goes live as soon as it is saved.** `events.status` (`draft|live|archived`) only
  decides whether the portal shows "Coming soon" (`isUnpublished`, `src/lib/portal.ts:13`).
  There is no staging for content.
- **What setup v1 writes to:**
  - `events`: name, venue, dates, colour, logo, banner, committee numbers
  - agenda: `agenda_days` and `agenda_items`
  - info: `info_tabs`
  - the floor plan: the `floor_plan` home tile's `url`, with `events.floor_plan_url` as the
    fallback (`src/lib/modules.ts:142`)
- **The portal pages fetch first, then render plain components:** `LauncherGrid`,
  `AgendaList`, `InfoPage` and the header. The preview can reuse those components with draft data
  in place of the database.
- **Uploads:** the public `event-media` bucket. Rules are in `src/lib/storage.ts` (4 MB; PNG,
  JPEG, WebP, SVG), and writes go through `src/lib/db/media.ts` (`uploadEventImage`, `nextImage`).
- **Addresses:** since D424–D432, organisers and crew work on the main address. Setup links are
  built there too, like `crewLink` in `src/lib/links.ts`.

## Goals and non-goals

**Goals:**

- Guided and centralised: one link shows every item the event needs, with the fillable steps first.
- The portal preview is the main guide. It shows where each input lands, and at what size.
- Organisers can update their answers at any time.
- Admin applies sections with one click, and the admin's own edits survive later applies.

**Not in v1:**

- **Fillable steps beyond Basics, Agenda and Info.** Every other feature is a guide card.
- **Uploading the attendee list.**
- **Sending a section back with a note.** Send-backs go by email or WhatsApp.
- **Notifying admins outside the app.**
- **Organiser accounts, several links per event, and comments.**

## Decisions

### D441 — One setup link per event, `/setup/<token>`

- A `setup_token` column on `events`, unique and nullable. A null token means the link is off.
- It is created by a **Create setup link** button in the Setup area, not by opening the page: a page view never writes. It can be replaced or turned off there, with the same buttons and confirmations as the crew link.
- `setupLink(event)` in `src/lib/links.ts` always builds on the main address.
- The token is the identity. Every server action re-loads the event by token, the same as
  `loadPortalAttendee` does.
- A wrong token or a link that is off gives a 404.
- The page works on draft, live and archived events.

### D442 — Answers live in `event_setup_sections`, one row per event and section

- **Columns:** `event_id`, `section` (`basics|agenda|info`), `answers`, `submitted`, `applied`,
  `applied_map`, `rev`, `submitted_at`, `applied_at`, `updated_at`. All the content columns are
  jsonb.
  - `answers` is the organiser's working copy, autosaved.
  - `submitted` is a snapshot of `answers` taken at Submit.
  - `applied` is a snapshot of `submitted` taken at Apply.
  - `applied_map` maps the organiser's item ids to the real ids they created: days, sessions,
    tabs.
- **Status is worked out from the snapshots, never stored:**

  | Status | When |
  | --- | --- |
  | Not started | No answers |
  | Draft | `answers` differs from `submitted` |
  | Submitted | `submitted` differs from `applied` |
  | Applied | `submitted` equals `applied` |

  A section can be Applied and still hold unsubmitted changes. The organiser then sees "You have
  changes you haven't submitted".
- RLS is enabled with no policies. Access goes through the service client.

### D443 — Sections are code, in `src/features/setup/sections/<name>.ts`

- Each section exports:
  - `blank()`
  - `parse(raw)`: returns answers or field errors. Limits match admin's (title lengths,
    times, colours).
  - `isComplete(answers)`: decides whether Submit is enabled
  - `changes(submitted, live)`: the change summary for review
  - `apply(event, submitted, applied, appliedMap)`
- The feature folder follows D417–D419:
  - `portal/`: the organiser screens and actions
  - `admin/`: the Setup area and review
  - `preview/`
  - `sections/`
- A future section, such as the attendee list, is one new file plus one catalogue entry.

### D444 — The checklist comes from the catalogue

- Each catalogue feature has an optional `setup` field listing its items (`SetupItem` in `catalogue.ts`). An item is either:
  - a **step** (fillable: `basics`, `agenda`, `info`), or
  - a **guide card** (title, what to send, help text)
- The setup home lists the base items, the event's add-on items and one
  card per custom module, in this order:
  1. the fillable steps, in catalogue order (basics, agenda, info)
  2. the guide cards, in catalogue order (base features, then add-ons)
  3. one card per custom module
- **Guide cards in v1:**
  - Attendee list (base)
  - Registration questions (base), shown when attendees sign up themselves
  - Check-in points (base)
  - WhatsApp messaging
  - Session booking
  - Engagement activities
  - Live games
  - Lucky draw
  - Custom domain: the domain they want, and who runs their DNS
  - Slido embedding: their Slido event link
  - one card per custom module, showing its name and description

  Each card has the guide's requirements and "Send these to your project contact".

### D445 — The preview is the real portal, fed with draft answers

- On a laptop, each step has the form on the left and a sticky phone frame on the right. On a
  phone, a Preview button opens the frame full screen.
- **Each step previews the screen it affects:**
  - Basics: the portal home (header, logo, banner, home buttons, brand colour)
  - Agenda: the agenda screen
  - Info: the info page, with the floor plan
- **The setup home** shows a small home preview of everything submitted so far.
- **The preview reuses the portal's own components** (`LauncherGrid`, `AgendaList`, `InfoPage`,
  the header), so it cannot drift from what attendees see.
  - Some of these may import server-only code. Where they do, the drawing part is split into a
    client-safe component, the way D418 split the activity screens.
  - The implementation plan checks each component first.
- **Empty slots teach.** Anything not provided yet shows as the image guide's dashed placeholder
  with its target size printed inside, e.g. "Banner, 2400 × 800".
- **Focus links form and preview.** Fields and preview spots share a slot name
  (`data-setup-slot`).
  - Focusing a field outlines its spot in the preview, with a small label.
  - Clicking a spot focuses its field.
- **Images show cropped as the portal crops them.** For example, the banner shows at 3:1.

### D446 — Steps are short, guided forms that save on their own

- Fields are in short groups. Each group has one sentence of help, taken from the guide.
- Answers autosave about a second after the last change, showing a quiet "Saved".
- Each save carries the section's `rev`. If another person saved in between, the save is refused
  with "Someone else updated this section — reload to see their changes", rather than one
  silently overwriting the other.
- **Basics** asks for:
  - event name, start and end dates, venue
  - brand colour, logo, banner
  - attendee categories (kept as notes for admin)
  - committee WhatsApp numbers
  - free-text notes
- **Agenda** asks for:
  - days: date and optional name
  - sessions under each day: start time and title (required); end time, location, description,
    categories and photo (optional)
  - breakout rounds: name and room codes
  
  Times are checked: the end must be after the start, and days must fall inside the event dates.
- **Info** asks for tabs (title, and rich text with images) and the floor plan.
- **Submit section** is enabled once `isComplete` passes. Edits after a submit mark the section
  Draft until it is submitted again.

### D447 — Organiser uploads warn, they don't block

- Images go to `event-media` through the same checks: `acceptImage`, 4 MB, PNG, JPEG, WebP or
  SVG.
- The answers store the URL.
- A replaced draft image is deleted once the new answers are saved, the same order as
  `nextImage`. Images that were submitted or applied are never deleted by the organiser's edits.
- Proportions are checked in the browser against the guide (banner 3:1, logo square, and so
  on). The result is a warning under the field, not a refusal.

### D448 — A Setup area in admin, with a badge

- **Setup** goes in the event sidebar. It holds:
  - the link card: the link with Copy, Open as organiser, and the Replace link and Turn off link buttons, each with a confirmation (the crew link's pattern)
  - a table of sections with columns Section · Status · Submitted · Applied · ⋯
- **The badge** counts sections in Submitted. It shows on the sidebar item and on the event's
  row in the events list.

### D449 — Review shows what Apply will write

- Opening a section shows `changes(submitted, live, baseline)`, which lists only what Apply would write (a field the organiser changed from the baseline that also differs from the live event), plus the info-only fields they filled:
  - fields as before and after
  - images side by side, with the proportion warning if any
  - for the agenda and info, a summary ("3 sessions added, 1 changed, 1 removed") with the rows
- The same phone preview appears next to the changes.
- Apply sits in the header and is enabled only when the section is Submitted.
- Admins don't edit the organiser's answers here. They apply first, then edit in admin as usual.

### D450 — Apply writes only what the organiser changed since the last Apply

- Apply compares `submitted` with `applied` (the last snapshot). It writes only the fields and
  items that differ.
  - A field the admin changed in admin, and the organiser left alone, keeps the admin's value.
  - A setup-created session the admin deleted stays deleted, unless the organiser changes that
    session again.
- Items are matched through `applied_map`. Items the admin created in admin are never touched.
- The first Apply has an empty `applied` snapshot. Its baseline is the organiser's starting point:
  the live event as their form first showed it, stored as `seed` when their row is created. So it
  writes only what they changed from that, and an admin's later edits (including a newer image)
  survive even the first Apply. A row saved before seeds existed falls back to the live event.
- **Basics** writes:
  - `name`, `venue_name`, `starts_on`, `ends_on`
  - `primary_color`, `logo`, `banner`
  - `committee_alert_numbers`
  
  Categories and notes stay in the review only.
- **Info** writes `info_tabs`, plus the floor plan to the `floor_plan` tile's `url`. If the event
  has no Floor plan tile, Apply adds one, shown.

### D451 — Apply is all-or-nothing

- Apply runs `parse` again against the current event first. For example, the event dates may
  have changed since the submit. If that fails, it lists the problems and writes nothing.
- The agenda and info applies are each one Postgres function. Days, sessions, breakout rounds,
  tabs and the `applied_map` update all commit together.
- Basics is a single row update.
- On success, `applied` is set to `submitted` and `applied_at` is recorded.

### D452 — Out-of-scope features stay guide cards until they are built as steps

Turning a card into a step is a new section file (D443) plus a catalogue edit (D444). The setup
home's layout doesn't change.

## Testing

- **Vitest, in `tests/setup/`:**
  - each section's `parse`, `isComplete` and `changes`
  - the derived status for every snapshot combination
  - the change-only apply plan, including "the admin's edit survives" and "a deleted session
    stays deleted"
  - the checklist built from a feature set with custom modules: steps first, then cards, then
    custom modules
- **`scripts/check-setup.mjs`, a database check:**
  - the first Apply writes everything
  - a re-apply after an admin edit keeps the edit
  - a failing Apply writes nothing
  - a rotated token stops the old link working
- **A browser walk-through as organiser, then as admin, on a test event (never `ecphub`):**
  - fill and submit all three steps
  - check the preview slots, the focus highlight and the crop
  - apply each section, then confirm the portal shows it
  - edit in admin, have the organiser resubmit, re-apply, and confirm the admin edit stayed

## Order of work

1. The catalogue project, built first.
2. Migration: `setup_token` and `event_setup_sections`.
3. `src/features/setup/sections/`: basics, agenda and info, with tests.
4. The organiser page: home, steps, autosave, uploads.
5. The preview: check the components, split them where needed, add slots and focus linking.
6. Admin: the Setup area, the badge, review, and the Apply functions.
7. The database check and the browser walk-through.

## Open questions

- **Admin notice on submit.** v1 has only the badge. A WhatsApp notice would need a new Utility
  template approved by Meta.
- **Where the attendee-list step goes when it is added.** It would sit next to the existing
  import, `importMasterlistAction`, which has no dry run today.
- **Number clash.** If another session uses D441–D452 first, renumber when committing.
