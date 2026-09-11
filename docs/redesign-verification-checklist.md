# Redesign verification checklist — login-gated surfaces

Date: 2026-09-10
Covers: the redesign in `docs/superpowers/specs/2026-09-10-orange-lobby-redesign-design.md` (commits `85ae469`–`7f3410e`).

Every admin route sits behind `requireAdmin()` and the scanner behind login. Those surfaces could not be
opened during implementation — entering credentials is not something the assistant does — so the checks
below are the ones nobody has run. The public portal **was** verified and is recorded at the bottom.

Run `npm run dev`, sign in, and work through these.

## Admin — Overview (`/admin`)

- [ ] `/admin` lands on the live event's Overview, not the event list. With no live event it lands on `/admin/events`.
- [ ] **At 1440px specifically**, the arrivals chart's 16 axis labels do not overflow and stay aligned with their
      bars. The chart scrolls horizontally inside its own container if the panel is narrow — the page itself
      must never scroll sideways.
- [ ] **The arrivals window is 08:00–12:00.** If the KOM's door opens outside that, the chart renders flat and
      correct-looking while telling you nothing. Confirm the window matches the real check-in period, or say
      so and it becomes a prop.
- [ ] The chart heading names the checkpoint it covers. The hero number above it counts **all** checkpoints —
      confirm that difference reads clearly rather than looking like a contradiction.
- [ ] With zero check-ins: hero reads `0 of N`, no bar is broken, Recent scans shows its empty sentence.
- [ ] A checkpoint with no scans shows an empty track, not a broken bar.
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
- [ ] Select three attendees → Assign table → the three rows update and the selection clears.
- [ ] **Assign table with the field left blank does nothing** (it used to wipe `table_no` silently).
- [ ] Export selected downloads a workbook containing only the selected rows.
- [ ] The "Add attendee" header link lands on a visible form, not a collapsed one.

## Admin — the attendee panel and your own columns (added 2026-09-11)

Nothing below has been run: the whole surface is behind `requireAdmin()`.

- [ ] Clicking an attendee's name opens the panel as a **dialog over the list**, and the address bar shows
      `/attendees/<id>`. Escape, the close button and the backdrop all close it and take the URL back.
- [ ] **Pasting that URL into a fresh tab renders the full page instead**, with the same content. That split is
      the whole point of the intercepted route; if the modal appears on a hard load, the interception is wrong.
- [ ] Save inside the dialog keeps you in the dialog and shows "Saved." Delete closes it and returns to the list.
- [ ] **Copy link** puts the personal URL on the clipboard. On an insecure origin it falls back to a prompt box
      rather than failing silently — worth seeing once.
- [ ] **Download QR** saves a PNG named after the attendee. It is an `<a download>` on a data URL; confirm the
      browser saves rather than navigating.
- [ ] The dialog appears **immediately** on click, with a skeleton, and the attendee fills in behind it. The
      panel must not jump or resize as the real content lands — if it does, the skeleton's block sizes are wrong.
- [ ] Check-in reads as a list of moments: a filled dot and `Wed 30 Sep · 08:33 · by <crew>` where they were
      scanned, a hollow dot and `not checked in` where they were not. Confirm the crew name resolves to
      something you recognise rather than a bare id.
- [ ] Add a column of each type — Text, Number, Date, Choice — and confirm each renders the right input in the
      panel and the right value in the table.
- [ ] **A Choice column offers exactly its choices, plus a blank.** A value stored before the choices changed
      still shows in the dropdown rather than vanishing on the next save.
- [ ] Hide a column from its header menu, reload, and confirm it is still hidden. Clear cookies and confirm
      every column comes back. The preference is a per-browser cookie, so it does not follow you to another
      machine and does not change what anyone else sees.
- [ ] **Rename a column and export.** The attendance sheet must carry the new label with the old values under it.
- [ ] **Delete a column, then add it back under the same name.** The values must come back — the definition is
      what gets deleted, never the data. If they do not, that is a real bug.
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
- [ ] The walk-in path still works.

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

Automated: 214 tests pass, lint clean, production build clean. `tests/contrast.test.ts` parses the live
`:root` from `globals.css` and enforces 4.5:1 on text pairs and 3:1 on non-text indicators, so a token edit
that breaks contrast fails the suite rather than shipping.
