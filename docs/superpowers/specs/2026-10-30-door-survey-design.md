# Door survey — design

Date: 30 Oct 2026. Decisions from D759. Migration 0114.
Deadline: live on `zp-my-best-me` (MYBESTME) before the health screening on **6–7 Nov 2026**.

## Why

MYBESTME's client wants two things answered **onsite, before each person is screened**:

1. The **3 pre-event survey questions** (chronic diseases — tick all that apply; what might stop
   someone seeking medical advice — tick all that apply; would you speak to a doctor).
2. **Medical history, pregnancy, on menses** — so the screening vendor can be consulted on
   eligibility.

Today these sit on the registration form, answered weeks ahead. Pregnancy and menses change week
to week, so the client wants them asked on the day (client's words: "suggest to do onsite before
the screening").

At check-in, crew scan the attendee's badge with **their own phone or tablet** (`/scan/[eventId]`,
signed-in admin or crew link). The attendee's phone plays no part in that moment, so the survey
is filled **on the crew device**, right after the scan: crew hand the device over (or read the
questions out), it is submitted under that attendee, and the scanner goes back to scanning.

The user chose this over a portal popup after check-in (30 Oct): every attendee answers before
they leave the door, and nobody has to remember to open their portal.

## Goals

- A checkpoint can name a **survey**: a submission (form) activity of the same event.
- After a scan at that checkpoint checks someone in, the result card offers **Fill survey** and
  **Skip**. Fill survey opens the form, full screen, headed with the attendee's name.
- Submitting saves an ordinary submission of that activity for that attendee, marked as **sent at
  the door** (which checkpoint). It appears in the activity's submissions list and export like any
  other entry. The scanner then returns to scanning with a short "Survey saved for <name>".
- Skip records nothing and returns to scanning.
- Someone who already has a live entry for the survey sees **"Survey done"** on the card instead of
  the buttons, so nobody answers twice.
- **Tick boxes** (`multi`) work in activity forms: in the door survey, in the portal's submit form,
  and in the admin's edit of a submission. Same behaviour as on registration (D732): the answer is
  the ticked choices joined ", " in option order; works with `show_when`.

## Non-goals

- **Nobody is warned about answers.** No flag on screen for "pregnant" or "on menses"; the vendor
  doesn't read answers at the door (user, 30 Oct: "so far no one needs to see"). Answers are only
  ever read in the admin.
- No portal popup, no WhatsApp message.
- Not changing MYBESTME's registration form. Taking the survey questions off it is a manual admin
  step for the user, after this ships (see Setup).
- The scanner's own wording stays English. Questions are bilingual in their own text, as on
  MYBESTME's registration form (EN label, BM in help text / brackets).

## Anti-goals (a failure even if it works)

- **One person's answers ever visible to the next person** at the device, or sent back to the
  scanner after submitting. The form clears on submit, on Skip, and when the scanner moves on.
- **The door slowed for people the survey doesn't apply to.** A checkpoint with no survey behaves
  exactly as today.
- **A crew link that can write anything beyond this.** A crew token may only create a submission
  of *its checkpoint's* survey, for an attendee *checked in at that checkpoint*. Nothing else
  about submissions opens up to crew links.

## How it behaves

### Admin: linking a survey to a checkpoint

- The new-checkpoint form (event → Check-in → checkpoints) gets **"Survey after check-in"**: a
  select of this event's submission activities, default **None**.
- An existing checkpoint can have its survey changed or removed (there is no checkpoint edit
  today; add the smallest one that fits the admin style — e.g. a "Survey…" item in its ⋯ menu).
- The checkpoint row shows a badge "Survey: <activity name>", next to the existing
  "Booked for …" badge.
- Works on ordinary doors and booking doors alike. MYBESTME will use booking doors (Health
  Screening Booking) on 6 and 7 Nov.
- Deleting the activity clears the link (`on delete set null`); the door just stops offering it.

### Scanner

- Which result states offer the survey: **ok** (just checked in) and **duplicate** (already in —
  e.g. they were scanned, skipped, and came back). Not `not_booked` until crew press "Let them in
  anyway" and it becomes ok. Not error / notfound / undone.
- The card shows, under the attendee's details: **Fill survey** (primary) and **Skip**; or
  "Survey done" when they already have a live entry. The Undo countdown keeps working beside it.
- **Fill survey** opens a full-screen form over the scanner: attendee name at the top, the
  activity's description, its questions (same renderer as the portal, `show_when` included), the
  health-information consent tick when the activity has `health_data` on, then **Submit** and
  **Skip**. The camera stops reading badges while the form is open.
- On submit: success → close, clear, show "Survey saved for <name>" in the result band, resume
  scanning. A refusal (e.g. already submitted from another device a moment ago, max reached,
  category not eligible) → shown in the form, answers kept so crew can Skip.
- Works for both a signed-in admin and a crew link.

### Server

- A new action beside `checkInByTokenAction` in `src/app/scan/[eventId]/actions.ts`, using the
  same `authorise` (admin or crew token, same fail-closed rules, rate limited by crew token).
- It checks: the checkpoint is in this event and names a survey; the survey is a submission
  activity of this event; the attendee is in this event, not cancelled, and **has a check-in at
  this checkpoint**; check-in is enabled and the event isn't archived.
- Health consent (D412): the tick on the door form is the attendee's own consent — they tick it
  on the device themselves. Required when `health_data` is on and they have no consent on file;
  recorded with `recordHealthConsent` as on the portal.
- Answers go through the shared `readAnswers`, then `submitAnswers` (the only write path).
- **The open switch:** the door may submit even when the activity is **closed**, so the survey
  can stay off the attendee portal (the client wants it onsite). `submit_answers` gets a
  door flag that skips only the `closed` checks (open switch and date window); categories,
  max per attendee, per day and every other rule still apply.
- The submission records **which checkpoint it was sent at** (new nullable column on
  `activity_submissions`). `submitted_by` stays null — it is the attendee's own entry.
- The scan result gains the survey state (none / to do / done) so the card knows what to draw;
  it never carries any answers.

## Setup for MYBESTME (after deploy, by the user, in the admin)

1. New submission activity, e.g. "Pre-screening survey": **closed**, max 1 per attendee,
   health information on, the 3 survey questions + medical history / pregnancy / on menses, in
   the same bilingual style as the registration form.
2. Checkpoints for 6 Nov and 7 Nov on Health Screening Booking, each with this survey.
3. Optionally remove the survey + pregnancy questions from the registration form. The 6 existing
   registrations keep their answers on record.

## Testing

- Unit tests where the logic is pure: which result states offer the survey, tick-box read and
  validation for activity forms.
- Browser check on a **test event** (never `ecphub`, never `zp-my-best-me` — both live): admin
  scanner and crew link; fill, skip, already done, a refusal, a booking door, health consent.
- Check on the live site after the push.

## Calls made in writing this up (not discussed with the user)

- **Consent tick language:** the health-information consent is the attendee's own consent
  (D412) but the scanner has no language. When the event has the EN | BM switch on, the door
  form shows the consent wording in **both** languages, English first, BM below, from the
  existing `d.submission` wording. Otherwise English.
- `duplicate` offers the survey, so someone who skipped can be caught on a re-scan.
- The door bypasses the open switch (survey stays off the portal).

## Code facts the plan must cover (from the builder check)

- Tick boxes can't be *created* in activity forms yet: `FORM_QUESTION_TYPES`
  (`src/lib/registration.ts:15`) lacks `"multi"`, and the activity editor and
  `kinds/submission/settings.ts` both use it. Add it there; `QuestionCards` already supports it.
- `readAnswers` reads one value per key and `SubmissionFields` tracks `show_when` from a single
  input's value. Follow `RegisterForm`: the boxes carry no name; a hidden input posts the joined
  string and drives `show_when`.
- A booking door returns `duplicate` in two places (`actions.ts:81` for an earlier walk-in,
  and after `recordCheckin`); both need the survey state.
- Adding a parameter to `submit_answers` changes its signature: drop and re-create it with the
  `revoke`/`grant` lines, as in 0063/0064/0080. Update `submitAnswers`. `submit_answers_pair`
  is untouched (no pairs at the door).
- The scanner pages (`/scan/[eventId]` and the crew link page) must load the survey activity's
  questions, description and `health_data`. None of it is an answer.

## Left to the builder

- Exact component split, file names, and how the overlay is built (follow the scanner's existing
  look and the admin design style).
- The checkpoint survey edit control's exact form.
- How "sent at the door" shows in the admin submissions list.
- Whether file-upload questions work at the door: fine if the shared reader handles them; no extra
  work if not, but the admin should not be able to link a survey that would break.
