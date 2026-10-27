# Mileage × Active — two tracks, one team score — design

Written 25 Oct 2026 from a chat with the user. Source: the committee's two-page poster
"Project Mileage x Active" (ECOPIA Wellness 2026). To cope with the haze, each team splits into
two tracks of 5 people. **Track A** collects kilometres and **Track B** collects active minutes.
Both tracks feed **one team score**.

This builds on the scored-challenge machinery (D372–D381), Project Active (D462–D470), the
captain fields (D392) and ad hoc points (D704–D707). It is the ecphub event, which is live
([[ecphub-event-is-real]]): build and test on another event, and write to ecphub only after the
user says yes in chat.

## The rules being implemented (from the poster)

- **Dates:** Mon 26 Oct – Fri 4 Dec 2026 (the user). These are 6 Mon–Sun weeks; the last one is
  Mon–Fri.
- **Teams:** each 10-person team divides into two equal tracks of 5.
  - **Track A, Project Mileage:** counts kilometres only, from Outdoor Walking/Running or an
    Indoor Treadmill. Proof is Strava or a photo of the machine.
  - **Track B, Project Active:** counts active minutes only, from Gym & Conditioning (HIIT,
    Strength, Circuit), Swimming, Cycling (Indoor/Outdoor), Dance, Court & Racquet Sports
    (Badminton, Tennis, Pickleball, Squash), Skipping, or Ergs (Row/Ski/Bike).
  - Mind-Body & Studio (Mobility, Yoga, Pilates) no longer counts.
  - Every Track B entry must show an **average heart rate of 100+ bpm** on the Strava or
    smartwatch summary.
- **Tier 1, daily points:** a person's daily total earns points, capped once a day. Several
  sessions in a day add up.
  - **Km:** 1.0–2.9 = 1 pt, 3.0–4.9 = 2, 5.0–7.9 = 3, 8.0–9.9 = 4, 10+ = 5.
  - **Minutes:** 20–29 = 1 pt, 30–44 = 2, 45–59 = 3, 60–119 = 4, 120+ = 5.
  - Nothing scores below 1.0 km or 20 minutes.
- **Tier 2, weekly milestone:** a team gets **+10** when all its members log at least 1 km or at
  least 20 minutes on every day, Monday to Sunday.
- **Tier 3, weekly podium, one per track:** at the end of each week, the 3 teams with the most
  total km get 15/10/5, and separately the 3 teams with the most total minutes get 15/10/5.
- **Deadline:** 23:59 every day. Nothing can be changed after 00:00. Entries that don't comply
  are revoked with no warning.

## What the user decided in chat (25 Oct)

- **Captains place people on tracks.** Captains and co-captains put members of their own team on
  a track, and can move them at any time.
- **Locked to a track.** Once someone has a track, they can submit only under that track.
- **Five is a target, not a limit.** The system shows how many are on each track, such as
  "6 of 5". It never stops a captain from going over, and the committee deals with it.
- **Moves keep the past.** When someone moves, the entries they already sent stay where they
  were. Their points stay with the old track, and the entries stay in their portal history.
- **Week 1 is not kept in the system.** The user exports Project Active's 12–18 Oct results
  before the change. The new format starts fresh on 26 Oct and ends 4 Dec.

## Context checked on 25 Oct 2026

- **Project Active 💪** (`e1704208-…`) has 902 entries, all from 12–18 Oct, and the last one came
  in at 08:19 on 19 Oct. It is closed and pinned, with `show_leaderboard` on.
  - Its scoring: `min`, steps 20/30/45/60 = 1–4, `daily_min` 20, bonus 10, podium 15/10/5,
    `week_origin: challenge`, `void: week`.
  - Its form branches on device (watch or phone only). It has the questions: device,
    watch_activity, other, phone_activity, minutes, strava, selfie, machine.
  - Its proxy fields are captain and vice captain. It has `group_mode = 'members'` and the
    category Wellness.
- **Project Mileage 🏃** (`3b89b3a2-…`, the Oct archive) has 445 entries from 5–9 Oct. Its form:
  method, km, strava, treadmill.
- **Teams:** 12 groups. Ten have 10 members, and Groups 02 and 06 have 11.
- **Captains:** captain authority exists only through each activity's `proxy_fields` (`isProxy`,
  plus the same test in SQL). There is no group-level captain.
- **Prior art for the captain page:** tournament squads (D637–D652). It has a per-sport card with
  a size pill, member chips with ✕, an "Add a member" dropdown and a "not in any squad yet"
  warning, and the DB decides who may change what.
- **Daily totals:** `challenge_daily_totals` already sums each person's metric per day, so the
  daily cap is how scoring already works.

## Decisions

### D721 — Two linked activities, not one activity with two metrics

- **Track B** is the existing Project Active, re-scoped for 26 Oct (see D729).
- **Track A** is a **new** submission activity, "Project Mileage", scored in km.
  - The October archive stays closed and untouched as the committee's record.
  - My call: rename the archive "Project Mileage (Oct archive)" so the admin list doesn't show
    two activities with the same name.
- The two activities are **linked**. Each one knows the other, so either page can find the pair,
  the tracks and the combined score.
  - How the link is stored is the builder's call, for example a field in `scoring` or a small
    pair row. There must be one source of truth for it, and it must say which activity is
    Track A and which is Track B.
  - Version 1 supports exactly two activities in the same event, both scored, scoring the same
    event groups.
- **Why:** each track keeps everything the single-challenge engine already does per activity:
  points steps, daily minimum, podium, week void, disqualification, the tracker ring and timeline,
  and same-day edit. Only the parts that span both tracks are new.

### D722 — A track is an assignment of an attendee to one of the two activities

- **What is stored:** one row per attendee per pair, holding the attendee, the activity (their
  track), their group, who assigned them (an attendee id, or null for an organiser) and when.
  - An attendee is on at most one track in a pair.
  - A move replaces the row. No history of moves is kept (non-goal).
- **No track** is a valid state. It's where everyone starts.
- **A team change doesn't carry the track.** An attendee who changes team keeps their row, but it
  only counts while its group matches their current group. Otherwise they read as having no
  track. My call: the new team's captain should decide.

### D723 — Who may assign

- **Captains:** anyone holding a Yes in the pair's captain fields (the same rule as `isProxy`).
  - My call: use the Track B activity's `proxy_fields`, or require both activities to tick the
    same fields. The builder picks one, and the admin form says which.
  - Captains act on **members of their own group only**, including themselves.
- **The committee:** organisers can assign and move anyone from admin.
- **When:** at any time while the activities are open. There's no deadline.
- **Where it's enforced:** the DB, as with squads (D642). An RPC checks that the actor is a
  captain in the same group as the target, and that the event and pair match.

### D724 — Tracks live inside My team (the user, 25 Oct; replaces a separate Tracks tab)

- **Where:** the existing **My team** dropdown at the foot of My stats (D387). The page keeps
  Project Active's layout: Info, My stats, Leaderboard. There is no new tab.
  - My team reads the same on both track pages.
- **Layout:** the team's members are grouped under "Track A · Mileage", "Track B · Active" and
  "No track yet".
  - **Count pill** on each group: "4 of 5", "5 of 5" or "6 of 5" — amber when under, green at the
    target, red when over. The target is a setting (5 for ecphub). "No track yet" shows its
    count in amber.
  - **Each person's row** shows the shown day on **their own** track, such as "5.2 km · 3 pts",
    "45 min · 3 pts" or "Not logged". The no-track row says "Can't submit yet".
    - So My team on a paired page reads the other activity's daily totals too.
    - A row follows the person's current track.
- **Summary line:** "{logged} of {members} logged today · A {n} · B {n}", where logged counts
  either track.
- **Captains** get a small A | B switch on every row, their own included. Tapping the other
  letter moves the person. Tapping their current letter takes them off their track. No extra
  confirmation.
- **Non-captains** see the same list with no switches.
- **Your own line:** above My team, a note: "You're on Track B — this is your track."
  - On the other track's page, it reads "You're on Track A — submit under Project Mileage",
    with a link, in place of the Add button (D725).
  - With no track, it reads "Your captain hasn't put you on a track yet."
- **The +10 line** in My team counts both tracks (D727). Until Phase 2 it is hidden, because the
  per-activity `team_bonus` is cleared.

### D725 — Submitting is locked to your track

- **On the page:** `canSubmit` gains two reasons, both placed right after the category check.
  - **notrack:** "Your captain hasn't put you on a track yet."
  - **othertrack:** "You're on Track B — submit under Project Active", with a link.
  - Both block the form, like `ineligible` does.
- **On the server:** the DB checks the same thing in `submit_answers` and its pair variant, and
  returns new codes for the two cases. These get messages in `SUBMIT_RESULT_MESSAGES`.
- **Captains submitting for someone:** the "Submitting for" list shows only members on **this**
  track.
- **Pair entries (D524):** the partner must also be on this track, or the entry is refused.
  `allow_pair` is off on ecphub anyway.
- **Same-day edit and delete of an entry already sent stay allowed after a move.** My call: it
  is the record they already made, and the window closes at midnight anyway.
- **Captains submitting for someone are checked on the person they submit for, not on
  themselves** (my call).
  - A captain on Track A can still submit for a Track B member from the Track B page, and a
    captain with no track can submit for anyone who has one.
  - So in `canAdd`, the two new reasons block only the captain's **own** entry, not the
    "Submitting for" dialog.
  - The DB check in `submit_answers` tests the attendee the entry is for.

### D726 — Moves don't move points

- Each entry scores on the activity it was sent to, as today. A person who is moved mid-week has
  km in one track and minutes in the other for that week, and both count for the team.
- **A disqualification is personal across the pair** (my call), so moving can't get round it.
  - A person disqualified on either track counts for nothing on **both** tracks from that week
    on. The combined scorer merges the two activities' disqualifications, earliest week winning,
    before applying D467's `counts`.
  - They are also off the bonus member list from that week.
  - **The team's whole week is voided: both tracks' points and the bonus** (the user, 25 Oct,
    replacing "its own track only"). It matches the eDM's "their team's points for that week
    are voided", for one team score.
- **Moving within a day removes that day's entries on the old track** (the user, 25 Oct, replacing
  "both count"). Moving someone, or taking them off a track, deletes the entries they logged today
  (Malaysian date) on the track they leave, with their photos (a pair entry keeps its photos, which
  the partner's entry still shows). `set_challenge_track` does it (0107); the captain's switch asks
  first when that person logged today. So nobody scores on both tracks in one day.
- **My team on an earlier day** shows a moved member's numbers from whichever track they logged
  that day, rather than "Not logged".

- **Five places a day per team per track** (the user, 26 Oct; replaces "5 is a target, never
  enforced" for submitting). Any number can be placed on a track, but `submit_answers` (0108) takes
  entries from at most the pair's `target` (5) people per team per track per day. Someone already
  logged today may add more sessions; a revoked entry frees its place. The page says "Full today".
- **Tagging a partner** (D524) can't get round either rule: the partner is checked by the same
  `submit_answers` - their own track, their own team's places - and any refusal drops the whole
  entry. The partner picker lists only people on this track.

### D731 — Track history: every view follows the day (the user, 27 Oct)

- **History:** `challenge_track_history` (0109) keeps every track change with its Malaysian day.
  It was filled in from the placements of the time, and `set_challenge_track` adds a row on each
  change. This replaces D722's "no history" non-goal.
- **My team** shows the tracks as they stood on the day picked; for anyone placed before the
  history began, the track they logged on that day. Captains' switches show on today's view only.
- **My stats** on a track page counts both tracks: a day logged on the other track (before a move)
  is logged in the week strip and the streak, scores its own points into the week, and reads in
  that track's unit and entries, read-only, with "Logged on <track>, before your track changed."

### D727 — The combined team score

- **Season total for a team:**
  - Track A: Tier 1 + Tier 3 podium + Track A's ad hoc points
  - plus Track B: Tier 1 + Tier 3 podium + Track B's ad hoc points
  - plus the combined Tier 2 bonus.
- **Each track's own podium is unchanged.** It is worked out per activity by that activity's
  weekly volume (15/10/5 each).
- **The bonus moves to the pair.** The per-activity `team_bonus` is cleared on both activities,
  so neither awards its own.
  - **When it's earned:** the pair awards +10 in an ended week when every member currently
    counted (D467's `counts`) logged at least that track's daily minimum on every day of the week.
    Each day can be on **either** track: 1 km on Track A, or 20 minutes on Track B.
  - **Members with no track still count as members,** so they block the bonus. That is the
    poster's rule ("all members").
  - **Void weeks:** a team-week voided in either track (D467) earns no bonus that week.
  - The bonus amount is a setting on the pair (10).
- **Ranking:** standard competition ranking on the total, the same as today.
  - Season-void teams sit at the bottom as today. A season void can't happen with `void: week`,
    but the logic should still hold.
  - D468's volume ranking (Ultra-Effort) stays per track on each activity's committee board. It
    isn't part of the combined board.
- **Calculation:** worked out live from both activities' `loadChallenge` results. Nothing is
  stored (D375), so a revoke shows on the next load, and so does a board that ships mid-week.

### D728 — Where the combined score shows

- **Attendee Leaderboard tab** on both track pages, still gated by `show_leaderboard`. It shows
  the **combined** board: rank, team and total, with a breakdown of km points, minute points,
  bonus and podiums. Rosters and "you" marking work as today.
- **My team,** for the current week, shows both tracks:
  - the team's km and minutes so far;
  - who is on each track;
  - the combined bonus progress, such as "8 of 10 on track today".

  The current per-activity bonus line would be wrong under the pair, so it is replaced. The
  exact layout is the builder's call.
- **Committee:** each activity's admin Leaderboard tab keeps its per-track panel (Tier 1,
  podium, volume, by week) and gains a **Combined** panel showing all weeks and each single week.
  It also shows each team's track counts, e.g. "A 5 · B 6 · none 0".
- **Export:** the submissions export gains a combined leaderboard sheet (weekly rows plus All
  weeks), next to the two per-track sheets.

### D729 — Setup for ecphub (settings only, no code; applied with the user's yes)

Order matters. **The user exports Week 1 first,** because moving Project Active's start date
takes 12–18 Oct out of every board.

1. **Project Active (Track B):**
   - **Scoring:** start 26 Oct, end 4 Dec; steps `20=1, 30=2, 45=3, 60=4, 120=5`; daily minimum
     20; podium 15, 10, 5; team bonus cleared (D727); week numbering from the challenge, so
     26 Oct is Week 1; week void as before.
   - **Form:** Track B needs a smartwatch from now on (the user, 25 Oct). A phone can't measure
     heart rate, so phone-only people go on Track A.
     - **Drop the device branch:** remove the `device` and `phone_activity` questions, and the
       `machine` photo, which showed only for phone + indoor.
     - **One activity list:** the watch activity question becomes the only one, following the
       poster's Track B list. Remove Mind-Body & Studio; add Swimming, Dance and Ergs
       (Row/Ski/Bike). Keep "Other — approved by the committee" with its text box.
     - **Heart rate:** no form question (the user, 25 Oct). The committee checks the 100+ bpm
       average on the Strava/smartwatch screenshot and revokes entries that fall short.
     - Old entries keep their answers as they were. Entries show the questions they answered.
     - On 25 Oct, 484 of the 902 Week 1 entries came from phone-only users.
   - The 12–18 Oct entries stay in the database untouched. They just fall outside the scoring
     dates.
   - **No Week 1 baggage:** on 25 Oct, Project Active had **0 disqualifications and 0 ad hoc
     points**, so nothing from Week 1 carries into the new boards. Re-check that both counts are
     still 0 before the start date moves.
     - A Week 1 week void left in place would count the person out for the whole new season
       (`outFrom`).
     - Ad hoc points have no date filter, so they would carry over.
     - If any appear, raise them with the user rather than deleting them.
2. **Project Mileage (Track A), new:**
   - **Scoring:** km, start 26 Oct, end 4 Dec; steps `1=1, 3=2, 5=3, 8=4, 10=5`; daily minimum
     1; podium 15, 10, 5; no team bonus; week numbering from the challenge; week void.
   - **Form:** copy the Oct archive's questions (method, km, Strava, treadmill photo).
   - **Other settings:** copy Project Active's group mode, proxy fields, `attendee_edit`,
     `health_data`, category Wellness and `per_day`.
3. **Link the pair,** set the target of 5 and the bonus of 10.
4. **Open both activities on 25 Oct and pin both** (the user agreed to opening today). Captains
   can then assign tracks before Monday. `canSubmit` already says "closed" before
   `scoring.starts_on`, so nobody can submit early. Turn `show_leaderboard` on once the combined
   board is live (D730).

### D730 — Rollout

- **Phase 1, needed before captains can work:** D721–D726, plus the D729 setup. Without the track
  lock, people can submit to the wrong track from the very first entry.
  - The aim is to ship it on 25 Oct, so captains have Sunday evening and Monday until 23:59 to
    place their people.
  - **No bulk import and no grace period** (my call). Opening today gives captains time, and the
    committee can place anyone left over from admin. Someone with no track by Monday night loses
    that day, as the poster's deadline implies.
  - Until Phase 2 ships, `show_leaderboard` stays **off** on both activities. A per-track board
    would show half a team's score as if it were all of it.
- **Phase 2, during Week 1 (before Sun 1 Nov ends):** D727 and D728. Points are live, so Week 1
  scores the same as if the board had been there from Monday.

## Non-goals

- Enforcing 5 per track.
- A history of track moves, or of who was on which track on a given day.
- One activity holding both metrics.
- Changing tournaments, or the single-track challenges on other events.
- WhatsApp reminders.

## Anti-goals (a failure even if it works)

- Writing to ecphub — settings, data, migrations that touch its rows — without the user's yes in
  chat.
- Deleting Week 1's entries. They are hidden from scoring, not removed.
- A board that shows only one track's points as the team's total.
- Captains able to place people outside their own group.

## Left to the builder

- How the pair link is stored, and the exact schema of the assignment table and its RPCs, within
  D721–D723.
- My team's exact markup and the A | B switch's form, within D724.
- Tests: pure tests for the combined scorer (the bonus across tracks, void weeks, members with no
  track, moves mid-week) alongside `challenge-score.test.ts`, and an end-to-end check on a test
  event, never ecphub.
