# Portal language switch (English / Bahasa Malaysia) — design

Date: 28 Oct 2026. Deadline: live on `zp-my-best-me` (MYBESTME) before **1 Nov 2026**.

## Why

MYBESTME's attendees are Malay speakers. Everything the organiser types for the event is already
bilingual (the registration form questions, the survey questions, the consent screen), but the
portal's own wording — buttons, tab names, notes, the toasts after booking or submitting, dates —
is English only. An attendee should be able to flip that wording to Bahasa Malaysia.

## Goals

- An event can turn on a language switch in Settings. Only then does its portal show a switcher.
- With the switch on, an attendee can choose **English** or **Bahasa Malaysia**. The portal's own
  wording follows their choice; the choice is remembered on that device.
- Bahasa Malaysia covers every screen a MYBESTME attendee can reach (list below), complete, by 1 Nov.

## Non-goals

- **Event content is never translated.** Anything typed in admin — event name, Info tabs and their
  title ("FAQ"), clinic list, activity names/descriptions, survey questions and options,
  announcements, terms, agenda items — shows exactly as typed, in both languages.
- The registration form (`/e/[slug]/register`) — the organiser already writes it bilingually.
- The consent screen (`ConsentGate`). Leave it as it is. MYBESTME has no event terms
  (`registration_terms` is null), so all it shows is the privacy summary with its folded
  "Baca dalam Bahasa Malaysia" copy and the "I agree · Saya setuju" button, which already offer
  Malay. This is a deliberate exception to the no-mixed-screens anti-goal. The terms block only
  needs translating once an event with terms turns the switch on. (Claude's call, checked 28 Oct.)
- The `/register/done` page. MYBESTME has it off (`registration_done_page = false`), so no
  attendee can reach it. (Checked 28 Oct.)
- WhatsApp messages — Meta-approved templates, out of scope.
- Admin, committee, verifier, crew, host, display, wall and booth screens.
- Portal sections MYBESTME does not use: games/play, groups, tournaments, tracks, polaroid,
  stamps/passport, seat/breakouts, queue card, cancelled card, self-cancel. They stay English
  (even with the switch on) until an event that uses them asks; the dictionary structure must make
  adding them later a matter of moving strings, not redesigning.
- A third language, or detecting the phone's language automatically.

## Anti-goals (would be a failure even if it works)

- A half-translated screen on MYBESTME: English and Malay app wording mixed on one screen a
  MYBESTME attendee can reach.
- Changing any attendee link. Links go out by WhatsApp as `/e/<slug>/a/<token>`; no `/ms/` prefix,
  no redirect, no query parameter needed to keep the language.
- Any visible change on events with the switch off — same wording, same layout, no switcher.
- Breaking the existing Malaysian date style (`Wed 30 Sep`, `8 Sep, 17:13`, 24-hour times).

## Decided with the user

- English + Bahasa Malaysia only.
- Per-event switch, off by default; only events that turn it on show the switcher.
- Only the app's own wording switches; event content stays as typed.
- Registration form out of scope.
- Claude drafts the Malay; the user (or someone on the team) reads it over before it goes live.
  So the Malay must be easy to review in one place.
- Must be live for MYBESTME by 1 Nov, and it goes on even if the review isn't finished. Wording gets
  fixed as we go.

## Scope for MYBESTME — screens to cover

MYBESTME (`e5ef15f2-cf24-4614-a7b7-8f625a90ac1d`) uses: the home screen, header and nav, Agenda,
Info (4 tabs), Me, Activities list, and two activities — **Health Screening Booking** (booking kind,
112 sessions) and **Post-Event Survey** (submission kind, attendee may edit, no scoring, no pairs,
no groups, no health data). No self-cancel, no registration limit, status live.

Cover every piece of app wording reachable from those, in both the personal portal
(`src/app/e/[slug]/(portal)/a/[token]/…`) and the public portal pages that share the same
components (`src/app/e/[slug]/(portal)/…`), including:

- `PortalChrome`, `PortalHeader`, `PortalTabStrip`, `LauncherGrid`, `HomeLink`, `PortalShell`,
  the home page, loading skeletons with words, `PreviewBanner` (staff-only — may stay English, builder's call),
  `AddToHomeScreen`, `AddToCalendar`, `AgendaList`/`AgendaImage`, `InfoPage`, `BadgeCard`,
  `BadgeQrDialog`, `AnnouncementBanner`/`AnnouncementList`, the Me page.
- Activities: `ActivitiesTab`, `ActivityPage`, `ActivityParts`, `HomeActivities`, `detail-parts`,
  `ActivityActionDialog`; booking portal parts (`BookingBody`, `ActivitySessions`,
  `ActivityBooking`, `SessionDays` if used in the portal); submission portal parts
  (`SubmissionBody`, `SubmissionFields`, `EntryActions`, `SubmissionHistory` if shown to attendees).
- Server-side messages an attendee can see from those screens: the toasts/flash text returned by
  the portal booking and submission actions (`src/features/activities/portal/actions.ts` and the
  libs it calls), validation errors on the survey form, empty states, "full"/"closed" notes.
- Screen-reader text (`sr-only`, `aria-label`) on those screens.
- Dates and times shown on those screens (see below).

Anything not in this list that a MYBESTME attendee can still reach counts as in scope — the test is
"can a MYBESTME attendee see it", not this list.

## How it works (Claude's calls — the user handed the build to Claude)

**The setting.** Migration `0111`: `events.language_switch boolean not null default false`.
Settings → Event details gets a small section "Portal language" with one switch: "Let attendees
switch the portal to Bahasa Malaysia", hint "Only the app's own wording changes. Anything you type
for the event shows as you typed it." Saved with the rest of the Details tab like every other field.

**Remembering the choice.** A cookie `portal_lang` (`en` | `ms`), path `/`, one year, `SameSite=Lax`,
not HttpOnly-sensitive (holds no personal data). Set by a server action, followed by a refresh of
the current route — no URL change. Not per event: one device, one preference. The language in force
is `ms` only when the event's `language_switch` is on **and** the cookie says `ms`; otherwise `en`.
Turning the switch off puts everyone back on English immediately, cookie or not.

**The dictionary.** A new feature folder `src/features/language/` (per the modular-features
convention):
- `en.ts` — the source of truth, a typed nested object grouped by screen (`nav`, `home`, `me`,
  `agenda`, `info`, `booking`, `submission`, `common`, `dates`). Values are strings, or small
  functions for anything with numbers or plurals (`seatsLeft(left, sessions)`).
- `ms.ts` — the same shape, `satisfies` the English type, so a missing or extra key fails `tsc`.
  This is the one file the user reviews.
- `portalLang(event)` — server helper reading the event flag + cookie.
- `t(lang)` — returns the dictionary. Server components call it directly.
- A small client context (`LangProvider` / `useT()`) mounted by the portal layouts so client
  components (`PortalChrome` is a client component) get the same dictionary without prop drilling.
  Only the chosen language's dictionary is sent to the browser.
- Server actions work out the language themselves (event + cookie), so their messages come back
  in the right language.
- No i18n library. The wording is a few hundred phrases in two languages; a typed object is enough
  and keeps the Malay in one readable file.

**Dates.** `src/lib/text.ts` builds dates by hand with English month and weekday names. Give the
portal-facing helpers (`formatDateRange`, `shortDate`, `shortDateTime`, plus `dayRange` and any
other date text on the covered screens) an optional `lang` argument with Malay names
(Jan Feb Mac Apr Mei Jun Jul Ogo Sep Okt Nov Dis; Ahd Isn Sel Rab Kha Jum Sab). Same order, same
24-hour times. Default stays English so admin and everything else is untouched.

**`lang` attribute.** When Malay is in force, the portal's outer wrapper carries `lang="ms"` (root
`<html lang="en">` stays) so screen readers pronounce it right.

**The switcher.** A compact two-way toggle reading **EN | BM**, current one highlighted, with an
`aria-label` "Language / Bahasa". Shown only when the event's switch is on.
- Phone: in the home screen's header bar, just left of the Me button (top right).
- Desktop: at the right end of the header, after the links.
- Me page: a "Language · Bahasa" row with the same toggle, so it is findable from any screen.
Tapping it changes the wording in place on the current page.
Label for the language in full text: "Bahasa Malaysia", matching the existing privacy notice.

**Malay wording.** Bahasa Malaysia as used in Malaysian apps: short, friendly, "anda" form,
standard terms (Daftar, Tempah, Hantar, Batal, Sesi, Tambah ke kalendar). Names of things the
organiser types are never translated, even when they appear inside a sentence
("Tempah sesi Health Screening Booking anda").

## Done means

- `zp-my-best-me` has `language_switch` on before 1 Nov. Reading over `ms.ts` can carry on after that.
- On a phone, a MYBESTME attendee link with BM picked shows no English app wording on any screen
  listed above, including after booking a session, changing it, and submitting / editing the survey.
- With EN picked, or on any event with the switch off, every screen reads exactly as today.
- `tsc` passes (the Malay dictionary is complete by construction); existing tests pass.
- Checked in the browser on a test event (never on `ecphub`), then on MYBESTME read-only.

## Order of work (Claude's call, because review is the bottleneck)

1. Draft `ms.ts` in full and hand it to the user on day one, so they can review it while the wiring
   gets built.
2. Build the wiring and convert the screens against that dictionary.
3. Claude turns `language_switch` on for MYBESTME in Settings before 1 Nov, **whether or not the
   Malay has been fully read over** (the user's call, 28 Oct). Wording gets fixed as it comes up,
   so later corrections only touch `ms.ts`.

## Smaller calls (Claude's)

- `LangProvider` is mounted inside `PortalChrome`, which both the personal layout and the public
  pages' `PortalShell` render, so no new layout is needed.
- Flash messages travel in the URL, so a toast keeps the language it was built in. That's acceptable.
- Survey validation shares helpers with the registration form. Give them a `lang` argument that
  defaults to English, so the form doesn't change.
- When BM is in force, the Privacy Notice link points to `/privacy/ms`.
- The `.ics` file from Add to calendar carries only organiser-typed text (activity name, event
  name, location), so it needs no change. The labels on the Add to calendar menu do get translated.

## Left to the builder

- Exact key names and grouping inside the dictionary.
- Whether the switcher is a server action + refresh or a client cookie write + `router.refresh()`.
- Whether staff-only bits on these screens (preview banner) get translated.
- Decision numbers (next free is D736) and commit split.
