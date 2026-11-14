# Slime Splat: daily attempts and play hours (short design)

14 Nov 2026. Asked for by CS from the client's poster for the typing challenge.

## Intent

Today anyone can play Slime Splat as often as they like inside the event's open window, and
their best run goes on the leaderboard. The poster sets three rules:

1. Test mode: at most 3 attempts a day.
2. 1 official attempt a day; only official attempts count towards the leaderboard.
3. Play before 10am, 12pm to 2pm, or after 7pm only.

The why: a fair board (nobody grinds 200 runs) and no playing during working hours.

## Decided with CS

- Rule 3 is enforced: outside the hours the game refuses to start (CS, 14 Nov: "Yes, block it").

## My calls (CS to correct)

- **Two kinds of run**, picked by the player before starting: Practice and Official.
- **Leaderboard** = each person's best official run across the days of the window. The poster's
  "only the final attempt will count" is read as "only official attempts count", not "only the
  last day's".
- **An attempt is used when it starts**, practice or official. Quitting, refreshing or losing
  connection does not give it back; otherwise a bad run is abandoned and retried.
- **A day** is a Malaysia calendar day (midnight to midnight, UTC+8).
- **Hours apply every day**, weekends included; the poster makes no exception.
- **A run started inside the hours may finish after them**, as a run started before the close
  already does.
- **Per event, on the Slime Splat settings card**: practice runs a day, official runs a day,
  play hours. Blank = no limit, so every other event behaves as today.
- **Runs already played** count as official and stay on the board.
- A disqualified official run is still a used attempt.
- `runs_played` (admin board) keeps counting every finished run, practice included.

## Non-goals

- No per-weekday hours, no public-holiday list.
- No change to the game itself, the scoring, the replay check or the tie order.
- No admin "give an attempt back" button (an admin can raise the daily number if needed).

## Approaches

**A. Rules in the database start function (picked).** `qualifier_runs` gets a `kind` column
(`practice` / `official`, existing rows `official`). `qualifier_settings` gets
`practice_per_day`, `official_per_day` (null = no limit) and `play_hours` (pairs of minutes of
the Malaysia day, null = any time). `qualifier_start` takes the kind and, while it already holds
the attendee's lock, checks the hours and counts today's runs of that kind; it answers two new
refusals, `hours` and `limit`. `qualifier_refresh_player` picks the best from official runs
only. This is where the feature already keeps every rule a phone could cheat, and the lock
means two tabs cannot both take the last attempt.

**B. Rules in the start route only.** Count, then start, in TypeScript. Less SQL, but two
starts at once both pass the count, and it breaks the feature's own rule (db.ts: "the rules a
client could cheat live in those RPCs"). Dropped.

**C. Practice runs entirely on the phone.** No server row for practice. The 3-a-day cap and the
hours could then be bypassed by clearing storage. Dropped.

## What changes

- **Migration 0139**: the columns above; `qualifier_start(…, p_kind)`; refresh from official
  runs; `qualifier_save_settings` takes the three new settings.
- **phase.ts**: a pure `hoursState(settings, now)` (open now, or when it next opens) and the
  settings type; unit-tested.
- **Start route / db.ts**: pass the kind; map `hours` and `limit` to plain messages.
- **view.ts**: `today: { practiceLeft, officialLeft }` and `hours: { open, nextOpen, text }`.
- **Player page**: two buttons with what is left ("Practice · 2 left today", "Official attempt ·
  1 today"); outside hours both are off with "Opens again at 12:00 pm"; the rules listed under
  them. A practice result says it is not on the leaderboard.
- **Admin**: three fields on the settings card (hours typed as
  `00:00-10:00, 12:00-14:00, 19:00-24:00`); Practice/Official shown in the runs table and export.

## Left to the builder

Exact wording, field validation messages, and how the two buttons sit on small phones.

## Testing

Unit tests for the hours maths and the settings parsing; the database rules on `zz-tracks-test`
only (never `ecphub` or `zp-my-best-me`); a phone-width browser pass of the player page.
