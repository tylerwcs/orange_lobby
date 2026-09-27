# Live games visuals — design

Date: 2026-09-27
Status: built 2026-09-27, migration 0050 applied
Decisions D290–D322. Builds on [2026-09-26-live-games-design.md](2026-09-26-live-games-design.md)
(D250–D289); where the two disagree, this one wins and says so.
Target: after the KOM pilot (30 Sep 2026); not part of it.

## 1. Why

The live games work end to end on `ecpkom`, but they look like admin screens: the LED is a black
page with text, the phone shows grey text on an empty page during a draw, and the draw has one
way to pick a winner. This pass gives the LED and the phone a game-show look, adds sound to the
LED, lets each game choose its LED background (including a green screen for the AV team to key),
and gives the lucky draw four formats: slot machine, wheel of names, mosaic elimination and a
card round.

The host console is not restyled; it only gains the controls the new draw formats need.

## 2. Decisions

### Look and stack

- **D290** **Game-show direction.** Loud and energetic: saturated colour built from the event's
  `primary_color`, big heavy type, springy motion, sound on the LED. The event's logo and colour
  run through it; the energy leads.

- **D291** **Display font: Bricolage Grotesque 800**, loaded with `next/font/google` and used only
  by the LED and the play page, for names, numbers, questions and headings. Body text stays
  Manrope. Numbers use tabular figures.

- **D292** **`motion` for 2D animation** on the LED and the phone. On the phone it is imported only
  by the play page and the Game on banner (both client components), never by the rest of the
  portal. The play page's first-load JavaScript is measured before and after; the increase is
  reported in the pull request.

- **D293** **Three.js on the LED, hybrid.** `three` and `@react-three/fiber`,
  loaded with `next/dynamic` (`ssr: false`) only on `/display/[token]`. 3D is used where it earns
  its place: the Theme background, the slot reels, the wheel, the card round, and the winner
  spotlight and confetti. Text-heavy screens — the quiz board, race lanes, lobbies, counters —
  are normal HTML with `motion`, laid over the 3D layer on the same 1920×1080 canvas (D284).
  Text inside a 3D scene is drawn onto canvas textures with the page's own loaded D291 font
  (no separate font file). There is one WebGL canvas for the whole display, so a screen change
  never creates a second context.

- **D294** **The 3D layer renders only while something moves.** `frameloop="demand"`, with
  invalidation driven by a spin, a flip, confetti, or the Theme background's slow drift (which
  runs at 30 fps, not 60). Device pixel ratio is fixed at 1: the canvas is 1920×1080 whatever the
  screen.

- **D295** **No WebGL, no silent failure.** If a WebGL context cannot be created, the display
  shows "This display needs hardware graphics — open it in Chrome" instead of the game. If the
  context is lost mid-show, the page reloads itself; the stage redraws from the server (D262).

- **D296** **Display self-test.** `/display/[token]?test` plays a slot spin, a card flip, a wheel
  spin and each sound against built-in sample data, without reading or writing the stage. The
  runbook's pre-show checklist gains "open the display link with `?test` on the AV laptop".

### Background

- **D297** **Each game chooses its LED background**, a new `background` key in every kind's
  config: `{ kind: "theme" | "green" | "image" | "video", url: string | null }`, default
  `{ kind: "theme", url: null }`. Stored rows without it read as Theme (keys may be added, D287).

- **D298** **Theme:** a slowly drifting 3D gradient with soft light rays, tinted from the event
  colour, and the event logo small in the top-left corner. The idle screen (D285) always uses
  Theme.

- **D299** **Green:** the whole background is chroma green `#00B140` with no logo, gradient or
  vignette, for the AV team to key out. Nothing in the foreground may be green in this mode: the
  quiz's green option (D) becomes purple `#8E4EC6`, confetti drops green, and 3D lights use no
  green. The swap lives in one place (`optionStyles(background)`), shared by the LED and the phone
  so both show the same colour for the same answer.

- **D300** **Image or video:** uploaded from the game editor to the existing `event-media`
  bucket. Images go through the existing image field and gate (PNG, JPEG, WebP or SVG, up to
  4 MB). Video: MP4 or WebM up to 30 MB, too big for a Server Action (10 MB cap), so the browser
  uploads it straight to Storage with a signed upload URL the server mints after checking the
  type and size; the bucket's limit rises to 30 MB and it gains the two video types, while every
  image upload keeps its 4 MB gate in the app. Video plays muted and looped behind everything.
  A 35% black overlay keeps white text readable. If the file fails to load, the display falls
  back to Theme.

### Sound

- **D301** **The LED plays synthesised sound; phones play none.** A small Web Audio synth
  (`src/lib/games/sound.ts`, client only) makes every effect in code: countdown tick, "go" horn,
  last-3-seconds tick, drumroll under a spin, a tick per wheel slice passing the pointer, whoosh
  for eliminations and vanishing tiles, card lift and flip, and a winner fanfare. No audio files,
  nothing to license. 500 phones making noise in one room would be chaos, so phones get haptics
  only (D307). This supersedes "Sound" in the earlier spec's out-of-scope list.

- **D302** **Audio unlocks on "Click to start display"** (D284), which is already a user gesture.
  A mute toggle sits in the top-right corner, shown only while the mouse moves (the cursor is
  otherwise hidden). Muted is remembered per machine in `localStorage` (wrapped in try/catch; if
  storage is unavailable the display starts unmuted).

### Tap race

- **D303** **Vertical lanes.** Lanes are columns side by side, each racing from the bottom of the
  screen to the top, with the lane's label under its column. Up to 12 lanes (`MAX_LANES`) or 10
  solo players (`MAX_SOLO`) fit across 1920 px. Each lane's marker climbs with a spring as its
  score moves; the leader's column glows and wears a crown; a timer ring runs down in the
  top-right corner. Lanes keep a fixed order while racing (as now), and the scale stays at 110%
  of the leader so nobody looks finished.

- **D304** **No tap counts anywhere.** Not on the lanes, the podium or the phone. Scores are still
  computed and ranked exactly as D267 says; they are simply not shown. "Fastest tapper" keeps
  the name without a number. Counts also leave the wire: each display lane carries `progress`
  (0–1, its score over 110% of the leader's) instead of its score, the fastest tapper carries no
  count, and the phone's state carries no tap total. The host console shows places only. The
  load test's lane check (D289 §5) compares the server's accepted taps with the sum of
  `race_taps` in the database instead of the LED's totals.

- **D305** **Race screens:**
  - Lobby: one card per lane; players' initials pop into their lane's card as they join; a big
    "Join on your phone" call-out.
  - Countdown: full-screen 3 → 2 → 1 → GO!, each number slamming in on a spring, a tick per
    number and a horn on GO.
  - Results: a podium rising step by step (3rd, then 2nd, then 1st), spotlight and confetti on
    the winner, fanfare; the remaining places in a row beneath.

### Last one standing

- **D306** **Quiz screens:** the lobby mosaic as now with a spring pop-in per tile; the question
  slides in, then four glossy option tiles, each with its colour and a shape (▲ ◆ ● ■) so
  colour-blind players can tell them apart; a timer ring drains and ticks through the last 3
  seconds; at lock the split bars grow in; at the reveal wrong tiles shake and fade while the
  right one pulses; the existing mosaic ripple stays, with a whoosh, and "312 → 38 remain" slams
  in at the end. The winner screen is shared with the draw (D305's spotlight, confetti and
  fanfare).

### Phone

- **D307** **Full-screen states on the play page.** Each state fills the screen with colour and one
  message: joined (your lane or "You're in", gently pulsing), countdown (giant 3-2-1 in step with
  the LED), tapping (one huge button that squashes and bursts a ring on every tap, and calls
  `navigator.vibrate(10)` where supported; "Tap tap tap!" and the seconds left, no counter),
  question (four full-width tiles in the LED's colours and shapes; after a tap yours stays lit,
  the rest dim, "Locked in"), through / out (green / red), you won (confetti, "Come to the
  stage"), and draw on stage (an animated "Lucky draw is on — eyes on the screen"). Motion is
  reduced to fades when the phone asks for `prefers-reduced-motion`.

- **D308** **Game on banner:** a bold card with a pulsing dot and a **Join now** button in place of
  the plain strip; "You won" keeps its own look (D282).

- **D309** **Unchanged:** polling cadence, timing, endpoints and every game rule. D290–D308 are
  presentation only, apart from D304 taking the counts off the wire; the draw decisions below
  are where behaviour and data change.

### Lucky draw formats

- **D310** **Each draw game has a `format`:** `slot` (default), `wheel`, `mosaic` or `cards`, set in
  its editor. Existing draws read as `slot`. One format per game; to mix formats, make more than
  one draw game (the pool already excludes past winners across draws, D278).

- **D311** **`spin_s`: spin time, 3–20 s, default 6**, on every draw config. It replaces the fixed
  `SPIN_MS` for the draw: the host action computes `phase_ends_at` from the game's `spin_s`, and
  the LED's reels and wheel are timed to land exactly then. Card rounds use it for the reel that
  names each participant.

- **D312** **The LED learns the winners when the spin starts.** This amends D280: the display
  state now carries the spin's winners during `draw_spinning` (and the survivors of each mosaic
  round, D315), because a reel or wheel must be aimed at its target before it slows down. The
  winners are still drawn and stored by `draw_spin` before any animation; only the display link
  sees them early; phones' state is unchanged and still learns nothing until the reveal.

- **D313** **Slot machine:** one tall 3D reel per winner, spinning through names from the pool and
  landing on the real winner's name. "Draw all" with up to 10 winners shows up to 10 reels in two
  rows that stop left to right; above 10, the reels are replaced by the names cascading into a
  grid. Drumroll while spinning, a clunk per reel stopping, fanfare at the end.

- **D314** **Wheel of names:** a 3D wheel with one slice per person in the pool, alternating
  shades of the event colour, spinning for `spin_s` and easing to a stop with the winner under
  the pointer. Names are drawn on the slices while there are 60 or fewer; above that the slices
  are coloured lines and only the winner's name is shown, enlarged, when the wheel stops. A tick
  sounds each time a slice passes the pointer (capped at 30 ticks a second). The wheel draws one
  winner per spin: the host console offers **Draw 1** only.

- **D315** **Mosaic elimination:** a `rounds` setting (2–8, default 4). After **Draw**, the stage
  enters a new phase `draw_rounds` with `round: 0`; the LED shows the whole pool as the D275
  mosaic. The host presses **Next round** (new host action `round`); each round fades out a share
  of the tiles with a whoosh; after the last round only the winners stand, and the stage moves to
  `draw_reveal`. Who stands after each round is a pure function,
  `mosaicSurvivors(poolIds, winnerIds, round, rounds, seed)`: survivors shrink geometrically from
  the pool size N to the winner count W (`round(N × (W/N)^(round/rounds))`, never below W, winners
  always kept), non-winners dropped in a seeded order. The display state sends only the current
  round's survivor ids, so the winners cannot be picked out before the last round. A reload shows
  the same round. **Draw 1** and **Draw all** both work.

- **D316** **The pool a wheel or mosaic shows is frozen at the draw.** `phase_data.pool_at` records
  the draw time; slices and tiles come from check-ins at or before it, so someone scanning in
  mid-draw does not add a slice or tile.

- **D317** **Card round:**
  1. **Open** shuffles the deck: one card per remaining prize unit (each prize's quantity minus its
     non-void winners in this game), in random order from a cryptographic RNG, stored as
     `game_runs.deck` (an array of prize numbers, card 1 first). A card round's prizes may total
     at most 20 units; the editor refuses more.
  2. **Draw participant** spins one reel (D313) for `spin_s` and names one person. `draw_spin`
     runs with no prize (`p_prize_no` null) and records them with `prize_no` null.
  3. **`draw_card_pick`** (new phase, reached by the clock when the reel stops): the LED shows the
     remaining cards face down in a grid (1 row up to 5 cards, 2 rows up to 10 — so 5×2 for 10
     and 3×2 for 6 — 3 rows up to 15, 4 rows up to 20), each card keeping its place as others are
     taken, with the participant's name above. Cards are numbered from 1. The host console shows the same numbered grid. The participant
     calls out a card and the host taps it.
  4. **`draw_card_reveal`** (new phase): the chosen card glows, lifts, flies to the centre and
     flips to show the prize, with a fanfare.
  5. **Next participant** (host action `draw` again) returns to step 2. When no cards are left the
     LED shows "All cards dealt" and the host console offers only **Back to idle**.

  The deck is never sent to the LED or the host console; each card's prize reaches them only
  when that card is flipped.

- **D318** **"Not here" per format.** Slot and mosaic: as D281, the redraw uses a quick 3-second
  slot reel for the replacement. Wheel: the wheel spins again. Card round: available in
  `draw_card_pick` only, before a card is chosen; it voids the participant and draws another
  with a reel. **End game** during `draw_card_pick` also voids the participant, so nobody is
  left holding a draw with no prize (which would keep them out of every later draw).

- **D319** **The drawn person's phone** learns nothing during a spin (D312). It shows "You won
  <prize> — come to the stage!" from `draw_reveal` for slot, wheel and mosaic. In a card round it
  shows "You're up — come to the stage!" from `draw_card_pick`, then "You won <prize>" from
  `draw_card_reveal`.

### Data

- **D320** **Migration `0050_draw_formats.sql`** (additive; applied before the code that reads it
  is deployed, as with `0049`):
  - `game_runs.deck int[]` — null except for card rounds.
  - `draw_winners.run_id uuid null references game_runs(id) on delete cascade` — set by
    `draw_spin` from now on; null on older rows.
  - `draw_winners.card_no int null`, and `draw_winners.prize_no` loses `not null`.
  - A partial unique index on `draw_winners (run_id, card_no) where card_no is not null and not
    void`: a card can be taken once per run.
  - `draw_spin` accepts `p_prize_no` null (card rounds only: the game's `config.format` must be
    `cards`), records `run_id`, and matches voided winners with `is not distinct from` so a
    person sent away before picking a card is not redrawn for that turn. It gains
    `p_phase text default 'draw_spinning'` (`draw_rounds` for the mosaic, which then has no end
    time) and `p_extra jsonb default '{}'` merged into `phase_data` (`spin_ms`, `quick`,
    `cards`, `round`, `rounds`), and always stamps `phase_data.pool_at` with the database's
    `now()` (D316). The defaults keep the old call working, so the deployed code survives the
    migration landing first.
  - `event-media` bucket: `file_size_limit` 30 MB, `allowed_mime_types` plus `video/mp4` and
    `video/webm` (D300).
  - New `card_pick(p_event_id, p_expected, p_run_id, p_game_id, p_attendee_id, p_card_no)`: in one
    transaction, checks the run and game belong to the event and the game is a card-round draw,
    that `p_card_no` is inside the deck and not yet taken in this run, and that the attendee is
    this run's current, non-void, card-less winner, and that the stage is this run's card spin
    whose reel has stopped (stored phase `draw_spinning` with `cards`, its end time passed, with
    2 s allowed for the app's and database's clocks disagreeing); sets `card_no` and
    `prize_no = deck[card_no]`; moves the stage to `draw_card_reveal` and bumps its version with
    compare-and-set. Returns the prize number, or null when any check fails (the version does
    not move). Granted only to `service_role`, like every game RPC.
  - New phases `draw_rounds`, `draw_card_pick`, `draw_card_reveal` and host actions `round` and
    `pick` in `src/lib/games/phase.ts`.

- **D321** **Config additions** (all with defaults, so stored rows keep parsing, D287):
  - every kind: `background` (D297)
  - draw: `format` (D310), `spin_s` (D311), `rounds` (D315)
  - draw with `format: "cards"`: prizes total at most 20 units (checked in the editor's schema,
    not the stored-row schema, so an over-limit stored row still reads)

- **D322** **Winners export** gains a **Card** column (blank outside card rounds). Reset draw
  (`resetDraw`) also clears `game_runs.deck` for the game's runs, so reopening deals a fresh deck.

## 3. Out of scope

- Restyling the host console (it gains only the D315 and D317 controls).
- Sound on phones.
- The participant picking a card on their own phone.
- Blank "better luck next time" cards.
- A different format per prize inside one draw game.
- Per-event (rather than per-game) backgrounds.
- A non-WebGL fallback version of the 3D screens (D295 shows a message instead).
- Anything on the KOM pilot (30 Sep 2026).

## 4. Files

New:
- `supabase/migrations/0050_draw_formats.sql`
- `src/lib/games/sound.ts` — the Web Audio synth and mute state
- `src/lib/games/cards.ts` — deal, remaining cards, grid shape
- `src/lib/games/wheel.ts` — slice under the pointer, landing angle
- `src/lib/games/background.ts` — background config, `optionStyles(background)`
- `src/components/games/display/three/` — `Stage3D`, `ThemeBackdrop`, `SlotReels`, `Wheel`,
  `CardTable`, `Spotlight`, `Confetti3D`
- `src/components/games/display/DisplayTest.tsx` — the `?test` self-test
- `src/components/games/phone/` — the D307 state screens and the tap button
- tests alongside the existing suite for each new pure module

Changed:
- `src/lib/games/config.ts` — D321
- `src/lib/games/phase.ts` — new phases and actions, `spin_s` timing
- `src/lib/games/mosaic.ts` — `mosaicSurvivors`
- `src/lib/games/display-state.ts`, `wire.ts`, `views.ts` — D304, D312, D315, D316, D317
- `src/lib/db/games.ts` — `card_pick`, deck write on open, `resetDraw`
- `src/app/host/[token]/actions.ts`, `src/components/games/HostConsole.tsx` — Next round, card
  grid, Draw participant, Draw 1 only for the wheel
- `src/components/games/display/*` — every screen restyled; `DisplayClient` mounts the 3D layer,
  sound and mute
- `src/components/games/PlayClient.tsx`, `GameBanner.tsx` — D307, D308
- `src/app/admin/events/[id]/games/[gameId]/` — format, spin time, rounds and background controls
- `src/app/admin/events/[id]/export/winners.xlsx/route.ts` — D322
- `scripts/games-db-check.mjs` — the card-round checks in §5
- `docs/runbook.md` — the `?test` pre-show step and the green-screen note for AV
- `package.json` — `motion`, `three`, `@react-three/fiber`

## 5. Testing

- **Unit (Vitest):** `mosaicSurvivors` (lands exactly on the winners, never drops a winner,
  strictly shrinking where the numbers allow, stable for the same seed, one round and eight
  rounds); dealing the deck from remaining prize units; remaining cards after picks; grid shape
  for 1–20 cards; the wheel's slice under the pointer at any angle and the landing angle for a
  target slice; `optionStyles` swapping green only in green mode; old configs (no `background`,
  `format`, `spin_s`, `rounds`) reading with the defaults; the card-round 20-unit limit in the
  editor schema only; allowed host actions in the new phases; the display state carrying no tap
  counts (D304) and only the current round's survivors (D315).
- **Database (`npm run check:games`, on its own throwaway event):** `card_pick` refuses a card
  already taken, a card outside the deck, a stale version, someone other than the current
  winner, and another event's run or game, without moving the version; the prize recorded is the
  deck's; `draw_spin` with no prize records a card-less winner; a person voided before picking is
  not redrawn for that turn; `draw_spin` records `run_id`; deleting the event removes the new
  rows.
- **Browser, on `ecpkom` (never `ecphub`):** every phase of all three games and all four draw
  formats at 1920×1080 on the LED and at phone size on the play page, with screenshots; one run
  each with the green, image and video backgrounds; the `?test` self-test; mute on and off.
- **Bundle:** the play page's first-load JavaScript before and after (D292); the portal home's
  must not grow except by the banner.
- **Load:** the existing 500 and 1,000-phone runs, unchanged in method (D309), after this ships.
