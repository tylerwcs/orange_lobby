# Submissions: admin edit and revoke — design

Approved in chat on 28 Sep 2026. An organiser can correct a submission's answers and revoke a
submission so the attendee can send it again. Attendees still cannot edit or delete their own
submissions (D166 stands for them). This amends D166 for admins and settles D170, which left the
`status` column for a later spec.

## Decisions

- **D337 — Admins may edit a submission's answers.** Required questions and select options are
  checked exactly as on submit (`validateAnswers`). Answers under retired keys are kept untouched.
  A file question shows the current file and takes an optional replacement. The old object is
  deleted only after the save succeeds, and a new upload is deleted if the save fails. Every edit
  stamps `edited_at` and `edited_by`.
- **D338 — Revoke is a status, not a delete.** `status` is `'submitted' | 'revoked'` (D170
  settled). Revoking stamps `revoked_at` and `revoked_by`, and keeps the row and its files. There
  is no un-revoke; the attendee resubmits.
- **D339 — A revoked submission stops counting everywhere.** That means:
  - `submit_answers` and `canSubmit`, for both the per-person limit and the one-a-day rule;
  - the one-a-day unique index, which gains `and status = 'submitted'`;
  - the "X of Y submitted" count on the list page;
  - the Not submitted list and participation;
  - the export;
  - the per-day switch's collision check.
- **D340 — Admins still see it.** The Submissions tab keeps revoked rows, greyed, with a
  "Revoked" badge and who and when in its title. Edited rows show "Edited" the same way.
  Revoked rows cannot be edited.
- **D341 — Attendees see the current truth.** Their history leaves revoked submissions out, and
  shows an edited one's new answers with "Updated by the organiser". Nothing is sent to them.
- **D342 — The per-day refusal names the case (D165, finally).** Turning "one per day" on is
  refused when someone has two *submitted* rows on one day. The message names them: "Aisyah
  submitted twice on Wed 30 Sep, so this can't become once a day. Revoke one of them first."

## Data — migration 0053

```sql
alter table activity_submissions
  add constraint activity_submissions_status_check check (status in ('submitted', 'revoked')),
  add column revoked_at timestamptz,
  add column revoked_by uuid references auth.users(id) on delete set null,
  add column edited_at timestamptz,
  add column edited_by uuid references auth.users(id) on delete set null;

drop index activity_submissions_one_a_day;
create unique index activity_submissions_one_a_day
  on activity_submissions (activity_id, attendee_id, submitted_on)
  where per_day and status = 'submitted';
```

`submit_answers` is re-created with the same body, grants and exception handler. Its two counts
gain `and status = 'submitted'`.

## Code

- **`src/lib/types.ts`:** `ActivitySubmission` gets `status: "submitted" | "revoked"`,
  `revoked_at`, `revoked_by`, `edited_at` and `edited_by`.
- **`src/lib/db/activities.ts`:**
  - `listSubmissions` and `submissionsForAttendee` return only `status = 'submitted'`.
  - `submissionsForActivity` returns all rows (the admin table).
  - New: `getSubmission(id)`,
    `updateSubmissionAnswers(id, activityId, answers, userId): Promise<boolean>` and
    `revokeSubmission(id, activityId, userId): Promise<boolean>`. Both writes are filtered on
    `status = 'submitted'`, so they lose a race with a revoke cleanly.
- **`src/lib/submissions.ts`:**
  - `liveSubmissions(subs)` is the one filter.
  - `perDayCollision(subs)` returns `{ attendeeId, day } | null` over live rows.
- **Admin actions:** `editSubmissionAction` and `revokeSubmissionAction`. The per-day pre-check
  goes into `saveSubmissionActivityAction`.
- **Admin UI:**
  - `SubmissionTable` gets a ⋯ `RowActions` per row: Edit answers, and Revoke (confirm "Yes,
    revoke").
  - The edit form reuses the portal `SubmissionFields`, extended with `defaults` and `fileLinks`.
  - `SubmissionDetail` counts on live rows.
- **Portal:** `SubmissionHistory` adds the "Updated by the organiser" note.

## Testing

- Vitest: `liveSubmissions`; `perDayCollision`; `canSubmit`, `missingFrom` and `participation`
  when given revoked rows (filtered by the callers); the export filter.
- `scripts/submit-concurrency.mjs` gains a scenario: revoke the one allowed submission, and the
  attendee can submit again under the cap and on the same day.
- In the browser, on `ecpkom` (never ecphub): edit a text answer and a file, revoke, resubmit
  from the portal, check the counts, and check the per-day refusal message.
