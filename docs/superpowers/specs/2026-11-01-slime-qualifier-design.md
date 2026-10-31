# Typing qualifier, slime game — design

Date: 1 Nov 2026. Decisions D790–D796 (renumber if another session has taken them). Replaces the
game in `2026-10-31-typing-qualifier-design.md` (D767–D775); the qualifier around it stays.

## Why

The typing qualifier shipped (migration 0117, PR #1) with a 30-second word-by-word sprint through
a gate tunnel. The user doesn't like how it looks or plays (1 Nov) and wants a real game instead:
**fullscreen, first person, 3D, with game-quality graphics**.

The competition does not change (user, 1 Nov: "still competing for top 10"): a qualifier week,
unlimited runs, one board, the top 10 go to the finale (a separate project). What changes is the
game the attendee plays and the number it ranks them by.

The game, in the user's words and choices (1 Nov), refined through four rounds of live mockups:

- First person: the player stands still and sees through their character's eyes.
- **Slimes that bounce** come at the player, each carrying a word (not zombies).
- Typing a slime's word **pops** it.
- A **cute** look: the user picked **low-poly pastel** (faceted, flat-shaded, soft muted pastels)
  over the sunny meadow, candy, crystal cave, snow, event-hall, neon and graveyard looks.
  Flowers and butterflies everywhere were "a bit too cute"; a path down the middle was not wanted.

The mockup the user chose is `.superpowers/brainstorm/3982-1793467689/content/look-more.html`,
card A (git-ignored; copy anything worth keeping).

## Goals

- Replace the qualifier's game with the slime game, keeping the add-on, the window, the board, the
  admin review, **Confirm finalists** and the CSV.
- The run (user, 1 Nov):
  - Slimes hop toward the player; they keep coming, faster and faster.
  - A slime that reaches the player sticks for a **3-second buffer**; typing its word in that
    time still pops it. If not, it **explodes and costs 1 health**. The player has **3 health**;
    the run ends at 0.
  - After a while a **boss slime** arrives carrying a **long sentence**. Bosses come back, each
    tougher with a longer sentence; small slimes pause while a boss is out.
- The score: longer words score more, and a streak of words typed without a mistake builds a combo
  multiplier (user agreed, 1 Nov). Each attendee's **best score** counts on the board.
- After a run: the run's score next to their best, their place on the board and how far they are
  from the top 10, **Play again**, and the full board (user, 1 Nov: "their scores and result").
- Fullscreen on a laptop; on a phone the scene sits above the on-screen keyboard. Phone and laptop
  players share one board (user, 1 Nov).

## Non-goals

- Any change to the finale project, the window, eligibility, the confirm step or the export format
  beyond swapping wpm for score.
- Multiplayer, LED or live play.
- Turning or aiming: the player never moves the view while typing.
- Ghosts, daily streak dots, rocket skins, pilot ranks, the "you dropped" banner, the near-miss
  line and Share from the current game. The user asked only for scores and the result on the end
  screen; all of these go (see Calls made).
- Event-branded scenes (the event-hall direction was tried and dropped, 1 Nov).
- Bahasa Malaysia words or game text.

## Anti-goals (a failure even if it works)

- **Typing that lags or drops keys because of the 3D.** Input is a native text input that is
  always focused; the scene never blocks it. On a weak phone the scene degrades (fewer objects, no
  shadows, lower resolution), the typing never does.
- **A phone player beaten by their keyboard app**: autocorrect, auto-capitalise, suggestions or
  spell-check changing what they typed (same rules as today's input).
- **A score the server can't check.** The client never just reports a score (see Keeping it fair).
- **Too cute or too busy.** Low-poly pastel, restrained: no carpet of flowers, no butterflies.
- **Words you can't read.** A word label stays the same size on screen however far its slime is,
  and labels never overlap so badly a word can't be read.
- **Waiting between runs.** Play again is one key (Enter) or one tap.

## How it behaves

### The scene

- First person, standing on open grass in a low-poly world: faceted trees (gem-cut crowns and
  cone pines), rocks, snow-capped mountains on the horizon, a few faceted clouds. Soft muted
  pastels, flat shading, soft shadows. No path.
- The player's blaster sits in the lower right of the view, a chunky toy slime gun. The view
  swings gently toward the slime being typed, never more than the player could read.
- Slimes are round, glossy jelly blobs with big eyes, in a few pastel colours and sizes. They hop
  with squash and stretch. Each carries its word in a speech bubble above it.
- Slimes come only from in front (a cone ahead of the player), so the player never turns.

### The run (portal)

1. **Ready screen**: the attendee's best score and place, the gap to #10, a two-line how-to on
   the first visit, and a big **Play** button (or Enter). Pressing it enters fullscreen where the
   browser allows (see Fullscreen) and starts the run.
2. **Countdown** 3-2-1.
3. **Play** until health reaches 0:
   - **Targeting**: typing a letter locks onto the slime whose word starts with it (the nearest,
     if several). The locked word is highlighted; further letters fill it in. No two slimes on
     screen share a first letter, so the choice is never ambiguous. Backspace removes the last
     typed letter; with none left the lock releases.
   - **A wrong letter** doesn't count and costs no health, but it **breaks the combo**.
   - **Completing a word** fires the blaster; the slime squishes, bursts into droplets and leaves
     a fading puddle.
   - **Reaching the player**: a slime that reaches the player sticks to the screen and swells for
     **3 seconds**; it can still be popped by typing its word. When the time runs out it explodes:
     the screen goes gooey and the player loses **1 of 3 health**.
   - **Difficulty** rises with time: slimes come more often, hop faster, and carry longer words.
   - **Bosses**: the first boss arrives about **one minute** in, then about every minute after.
     Small slimes stop coming while a boss is out (any already out stay). The boss is big and slow
     and carries a **sentence**; each word typed takes a chunk off its health bar, and the last
     word pops it with a bigger splat. Each boss's sentence is longer than the last. A boss that
     reaches the player gets the same 3-second buffer and its explosion costs **2 health**.
   - HUD: score, combo, health hearts, and the letters typed so far for the locked word.
4. **Result** when health reaches 0: this run's score and the attendee's best, "New best!" when it
   is, their place on the board and the gap to #10 (or "You're in the top 10!"), **Play again**
   (Enter) and the board.

Leaving the tab doesn't pause the run (a pause would let a player study the words). A run that is
never submitted doesn't count.

### Scoring

- Each popped small slime scores its word's length × 10 × the combo multiplier.
- The **combo** counts words completed in a row without a wrong letter. The multiplier is
  1 + floor(combo ÷ 5), capped at ×5.
- Each boss word scores like a small slime; popping a boss adds a bonus (e.g. 100 × the boss's
  number in the run).
- An attendee's **best** is their highest-scoring valid run. Ties on the board: the earlier run.
- The exact numbers (points, combo steps, bonus, difficulty curve, boss timing) are tuning, left to
  the builder within the rules above, and shared by client and server from one module.

### Keeping it fair

- **The server owns the run.** Starting a run creates it with a random **seed** and a start time
  on the server's clock. The seed fixes everything the game throws at the player: which words and
  sentences, when and where each slime appears, its speed. The client gets the seed and runs the
  game from it.
- **The client submits its input, not its score**: the timeline of keystrokes (each key and its
  time since the start), once, when the run ends.
- **The server replays the run.** The game rules are one pure, deterministic module used by both
  the client and the server: given the seed and the keystroke timeline it produces the score and
  the time the run ended. The server stores the score it computes. It refuses a run when:
  - it arrives before the replayed end time could have been reached on the server's clock
    (start + replayed end), or twice, or after the run was abandoned by a newer start;
  - it arrives later than start + the hard cap + a grace (the run can't still be going);
  - the keystrokes aren't in time order, or end after the replayed death;
  - the typing speed of ordinary keystrokes is above a hard ceiling anywhere (no human sustains
    it), or the run is longer than a hard cap (e.g. 20 minutes);
  - the run was **started** outside the window, or the attendee can't play (cancelled, left-out
    category, preview attendee). Same check on start, as today.
- **Late submits count.** A phone that suspends the page (app switch, lock screen) may submit a
  finished run long after it ended. The run is still fully checkable from the seed and the
  keystrokes, so it counts if it arrives before start + cap + grace and no newer run has started.
  The client keeps an unsent finished timeline on the device and retries it when the page comes
  back. (A short grace protects little here: the seed gives the client every word up front, so
  the real guards are the speed ceiling, the flags and admin review.)
- **Closing time.** As today, a run **started** inside the window counts even if it ends after
  the close. Confirm finalists stays disabled until no run started before the close is still
  live (each is finished, abandoned or past its cap), and the admin page says how many are still
  being played. The portal shows a countdown to the close on the ready screen and warns in the
  last 20 minutes that a run started now still counts.
- **Paste is blocked**; autocorrect, auto-capitalise, suggestions and spell-check are off.
  **Multi-character inserts** (swipe typing, stubborn keyboards) are fed in letter by letter at
  the same timestamp and **marked as an insert** in the timeline. Inserted letters are left out
  of the speed ceiling (so an honest swipe isn't refused) but any insert **flags** the run for
  review, as today; a cheater who marks scripted bursts as inserts lands in the admin's review
  list rather than slipping through unseen.
- Runs with a very high peak typing speed or unnaturally even keystroke timing are **flagged**.
  The admin can **disqualify** a run; the attendee's best falls back to their next best valid run.
- One live run per attendee, enforced in the database; starting a new run abandons the old one.
- Device type (touch or keyboard, best effort) is recorded per run for the admin.

### Fullscreen

- On a laptop, Play requests browser fullscreen on the game element; Esc leaves it and the run
  carries on in the page. If the browser refuses, the game fills the window instead.
- On a phone the game fills the visible area above the on-screen keyboard (tracking the visual
  viewport), with the portal's own header and tiles hidden while playing. iPhone Safari can't
  fullscreen a page element, so this is the phone behaviour everywhere.

### Leaderboard (portal)

As today, with score in place of wpm: the top 10, the finale cut line under #10, #11–#20, then the
attendee's own row and its neighbours. Same names (`tag` / `tagsFor`), same eligibility, same
caching. Under review / Confirmed behave as today.

### Admin

As today, with score in place of wpm and accuracy: settings, the ranked board with each player's
best score and runs played, an attendee's runs (score, duration, slimes popped, bosses beaten, peak
typing speed, device, flagged), Disqualify / Restore, Confirm finalists, CSV. The finalist snapshot
stores the best score instead of wpm and accuracy.

## What goes from the current game

The tunnel (2D and 3D), ghosts and their offsets, the word-by-word sprint and its 30 s window,
wpm and accuracy scoring, the 250 wpm ceiling, rocket skins and the skin picker, streak days, pilot
ranks, last seen rank and the "you dropped" banner, the near-miss line, and Share. Their code,
tests and columns are removed rather than left unused.

## Data

A new migration (**0119**, the next free number) reshapes the qualifier tables. They hold no rows
in production today (checked 1 Nov after the load tests), so columns can be dropped and replaced;
the migration should still refuse to run if any qualifier run exists, rather than lose data.

- `qualifier_runs`: seed instead of words; ended at (replayed); score, slimes popped, bosses
  beaten, peak typing speed, the keystroke timeline (compact, for replay and review) instead of
  wpm, accuracy, words done and offsets. Device, multi-insert count, flagged, disqualified stay.
- `qualifier_players`: best score and its time instead of best wpm and accuracy; skin, run days
  and last seen rank go.
- `qualifier_finalists`: best score instead of best wpm, accuracy and skin. Nothing reads the
  finalists or the CSV outside the qualifier yet: the finale is about to be built (user, 1 Nov), so
  it reads rank, attendee and best score from the start, and the columns can be dropped cleanly.
- The board order, rank and size helpers order by best score desc, then best at asc.
- Writes stay in `security definer` RPCs granted to `service_role` only.

## Load

Design for **about 150 players** (user, 1 Nov: "maybe only <150"). A run is now one start and
one submit per run of a minute or more, so fewer requests than the sprint. The submit carries a
keystroke timeline (a few thousand entries at most) and the replay runs on the server; it must
stay well under the grace. Re-run `npm run load:qualifier` at 150 players on a test event before
switching it on for a real one.

## Testing

- Unit tests for the pure game rules: the same seed always gives the same slimes and words; the
  replay's score and end time for scripted keystroke timelines (pops, wrong letters breaking the
  combo, the 3-second buffer, a boss, death); targeting by first letter; every refusal reason.
- The DB check script updated for the new columns and RPCs.
- Browser pass on a **test event** (never `ecphub` or `zp-my-best-me`), on a phone (Android and
  iPhone) and a laptop: fullscreen in and out, keyboard staying open, autocorrect off, swipe
  flagged, a full run to death, Play again, window closed, admin disqualify, confirm, CSV.

## Calls made in writing this up (not discussed with the user)

- Targeting by first letter, with no two slimes on screen sharing a first letter.
- Wrong letters cost nothing but break the combo; the combo multiplier steps every 5 words, max ×5.
- A boss explosion costs 2 health (the user set 1 health for a slime, nothing for a boss).
- Ties broken by the earlier run.
- No pause; leaving the tab lets the run continue.
- A hard cap on run length (about 20 minutes) and a typing-speed ceiling, both refused.
- Low-power fallback: the same low-poly scene with fewer objects and no shadows, not a 2D game.
- Sound effects (pop, splat, hit, boss) with a mute toggle remembered on the device; no music.
- English words from the existing list; boss sentences from a new list of about 100 short,
  original, everyday sentences.
- The old extras (ghosts, skins, streaks, ranks, dropped banner, near-miss, Share) are removed,
  not kept hidden.
- (From the builder check.) A run started inside the window counts after the close, and Confirm
  waits for those runs; late submits count up to start + cap + grace, with the client retrying an
  unsent run; swipe inserts are marked, left out of the speed ceiling and flagged.

## Left to the builder

- The final models and animation of slimes, blaster and world, within low-poly pastel; whether to
  build them in code or from small glTF assets.
- Tuning numbers (points, combo, difficulty, boss timing and health), within the rules above.
- How labels avoid overlapping.
- File layout, component split, and whether the replay runs in the route or a helper.
