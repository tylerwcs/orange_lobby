# Feature Registry and Settings by Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the D433 feature list into a registry of everything the Hub can do. Regroup event Settings by feature, with each tab saving only itself. Add an all-events feature page with a quarterly review list. Remove the Setup page completely.

**Architecture:** The registry stays in `src/features/catalogue/` (pure data and functions in `catalogue.ts`, `features.ts`, and a new `options.ts`, `usage.ts` and `review.ts`). It is read by the event sidebar, the Settings page, the What's on tab and a new `/admin/features` page. The single settings server action is split into three, one per tab, each built on a pure `*Patch` function in `src/lib/settings-form.ts` that returns only that tab's columns. Setup goes in two steps: code first, then migration 0119 drops its data once the user has seen the counts.

**Tech Stack:** Next.js (this repo's version, which has breaking changes: read `node_modules/next/dist/docs/` before touching routing, server actions or caching), React server components and server actions, TypeScript, Supabase (Postgres + storage), Vitest, Base UI tabs through `src/components/ui/tabs`.

**Spec:** `docs/superpowers/specs/2026-11-01-feature-registry-design.md`. Read it before starting any task.

## Global Constraints

- Decisions D777–D783; migrations `0118` and `0119`. Cite the D-number in code comments, as the codebase does (`// D778: ...`).
- **The attendee portal does not read the feature list.** No attendee-side file (`src/app/e/**`, `src/app/a/**`, `src/app/register/**`) gains a feature check. Turning a feature off changes the admin only.
- Tiers are exactly `"core" | "optional" | "experimental"`. `experimental` is stored and switched exactly like `optional`.
- New add-on keys are exactly `language` and `popups`, both `experimental`.
- `origin.event` is a client's display name (MYBESTME, KOM, UOB), never details of the live `ecphub` event.
- Never test on the `ecphub` event; use another event for any browser check.
- No new columns on `events` (D781). Nothing in this plan adds one.
- Admin copy is plain, in the existing admin voice. Spec-fixed copy: the save bar note is `Saves this tab.`; the not-in-event line is `<Name> isn't part of this event. Turn it on in Settings → What's on.`
- Database migrations follow 0117's style: `set local lock_timeout = '5s';` and a comment header naming the D-numbers.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Saving one tab while another tab has unsaved edits.** Every save redirects and remounts the page, so the other tab's typing is lost. Expected: Save asks first ("You have unsaved changes on <Tab>. Save anyway and lose them?"). Owned by Task 5.
2. **An event with `language_switch` on but the `language` add-on off.** Expected: saving Portal look keeps `language_switch` as it is, because attendees still see the switch. Owned by Task 4 (`portalLookPatch` test).
3. **An admin whose tab cookie still says `details`, `me`, `alerts` or `features`.** Expected: Settings opens on Event, with no error. Owned by Task 5 (`settingsTabs` / `rememberedTab` test).
4. **A committee member on Settings.** Expected: the same non-admin tabs as today (Event, Portal look, Registration, Check-in), and every admin-only action still refuses them. Owned by Task 5 (`settingsTabs` test).
5. **A Registration save that fails validation** (bad limit, bad question). Expected: an error flash on the Registration tab, nothing written, no image uploaded, and the waiting list not moved. Owned by Task 4 (`registrationPatch` throws before any write; the action order is unchanged).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/features/catalogue/catalogue.ts` | Feature keys, tiers, origins, unlocks; `FEATURES`. Loses `SetupItem`. |
| `src/features/catalogue/options.ts` (new) | `Option` type and every feature's options, with `inUse` checks. |
| `src/features/catalogue/features.ts` | `has`, `hiddenNav`, `hiddenSettingsParts` (renamed from `hiddenSettingsTabs`), `notPartOf`. |
| `src/features/catalogue/usage.ts` (new) | `EventUsage` and `optionsInUse`. Pure. |
| `src/features/catalogue/review.ts` (new) | `reviewFlags`. Pure. |
| `src/features/catalogue/db.ts` | Gains `eventUsage(eventId)` and `allEventsUsage(orgId)`. |
| `src/features/catalogue/admin/WhatsOnTab.tsx` (replaces `FeaturesTab.tsx`) | The What's on tab. |
| `src/features/catalogue/admin/FeaturesPage.tsx` (new) | The `/admin/features` page body. |
| `src/app/admin/features/{layout,page,loading}.tsx` (new) | Route and frame for the all-events page. |
| `src/lib/settings-form.ts` (new) | `eventTabPatch`, `portalLookPatch`, `registrationPatch`, and the column lists. Pure. |
| `src/app/admin/events/[id]/actions.ts` | `updateSettingsAction` replaced by three actions. Setup purge removed. |
| `src/app/admin/events/[id]/settings/page.tsx` | Tab list and layout only; tab bodies move into `settings/tabs/*.tsx`. |
| `src/app/admin/events/[id]/settings/tabs.ts` (new) | `settingsTabs(...)`: which tabs show, in order. Pure. |
| `src/features/theme/admin/PhoneFrame.tsx` | Moved from `src/features/setup/preview/PhoneFrame.tsx`. |
| `supabase/migrations/0118_feature_registry.sql`, `0119_drop_setup.sql` (new) | Add-on check and backfill; setup data removal. |

---

### Task 1: Remove the Setup page, code only (D783)

**Files:**
- Delete: `src/features/setup/` (all of it except `preview/PhoneFrame.tsx`, which moves), `src/app/setup/`, `src/app/admin/events/[id]/setup/`, `tests/setup/`, `scripts/setup-db-check.mjs`
- Create: `src/features/theme/admin/PhoneFrame.tsx` (moved, unchanged)
- Modify: `src/features/theme/admin/ThemePreview.tsx:9`, `src/app/admin/events/[id]/layout.tsx`, `src/app/admin/events/(list)/page.tsx:5,22` and the JSX that shows its "to review" count, `src/components/admin/nav.ts` (Setup item, `badges.setup`, the Setup lines in the doc comment), `src/app/admin/events/[id]/actions.ts:28,1077`, `src/app/admin/events/[id]/settings/page.tsx:666` (purge text), `src/features/catalogue/catalogue.ts` (`SetupItem`, every `setup` array, the `setup` field and the helper parameters), `src/features/catalogue/admin/FeaturesTab.tsx` (Custom modules description), `package.json` (`check:setup`)
- Test: `tests/nav.test.ts`, `tests/catalogue/catalogue.test.ts`

**Interfaces:**
- Produces: `PhoneFrame` exported from `src/features/theme/admin/PhoneFrame.tsx` with the same props. `groupsFor(ev, hidden, badges: { attendees?: number }, admin)`: the `setup` badge is gone. `base(name, summary)` and `addon(name, summary, unlocks?)` lose their `setup` parameter (Task 2 rewrites them again).

- [ ] **Step 1: Update the tests to expect Setup gone**

In `tests/nav.test.ts`, replace the Setup assertions at lines 61–62 and 76 with:
```ts
it("has no Setup item (D783)", () => {
  const labels = groupsFor({ id: "e1", check_in_enabled: true }).flatMap((g) => g.items.map((i) => i.label));
  expect(labels).not.toContain("Setup");
});
```
In `tests/catalogue/catalogue.test.ts`, delete the test `"gives every setup item a unique key, and only sections as steps (D444)"`.

- [ ] **Step 2: Run them to see the nav test fail**

Run: `npx vitest run tests/nav.test.ts tests/catalogue`
Expected: FAIL in `has no Setup item (D783)`.

- [ ] **Step 3: Move `PhoneFrame` and point `ThemePreview` at it**

Use `git mv src/features/setup/preview/PhoneFrame.tsx src/features/theme/admin/PhoneFrame.tsx`. Then change ThemePreview's import to `./PhoneFrame`. Fix any relative imports inside the moved file.

- [ ] **Step 4: Delete the setup code and routes, and remove every reference**

Delete the files listed above. Remove `waitingCounts` from both layouts, `purgeSetupFiles` from `purgeEventAction`, and the `check:setup` script. In the purge description, drop the sentence "Files and notes the organiser sent through the setup link go too." The Custom modules description becomes: `Bespoke work sold with this event. Nothing in the admin depends on them.`

- [ ] **Step 5: Confirm nothing still imports setup**

Run: `git grep -n -e "features/setup" -e "waitingCounts" -e "purgeSetupFiles" -e "SetupItem" -- src tests scripts`
Expected: no output.

- [ ] **Step 6: Run the checks**

Run: `npx vitest run` then `npx tsc --noEmit` then `npm run lint` then `npm run build`
Expected: all pass. The build lists no `/setup` routes.

- [ ] **Step 7: Commit**

```bash
git add -A src tests scripts package.json
git commit -m "feat(setup): remove the Setup page and organiser setup link, code only (D783)"
```

---

### Task 2: Registry shape, options and the two new add-ons (D777)

**Files:**
- Modify: `src/features/catalogue/catalogue.ts`, `src/features/catalogue/features.ts`, `src/features/catalogue/client.ts` (export the new names), `src/app/admin/events/[id]/settings/page.tsx:12,106,150,174,620` (the rename only)
- Create: `src/features/catalogue/options.ts`
- Test: `tests/catalogue/catalogue.test.ts`, `tests/catalogue/options.test.ts` (new)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type Tier = "core" | "optional" | "experimental"`
  - `type Origin = { event?: string; date: string /* "YYYY-MM" */; decision?: string /* "D736" */ }`
  - `type Feature = { name; summary; tier: Tier; origin?: Origin; unlocks: Unlocks; options: readonly Option[] }`
  - `BASE_KEYS` → renamed `CORE_KEYS` (same 10 keys); `ADDON_KEYS` gains `"language", "popups"` (inserted before `"custom"`).
  - `type NavKey = "whatsapp" | "activities" | "games" | "qualifier" | "popups"`
  - `type SettingsPartKey = "address" | "language" | "committee_alerts"`. `Unlocks.settingsTabs` is renamed to `settingsParts`.
  - `hiddenSettingsParts(fs: FeatureSet): SettingsPartKey[]` (replaces `hiddenSettingsTabs`).
  - In `options.ts`: `type Option = { key: string; name: string; summary: string; origin?: Origin; where: string; experimental?: true; inUse?: (u: EventUsage) => boolean }`. `EventUsage` is defined in Task 6's `usage.ts`; define it here as `{ ev: Event; activities: readonly Activity[] }` in `usage.ts`, so Task 6 only adds functions to the file.
  - `FEATURES[key].options` holds the options the spec lists under "New options", keyed in snake_case (`waiting_list`, `approval`, `self_cancel`, `event_terms`, `done_page`, `after_register_booking`, `registration_images`, `scheduled_open`, `tick_box_questions`, `badge_checkin`, `scan_card`, `door_survey`, `theme`, `name_line_breaks`, `coming_soon`, `me_page`, `badge_pins`, `preview_link`, `committee_logins`, `group_tile`, `all_groups`, `group_fields`, `verifiers`, `undo_revoke`, `partner_submissions`, `tracks`, `ad_hoc_points`, `tournaments`, `polaroid_print_look`, `committee_alerts`, `change_log`).
  - `inUse` is set only where one event column or activity field answers it: `waiting_list` (`ev.registration_limit != null`), `approval` (`ev.registration_needs_approval`), `self_cancel` (`ev.self_cancel`), `event_terms` (`!!ev.registration_terms`), `done_page` (`ev.registration_done_page`), `after_register_booking` (`!!ev.after_register_activity_id`), `badge_checkin` (`ev.check_in_enabled && ev.badge_checkin`), `coming_soon` (`!!ev.coming_soon_message`), `preview_link` (`!!ev.preview_token`), `all_groups` (`ev.all_groups`), `committee_alerts` (`ev.committee_alert_numbers.length > 0`), and `partner_submissions` (`activities.some((a) => a.allow_pair)`). Every other option has no `inUse`.
  - `language` unlocks `settingsParts: ["language"]`. `popups` unlocks `nav: ["popups"]`. `booking` additionally unlocks `settingsParts: ["committee_alerts"]`. `custom_domain` unlocks `settingsParts: ["address"]`.
  - Origins: `language` `{ event: "MYBESTME", date: "2026-10", decision: "D736" }`, `popups` `{ event: "MYBESTME", date: "2026-10", decision: "D751" }`, `typing_qualifier` `{ date: "2026-10", decision: "D767" }` (the builder reads its spec for the client). Each option's origin uses the D-number the spec gives it and the month that decision shipped. The original features carry no origin.

- [ ] **Step 1: Write the failing tests**

In `tests/catalogue/catalogue.test.ts`, update the existing tests to the new names and add:
```ts
it("gives core keys tier core and add-ons optional or experimental (D777)", () => {
  for (const k of CORE_KEYS) expect(FEATURES[k].tier).toBe("core");
  for (const k of ADDON_KEYS) expect(["optional", "experimental"]).toContain(FEATURES[k].tier);
  expect(FEATURES.language.tier).toBe("experimental");
  expect(FEATURES.popups.tier).toBe("experimental");
});
it("stores language and popups (D777)", () => {
  expect(STORED_ADDONS).toEqual(["whatsapp", "booking", "engagement", "live_games", "lucky_draw", "custom_domain", "slido", "typing_qualifier", "language", "popups"]);
});
it("hides Popups without the add-on", () => {
  expect(hiddenNav(none)).toContain("popups");
  expect(hiddenNav(featureSet(["popups"], 0))).not.toContain("popups");
});
it("hides the language, alerts and address parts without their add-ons", () => {
  expect(hiddenSettingsParts(none)).toEqual(["address", "language", "committee_alerts"]);
  expect(hiddenSettingsParts(featureSet(["booking", "language"], 0))).toEqual(["address"]);
});
it("names Settings → What's on in the not-in-event line", () => {
  expect(notPartOf("popups")).toBe("Portal popups isn't part of this event. Turn it on in Settings → What's on.");
});
```
In a new `tests/catalogue/options.test.ts`:
```ts
it("gives every option a key unique across the registry", () => { /* flatMap options → keys; Set size === length */ });
it("dates every origin as YYYY-MM and every decision as D<number>", () => { /* every feature and option origin matches /^\d{4}-\d{2}$/ and /^D\d+$/ */ });
it("says where every option is set", () => { /* every option.where is non-empty */ });
it("answers inUse from the event", () => {
  const ev = { ...fixtureEvent, registration_limit: 50, registration_needs_approval: false };
  expect(option("waiting_list").inUse!({ ev, activities: [] })).toBe(true);
  expect(option("approval").inUse!({ ev, activities: [] })).toBe(false);
  expect(option("partner_submissions").inUse!({ ev, activities: [{ ...fixtureActivity, allow_pair: true }] })).toBe(true);
});
```
`option(key)` is a small lookup helper in the test. `fixtureEvent` and `fixtureActivity` come from whatever event and activity fixtures existing tests use (search `tests/` for one before writing a new one).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/catalogue`
Expected: FAIL (missing exports `CORE_KEYS`, `hiddenSettingsParts`, `options.ts`).

- [ ] **Step 3: Implement the registry changes**

Write the code in `catalogue.ts`, `options.ts`, `features.ts` and `usage.ts` (types only) as described in Interfaces. `has()` checks `tier === "core"`. `hiddenSettingsParts` returns the parts in the order `address, language, committee_alerts` that no on add-on unlocks. In the settings page, rename the `hiddenSettingsTabs` call to `hiddenSettingsParts`; the Address check keeps working unchanged.

- [ ] **Step 4: Run the checks**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: PASS. (`STORED_ADDONS` now includes keys the database check refuses, but nothing writes them until Task 3 applies 0118.)

- [ ] **Step 5: Commit**

```bash
git add src/features/catalogue tests/catalogue "src/app/admin/events/[id]/settings/page.tsx"
git commit -m "feat(registry): tiers, origins, options, and the language and popups add-ons (D777)"
```

---

### Task 3: Migration 0118 and the guards for the new add-ons (D777)

**Files:**
- Create: `supabase/migrations/0118_feature_registry.sql`
- Modify: `src/app/admin/events/[id]/popups/page.tsx`, `src/features/popups/admin/actions.ts` (every exported action)
- Modify: `scripts/catalogue-db-check.mjs`, if it lists the allowed keys (read it first)

**Interfaces:**
- Consumes: `NotInEvent`, `requireFeature(eventId, key, back)`, `eventFeatures`, and `has` from `@/features/catalogue`; `"popups"` and `"language"` from Task 2.

- [ ] **Step 1: Write migration 0118**

Follow 0117 lines 33–58: set the lock timeout, drop and re-add `event_features_feature_check` with the ten keys (`'whatsapp', 'booking', 'engagement', 'live_games', 'lucky_draw', 'custom_domain', 'slido', 'typing_qualifier', 'language', 'popups'`), and keep the "exactly one check" guard with the message prefix `0118:`. Then backfill with `on conflict do nothing`:
```sql
insert into public.event_features (event_id, feature)
  select id, 'language' from public.events where language_switch
  on conflict do nothing;
insert into public.event_features (event_id, feature)
  select distinct event_id, 'popups' from public.portal_popups
  on conflict do nothing;
```

- [ ] **Step 2: Guard the Popups page and actions**

In the route page, before rendering `PopupsPage`: `requireEventAccess`, then `if (!has(await eventFeatures(ev.id), "popups")) return <NotInEvent eventId={ev.id} title="Popups" keys={["popups"]} back={`/admin/events/${ev.id}/popups`} canTurnOn={actor.kind === "admin"} />`. This is the same shape as `whatsapp/page.tsx:32`. At the top of each popups action, after `requireEventAccess`, add `await requireFeature(ev.id, "popups", back(ev.id))`.

- [ ] **Step 3: Apply 0118 to the database**

Apply the migration with the Supabase MCP `apply_migration` tool, name `0118_feature_registry`, using the file's contents.

- [ ] **Step 4: Check the backfill**

Run with `execute_sql`:
```sql
select (select count(*) from events where language_switch) as lang_events,
       (select count(*) from event_features where feature = 'language') as lang_rows,
       (select count(distinct event_id) from portal_popups) as popup_events,
       (select count(*) from event_features where feature = 'popups') as popup_rows;
```
Expected: `lang_events = lang_rows` and `popup_events = popup_rows`.

- [ ] **Step 5: Run the checks**

Run: `npx vitest run` then `npx tsc --noEmit` then `npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0118_feature_registry.sql "src/app/admin/events/[id]/popups/page.tsx" src/features/popups/admin/actions.ts scripts
git commit -m "feat(registry): language and popups add-ons stored and backfilled, Popups guarded (D777, 0118)"
```

---

### Task 4: Each settings tab saves only itself, server side (D778)

**Files:**
- Create: `src/lib/settings-form.ts`
- Modify: `src/app/admin/events/[id]/actions.ts:74-150` (replace `updateSettingsAction`)
- Test: `tests/settings-form.test.ts` (new)

**Interfaces:**
- Produces, in `src/lib/settings-form.ts`:
  - `EVENT_TAB_COLUMNS = ["name", "display_name", "display_name_in_bar", "venue_name", "starts_on", "ends_on", "coming_soon_message"] as const`
  - `PORTAL_LOOK_COLUMNS = ["logo_url", "banner_url", "primary_color", "theme", "language_switch"] as const`
  - `REGISTRATION_COLUMNS = ["registration_open", "registration_closes_at", "self_cancel", "self_cancel_closes_at", "registration_limit", "registration_needs_approval", "registration_intro", "registration_terms", "registration_done_title", "registration_done_message", "registration_done_page", "registration_full_title", "registration_full_message", "registration_waiting_title", "registration_waiting_message", "registration_pending_title", "registration_pending_message", "registration_banner_url", "registration_footer_url", "registration_questions"] as const`
  - `eventTabPatch(fd: FormData, ev: Event): Pick<Event, typeof EVENT_TAB_COLUMNS[number]>`
  - `portalLookPatch(fd: FormData, ev: Event, images: { logo_url: string | null; banner_url: string | null }, languageOn: boolean)`: returns the five columns. When `languageOn` is false, `language_switch` is `ev.language_switch ?? false` (unchanged).
  - `registrationPatch(fd: FormData, ev: Event, images: { registration_banner_url: string | null; registration_footer_url: string | null })`: returns the 20 columns. It throws `Error` with the existing messages for a bad question form or a bad limit (`"Limit registrations to a whole number above 0, or leave it blank for no limit."`).
- Produces, in `actions.ts`: `updateEventTabAction(eventId: string, fd: FormData)`, `updatePortalLookAction(eventId: string, fd: FormData)`, `updateRegistrationAction(eventId: string, fd: FormData)`. Each uses `requireEventAccess`, as `updateSettingsAction` did.

- [ ] **Step 1: Write the failing tests**

```ts
it("splits the old settings columns into three disjoint tabs (D778)", () => {
  const all = [...EVENT_TAB_COLUMNS, ...PORTAL_LOOK_COLUMNS, ...REGISTRATION_COLUMNS];
  expect(new Set(all).size).toBe(all.length);
  expect(all).toHaveLength(32);
});
it("eventTabPatch returns exactly the Event columns", () => {
  expect(Object.keys(eventTabPatch(fdWith({ name: "KOM" }), ev)).sort()).toEqual([...EVENT_TAB_COLUMNS].sort());
});
it("portalLookPatch returns exactly the Portal look columns", () => { /* same shape */ });
it("portalLookPatch keeps language_switch when the add-on is off", () => {
  const p = portalLookPatch(fdWith({}), { ...ev, language_switch: true }, imgs, false);
  expect(p.language_switch).toBe(true);
});
it("portalLookPatch reads language_switch when the add-on is on", () => {
  expect(portalLookPatch(fdWith({}), { ...ev, language_switch: true }, imgs, true).language_switch).toBe(false);
});
it("registrationPatch returns exactly the Registration columns", () => { /* with a valid standard question form */ });
it("registrationPatch refuses a bad limit", () => {
  expect(() => registrationPatch(fdWith({ ...validForm, registration_limit: "0" }), ev, regImgs)).toThrow("Limit registrations to a whole number above 0");
});
```
`fdWith` builds a `FormData` from an object. `validForm` is the four standard questions in the field names `questionsFromForm` reads (copy them from an existing registration-form test).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/settings-form.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the patch functions**

Move the field-reading out of `updateSettingsAction` (lines 76–144) into the three functions, unchanged. The `str` helper moves with them. `primary_color` keeps its `"#F97316"` fallback.

- [ ] **Step 4: Replace `updateSettingsAction` with the three actions**

Keep the existing order in each action: validate (call the patch first, catching its error into `redirect(flashPath(path, message, "error"))`), upload images (`nextImage`), `updateEvent(eventId, patch)`, delete stale images. Only `updateRegistrationAction` calls `afterPlacesChange`. Only `updatePortalLookAction` reads `has(await eventFeatures(eventId), "language")`. The flash messages are `Event saved.`, `Portal look saved.` and `Registration saved.` (plus `moved` for Registration). Every redirect goes to `/admin/events/${eventId}/settings`.

- [ ] **Step 5: Keep the current page working until Task 5**

The settings page still posts one form to `updateSettingsAction`. Keep that action as a thin wrapper that runs all three patches and writes them in one `updateEvent`, marked `/** D778: removed in Task 5. */`.

- [ ] **Step 6: Run the checks**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/settings-form.ts tests/settings-form.test.ts "src/app/admin/events/[id]/actions.ts"
git commit -m "feat(settings): one save action per tab, each writing only its own columns (D778)"
```

---

### Task 5: Settings tabs regrouped by feature (D778)

**Files:**
- Create: `src/app/admin/events/[id]/settings/tabs.ts`, `src/app/admin/events/[id]/settings/tabs/{EventTab,PortalLookTab,RegistrationTab,CheckInTab,CommitteeTab,DangerTab}.tsx`, `src/components/admin/UnsavedGuard.tsx` (client)
- Modify: `src/app/admin/events/[id]/settings/page.tsx` (it becomes the tab list plus data loading), `src/features/theme/admin/ThemeCard.tsx:57` (the comment says "Settings → Portal look")
- Test: `tests/settings-tabs.test.ts` (new), `tests/remembered-tab.test.ts`

**Interfaces:**
- Consumes: the three actions from Task 4; `hiddenSettingsParts` and `activityKindsFor` from Task 2.
- Produces: `type SettingsTab = "whats-on" | "event" | "look" | "registration" | "checkin" | "committee" | "verification" | "address" | "danger"`. Also `settingsTabs(o: { admin: boolean; hidden: readonly SettingsPartKey[]; verifying: boolean }): SettingsTab[]`, which returns tabs in that order with admin-only ones (`whats-on, committee, verification, address, danger`) dropped for committee members, `address` dropped when hidden, and `verification` dropped unless `verifying`.

- [ ] **Step 1: Write the failing tests**

```ts
it("shows an admin every tab in order", () => {
  expect(settingsTabs({ admin: true, hidden: [], verifying: true })).toEqual(["whats-on", "event", "look", "registration", "checkin", "committee", "verification", "address", "danger"]);
});
it("shows a committee member only their four tabs", () => {
  expect(settingsTabs({ admin: false, hidden: [], verifying: true })).toEqual(["event", "look", "registration", "checkin"]);
});
it("drops Address and Verification when the event has neither", () => {
  const tabs = settingsTabs({ admin: true, hidden: ["address"], verifying: false });
  expect(tabs).not.toContain("address");
  expect(tabs).not.toContain("verification");
});
it("opens on nothing remembered for an old tab key, so the page falls back to Event", () => {
  for (const old of ["details", "me", "alerts", "features", "checkpoints"]) {
    expect(rememberedTab(jarWith(old), "settings:e1", settingsTabs({ admin: true, hidden: [], verifying: true }))).toBeNull();
  }
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/settings-tabs.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `settingsTabs`, then split the page into tab components**

The tab labels are What's on, Event, Portal look, Registration, Check-in, Committee, Verification, Address and Danger zone. The contents follow the spec's table:
- **Event**: the Event `Section` (no Portal language), Status with the preview link, and Share links.
- **Portal look**: Branding and images, `ThemeCard`, Portal language (only when `language` isn't hidden), Pinned on the badge, and the Me page card with its own form, unchanged.
- **Committee**: `CommitteeTab`, plus the Committee alerts card when `committee_alerts` isn't hidden.
- **What's on**: renders the existing `FeaturesTab` until Task 6 replaces it.

Event, Portal look and Registration are each their own `<form action={…}>`, keyed with `formKey` over that tab's columns only, ending with `<SaveBar label="Save" note="Saves this tab." />`. Status, the pins and the Me page stay outside those forms. Pass `keepMounted` to the three form tabs' `TabsContent`. The default tab is `"event"`. Remove `SAVE_NOTE`, the shared `formKey` across every field, and the `updateSettingsAction` wrapper from Task 4.

- [ ] **Step 4: Add `UnsavedGuard` (Review Focus 1)**

This is a client component rendered once inside `RememberedTabs`. It marks a form dirty on its first `input` event. On `submit` of one tab's form while another tab's form is dirty, it calls `window.confirm("You have unsaved changes on <Tab>. Save anyway and lose them?")` and cancels the submit if the user says no. Each form carries `data-tab-label="<Tab>"` so it can name the tab.

- [ ] **Step 5: Run the checks**

Run: `npx vitest run` then `npx tsc --noEmit` then `npm run lint` then `npm run build`
Expected: PASS.

- [ ] **Step 6: Check it in the browser on a test event (not `ecphub`)**

Start the dev server with `preview_start`, open a test event's Settings, and check each of these:
- Each tab shows its contents.
- Saving Portal look doesn't change a Registration field you typed but didn't save, and the guard asks first.
- Saving Registration with limit `0` shows the limit error.
- A committee member sees four tabs.

Take a screenshot of the new tab bar.

- [ ] **Step 7: Commit**

```bash
git add "src/app/admin/events/[id]/settings" src/components/admin/UnsavedGuard.tsx src/features/theme/admin/ThemeCard.tsx tests/settings-tabs.test.ts "src/app/admin/events/[id]/actions.ts"
git commit -m "feat(settings): tabs by feature, each saving itself, with an unsaved-changes guard (D778)"
```

---

### Task 6: What's on (D779)

**Files:**
- Create: `src/features/catalogue/admin/WhatsOnTab.tsx` (replaces `FeaturesTab.tsx`; delete the old file)
- Modify: `src/features/catalogue/usage.ts`, `src/features/catalogue/db.ts`, `src/features/catalogue/index.ts`, `src/app/admin/events/[id]/settings/page.tsx` (render `WhatsOnTab`)
- Test: `tests/catalogue/usage.test.ts` (new)

**Interfaces:**
- Consumes: `FEATURES`, `Option`, `EventUsage`, `has`.
- Produces:
  - `optionsInUse(u: EventUsage): Set<string>`: the keys of options whose `inUse` is true.
  - `eventUsage(eventId: string): Promise<EventUsage>` in `db.ts`. It loads the event and `listActivities(eventId)` and is wrapped in `cache`.

- [ ] **Step 1: Write the failing test**

```ts
it("lists the options an event is using, and only checkable ones", () => {
  const used = optionsInUse({ ev: { ...fixtureEvent, self_cancel: true, registration_limit: null }, activities: [] });
  expect(used.has("self_cancel")).toBe(true);
  expect(used.has("waiting_list")).toBe(false);
  expect(used.has("theme")).toBe(false); // no inUse check
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/catalogue/usage.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `optionsInUse` and `eventUsage`, then build `WhatsOnTab`**

`WhatsOnTab({ eventId })` has three cards:
1. **On for this event**: every feature `has()` says is on, core first in `CORE_KEYS` order, then add-ons in `ADDON_KEYS` order. Each row shows the name and summary, an `Experimental` badge when the tier says so, and the turn-off control for stored add-ons (moved from `FeaturesTab`, with `offMessage` unchanged). Under each row, list its options: the name, `In use` for options in `optionsInUse`, and `where` in muted text.
2. **Available**: stored add-ons that are off, each with Turn on (as now).
3. **Custom modules**: moved unchanged.

- [ ] **Step 4: Run the checks**

Run: `npx vitest run` then `npx tsc --noEmit` then `npm run lint`
Expected: PASS.

- [ ] **Step 5: Check it in the browser on a test event and take a screenshot**

On a test event with self-cancel on, What's on lists Self-registration with "Attendee self-cancel · In use".

- [ ] **Step 6: Commit**

```bash
git add src/features/catalogue tests/catalogue "src/app/admin/events/[id]/settings/page.tsx"
git commit -m "feat(registry): What's on tab with the options each event uses (D779)"
```

---

### Task 7: The all-events feature page and quarterly review (D780, D782)

**Files:**
- Create: `src/features/catalogue/review.ts`, `src/features/catalogue/admin/FeaturesPage.tsx`, `src/app/admin/features/layout.tsx` (a copy of `events/(list)/layout.tsx`), `src/app/admin/features/page.tsx`, `src/app/admin/features/loading.tsx`
- Modify: `src/features/catalogue/db.ts`, `src/components/admin/nav.ts` (the no-event branch), `src/app/admin/events/(list)/layout.tsx` (pass `admin` to `AppSidebar`, if it doesn't already)
- Test: `tests/catalogue/review.test.ts` (new), `tests/nav.test.ts`

**Interfaces:**
- Consumes: `FEATURES`, `Option`, `EventUsage`, `optionsInUse`, `has`, `featureSet`.
- Produces:
  - `type UsageRow = { eventId: string; eventName: string; status: EventStatus; startsOn: string | null; features: FeatureSet; options: Set<string> }`
  - `allEventsUsage(orgId: string): Promise<UsageRow[]>`. It reads every event of the org, their `event_features` rows, their custom module counts and their activities. Use a few batched queries, not one per event.
  - `type ReviewEntry = { key: string; name: string; parent?: FeatureKey; experimental: boolean; origin: Origin; users: UsageRow[] }`
  - `reviewFlags(entries: ReviewEntry[], today: string /* YYYY-MM-DD */): { entry: ReviewEntry; oneClient: boolean; goneQuiet: boolean }[]`, keeping only entries with at least one flag. `oneClient = experimental && users.length <= 1`. `goneQuiet = origin is more than 3 months before today && no user has startsOn within the last 3 months`. Treat `origin.date` "YYYY-MM" as the first of that month.
  - `groupsFor(null, …, admin)`: the Events group gains `{ href: "/admin/features", label: "Features", icon: "layers", adminOnly: true }` after All events, with the admin filter applied in that branch too.

- [ ] **Step 1: Write the failing tests**

```ts
const e = (over: Partial<ReviewEntry>): ReviewEntry => ({ key: "k", name: "K", experimental: false, origin: { date: "2026-06" }, users: [], ...over });
const u = (startsOn: string | null): UsageRow => ({ eventId: startsOn ?? "x", eventName: "E", status: "live", startsOn, features: featureSet([], 0), options: new Set() });
it("flags an experimental entry used by one event or none as one client only", () => {
  expect(reviewFlags([e({ experimental: true, users: [u("2026-10-20")] })], "2026-11-01")[0].oneClient).toBe(true);
  expect(reviewFlags([e({ experimental: true, users: [u("2026-10-20"), u("2026-10-25")] })], "2026-11-01")).toEqual([]);
});
it("flags an entry older than three months that no recent event uses as gone quiet", () => {
  expect(reviewFlags([e({ origin: { date: "2026-06" }, users: [u("2026-05-10"), u("2026-05-20")] })], "2026-11-01")[0].goneQuiet).toBe(true);
});
it("never flags an entry younger than three months for going quiet", () => {
  expect(reviewFlags([e({ origin: { date: "2026-09" }, users: [] })], "2026-11-01")).toEqual([]);
});
it("judges recency by event dates, ignoring events with no start date", () => {
  expect(reviewFlags([e({ origin: { date: "2026-06" }, users: [u(null), u(null)] })], "2026-11-01")[0].goneQuiet).toBe(true);
});
```
In `tests/nav.test.ts`, add `it("shows Features to admins only on the events list")`, asserting the item is present with `admin = true` and absent with `false`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/catalogue/review.test.ts tests/nav.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `reviewFlags`, `allEventsUsage` and the nav item**

- [ ] **Step 4: Build the page**

`page.tsx` calls `requireOrgAdmin()`, then renders `<FeaturesPage orgId={orgId} />`. `FeaturesPage` uses `AdminHeader` with the title "Features" and has two tabs:
- **All features**: one card per feature in registry order. Each card shows the tier, summary and origin, then "On for N events · latest: <event name> (<status>)" for add-ons, or "Every event" for core features. Each option is a row with its summary, `where`, origin, and "Used by N events" when it has `inUse`.
- **Review**: `reviewFlags` over every add-on and option that has an `origin`, with the flags as badges ("One client only", "Gone quiet") and the events using each one, with their status. When nothing is flagged, show an empty state reading "Nothing to review."

- [ ] **Step 5: Run the checks**

Run: `npx vitest run` then `npx tsc --noEmit` then `npm run lint` then `npm run build`
Expected: PASS.

- [ ] **Step 6: Check it in the browser and take a screenshot**

As an admin, open `/admin/features`: both tabs render, and the language and popups add-ons show their MYBESTME origin. As a committee member, the sidebar has no Features item and the URL refuses.

- [ ] **Step 7: Commit**

```bash
git add src/features/catalogue src/app/admin/features src/components/admin/nav.ts "src/app/admin/events/(list)/layout.tsx" tests
git commit -m "feat(registry): all-events Features page with the quarterly review list (D780, D782)"
```

---

### Task 8: Drop the setup data, migration 0119 (D783)

Runs only after Task 1 is deployed: no deployed code may still read the setup tables.

**Files:**
- Create: `supabase/migrations/0119_drop_setup.sql`
- Modify: `src/lib/types.ts:136-137` (remove `setup_token` and its comment), plus any fixture that sets `setup_token`

- [ ] **Step 1: Stop and confirm Task 1 is live**

Ask the user whether the Task 1 commit is pushed and deployed. Do not continue until they say yes.

- [ ] **Step 2: Count what would be deleted, per event**

Run with `execute_sql`:
```sql
select e.name, e.status,
  (select count(*) from event_setup_sections s where s.event_id = e.id) as sections,
  (select count(*) from event_setup_items i where i.event_id = e.id) as items,
  (select count(*) from event_setup_files f where f.event_id = e.id) as files,
  (e.setup_token is not null) as link_on
from events e
where exists (select 1 from event_setup_sections s where s.event_id = e.id)
   or exists (select 1 from event_setup_items i where i.event_id = e.id)
   or exists (select 1 from event_setup_files f where f.event_id = e.id)
   or e.setup_token is not null
order by e.name;
```
Also count the objects in the `setup-files` bucket: `select count(*) from storage.objects where bucket_id = 'setup-files';`. Adjust the column names to the real ones in 0071 and 0073 if they differ.

- [ ] **Step 3: Show the user the list and wait**

Present the table. Ask the user to confirm the deletion, or to name the files to download first. Do not continue until they confirm.

- [ ] **Step 4: Write 0119**

Set `lock_timeout` to 5 s, then:
- `drop function if exists setup_apply_agenda(uuid, jsonb, jsonb, timestamptz, jsonb);`
- Drop any other function, policy or trigger that 0071–0074 created. Read those files and list each drop explicitly.
- `drop table if exists public.event_setup_files, public.event_setup_items, public.event_setup_sections;`
- `alter table public.events drop column if exists setup_token;`

Storage objects are removed through the storage API, not SQL. In the next step, delete them with a one-off script in the scratchpad (not the repo) that lists the `setup-files` bucket and removes every object using the service role, then delete the bucket.

- [ ] **Step 5: Apply 0119, then empty and delete the bucket**

Apply with `apply_migration`, name `0119_drop_setup`. Run the storage script.

- [ ] **Step 6: Check it**

Run with `execute_sql`:
```sql
select to_regclass('public.event_setup_sections'), to_regclass('public.event_setup_items'), to_regclass('public.event_setup_files');
select count(*) from information_schema.columns where table_name = 'events' and column_name = 'setup_token';
select count(*) from storage.buckets where id = 'setup-files';
```
Expected: three nulls, `0`, `0`.

- [ ] **Step 7: Remove `setup_token` from the types, and run the checks**

Run: `npx vitest run` then `npx tsc --noEmit` then `npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0119_drop_setup.sql src/lib/types.ts tests
git commit -m "feat(setup): drop the setup tables, link column and files (D783, 0119)"
```
