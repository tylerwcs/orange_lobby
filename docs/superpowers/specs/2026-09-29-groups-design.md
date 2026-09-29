# Attendee groups and group submissions — design

Approved in chat on 29 Sep 2026. Organisers put attendees into groups. Each member can see who
else is in their group. A submission form can be set to work per group, and then every member
sees the same status, every entry, and who has and hasn't submitted.

This builds on form submissions (D161–D171) and admin edit and revoke (D337–D342). It is not a
separate pipeline. A group form is still an `activities` row with `kind = 'submission'`, its
entries are still `activity_submissions` rows, and they still go through `submit_answers`.

## Decisions

### Groups

- **D344 — An attendee is in at most one group per event.** Membership is a single
  `attendees.group_id` column, so being in two groups can't be represented. There are no groupings,
  sets or nesting.
- **D345 — Groups are their own rows.** A group is a row in `event_groups`, with a name that is
  unique per event, ignoring case. Renaming a group renames it for every member. It is not an
  attendee field, and `category` stays as it is.
- **D346 — Admins manage groups on a Groups page, in the approved admin style.**
  - The page is a table of groups with name, member count and a ⋯ menu (Rename, Delete).
  - A group's detail view lists its members, with Add members (search) and Remove.
  - The attendee table gets a Group column. The bulk editor sets it the same way it already sets
    a breakout room: a select of every group, where clearing it means "No group". New groups are
    made on the Groups page. (Amended 29 Sep 2026 while planning: the bulk bar already has this
    control, so there is no separate "Move to group…" or "New group…" item.)
- **D347 — Build groups from a column.**
  - The admin picks an attendee field. Every distinct trimmed value becomes a group, and the
    attendees with that value join it.
  - Matching is case-insensitive, and an existing group with the same name is reused rather than
    duplicated.
  - Attendees with a blank value are left as they are.
  - A preview lists the groups to create, the groups to reuse, and how many attendees will move
    (including how many move out of another group). Only Apply writes anything.
- **D348 — Members see each other on a "My group" page.**
  - The page shows the group name and its members, sorted by name, with "you" marked.
  - Each member shows their name plus whichever attendee fields the admin has ticked in
    `events.group_fields`. Nothing else is shared, and by default only names are shown.
  - Below the members, the page lists the group forms that apply to this attendee, each with
    its status (D353).
  - Attendees with no group see neither the page nor its launcher tile.
- **D349 — Deleting a group ungroups its members and keeps its entries.** Both
  `attendees.group_id` and `activity_submissions.group_id` are set to null. The admin table
  shows those entries under "Deleted group". The delete confirmation names the member count and
  the number of live entries.

### Group forms

- **D350 — "Who submits" is set per form.** The Setup tab of a submission form offers three
  choices:
  - **Each attendee:** how forms work today, and the default (`group_mode = 'off'`).
  - **Group — set number of entries** (`'entries'`): any member can submit for the group. The
    "Entries per group" setting (`group_target`, from 1 to 50) is both the target and the limit.
  - **Group — every member** (`'everyone'`): each member submits one entry, and the group is done
    once every eligible member has.
- **D351 — Group forms have no "one per day" and no per-attendee limit.** The group rule
  replaces both. The Setup tab hides those settings when a group mode is chosen, and the database
  refuses `per_day` on a group form.
- **D352 — Category targeting applies per member.** Only members whose category matches
  (`categoryMatches` / `category_matches`) can submit. In `everyone` mode, only eligible members
  count toward "every". Members who don't match see the form with the existing "not for your
  group" note.
- **D353 — Every member sees the same group status.** This status block appears on the form page
  and on My group:
  - **Status line:** "2 of 3 entries" or "4 of 6 members submitted", plus Done or Not done.
  - **Entries:** each live entry in full (answers, file links, who submitted it and when), with
    "Updated by the organiser" where it applies (D341).
  - **Members:** each eligible current member, marked submitted (✓) or "not yet". In `entries`
    mode, "not yet" only means that member hasn't contributed an entry; it doesn't block Done.

  When the group is done, the Submit button is replaced with "Your group is done". In `everyone`
  mode, a member who has already submitted sees "You've submitted — waiting on N others".
- **D354 — Ungrouped attendees can't submit a group form.** They see the form with "You need to
  be in a group to submit this". They are not listed as missing on the form. The Not done tab
  counts them in a footnote.
- **D355 — An entry belongs to the group it was submitted for.** `group_id` is copied onto the
  row when it's submitted.
  - If a member moves to another group, their entries stay with the old group and show "(now in
    Team B)" there.
  - In the new group they start out as "not yet".
  - In `everyone` mode, the old group's "every" counts only its current members.
  - In `entries` mode, the entry still counts for the old group.
- **D356 — "Who submits" and the entry target are locked once the form has live entries.** A
  save that changes either one is refused with "This form has N submissions. Revoke them before
  changing who submits." This follows the per-day collision check (D342).
- **D357 — Only admins edit and revoke group entries, as for other entries (D337/D338).** A
  revoked entry stops counting, so the group reopens and any eligible member can submit again.
- **D358 — Group limits are race-safe inside `submit_answers`.** The RPC already locks the
  activity row, which serialises every submit to one form. It counts the group's live entries
  after taking that lock. Two members can't both take the last slot, and one member can't submit
  twice in `everyone` mode.

### Admin views

- **D359 — The Submissions tab of a group form adds a Group column and sorts by group.** Edit,
  Revoke, and the Revoked and Edited badges work as they do now.
- **D360 — "Not submitted" becomes "Not done" for group forms.**
  - It lists each group that isn't done, with its progress ("1 of 3 entries", or "4 of 6" plus
    the names still to submit).
  - A footnote counts eligible attendees who have no group.
  - Participation is not shown (D351).
- **D361 — Exports carry the group.** `submissions.xlsx` gets a Group column on every sheet
  (blank for individual forms). The attendee links export (`links.xlsx`) gets a Group column.
- **D362 — The My group tile's picture is the organiser's to set.** Added 29 Sep 2026.
  - The Groups admin page gets a settings button, the same as Agenda's and Info's (D222). It
    stores the picture in `events.section_icons.group`. There is one picture per event, not one
    per group.
  - Without an upload the tile shows the portal's own illustration, `public/portal-icons/group.webp`
    (the user's artwork, 192 × 192 like Agenda's and Info's).
  - No database change.

## Data — migration 0055_groups.sql

```sql
create table event_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  event_id uuid not null references events(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (id, event_id)
);
create unique index event_groups_name on event_groups (event_id, lower(btrim(name)));
alter table event_groups enable row level security;

alter table attendees
  add column group_id uuid,
  add constraint attendees_group_fk foreign key (group_id, event_id)
    references event_groups (id, event_id) on delete set null (group_id);
create index attendees_group_idx on attendees (group_id) where group_id is not null;

alter table events add column group_fields jsonb not null default '[]'::jsonb;

alter table activities
  add column group_mode text not null default 'off'
    check (group_mode in ('off', 'entries', 'everyone')),
  add column group_target int check (group_target between 1 and 50),
  -- The inline check above auto-names itself activities_group_target_check (Postgres names a
  -- column check <table>_<column>_check), so the rule below needs a name of its own.
  add constraint activities_group_target_required_check
    check ((group_mode = 'entries') = (group_target is not null)),
  add constraint activities_group_per_day_check
    check (group_mode = 'off' or not per_day);

alter table activity_submissions
  add column group_id uuid,
  add constraint activity_submissions_group_fk foreign key (group_id, event_id)
    references event_groups (id, event_id) on delete set null (group_id);
create index activity_submissions_group_idx
  on activity_submissions (activity_id, group_id) where status = 'submitted';
```

The column-list form of `on delete set null (group_id)` needs Postgres 15 or later. The Supabase
project is on 15 or later; check this before applying.

`submit_answers` is re-created with the same signature, grants and exception handler. After the
category check, when `a.group_mode <> 'off'`:

- `att.group_id is null`: return `'nogroup'`.
- `'entries'`: count the rows where `activity_id = a.id`, `group_id = att.group_id` and
  `status = 'submitted'`. If the count is `>= a.group_target`, return `'groupdone'`.
- `'everyone'`: if a row already exists for this activity, this attendee and this group with
  `status = 'submitted'`, return `'limit'`.
- The `max_per_attendee` and `per_day` checks are skipped (D351).

The insert records `group_id` (`att.group_id`, or null for individual forms). `SubmitCode` gains
`'nogroup' | 'groupdone'`, and `SUBMIT_RESULT_MESSAGES` gains their sentences.

`purge_event_personal_data` doesn't touch `event_groups`, because group names aren't personal.
Deleting the attendees clears membership.

## Code

- **`src/lib/types.ts`:**
  - New `EventGroup`.
  - `Attendee.group_id`.
  - `Activity.group_mode` and `group_target`.
  - `ActivitySubmission.group_id`.
  - `EventRow.group_fields`.
- **`src/lib/groups.ts` (pure):**
  - `groupProgress(activity, members, subs)` returns `{ done, have, need, members: [{ id, name,
    submitted }], entries }`. `members` is the group's current members; eligibility and live
    filtering happen inside.
  - `planGroupsFromColumn(attendees, fieldKey, groups)` returns `{ create: string[], reuse:
    EventGroup[], moves: { attendeeId, groupName }[], movingOut: number }`.
  - `groupFieldValues(attendee, fields)` returns the fields shown on My group.
- **`src/lib/submissions.ts`:** `canSubmit` takes the group's progress and gains the reasons
  `nogroup` and `groupdone`, matching the RPC. In `everyone` mode a member who has submitted gets
  `limit`, and the page draws "waiting on N others" from the progress. `missingFrom` is left alone; group forms use `groupProgress`.
- **`src/lib/db/groups.ts`:**
  - Groups: `listGroups(eventId)` (with member counts), `createGroup`, `renameGroup`,
    `deleteGroup`.
  - Members: `setGroupMembers(eventId, attendeeIds, groupId | null)`, `groupMembers(groupId)`.
  - Entries: `groupSubmissions(activityId, groupId)`.
  - Writes filter on `event_id`.
- **Admin:**
  - `src/app/admin/events/[id]/groups/page.tsx` and `actions.ts`: list, detail, build from
    column (preview then apply), and the `group_fields` picker.
  - `AttendeeTable`: the Group column and "Move to group…".
  - `SubmissionFields` in `ActivityRows.tsx` gets "Who submits" and "Entries per group".
  - `saveSubmissionActivityAction` gets the D356 lock check.
  - `SubmissionTable` gets the Group column.
  - A new `GroupsNotDonePanel` replaces `MissingPanel` on group forms, and `activityTabs` is
    told the group mode.
- **Portal:**
  - A new route, `src/app/e/[slug]/a/[token]/group/page.tsx`, and a launcher tile shown only when
    `attendee.group_id` is set.
  - `src/components/portal/GroupStatus.tsx` is shared by the form page and My group.
  - `loadActivityEntries` fetches the group's members and the group entries for group forms in
    its existing `Promise.all`.
  - `SubmissionBody` renders `GroupStatus` instead of `SubmissionHistory` on group forms.
- **Exports:** a Group column in `submissions.xlsx` and `links.xlsx`.

## Testing

- **Vitest:**
  - `groupProgress` in both modes, with revoked entries, ineligible members, a member who moved
    out (their entry still counts in `entries` mode but not in `everyone` mode) and a deleted
    group.
  - `planGroupsFromColumn`, with blank values, case and whitespace clashes, reused groups, and
    attendees moving out of another group.
  - `canSubmit` for `nogroup`, `groupdone`, and `limit` in `everyone` mode.
  - The Group column in the export.
- **`npm run check:submit`**, with new scenarios:
  - On an `entries` form with target 2, 20 members of one group submit at once; exactly 2 get
    `ok` and the rest get `groupdone`.
  - On an `everyone` form, one member submits 20 times at once; exactly 1 gets `ok`.
  - An ungrouped attendee gets `nogroup`.
  - A member who moved to another group can submit for the new group.
  - Revoking an entry on a full `entries` form lets another member submit.
- **Browser, on `ecpkom` (never ecphub):**
  - Build groups from a column.
  - Move one member with the bulk action.
  - Submit as two members of one group on an `entries` form and on an `everyone` form, and check
    that both portals show the same status, entries and member ticks.
  - Revoke an entry and check that the group reopens.
  - Check the Not done tab and the export.
