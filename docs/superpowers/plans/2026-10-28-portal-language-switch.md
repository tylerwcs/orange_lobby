# Portal Language Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an event turn on an EN | BM switch so its attendee portal's own wording can be read in Bahasa Malaysia, live on MYBESTME (`zp-my-best-me`) before 1 Nov 2026.

**Architecture:** A new feature folder `src/features/language/` holds two typed dictionaries (`en.ts` source of truth, `ms.ts` checked against it by `tsc`), a pure `resolveLang`, a server `portalLang(event)` reading a `portal_lang` cookie plus the event's new `language_switch` column, and a client `LangProvider`/`useT` mounted by `PortalChrome`. Server components and server actions call `portalLang` + `t(lang)` themselves. Date helpers in `src/lib/text.ts` gain an optional `lang` argument.

**Tech Stack:** Next.js App Router (this repo's version — read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md` before writing the cookie code), React server/client components, Supabase Postgres migrations, Vitest (`npm test`), TypeScript (`npx tsc --noEmit`).

**Spec:** `docs/superpowers/specs/2026-10-28-portal-language-switch-design.md`

## Global Constraints

- Languages: `en` and `ms` only. Default `en`.
- Malay in force only when `events.language_switch` is true **and** the `portal_lang` cookie is exactly `ms`.
- Cookie: name `portal_lang`, values `en` | `ms`, path `/`, max-age one year (31536000), `SameSite=Lax`.
- Migration `supabase/migrations/0111_language_switch.sql`: `alter table public.events add column if not exists language_switch boolean not null default false;`
- Never translate organiser-typed text: event name, `info_page_title`, Info tabs, activity names/descriptions, survey questions/options, announcements, agenda items, session locations, attendee names.
- No URL changes: no `/ms/` segment, no query parameter, no redirect.
- Events with the switch off must render byte-for-byte the same wording as today; every new `lang` parameter defaults to `"en"`.
- Switcher label **EN | BM**; full name "Bahasa Malaysia"; `aria-label` "Language / Bahasa".
- Malay month names: Jan Feb Mac Apr Mei Jun Jul Ogo Sep Okt Nov Dis. Weekdays (Sun→Sat): Ahd Isn Sel Rab Kha Jum Sab. Times stay 24-hour.
- When Malay is in force the portal's outer wrapper carries `lang="ms"`; root `<html lang="en">` is unchanged.
- No i18n library; no new dependencies.
- Out of scope (stay English): ConsentGate, `/register/**`, WhatsApp, admin/committee/verifier/crew screens, and portal sections MYBESTME doesn't use (games/play, groups, tournaments, tracks, polaroid, stamps, seat, queue card, cancelled card, self-cancel). The `.ics` file body carries only organiser-typed text, so it needs no change. Its menu labels in `AddToCalendar` do.
- Decision numbers start at D736. Comments cite them the way the surrounding code does.
- Test only on `ecpkom` (test data). Never on `ecphub`. On `zp-my-best-me`, only flip the switch and look, read-only.

## Review Focus

1. **Switch off, cookie still `ms`**: an attendee who picked BM on MYBESTME and then opens another event, or MYBESTME after the switch is turned off, must see English. Pinned by `resolveLang` tests (Task 1).
2. **Garbage or missing cookie** (`"MS"`, `"fr"`, `""`, undefined): English. Pinned in Task 1.
3. **Organiser text inside a Malay sentence**: a function entry such as `booked(label)` must keep its argument verbatim, including digits like seat counts. Pinned by the dictionary placeholder test (Task 1, extended in Task 2).
4. **Saving Settings from another tab**: saving the Registration tab must not switch `language_switch` off. The checkbox goes in the keepMounted Details tab, and the value goes into the form's `formKey` list. Checked in the browser (Task 3).
5. **Admin and export dates unchanged**: every `text.ts` helper without `lang` returns exactly what it does today. Pinned by the existing `tests/text.test.ts` staying green, plus a default-argument assertion (Task 2).

---

### Task 1: Language core

**Files:**
- Create: `src/features/language/lang.ts`, which holds `type Lang`, `LANG_COOKIE`, `resolveLang` and is client-safe with no server imports
- Create: `src/features/language/en.ts`, which exports `const en` plus `type Dict = typeof en`. Start it with `common.languageLabel: "Language / Bahasa"`, `common.english: "English"` and `common.malay: "Bahasa Malaysia"`. Task 2 fills the rest.
- Create: `src/features/language/ms.ts`, which exports `const ms = { … } satisfies Dict`
- Create: `src/features/language/server.ts` with `portalLang`, `t`, and the server action `setLangAction`
- Create: `src/features/language/client.tsx` with `LangProvider`, `useT`, `useLang` (marked `"use client"`)
- Create: `src/features/language/index.ts`, which re-exports the server-safe surface the way other feature `index.ts` files do
- Test: `tests/language.test.ts`

**Interfaces:**
- Produces:
  - `type Lang = "en" | "ms"`
  - `const LANG_COOKIE = "portal_lang"`
  - `resolveLang(switchOn: boolean, cookie: string | undefined): Lang`
  - `portalLang(event: { language_switch?: boolean | null }): Promise<Lang>`, which reads `cookies()` and is wrapped in React `cache`
  - `t(lang: Lang): Dict`
  - `setLangAction(lang: Lang): Promise<void>`. A server action that only sets the cookie, and ignores anything other than `"en"`/`"ms"`. `LangSwitch` calls `router.refresh()` after it.
  - `LangProvider({ lang, children })`, `useT(): Dict`, `useLang(): Lang`. The provider takes only `lang` and picks the dictionary itself, so both dictionaries are bundled. They're a few KB, which is acceptable. If size matters, pass `dict` instead and note the call.

- [ ] **Step 1: Write the failing tests** in `tests/language.test.ts`
  - `resolveLang(true, "ms")` → `"ms"`. `resolveLang(false, "ms")` → `"en"`. `resolveLang(true, "en")` → `"en"`. `resolveLang(true, undefined)`, `resolveLang(true, "MS")`, `resolveLang(true, "fr")` and `resolveLang(true, "")` all → `"en"`.
  - **Parity:** walk `en` and `ms` recursively. Every key path in one exists in the other, `typeof` matches at every leaf, and for function leaves `en.f.length === ms.f.length`.
  - **Placeholders:** for every function leaf, call both with sample args (strings `"«X0»"`, `"«X1»"`… and numbers `7`, `13`…, chosen by position from a per-key sample table or a default of strings) and assert each `ms` output contains every string arg verbatim, plus each number as a substring.
  - **No empty strings** anywhere in `ms`.
- [ ] **Step 2: Run** `npx vitest run tests/language.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `lang.ts`, `en.ts`/`ms.ts` (the three `common` keys only), `server.ts`, `client.tsx`, `index.ts`. `client.tsx` imports both dictionaries and `lang.ts` only, never `server.ts`.
- [ ] **Step 4: Run** `npx vitest run tests/language.test.ts && npx tsc --noEmit`. Expected: PASS, no type errors.
- [ ] **Step 5: Commit** `feat(language): portal language core - dictionaries, cookie, resolveLang (D736)`

### Task 2: Full dictionary and Malay dates (the day-one hand-over)

This task produces the file the user reviews. Do it before any screen conversion, so the review can run alongside Tasks 3–6.

**Files:**
- Modify: `src/features/language/en.ts`, `src/features/language/ms.ts`
- Modify: `src/lib/text.ts`, adding the Malay month and weekday arrays and the `lang` arguments
- Modify: `src/features/activities/lib/activity-card.ts` (`dayRange`) and `src/features/activities/lib/activities.ts` (`sessionLabel`, `sessionPlaceLabel`)
- Test: `tests/text.test.ts` (extend), `tests/language.test.ts` (sample table for new function keys)

**Interfaces:**
- Consumes: `Dict`, `Lang` (Task 1)
- Produces:
  - Dictionary namespaces: `common`, `nav`, `home`, `me`, `agenda`, `info`, `announcements`, `calendar` (AddToCalendar), `install` (AddToHomeScreen), `badge`, `activities` (list + shared parts), `booking` (screens + action messages), `submission` (screens + action messages + validation), `dates` (only if a date sentence is needed beyond the helpers)
  - `formatDateRange(starts, ends, lang: Lang = "en")`, `shortDate(d, lang = "en")`, `shortDateTime(iso, lang = "en")`
  - `dayRange(days: string[], lang: Lang = "en")`
  - `sessionLabel(s, { weekday = true, lang = "en" } = {})`, `sessionPlaceLabel(s, lang: Lang = "en")`

- [ ] **Step 1: Harvest.** Go through every file listed in Tasks 4–6 and its server actions, and copy each attendee-visible English string (including `sr-only`/`aria-label` text, empty states, refusal maps such as `REFUSALS`, `ASK_REFUSALS`, `ARCHIVED`, `SUBMIT_RESULT_MESSAGES`, `HEALTH_CONSENT_REFUSED`, the rate-limit line, `readAnswers`'s fallback, and the `validateAnswers` question errors) into `en.ts`, unchanged. Sentences with numbers, plurals or organiser names become functions, e.g. `booking.seatsLeft(left: number, sessions: number)` and `booking.booked(label: string)`. Keep the existing English plural logic inside the `en` function. Add a sample-args row in the test for each function key whose args aren't all strings.
- [ ] **Step 2: Write `ms.ts`** to the same shape: Bahasa Malaysia app style, "anda" form, standard terms (Tempah, Hantar, Batal, Sesi, Tambah ke kalendar, Laman Utama, Agenda, Aktiviti, Saya for Me). Malay has no plural `s`, so its functions ignore plural branches. Organiser names stay as arguments, never translated.
- [ ] **Step 3: Write failing date tests** in `tests/text.test.ts`:
  - `formatDateRange("2026-11-01", "2026-11-30", "ms")` → `"1 Nov – 30 Nov 2026"`
  - `formatDateRange("2026-12-31", "2026-12-31", "ms")` → `"31 Dis 2026"`
  - `shortDate("2026-11-01", "ms")` → `"Ahd 1 Nov"`. `shortDate("2026-08-05", "ms")` → `"Rab 5 Ogo"`. `shortDate("2026-03-02", "ms")` → `"Isn 2 Mac"`.
  - `shortDateTime("2026-08-08T09:13:00Z", "ms")` → `"8 Ogo, 17:13"`
  - `shortDate("2026-09-30")` still → `"Wed 30 Sep"` (default unchanged)
  - In `tests/activities/` (the file that already covers `dayRange`/`sessionLabel`, or a new `tests/activities/lang-labels.test.ts`):
    - `dayRange(["2026-11-01", "2026-11-03"], "ms")` → `"1 – 3 Nov"`
    - `sessionLabel({ day: "2026-11-01", starts_at: "09:00" }, { lang: "ms" })` → `"Ahd 1 Nov · 09:00"`
- [ ] **Step 4: Run** `npx vitest run tests/text.test.ts tests/activities`. Expected: FAIL on the new `ms` cases.
- [ ] **Step 5: Implement** the `lang` arguments. `dayRange` must split on the localised `shortDate` the same way it does today.
- [ ] **Step 6: Run** `npm test && npx tsc --noEmit`. Expected: all pass.
- [ ] **Step 7: Commit** `feat(language): English and Bahasa Malaysia wording for the portal, Malay dates (D737)`, then **send the user `src/features/language/ms.ts` to read over** (SendUserFile, attach). Carry on without waiting.

### Task 3: The setting

**Files:**
- Create: `supabase/migrations/0111_language_switch.sql`, with the SQL from Global Constraints and a D738 comment in the style of `0095_display_name_in_bar.sql`
- Modify: `src/lib/types.ts`, adding `language_switch?: boolean` next to `display_name_in_bar`
- Modify: `src/app/admin/events/[id]/actions.ts`, adding `language_switch: formData.get("language_switch") === "on", // D738` beside line 108
- Modify: `src/app/admin/events/[id]/settings/page.tsx`. Add `ev.language_switch` to the `formKey([...])` list on line 320. Add a `<Section title="Portal language" hint="Only the app's own wording changes. Anything you type for the event shows as you typed it.">` inside the Details tab with one checkbox labelled "Let attendees switch the portal to Bahasa Malaysia", following the `display_name_in_bar` checkbox markup.

- [ ] **Step 1: Apply the migration** to project `wfmqwwcolfigjylkgrsv` with the Supabase `apply_migration` tool (name `0111_language_switch`). Verify with `select language_switch from events limit 1;`, which returns `false`.
- [ ] **Step 2: Make the code changes** above. Run `npx tsc --noEmit`. Expected: clean.
- [ ] **Step 3: Browser check on `ecpkom`.** In Settings → Event details, tick the box and save, and it stays ticked after the reload. Switch to Registration form, save, come back, and it's still ticked (Review Focus 4). Leave it **on** for `ecpkom`, for Tasks 4–6.
- [ ] **Step 4: Commit** `feat(settings): per-event portal language switch (D738, 0111)`

### Task 4: Switcher, chrome, home and Me

**Files:**
- Create: `src/features/language/LangSwitch.tsx` (client). It's a two-segment toggle, **EN | BM**, with the current one highlighted (`aria-pressed`), `aria-label` "Language / Bahasa", and 44px tap targets. It calls `setLangAction` and refreshes in a transition, then the page re-renders in place.
- Modify: `src/components/portal/PortalChrome.tsx`. Add props `lang: Lang` and `languageSwitch: boolean`. Wrap the output in `<LangProvider lang={lang}>`, and set `lang={lang === "ms" ? "ms" : undefined}` on its outermost element. Translate `nav` labels (keep `infoLabel` as typed), the Me button's `aria-label`, `Owed`'s sr-only text and any other words. Render `<LangSwitch>` when `languageSwitch` is true, left of `MeButton` on the phone home header and at the right end of the desktop links.
- Modify: `src/components/portal/PortalHeader.tsx`, `PortalTabStrip.tsx`, `HomeLink.tsx`, `LauncherGrid.tsx`, `PortalShell.tsx` (pass `lang` + `languageSwitch` through from `portalLang(event)`), `PortalShellSkeleton.tsx` (English is fine because the cookie isn't read in a skeleton, but drop words from it if it has any)
- Modify: `src/lib/launcher.ts` and `src/lib/portal-nav.ts`, if they produce visible labels, adding a `lang` parameter that defaults to `"en"`
- Modify: `src/app/e/[slug]/(portal)/a/[token]/layout.tsx`. Compute `const lang = await portalLang(event)` and pass `lang` and `languageSwitch={!!event.language_switch}` to `PortalChrome`. Add `language_switch` to `chromeEvent` only if PortalChrome reads it from there, and keep the `ChromeEvent` Pick in sync.
- Modify: `src/app/e/[slug]/(portal)/a/[token]/page.tsx` (personal home), `src/app/e/[slug]/(portal)/page.tsx` (public home), `src/app/e/[slug]/(portal)/a/[token]/me/page.tsx`. On the Me page, add a "Language · Bahasa" row with `<LangSwitch>`, only when the switch is on. The Privacy Notice link points to `/privacy/ms` when `lang === "ms"`.
- Modify: `src/components/portal/BadgeCard.tsx`, `BadgeQrDialog.tsx`, `AddToHomeScreen.tsx`, `PreviewBanner.tsx` (staff-only, so leave it English)
- Modify: `src/features/activities/portal/HomeActivities.tsx` (home activity cards)

- [ ] **Step 1: Convert** the files above. Server components use `t(await portalLang(event))`, and client components use `useT()`.
- [ ] **Step 2: Run** `npx tsc --noEmit && npm test`. Expected: clean.
- [ ] **Step 3: Browser check on `ecpkom`, phone size (375×812).** Open an attendee link. The switcher shows top right on home. Tap BM, and the nav, home cards and Me page read Malay, the URL is unchanged, and the outer wrapper has `lang="ms"`. Reload, and it's still Malay. Tap EN, and it's back to today's wording. Turn the `ecpkom` switch off in Settings, and the page reads English with no switcher, even though the cookie is still `ms`. Turn it back on. Check desktop width too.
- [ ] **Step 4: Commit** `feat(portal): EN | BM switcher, header, home and Me in Bahasa Malaysia (D739)`

### Task 5: Agenda, Info, announcements, calendar

**Files:**
- Modify: `src/components/portal/AgendaList.tsx`, `AgendaImage.tsx`, `InfoPage.tsx`, `RichSections.tsx` (words only, if any), `AnnouncementBanner.tsx`, `AnnouncementList.tsx`, `AddToCalendar.tsx`
- Modify: `src/app/e/[slug]/(portal)/a/[token]/agenda/page.tsx` + `loading.tsx`, `info/page.tsx`, `announcements/page.tsx`, and the public `src/app/e/[slug]/(portal)/agenda/page.tsx`, `info/page.tsx`, `announcements/page.tsx`
- Modify: any date call on these screens, so it passes `lang`

- [ ] **Step 1: Convert** them.
- [ ] **Step 2: Run** `npx tsc --noEmit && npm test`. Expected: clean.
- [ ] **Step 3: Browser check on `ecpkom` in BM.** Agenda day tabs and dates read Malay (e.g. "Ahd 1 Nov"). Info tab titles and content stay as typed. The Add to calendar menu reads Malay.
- [ ] **Step 4: Commit** `feat(portal): agenda, info and calendar wording in Bahasa Malaysia (D740)`

### Task 6: Activities, booking and survey, with their messages

**Files:**
- Modify: `src/app/e/[slug]/(portal)/a/[token]/activities/page.tsx`, `activities/[activityId]/page.tsx`
- Modify: `src/features/activities/portal/ActivitiesTab.tsx`, `ActivityPage.tsx`, `ActivityParts.tsx`, `ActivityActionDialog.tsx`, `detail-parts.tsx` (`forGroups`, `InfoRows`)
- Modify (booking): `src/features/activities/kinds/booking/BookingBody.tsx`, `ActivitySessions.tsx`, `ActivityBooking.tsx`, and `SessionDays.tsx` if the portal renders it
- Modify (survey): `src/features/activities/kinds/submission/SubmissionBody.tsx`, `SubmissionFields.tsx`, `EntryActions.tsx`, `SubmissionHistory.tsx` (if shown to attendees), `HealthConsentField.tsx` (MYBESTME has `health_data` off, but the parity rule says convert it if it's reachable on any switched-on event, which is the builder's call)
- Modify: `src/features/activities/portal/actions.ts`. Each action computes `const d = t(await portalLang(event))` after `loadPortalAttendee`, and replaces every literal and refusal map with `d.booking.*` / `d.submission.*`. `sessionLabel(...)` gets `{ lang }`.
- Modify: `src/lib/registration.ts`, giving `validateAnswers(..., lang: Lang = "en")` Malay question errors. Modify `src/features/activities/lib/submission-uploads.ts`, giving `readAnswers(activity, fd, lang: Lang = "en")` the fallback message and passing `lang` on to `validateAnswers`. Registration callers stay unchanged (default `en`).
- Modify: `src/lib/privacy.ts`. `HEALTH_CONSENT_REFUSED` stays exported for its other callers, and the portal actions use the dictionary's copy.
- Test: `tests/registration.test.ts` (or the file that covers `validateAnswers`)

- [ ] **Step 1: Write the failing test.** `validateAnswers` with a `select` question and the answer `"Maybe"` returns the error `"Choose one of the listed options"` by default, and the `ms` dictionary's `submission.chooseListed` when called with `"ms"`. Run it, and it should FAIL.
- [ ] **Step 2: Implement** the `lang` plumbing in `registration.ts` / `submission-uploads.ts`, and run the test until it PASSES.
- [ ] **Step 3: Convert** the components and actions.
- [ ] **Step 4: Run** `npx tsc --noEmit && npm test`. Expected: clean.
- [ ] **Step 5: Browser check on `ecpkom` in BM, phone size.** On the booking activity: book a session, check the toast reads Malay, change session, withdraw the request, and open Add to calendar. On a submission activity: submit with a required answer blank and check the error reads Malay, then submit properly, edit, save and delete, checking every toast is Malay. Repeat one booking and one submit in EN, and the wording matches today's.
- [ ] **Step 6: Commit** `feat(activities): booking and survey in Bahasa Malaysia, messages included (D741)`

### Task 7: Sweep, switch MYBESTME on, ship

- [ ] **Step 1: Sweep for leftover English.** Grep every file touched in Tasks 4–6 for JSX text (`>[A-Za-z]`) and for string literals starting with a capital letter followed by a space and a word. Then do a BM walk-through of each MYBESTME screen on `ecpkom` (home, Agenda, FAQ/Info, Activities, booking, survey, Me). Every English app word that's left either moves into the dictionary or is confirmed as organiser text.
- [ ] **Step 2: Run** `npm test && npx tsc --noEmit && npm run lint && npm run build`. Expected: all clean.
- [ ] **Step 3: Request code review** (superpowers:requesting-code-review) on the commits since the design commit, and fix what it confirms.
- [ ] **Step 4: Ask the user before pushing `main`.** After the push, confirm the Vercel deploy is live.
- [ ] **Step 5: Turn the switch on for `zp-my-best-me`** in Settings → Event details. This is the user's go-ahead from 28 Oct, before 1 Nov and whether or not the review is done. Open one MYBESTME attendee link read-only, and confirm that the switcher shows and BM reads Malay. Make no bookings or submissions there.
- [ ] **Step 6: Update the memory file** `portal-language-switch.md` (decision numbers, migration, commit range, review status, that games/groups/tournaments/tracks/polaroid/stamps are still English), and add it to `MEMORY.md`.
