# Feature registry and settings by feature — design

Date: 1 Nov 2026. Decisions D777–D783. Migrations 0118 and 0119.

## Why

ECP Hub is selling to more client events, and almost every one asks for something new. The user
chose to keep **one product and one codebase** rather than fork per event (1 Nov). That only holds
if two things stay under control:

1. **Bloat.** One-off features pile up, nobody remembers which client asked for what, and nothing
   ever gets removed.
2. **Scattered settings.** The user's words: "the settings are a bit scattered", and it is "hard to
   keep track what can be done and what cannot be done".

What exists today:

- **A feature list already exists** (D433): `FEATURES` in `src/features/catalogue/catalogue.ts`,
  10 base features and 9 add-ons, edited per event in Settings → Features and stored in
  `event_features`. Turning an add-on on or off only changes the admin: sidebar items, the Address
  tab, which activity and game kinds can be created, page guards (`NotInEvent`), save guards
  (`requireFeature`), verifier links, and the setup checklist. The attendee portal never reads it.
- **Most features built since D433 are not on that list.** Waiting list and approval, self-cancel,
  event terms, the EN | BM switch, popups, door surveys, committee logins, tracks, partner
  submissions, ad hoc points, the change log and others are always visible on every event, used
  or not, and appear nowhere as "something the Hub can do".
- **Settings → Event details is a catch-all**: name, venue, dates, Coming soon wording, language
  switch, logo and banner, theme, status and preview link, share links, badge pins.
- **Three save models on one page**: Event details and Registration share one big form whose
  Save saves every tab (`updateSettingsAction` writes every column on every save); Me page, Scan
  card and Committee alerts each have their own Save; Status and Check-in apply on click.
- **The settings live as ~60 columns on `events`**, 39 of them added by later migrations.

The user also said (1 Nov) the **setup checklist** will not be used any more, because what each
event needs changes too often for a fixed list, and asked for the Setup page to be **removed
completely**.

## Goals

1. **One list of everything the Hub can do.** Every feature, and every notable option inside a
   feature, has an entry: name, one-line summary, tier, and where it came from.
2. **Settings grouped by feature.** An event's Settings shows the sections for what it has on, and
   nothing for what it doesn't.
3. **Settings → Features becomes the event's front page** ("What's on"): every feature this event
   has, its options in use, and a link to each one's settings.
4. **Each settings tab saves only itself.** No more "Saves every tab".
5. **A list across all events** for the user and sales: what the Hub can do, which events use each
   feature, and which experimental features never spread beyond one client, for a review every
   quarter.
6. **The Setup page and the organiser setup link are gone**, code and data (D783).

## Non-goals

- **The attendee portal does not read the feature list.** Turning a feature off only changes the
  admin, as today; what attendees see is unchanged (the user, 1 Nov).
- **No moving settings off `events` in bulk.** The rule below applies to new settings from now on;
  existing columns move one feature at a time, when that feature is next worked on.
- **No pricing, quotes or billing.** The list is not linked to money.
- **No new activity or game behaviour.** Every feature works exactly as it does now; only where it
  is switched on, listed and configured changes.

## Anti-goals

- **A switch for every option.** Forty toggles on a Features tab is the scattered problem in a
  new place. Options are documented, not switched.
- **Hiding something an event is using.** No change here may make a setting an event relies on
  unreachable, or turn off something live for attendees.
- **Losing typed work.** The current single form exists because a form carrying only one tab's
  fields would blank the rest (see the comment above `SAVE_NOTE` in the settings page). Splitting
  saves must not reintroduce that.

## The registry

### Features and options

The registry has two levels:

- **Feature**: something an event has or doesn't. Base features are always on; add-ons are
  switched per event in Settings → Features, as today.
- **Option**: a capability inside a feature, configured in that feature's settings, with **no
  switch of its own** in the Features tab. Example: Waiting list and Approval are options of
  Self-registration; Partner submissions and Tracks are options of Engagement.

Options exist so the list answers "can the Hub do X?" without each one becoming a switch.

### What each entry holds

The existing `Feature` type in `catalogue.ts` grows. Each feature:

| Field | Meaning |
|---|---|
| `name`, `summary` | As today. |
| `tier` | `core` (always on, was `base`), `optional` (an add-on, was `addon`), or `experimental` (an add-on built for one client, not yet proven elsewhere). |
| `origin` | `{ event?: string; date: string; decision?: string }`: the client event that asked for it, the month it shipped, and its D-number. Empty for the original features. |
| `unlocks` | As today: `nav`, `activityKinds`, `gameKinds`, `settingsTabs` (the last widened to every settings tab a feature owns). |
| `options` | The feature's options: `{ key, name, summary, origin, where, experimental? }`, where `where` says where it is set ("Settings → Registration", "Each activity's settings") and `experimental: true` marks an option built for one client, as the tier does for a feature. |
| `inUse` | Optional: how to tell an event is using an option, for "What's on" (see below). |

The `setup` field and the `SetupItem` type are removed with the Setup page (below).

The `Record<FeatureKey, Feature>` stays, so adding a key without an entry still stops the build.

### Experimental features

`experimental` is an add-on. It is stored and switched exactly like `optional`. The difference is
only in the lists: the Features tab marks it ("Experimental"), and the all-events list flags it
for review. Promoting it to `optional` is a one-word change in the registry once a second event
uses it.

### Entries to add (D777)

The builder confirms each against the code; this is the intended placement.

**New add-ons** (switchable; existing events that use them get the row in the backfill):

| Key | Name | Tier | Origin | Unlocks |
|---|---|---|---|---|
| `language` | Bahasa Malaysia portal | experimental | MYBESTME, Oct 2026, D736 | the Portal language section |
| `popups` | Portal popups | experimental | MYBESTME, Oct 2026, D751 | the Popups page |

**New options** on existing features:

- **Self-registration**: registration limit and waiting list (D677), approval (D696), attendee
  self-cancel with reason (D583, D613), event terms (D540), "You're in" page (D634), open booking
  after registering (D766), banner and image under the form (D618, D720), scheduled opening
  (D600), tick-box questions (D732).
- **Check-in**: badge check-in pill (D388), scan card fields, door survey (D759).
- **Attendee portal** (`portal`): theme and glow (D622, D636), name line breaks (D633), Coming soon
  message (D617), Me page (D536), badge pins, preview link (D714–D716), event committee logins
  (D550).
- **Groups**: My group tile (D367), All groups tab (D507), fields members see (D348).
- **Engagement**: submission verifiers and revoke reasons (D492, D497), undo revoke (D735),
  partner submissions (D524), tracks and captain submission (D776), ad hoc points (D704),
  tournament squads and results (D637, D653), polaroid print look (D718).
- **Session booking**: committee alerts for waiting change requests.
- **Attendee list**: change log (D742).

`origin.event` names the client event by its display name (MYBESTME, KOM, UOB), never the
`ecphub` live event's internal details.

## Settings by feature

### Tabs

Settings keeps one page with tabs. The new set, in order:

| Tab | Holds | Shown when |
|---|---|---|
| What's on | The Features tab, redesigned (below). | Admins only, as now. |
| Event | Name, name line breaks, venue, dates, Coming soon message, Status with preview link, Share links. | Always. |
| Portal look | Logo and banner, theme, badge pins, Me page, and Portal language when `language` is on. | Always. |
| Registration | Unchanged content: open/close, limit, approval, self-cancel, intro, images, questions, terms, after they register, waiting list wording. | Always. |
| Check-in | Unchanged content: the door switch, badge pill, checkpoints with surveys, crew link, scan card. | Always. |
| Committee | Committee logins, plus Committee alerts when `booking` is on. | Admins only. |
| Verification | Unchanged. | Admins only, when submissions are possible (as now). |
| Address | Unchanged. | Admins only, when `custom_domain` is on (as now). |
| Danger zone | Unchanged. | Admins only. |

That is the Me page tab folded into Portal look, Committee alerts folded into Committee, and Event
details split in two. Committee members keep seeing the same non-admin tabs they see today, under
the new names.

The remembered-tab cookie must cope with the old keys (`details`, `me`, `alerts`): an unknown key
falls back to Event, which `rememberedTab` already does for any key not in the list.

### Each tab saves only itself (D778)

`updateSettingsAction` is split into one server action per tab (Event, Portal look, Registration),
each reading and writing **only its own columns**. Each tab is its own `<form>` with its own save
bar, and the bar's note says "Saves this tab".

- The `keepMounted` single form, the `formKey` across every field, and `SAVE_NOTE` go.
- Each tab's form is keyed on its own fields only, so saving Portal look never remounts
  Registration and drops what is typed there.
- Status, Check-in and the badge-pin controls keep applying on click, as now, and stay outside any
  tab's form.
- Unsaved changes: when a tab has unsaved edits and the user switches tab, the edits stay (the
  forms stay mounted); the save bar of the tab with edits shows them as unsaved. The builder picks
  how, within the existing `SaveBar`.
- Every action keeps `requireEventAccess`, and the admin-only checks the current action does for
  admin-only fields.

### What's on (D779)

Settings → Features becomes **What's on**, still admin-only:

- **On for this event**: each feature that is on, base ones included, with its summary, its tier
  mark for experimental ones, the options this event is actually using, and a link to where each
  is set. A feature's off switch stays where it is today.
- **Available**: add-ons that are off, each with Turn on, as now.
- **Custom modules**: as now.

"Options in use" comes from each option's `inUse` check against the event (for example,
`registration_limit` set, `registration_needs_approval` on, any activity with `allow_pair`). An
option with no check is listed under its feature without an in-use mark.

## The all-events list (D780)

A new admin page, `/admin/features`, for Ecopia admins only, linked from the top-level sidebar
(next to All events):

- Every feature and option in the registry, grouped by feature, with tier, summary, origin and
  where it is set. This is the sales list of what the Hub can do.
- For each add-on: how many events have it on, and the most recent of them. From `event_features`.
- For each option with an `inUse` check: how many events use it. The builder may compute this per
  page load across events; the event count is small.
- A **Review** filter (D782), the quarterly review. It lists every add-on and option that has an
  `origin` (core features and the original add-ons have none and are never listed), flagged when
  either is true:
  - **One client only**: it is experimental (tier, or `experimental: true` on an option) and one
    event or fewer uses it.
  - **Gone quiet**: its origin is more than three months old and no event whose `starts_on` falls
    in the last three months uses it. Event dates are used, not `event_features.created_at`:
    that timestamp resets when an add-on is turned off and on, and migration 0070 backfilled
    the original add-ons onto every event that existed then.

  The page shows the list; the decision (promote, keep, remove) is the user's.

Test and archived events count: "used" means the feature is on or the option is set, whatever the
event's status. The page shows each event's status beside it so the user can discount test
events.

## Data

### Migration 0118

- Widen the `event_features.feature` check to include `language` and `popups` (0117 already added
  `typing_qualifier`; read it for the current list).
- Backfill: every event with `language_switch` on gets a `language` row; every event with at
  least one popup gets a `popups` row. So nothing an event uses disappears from its admin.
- Nothing else in the schema changes.

### Hiding and guards for the new add-ons

- `popups` adds `popups` to `NavKey`; the Popups sidebar item hides without it, and the Popups
  page and its actions use `NotInEvent` and `requireFeature` like the other add-ons.
- `language` hides the Portal language section and makes the language save ignore the field when
  off. The attendee portal keeps reading `language_switch` as now (non-goal); turning the add-on
  off does not change what attendees see.

## Removing the Setup page (D783)

Everything built for the organiser setup flow (D441–D460, migrations 0071–0074) goes:

- **Admin**: `/admin/events/[id]/setup`, its `[section]` pages and `files/[fileId]` route, the
  Setup sidebar item and its waiting badge (`badges.setup` in the event layout and `nav.ts`), and
  any setup status shown on the events list (`src/app/admin/events/(list)/page.tsx`).
- **Organiser**: the public `/setup/[token]` pages and `src/app/setup/layout.tsx`. An old setup
  link then gets the app's ordinary not-found page.
- **Code**: `src/features/setup`, the `setup` field and `SetupItem` in the registry, and the setup
  references in `src/app/admin/events/[id]/actions.ts`. `src/features/theme/admin/ThemePreview.tsx`
  imports from `features/setup`: whatever it uses (likely the portal preview) moves into the theme
  feature or `src/components` first, so the theme card keeps working.
- **Purge**: the Purge personal data text and action stop mentioning and handling setup files and
  notes, once the tables are gone.

**Data, migration 0119**, applied only after the user has seen what it deletes:

- Before writing it, the builder counts the rows in `event_setup_sections`, `event_setup_items` and
  `event_setup_files`, and the setup files in storage, per event, and shows the user that list.
  The user confirms, or names anything to download first.
- Then 0119 drops the three tables, the `events.setup_token` column, and the setup functions and
  policies 0071–0074 created (and anything 0103 added for setup), and the builder deletes the
  setup files from storage.
- The code removal ships first, in its own commit, so the deploy no longer reads the tables
  before they are dropped.

### New settings from now on (D781)

A setting added for a feature from this point lives with that feature (its own table, or a
settings column on the feature's own table such as `activities`), not as a new column on
`events`. The registry entry names it. Existing `events` columns stay until their feature is next
worked on.

## Decided, and by whom

- One codebase, not forks (the user, 1 Nov).
- Grow the existing D433 list rather than build a new one (the user accepted, 1 Nov).
- Turning a feature off leaves what attendees see unchanged (the user, 1 Nov).
- The Setup page removed completely (the user, 1 Nov); the data deleted only after the user sees
  the counts (my call).
- Two levels, features and options; options have no switch (my call).
- `experimental` as a third tier stored like an add-on (my call).
- Language and popups as the only new add-ons (my call: they are the two whole features that are
  visible on every event and used by one).
- The tab set and per-tab saves (my call, from the map of the current page).

## Left to the builder

- Exact wording on What's on, the all-events page and the save bars, in the admin's existing
  voice.
- Where `inUse` checks live and how the all-events counts are queried.
- Splitting `updateSettingsAction`: the column list per tab, and keeping the registration form's
  validation exactly as now.
- Tests: the registry's completeness checks, per-tab actions writing only their own columns, the
  backfill, and the new guards. Tests for the setup feature go with it.
- The order of the work. The Setup removal is independent of the rest and can go first.
