# Organiser setup page — design

**Status: approved in chat on 10 Oct 2026. Phase 1 built 10 Oct 2026 (plan docs/superpowers/plans/2026-10-10-organiser-setup-phase-1.md): the link, the checklist, Basics with its preview, and the admin review and Apply for Basics. Phase 2 revised on 11 Oct 2026 (see "Phase 2 revision", D453–D461) and not built yet (plan docs/superpowers/plans/2026-10-10-organiser-setup-phase-2.md). Phase 2 adds a simple Agenda step, and file uploads plus a note on every checklist item. Info, breakout rooms and announcements become cards.**

**What the setup page is for (user, 11 Oct 2026):** it is not for organisers to set up the portal exactly. It eases onboarding and is the one place where the event's information and files are collected. Organisers send what they already have, such as their Excel sheets, and the admin does the rest. Where this document asks for detailed forms that mirror admin, the Phase 2 revision overrides it.

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

- **Fillable steps beyond Basics and Agenda.** Every other feature is a card that takes files and a note (D458, D461). Info was a step here until the Phase 2 revision.
- **Uploading the attendee list.**
- **Sending a section back with a note.** Send-backs go by email or WhatsApp.
- **Notifying admins outside the app.**
- **Organiser accounts, several links per event, and comments.**

## Decisions

### D441 — One setup link per event, `/setup/<token>`

- A `setup_token` column on `events`, unique and nullable. A null token means the link is off.
- It is created by a **Create setup link** button in the Setup area, not by opening the page: a page view never writes. It can be replaced or turned off there, with the same buttons and confirmations as the crew link.
- `setupLink(base, token)` in `src/features/setup/sections.ts` builds the link; callers pass the main
  address (`appBaseUrl()`), like the crew link.
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
- Apply sits in the header and is enabled only when the section is Submitted. It is bound to the
  version on screen (its `submitted_at`): if the organiser has submitted since, Apply refuses with
  "The organiser sent a newer version — review it first."
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
- Apply applies the reviewed version, identified by `submitted_at`. On success, `applied` is set
  to that `submitted` and `applied_at` is recorded, guarded on `submitted_at` (not `rev`: autosaves
  bump `rev` and must not stop an Apply). If a submit lands mid-Apply the guard fails, the reviewed
  version stays written, and the admin is told to review the latest version.

### D452 — Out-of-scope features stay guide cards until they are built as steps

Turning a card into a step is a new section file (D443) plus a catalogue edit (D444). The setup
home's layout doesn't change.

## Phase 2 revision (11 Oct 2026)

The user reviewed the first Phase 2 plan and narrowed what organisers fill in. Organisers send what they already have, and the admin builds the rest. The decisions below override the earlier ones where they differ:

- **D444's card list:** Info, Breakout rooms and Announcements are now cards (D461).
- **D445's Info preview:** gone. Info is a card.
- **D446's Agenda and Info asks:** replaced by D453 and D461.
- **D450's Info writes and D451's info function:** gone. Info has no Apply.

### D453 — The Agenda step asks only for days and sessions

- **Days:** date, and an optional name.
- **Sessions:**
  - start time and title, required
  - end time, location and description, optional
- **Admin-only:** breakout rounds, who a session is for, session photos, image rows and colours. The form never shows them, and Apply never writes them.
- **Upload instead:** the step also takes a file, for an agenda the organiser already has in Excel, Word or PDF (D458). Sending a file counts as sending the agenda. The admin builds it from the file.

### D454 — Setup items are tied to real rows through `applied_map`

- **Ids:** setup ids are opaque strings. `applied_map` maps each one to its real row.
- **Prefilled rows:** rows prefilled from the live agenda keep their real ids. Their map entries are written when the section row is first created.
- **The first save** seeds `seed` and the map from the live agenda. Both are limited to the ids the organiser's form actually showed (`seedIds`). A day or session an admin added after the page opened is never read as removed.

### D455 — Apply runs one plan through one database function

- **Where the plan is built:** in TypeScript. It is pure and tested.
- **What it holds:**
  - every day and session to insert, update and delete
  - the order writes
  - the new map
  - the list of changes for review
  - any problems that stop Apply
- **Review and Apply build the same plan,** so the review shows exactly what Apply writes (D449).
- **`setup_apply_agenda`** runs the plan in one transaction:
  - It writes `applied_map` with the rows.
  - It writes the `applied` snapshot guarded on `submitted_at`, and returns whether that snapshot was marked.
  - It updates only the fields the plan names, so an admin's edit to any other field survives.
  - It runs as the service role only.

### D456 — New and moved sessions go in by time

- **Placed by start time:** new sessions, retimed sessions and sessions moved to another day go among that day's rows, as admin's Add session does (`placeKey`).
- **Everything else** keeps its hand order.
- **The organiser's preview** shows each day in time order.

### D457 — Which dates a day is checked against

- **While the organiser fills in the form:** their own Basics dates, when both are valid dates. Otherwise, the live event's dates.
- **At Apply:** the live event's dates. When the dates moved, the admin applies Event basics first, and the problem text says so.

### D458 — Every checklist item takes files and a note

- **What every item has:**
  - every card, including custom modules: an upload area (several files) and a notes box
  - the Agenda step: an upload area
  
  This replaces "Send these to your project contact".
- **What organisers can do:** see, open and remove the files they sent. Notes save as they type. The last save wins, with no rev guard: a note is a message, not structured data.
- **Status:**

  | Admin sees | Organiser sees | When |
  | --- | --- | --- |
  | Nothing sent | Not sent | No files and no note |
  | New | Sent | Something changed since the admin last marked it handled |
  | Handled | Received | The admin marked it handled, and nothing changed since |

  Any new file, removed file or note edit makes the item New again.
- **Admin:** the Setup page lists every checklist item in one table:
  - the item's files, as download links that expire after a minute
  - the item's note
  - a **Mark handled** button
  - for a step, a link to its review
  
  The badge counts sections waiting for Apply plus items marked New.
- **Organiser home:** progress reads "N of M items sent". An item counts once its step is submitted, or once it has a file or a note.

### D459 — Where the files live, and how they go

- **Storage:** a private bucket, `setup-files`, at most 25 MB per file. Attendee lists hold personal data, so the bucket is private.
- **File types:**
  - Excel (.xlsx, .xls) and CSV
  - Word (.docx, .doc) and PDF
  - PowerPoint (.pptx, .ppt) and plain text
  - PNG, JPEG and WebP images

  The content type is set from the file's extension, because browsers report CSV inconsistently. No SVG.
- **How a file goes up:**
  1. The server checks the link, the item, the type and the size, and mints the path.
  2. The browser uploads straight to that path with a signed URL. Vercel caps a request body at 4.5 MB, so the file can't go through the server.
  3. The server checks the object is there and records it in `event_setup_files`.
- **Limit:** at most 20 files per item.
- **Downloads:** signed links that expire after 60 seconds, carrying the original file name.
- **Deleting the event** sweeps the bucket, as `deleteEventFiles` does for the other buckets.
- **Purge personal data** removes every setup file and clears every note, before it anonymises the attendees.

### D460 — The step machinery is shared

- **`useSectionAutosave`** holds Basics' save chain: debounce, rev, retry, the flush on leave, and submit on the same chain.
- **`StepFrame`** holds a step's layout: title row, Submit bar, preview.
- **`PhoneFrame`** is the phone the previews draw in.
- **New steps** are fields plus a preview.

### D461 — Info, Breakout rooms and Announcements are cards

- **Sections:** `SETUP_SECTIONS` is `basics` and `agenda`. The database still accepts `info` (0071), and nothing writes it.
- **Info card:** the info pages they want (any document is fine) and the floor plan.
- **Breakout rooms card:** the rooms in each round and who goes where. Any accepted file type, usually the spreadsheet they already keep.
- **Announcements card:** what they want posted, when, and which should stay pinned.

## Testing

- **Vitest, in `tests/setup/`:**
  - each section's `parse`, `isComplete` and `changes`
  - the derived status for every snapshot combination
  - the change-only apply plan, including "the admin's edit survives" and "a deleted session
    stays deleted"
  - the checklist built from a feature set with custom modules: steps first, then cards, then
    custom modules
- **`scripts/setup-db-check.mjs` (`npm run check:setup`), a database check:**
  - the table's constraints and the `setup_token` uniqueness
  - the rev guard: a save with the current rev lands, a stale one changes nothing
  - the `seed` column
  - the cascade when an event is deleted
- **Apply-level rules are covered by unit tests** (`tests/setup/`): the change-only patch, the
  review/patch agreement, and which images a save or an Apply may delete.
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
