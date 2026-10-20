# Tournament activity, layer 2: results and leaderboard — design

Date: 16 Oct 2026. Decisions D653–D672. Migration: the next free number (expected 0098).
Builds on layer 1, `2026-10-16-tournament-squads-design.md` (D637–D652).

## Why

ecphub's five sports run the week of 19 Oct between its 12 attendee groups. Squads (layer 1) are
built. The user wants this week's results kept in ECP Hub too, not on paper: an organiser keys in
each match's score on the admin page, standings and brackets update, every group ends each sport
in a place from 1st to 12th, each place earns points, and the five sports add up to an overall
winner for the week. Attendees follow it all on the tournament's portal page.

The model the user pointed to is the Reclub app: per competition, a match **List** (grouped by
pool and round, with All / Your matches / Remaining / Completed filters), **Standings** per pool,
and a **Playoffs** bracket.

This must work for ecphub next week, and for other events and formats later, before the full
format builder (layer 3) exists.

## ecphub's format, as the user described it

- **Pools.** The 12 groups are split into 4 pools of 3, drawn at random (or placed by an admin),
  separately for each sport. Each pool plays a round robin. A pool is ranked by wins, then point
  difference, then points scored.
- **Placing brackets.** The 1st of each pool go to **Gold**, the 2nds to **Silver**, the 3rds to
  **Bronze**. Each bracket has two semis, a final and a 3rd-place match. Gold decides places
  1–4, Silver 5–8, Bronze 9–12. An admin picks who plays whom in each semi.
- **Swimming** is a timed relay. Each pool swims as one heat, ranked by time. Each bracket is one
  final race of four squads, whose times give its four places.
- **Scoring.** One score per team per match (15–6), not sets. Swimming takes one time per squad.
- **Points per place,** the same for every sport: 1st 40, 2nd 35, 3rd 30, 4th 29, 5th 28,
  6th 27, 7th 26, 8th 25, 9th 24, 10th 23, 11th 22, 12th 20. The sum over all sports is the
  overall total.
- **Forfeit.** A group whose squad was short at the deadline (D646's Forfeit) scores **0 points
  for that sport**.

## Goals

- An admin keys in results from the admin page, one sport at a time, quickly enough to keep up
  with matches on the day (including from a phone).
- Pool matches are created by themselves once pools are set. Finals and 3rd-place matches fill
  themselves from the semis.
- Each sport ends with a full list of places, and points per place feed an overall leaderboard.
- Attendees see, per sport, the matches, the standings and the brackets, plus the overall
  leaderboard, Reclub-style.
- Another event can run a different shape: a different pool size, or a format where the admin
  adds matches and places by hand.

## Non-goals (this layer)

- The format builder: arbitrary brackets, pointers from pool places into semis ("1st in Pool A"),
  more than one stage beyond pools. That is layer 3. Here the admin picks semi teams by hand.
- Courts, times of day, a schedule. Matches have no time ("No schedule" as on Reclub).
- Live push or a big-screen view (layer 4). Pages show the latest results when loaded.
- Results entered by referees, captains or attendees. Admins only.
- Sets, games within a match, or player-level stats (who scored).
- Head-to-head as a tie-break. The user's order is wins, point difference, points scored.
- WhatsApp or any message when a result is saved.

## Anti-goals

- Anything hard-coded to ecphub's 12 groups, 4 pools, five sports or points table.
- A match shape that layer 3 has to migrate. A match slot is either a fixed group or a pointer
  to another match's winner or loser (D651's direction). Layer 3 adds more pointer kinds.
- Results stored twice. Standings, places and totals are worked out from match results on every
  load, as Project Active's standings are (D375), so a corrected score fixes everything after it.
- Testing on ecphub. Build and check on ecpkom or another test event only.

## Decisions

**D653 — Each sport gets a results type and a format.** Two new settings on each sport, on the
Sports tab (Add / Edit sport):
- **Results:** `Score — higher wins` (default) or `Time — faster wins`.
- **Format:** `Pools, then placing brackets` (default) with a **pool size** (default 3, from 2 to
  8), or `Matches I add by hand` (D665).

These can be changed only while the sport has no matches. Afterwards the controls are disabled
with the line `Reset this sport's matches to change its format.`

**D654 — Points per place, one table per tournament.** In the tournament's Setup tab:
**Points per place**, entered as a list, 1st first (`40, 35, 30, 29, 28, 27, 26, 25, 24, 23,
22, 20`). Places past the end of the list earn 0. While it's empty, there is no overall
leaderboard: the Overall view and the admin Leaderboard tab are hidden, and each sport still
shows its places. A sport has no weighting. Every sport uses this one table.

**D655 — Pools.** On the Matches tab, for a sport with no pools yet:
- **Draw at random** splits the event's groups into pools of the sport's pool size, named
  Pool A, B, C…, at random, independently for each sport.
- **Edit pools** lets the admin place each group in a pool by hand, or move one after a draw.
- **Who plays (my call, added while planning: ecphub has a 13th group, `Sean`, with one
  member).** Draw at random opens a list of the event's groups to tick. A group is ticked by
  default when any of its members is in a squad of this tournament. A group left unticked is out
  of this sport's results: it isn't in a pool, it isn't a forfeit, and it has no place. The
  overall table lists only groups that play in at least one sport. Edit pools can leave a group
  out the same way.
- The number of groups playing must be a multiple of the pool size. If it isn't, the format can't run,
  and the tab says `12 groups don't split into pools of 5. Change the pool size, or switch this
  sport to Matches I add by hand.` My call: uneven pools would leave a bracket short of teams,
  which this layer doesn't handle.
- Once pools are saved, the pool matches are created: every pair in the pool plays once (score
  sports), or the whole pool is one heat (time sports).
- Pools can be redrawn or edited only until the sport's first result is saved. After that,
  **Reset this sport's matches** (⋯ menu, with a confirm `Clear every Futsal result and its
  pools?`) is the only way back. My call: it's simpler than moving a group while keeping the
  results that don't involve it.
- A group added to the event after the draw isn't in any pool. The admin resets the sport to
  include it.

**D656 — Placing brackets.** With pools of size *k* and *p* pools, there are *k* brackets, one per
pool place. Bracket 1 decides places 1…p, bracket 2 places p+1…2p, and so on. The first three are
named **Gold**, **Silver**, **Bronze**, and any further ones **4th placing**, **5th placing**…
- Score sports need p = 2 (one final) or p = 4 (two semis, a final, a 3rd-place match). Any other
  count shows `Placing brackets need 2 or 4 pools. Use Matches I add by hand for this sport.`
  My call, for this layer only.
- Time sports: each bracket is one final race of p squads, so any p works.
- The bracket's matches are created with the pools, with empty slots, so the bracket shows its
  shape from the start.

**D657 — Who plays in the brackets.** The admin picks:
- each **semi**'s two groups (score sports, p = 4), or
- the p squads of each **final race** (time sports), or
- the final's two groups when p = 2.

The picker lists every group in the sport. Groups at the matching pool place come first, each
shown with its place (`Team 4 · A1`), and a group already picked in another slot of this sport is
greyed out (`already in Gold Semi 1`). The picker is open even before the pools finish, so an
admin who knows the outcome can go ahead. The **final** takes the two semi winners and the
**3rd-place match** the two semi losers, by themselves (D651's pointer slot, kind winner/loser).

**D658 — Entering a result.** On the Matches tab, each match is a row:
- **Score sports:** two number boxes (whole numbers 0–999) and **Save**. Saving both scores marks
  the match played.
- **Level score:** allowed in a pool match, where it is a **draw**. In a bracket match a level
  score also needs **Went through:** with one of the two groups picked, for penalties or extra
  time. My call: the score stays as played.
- **Time sports:** one time box per squad in the race, `m:ss.hh` (for example `1:52.30`), or
  **DNF**. The race is played when every squad in it has a time, a DNF or a forfeit (D660).
- The row's ⋯ menu has **Clear result** and **Walkover to …** (a no-show on the day: the other
  group wins, with no points either way, and the match counts as played).
- Two admins saving the same match: the last save wins. My call.
- A result can be changed at any time. If changing a semi changes who wins it after the final or
  3rd-place match it feeds already has a result, the save is refused with `Clear the Gold final's
  result first: its teams would change.`

**D659 — Pool standings.** Worked out from played pool matches.
- **Score sports:** columns P(layed), W, D, L, Diff, For. Ranked by wins, then point difference,
  then points scored. A draw counts as neither a win nor a loss. A walkover counts as a win and a
  loss, with no points for or against. Groups still level after all three are shown with the same
  rank (`1=`). The admin settles it by who they pick for the semis.
- **Time sports:** each heat's squads by time, fastest first. A DNF comes after every finisher,
  and a forfeit after that. Columns: Time, Place.
- Forfeiting groups (D660) rank below everyone else in their pool.

**D660 — Forfeit.** Under layer 1 a squad below its minimum at the deadline is **Forfeit** (D646).
For results:
- Each group whose squad is Forfeit is marked **forfeit** in that sport once, at the later of
  the squad deadline and the pool draw. Pools may be drawn before the deadline (to show the draw),
  when no squad is Forfeit yet. So the sport records `forfeits_marked_at`, and the marking runs on
  the first admin load of the Matches tab or result save after the deadline, whichever comes
  first. My call: this needs no scheduled job. The flag is stored, not worked out on each load,
  so a later cancellation doesn't wipe out points already won.
- Before the marking, the Pools card warns `2 squads are short. They'll be marked forfeit when
  squads lock.`, naming them. The admin can **Mark forfeit** or **Lift forfeit** for a group in a
  sport (⋯ on its pool row) at any time, before or after.
- Every match a forfeiting group is in is a walkover to its opponent (no points either way), shown
  `Walkover · Team 12 forfeits`. It needs no result entered. Two forfeiting groups in one match
  give no winner, and both take a loss.
- In a race, a forfeiting squad has no time and finishes last.
- The forfeiting group still goes through its pool and a bracket like everyone else (the admin
  picks it into a semi as usual), so every other group's place stays meaningful.
- **Its points for that sport are 0.** The place it ends in awards its points to nobody: if it
  ends 12th, no one gets the 20.
- A no-show on the day for one match (D658's Walkover) is not a forfeit and doesn't zero the sport.

**D661 — Places.** Each sport's places come from its brackets:
- **Score sports, p = 4:** final winner 1st, loser 2nd, 3rd-place winner 3rd, loser 4th, then the
  same for the next bracket from place p+1. **p = 2:** final winner and loser.
- **Time sports:** the final race's order. Equal times share the place (both get its points, and
  the next place is skipped). DNF and forfeit come last.
- Two forfeiting groups meeting in a final or 3rd-place match share the lower two places. Both
  score 0 anyway.
- A group's place counts as soon as the match deciding it is played. So halfway through a sport,
  the Gold final's two groups may have places while the rest don't.

**D662 — Overall leaderboard.** Each group's total is the sum of its place points across sports.
A sport where the group has no place yet adds nothing and shows `–`. A forfeit shows `0 F`.
Ranked by total. Ties go to whoever has more 1st places, then more 2nd places, and so on, and are
otherwise shared (`2=`). My call: an overall winner shouldn't be a coin toss, and this needs no
extra input.

**Amended 20 Oct 2026 (the user's call).** D711: equal totals share the place, with no count-back
on 1st places: three groups on 48 are all `9=`. D712: the podium gives every group in the top three
places its own step, best in the middle (two level 1sts get a gold step each), and a place a tie
skips has no step. D713: a save
on the admin tournament tabs keeps the page where it was instead of scrolling to the top.

**Reveal switch (the user's decision).** The admin Leaderboard tab has a switch, **Show the
overall leaderboard to attendees**, on by default. Off, the portal hides the Overall chip and
the card's `3rd overall` line, so the week's winner can be revealed at a closing ceremony. Match
results, standings, brackets and each sport's places stay live either way. My call: hiding them
too would leave attendees with nothing to follow during the week. Someone keen could still add up
the per-sport places, and that's accepted. Admins always see the leaderboard.

**D663 — Attendee view (portal).** The tournament's existing portal page (D644, D645) gets two
rows of tabs:
- Along the top, **Overall** (when D654's table is set) and one chip per sport, in the admin's
  order.
- Under a sport: **Matches · Standings · Playoffs · Squads**.
  - **Matches** is Reclub's List. Filters: All / Your matches / Remaining / Completed. Matches are
    grouped by pool, then by bracket and round. Each card shows the two groups (or the race's
    squads) with scores or times, a tick when played, the winner in bold, and `Draw`,
    `Walkover · … forfeits` or `Went through on penalties`-style notes in small type. The
    viewer's own group's matches are tinted. An unfilled bracket slot reads `To be picked`, and
    a pointer slot reads `Winner Gold Semi 1`.
  - **Standings** shows one table per pool (D659), with the viewer's group highlighted.
  - **Playoffs** shows each bracket as a small bracket drawing (semis → final, with the 3rd-place
    match under it). Each one is labelled with the places it decides (`Gold · places 1–4`).
    Under it is the sport's places list, once any exist, with points.
  - **Squads** is the layer 1 page for that sport, as it is today.
- **Overall** shows a podium for the top three (Project Active's look) and a table: rank, group,
  one column of points per sport (short sport names), and the total. The viewer's group is
  highlighted, with a points-table line under it.
- The page opens on the viewer's sport's **Squads** before the squad deadline, and on **Overall**
  (or the first sport, without a points table) from the deadline on.
- Who sees it: as layer 1, attendees in a group, in the tournament's categories, while it's open.
  A closed tournament stays hidden, as D641 has it. Results show as soon as an admin saves them.
  Only the Overall view can be held back (D662's reveal switch).
- The Activities-tab card's status line after the deadline changes from `Squads locked` to
  `Results` once any result exists: `Your group: 3rd overall · 104 pts`, or without a points
  table, `Results are in`. My call.

**D664 — Admin page.** The tournament's admin page (D648) gains two tabs after Sports:
- **Matches**: the same one-sport strip as Squads. Each sport is labelled with what's left
  (`Futsal · 18 left`, `Pickleball · done`). For the chosen sport, in order:
  - **Pools**: the pool cards, Draw at random / Edit pools, forfeit tags, and ⋯ Mark / Lift
    forfeit.
  - **Pool matches**: a table with Pool, Match, the score or time inputs, the state, and ⋯,
    with `6 of 12 played` in its header.
  - **Playoffs**: per bracket, its matches with pickers (D657) and inputs.
  - **Places**: 1st to last, the group, and points (`0 · Forfeit`).
  Rows must stay usable at phone width: inputs wrap under the match name.
- **Leaderboard**: the reveal switch (D662), then the same overall table attendees see, without
  the podium. Hidden without a points table.
- Header: **Export results** beside Export squads (D666).
- The Squads tab and its rules don't change.

**D665 — Matches I add by hand.** For any other shape before layer 3:
- **Add match**: a round name (free text, such as `Round 1` or `Quarter-final 2`), then two groups
  (score sports) or two or more squads (time sports). Results are entered as in D658.
- No pools, standings or brackets are worked out. The Standings and Playoffs tabs are hidden on
  the portal, and Matches groups by round name in the order the rounds were first used.
- **Places**: the admin sets each group's place by hand (a number per group, ties allowed) on the
  Places card. Points follow D654, and forfeits D660 (the admin marks them on the Places card).

**D666 — Export results.** `export/results.xlsx?activity=<id>`, next to the squads export, named
`<slug>-<tournament-name>-results.xlsx`. Three sheets:
- **Matches**: Sport, Stage (`Pool A`, `Gold Semi 1`, round name), Team 1, Score 1, Team 2,
  Score 2 (time sports: one row per squad with Time and Place), Result note (Draw, Walkover,
  Went through, Forfeit).
- **Places**: Sport, Place, Group, Points.
- **Leaderboard**: Rank, Group, one column per sport, Total (when D654's table is set).

**D667 — Words.** "Match" for a score contest and "race" or "heat" for a time one, but "Matches"
is the tab for both. "Pool", not "group", for A–D, because groups are the teams. "Places", not
"rankings", for a sport's final order. "Overall" for the week's leaderboard. "Walkover", "Forfeit"
and "Draw" as above.

**D668 — Who can change results.** Admins only, through server actions. No portal writes. As
with layer 1, the event committee logins (D550) may do what they may do on other activities'
admin pages. The builder follows that existing rule, with nothing new.

**D669 — Data.** Migration (next free number, expected 0098):
- `activities.place_points int[]` (D654), null for other kinds and for "no table", and
  `activities.show_overall boolean` (D662's reveal switch, default true).
- `tournament_sports` gains `result_kind text` (`score` | `time`, default `score`), `format text`
  (`pools` | `manual`, default `pools`), `pool_size int` (default 3, 2–8) and
  `forfeits_marked_at timestamptz` (D660).
- `tournament_pool_groups`: sport_id → tournament_sports (cascade), group_id → event_groups
  (cascade), pool int (0 = A), forfeit boolean, manual_place int null (D665). Primary key
  (sport_id, group_id). A group with a row is "in this sport's results". For manual format, rows
  are created for every group with pool 0.
- `tournament_matches`: id, sport_id (cascade), stage text (`pool` | `bracket` | `manual`), pool
  int null, bracket int null (0 = Gold), round text (`semi` | `final` | `third` | `race` | the
  manual round name), position int, walkover_to group id null, went_through group id null,
  played boolean, created_at.
- `tournament_match_slots`: match_id (cascade), slot int, group_id → event_groups (null while
  empty), source_match_id → tournament_matches null and source_outcome (`winner` | `loser`) null
  (D651 pointer), score int null, time_ms int null, dnf boolean. Primary key (match_id, slot). A
  slot is either fixed (group_id) or a pointer (source_*), never both. Pointer slots are resolved
  when read, never copied, so a corrected semi moves the final's team by itself.
- RLS on, with no anon or authenticated policies, as the other tournament tables. New functions,
  if any, pin `search_path = ''`.
- Group deletion cascades its pool rows and empties its slots. My call: the admin resets that
  sport, which is no worse than layer 1's cascade.

**D670 — Pure core.** One pure module (`src/features/tournaments/lib/results.ts` or split as the
builder likes) holds every rule, so admin, portal and export say the same thing:
round-robin pairing, resolving pointer slots, a match's winner / loser / draw / walkover, pool
standings (D659), places (D661, D665), points with forfeits (D660), and the overall table (D662).
The database only stores pools, matches, slots and the flags above.

**D671 — Timing order.** The build is ordered so the admin side is usable first: the sport
settings, pools, entering results, places and the leaderboard on the admin page. Then the
portal tabs. Then the export. If time runs short before ecphub's first match, the admin side ships
alone and the portal follows. My call.

**D672 — Not in scope.** See Non-goals. Also no undo history of results, no audit of who entered
what (beyond `updated_at` if the builder wants it), no per-sport points tables, and no medals
count view.

## Calls made for the user to check

Calls made by the designer, not the user. Each is marked "My call" where it appears:
- uneven pools and pool counts other than 2 or 4 (score sports) aren't supported this layer
  (D655, D656). They go to Matches I add by hand.
- the admin ticks which groups play in a sport before the draw, so ecphub's one-person `Sean`
  group can sit out (D655).
- on the portal, the page stays the layer 1 squads page until squads lock or a sport has pools.
  After that, the Squads tab under a sport shows that sport's squad only.
- pools are locked once a sport has a result; Reset is the way back (D655).
- a level bracket match keeps its score and records who went through (D658).
- forfeits are marked at the later of the deadline and the draw, by the first admin action after
  it (D660).
- overall ties are broken by count of 1st places, then 2nds… (D662).
- the reveal switch hides only the Overall view, not match results (D662).
- the card's status line after results begin (D663).
- admin side first, portal second, export last (D671).

## Testing

- **Pure (vitest):** round-robin pairs for pools of 2–5; standings with wins / diff / for, draws,
  walkovers and a three-way tie; time heats with a DNF and a forfeit; pointer resolution and a
  corrected semi moving the final's team; places for p = 2 and p = 4 and time finals with a shared
  time; forfeit zeroing points and leaving the place's points unawarded; overall ties broken by
  1st places; manual-format places.
- **Database script** (`check:results`, test event only): creating pools makes the right matches
  and empty bracket slots; forfeit is stamped at pool creation; Reset clears matches and pools;
  format changes are refused while matches exist.
- **Browser on ecpkom (never ecphub):** set the points table; create a score sport and a time
  sport; draw pools; enter pool results including a draw and a walkover; pick semis; level semi
  with Went through; the final fills itself; places and the leaderboard; a forfeiting squad; the
  portal's four tabs and Overall as a captain and as a member, at phone width; export.
  ecpkom's group count may not split into pools of 3. Use a pool size that fits, or add test
  groups and remove them afterwards.

## Timing

ecphub's sports start the week of 19 Oct. The user will set ecphub's sports up themselves once
it ships. D671 sets the order to build in.

## Amendment, 18 Oct 2026: the Rally Cup EDM (D673, D674)

The ECP Rally Cup EDM set two rules the first build didn't have. The user picked both.

- **D673 Swimming is best of 2 times.** A time sport in pools has no placing races. Each pool
  races once per heat (`HEATS`: heat 1, heat 2) with the same groups, labelled "Heat 2 · Pool A".
  Every group's best time ranks it across all pools: a DNF in every swim comes after all
  finishers, a forfeit last, and equal bests share a place. Places and points settle once every
  heat has its times. Any whole number of pools works. The portal's time sport shows Matches and
  Standings, with one table of each heat's time and the best, and no Playoffs. ecphub's
  already-drawn swim pools were kept and given their second heat.
- **D674 Full participation bonus.** `activities.participation_bonus` (migration 0099), set in
  Setup, blank for none. A group earns it once every registered member the tournament is for
  (its categories) has a counted place in at least one sport, so it is live from squads. It adds
  to the overall total and shows as a Bonus column on the leaderboard, in the portal and in the
  export. It is not a tie-break. ecphub: 100.

The EDM's limit of 2 sports per person is rule text only (the user's call). Squads stay free.
