# Typing qualifier — design

Date: 31 Oct 2026. Decisions D767–D775. Migration 0117.

## Why

The user wants a typing contest with a **finale**: the 10 fastest typists face each other in a
live, multiplayer 3D game ("rocket launch": everyone types the same paragraph, progress is
altitude). The finale is a **separate project** (user, 31 Oct).

This is what comes before it: a **qualifier week**. Every attendee plays a single-player,
word-by-word typing sprint on their own device, as often as they like, for one week. Their **best
wpm** counts. When the week closes, the **top 10 overall** go to the finale.

The user wants it **addictive** — people should keep coming back all week to beat their best and
climb into the top 10. The hooks below are borrowed from games built on "one more try" (instant
restart, near-miss feedback, ghosts, a visible cut line, streaks, ranks, cosmetic unlocks).

Story wrapper: **astronaut selection week**. Runs are test flights, the top 10 earn a seat on the
launch (the finale).

## Goals

- A new add-on, **Typing qualifier**, that an Ecopia admin switches on per event (Settings →
  Features, D553), with its own portal page and launcher tile route, and an admin page.
- An admin sets the qualifier **window** (opens / closes, Malaysia time `MY_TZ`, D165). Before it opens the
  portal shows when it opens. After it closes, admins review the top runs and **confirm the
  finalists**, which freezes the top 10 (user, 31 Oct: "Review, then confirm").
- Attendees play **30-second sprints**: random common English words, one at a time, in a 3D gate
  tunnel. Unlimited runs while the window is open.
- **One combined leaderboard**, phone and keyboard players together, ranked by each attendee's
  best wpm. The top 10 when the window closes qualify (user, 31 Oct: "One board, top 10").
- Works well on **both phones and keyboards** (user, 31 Oct: "both actually").
- **Who plays:** every active (not cancelled) attendee of the event, except categories the admin
  leaves out (e.g. staff, committee) (user, 31 Oct: "All, minus categories"). The event's preview
  attendee (`events.preview_attendee_id`) never plays or appears.
- The admin can review runs, disqualify a run, and export the final top 10 for the finale.

## Non-goals

- The finale itself (separate project). This project only produces the final top 10 and keeps
  the data the finale may want (names, best wpm, rocket skin).
- Any multiplayer or live/LED play.
- Separate boards or seats per device.
- WhatsApp or email notifications.
- A Bahasa Malaysia word list or BM game text (live games are English only too; see Calls made).
- Prizes, payments, accounts or logins beyond the existing personal portal link.

## Anti-goals (a failure even if it works)

- **The score depends on anything but typing.** Combos, streaks, skins and effects are
  decoration only. The ranking number is wpm, nothing else.
- **Typing that lags or drops keys because of the 3D.** The input is a plain native input; the 3D
  scene is decoration and must never block or delay it. On a weak phone the scene degrades, the
  typing never does.
- **A phone player beaten by their own keyboard app**: autocorrect, auto-capitalise, suggestions
  or spell-check changing what they typed.
- **An easy way to cheat into the top 10** (paste, swipe typing, scripted submissions, editing the
  request). Not every cheat can be stopped server-side, so the top runs are reviewable before the
  finale.
- **A personal portal link leaking** through the share feature. Shared text never contains the
  attendee's token.
- **Waiting between runs.** Restart is one key (Enter) or one tap and the next countdown starts
  in under a second.

## How it behaves

### The run (portal)

1. **Ready screen** — the attendee's best, rank, the gap to #10, and a big **Fly** button (or
   Enter). First visit shows a two-line how-to.
2. **Countdown** 3-2-1 (about 3 s). The words are already loaded but hidden.
3. **Sprint, 30 s.** One current word is shown large in the middle of a gate; the next 3 words
   are shown small behind it. The attendee types into a single input:
   - Correct letters turn green, a wrong letter turns red.
   - **Space (or the keyboard's space) only advances when the word is exactly right.** A wrong
     word must be fixed with backspace first (accuracy gate). Completing a word flies the ship
     through the gate.
   - Live wpm and the time left are always visible.
   - Two **ghosts** fly in the tunnel: the attendee's own best run, and the current #10's best
     run (the cut line). Each ghost's position is replayed from that run's word times. No #10
     yet (fewer than 10 players) → no cut-line ghost. No best yet → no own ghost.
4. **Result screen** — wpm (big), accuracy, and one near-miss line, for example "Only 1.4 short of
   your best", "New best!", "You're in the top 10!", or "2.1 wpm to the top 10". A bar shows the
   attendee's best against the #10 line. **Fly again** is the primary action (Enter works).
   **Share** is secondary.

The words for a run come from the server, in order, enough for any human speed (e.g. 120). They
are lowercase, letters only, from a list of about 1,000 common English words (no proper nouns, no
offensive words), picked at random per run.

### Scoring

- **wpm** = (characters of completed words, each plus one for its space, plus the correct
  characters typed so far of the current word) ÷ 5 ÷ 0.5 min. Rounded to one decimal for display
  and stored with that precision.
- **Accuracy** = correct keystrokes ÷ all character keystrokes (backspace not counted), shown as a
  whole percent. It is not part of the score, only the tie-break.
- An attendee's **best** is their run with the highest wpm. Ties on the board: higher wpm, then
  higher accuracy of that run, then the earlier run.
- A run shorter than the full 30 s (tab closed, connection lost) does not count.

### Keeping it fair

- **The server owns the run.** Starting a run creates it on the server with its words and a
  start time; the client gets the words and the start time. The client submits the result once,
  at the end: the words completed, each word's finish offset in ms, the in-progress prefix, and
  keystroke totals.
- **The server recomputes** wpm and accuracy from what was submitted and refuses a run when:
  - it arrives outside start + 30 s + a small grace (late or early), or twice;
  - the completed words are not exactly the start of that run's word list, or the offsets are not
    increasing or exceed 30 s;
  - the wpm is above a hard ceiling (no human types it — e.g. 250);
  - the window is closed, or the attendee is cancelled, in a left-out category, or the preview
    attendee. The same check guards starting a run; the page itself shows "This challenge isn't
    open to you" to someone who can't play (the tile's own category setting only hides the tile).
- **Paste is blocked** in the input. Autocorrect, auto-capitalise, suggestions and spell-check are
  turned off on the input.
- **Multi-character inserts** (swipe/glide typing, or an Android keyboard that ignores
  `autocorrect="off"` and commits whole words) are **accepted but counted**. A run with any is
  flagged for review, and the player is told once "Type letter by letter — swipe typing may be
  disqualified". Honest phone players on stubborn keyboards are never locked out; only the top of
  the board needs checking.
- **Device type** (touch keyboard or physical keyboard, best effort) is recorded on each run for
  the admin. It does not change ranking.
- Runs above a **review threshold** (e.g. 150 wpm, or suspiciously even word times) are flagged
  in the admin. The admin can **disqualify** a run; the attendee's best falls back to their next
  best valid run.
- One live run per attendee at a time, enforced in the database (the in-memory `allow()` is per
  server); starting a new run abandons the old one.

### Progression and pull (decoration only)

- **Pilot rank** from best wpm: Cadet (< 40), Pilot (40–60), Commander (60–80), Ace (80+).
- **Daily streak**: consecutive days (Malaysia time) with at least one finished run during the
  window. Shown as 7 dots for the week.
- **Rocket skins**: a handful of colours/patterns unlocked by milestones (first run, 10 runs, a
  3-day streak, each rank reached). The attendee picks one; it shows on their ship and next to
  their name on the board. Kept for the finale project to read.
- **"You dropped" notice**: when the attendee opens the qualifier and has been pushed out of the
  top 10 (or down the board) since their last visit, a banner says so, e.g. "You were knocked to
  #11 — 0.6 wpm to get back in".
- **Share**: the device share sheet (or copy) with text like "I flew 76 wpm in the Typing
  Qualifier — #14 so far" and the event's **public** address, which opens the event home. Never
  the personal link. There is no public board page.

### Leaderboard (portal)

- Shows the top 10 with the **finale cut line** under #10, then #11–#20, then the attendee's own
  row and the rows just above and below it if they're further down. A countdown to the close.
- Names shown the way live games show them (`tag` / `tagsFor` in
  `src/features/games/names.ts`), with the attendee's skin colour.
- Only eligible attendees appear: someone cancelled, or in a category left out after they played,
  drops off the board (their runs are kept). Changing the left-out categories is locked once the
  finalists are confirmed.
- Counts and ranks come from the database. The board is fetched when the page opens and after each
  run, cached per server for a few seconds (as games do). No polling while playing.

### When the window closes

- Starting a run is refused. A run already in progress when the window closes still counts if it
  is submitted within its own 30 s + grace.
- **Under review** (closed, not yet confirmed): the portal shows the board with "Results under
  review — finalists announced soon" and no "You're in the top 10!" claims. Admins can still
  disqualify or restore runs; ranks recompute, so #11 moves up when a top-10 run is removed.
- **Confirmed**: an admin presses **Confirm finalists**. The top 10 at that moment is stored as a
  snapshot (attendee, rank, best wpm, accuracy, skin) — the finale list. After this nothing changes
  the snapshot or the board: disqualify/restore and the window settings are locked. The portal
  shows the final board, the attendee's final rank, and "You're through to the finale!" for the
  ten.
- Undoing a confirm is not offered in the UI (the user can ask for it later if needed).

### Admin

A **Typing qualifier** page under the event (sidebar item, hidden when the add-on is off):

- **Settings**: window open and close (Malaysia time), categories left out (none by default), and
  the on/off of the portal tile is the
  normal launcher tile control.
- **Leaderboard**: full ranked list (paged), each row with best wpm, accuracy, runs played, device
  type of the best run, and a flag when it needs review.
- **An attendee's runs**: their runs, newest first, with the same details; **Disqualify** /
  **Restore** on a run.
- **Confirm finalists** (only after the close): shows the current top 10 and the number of
  flagged runs still in it, asks for confirmation, then freezes the list.
- **Export** the ranked list (CSV); once confirmed, the finalist snapshot is clearly marked as the
  finale list.

## Data (sketch, migration 0117)

- Qualifier settings per event (window open/close, left-out categories, confirmed at / by).
- **Finalists** snapshot written on confirm (event, attendee, rank, best wpm, accuracy, skin).
- **Runs**: event, attendee, words (or the seed that reproduces them), started at, submitted at,
  wpm, accuracy, completed word count, word finish offsets (compact int array — used for ghosts and
  review), device type, flagged, disqualified.
- **Per-attendee summary**: best valid run, runs played, streak days, unlocked skins, chosen skin,
  last seen rank (for the "you dropped" notice). Could be derived, but a summary row keeps the
  board query cheap.
- Writes through `security definer` RPCs granted to `service_role` only, like the games tables.

## Load

Design for 500–1,000 attendees playing in the same evening: about two requests per run (start,
submit) per ~35 s per player, plus a board read after each run. Add a load script in the style of
`scripts/games-load.mjs`.

## Testing

- Unit tests for the pure logic: wpm and accuracy, run validation (every refusal reason), the tie
  order, rank tiers, streak counting, skin unlocks, the near-miss line.
- A DB check script for the RPCs (start, submit, disqualify, board order, window edges).
- Browser check on a **test event** (never a live event) on a phone and on a laptop: autocorrect
  off, swipe ignored, paste blocked, ghosts, restart speed, window open/closed, admin disqualify.

## Calls made in writing this up (not discussed with the user)

- English only (words and game text), as live games are today.
- 30 s run; accuracy gate (must fix a wrong word before moving on); the wpm formula above.
- Tie-break: accuracy, then earlier run.
- Names on the board as live games show them (reuse `tag` / `tagsFor`).
- Rank tiers and their wpm bands; skins unlock by milestones.
- "You dropped" notice inside the qualifier only.
- Hard ceiling 250 wpm (refused) and review threshold 150 wpm (flagged).
- Multi-character inserts are accepted and flagged, not blocked.
- Window and streak days in Malaysia time (`MY_TZ`); events have no timezone of their own.
- Share opens the event home; no public board.
- Someone cancelled (or moved into a left-out category) before the confirm drops off the board;
  after the confirm the finalist snapshot doesn't change, and the organiser handles it by hand.
- Ecopia admins switch the add-on on (D553); the event's committee may review and disqualify runs
  like any other event admin work (D552).

## Code facts the plan must cover (from the builder check)

- New tile route in `TILE_ROUTES` (`src/lib/modules.ts`, append only), personal-only like `play`
  (`PERSONAL_ONLY_ROUTES`).
- New add-on key in `ADDON_KEYS` / `FEATURES` (`src/features/catalogue/catalogue.ts`), a new
  `NavKey` and its `hiddenNav` rule (`features.ts`), and the sidebar item in
  `src/components/admin/nav.ts`.
- three / R3F are only loaded on the LED display today
  (`src/features/games/components/display/three/`). The portal page must load the 3D scene lazily,
  after the input is ready, so a phone can start typing before it arrives.
- Migration 0117 is the next free number.

## Left to the builder

- The 3D scene's exact look (gate tunnel, ship, ghosts), using three / R3F and the event theme;
  and the low-power fallback.
- Component split, file names, API route vs server action per call (follow games for the
  high-frequency calls).
- Skin designs and the exact milestone list.
- Exact copy of the near-miss lines.
