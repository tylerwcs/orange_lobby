# Submission verifiers and revoke reasons — design

Approved in chat on 13 Oct 2026. There are two features:

1. **Verifier links.** Each link is a per-person token that opens **only** an event's
   submissions, so committee helpers can check proof without an admin login. Project Active is
   the first user: "entries with missing or unclear proof score 0, which the committee does by
   revoking them" (spec 2026-10-11).
2. **Revoke reasons.**
   - Every revoke now carries a reason, picked from the event's templates or typed as "Other".
   - The attendee sees the reason.

Decision numbers D492–D505 belong to this spec.

## Context checked on 13 Oct 2026

- **One kind of admin.**
  - Any `org_members` row gives full access to every event in the org (`requireAdmin`,
    `src/lib/auth.ts`).
  - `org_members.role` exists, but nothing reads it.
  - Admins are created by hand (`docs/runbook.md`).
- **Limited access is done with event token links**, never with roles:
  - `crew_token` → `/crew/[token]`
  - `host_token` → `/host/[token]`
  - `booths.token` → `/booth/[token]`
  - `setup_token` → `/setup/[token]`
- **Revoking today.**
  - Columns: `activity_submissions.status in ('submitted','revoked')`, plus `revoked_at` and
    `revoked_by → auth.users` (0053).
  - Code: `revokeSubmissionAction(eventId, activityId, submissionId)` in
    `src/features/activities/admin/actions.ts` → `revokeSubmission()` in
    `src/features/activities/db/activities.ts`, a plain service-client update guarded by
    `status='submitted'`.
  - **There is no reason column.**
- **The admin UI** is the Submissions tab of an activity page:
  - page: `SubmissionDetail.tsx`
  - table: `SubmissionTable.tsx`, with the ⋯ → Revoke confirm and the "Revoked" badge tooltip
    showing who and when
  - file downloads: `/admin/events/[id]/submissions/[submissionId]/files/[key]`
- **What attendees see today.**
  - `submissionsForAttendee` drops revoked rows, so on normal and group forms a revoked entry
    simply disappears (D339, D341).
  - The scored-challenge tracker shows it faded, with "Removed by the organiser" (D374,
    `EntryTimeline.tsx`, `lib/tracker.ts`).
- **The pattern to copy.** Challenge disqualifications already require a reason of 1–500
  characters (`challenge_disqualifications`, `DisqualifyForm.tsx`).
- **The Settings page is one form.**
  - `updateSettingsAction` writes every column on every save.
  - Anything inside it that saves on its own must be a plain button calling an action, not a
    nested form. The badge pins work this way: "Saved as you go".

## Decisions

### Verifier links

- **D492 One link per person, not per event.**
  - An admin adds a verifier by **name** ("Aisyah"), and that creates her own token link.
  - Her revokes are credited to the name.
  - There are no auth accounts, invites or passwords.
  - Event scope comes free: a link belongs to one event.
- **D493 A removed link is kept, not deleted.**
  - Removing sets `removed_at`. The token stops working at once, but past revokes still name
    her.
  - **Replace link** issues a new token on the same row (same name and history), and the old
    URL dies.
- **D494 No expiry.**
  - Project Active runs for 8 weeks, and checking can carry on after the event.
  - A link works until it is removed or replaced. Compare the crew link, which stops after the
    event's last day.
- **D495 What a verifier can do.**
  - View submissions from every `kind='submission'` activity in the event.
  - Open the files.
  - Revoke with a reason.
  - **Nothing else:**
    - no editing answers
    - no challenge disqualifications
    - no export
    - no admin page
    - no attendee list beyond the names on submissions
- **D496 Every verifier action re-checks the token**, both on the server and on each request.
  - A link removed while its page is open is refused on the next action.
  - Rate limits use the crew-link helper (`allow(...)`).

### Revoke reasons

- **D497 The templates are per event.**
  - Stored in `events.revoke_reasons text[]`, ordered.
  - New and existing events start with the five defaults below.
  - "Other (type a reason)" is always in the picker and never stored in the list.
- **D498 A reason is required on every revoke**, whether an admin or a verifier does it. This is
  the same rule as disqualifications.
- **D499 What gets stored.**
  - `activity_submissions.revoke_reason` holds a **copy of the wording**.
  - Editing or deleting a template later never rewrites what an attendee was told.
  - Revokes made before this change have `null` and keep their current wording everywhere.
- **D500 Attendees see the reason** on every submission form type (see below).
- **D501 Display only, never counting.**
  - Revoked entries still never count toward limits, totals, daily caps, "Not submitted",
    scores or the leaderboard.
  - `submissionsForAttendee` and `submissionsForGroup` stay unchanged.
  - Revoked entries reach the attendee through a separate fetch that is only for display.

### Placement

- **D502 A new Settings tab, Verification**, with two cards: **Verifier links** and
  **Revoke reasons**.
  - Both save as they go, using plain buttons and dialogs that render in a portal, like the
    badge pins. Neither is part of the Settings form.
  - The tab is hidden when the event's Activities feature is off (`hiddenTabs`).

## Data — migration `0077_submission_verifiers.sql`

```sql
create table verifier_links (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  token       text not null unique,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  removed_at  timestamptz
);
create index verifier_links_event_idx on verifier_links(event_id);
alter table verifier_links enable row level security;   -- no policies: service role only

alter table activity_submissions
  add column revoke_reason        text check (revoke_reason is null or char_length(revoke_reason) between 1 and 300),
  add column revoked_by_verifier  uuid references verifier_links(id) on delete set null;

alter table events
  add column revoke_reasons text[] not null default array[
    'Photo or file is unclear',
    'Duplicate entry',
    'Doesn''t meet the activity''s requirements',
    'Submitted to the wrong activity',
    'Inappropriate content'
  ];
```

- **Tokens** come from `generateToken()` (`src/lib/tokens.ts`), like the setup link, and are checked
  with `isValidToken` before any lookup.
- **Who revoked.** A verifier revoke sets `revoked_by_verifier` and leaves `revoked_by` null.
  An admin revoke works the other way round.
- **Template limits.** Each template is 1–300 characters after trimming. The list holds at most
  12 entries, with no duplicates. Both are checked in the action.

## Code

### Shared: `src/features/activities/revoke/`

This is a new module that both surfaces use.

- `reason.ts`
  - `parseRevokeReason(formData, templates)`. It accepts the template the user picked (it must
    match the event's current list) or `other` plus free text, and returns
    `{ reason } | { error }`.
  - `revokeCredit(sub, verifierName?, adminEmail?)` gives the admin tooltip line, for example
    "Revoked by Aisyah (verifier) · 13 Oct, 3:42pm · Duplicate entry".
  - `attendeeRevokeLabel(reason)`:
    - "Removed: <reason>" for normal and group forms
    - "Removed by the organiser: <reason>" in the tracker
    - with no reason, the current wording
- `RevokeDialog.tsx`
  - It shows radio buttons for the templates plus "Other", and a textarea (1–300) that appears
    when "Other" is picked.
  - It takes a bound server action, so both the admin page and the verify page pass their own.
- `revokeSubmission()` (db) gains `{ reason, by: { userId } | { verifierId } }`. It is still
  guarded by `status='submitted'`, so the second of two people revoking at the same moment gets
  "Already revoked".

### Admin

- `revokeSubmissionAction(eventId, activityId, submissionId, formData)`
  - It now reads the reason through `parseRevokeReason`.
  - `SubmissionTable`'s ⋯ → Revoke opens `RevokeDialog` instead of the plain confirm.
- **The Revoked badge tooltip** uses `revokeCredit`. Verifier names are looked up in one batch
  per page.
- **Settings → Verification:**
  - **Verifier links**
    - A table-style list: name, copy-link, created date.
    - The ⋯ menu has Copy link, Replace link (confirm) and Remove (confirm).
    - "Add verifier" opens a dialog with one field, the name.
    - Removed links are hidden from the list.
  - **Revoke reasons**
    - The ordered list, with add, edit in place, delete, and move up/down.
  - New actions in `src/features/activities/admin/verifier-actions.ts`:
    - `addVerifierAction`
    - `replaceVerifierLinkAction`
    - `removeVerifierAction`
    - `saveRevokeReasonsAction`
    - Each one runs `requireAdmin` + `requireEvent`.
- **Export** (`submissions.xlsx`) gains a "Revoke reason" column and a "Revoked by" column (the
  admin's email or "<name> (verifier)").
- **Link helper** `verifierLink(base, token)` goes in `src/lib/links.ts`.

### The verify page: `src/app/verify/[token]/`

- `page.tsx`
  - It resolves the token to a link that hasn't been removed, plus its event. An invalid or
    removed token gets the same "This link isn't valid. Ask the organiser for the right one."
    screen the crew link uses.
  - The header: event branding and "Verifying as Aisyah".
  - It is server-rendered, mobile-first and `noindex`.
- **Filters** (search params):
  - `activity` (all, or one submission activity)
  - `status` (`submitted`, the default and labelled "To check"; `revoked`; `all`)
  - `q` (attendee name)
- **The list**, newest first and paged like `listSubmissions`. Each card shows:
  - the attendee's name and group, if any
  - the activity title
  - the time
  - the answers, rendered the way `SubmissionDetail` does
  - the files inline: images as thumbnails that open full size, other files as links
  - for revoked cards, the credit line
- **Actions** in `actions.ts`, all starting with `authoriseVerifier(token)`, which does the
  token check, the "not removed" check and the rate limit:
  - `revokeAsVerifierAction(token, submissionId, formData)` also checks that the submission's
    activity belongs to the link's event and is `kind='submission'`.
- **Files** come through `src/app/verify/[token]/files/[submissionId]/[key]/route.ts`.
  - It runs the same checks, then streams the file through the same storage path the admin
    route uses.
  - It never trusts a submission id that belongs to another event.
- **Proxy:** `/verify` is public, like `/crew`, so nothing is added to the `/admin` session
  check.

### Attendee

- **Normal and group forms**
  - A new `revokedForAttendee(attendeeId)` and `revokedForGroup(groupId)` (db) return revoked
    rows only, for display.
  - `SubmissionHistory` and the portal entries merge them in by date, rendered faded, with
    `attendeeRevokeLabel` and the line "You can send a new one."
  - Group forms show the same thing to every member.
- **Tracker** (`lib/tracker.ts`, `EntryTimeline.tsx`): the "Removed by the organiser" line adds
  ": <reason>" when there is one.

## Error handling

- **Invalid, removed or replaced token:** every page, action and file route on the verify link
  shows the not-valid screen or returns `{ error }`. Verifier actions never throw raw errors.
- **Reason missing, or a template no longer in the list** (an admin edited it while the dialog
  was open): "Pick a reason, or choose Other and type one." The dialog stays open.
- **Already revoked:** "Someone already revoked this entry." Then the list refreshes.
- **Rate limited:** "Too many actions at once. Wait a moment and try again."

## Testing

- **Unit (vitest):**
  - `parseRevokeReason`: a template, Other with text, empty Other, more than 300 characters, a
    stale template
  - `revokeCredit` and `attendeeRevokeLabel`: with and without a reason, admin and verifier
  - `authoriseVerifier`: a bad format, an unknown token, a removed token, a replaced token
  - template list checks: empty, duplicate, more than 12
- **Browser check** on a test event, **never `ecphub`**:
  1. Add verifier "Test V" and open the link on a phone-sized viewport.
  2. Filter, open a photo, and revoke with a template; then revoke with Other.
  3. As admin, the tooltip names "Test V (verifier)" and the reason, and the export has both
     columns.
  4. As the attendee, the history shows the entry faded with the reason, and they can submit
     again. For a scored activity, the tracker line shows the reason.
  5. Replace the link: the old URL shows the not-valid screen.
  6. Remove the verifier: the open page's next revoke is refused.
  7. Edit the templates in Settings, then revoke: the new wording is offered, and old revokes
     keep their old wording.

## Out of scope

- Undoing a revoke (admins can't today either)
- WhatsApp or email to the attendee when an entry is revoked
- A full approve/reject queue. Entries still count until they are revoked.
- Verifier links for polaroid wall moderation
- Per-activity templates
