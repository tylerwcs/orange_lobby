# Project Mileage — scored challenge activity — design

Approved in chat on 2 Oct 2026. Project Mileage 2.0 (Ecopia Wellness 2026) is a 9-week team
walking and running challenge that runs in the live `ecphub` event, from Mon 5 Oct to Fri 4 Dec
2026. Staff walk, run or hike, record the workout on Strava, and log each workout in ECP Hub with a
screenshot as proof. ECP Hub turns those entries into points for the 12 existing groups (the teams).

This builds on form submissions (D161–D171), admin edit and revoke (D337–D342) and attendee groups
(D344–D361). Mileage is still an `activities` row with `kind = 'submission'`. Its entries are still
`activity_submissions` rows that go through `submit_answers`. What's new is a **scoring** setting
on a submission activity. Scoring turns on the tracker page, the points and the leaderboards. Any
future challenge (steps, water) is set up the same way, without code.

Source: the PROJECT MILEAGE 2.0 EDM (2 pages: rules plus FAQ).

## The rules being implemented (from the EDM)

- **Entries:** each workout must be at least 1 km. Only walking, running and hiking count. A day's
  eligible workouts add up. Each person submits their own entries by 23:59 Malaysian time, and
  nothing can be backdated.
- **Tier 1, daily effort:** a person's daily total earns 1 pt at 1.0 km, 2 pts at 3.0 km, 4 pts at
  5.0 km, 6 pts at 8.0 km and 8 pts at 10.0 km or more.
- **Tier 2, weekly team bonus:** +20 when every member of the team logs at least 1 km on every day
  of the week (Mon–Sun).
- **Tier 3, weekly podium:** the three teams with the highest collective km for the week get 20, 12
  and 6.
- **Team score:** the sum of all three tiers.
- **Fair play:** a cheater is disqualified and their team's score is voided.

## Context checked on 2 Oct 2026

- **`ecphub` event:** runs 28 Sep – 4 Dec 2026 and has 164 attendees.
  - 122 attendees are in 12 groups, "Group 01" to "Group 12". Ten groups have 10 members and
    Group 02 and Group 06 have 11.
  - The 42 attendees without a group are not taking part.
  - It already has two activities, "FITFRWD Progress Challenge" (a submission) and "InBody Scan"
    (a booking). Neither is affected.
- **Testing:** `ecphub` is live. Everything is built and tested on another event first.

## Decisions

### Phase 1 — live Mon 5 Oct

- **D368 — One entry per workout.** A morning 3 km and an evening 3 km are two entries, each with
  its own proof, and the day's total is their sum. The scored activity has no `per_day` and no
  `max_per_attendee`. People can't edit or delete their own entries. To fix a mistake, the
  committee revokes the entry (D337–D342) and the person submits it again.
- **D369 — A new "who submits" mode: each member, counted by team (`group_mode = 'members'`).**
  - Every member of a group submits their own entries. `submit_answers` stamps the submitter's
    current `group_id` on each entry, as the group modes already do.
  - An attendee with no group gets `nogroup` and sees "You're not in a team for this challenge."
  - There is no group target, and nothing is "done" for the group. The mode exists only to stamp
    the team and to require one.
  - Because the team is stamped on each entry, moving someone to another team later doesn't take
    their past km with them.
  - The Setup tab offers this as a fourth option beside the three in D350. D351 is unchanged for
    the existing group modes. `members` allows neither `per_day` nor a limit either, because
    scored activities have neither.
- **D370 — Number questions get optional `min`, `max` and `decimals`.**
  - These are set in the question editor.
  - The portal input enforces them: `inputmode="decimal"`, with a `step` taken from `decimals`.
  - The server enforces them too, in both `validateAnswers` and `submit_answers`. A blank answer is
    still only rejected when the question is required. A non-blank answer must be a plain decimal
    number inside the limits, with no more decimal places than allowed.
  - Messages read like "Distance must be at least 1.0 km". The question's unit comes from its
    label, so no unit field is added.
  - Number answers are still stored as strings (D161), and the stored string is normalised: "2.50"
    becomes "2.5".
- **D371 — The Mileage form has five questions.**

  | Key | Label | Type | Rules |
  |---|---|---|---|
  | `method` | How did you record it? | select: "Watch / phone GPS — synced to Strava", "Treadmill — logged manually on Strava" | required |
  | `km` | Distance (km) | number | required, min 1, max 50, decimals 2 |
  | `strava` | Strava activity screenshot | file | required |
  | `treadmill` | Treadmill screen photo (distance + time) | file | required, `show_when` method = Treadmill |
  | `timestamp` | Photo info screen showing the date and time | file | required, `show_when` method = Treadmill |

  - There is no activity-type question. The EDM limits workouts to walk, run and hike, and the
    committee checks that from the Strava screenshot.
  - The 50 km maximum is a typo guard.
  - A required question hidden by `show_when` must not count as missing. The plan confirms whether
    today's code already behaves this way.
- **D372 — A scoring setting on submission activities (`activities.scoring jsonb`, null means
  off).** Phase 1 needs three fields:
  - `metric_key`: the number question whose answers are summed, here `km`.
  - `daily_min`: the daily total that counts as "logged" for the week strip and streak, here 1.
  - `starts_on` and `ends_on`: the challenge dates, 2026-10-05 and 2026-12-04. They limit which
    days count and which weeks exist.

  Phase 2 adds the remaining fields (D376). Setting `scoring` is only allowed on a
  `kind = 'submission'` activity whose `metric_key` names a number question. Scoring is configured
  in a **Scoring** section of the Setup tab, in the approved admin style.
- **D373 — An entry's day is the Malaysian date it was submitted** (`submitted_on`, already stored).
  Submitting at 00:10 counts for the new day. That matches the EDM's "by 23:59, resets at 00:00",
  and there is no backdating. Entries submitted outside the challenge dates are refused with the
  existing `closed` code, so the form isn't open early by mistake.
- **D374 — Scored activities get a tracker page in the portal instead of the generic form page.**
  The design takes the purpose of the user's reference mock-up, not its pixels. It uses ECP Hub's
  own components. From top to bottom:
  1. **Day selector and week strip.**
     - "‹ Today ›" sits above Mon–Sun chips. Each chip shows one of these states:
       - **logged:** total ≥ `daily_min`, shown with a check
       - **today:** highlighted, with a flame once logged
       - **missed:** a past day below `daily_min`, faded ✕
       - **future:** grey
       - **outside the challenge:** not shown, so Week 10 shows Mon–Fri only
     - Tapping a chip shows that day. ‹ › move a week at a time within the challenge.
     - The week label is "Week N · 5–11 Oct" (D378).
  2. **Main card.**
     - A ring of the selected day's km, with marks at the points steps.
     - A headline such as "4.2 km today · 2 pts", and the next goal, e.g. "0.8 km more for 4 pts".
       At the top step it reads "Top score reached".
     - Two labels: a streak ("6 days in a row", consecutive days at or above `daily_min` ending
       today, or yesterday if today isn't logged yet) and "This week · 14 pts".
     - In Phase 1 the steps aren't configured yet. The ring then marks `daily_min` only and the
       points text is hidden.
  3. **The day's entries.**
     - A timeline of time, km, a watch or treadmill icon (from `method`), and a thumbnail of the
       Strava screenshot.
     - The ⋯ menu offers "View photos" only.
     - Revoked entries stay faded and say "Removed by the organiser".
     - Below the timeline, "Add a new entry ⊕" opens the form in a sheet. Submitting closes the
       sheet and refreshes the page.
  4. **My team** (Phase 2, D379).

  Activities without `scoring` keep today's page, so FITFRWD is unchanged.

### Phase 2 — by Sun 11 Oct

- **D375 — Points are computed from live entries, never stored.**
  - A SQL function returns one row per (attendee, team, day): the sum of `metric_key` over entries
    with `status = 'submitted'` inside the challenge dates. For this challenge that is at most about
    122 × 61 rows.
  - A pure TypeScript function `scoreChallenge(dailyTotals, members, disqualified, config, today)`
    does all the scoring and is unit-tested.
  - Revokes, edits and disqualifications show up on the next page load.
  - Week 1 scores correctly even though Phase 2 ships after it starts.
- **D376 — The rest of the scoring setting.**
  - `daily_steps`: [{at: 1, pts: 1}, {at: 3, pts: 2}, {at: 5, pts: 4}, {at: 8, pts: 6},
    {at: 10, pts: 8}].
  - `team_bonus`: 20.
  - `podium`: [20, 12, 6].
  - Any of the three can be left out to switch that tier off.
- **D377 — Scoring rules.**
  - **Tier 1:** each (attendee, day) total maps to the highest step at or below it. Steps compare
    exactly, so 9.99 km earns 6 pts. Tier 1 points count straight away.
  - **Tier 2:** a team earns `team_bonus` for a week when every **current** member of the team has
    a daily total ≥ `daily_min` on every challenge day of that week. Week 10 has five days (D378).
    It is only awarded after the week ends. During the week it shows as progress, e.g.
    "8 of 10 on track".
  - **Tier 3:** teams are ranked by the week's total km. The top places get the `podium` points
    with standard competition ranking: a tie for 1st gives both teams 20, and the next team is 3rd
    with 6. A team with 0 km gets nothing. It is only awarded after the week ends.
  - **Team total:** the sum of all tiers over every week so far.
  - **"Team" means:** for Tier 1 and Tier 3, the team stamped on the entry. For Tier 2, the
    attendees whose `group_id` is the team now.
- **D378 — Weeks run Mon–Sun, cut off at the challenge dates, and are numbered from the event's
  start.**
  - Week 1 is the Mon–Sun week that contains `events.starts_on`, which is 28 Sep. So the challenge
    weeks are labelled Week 2 to Week 10, matching the EDM.
  - The last week is 30 Nov – 4 Dec (Mon–Fri), because the challenge ends 4 Dec. Its team bonus and
    podium use those five days. (The user chose this over extending the event to 6 Dec.)
- **D379 — What attendees see.**
  - **The team table** lists rank, team name and **points only**. No team's km is shown, so the
    podium race stays a surprise. The viewer's team is highlighted.
  - **The "My team" section** on the tracker page shows:
    - the viewer's teammates with today's km and points, with members who haven't logged today
      listed first
    - Tier 2 progress for the current week
    - the team's own km for the week
- **D380 — Disqualification.**
  - A new table `challenge_disqualifications` (`activity_id`, `attendee_id`, `reason`, `by`, `at`)
    with one row per disqualified person.
  - Disqualify and Undo are committee actions.
  - A team with any disqualified member is **Void**: its total shows as "Void" and it sorts last
    everywhere. It is also left out of the Tier 3 ranking, so the other teams move up.
  - Attendees see "Void" with no reason.
  - The person's entries are kept for the audit trail.
- **D381 — The committee's Leaderboard tab on the scored activity.**
  - A week picker, and each team's km plus points for Tier 1, Tier 2 and Tier 3, and the total.
  - Opening a team shows a member × day grid of km, with Disqualify or Undo on each member.
  - The Excel export gains a Leaderboard sheet with the same breakdown for each week.
- **D382 — No WhatsApp reminders.** The user decided this. Teams nudge each other using the
  "hasn't logged today" list in My team.
- **D383 — Entries count straight away.** There is no approval queue (D177 stands). The committee
  audits photos in the existing submissions table, and acts through revoke (D337) and disqualify
  (D380).

## Out of scope

- A ranking of individual people.
- Strava API integration.
- Checking photos automatically for edits or timestamps.
- Attendees editing their own entries.
- Display of the leaderboard on the LED screen.
- Changing `eventDays()`'s 14-day cap. The tracker uses the challenge dates, not `eventDays()`.

## Testing

- **Unit tests:**
  - Number validation (D370): min, max, decimals, malformed input, normalisation.
  - `submit_answers` behaviour in `members` mode: no group, and the team stamped on the entry.
  - Hidden required questions don't count as missing.
  - `scoreChallenge`: step boundaries (0.99, 1.0, 9.99, 10), a short final week, one member
    missing one day, a podium tie, a revoked entry, a disqualified team leaving the podium, a
    member who moves team mid-challenge, and a week that hasn't ended (no Tier 2 or Tier 3 yet).
  - The week numbering.
- **Browser, on a test event (never `ecphub`):**
  - Phase 1: two workouts in a day, the treadmill photos appearing, 0.8 km refused, an attendee
    with no group blocked, and the week strip states.
  - Phase 2: both leaderboards with seeded entries, Disqualify and Undo, and the export sheet.
- **Go-live:** create the Mileage activity in `ecphub` with the D371 questions and the D372 dates.
  Then check the portal as one real team member, reading the page only and not submitting.
