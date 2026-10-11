# Project Active — Project Mileage becomes a minutes challenge — design

Approved in chat on 11 Oct 2026. Source: the ECP Wellness 2026 eDM 7 ("8-Week Project Mileage,
12 Oct – 4 Dec 2026", 3 pages: rules, scoring, FAQ). Because of the haze, Project Mileage
(spec 2026-10-02, D368–D387, D396–D400) turns into **Project Active**. Instead of outdoor km,
it now scores **active minutes** from any of 7 indoor or outdoor activity types.

This builds on the scored-challenge machinery (D372–D381). Most of the new rules are settings.
The code changes make the unit and the week numbering settable, void a single week on
disqualification, and add the Ultra-Effort ranking.

## The rules being implemented (from the eDM)

- **Dates:** 12 Oct – 4 Dec 2026, 8 Mon–Sun weeks. The last week is Mon–Fri.
- **Entries:**
  - One entry per tracked Strava session of **at least 20 active minutes**.
  - Several sessions a day add up.
  - Each entry has to be submitted by 23:59 the same day.
- **Tier 1 (daily points):** a person's daily total earns 1 pt at 20 min, 2 at 30, 3 at 45 and
  4 at 60+. The cap is 4 pts a day.
- **Tier 2 (consistency bonus):** +10 when every team member logs at least 20 min on every day of
  the week.
- **Tier 3 (volume podium):** the three teams with the most uncapped minutes in the week get 15,
  10 and 5.
- **Season Champion:** the team with the most points over the 8 weeks.
- **Ultra-Effort award:** the team with the most active minutes over the 8 weeks.
- **Proof:**
  - Every entry needs a Strava screenshot and a post-workout face selfie.
  - Indoor machines logged on the phone app also need a photo of the machine screen.
  - Entries with missing or unclear proof score 0, which the committee does by revoking them.
- **Fair play:** a person caught editing or faking proof is disqualified, and **their team's
  points for that week** are voided.

## Context checked on 11 Oct 2026

- The ecphub "Project Mileage 🏃" activity (`3b89b3a2-…`) has 436 live entries, 5–9 Oct, in km,
  and no disqualifications. It is open and pinned, with `show_leaderboard` off.
- Its settings are carried over to the new activity: `group_mode = 'members'`, proxy fields
  captain and vice captain, `attendee_edit` on, category Wellness.

## Decisions

### Phase 1 — live before Mon 12 Oct 00:00

- **D462 — Project Active is a new activity. Project Mileage is closed, not converted.**
  - Its km entries can't be scored in minutes, and the eDM's season counts only the 8 Project
    Active weeks.
  - Mileage is set closed and unpinned. Closed activities are hidden from attendees (D384).
  - Its entries, leaderboard and export stay for the committee.
- **D463 — `scoring.unit`, an optional short label such as "min".**
  - When it's missing, the unit is "km", so Mileage reads as before.
  - Every place that wrote "km" now writes the unit: the ring, the headline and next goal, the
    entry timeline, My team, the committee leaderboard column, the team grid and the export
    header.
  - The Setup tab's Scoring section gets a Unit input.
- **D464 — `scoring.week_origin`: `'event'` (the default, D378) or `'challenge'`.**
  - With `'challenge'`, Week 1 is the week the challenge starts in, so Project Active reads
    Week 1–8.
  - Mileage keeps Week 2–10.
  - The Setup tab gets a "Number weeks from" select.
- **D465 — The Project Active form** (all settings, no code):

  | Key | Label | Type | Rules |
  |---|---|---|---|
  | `activity` | Activity | select: Outdoor running / walking / hiking · Indoor running (treadmill) / running in place · Skipping / jump rope · SkiErg / rowing machine · Racquet & court sports · Gym & conditioning (strength, HIIT, circuit) · Mind-body & studio (yoga, pilates, mobility, dance) · Other — approved by the committee | required |
  | `other` | What activity? | text | required, shown when `activity` includes "Other" |
  | `method` | How did you record it? | select: Strava app on phone · Smartwatch / wearable synced to Strava · Indoor machine, logged manually on Strava (treadmill, RowErg, SkiErg, stationary bike) | required |
  | `minutes` | Active minutes | number | required, min 20, max 300, decimals 0 |
  | `strava` | Strava screenshot | file | required |
  | `selfie` | Post-workout face selfie | file | required |
  | `machine` | Machine screen photo (time + metrics) | file | required, shown when `method` includes "Indoor machine" |

  - The phone-vs-smartwatch rule is checked by the committee from the proof. The form doesn't
    block any combination.
- **D466 — Project Active's scoring:**
  - `metric_key: minutes`, `unit: min`, `daily_min: 20`, `week_origin: challenge`.
  - Dates 2026-10-12 to 2026-12-04.
  - `daily_steps` 20=1, 30=2, 45=3, 60=4; `team_bonus: 10`; `podium: [15, 10, 5]`.
  - The top step is the daily cap. Tier 3 already sums uncapped totals (D377).

### Phase 2 — before Sun 18 Oct, when week 1 is scored

- **D467 — `scoring.void`: `'season'` (the default, D380) or `'week'`.** Project Active uses
  `'week'`.
  - `challenge_disqualifications` gains `week_of date`, the Monday of the offending week. The
    committee picks the week in the Disqualify dialog, defaulting to the current week.
  - Under `'week'`, the team scores 0 in all three tiers for that week. It's left out of that
    week's podium, so the teams behind move up. Its other weeks count.
  - The leaderboards show "Void" on that week only. The team's season total and rank stay live.
  - The disqualified person counts nothing from `week_of` onwards (Tier 1 and Tier 3).
  - From that week on, they also stop counting as a member for Tier 2, so their teammates can
    still earn the bonus.
  - Undo deletes the row as before.
- **D468 — Ultra-Effort ranking.**
  - The committee's Leaderboard tab gets a "Total {unit}" ranking of teams. This is the
    season-to-date total of every live entry, uncapped. A voided week's minutes are left out.
  - The export's all-weeks rows carry the same total and rank.
  - Attendees still see points only (D379), so the volume race stays a surprise.

## Out of scope

- Converting or rescoring the Mileage week (5–9 Oct).
- Checking which activities are allowed with which recording method.
- Ranking individuals.
- Detecting faces or edited photos.

## Testing

- **Unit tests:**
  - `challengeWeeks` with `week_origin`.
  - `readScoring` for unit, week origin and void.
  - `scoreChallenge` with the minutes steps: 19, 20, 59, 60 and 200 min; two sessions making 60.
  - A week void for one week only: the podium moves up and the team's other weeks count.
  - Tier 2 without the disqualified member.
  - The Ultra-Effort ranking.
- **Browser, on a test event (never ecphub):**
  - The form: the machine photo and the "Other" text appear only when they should, and 19 min is
    refused.
  - The tracker reads "min" and Week 1.
  - Phase 2: Disqualify with a week, and the leaderboard and export.
- **Go-live:**
  - Create Project Active in ecphub, then close and unpin Mileage. Both are confirmed in chat
    before running.
  - Read the portal as one real team member, without submitting.
