# Bowling lane draw — design

Status: draft for the user's approval, 9 Nov 2026. Decisions D860–D868. Migration 0133.

## Why

The ECP Rally Cup · Super Teams (ecphub, activity cb8fd074…) ends with Bowling on Fri 13 Nov,
6–8 PM at Wangsa Bowl, 6 lanes. Today Bowling is a "by hand" sport (D665): an admin types each
super team's place. The user wants the night itself in ECP Hub: a draw that mixes the bowlers
of the 6 super teams across the 6 lanes, reshuffled every game, that **everyone can see**, and
per-bowler scores keyed in by an admin, from which the places come.

The user's picture: Round 1 "Mixed teams" and Round 2 "Reshuffled", Lane 1–6, four bowlers per
lane (A1, B1, C1, D1 …), each bowler labelled by super team letter and number.

## Goals

- A new sport format, **Lane draw**, for Bowling (and anything like it).
- One press draws every game: each ready super team's 4 bowlers are placed on the lanes for
  each of the **4 games**, mixed and reshuffled every game.
- Everyone in the cup sees the draw and the scores on the portal; the admin sees it too.
- An admin keys in **each bowler's score for each game** (24 bowlers × 4 games).
- The super teams' totals give 1st–6th and the cup's place points, with no places typed.

## Non-goals

- No scoring by frame, no strikes/spares, no handicaps.
- Bowlers don't key their own scores; no scorer links.
- No lane assignment by skill or seeding; the draw is random within its rules.
- No printing or display-screen layout beyond the normal page.

## The user's decisions (9 Nov)

- 4 games (the user corrected an earlier "3").
- Everyone needs to see the draw. Bowler numbers (A1–A4) can be random within each super team.
- Scores are keyed in manually by an admin, per bowler, per game.
- A bowler who doesn't turn up scores 0.

## Decisions

**D860 — Lane draw is a sport format.** `tournament_sports.format` gains `'lanes'` next to
`'pools'` and `'manual'`, with two settings: **lanes** (default 6, 1–20) and **games** (default
4, 1–10). Result type is score. In the admin's sport form it reads "Lane draw (bowling)". The
format can only change before anything is drawn, as now.

**D861 — Who's in the draw.** Every super team (or group, without super teams) whose squad for
the sport has between min and max counted players (D643/D825), the same "ready" rule the pool
draw ticks by default. The admin sees the same tick list as the pool draw ("Draw Bowling's
lanes") and can untick a side; a side left out sits it out and gets no place. A side marked
forfeit (D660) is out. With super teams, a side's bowlers are its squad members from both teams.
A ticked side that isn't ready is drawn with the bowlers it has, as the pool draw does today,
and is marked forfeit at the deadline like any short squad.

**D861a — Forfeit after the draw.** *(My call.)* A drawn side that is marked forfeit later
keeps its seats on the grid (shown "Forfeit"); its blank seats don't hold the sport back, it
ranks after every other side and scores 0 points (D660). Lifting the forfeit brings it back
as it was. With a side forfeited, places appear once every other side's seats are keyed.

**D862 — The draw's rules.** For each game, every playing bowler gets one seat on one lane.
1. Lanes fill as evenly as possible: with 24 bowlers on 6 lanes, 4 each; with fewer, some
   lanes get one fewer. Seats on a lane are numbered from 1.
2. No two bowlers of the same side share a lane in a game, whenever the numbers allow it
   (they always do at 6 sides × 4 on 6 lanes).
3. Across the games, bowlers meet as many different lane-mates as possible: the draw tries a
   few hundred random arrangements per game and keeps the one with the fewest repeated
   pairings with earlier games (ties: the first found).
4. Each side's bowlers are numbered 1–4 at random once per draw (A1 … A4 in the user's
   picture); the numbers only label the grid, they don't change the rules.
*(Rules 1–3 are my reading of the picture: in it, every lane mixes 4 super teams and Round 2
pairs people differently. The user said the numbering can be random.)*

**D863 — Draw again until the first score.** The admin can redraw (new numbers, new lanes,
all games) until any score is keyed in. After that the draw is fixed; "Reset this sport's
results" (the existing ⋯ action) clears scores and draw together.

**D864 — Swapping a bowler.** After the draw, if a squad changes (someone can't come and the
captain names another), the admin can swap a seat's bowler for any member of the same side (either team, with super
teams) who isn't already in this sport's draw. The swap applies to that bowler's seats in every
game, scores already keyed stay on the seats, and **the swap also changes the sport's squad**
(the old bowler out, the new one in), so the squads export, the +100 bonus and the 2-sports
count follow who actually bowled. Size and deadline rules don't block an admin's swap, as
organisers can change squads at any time today. *(My call: it keeps a late change from forcing
a redraw on the night.)* A seat whose bowler leaves the squad some other way stays as it is
and still counts.

**D865 — Keying scores.** On the admin's Matches tab, Bowling shows one card per game: Lane 1–6,
each seat a name, the side's name and a score box (whole number 0–300; blank = not keyed yet).
One Save per game card. A no-show is keyed as 0 *(the user's decision)*. Scores can be
corrected at any time.

**D866 — Totals, places and points.** A side's total is the sum of all its seats' scores over
every game — a sum, not an average, so a side with fewer bowlers is behind (at ecphub every
side has exactly 4, Bowling being 4–4; the sport form warns when a lane draw's min and max
differ). *(My call.)* While any seat is blank, the page shows **running totals** and no places. Once
every seat of every game has a score, sides rank by total, highest first; equal totals share
the place (D711). Places feed the overall table and the cup's points (40/35/30/28/26/24) like
any other sport, so the super-team leaderboard needs no change.

**D867 — What everyone sees.** The portal's Results tab, Bowling: a **Totals** view (rank or
running order, side name, total) and a **Lanes** view with a chip per game (Game 1–4): Lane
1–6, each seat the bowler's name, side name and score once keyed. The viewer's own seat is
highlighted and their side's seats are marked, like "your group" elsewhere. Before the draw:
"The lanes haven't been drawn yet." The admin's Matches tab shows the same grid with score
boxes. **While the cup's overall leaderboard is hidden** (the reveal switch, D662, off), attendees
still see the draw — every game's lanes and bowlers — but no scores, running totals or places
for a lane-draw sport, since Bowling closes the week and its totals would give the winner away;
the Totals view says "Scores are hidden until the organisers reveal the results." *(The user's
decision, 9 Nov.)* Admins always see everything. The results export gets a Lanes block on the Matches sheet (Game, Lane, Seat, Bowler,
Super team, Score), and Places as now. The squads export is unchanged.

**D868 — ecphub setup.** After the build, with the user's yes: switch the cup's Bowling from
"by hand" to "Lane draw" (6 lanes, 4 games) — allowed because nothing is drawn yet — and edit
the About text's Bowling line to "4 games, each bowler's 4 scores add to the super team's
total; the lanes are reshuffled every game".

## Data

- `tournament_sports`: `format` check widened to include `'lanes'`; new `lane_count int not
  null default 6`, `games int not null default 4` with range checks.
- `tournament_pool_groups` as now records who plays (one row per playing side, pool 0) and the
  forfeit flag, so forfeits, "who's in" and the overall table keep working unchanged.
- New `tournament_lane_seats`: `sport_id`, `game` (1…), `lane` (1…), `seat` (1…), `group_id`
  (the side: lead group with super teams), `attendee_id`, `number` (1–4, the side's random
  number), `score int null check 0–300`; primary key `(sport_id, game, lane, seat)`; unique
  `(sport_id, game, attendee_id)`. RLS on, service role only, like the other tournament tables.
- Writing the draw replaces the sport's pool rows and seats in one function call (as
  `tournament_pools` writes do today), refused once any seat has a score.

## Left to the builder

The draw's search size and scoring of "repeated pairings"; component layout within the admin
design style (cards per game, sticky Save not needed); exact wording beyond what's above; how
the portal chip remembers the chosen game.

## Timing

Needed before Fri 13 Nov, 6 PM. Captain Ball, Volleyball and Dodgeball are unaffected.
