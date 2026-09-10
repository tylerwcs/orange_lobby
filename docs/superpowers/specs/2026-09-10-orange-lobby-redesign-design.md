# Orange Lobby redesign — design

Date: 2026-09-10
Status: approved for implementation
Supersedes nothing; extends `2026-09-07-orange-lobby-pilot.md` §8 (D26–D33) with D34–D52.
Design canvas: https://claude.ai/code/artifact/fb06afd6-2c96-4473-9e6c-023d526ba73c

## 1. Why

A reference dashboard (a hotel booking admin) supplied a visual language the current app lacks:
soft elevation instead of hairline borders, a real type scale, pastel status tiles, a status colour
system beyond brand-and-danger, and a primary button that reads as a primary button. The Impeccable
critique of 8 Sep scored the app 19/40 and named most of the same gaps from the other direction —
flat type hierarchy, three button implementations, no check-in column, search behind a button, no
bulk actions, a primary button that "reads as a warning chip".

This redesign covers layout and information architecture on all three surfaces, not just skin.

The pilot is the Ecopia KOM, 30 Sep–1 Oct 2026; the code freeze is 26 Sep. The work ships on `main`
incrementally, in an order where every intermediate state is coherent (§9).

## 2. Decisions

- **D34** The redesign covers all three surfaces — admin, attendee portal, crew scanner — including
  layout and IA, not restyling alone.
- **D35** The work lands on `main` incrementally and is pilot scope. There is no tagged fallback
  build; the 26 Sep freeze applies to the redesign itself.
- **D36** `/admin` becomes the live event's Overview — of the events with `status = "live"`, the one
  with the latest `starts_on`. `Event` does not carry `created_at`, so ties are broken by preserving
  the order `listEvents` already returns (`created_at` descending) via a stable sort. With no live
  event it redirects to `/admin/events`. The event list moves to `/admin/events`, reached from a
  switcher at the top of the sidebar.
- **D37** The Overview's dominant block is check-in and registration status. A table-occupancy
  ("floor") grid was drawn and rejected on 10 Sep: table occupancy is not what an organiser watches.
- **D38** The attendee portal home is Direction A, "badge first": identity and checked-in state,
  then happening-now, then announcements, then module tiles.
- **D39** No dark mode, on any surface (decided 10 Sep). The scanner is restyled light.
- **D40** The primary button becomes `--brand-strong` (#C2410C) with white text — 5.2:1. The
  existing `--brand` (#F97316) stays an accent fill and is never a text-bearing button surface.
- **D41** Cards carry a soft two-layer shadow and no border. `--radius-card` moves 16px → 18px.
- **D42** Status gains its own colours (`--ok`, `--warn`, plus soft tints). Before this, "checked in"
  had no colour of its own.
- **D43** Every text/background pair meets 4.5:1, and non-text UI indicators meet 3:1. Where the
  reference's own values failed (white on #16A34A is 3.5:1), the darker step is used instead.
- **D44** `Pill` is absorbed into a new `Badge`; `buttonClass`, `Button` and `ButtonLink` remain the
  only button implementations. This closes the critique's "three button implementations".
- **D45** Bulk attendee actions are in scope: Assign table, Clear table, Export selected.
  "Print badges" was drawn in the mockup and dropped — no badge-printing capability is being built.
- **D46** Attendee search filters as you type (debounced URL update), replacing the search button.
- **D47** Arrival-rate and recent-scan views are derived by pure functions over the rows
  `listCheckinsForEvent` already returns. No new database queries and no schema change.
- **D48** The arrivals figure is a single-series bar chart: one hue (`--brand`), no legend, the peak
  bucket direct-labelled and no other. Status green is reserved for check-in meters so green never
  carries two meanings on one screen.
- **D49** The happening-now card signals "now" with a dot and a label only. The coloured left rail
  drawn in the mockups is dropped as a redundant treatment.
- **D50** The generic portal link `/e/[slug]` has no badge card — there is no attendee. It falls back
  to the event card plus a prompt to open a personal link or register. Only
  `/e/[slug]/a/[token]` renders the full Direction A home.
- **D51** Attendee list pagination is 50 per page, sliced in the page component from the full
  `listAttendees` result. This is acceptable at pilot scale (~100) and is a known ceiling.
- **D52** Directions B and C are retained on the canvas's "Not chosen" page as a record of the
  decision. They are not built and their design-hook findings are not acted on.

## 3. Token layer — `src/app/globals.css`

Unchanged: `--surface --ink --muted --line --brand --brand-ink --brand-soft --danger`.

Changed:

| Token | From | To |
|---|---|---|
| `--canvas` | `#F4F5F7` | `#F5F5F3` |
| `--radius-card` | `16px` | `18px` |

Added:

| Token | Value | Role |
|---|---|---|
| `--brand-strong` | `#C2410C` | primary button fill, white text (5.2:1) |
| `--ok` | `#16A34A` | status dots, meter fills on light tints |
| `--ok-strong` | `#15803D` | text on `--ok-soft`; any fill bearing white text |
| `--ok-soft` | `#E7F6EC` | checked-in badges, stat tile ground |
| `--warn` | `#B45309` | expected / duplicate-scan dots |
| `--warn-soft` | `#FDF2E2` | expected badges |
| `--danger-soft` | `#FDECEC` | destructive badges and banners |
| `--tint-pink` | `#FBEFF6` | stat tile ground (with `#A03A78` ink) |
| `--tint-sky` | `#E8F1FC` | stat tile ground (with `#1D4ED8` ink) |
| `--tint-lilac` | `#EFEDFB` | category badges (with `#5B4BC4` ink) |
| `--tint-slate` | `#F1F2F4` | neutral tile and badge ground |
| `--shadow-card` | `0 1px 2px rgba(17,24,39,.05), 0 10px 26px -18px rgba(17,24,39,.35)` | cards |
| `--shadow-bar` | `0 1px 2px rgba(17,24,39,.04), 0 10px 24px -20px rgba(17,24,39,.5)` | headers, bottom nav |

Every colour token is registered in `@theme inline` as `--color-*` so it is a Tailwind utility,
matching how the existing tokens are exposed. The shadow tokens are used via `shadow-[var(--shadow-card)]`.

Type scale, applied as Tailwind classes rather than tokens (documented here so it is enforceable in
review): 11px/800 caps labels · 12px/500 meta · 13px/600 table cells · 15px/500 body ·
17px/800 card titles · 20px/800 section headings · 24px/800 page titles · 30px/800 stat numbers ·
52px/800 the check-in hero. Numbers in tables, counters, times and stats keep `tabular-nums`,
which `globals.css` already applies to `table` and `dl`.

## 4. Shared primitives — `src/components/ui/`

- `Card.tsx` — `Card` drops `border border-line` for `shadow-[var(--shadow-card)]`; `Stat` is
  replaced by `StatTile`.
- `Badge.tsx` (new) — `{ tone: "ok" | "warn" | "danger" | "brand" | "neutral" | "ink", dot?: boolean }`.
  Absorbs `Pill`; every call site of `Pill` migrates.
- `StatTile.tsx` (new) — tint ground, circular icon chip, 30px tabular number, 12px label.
- `Meter.tsx` (new) — `{ value, max, tone }`, renders a rounded track and fill with an accessible
  `role="progressbar"` and `aria-valuenow`/`aria-valuemax`.
- `SelectChip.tsx` (new) — the toolbar control (label, current value, chevron).
- `Card.tsx` `Button`/`buttonClass` — primary becomes `bg-brand-strong text-white hover:brightness-110`;
  secondary keeps white with a `--line` ring; danger unchanged in behaviour, restyled to `--danger-soft`.
- `Icon.tsx` / `icon-paths.ts` — four new names: `bell`, `plus`, `filter`, `clock`, on the same
  24px stroke grid as the existing set. `tests/icon.test.ts` covers the name list and must be extended.

## 5. Admin

### Routing
- `src/app/admin/page.tsx` becomes a redirect, resolving the target as defined in D36.
- `src/app/admin/events/page.tsx` (new) is the event list — the current `/admin` body, restyled.
- `nav.ts` `groupsFor(null)` points "All events" at `/admin/events`.

### Shell
- `Sidebar.tsx` becomes a floating rounded card: logo row, event switcher (name + status badge +
  chevron, linking to `/admin/events`), the five existing nav groups unchanged, and a user footer.
- `AdminHeader.tsx` (new) — `{ title, subtitle?, actions? }`, used by every admin page, replacing
  the per-page bare `<h1>`. Page `metadata.title` stays as it is.

### Overview
Rebuilt from `Stat` cards into three components:
- `CheckInPanel` — hero (checked-in count of registered, `Meter`), the arrivals bar chart, and one
  `Meter` row per checkpoint. Checkpoints with no check-ins yet render an empty track and their
  opening time rather than a 0% bar.
- `GlanceCard` — four `StatTile`s (Registered, Checked in, Walk-ins, Not yet in) over a registration
  block: state `Badge`, when it opened or closed, and Reopen / Copy link controls that reuse the
  existing status and link actions.
- `RecentScans` — a table of the latest scans: attendee, company, table, checkpoint, time, status.
  A duplicate renders as a `warn` badge reading "Already in HH:MM". The newest row keeps the
  5-second Undo already built on 9 Sep.

The existing Links, Exports, Status and Purge cards keep their behaviour and move below the fold,
restyled. Purge stays gated on `status === "archived"`.

### Attendees
- Status column driven by `checkinStatus`.
- `SearchInput` (new client component) — debounced 250ms `router.replace` of `?q=`, so the existing
  `listAttendees(eventId, q)` does the work and the search button is removed.
- `BulkBar` (new client component) — selection state, an ink action strip, and server actions
  `assignTableAction` / `clearTableAction`. "Export selected" links to the existing
  `export/attendance.xlsx` route, which gains an optional `ids` query parameter.
- Pagination at 50/page via a `page` search param (D51).

## 6. Portal — Direction A

- `BadgeCard.tsx` (new) — ink panel: checked-in `Badge` with scan time, name, company, a QR chip
  linking to `/me`, and a table/seat row with a floor-plan link. Replaces `MeCard` on the home
  screen; `MeCard` is deleted once no route uses it.
- `NowCard.tsx` — restyled; the coloured rail is not added (D49).
- `TileGrid.tsx` — shadowed tiles, tinted icon chips.
- `PortalShell.tsx` — `--shadow-bar` on the header and bottom nav, `--canvas` ground, tokens otherwise
  unchanged. `brandStyle()` per-event branding is untouched.
- `/e/[slug]` (generic) renders the fallback of D50.

## 7. Scanner

Light, restyled to the new system. The result banner becomes full-width with 20px type on
`--ok-soft` / `--warn-soft` / `--danger-soft`. Undo, checked-in hit labelling, camera-error copy and
the recent-scans list all keep the behaviour merged on 9 Sep — this is presentation only.

## 8. New pure logic and tests

`src/lib/checkins-stats.ts` (new), covered by `tests/checkins-stats.test.ts` (new):

- `arrivalBuckets(checkins, { day, from, to, minutes })` → `{ label, count }[]`.
  Buckets by local time using the existing `src/lib/time.ts` helpers. Tests: empty input, a single
  scan on a bucket boundary, scans outside the window, a bucket with no scans rendering as zero
  rather than being omitted.
- `checkinStatus(attendeeId, checkins)` → `"checked_in" | "expected"` with the earliest scan time.
  Tests: no scans, one scan, duplicate scans at two checkpoints.
- `recentScans(checkins, attendees, limit)` → newest-first rows with the attendee joined, marking a
  scan as a duplicate when an earlier scan exists for the same attendee and checkpoint.
  Tests: ordering, the limit, a scan whose attendee was purged.

`tests/icon.test.ts` extends to the four new icon names. No other existing test changes.

## 9. Order of work

Each step lands on `main` and leaves the app coherent, so a freeze mid-way is survivable:

1. Token layer and shared primitives (§3, §4). Everything else depends on these.
2. Admin shell and routing (§5 routing, shell).
3. Admin Overview, including `checkins-stats.ts` and its tests (§8).
4. Admin Attendees.
5. Portal Direction A.
6. Scanner restyle.

## 10. Out of scope

Dark mode (D39). Badge printing (D45). A table-occupancy grid (D37). Any schema change or new
Supabase query (D47). Anything on the deferred list in `2026-09-07-orange-lobby-pilot.md`, and the
parked post-pilot fixes at the end of `docs/dry-run-verification.md`.

## 11. Risks

- **The freeze.** This is a whole-app redesign inside 16 days with no fallback build (D35). Steps in
  §9 are ordered so a freeze mid-list leaves a coherent app, but a freeze mid-step does not.
- **Re-verification.** Registration and portal flows were verified against live Supabase data on
  8 Sep. Every one of them is touched here and must be re-verified before the 23 Sep dry run.
- **`/admin` redirect** (D36) changes where existing muscle memory lands.
- **Browser-pane screenshots are unusable at wide emulated widths** (noted 9 Sep); admin layout must
  be measured with the JS tool rather than eyeballed from a screenshot.

## 12. Verification

Per surface, before the step is called done: `npm run lint`, `npm test`, then the browser pane —
admin at 1440 and 1920, portal at 375 and 390, scanner at 390. Contrast is checked by computation,
not by eye, for any pair introduced here. The pre-delivery checklist in
`design-system/orange-lobby/MASTER.md` applies unchanged, and that file is updated to match the new
token table once step 1 lands.
