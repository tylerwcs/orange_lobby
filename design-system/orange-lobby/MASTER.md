# Orange Lobby — Design System (verified)

Generated with the ui-ux-pro-max skill on 2026-09-09 and then reconciled with the decisions already
in `docs/superpowers/specs/2026-09-07-orange-lobby-pilot.md` §8 (D26–D33). Where the generator and the
spec disagreed, the spec won; what follows is what the app actually uses.

## Product shape
Operate-mode tool with three surfaces: an attendee portal opened from a badge QR (mobile, no login),
a crew scanner (phone, one thumb, 100 people in 30 minutes), and an organiser admin (desktop).

## Style
**Accessible & Ethical** (from the generator's second run) applied on top of the tile-grid lobby
structure: high contrast, 16px+ body text, keyboard navigation, visible focus rings, reduced motion,
44px touch targets. Rejected: the first run's "Vibrant & Block-based" purple landing-page style, which
targets consumer event marketing, not onsite operations.

**Redesign, 10 Sep 2026.** A reference dashboard (a hotel booking admin) prompted a redesign across
all three surfaces — soft two-layer card shadows replacing hairline borders, a nine-step type scale,
a status-colour system beyond brand-and-danger (`--ok`, `--warn`, with soft tints), and a primary
button restyled to `--brand-strong` so it stops reading as a warning chip. `Pill` was absorbed into a
new `Badge`, and the old `Stat` card was replaced by `StatTile`. Layout and information architecture
changed too, not just skin — see §5–§7 of the spec. Full rationale, the decision log (D34–D52), and
the token/primitive tables are in `docs/superpowers/specs/2026-09-10-orange-lobby-redesign-design.md`;
the design canvas is at `https://claude.ai/code/artifact/fb06afd6-2c96-4473-9e6c-023d526ba73c`.

## Colour (tokens in `src/app/globals.css`)
| Token | Value | Role |
|---|---|---|
| `--canvas` | #F5F5F3 | page background |
| `--surface` | #FFFFFF | cards, bars |
| `--ink` | #111827 | text, dark panels |
| `--muted` | #4B5563 | secondary text (≥ 4.5:1 on surface, canvas, and tint-slate) |
| `--line` | #E5E7EB | borders, dividers, secondary-button ring — no longer used on cards |
| `--brand` | event `primary_color`, default #F97316 | accent fill only — never a text-bearing button surface |
| `--brand-ink` | #C2410C | accent text, active nav |
| `--brand-strong` | #C2410C | primary button fill, white text (5.2:1) |
| `--brand-soft` | #FFF1E7 | accent tints |
| `--danger` | #DC2626 | destructive icons/dots |
| `--danger-soft` | #FDECEC | destructive badges and banners |
| `--danger-strong` | #B91C1C | text on `--danger-soft` |
| `--ok` | #16A34A | status dots, meter fills on light tints |
| `--ok-strong` | #166534 | text on `--ok-soft`; any fill bearing white text |
| `--ok-soft` | #E7F6EC | checked-in badges, stat tile ground |
| `--warn` | #B45309 | expected / duplicate-scan dots; text on `--warn-soft` |
| `--warn-soft` | #FDF2E2 | expected badges |
| `--tint-pink` | #FBEFF6 | stat tile ground (paired with `#A03A78` ink) |
| `--tint-sky` | #E8F1FC | stat tile ground (paired with `#1D4ED8` ink) |
| `--tint-lilac` | #EFEDFB | category badges (paired with `#5B4BC4` ink) |
| `--tint-slate` | #F1F2F4 | neutral tile/badge ground, meter track |
| `--shadow-card` | `0 1px 2px rgba(17,24,39,.05), 0 10px 26px -18px rgba(17,24,39,.35)` | elevation for cards and tiles — cards carry this and **no border**, replacing the previous bordered-card system |
| `--shadow-bar` | `0 1px 2px rgba(17,24,39,.04), 0 10px 24px -20px rgba(17,24,39,.5)` | elevation for headers and the fixed bottom nav — also borderless |

Every colour token is registered in `@theme inline` as `--color-*`, so it is a Tailwind utility class
(`bg-ok-soft`, `text-brand-ink`, etc). `tests/contrast.test.ts` computes WCAG 2.x contrast straight
from the live `:root` values in `globals.css` and asserts ≥ 4.5:1 on every real text/background pair
the app uses — it is what makes the contrast claims in this document trustworthy rather than assumed.

Per-event brand colour is applied by `brandStyle()` on the portal shell; admin and scanner keep the default.

## Typography
Manrope (next/font, weights 400–800). Size/weight, corrected 2026-09-10 (R31) against the shipped code:
11px/700 caps labels · 12px/500 meta · 13px table cells (inconsistent, see below) · 14px/400 body ·
17px/800 card titles · 20px/800 section headings · 24px/800 page titles ·
30px/800 stat numbers · 52px/800 the check-in hero.
Numbers in tables, counters, times and stats use `tabular-nums` (`globals.css` applies it to `table`
and `dl` automatically, plus a `.tabular-nums` utility for the rest). Rejected: Inter/Playfair (run 1)
and Plus Jakarta Sans (run 2) to avoid churn.

**Type-scale correction, 2026-09-10 (R31).** Three of the nine rows as first documented were copied
from the plan and did not match the shipped code. Corrected here from source:
- **Caps labels are 700, not 800.** Every `text-[11px] uppercase` label in the codebase (12 instances)
  is `font-bold` (700); none is `font-extrabold` (800) — e.g. `AttendeeTable.tsx:75`, `Sidebar.tsx:36`,
  `CheckInPanel.tsx:31`, `GlanceCard.tsx:19`, `RecentScans.tsx:18`, `Scanner.tsx:134`,
  `BadgeCard.tsx:29,34`, `NowCard.tsx:14`. (`BadgeCard.tsx:15–16` is genuinely 800 — status pills, a
  different role from caps labels.)
- **There is no 15px/500 body step.** All seven `text-[15px]` occurrences in the codebase are
  `font-bold` or `font-extrabold` (700/800) and are titles (e.g. `AgendaList.tsx:28`,
  `AnnouncementList.tsx:15`, `TileGrid.tsx:9`, `scan/[eventId]/page.tsx:25`), not body copy. Actual
  body text ships as `text-sm` (14px) at default weight (400).
- **Table cells are not uniformly 13px/600.** The main attendee table (`AttendeeTable.tsx:73,96–104`)
  is `text-sm` (14px) with no weight class on its `<td>`s — i.e. 14px/400. `RecentScans.tsx:26–30` is
  13px/600 on the name and time cells but 13px/400 (no weight class) on the company and checkpoint
  cells in the same row. There is no single weight that describes "table cells" in the shipped app.

**Note — spec vs. shipped.** The redesign spec
(`docs/superpowers/specs/2026-09-10-orange-lobby-redesign-design.md`, Global Constraints) specifies a
slightly stronger scale than what shipped: 800-weight caps labels (shipped 700), a 15px/500 body step
(shipped: 14px/400, no 15px body anywhere), and a uniform 13px/600 table-cell step (shipped:
inconsistent, see above). Closing that gap is an open decision, not an oversight being hidden here.

## Spacing and shape
4px base; 18px card radius (`--radius-card`, was 16px), 10px control radius (`--radius-control`),
pill 999px for badges and pill-shaped buttons. Cards separate groups; proximity groups items inside
them. Sticky side forms on desktop admin pages at 400px.

## Interaction rules adopted from the skill's UX dataset
- Focus: 3px brand outline, 2px offset, `scroll-margin-block` so sticky bars never hide the focused control.
- Touch: 44px minimum targets, 8px gaps, `touch-action: manipulation`, pointer cursors, press feedback.
- Motion: 150ms colour transitions; everything collapses under `prefers-reduced-motion`.
- Loading: `loading.tsx` skeletons for the portal, admin event pages and scanner; submit buttons show a spinner and `aria-busy`.
- Forms: visible labels bound to inputs, helper text, errors next to the field, autocomplete hints; conditional questions via `show_when`.
- Status: scan results announced in one polite live region with a complete phrase.
- Images: reserved dimensions on QR codes and banners; floor plans lazy-load.
- Skip link on the portal and admin.

## Shared primitives (`src/components/ui/`)
`Card` (shadow, no border), `Badge` (`ok | warn | danger | brand | neutral | ink` tones, optional dot
— absorbed `Pill`), `StatTile` (tint ground, icon chip, 30px tabular number), `Meter` (accessible
progress bar, `ok | brand` tones), `SelectChip` (read-only toolbar-control face), `Button` /
`buttonClass` / `ButtonLink` (primary now `bg-brand-strong text-white`), `Icon` (inline SVG, 24px
stroke grid — `bell`, `plus`, `filter`, `clock` added this redesign). `Stat` and `Pill` no longer
exist; every former call site now uses `StatTile` or `Badge`.

Two more shared components live outside `ui/` but are reused across pages the same way: `AdminHeader`
(`src/components/admin/AdminHeader.tsx`, the title/subtitle/actions row every admin page renders) and
`BadgeCard` (`src/components/portal/BadgeCard.tsx`, the portal's checked-in-status-and-table card).

The admin sidebar (`Sidebar.tsx`) is a floating rounded card (`shadow-[var(--shadow-card)]`, no
border) rather than the previous bordered rail: logo row, an event switcher, the nav groups, and a
user footer with a hairline top divider (the one remaining `--line` use in that component).

## Pre-delivery checklist
- [x] No emoji as icons — `src/components/ui/Icon.tsx` renders inline SVG only; `icon-paths.ts`
  confirmed free of emoji characters, including the four names added this redesign (`bell`, `plus`,
  `filter`, `clock`).
- [x] Pointer cursor on clickable elements — global rule in `globals.css`
  (`button, [role="button"], a, label:has(input[type="checkbox"]), summary, select { cursor: pointer }`),
  unconditional on every route, gated or not.
- [x] Hover and press states with transitions — the shared `Button`/`buttonClass` in `Card.tsx`
  carries `hover:*`, `active:translate-y-px`, `transition-colors duration-150` for every button on
  every surface.
- [x] Text contrast ≥ 4.5:1 in light mode — `tests/contrast.test.ts` reads the real `:root` tokens
  from `globals.css` and asserts ≥ 4.5:1 on 13 live pairs (ok/warn/danger/brand/muted/ink text on
  their grounds, plus white on `--brand-strong` and `--ok-strong`); all 13 pass as of 2026-09-10.
- [x] Visible focus for keyboard users — the global `:focus-visible` rule in `globals.css` (3px
  brand outline, 2px offset, `scroll-margin-block: 96px` clear of the fixed bottom nav) is unchanged
  by the redesign and applies everywhere.
- [x] `prefers-reduced-motion` respected — the `@media (prefers-reduced-motion: reduce)` block in
  `globals.css` collapses all animation/transition durations to 0.01ms, unchanged by the redesign.
- [ ] Responsive at 375, 768, 1024, 1440, 1920 — **pending.** Only 375px on the public portal was
  confirmed in a live browser (below); 768/1024/1440/1920 are unverified on every surface, and the
  admin and scanner surfaces are unverified at every width, because both sit behind login.

**Verification note, 2026-09-10 (R29).** The brief's Step 4 calls for re-running this checklist
against the rebuilt app at all five breakpoints. That could not happen: every admin route sits behind
`requireAdmin()` and the scanner behind login, and no agent — this one or the controller's — may enter
credentials. What *was* verified, by the controller in a live browser at 375px on the public portal:
page ground resolves to `--canvas` (#F5F5F3); the portal header and bottom nav carry `--shadow-bar`
with 0px borders; module tiles carry `--shadow-card`, 0px border, 18px radius; all three bottom-nav
targets measure 44px; `document.documentElement.scrollWidth === window.innerWidth` at 375px (no
horizontal overflow); zero console errors; the generic-link fallback card renders and per-event
`primary_color` flows through `brandStyle()`; and, separately, `/login`'s submit button computes to
`rgb(194, 65, 12)` (`--brand-strong`) on white text at 44px. The six ticked items above are backed by
direct source/test inspection (cited inline), which needs no login. The one item that is inherently a
rendered, cross-breakpoint claim — Responsive — stays unticked: 768/1024/1440/1920 on any surface, and
the admin and scanner surfaces at any width, remain **pending verification** until someone who can
authenticate walks them.
