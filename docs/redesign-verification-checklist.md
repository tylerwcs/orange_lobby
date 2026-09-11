# Redesign verification checklist — login-gated surfaces

Date: 2026-09-10
Covers: the redesign in `docs/superpowers/specs/2026-09-10-orange-lobby-redesign-design.md` (commits `85ae469`–`7f3410e`).

Every admin route sits behind `requireAdmin()` and the scanner behind login. Those surfaces could not be
opened during implementation — entering credentials is not something the assistant does — so the checks
below are the ones nobody has run. The public portal **was** verified and is recorded at the bottom.

Run `npm run dev`, sign in, and work through these.

## Admin — Overview (`/admin`)

- [ ] `/admin` lands on the live event's Overview, not the event list. With no live event it lands on `/admin/events`.
- [x] **The Summary card names what it counts**, and switching checkpoint shows a skeleton in that card alone.
      *(Verified.)*
- [ ] **The Summary card names what it counts.** With "Any checkpoint" it reads "Across every checkpoint";
      pick one and both the card's caption and the page heading say so. The two numbers must never disagree.
- [ ] Changing the checkpoint shows a **skeleton in that card only** — the rest of the dashboard must not blank.
      Confirm the card does not resize as the real numbers land.
- [ ] The choice survives the 15-second auto-refresh. If the card silently reverts to "Any checkpoint" while
      you watch it, the URL is not holding the selection.
- [ ] A checkpoint scanned at twice by the same person counts them **once** across all checkpoints. Someone at
      registration and again at dinner is one person in the room.
- [ ] The Check-in card lists **every checkpoint on every day**, dated when the event runs longer than one day.
      There is no day or checkpoint filter any more — if one is missing from the card, it is missing.
- [ ] With zero check-ins: the hero reads `0 of N`, no meter is broken, Recent scans shows its empty sentence.
- [ ] A checkpoint with no scans reads "no scans yet" against an empty track, not a broken bar.
- [ ] Registration state, the "closes …" hint and the Reopen / Copy-link controls behave.

## Admin — sidebar and shell

- [ ] **Sidebar height at a short viewport** (a 1366×768 laptop, or a browser with devtools docked). Nav rows
      grew from 40px to 44px to meet the touch-target rule, adding roughly 52px overall. Confirm the five
      groups and thirteen items still fit without clipping.
- [ ] The event switcher at the top of the sidebar opens `/admin/events`.
- [ ] The active nav item highlights correctly on Overview, on a sibling like Settings, and on a sub-route like
      Attendees → Import.
- [ ] Export links (Attendance / Links / QR codes) still download rather than navigating.

## Admin — Attendees

- [ ] Search filters as you type, with no button, and resets to page 1.
- [ ] Pagination preserves the search term; page 0 and a page past the last both clamp.
- [ ] The check-in column reads `In HH:MM` or `Expected`.
- [ ] Select three attendees, pick a column in the bulk bar, type a value, Update → the three rows change and
      the selection clears.
- [ ] **Applying a blank value asks first** ("Clear Table for 3 attendees?"). That confirmation is the only
      thing standing between a stray Enter and a wiped column — the old rule that simply refused blanks is gone,
      because clearing has to be possible somehow.
- [ ] The value control matches the column: a date picker for a Date column, a fixed list for a Choice column,
      a numeric field for a Number column.
- [ ] Export selected downloads a workbook containing only the selected rows.
- [ ] The "Add attendee" header link lands on a visible form, not a collapsed one.

## Admin — the attendee panel and your own columns (added 2026-09-11)

Nothing below has been run: the whole surface is behind `requireAdmin()`.

- [x] Clicking an attendee's name opens the panel as a **dialog over the list**, and the address bar shows
      `?attendee=<id>`. Escape, the close button and the backdrop all close it and clear the parameter.
      *(Verified 2026-09-11 in a browser.)*
- [x] Pasting that URL into a fresh tab opens the **same dialog over the same list**. *(Verified.)*
- [x] **Save inside the dialog closes it**, returns to the list, and raises a toast naming the attendee.
      *(Verified.)*
- [x] **Delete asks first, then closes the dialog and toasts.** *(Verified on a throwaway attendee: the confirm
      reads "Delete <name>? Their check-ins go with them.", the row leaves the table and the count drops.)*
- [x] Adding an attendee opens **their** panel over the list, with a toast. Submitting the form with the name
      blank raises a red toast instead of adding anyone. *(Verified.)*
- [ ] **Every other admin action toasts too** — settings, modules, the info page, adding a session, posting an
      announcement, adding or deleting a checkpoint, importing a masterlist, adding / renaming / deleting a
      column. No page should still render a green or red banner above its heading.
- [x] The toast leaves the address bar clean, and does not come back on reload. *(Verified.)*
- [ ] An error toast (try saving an attendee with the name blank) is red, announced to a screen reader, and
      stays on screen about twice as long as a success.
- [ ] **Copy link** puts the personal URL on the clipboard. On an insecure origin it falls back to a prompt box
      rather than failing silently — worth seeing once.
- [ ] **Download QR** saves a PNG named after the attendee. It is an `<a download>` on a data URL; confirm the
      browser saves rather than navigating.
- [x] The dialog appears **immediately** on click, with a skeleton, and the attendee fills in behind it.
      *(Verified: the dialog is open with the skeleton in the same tick as the click.)* Still worth your eye on
      whether the panel jumps as the real content lands.
- [ ] **At 1280px and below**, the two columns collapse to one and the check-in list moves under the fields
      rather than squeezing. The panel is 960px wide, so check a 1366×768 laptop as well as your own screen.
- [ ] Save changes and Delete attendee sit in one row, delete far left and save far right. Confirm Delete still
      asks first — it is no longer a form, so its confirmation is the only thing between a click and the record
      going.
- [ ] Check-in reads as a list of moments: a filled dot and `Wed 30 Sep · 08:33 · by <crew>` where they were
      scanned, a hollow dot and `not checked in` where they were not. Confirm the crew name resolves to
      something you recognise rather than a bare id.
- [ ] Add a column of each type — Text, Number, Date, Choice — and confirm each renders the right input in the
      panel and the right value in the table.
- [ ] **A Choice column offers exactly its choices, plus a blank.** A value stored before the choices changed
      still shows in the dropdown rather than vanishing on the next save.
- [ ] **Drag a column header** onto another and it takes that position. The same move is in the menu as Move
      left / Move right, which is the keyboard route — check both, and check they agree.
- [ ] **Drag a header's right edge** to resize. It must resize, not reorder: the handle sets `draggable={false}`
      precisely so the header's own drag does not fire instead.
- [ ] Reload after reordering and resizing. The layout must come back, and come back on the **first paint** —
      no flash of the default arrangement.
- [ ] **Reset layout** clears order, widths and hidden columns together, and the button disappears once there
      is nothing to reset.
- [ ] **Scroll inside an open header menu** — it must stay open. Scrolling the page behind it must close it.
      That asymmetry is the whole fix; a menu that dismissed itself as you reached for the bottom of the list
      was the bug.
- [ ] Open the menu on a header near the bottom of the window: it should flip above rather than run off-screen,
      and scroll inside itself when the column list is long.
- [ ] Hide a column from its header menu, reload, and confirm it is still hidden. Clear cookies and confirm
      every column comes back. The preference is a per-browser cookie, so it does not follow you to another
      machine and does not change what anyone else sees.
- [ ] **Rename a column and export.** The attendance sheet must carry the new label with the old values under it.
- [ ] **Delete a column, then add it back under the same name.** The values must come back — the definition is
      what gets deleted, never the data. If they do not, that is a real bug.
- [ ] **Every registration question already has a column**, with no action taken. Its header menu offers hide
      but not rename or delete, and says to edit the question under Settings. If a question is missing from the
      table, `fieldsFromQuestions` is dropping it.
- [ ] Adding a column named after an existing registration question is **refused** with a message saying so.
- [ ] **Add a column named after one of the suggestions** in the dialog ("Shirt size", "Room partner"). It
      must arrive already filled in, and the banner must say for how many attendees. That is the whole point of
      the feature; if the column comes up empty, the matching in `keyMatchesField` is wrong.
- [ ] After adopting, check the attendance export carries that column **once**, not twice under two spellings.
- [ ] **Import a masterlist whose header matches one of your columns** (e.g. a "Dietary" column and a Dietary
      header). The values must land in that column, not in a second near-identical one beside it.
- [ ] Import a masterlist with a header matching nothing. It is kept, appears in the export, and is **not**
      editable in the app until you add a column of that name.
- [ ] The Add attendee and Import masterlist dialogs now close themselves when their action finishes. Confirm
      neither is left hanging open over its own success banner.

### Not built, and deliberately

- **Sorting from the column menu.** The mockup showed Sort A→Z; it is not implemented. Sorting has to happen on
  the server to be correct across 50-row pages, and that is a bigger change than the freeze has room for.
- **Reordering columns.** They appear in the order they were added, built-ins first.
- **Per-column required/validation rules.** A Number column refuses non-numbers by blanking them; nothing else
  is enforced.
- **"New link"** (rotating an attendee's token) has no button any more, at your request. The database function
  survives, so if a personal link ever leaks it can still be rotated — but only from SQL, not from the app.
- **Removing a check-in from the panel**, also at your request. Note what that costs: the scanner's six-second
  Undo is now the *only* way back from a wrong scan. After that window, a mis-scan is permanent in the
  attendance export. If that turns out to bite on the day, the action is a dozen lines to restore.

## Scanner (`/scan/[eventId]`)

- [ ] **Read the result banner at arm's length in a dim room.** It is now a light tint rather than the old solid
      saturated fill — the honest consequence of deciding against dark mode plus the contrast rule. If it is
      not legible under ballroom lighting, that is a real finding and worth reopening the dark-mode decision.
- [ ] A successful scan, a duplicate scan and a camera error each render their own state.
- [ ] Undo still appears and works within its window.
- [ ] The result is still announced to a screen reader.
- [ ] There is **no walk-in control** on the scanner any more. Someone who is not on the list is added from
      Attendees → Add attendee, then scanned. Check that the "not on the list" message points somewhere useful
      rather than at a button that no longer exists.

## A framework bug worth knowing about

The attendee panel first shipped as a Next.js **intercepting route** (`@modal/(.)[attendeeId]`), which is the
idiomatic way to put a route in a dialog. It does not work under a dynamic segment in Next 16.3.4. The rewrite
Next generates carries the marker into its own destination —

    "destination": "/admin/events/:nxtPid/attendees/(.):nxtIattendeeId"

— and path-to-regexp reads `(.)` there as an unnamed capture group rather than as text. Every client-side
navigation to an attendee answered **500** on the RSC request, and Next quietly fell back to a full page load,
so the dialog never appeared and you got the standalone page instead.

The panel is now opened by a `?attendee=<id>` query parameter, which has none of that and is arguably better:
a hard load of the link opens the dialog over the list rather than dropping you on a bare page. If a future
Next release fixes interception, there is no reason to go back.

## Two decisions that are yours, not defects

1. **The duplicate badge on Recent scans is dead code.** `migration 0001` has `unique (checkpoint_id, attendee_id)`
   and `recordCheckin` returns the existing row on conflict, so a second scan never creates a second row. The
   Overview can therefore never show "Already in". Either the column is a two-state one and the branch should
   go, or duplicates need surfacing another way. **Do not relax the unique constraint to make the badge work.**
2. **The attendee list lost its per-checkpoint breakdown.** It used to show a chip per checkpoint an attendee had
   been scanned at; it now shows one earliest-scan badge. That is what the spec asked for, but with registration
   and dinner checkpoints you can no longer answer "did they come to dinner?" from that list.

A third, smaller one: the shipped type weights are slightly lighter than the spec's scale (caps labels ship at
700 not 800, there is no 15px/500 body step, table cells are not uniformly 13px/600). This is recorded in
`design-system/orange-lobby/MASTER.md`. Closing it means re-weighting a dozen components — worth doing only if
the hierarchy looks flat to you on a real screen.

## Already verified — no need to repeat

Public portal at 375px, in a browser: ground resolves to `#F5F5F3`; header and bottom nav carry `--shadow-bar`
with `0px` borders; tiles carry `--shadow-card`, `0px` border, `18px` radius; all three bottom-nav targets
measure 44px; `scrollWidth === innerWidth` (no horizontal overflow); zero console errors; the generic-link
fallback card renders; per-event `primary_color` flows through `brandStyle()`. Separately, `/login`'s submit
button computes to `rgb(194, 65, 12)` on white text at 44px.

Automated: 257 tests pass, lint clean, production build clean. `tests/contrast.test.ts` parses the live
`:root` from `globals.css` and enforces 4.5:1 on text pairs and 3:1 on non-text indicators, so a token edit
that breaks contrast fails the suite rather than shipping.
