# Portal popups — design

Date: 28 Oct 2026. Decisions D751–D758. Migration 0113.
Deadline: ready on `zp-my-best-me` (MYBESTME) by **1 Nov 2026** — portal links are already going
out (user, 28 Oct). Built in two passes:

- **Pass 1, by 1 Nov:** the booking trigger end to end — table + migration, admin Popups page
  (list, on/off switch, new/edit form, delete), the portal popup with the once-per-load rule,
  the home-screen-popup hand-off, the BM close label, unit tests, browser check on a test event,
  and the MYBESTME popup created switched off.
- **Pass 2, after:** the submission trigger, the live preview in the admin form, reordering, and
  the 30-minute re-show for home-screen users. Nothing in pass 1 should block these (the
  `trigger_kind` / `activity_id` columns already allow submission activities).

## Why

MYBESTME attendees have to book a health screening slot (the **Health Screening Booking**
activity, kind `booking`, id `7968ddec-…`). Some register and never book. The organiser wants
the portal to nag them: every time an attendee who has not booked opens their portal, a popup
tells them to book, with a button that takes them there.

The user framed it as "push notifications … works similar like the add to home screen popup".
It is an **in-portal popup**, like `AddToHomeScreen` — not a phone notification while the portal
is closed (Web Push). Confirmed with the user.

## Goals

- An event can have **popups**. Each has organiser-written text, a button, and a **trigger**:
  the situation in which it shows.
- First (and for now only) trigger: **the attendee hasn't done activity X** — for a booking
  activity, holds no booking in it; for a submission (form) activity, has no live submission.
- The popup shows **every time the attendee opens the portal** while the trigger holds, and stops
  for good once it no longer holds (they booked).
- The button takes them straight to that activity's page in the portal.
- Built so more triggers can be added later without reshaping the data or the admin screen.

## Non-goals

- Web Push / notifications outside the open portal. No service worker, no permission prompt.
- Any trigger other than "hasn't done activity X" (the user: "that's all for now"). No
  "show to everyone", no date windows, no category picker of its own.
- Activity kinds other than `booking` and `submission` as the trigger's activity (passport,
  polaroid, tournament have no clear "done"). (Claude's call: `submission` is included because
  "hasn't filled the survey" is the obvious next use and costs nothing extra.)
- Translating organiser text. As with everything typed in admin (portal-language-switch design),
  the popup's heading, message and button label show exactly as typed; MYBESTME's organiser
  writes them bilingually. Only the app's own wording (the close button) follows EN | BM.
- Images in the popup, scheduling, analytics on how many saw / tapped it.
- WhatsApp reminders for the same thing.

## Anti-goals (a failure even if it works)

- A popup to someone who **can't** act on it: an attendee whose category can't see the activity,
  or when the activity is closed / full / not yet open in a way that leaves them no action.
  (Rule below.)
- Popping up again **inside one visit** — on every tab change within the portal. Once per open.
- Two popups stacked, or this popup and the home-screen popup fighting for the same moment.
- Any slowdown of portal pages for events with no popups (D405 performance rules: no extra query
  beyond one memoised read).
- Showing on the live `ecphub` event during testing (see memory: test on another event).

## Decided with the user

- In-portal popup in the style of the add-to-home-screen popup.
- Content: a text instruction and one call-to-action button. Organiser customises the text.
- Trigger is customisable; first use is "hasn't booked the health screening slot".
- Shows every time they open the portal until they've booked.
- No other triggers for now.

## How it works

### What the attendee sees (D751)

A centred dialog, same component and feel as `AddToHomeScreen` (`Dialog`, `showCloseButton={false}`):

- **Heading** (organiser's text, bold, like the A2HS title).
- **Message** (organiser's text, rich text from the existing `RichTextEditor` — bold, lists,
  links, line breaks — rendered the way announcements / activity descriptions are rendered and
  sanitised). "Format" in the user's request is covered by this. (Claude's call.)
- **Button** — full width, primary (the event theme's colour), organiser's label. Tapping it
  closes the popup and navigates to `/e/<slug>/a/<token>/activities/<activityId>` (client
  navigation).
- **Close** — a ghost "Not now" button under it, from the dictionary (`en.ts` / `ms.ts`; BM e.g.
  "Nanti dulu"). Tap outside / Escape also close.

Opens about 1.5 s after the page settles (same `OPEN_AFTER_MS` idea as A2HS), on desktop too —
unlike A2HS, this is not phone-specific. (Claude's call.)

### When it shows (D752, D753)

The popup data is decided on the server in the personal portal layout
(`src/app/e/[slug]/(portal)/a/[token]/layout.tsx`), which renders once per page load and is
kept across client-side tab changes. So it is evaluated **per open of the portal**, on whatever
portal page they land on (home, or a deep link).

It shows when all of these hold:

1. The event is not a draft (a draft shows only Coming soon) and the attendee passed consent
   (the layout already returns early otherwise).
2. The popup is **on**.
3. Its activity exists, is visible to this attendee in the portal (`portalActivities` +
   `eligible(activity, attendee.category)`), and the attendee could act on it right now —
   for booking: the activity is open and has at least one session **that hasn't started yet**
   (KL time, `day` + `starts_at`) with room; for submission: the form is open and they could
   make a first entry. If the attendee can't act, don't nag. (Claude's call.) Note
   `activityState` / `activityControls` ignore time, so the "hasn't started" filter is new to
   this rule — the activity page itself is left as it is. MYBESTME's slots are 6–7 Nov,
   5-minute, capacity 1 (192 sessions), so once the slots fill or pass, the popup goes quiet.
4. The attendee **hasn't done** it: no booking held in that activity (`portalBookings`), no
   check-in at one of that activity's door checkpoints (a walk-in, D324–D331 — counts as done;
   MYBESTME has no door today), or, for a form, no live (non-revoked) submission of their own.
   (Claude's call on walk-ins.)
5. They are not already on that activity's page.

**Cost (D752):** do not call `loadActivityEntries` (≈13 reads) from the layout. Load only what
the on popups' activities need: their sessions + booking counts, this attendee's bookings (the
memoised `portalBookings`), and their door check-ins or own submissions — and only when at
least one popup is on. (Claude's call.)

**Once per open (D753):** the client component remembers in memory that it showed, so changing
tabs inside the portal never reopens it. A fresh load (opening the WhatsApp link again,
refreshing, reopening the browser) shows it again. For a portal saved to the home screen, which
can sit in the background for days without reloading, it also shows again when the page becomes
visible after being hidden for **30 minutes or more** (`visibilitychange`), re-checking the
condition with the server first so someone who booked elsewhere isn't nagged. (Claude's call.)

**Several popups (D754):** an event may have more than one. Each open shows **at most one** —
the first by `sort_order` whose conditions hold. (Claude's call.)

**With the home-screen popup (D755):** if a portal popup is going to show on this open, the
home-screen popup does not open by itself on this open (it still opens from its row/banner) and
it is **not** marked dismissed, so it gets its turn on a later visit with no portal popup, or
once they've booked. (Claude's call; the user agreed with "this one first".)

### Admin (D756)

A new page **Popups** in the event sidebar, right after Announcements, available to everyone who
can edit announcements (admins and the event's committee, same gate). Base feature — no add-on.
(Claude's call.) Follows the approved admin style (memory: admin-design-style):

- `AdminHeader` "Popups" — subtitle "Messages that pop up when attendees open their portal." —
  with a **New popup** button.
- One card with a table-style list, one row per popup: heading, small detail line
  ("Until they've booked Health Screening Booking"), an on/off switch, ⋯ menu (Edit, Delete with
  AlertDialog). Reorder only if cheap (up/down in the ⋯ menu); otherwise newest last.
- Empty state like Announcements': "No popups yet."
- New / Edit form (dialog or own page — builder's call, match Announcements):
  - **Heading** (required, short text).
  - **Message** (`RichTextEditor`, required).
  - **Button label** (required; placeholder "Book now").
  - **Show until the attendee has…** — a select of this event's booking and submission
    activities, worded per kind: "booked a slot in <name>" / "submitted <name>". Required.
    Structured as a "Trigger" select with one option today ("Hasn't done an activity") only if
    that comes for free; otherwise just the activity select, with the stored trigger kind fixed.
  - **On** switch, default on.
  - A small live preview of the popup beside / under the form. (Claude's call; drop it if it
    costs more than an hour.)
- Deleting an activity used by a popup deletes the popup too (FK cascade). (Claude's call.)

### Data (D757) — migration 0113

New table `portal_popups`:

| column | type | note |
|---|---|---|
| `id` | uuid pk | |
| `org_id` | uuid | like every event-owned table (RLS by org) |
| `event_id` | uuid fk events, cascade | |
| `heading` | text not null | |
| `message_html` | text not null | sanitised on save like other rich text |
| `button_label` | text not null | |
| `trigger_kind` | text not null, check in (`'not_done'`) | widen the check to add triggers |
| `activity_id` | uuid fk activities, cascade | required when `trigger_kind = 'not_done'` (check) |
| `is_on` | boolean not null default true | |
| `sort_order` | int not null default 0 | |
| `created_at` | timestamptz default now() | |

RLS and grants copied from the announcements table's pattern. Index on `event_id`.

### Code layout (D758)

New feature folder `src/features/popups/` per the modular-features rule: `index.ts` (server:
db reads, the "which popup for this attendee" loader, admin actions), `client.ts` (the
`PortalPopup` dialog and pure rules). The rule "which popup, if any" is a pure function of
(popups, activities, attendee category, bookings, own submissions, current activity) so it can
be unit-tested in `tests/popups/`. The layout gets one memoised read of the event's popups and
does the booking / submission reads only when an `is_on` popup exists — events without popups
pay one cheap query (or none, if the builder folds it into an existing cached event read).

Dictionary: add the close label (and any admin-free app wording) to `en.ts` and `ms.ts`; the
language test enforces matching keys.

## Testing

- Unit tests for the pure "which popup" rule: not eligible, closed / full, already booked,
  revoked submission counts as not done, on that activity's page, two popups → first wins,
  switched off.
- Browser check on a test event (not `ecphub`, not MYBESTME first): `ecpkom` has the language
  switch on. Create a booking activity + popup, open the portal as an attendee without a
  booking → popup; tab around → no repeat; reload → shows; book → never again; BM close label.
- Then create the MYBESTME popup **switched off**, with Claude's drafted EN + BM text, and tell
  the user. The user reads it over and turns it on themselves — MYBESTME has real attendees, so
  going live is their step. (Claude's call.)

## Left to the builder

- Exact component split, dialog vs page for the admin form, styling details within the A2HS look.
- How the 30-minute re-show re-checks with the server (server action, `router.refresh()`, etc.).
- Decision-record wording in code comments (D751–D758) as the codebase does elsewhere.

## Open for the user

- The MYBESTME popup's actual heading, message (EN + BM) and button label. Claude can draft
  them for the user to edit.
