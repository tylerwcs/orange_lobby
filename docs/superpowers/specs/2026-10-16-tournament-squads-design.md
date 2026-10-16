# Tournament activity, layer 1: squads — design

Date: 16 Oct 2026. Decisions D637–D652. Migration 0097.

## Why

ecphub runs five sports next week (pickleball, badminton, swimming, futsal, basketball), each its
own tournament between the event's 12 attendee groups. Today each group decides among themselves
who plays, and the captain hands the final squad to the organisers by hand. The organisers then
build the draw, run the games and keep scores outside the app.

The user does not want a one-off for this event. The long-term aim is that a tournament runs
entirely inside ECP Hub: squads, draw and seeding, schedule, scoring, standings and live views.
That is too big for one week, so it ships in layers, each usable on its own:

1. **Squads** (this document) — every group's squad for every sport, filled by captains (or by
   members themselves), locked at a deadline, exported.
2. Results and leaderboard — admins enter match scores; standings update.
3. Format builder — groups and brackets, then courts and time slots.
4. Live views — attendees see their next match, the bracket and results; a big-screen view.

Layers 2–4 are not designed here. This layer must not get in their way (D651).

## Goals

- An admin sets up one Tournament activity holding several sports, each with a squad size.
- A captain fills all of their group's squads on one page, sees which are short, and is told who
  in the group isn't playing anything yet.
- Squads lock for captains at a deadline. Admins can still change them after.
- Admins see every group's squad for one sport at a time, with short ones flagged, and export
  every squad to one sheet.
- Works for other events too: self-enrol instead of captains, different sports and sizes.

## Non-goals (this layer)

- Matches, scores, standings, brackets, seeding, schedules, courts.
- What a forfeit does to results. This layer only labels a squad that will forfeit.
- WhatsApp or any message when someone is put in a squad. The portal is enough.
- Teams other than the event's attendee groups.
- Limits on how many sports one person plays, or clash checks.

## Anti-goals

- A tournament model tied to ecphub's five sports or 12 groups. Nothing is hard-coded to them.
- Squads stored in a shape that layer 2 has to migrate. Each sport is the unit later layers hang
  off (D651).
- Testing on ecphub. Build and check on ecpkom or another test event only.

## Decisions

**D637 — A fifth activity kind, `tournament`.** Labelled **Tournament** in the New activity menu
and on cards, with a trophy icon. Menu line: `Groups send squads to each sport`. Add-dialog title
`Add a tournament`, hint `Add its sports once it exists.` It goes through the kind checklist the
compiler enforces (`KIND_META`, tabs, row, cards, `findEntry`, entries, both page switches,
`KIND_SETTINGS`; see modular-features). Like polaroid, the engine lives in its own feature folder
`src/features/tournaments/` (`index.ts` server, `client.ts` browser). The activity-kind glue sits
in `src/features/activities/kinds/tournament/`.

**D638 — Sports.** A tournament holds an ordered list of sports. Each has a **name** (required,
unique within the tournament, case-insensitive) and a squad size, given as **min** and **max**.
They are entered as one number by default ("Squad size: 2") with an optional "Allow subs" range,
for example 5–7. min ≥ 1, max ≥ min, max ≤ 30 (builder's ceiling). Admins add, rename, reorder,
resize and delete sports.
- Resizing never removes anyone. A squad above the new max shows as **Over** (D646).
- Deleting a sport that has squad members needs a confirm (`Delete Futsal and its 12 squads?`).
  It deletes those squad rows.

**D639 — Teams are the event's attendee groups, all of them, in every sport.** No sign-up per
group and no sitting out. Groups are listed in the existing group order (`listGroups`, by name).
A group added later is in every sport with an empty squad. A group deleted takes its squad rows
with it.

**D640 — Who fills squads: a setting per tournament.**
- **Captains pick** (default). The members holding a Yes in any ticked field fill their group's
  squads. This is the same ticked-fields setting submissions use for "send for the group"
  (`proxy_fields`, D392), so ecphub ticks Captain and Vice Captain. Ordinary members see squads
  read-only.
- **Members join themselves.** Any group member may join or leave a sport's squad while there is
  room. Members with a ticked field may also remove anyone in their group's squads and add
  members, as in Captains pick.

If no fields are ticked under Captains pick, nobody on the portal can fill squads, and the admin
setup shows a warning: `Nobody can pick squads yet. Tick at least one field, or let members
join themselves.`

**D641 — Squad deadline.** `squads_close_at`, a date and time in Malaysia time (`MY_TZ`), stored as
the instant. It is required to create a tournament and can be changed any time. Before it,
portal changes are allowed as D640 says. From it on, the portal is read-only for everyone, and
only admins change squads. No timer is needed: every write compares with the server's `now()`.
The Open switch, the scheduled opening (D600–D612) and categories work as for every kind. A
closed tournament is hidden from attendees as other closed activities are.

**D642 — Squad rules, held by the database.** One write path, a function
(`set_squad_member` or similar), checks in one transaction with the squad locked:
- the attendee is in this event, not cancelled, and in the group they are being added for;
- the sport belongs to this tournament;
- the squad is below max (the admin path may go over; the portal path may not);
- the portal path is before the deadline, and the actor may act (D640);
- one person appears at most once per sport. They can be in any number of sports.

This stops a captain and vice, or two self-enrolling members, from filling the same last place.
The refusals are flashed in plain words: `Badminton is full.`, `Squads are locked. Ask the
organisers to make changes.`, `Only your captain can change squads.`

**D643 — Who is in a squad, when people change.** A squad row records sport, group and attendee.
A row only counts while its attendee is **not cancelled and still in that group**. Rows that
don't count are left in the table but ignored everywhere: counts, lists, export, the "also in"
hints. So a cancelled attendee drops out by themselves and their squad goes short again.
- Adding someone to a sport where they have a row that doesn't count, from an old group,
  replaces that row. The key stays (sport_id, attendee_id). My call: undoing a mistaken group
  move doesn't restore them; the person is just added again.
- If an un-cancel or a move back pushes a squad above max, nothing is refused. The squad shows
  **Over · 1 too many**, everywhere including the captain's page. The captain may remove people
  but not add, until it's back within max.

**Categories (my call).** The tournament's categories, if any, limit who can be in a squad. Only
group members in those categories are listed in pickers, counted in the "not in any sport"
notice, and accepted by D642. Someone outside them doesn't see the tournament, even if they're
a captain. With no categories set, as on ecphub, everyone in a group takes part.

**D644 — Captain's page (portal).** One page for the whole tournament:
- Heading with the tournament name and the group name, then
  `You pick your group's squads. They lock Fri 24 Oct, 6:00 pm.`
- If any group member is in no sport, a notice at the top:
  `3 members aren't in any sport yet: Farah Iskandar, Joel Tan, Nurul Huda.` The names list
  every such member. After 10 names it reads `… and 4 more`.
- One card per sport, in the admin's order: name, the count `1 of 2` (or `2 of 2 ✓`; with subs
  `5 of 5–7 ✓`), the squad's names each with a remove ✕, and **Pick a member** while there is
  room.
- **Pick a member** opens a searchable list of the group's members. Each name shows
  `also in Futsal, Basketball` when relevant. Members already in this squad are greyed with
  `already in this squad`.
- After the deadline: the same page with no ✕, no picker, and
  `Squads are locked. Ask the organisers for changes.`

**D645 — Member's page (portal).** Same page, read-only:
- `You're playing Futsal and Basketball.` (or `You're not in any sport yet.`)
- `Your captain <name> picks the squads. They lock Fri 24 Oct, 6:00 pm.` The name is the
  first member holding the first ticked field, as on My group (D366). With no such member it
  reads `Your group's captain picks the squads.`
- Each sport with its squad's names, where the attendee's own name shows as **You**.
- Under Members join themselves: **Join** / **Leave** on each sport while open and not full.

**Self mode, my call.** The portal is one page with role flags, not two pages. Under Members join
themselves:
- a member with a ticked field gets the captain layout (D644): the notice, ✕ on everyone, and
  Pick a member;
- everyone else gets the member layout with Join/Leave, and the line `Join the sports you want
  to play. Squads lock Fri 24 Oct, 6:00 pm.` in place of the captain line;
- the cards use D647's captain line for the first group and the member line for the second.

Attendees with no group don't see the tournament at all, neither its card nor its page.

**D646 — Squad states.** One function names a squad's state for every screen:
- before the deadline: **Full** (count within min–max), **Short** (below min, `1 short`),
  **Over** (above max, admin only);
- from the deadline on: **Ready** (within min–max), **Forfeit** (below min, including empty),
  **Over**.

**D647 — Card on the Activities tab.** The usual card with the Tournament tag. Its status line:
- captain, before the deadline: `3 of 5 sports ready`, or `All squads ready ✓`;
- member: `You're playing 2 sports`, or `Not playing yet`;
- after the deadline: `Squads locked`.

Captains with short squads don't get the "To choose" emphasis or a dot. My call: keep it quiet in
this first version.

**D648 — Admin page.** It follows the approved admin style (capped and centred, header actions,
tabs, table-style lists with ⋯ menus, sticky save bar):
- **Header:** name, Open switch, Schedule, **Export squads**.
- **Squads tab** (first): a strip of sport tabs, each with its short or forfeit count
  (`Swimming · 2 short`). Under it, a table with one row per group: group name, the player names,
  the state (D646), and a ⋯ menu with **Add player**, **Swap player** and **Remove player**. The
  picker lists that group's members, with the same "also in" hints. Admins may go over max, and
  the row then shows **Over**. A line above the table: `12 groups · 9 ready · 3 short`.
- **Sports tab:** the table of sports (name, squad size, ⋯ rename / resize / move / delete) and
  **Add sport**.
- **Setup tab:** name, description, cover and the other shared detail fields as other kinds
  have them, plus **Squad deadline** and **Who fills squads** (D640, with the field ticks).

**D649 — Export squads.** `export/squads.xlsx?activity=<id>` (or under the existing exports
page, builder's call). One sheet, one row per counted squad member (D643): Sport, Group, Name,
then the event's chosen export columns (`exportColumns(..., ev.export_fields)`, as the other
exports use, which gives ecphub its Master No). Rows are sorted by sport order, then group, then
name. Short or empty squads get one row with the name blank and `Forfeit` (after the deadline)
or `Short` in a final State column, so a printed sheet shows them. The file is named
`<slug>-<tournament-name>-squads.xlsx`.

**D650 — Words.** "Squad" for a group's players in one sport, never "roster": the existing
`rosters.xlsx` export is breakout rooms. "Sport" in the UI. In code, `TournamentSport` (or
`Division`) is fine, since later layers may hold non-sport contests.

**D651 — Shape for later layers.** Each sport row is the unit layers 2–4 attach to: a sport will
own its format (groups and brackets), matches and standings. The direction, not committed here,
is that a match slot is either a fixed team or a pointer such as "1st in Group A" or "loser of
Gold Semi 1". Then one engine covers round-robin, knockout, groups into placement brackets
(ecphub's poster) and consolation, and a result fills the next match by itself. Nothing in this
layer may assume a sport has only squads.

**D652 — Not in scope.** See Non-goals. Also no per-sport deadlines (one per tournament), no
captain-facing export, no "interested" or hands-up list, and no group-level forfeit button: an
empty squad at the deadline is the forfeit.

## Data (migration 0097)

- `activities.kind` allows `tournament`.
- `activities` gains `squads_close_at timestamptz` and `squad_fill text` (`captains` | `self`),
  both null for other kinds. The tournament reuses `proxy_fields` (D640).
- `tournament_sports`: id, activity_id → activities (cascade), name, min_size, max_size,
  position, created_at. Unique (activity_id, lower(name)).
- `tournament_squad_members`: sport_id → tournament_sports (cascade), group_id → event_groups
  (cascade), attendee_id → attendees (cascade), added_by (attendee id or null for admin),
  added_at. Primary key (sport_id, attendee_id).
- RLS and grants follow the other activity tables. Portal writes go only through the D642
  function. New SQL functions pin `search_path = ''`, as 0087 does.

## Pieces (expected)

- `src/features/tournaments/` — db (sports, squads, the rpc wrapper), pure lib (squad state D646,
  "not in any sport", "also in", card status D647, export rows D649), admin screens (Squads, Sports
  tabs), portal body, actions.
- `src/features/activities/kinds/tournament/` — settings reader (`readSettings` for `tournament`),
  detail and body shells.
- `src/lib/types.ts` — `ActivityKind` gains `tournament`; then the compiler names the remaining
  checklist files.
- Export route for D649.

## Testing

- Pure: squad state across the deadline and min/max/subs; "not in any sport" ignoring cancelled
  and moved members; "also in"; card status lines; export row order and the blank Short/Forfeit
  rows.
- Database (script, test event only): two concurrent adds for the last place, so one wins and one
  gets "full"; portal add after the deadline refused, admin add allowed; non-captain refused under
  Captains pick; self-join and leave under Members join themselves; a cancelled member no longer
  counted.
- Browser on ecpkom (never ecphub), with its Team 1 captain and vice test data:
  - admin: create, add five sports with ecphub's sizes (Pickleball 2, Badminton 2, Swimming 4,
    Futsal 5, Basketball 3), plus one subs range such as 5–7, and set the deadline;
  - captain: fill squads, see the reminder and "also in";
  - member: the read-only view;
  - deadline passes: the captain is locked out, admin swaps a player, squads show Forfeit;
  - export.

## Timing

ecphub's sports are next week. This layer should be ready to set up on ecphub, by the user, a
few days before then, leaving time for captains to fill squads before the deadline.
