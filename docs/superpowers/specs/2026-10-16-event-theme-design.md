# Event theme — design

Date: 16 Oct 2026. Decisions D622–D632. Supersedes the registration-only colours D619–D621 (see
"What happens to D619–D621").

## Intent

An event's key visual (KV) sets a mood: the UOB Innovation Hub 2 Gala Dinner's "Wonders of the
World" KV is deep navy with gold. Today the attendee portal is always the app's light grey and
white with the event's primary colour on buttons, so a dark, rich KV sits on a page that does not
look like the same event. The organiser wants each event to carry its own **theme** so the whole
attendee experience fits the KV.

Matching the KV exactly (its patterns, display fonts, textures) is not the aim — that does not
survive a phone screen full of forms and lists. Matching its **colours** is. The banner images
(portal banner, registration banner D618) carry the actual artwork.

The look the organiser picked from mockups (option "A · All navy"): navy page, cards a slightly
lighter navy, white text, soft blue-grey secondary text, gold buttons and highlights.

## Goals

- **D622 — One theme per event, two colours to start.** The organiser sets:
  - **Background colour** (new): the theme's base. Default = today's light ground (#F5F5F3).
  - **Primary colour** (existing `primary_color`): keeps exactly its meaning today — the accent on
    buttons, highlights, links, focus rings. Unchanged for every event that never touches the theme.
  Light background → a light theme close to today's look. Dark background → a dark theme (option A).
- **D623 — Worked-out colours, each overridable.** From the background the system works out:
  **cards**, **text**, **secondary text**, **borders**, and **headings** (headings default to the
  text colour). Each appears under the two main pickers with its own colour picker showing the
  worked-out value, and a **Reset** that returns it to worked-out. An override is stored; a reset
  clears it. Changing the background re-works every colour that is not overridden.
- **D632 — How far the heading colour reaches is the organiser's choice.** Under the Headings
  picker, "Use the heading colour for" with two options:
  - **Page titles only** (default): the event name in the event bar and each page's main title
    (Register, the greeting on home, an activity's title, Me's name, etc.).
  - **Page titles and card titles**: also every card title and section label (e.g. "Tonight",
    "About you", "Event terms", activity card names, the home tiles' labels, dialog and sheet
    titles).
  Everything else (body text, field labels, list rows) uses the text colour either way. The live
  preview shows the difference. The builder defines the two sets as named classes or tokens (e.g.
  `--heading` for titles, `--card-heading` for card titles that resolves to `--heading` or to the
  text colour) so each attendee component opts in once.
- **D624 — Always readable.** As with `--primary` today (D72), every text/ground pair the theme
  produces is checked and adjusted to at least 4.5:1: text and secondary text on background and
  on cards, headings on both, the primary colour as text on cards and background, and button text
  on the primary fill. A hand-picked override that fails is adjusted when shown (and the Settings
  page says so beside that picker), never rejected. This holds for overrides too: the organiser
  cannot ship unreadable text by accident.
- **D625 — Everywhere an attendee looks.** The theme applies to every screen an attendee reaches
  through their link or the public event address:
  - the portal pages (home, agenda, activities and every activity kind's attendee pages, info, Me,
    groups/leaderboards, plan, seat, stamps, play, announcements);
  - the registration form and `/register/done`;
  - Coming soon (draft), the cancelled card, the consent gate;
  - dialogs, sheets, popovers and toasts opened from those pages.
- **D626 — Live preview in Settings.** Beside the theme pickers, a phone preview of the portal home
  (event bar, banner, greeting, a card with agenda rows, a primary button, tiles) updates as each
  colour is picked, before saving. Build on the client setup page's preview
  (`src/features/setup/preview/PhoneFrame.tsx`, `HomePreview.tsx`).

## Non-goals

- Admin pages, staff tools (crew scanner, booth scanner, verifier pages), and the big-screen
  displays (live games, polaroid wall) — they keep today's look. Displays already have their own
  background settings.
- Fonts, patterns, textures or background images — colours only. Banners carry the artwork.
- WhatsApp messages, emails, exported files, printed badges.
- The client setup page (`/setup/...`) keeps editing only the primary colour; the theme is set in
  admin Settings. *(My call — the setup page could gain it later.)*
- A light/dark switch for the attendee (system dark mode). The organiser's theme is what shows.
- The polaroid camera and composer stage (`STAGE_BG` #0b0b0d in
  `src/features/polaroid/components/StageBackdrop.tsx`) stays near-black on every theme, and the
  walk-in page reached from the wall's QR (`src/app/e/[slug]/polaroid/[publicToken]/page.tsx`)
  is unchanged. *(My call — a camera reads best on black, and the walk-in page belongs to the
  wall display.)* The polaroid activity's other attendee pages (its card, history) do take the
  theme.

## Anti-goals (failure even if it "works")

- Any text an attendee cannot read — on a dark theme the usual failure is grey-on-navy or a dark
  logo vanishing.
- An event that never touches the theme looking any different from today.
- The QR badge failing to scan because it was themed.
- Native controls (selects, date pickers, checkboxes, scrollbars) left light-styled inside a dark
  theme, or invisible on it.
- The theme leaking into admin pages or staff tools.

## Constraints

- The portal's colours are already almost entirely shadcn semantic tokens (`--background`,
  `--card`, `--foreground`, `--muted-foreground`, `--border`, `--input`, `--popover`, `--primary`,
  `--accent`, etc. in `src/app/globals.css`), applied per event by `brandStyle()` in
  `src/lib/brand.ts` on each page's root. A theme is therefore mainly: emit more of those tokens
  per event. Recon (16 Oct) found only a handful of hard-coded colours in attendee-facing code
  (`BadgeCard`, `PortalChrome`, plan/seat pages, `CancelSection`, `PassportGrid`, submission
  `EntryActions`/`SubmissionFields`, the polaroid components); each must be checked.
- The app is light-only by design (D56: no `.dark` block, `color-scheme: light`). A dark theme must
  set `color-scheme: dark` on the themed root so native controls follow.
- Derived colours are computed in tested code (as `brandStyle` does), not with CSS `color-mix`,
  so contrast can be unit-tested (the D72 lesson).
- `--accent` is currently `color-mix(... white)`; on a dark theme it must mix toward the
  background instead.
- Status tokens (`--success-soft`, `--warning-soft`, `--destructive-soft`, podium `--gold-soft`
  etc.) are pale pastels made for white. On a dark theme they must still read (pill text on pill
  ground ≥ 4.5:1) and must not glare.
- Every page root that calls `brandStyle(event.primary_color)` today (portal chrome, register,
  register/done, consent gate, cancelled card) is where the theme must be applied; PortalShell and
  the token layout build a `chromeEvent` that is serialised to the client — add only the theme
  fields, never the full event row (see the `ChromeEvent` comment in `PortalChrome.tsx`).
- Dialogs, sheets, popovers and toasts render in a portal under `<body>`, outside the themed page
  root, so the theme's tokens (and `color-scheme`) must also reach them — e.g. set on `<body>`
  for attendee routes, or on each portal container.
- The page column is phone width (`max-w-md` / `max-w-4xl`); the themed background must fill the
  whole window on desktop (as D620 already does for registration), not just the column.

## Decided how

- **D627 — Badge stays on white.** The QR itself always sits on a white tile with its quiet zone,
  whatever the theme. The badge card around it may follow the theme.
- **D628 — Logo on dark.** On a dark theme (D630) the event mark (logo image) sits on a white
  rounded tile so dark logos stay visible; on a light theme, custom or default, it stays as today. The initials mark keeps using `--brand`/`--brand-foreground`.
- **D629 — Event bar.** The portal's and registration page's event bar take the theme: whenever
  the background is not the default (light or dark), the bar is the background colour with the
  event name in the heading colour — D621's behaviour, now portal-wide. On the default theme it
  stays white as today. *(Light custom backgrounds: my call, following D621.)*
- **D630 — Light or dark is decided by the background.** Whichever of white or ink text reads
  better on the background decides whether the worked-out set is a light or dark one; the
  organiser does not pick "dark mode" separately.
- **Reach of the primary colour (build note, final review 1).** The theme's rule is set on `:root`
  so dialogs, sheets and toasts get it. That widens reach for untouched events too: their primary
  colour now also shows inside dialogs, sheets and the toaster (portals used to escape the page
  root's `brandStyle`). Token values are unchanged; only where they reach is wider.
- **D631 — Settings placement.** A **Theme** card in Settings → Details (with Event, Branding and
  images), saved with **Save settings** like the other Details fields: Background and Primary at
  the top, then Cards / Text / Secondary text / Borders / Headings, each picker + Reset, with the
  live preview beside it on wide screens and under it on narrow ones. The existing Primary colour
  field moves into this card. Committee members can edit it, like the rest of Details.

## What happens to D619–D621

D619 (registration heading colour) and D620 (registration background colour) were registration-only
and shipped the same day. The theme replaces them:
- `registration_background_color` → the theme's background; `registration_heading_color` → the
  theme's heading override. Copy any values across in the migration (only uobih2 has them:
  heading #ffffff, background #000c36), then drop the two columns and the two pickers in Settings →
  Registration.
- D621's event bar behaviour becomes D629. `registrationLook()` and its `--page-heading` /
  `--page-text` variables give way to the theme's tokens.
- D618 (registration banner) is unaffected.

## Left to the builder

- Storage shape (separate columns vs one `theme` jsonb), as long as "not overridden" is
  distinguishable from "overridden to a value" and colours are validated `#RRGGBB`.
- The exact derivation formulas (how much lighter cards are than a dark background, the secondary
  text's tint, border strength), tuned so the UOB navy #000c36 + gold gives option A, and the
  default ground gives exactly today's tokens.
- How the status/podium tokens are adapted on dark themes, within the readability rule.
- How many preview screens the live preview offers (home is required; registration form is a
  nice extra).
- Test strategy beyond: unit tests for every derived pair's contrast across light, mid and dark
  backgrounds and odd primaries (pale yellow, near-black, white); and a guard that an event with
  no theme set produces exactly today's tokens.
