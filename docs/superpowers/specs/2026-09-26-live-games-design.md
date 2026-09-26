# Live games — design

Date: 2026-09-26
Status: approved design, awaiting spec review
Decisions D250–D289. Target: after the KOM pilot (30 Sep 2026); not part of it.

## 1. Why

Organisers want a stage moment that the whole room plays from their phones, with the result on
the LED wall. Polls and Q&A are already covered by Slido, so this is games only: three to start —
**tap race**, **last one standing** and **lucky draw** — on one shared engine so later games are
cheap.

ECP Hub already has what a game needs and a generic tool (Kahoot, Slido games) does not: every
attendee is identified by their personal link, so nobody types a nickname; `table_no`,
`category` and `company` give teams for free; check-ins say who is in the room.

The obvious build — Supabase Realtime everywhere — does not fit the plan. The org is on Pro
(with a spend cap: 500 concurrent connections, 500 messages/s, where every message delivered
*and* sent counts, and an over-quota project is disconnected). One state push to 500 phones is
500 messages; 500 phones sending taps once a second is another 500/s. So this design uses plain
HTTP polling and no Realtime (D256).

## 2. Decisions

### Shape

- **D250** **One stage per event.** At most one game is live per event, because there is one LED.
  All three surfaces follow a single `game_stage` row: which run is live, its phase, when the
  phase ends, and a `version` bumped on every change. No stage row, or `run_id` null, is idle.

- **D251** **Four surfaces:**
  - **Games admin** `/admin/events/[id]/games` — logged-in admin, beforehand: create and edit
    games, copy/rotate the host and display links, see draw winners. Sidebar item **Games** under
    **Onsite** (after Attendees), icon `star`.
  - **Host console** `/host/[token]` — phone-first, no login, run by crew or the emcee.
  - **LED display** `/display/[token]` — no login, on the machine feeding the screen.
  - **Play page** `/e/[slug]/a/[token]/play` — the attendee's personal portal.

- **D252** **Two new tokens on `events`: `host_token` and `display_token`**, separate from each
  other and from `crew_token`. The display machine is an AV laptop that should only be able to
  *show*; crew who scan doors are not necessarily the people running the stage. Both are created
  on first use from the Games page, rotate like the crew link (rotating kills the old URL at
  once), and use the crew link's expiry rule (`crewLinkLive`: closed one day after the event
  ends, closed when archived). Unpublished events refuse both.

- **D253** **`play` joins `TILE_ROUTES`** with the label "Games", so an admin adds a Games tile
  with the existing tile editor. The public (non-personal) portal has no play page: playing
  needs an identity.

- **D254** **Portal home shows a "Game on — tap to join" banner** while a tap race or last one
  standing is in its lobby or live, linking to `/play`. It polls the phone state endpoint every
  5 s, and only on events that have at least one game. A lucky draw never shows the banner: it
  has no phone play.

- **D255** **Not required: check-in.** Anyone with a personal link can join a race or last one
  standing. Only the lucky draw uses check-ins (D278).

### Sync

- **D256** **HTTP polling, no Supabase Realtime.** Phones and the host poll about once a second
  while a game is in lobby or live, every 5 s otherwise; the LED polls every 250 ms. Rejected:
  Realtime for everything (breaks the Pro quotas above ~200 players); Realtime pushes plus HTTP
  writes (caps at 500 connected phones, needs a polling fallback anyway, and adds a browser
  Supabase client and channel security for about half a second of latency). Realtime pushes can
  be added on top later without changing the model.

- **D257** **Every response carries the server clock** (`now`, epoch ms). Clients estimate their
  offset as `now − (sent + received) / 2` and run all countdowns against server time, so 3-2-1
  lines up across devices.

- **D258** **Phases advance by the clock, not by a job.** A phase with `phase_ends_at` (countdown,
  race live, question, spinning) is resolved on read by a pure `resolvePhase(stage, now)`; there
  is no cron and no timer on the server. Host actions write the stage; everything else is read.

- **D259** **`GET /api/play/[token]/state?v=N`** (phone). The shared part (stage, game title,
  options) is memoised per event in-process for 1 s, so 500 phones cost about one database read
  per second per server instance, not 500. The personal part ("you're in", "you're out", "your
  lane is Table 7", "you won") is read only when the version differs from `v`. When nothing
  changed it returns `{ now, v, unchanged: true }`.

- **D260** **`GET /api/display/[token]/state`** (LED) returns the **full view on every poll** — no
  versioning. The LED is one client, so the largest payload (last one standing's roster, about
  15 KB at 500 players) every second is nothing, and a view that is always complete cannot get
  out of step. The host console gets the same treatment from `GET /api/host/[token]/state`, plus
  what only the host sees: the game list, the draw pool size, and the winner during the spin.
  Joining is `POST /api/play/[token]/join`, which answers with the phone's fresh state.

- **D261** **Host actions are server actions on `/host/[token]`**, each one an RPC that takes the
  **expected version** and refuses a stale one. Two crew phones pressing "Next" together cannot
  skip a question; the loser sees the current stage.

- **D262** **Failure behaviour.** A phone that drops keeps polling with backoff and joins
  whatever phase is current when it returns; taps it could not send are dropped, never replayed.
  The LED is stateless and redraws from the stage on reload. If the host phone dies, the host
  link opened on any other phone finds the stage exactly where it was.

### Tap race

- **D263** **Lanes are picked by the host per race**: **category**, **any attendee field** the
  event defines (table, company and department are ordinary fields in `extra` now), or **solo**.
  Attendees with no value for the chosen field race in an **"Others"** lane. A numeric value is
  labelled with its field ("Table 7"); any other value is its own label ("Sales"). Solo means
  every player is their own lane.

- **D264** **Joining.** In the lobby the phone shows the player's lane ("You're racing for
  **Table 7**") and a **Join** button; joining creates their `race_taps` row with the lane
  snapshotted, so editing an attendee mid-race does not move them. No joining once the countdown
  starts.

- **D265** **Phases:** lobby (host "Open lobby") → countdown 3 s (host "Start") → live for the
  game's duration (default 20 s, 10–60) → results. The host can stop a live race early, which
  ends it at that moment.

- **D266** **Taps are sent in batches about once a second** (`POST /api/play/[token]/taps {n}`).
  The RPC adds at most `ceil(15 × seconds since this player's last accepted batch)` (elapsed
  capped at 3 s), which stops auto-clickers without hurting honest fast thumbs, and accepts taps
  only between live start and live end + 1.5 s grace. One row per player, so batches never
  contend on a shared counter.

- **D267** **A lane's score is the average taps per player with at least one tap.** Averaging
  stops a big table beating a small one by size alone; ignoring zero-tap players stops someone
  who joined and put their phone down dragging their lane down.

- **D268** **LED.** Lobby: lanes filling up with player counts. Live: horizontal lanes racing,
  positions eased between polls so movement is continuous. More than 12 lanes: the top 12 live,
  full ranking at the end. Solo: the top 10. Results: top-3 podium plus the fastest individual
  tapper, by first name and initials (D273).

- **D269** **Phone.** Live: one huge tap button, the player's own count, and `navigator.vibrate`
  where supported (Android). Results: "Table 7 finished **2nd** — you tapped 142". The host can
  "Run again" (a new run, same game) or go back to idle.

### Last one standing

- **D270** **Questions are prepared in admin**: 2–4 options each, one correct, per-game answer time
  (default 10 s, 5–30).

- **D271** **Phases:** lobby (host "Open lobby"; phones show **I'm in**) → question *n* (host
  "Start" or "Next"; runs for the answer time) → locked (automatic when time is up) → reveal
  (host "Reveal") → next question, or winner. No joining once question 1 starts.

- **D272** **Rules.**
  - No answer by the deadline (+1.5 s grace) is a wrong answer.
  - One answer per question per player; the first one counts.
  - **If every player still in is wrong, nobody is eliminated** ("Everyone survives!"), so the
    game can never end with zero players.
  - The game ends when one player is left. If questions run out first, everyone still in is a
    joint winner.
  - Eliminated players still see each question, marked "watching", but cannot answer.
  - Elimination is worked out once, by the Reveal action, and stored in
    `survival_players.out_at_question`.

- **D273** **Names on the LED are initials plus first name** (e.g. "PR · Priya" for Priya
  Ramasamy): the first letters of the first two words of `attendees.name`, and its first word.
  For names written surname-first ("Tan Mei Ling") the first word is the surname; the initials
  still tell two Tans apart. This holds for every tile, podium
  and grid. The only exception is the **winner card** — the last one standing and the lucky draw
  winner — which shows the full name and company, because that is the moment someone walks on
  stage.

- **D274** **The mosaic.** One grid carries the whole game: tiles pop in during the lobby as
  players tap "I'm in", and the same grid is the reveal. Tile size adapts to the players still
  in: from about 200 players up, a dense grid of coloured cells with small type; below that,
  larger tiles. Every tile shows initials plus first name (D273).

- **D275** **Reveal sequence** (about 6 s, played by the LED on entering reveal):
  1. The correct option lights up and holds for 1 s.
  2. Cut to the full-screen mosaic of everyone who was still in going into this question.
  3. Eliminated tiles darken to near-black greyscale in a staggered random ripple over ~2 s;
     survivors stay lit and pulse once.
  4. A counter ticks down as tiles go dark: "312 → **38 remain**".
  5. Dark tiles collapse away and survivors regroup into bigger tiles.

  On "everyone survives" the whole mosaic flashes once instead. The winner's tile expands into
  the full-screen winner card. The ripple order is seeded by run and question number, so a
  reload mid-reveal replays it identically. Animation uses only opacity, filter and transform,
  so 500 tiles stay smooth on an ordinary laptop.

- **D276** **LED during a question:** the question, colour-coded options, countdown and
  "184 answered". **Locked:** the answer split (how many picked each option) for suspense, before
  the host reveals. **Phone:** the question text and big colour buttons matching the LED.

### Lucky draw

- **D277** **No phone play.** The draw runs on the host console and the LED.

- **D278** **Pool:** attendees checked in at the game's chosen checkpoint, minus the excluded
  categories, minus anyone who is a non-void winner of **any** draw in this event. When the pool
  is empty the draw button is disabled with "No one left to draw".

- **D279** **Prizes** are a list of name + quantity, drawn in list order (the admin orders them,
  typically consolation first and grand prize last). The host shows the next prize and the pool
  size ("**184 eligible**"), and chooses **Draw 1** or **Draw all remaining** of that prize.

- **D280** **The server picks.** Winners are chosen uniformly at random with a cryptographic RNG
  inside the draw RPC, before anything animates. The LED's rolling names (~5 s, slowing down) are
  theatre that lands on the stored result. The display state does not contain the winner until
  the reveal phase, so the answer is never on the wire early.

- **D281** **The host sees the winner as soon as it is drawn**, during the spin, so they can
  prepare the call-out. After the reveal they mark **✓ Present** or **Not here — redraw**; redraw
  sets `void` on that winner (kept on record) and draws again for the same prize.

- **D282** **The winner's phone**, if their play page or portal home is open, shows
  "🎉 You won **iPad Air** — come to the stage!". "Draw all" shows the winners as a grid on the
  LED.

- **D283** **Winners export:** the Games page lists each draw's winners (void ones struck
  through), with a `winners.xlsx` export alongside the existing exports.

### LED and devices

- **D284** **The display is designed for 16:9 at 1920×1080.** It opens on a full-screen
  **"Click to start display"** button, because browsers only allow fullscreen and a screen wake
  lock after a user gesture. The wake lock is re-acquired when the tab becomes visible again.

- **D285** **Idle LED:** the event name and branding with "Get ready…". After a game it keeps the
  last results until the host moves on.

### Data

- **D286** **Migration `0046_games.sql`** adds:
  - `events.host_token text unique`, `events.display_token text unique`
  - `games (id, event_id, kind, title, config jsonb, position, created_at)`, with `kind` in
    `('tap_race','survival','draw')`
  - `game_runs (id, game_id, grouping, started_at, ended_at)` — one row per play-through
  - `game_stage (event_id pk, run_id, phase, phase_data jsonb, phase_ends_at, version)`
  - `race_taps (run_id, attendee_id, lane_key, taps, updated_at)`, pk `(run_id, attendee_id)`
  - `survival_players (run_id, attendee_id, out_at_question int null)`, pk
    `(run_id, attendee_id)`
  - `survival_answers (run_id, attendee_id, question_no, choice, answered_at)`, pk
    `(run_id, attendee_id, question_no)`
  - `draw_winners (id, game_id, prize_no, attendee_id, drawn_at, void bool default false)`

  Everything cascades from `events` and `attendees`, so the Settings Danger-zone delete removes
  it. RLS on, no policies, as for every other table; writes go through `security definer` RPCs
  granted only to `service_role`.

- **D287** **`config` is validated per kind with zod** in `src/lib/games/config.ts`, like
  `modules`:
  - tap race: `{ duration_s }`
  - last one standing: `{ answer_s, questions: [{ text, options[2..4], correct }] }`
  - lucky draw: `{ checkpoint_id, exclude_categories[], prizes: [{ name, quantity }] }`

  Keys may be added but never removed, or stored rows stop parsing.

- **D288** **All game rules are pure functions** under `src/lib/games/`, so they are unit-tested
  without a database: phase resolution, lane grouping, scoring, the tap cap, elimination, draw
  eligibility, name formatting, mosaic tile tiers, and the seeded ripple order. The RPCs enforce
  the same rules at write time.

- **D289** **Designed for about 500 players, with the path to more known.** The limits are Vercel
  function throughput and Postgres writes, not a connection quota. The load test (§5) is run at
  1,000 to find the ceiling before an event needs it.

## 3. Out of scope

- Polls and Q&A (Slido covers them).
- Sound: the AV team plays music; the app plays no audio.
- Custom teams: lanes come only from existing attendee fields.
- More than one live game per event, or choosing a game on the LED itself.
- Photos on tiles (attendees have no photo).
- Supabase Realtime (D256).
- Result history screens for races and last one standing. Runs are stored, but only draw winners
  get a list and an export.
- Anything on the KOM pilot (30 Sep 2026).

## 4. Files

New:
- `supabase/migrations/0046_games.sql`
- `src/lib/games/` — `config.ts`, `phase.ts`, `race.ts`, `survival.ts`, `draw.ts`, `names.ts`,
  `mosaic.ts`, with tests alongside the existing suite
- `src/lib/db/games.ts` — server-only reads and RPC calls
- `src/app/admin/events/[id]/games/` — list, per-kind editors, links card, winners, export route
  `export/winners.xlsx`
- `src/app/host/[token]/` — host console and its server actions
- `src/app/display/[token]/` — LED page
- `src/app/e/[slug]/a/[token]/play/` — play page
- `src/app/api/play/[token]/state`, `.../join`, `.../taps`, `.../answer`;
  `src/app/api/display/[token]/state`; `src/app/api/host/[token]/state`
- `src/components/games/` — race lanes, mosaic, draw roller, winner card, tap button
- `scripts/games-load.mjs` — the load test

Changed:
- `src/lib/modules.ts` — `play` in `TILE_ROUTES` and `TILE_ROUTE_LABELS`
- `src/components/admin/nav.ts` — Games under Onsite
- `src/app/e/[slug]/a/[token]/page.tsx` — the "Game on" banner (D254)
- `src/lib/types.ts` — event tokens and game types

## 5. Testing

- **Unit (Vitest):** all of D288, including the edge cases: the "Others" lane, averaging over
  players with at least one tap, the tap cap and the grace window, no answer = out, everyone
  wrong = everyone survives, joint winners, no joining after question 1, draw eligibility across
  draws and void winners, draw all remaining, name formatting for one-word and many-word names,
  and the seeded ripple order being stable.
- **Database, on a test event (never `ecphub`):** a stale version is refused; taps never exceed
  the cap; answers after the deadline are refused; a second answer is ignored; deleting the event
  removes all game rows.
- **Load (`scripts/games-load.mjs`, against a Vercel preview on a test event):** 500 simulated
  phones polling state, sending tap batches during a 20 s race, and answering a 10 s question.
  Pass: state p95 under 300 ms, no 5xx, the LED's lane totals equal the sum of `race_taps`,
  Supabase CPU comfortable. Then again at 1,000 to find the ceiling.
- **Devices:** the play page on iPhone Safari and Android Chrome; the host console on a phone;
  the LED page fullscreen in Chrome at 1920×1080. One full dress run: 3 races, 5 questions, one
  draw with 3 prizes including a redraw.
