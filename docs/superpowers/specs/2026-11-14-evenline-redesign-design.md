# Evenline redesign: design

Date: 14 November 2026. Status: approved by CS Wong on 14 November 2026. Nothing is built.

## What this is

A visual and navigational redesign of ECP Hub, after the Evenline UI Kit
(Figma file `y5q1bS8AqCbN5xBLJnCb94`, node `1442-6338`). It covers the attendee
portal on phone and desktop, registration, the admin, and the crew scanner.

The reference for every screen is the mockup page:

- Published: https://claude.ai/artifact/YDrxsBBA9oUusNDPovgZX8 (private to CS Wong)
- In the repo: `docs/mockups/2026-11-14-evenline-redesign-screens.html`
  (open it in a browser; it has a Light/Dark switch). It holds 37 phone screens,
  6 attendee desktop screens and 18 admin screens.

The mockups use an invented event (Momentum Summit 2027) and invented
activities. They show layout and components, not real content.

## Why

CS Wong wants the portal to look and feel like a modern event app: picture-led
activity cards, a bottom bar, calmer pages with one clear action. The current
portal works but navigates from a launcher grid on Home and reads as a set of
separate pages.

## Goals

- Attendees move between Home, Agenda, Activities, Info and Me from any page.
- Activities are shown by their cover picture, on one card design everywhere.
- Each activity page has the same order and one main button.
- The admin and scanner share the same look, without changing how the admin is
  organised.

## Non-goals

- No change to what any feature does, to the database, or to server actions.
- No new features. Where a mockup shows something the app does not have (for
  example a chat button on Contacts, or "Undo" on the scanner), leave it out.
- No copying of Evenline's content, artwork or name.

## Anti-goals

- An event's own theme must not stop working. An event with a navy and gold
  theme today must still be navy and gold afterwards.
- Text must not become harder to read than it is today.
- The live event (`ecphub`) must not be used for testing.

## Constraints found in the code

- **Per-event theme.** Each event stores a background colour and a primary
  colour; cards, text, borders and headings are worked out from those two and
  kept at 4.5:1 contrast or better (`events.theme`, see
  `docs/superpowers/specs/2026-10-16-event-theme-design.md`). The redesign's
  colours must come from these tokens, never from fixed hex values. Evenline's
  navy look is then simply one theme an event can choose.
- **Tokens** live in `src/app/globals.css` (`--background`, `--card`,
  `--primary`, `--accent`, `--brand`, `--feature`, `--divider`, and so on).
- **Font** is Manrope, bound to `--font-sans` in `src/app/layout.tsx`. A comment
  there says the printed KOM badges assume it.
- **Today's portal frame**: a top bar, no bottom navigation, content capped at
  `max-w-md` on phones; Home is the navigation (`PortalChrome.tsx`,
  `PortalHeader.tsx`, `LauncherGrid.tsx`).
- **Activity cards and pages** live in `src/features/activities/portal/`
  (`ActivitiesTab.tsx`, `ActivityParts.tsx`, `ActivityPage.tsx`,
  `detail-parts.tsx`), with one body per kind under `kinds/`.
- **Full-screen stages.** The passport book and the Polaroid camera draw their
  own dark full-screen stage and do not use the shared activity frame.
- **Admin style** approved on 25 September 2026: sidebar, content capped at
  `max-w-6xl`, `AdminHeader` with actions, tabs for things seen one at a time,
  table-style lists with a menu, sticky save bar.
- **Next.js** in this repo differs from the usual; read the guide in
  `node_modules/next/dist/docs/` before writing code (see `AGENTS.md`).

## Approaches considered

1. **Evenline as a new shell and components (chosen).** Add the bottom bar,
   restyle the shared components, and re-lay the screens as in the mockups.
   CS Wong chose this ("set the first design as the primary direction, then add
   the card style"). It changes navigation, so it is the largest of the three.
2. **Evenline components on today's layout.** Keep the top bar and launcher and
   only restyle cards, pills, tabs and fields. Smallest change. CS Wong asked to
   see it, then chose approach 1.
3. **Other activity page layouts** (seven alternatives, A to G, and a
   "progress first" layout). All were sketched and turned down in favour of the
   first design's page.

## The design

### Look

| Thing | Rule |
|---|---|
| Surfaces | Page, card and border colours from the event theme tokens. Cards sit one step lighter than the page on dark themes, white on light ones. |
| Accent | The event's primary colour: buttons, active tab, active bar item, links, pills. |
| Soft accent | A pale tint of the primary (`--accent` today) behind icon tiles and soft pills. |
| Corners | Cards 18px; cover images inside cards 13px; buttons 14px; pills 9px; fields 13px; icon tiles 12px. |
| Font | Manrope, as today (CS Wong's decision, 14 November 2026, after comparing it with the kit's Noto Sans JP). No font change. The mockup page has a font switch; Manrope is its default. |
| Type | Titles bold 19px (page) and 15px (card, section); body 13px; small 11.5 to 12px. |
| Status | Green soft pill for done or booked states; grey pill for neutral; soft-accent pill for "needs attention". |

### Shared components

Build these once and use them on every screen. Names are suggestions.

- **Cover card.** Cover image on top (rounded, inset in the card), optional date
  badge on the image's top-left, a small date line, the title, then a bottom row
  with place or team on the left and one pill action on the right. Used on Home,
  Activities, Me, and the desktop grids. An activity without a cover image keeps
  today's coloured panel with the name.
- **Row card.** Icon tile or avatar, title, one muted line, and an optional pill,
  chevron or switch on the right. Used for announcements, lists and settings.
- **Fact row.** Icon tile, bold line, muted line, optional pill ("Map").
- **Pill.** Soft (tinted) and solid (filled) versions.
- **Section header.** Bold title on the left, small link on the right.
- **Underline tabs.** Equal-width for two to four tabs; scrolling for more.
- **Chips.** Rounded filters; the selected one is filled.
- **Stat strip.** Three numbers with labels in one bordered box.
- **About block.** Text cut to three lines with "Read more"; pressing it shows
  the full text and any photos, and the button becomes "Show less". The button
  reads "Read more and see photos" when there are photos.
- **Bottom action bar.** Status on the left (two lines), one button on the right;
  or one full-width button.
- **Sheet.** A panel that slides up over the page for pickers.

### Attendee portal frame

- **Phone:** a fixed bottom bar with Home, Agenda, Activities, Info, Me, always
  in that order. The fourth item is always Info (CS Wong's decision). Groups is
  reached from Home and Me. The launcher grid on Home goes away; an organiser's
  custom tiles (Modules) need a new home (see Decisions).
- **Desktop:** the bottom bar becomes a top bar: event mark and name on the
  left; Home, Agenda, Activities, Info in the middle; language switch, bell and
  the attendee's avatar (opens Me) on the right. Content is capped and centred.
- Pages other than the five bar items show a back arrow and a centred title.

### Attendee screens

Follow the mockups. The rules that are not obvious from the pictures:

- **Home:** greeting with the attendee's name, the latest announcement as a row
  card, "Up next" as one cover card, then "For you to do" as a side-scrolling
  row of cover cards. Desktop is three columns: pass and announcements; up next
  and activities; today's sessions and the attendee's team.
- **Activities:** chips for kind, then side-scrolling rows grouped by state.
  "See all" opens the same cards stacked full width. Desktop shows four across.
- **Activity page (every kind):** edge-to-edge cover with back and share
  buttons and a kind tag; a rounded sheet over it holding, in this order:
  1. the title;
  2. the date, time and location rows;
  3. About (the About block; it may contain photos);
  4. what is specific to the kind (today's progress, the stamp grid, the
     attendee's draw number, the next match);
  5. the bottom action bar.

  Anything reached through the main button is not repeated on the page. For a
  booking, the slot picker opens as a sheet from "Book slot" and is not on the
  page. Desktop puts the cover, title, facts and About on the left and a card
  with the status and the main button on the right.
- **Agenda:** day chips, an "All sessions / My sessions" switch, one card per
  session with the time on the left. A session opens a page laid out like an
  activity page.
- **Info:** underline tabs for the organiser's Info tabs; rich text as today;
  the tap-to-open areas drawn as rounded cards with a chevron.
- **Me:** avatar, name, stat strip, then tabs: Pass (the QR in an outlined
  ticket), Bookings (small cover rows), About (details). A full-screen pass
  shows a large QR with table, room and similar pinned fields.
- **Groups:** tabs for Leaderboard, My group and All groups; the attendee's own
  team is outlined in the accent colour.
- **Registration:** event banner, filled fields with the active one outlined,
  the terms tick, and a full-width button fixed at the bottom. The done page
  shows a tick, a short message and an optional "One more step" cover card.

### Admin and scanner

- Keep the structure approved on 25 September 2026. Change only the look: the
  same card corners, pills, switches, icon tiles and buttons as the portal.
- Lists stay one card with table rows and a menu at the end of each row.
- The scanner is a dark camera view with a door picker and a running count;
  the result is a sheet with the attendee's name, pinned fields and one button.
- The eleven later admin mockups (Groups, Games, Info page, Announcements,
  Popups, Modules, WhatsApp, Exports, Features and their detail pages) were
  drawn from the page names, not from each page's current contents. Treat them
  as a style guide; keep each page's real columns, fields and switches.

## Decisions

CS Wong accepted all of these on 14 November 2026. The font (keep Manrope) is
recorded under Look.

1. **Accent on small text.** Evenline's `#FF8142` with white text is about
   2.6:1, too faint for small labels. Decided: keep the app's darkened
   primary for filled buttons and text links, as the theme code already does.
2. **Dark mode.** The mockups have a dark version. Decided: no separate dark
   mode. An event that wants the navy look sets a dark theme, which the theme
   feature already supports.
3. **Modules (custom tiles).** They sit in the launcher today, which goes away.
   Decided: a "More" row of round icons on Home, under "For you to do".
4. **Passport book and Polaroid camera.** Decided: keep both full-screen
   stages as they are, opened from a normal activity page. The round-stamp grid
   in the mockups would then only be a summary on that page.
5. **Bell icon.** The mockups show a bell for announcements. Decided: it opens
   the announcements page and shows a dot when there is an unread one.
6. **Scope of the first release.** Decided: the attendee portal first; admin
   and scanner later, since they are restyled, not re-laid.

## Build order

Each step can go live on its own.

1. Foundations: tokens and the shared components above.
2. Portal frame: bottom bar on phones, top bar on desktop.
3. Home and the Activities list, with the cover card.
4. Activity pages, one kind at a time, starting with bookings.
5. Agenda, Info, Me and Groups.
6. Registration and its done page.
7. Admin and the crew scanner.

## Left to the builder

- Component and file names, and how the shared components are split.
- Exact spacing where the mockups and the rules above disagree by a few pixels.
- How the bottom bar hides on the full-screen stages and on registration.
- Motion: keep the existing page fade and success moments unless they clash.

## Checking the work

- Test on any event except `ecphub`, which is live.
- Check each screen at phone width and desktop width, and under one light and
  one dark event theme.
- Check that an event with no cover images, no Info tabs, no groups and no
  activities still looks complete.
