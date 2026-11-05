# Tournament super teams — design

Date: 5 Nov 2026. Decisions D821–D834. Migration 0126 (next free number when built).

Builds on the tournament squads design (`2026-10-16-tournament-squads-design.md`, D637–D652)
and the results design (`2026-10-16-tournament-results-design.md`, D653–D674, D711–D713).

## Why

ecphub runs a second Rally Cup the week of 10–13 Nov 2026 (source: the committee's deck,
`Downloads\ECP_Rally_Cup_2026_Captains_Briefing_UPDATED.pptx`). The twist is that the 12
original teams (attendee groups) play as **6 super teams**: two teams paired for the week.
On court they are one side. On the leaderboard they stay two teams, and both get the super
team's placement points.

Today a tournament side is always exactly one attendee group: squads, pools, matches, places
and the leaderboard all key on the group. So the app can't run this yet.

Moving people into 6 temporary groups is not an option. The same groups run Project Mileage ×
Active (tracks, team scores, bonuses) until 4 Dec, and My group, captain tags and every other
group feature would change for the week.

## The week, from the deck

| Date | Sport | Venue | Players + subs |
|---|---|---|---|
| Tue 10 Nov, 6–9 PM | Captain Ball | X Park PJ South, 1 court | 5 + 1 |
| Wed 11 Nov, 6–8 PM | Volleyball | The Sports Barn, 1 court | 6 + 2 |
| Thu 12 Nov, 6–8 PM | Dodgeball | The Sports Barn, 2 courts | 6 + 2 |
| Fri 13 Nov, 6–8 PM | Bowling | Wangsa Bowl, 6 lanes | 4 |

- Captain Ball, Volleyball and Dodgeball: 2 groups of 3 super teams, round robin, then Gold /
  Silver / Bronze placement matches (A1 v B1, A2 v B2, A3 v B3): 9 matches, places 1st–6th.
- Bowling: each super team bowls 4 games and the highest total wins, giving places 1st–6th.
- Placement points: 40, 35, 30, 28, 26, 24. Both original teams in a super team get the same
  points.
- +100 participation bonus per original team: every core member of that team plays at least
  one sport during the week.
- Max 2 sports per person.

## Goals

- An admin sets up one Tournament activity, turns on super teams, and keys in the pairs.
- Captains of either team in a pair fill the super team's squads together, picking players from
  both teams, on the existing captain page.
- The draw, matches, standings and brackets run on 6 super teams.
- The leaderboard lists the 12 original teams. Each one gets its super team's place points per
  sport plus its own bonus.
- Ready for captains to fill squads before the first sport (Tue 10 Nov), and for results to be
  keyed on the night.

## Non-goals

- Pairings that change per sport or per day. The user confirmed a pair holds all week.
- Super teams of more or fewer than two teams.
- Any change to attendees' real groups, or to any feature outside this tournament.
- Enforcing the 2-sports limit. As with the Rally Cup, it is rule text only (the user's call,
  18 Oct).
- Bowling game-by-game scoring in the app.
- WhatsApp or other messages.

## Anti-goals

- Anything that changes how an existing tournament behaves. The Rally Cup (19–23 Oct) must
  render exactly as it does now, and new tournaments keep one team per side unless super
  teams are switched on.
- Project Mileage × Active, My group or All groups showing any trace of the pairing.
- Testing on ecphub. Build and check on ecpkom or a test event only (see the ecphub-is-real
  rule). Writes to ecphub need the user's yes.

## Decisions

**D821 — A per-tournament switch: Super teams.** In the tournament's Setup, the switch
**Teams play as super teams of two** (off by default). Off, nothing in this document applies.
On, the tournament's sides are super teams. *(My call: the switch can only change while no
sport has pools or matches, the same lock D653 uses for format.)*

**D822 — Pairs are keyed in by an admin.** *(The user's decision: "we will do our pick
ourself, admin can key in".)* With the switch on, the admin page shows a **Super teams** list:
add a super team by picking two of the event's groups, with an optional name. An unnamed super
team shows as `Team 02 + Team 03` (the two group names, in group order). Each group is in at
most one super team. A pair can be edited or removed (⋯ menu, admin style).

**D823 — Pairs hold all week.** *(The user's decision.)* One set of pairs per tournament, used
by every sport. *(My call: a pair can't be edited or removed once any sport has pools or
matches. The tab says why, and Reset this sport's matches is the way back, as in D655.)*

**D824 — Groups with no pair sit out.** *(My call.)* A group in no super team is not in the
tournament: no squad page for its members, not in the draw, not on the leaderboard. On ecphub
that is "Sean" (1 member), who also sat out the Rally Cup.

**D825 — One squad per super team per sport.** Squad size (min–max) is the sport's, as now:
Captain Ball 5–6, Volleyball 6–8, Dodgeball 6–8, Bowling 4–4. The squad may mix members of
both teams in any split. *(The user's decision.)* Each squad row keeps its player's own group,
so the D643 rule holds unchanged: a row counts while its attendee is not cancelled and still in
that group. A player who moves to a group outside the pair drops out of the squad.

**D826 — Either captain edits.** *(The user's decision.)* A captain or co-captain of either
team (the tournament's ticked fields, D640) adds and removes players in all of the super team's
squads, from both teams' members. The two captains see each other's picks. Last save wins, with
no approval step. *(My call.)* A player moved between the two paired teams stays in the
squad. Editing or removing a pair before any draw asks for a confirm first, and existing rows
follow each player's own group, so a squad may show **Over** until it's fixed. *(My calls.)*
The database check (D642) widens from "the actor's group" to "a
group in the actor's super team". Under **Members join themselves**, a member joins their super
team's squad.

**D827 — Captain's page.** Same page as D644, with:
- heading: tournament name and the super team name, then a line naming both teams
  (`You and Team 03 pick your super team's squads together. They lock …`);
- the member picker lists both teams' members, each name tagged with its team;
- the "not in any sport yet" notice is **split by team**, because the +100 bonus is per team
  (`Team 02: 2 members aren't in any sport yet: … · Team 03: all in ✓`). *(My call.)*

The member's read-only page (D645) names the super team and both captains. *(My call.)*

**D828 — One squad deadline for the whole week.** *(The user's decision.)* The tournament's
existing `squads_close_at` (D641), no per-sport deadlines. After it, only admins change squads.

**D829 — Forfeit is per super team.** A super team's squad below its minimum at the deadline is
Forfeit (D646, D660). Both teams score 0 for that sport.

**D830 — Draw and results run on super teams.** Pools, matches, standings, brackets, places,
walkovers and the export's match sheets treat each super team as one side, shown by its name.
With 6 super teams and pool size 3: 2 pools, Gold / Silver / Bronze brackets with one final each
(p = 2, D656), 9 matches. The Draw dialog (D655) lists super teams, not groups.
Pool tie-breaks stay as D659: no head-to-head test. The deck lists head-to-head after score
difference and points scored, but in pools of 3 a tie that survives those is rare, and the admin
picks each bracket's sides by hand (D657), so the committee settles it there. Changing the shared
standings would also change the Rally Cup's. *(My call.)*

**D831 — Bowling is "Matches I add by hand" with places keyed in.** *(My call.)* The existing
D665 format: the admin reads the 4-game totals off the bowling sheet and sets each super team's
place 1st–6th on the Places card. No match rows are needed. If the builder finds it simpler to
enter totals as one score per super team and rank them, that is fine too.

**D832 — Leaderboard stays per original team.** *(From the deck: "Both original teams in a
super team receive the same placement points.")*
- 12 rows, one per paired group. Each sport's points = its super team's place points.
- The +100 bonus (D674) is worked out **per group** as today: every member the tournament is for
  has a counted place in at least one sport. A place in the super team's squad counts for the
  player's own group. So partners can differ by 100.
- No "excused" mark. When the High Committee excuses a member (leave, special circumstances),
  the committee adds the team's +100 by hand as ad hoc points (D704–D707), which already show
  in the Bonus column. *(The user's decision, 5 Nov.)* "Core member" = every registered member
  of the group the tournament is for.
- Ties share the place (D711). Partners with equal totals share a place and a podium step
  (D712), which is expected.
- Each row shows its partner (`with Team 03`). *(My call.)*
- The reveal switch (hide the overall leaderboard) works as now.

**D833 — Exports.** The squads export gains a **Super team** column next to Team. The results
export names sides by super team. The leaderboard sheet stays per team, with a Partner
column. *(My call.)*

**D834 — Words.** "Super team" everywhere, matching the deck. Never "alliance" in the UI.

## Setup on ecphub (after the build, with the user's yes)

A new Tournament activity for 10–13 Nov: the 4 sports above with their squad sizes and
formats, points 40, 35, 30, 28, 26, 24, participation bonus 100, one squad deadline (the user
to give the date and time), and About text from the deck. The user's team keys in the 6 pairs.
*(My call: I create it only once the user says yes, as with the Rally Cup on 18 Oct.)*

## Timing

Today is Thu 5 Nov. The first sport is Tue 10 Nov.
1. Must land first: the switch, the pairs, squads and the captain page (D821–D828), so captains
   can fill squads over the weekend.
2. Before Tue 10 Nov, 6 PM: the draw and results on super teams, and the leaderboard (D829–D832).
3. Can follow: exports (D833).

## Left to the builder

- The data shape. One idea: a `tournament_super_teams` table (activity, name) plus members
  (super team, group). Pools and match slots can either point at a super team or keep using a
  stand-in group id (for example the first group in the pair) and map back. Pick whichever keeps
  existing tournaments untouched with the smallest change. Existing tournaments must not need
  their data moved.
- How the portal looks up an attendee's side (their group, then its super team if the switch is
  on).
- Test coverage: extend `npm run check:squads` / `check:results` with a paired case (mixed
  squad, either-captain edit, a forfeit, leaderboard credit to both teams, bonus per team).
