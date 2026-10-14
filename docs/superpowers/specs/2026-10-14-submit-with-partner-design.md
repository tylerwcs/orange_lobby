# Submit together with someone from another team — design

Approved in chat on 14 Oct 2026. Here is the scenario.

- **What happens:** an attendee does an activity with someone from another team, such as a
  game for Project Active. They send one submission and tag that person, and both of them get
  the entry.
- **The rule:** the tagged person must be on a different team.

Decision numbers D524–D535 belong to this spec.

## Decisions made in chat

- **The partner's entry appears straight away.** Nobody has to accept it.
- **All or nothing.** If the partner can't take the entry, nothing is saved and the message
  says why.
- **The two entries stay linked.** Edit, delete, revoke and approve act on both.
- **One partner per submission.**
- **Not included:** a "with" column in the Excel export, and notifying the tagged person.

## Context checked on 14 Oct 2026

- **The submit path.**
  - The Server Action is `submitAnswersAction`, `src/features/activities/portal/actions.ts:220-272`.
  - It calls `submitAnswers()` (`db/activities.ts:519`), the RPC wrapper and the only insert
    path. That calls the SQL function `submit_answers`, whose latest definition is
    `supabase/migrations/0064_mileage_feedback.sql:13-117`.
  - The SQL function checks, in order:
    - the activity and attendee exist;
    - the activity is open;
    - for a scored activity, that today is inside the scoring window;
    - the proxy rule (D392);
    - eligibility by the attendee's own category;
    - the duplicate-photo rule (D396, against that attendee's own rows only);
    - the group-mode limits;
    - `max_per_attendee`;
    - `per_day`.
  - It stamps the attendee's **current** `group_id`, and `submitted_by` when the sender is not
    the attendee.
- **Proxy (D392)** lets a captain or vice captain submit for one member of their **own** group:
  `SubmitFor` picker, `:for` field, `submitted_by`.
- **Health data (D412)** needs the consent of the person the data is about, on file before
  anyone submits for them (`portal/actions.ts:243-255`).
- **Same-day edit and delete** by the owner or `submitted_by`, checked by `canEditOwn` (`lib/submissions.ts:53-64`):
  - `updateOwnSubmissionAnswers` writes the edit;
  - `deleteOwnSubmission` is a hard delete followed by `deleteEntryFiles`.
- **Admin edit** is `updateSubmissionAnswers` (`editSubmissionAction`).
- **Revokes:**
  - `revokeSubmission` covers both the admin's and the verifier's revoke.
  - Revoke changes the status only; the files stay.
- **Approve** is `approveSubmission` / `unapproveSubmission` (D518–D521).
- **Scoring:**
  - `challenge_daily_totals` sums each attendee's metric per day.
  - `scoreChallenge` credits each day's points to the group stamped on the row.
- **Files:**
  - Paths are `${org}/${event}/${activity}/submission-${uuid}.${ext}`, holding neither the
    submission id nor the attendee id, so two rows can name the same path.
  - These delete by path: the attendee's own delete, an edit that replaces a file, and
    `deleteAttendees` (`src/lib/db/attendees.ts:177-192`).
  - Deleting an activity or event, or purging, sweeps the whole prefix.
- **Project Active** (ecphub, live):
  - `group_mode` `members`, not `per_day`, no `max_per_attendee`;
  - `attendee_edit` on, `health_data` off;
  - categories `["Wellness"]`, `proxy_fields` captain and vice_captain.

## Decisions

- **D524 Opt-in per activity.**
  - New column `activities.allow_pair boolean not null default false`, a submission-kind
    setting.
  - It sits in the activity form beside the proxy checkboxes, labelled **"Let people tag
    someone from another team"**.
  - Off, nothing about the activity changes.
  - Turning it on for ecphub's Project Active is the user's call, made in admin.
- **D525 Two rows, one pair.**
  - A tagged submit creates two ordinary `activity_submissions` rows, one per person.
  - Each row has its own `attendee_id` and its own current `group_id`, so each team is credited
    for its own member. Scoring needs no change.
  - The two rows share a new `pair_id uuid` (null on every other row) and the same answers,
    `submitted_on`, `file_hashes` and **file paths**: one set of files, named by both rows.
- **D526 Who can be tagged.** The partner must:
  - be in the same event;
  - not be the submitting member;
  - be in a group, and a different group from the member's. The member must be in a group too.
  - be eligible by their own category (`category_matches`).
  - When a captain submits for a teammate (D392) and tags someone, "the member" is the teammate.
- **D527 All or nothing.**
  - A new SQL function `submit_answers_pair` runs, in one transaction:
    1. the D526 checks;
    2. `submit_answers` for the member;
    3. `submit_answers` for the partner.
  - Both inserts carry the same new `p_pair_id`, a new parameter on `submit_answers` with
    default null.
  - If the partner's insert is refused, the member's insert is rolled back. This is done with
    a sub-block and `raise`, caught in the same function.
  - It returns a code and which person it applies to (`self` or `partner`).
  - The partner's checks are the same ones anyone's own submit gets: open, scoring window,
    eligibility, the duplicate-photo rule against **their** rows, the group-mode limits,
    `max_per_attendee` and `per_day`.
  - `submit_answers` keeps its current behaviour for every caller that passes no `p_pair_id`.
    The old signature is dropped and recreated with the extra defaulted parameter, so the RPC
    still resolves.
- **D528 Health data.**
  - When `activity.health_data` is on, the partner must already have consent on file
    (`hasHealthConsent`), checked in the action before the RPC.
  - Otherwise it is refused with a message naming them. Nobody can consent for someone else
    (D412).
- **D529 Refusal messages name the partner**, so the submitter knows what to fix:
  - "\<name\> is on your team. Tag someone from another team."
  - "\<name\> isn't in a team yet." / "You need to be in a team to tag someone."
  - "\<name\> can't take part in this activity."
  - "\<name\> already has an entry today." for `today`, or "\<name\> has reached the limit for this activity." for `limit`.
  - "\<name\> needs to agree to the health-information consent on their own page first." (D528)
  - A refusal that is about the member themself keeps today's message.
- **D530 The picker.**
  - When `allow_pair` is on, the submit form shows an optional native `<select name=":with">`
    labelled **"Did this with someone from another team?"**.
  - The first option is "No one". After it come `<optgroup>`s by team name, each listing that
    team's members eligible by category, sorted by name.
  - Every team but the submitting member's is listed. The picker follows the "Submitting for"
    choice when a captain changes it, so the member's own team drops out. That makes it a
    small client component: it gets every team's candidates and hides the member's team.
  - The server re-checks D526 regardless.
- **D531 "with \<name\>" everywhere an entry is shown:**
  - the attendee's history and the tracker's entry timeline;
  - the admin Submissions table;
  - the verifier card.

  A pair row whose partner row is gone (an attendee deleted) shows no "with" line. Partners
  are read with one query per page: rows sharing the page's `pair_id`s.
- **D532 Linked edits and deletes.**
  - An attendee's same-day edit, by either partner, writes the new answers and `file_hashes`
    to **both** rows (`where pair_id = X and status = 'submitted' and submitted_on = today`).
  - An admin edit does the same, without the day rule.
  - The duplicate-photo check on an edit runs against both owners' other rows.
  - Either partner's delete removes both rows, and then the files once.
  - The `canEditOwn` gate is unchanged: each person may act on their own row.
- **D533 Linked revoke and approve.**
  - A revoke by an admin or verifier stamps both live rows with the same reason and revoker.
  - Approve and Undo approval act on both live rows.
  - The verifier page lists both rows, as two cards with "with \<name\>". Acting on either
    moves both.
- **D534 Shared files survive one person's removal.** `deleteAttendees` skips any file path that a
  surviving row still names: the partner's row with the same `pair_id`. Every other delete
  path acts on both rows at once (D532) or sweeps a whole prefix, so it needs no change.
- **D535 Exports and counts are unchanged.**
  - Each row is still one person's entry under their own name and group.
  - The Excel export lists both. A "with" column is not in scope.

## Data — migration 0080

```sql
alter table public.activities add column if not exists allow_pair boolean not null default false;
alter table public.activity_submissions add column if not exists pair_id uuid;
create index if not exists activity_submissions_pair_idx on public.activity_submissions (pair_id) where pair_id is not null;
-- submit_answers: recreated with p_pair_id uuid default null, inserted into pair_id.
-- submit_answers_pair(p_activity_id, p_attendee_id, p_partner_id, p_answers, p_today,
--   p_submitted_by, p_file_hashes) returns table(code text, who text); service_role only.
```

`ActivitySubmission.pair_id?` and `Activity.allow_pair` are added to `src/lib/types.ts`.
`pair_id` is optional so old fixtures compile.

## Code touched

| Area | Files |
|---|---|
| Rules (pure, tested) | `src/features/activities/lib/pairs.ts` (new): `pairCandidates`, `pairRefusal` (code + who + names → message), `withLine` |
| DB | `db/activities.ts`: `submitAnswers` gains a partner; linked update, delete, revoke, approve by `pair_id`; `pairPartners(rows)` |
| Portal | `portal/actions.ts` submit, edit and delete; `SubmissionBody.tsx` picker (`PairPicker.tsx`, new); history and timeline "with" line |
| Admin | `ActivityRows.tsx` and settings parse (`allow_pair`); `SubmissionTable.tsx` "with" line; admin edit and revoke via the linked DB functions |
| Verifier | `VerifyPage.tsx` / `VerifyCard.tsx` "with" line; actions are unchanged (they call the linked DB functions) |
| Attendees | `src/lib/db/attendees.ts` `deleteAttendees` file guard |

## Testing

- **Unit tests** (Vitest):
  - `pairCandidates`: only other teams, only eligible people, the member never listed, grouped
    and sorted, nothing when the member has no team;
  - `pairRefusal`: every code gives its message with the partner's name, and a member-side
    code keeps today's message;
  - `withLine`.
- **SQL check** on ecpkom through `execute_sql`, against a throwaway activity:
  - a pair insert writes two rows with one `pair_id`;
  - a refused partner leaves no rows;
  - same team is refused.
- **Browser check on ecpkom only**, with a throwaway copy of Project Active, a second test team
  and test attendees:
  - submit with a tag: both histories show "with", and both teams get points;
  - each refusal message;
  - a linked edit and a linked delete;
  - verifier approve and revoke moving both cards.
  - All test data is deleted afterwards.
- **Never ecphub.** Its Project Active stays as it is until the user turns `allow_pair` on.
