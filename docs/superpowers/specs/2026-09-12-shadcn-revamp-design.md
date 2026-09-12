# Orange Lobby shadcn/ui revamp — design

Date: 2026-09-12
Status: approved for implementation
Extends `2026-09-10-orange-lobby-redesign-design.md` (D34–D52) with D53–D67.
Supersedes the hand-rolled design system in `design-system/orange-lobby/MASTER.md`.

## 1. Why

The app's UI layer is hand-rolled: eight primitives in `src/components/ui/`, a 30-icon inline SVG
registry, a native `<dialog>` modal, a 406-line attendee table, and a bespoke token vocabulary
(`--canvas`, `--ink`, `--brand-strong`). It works and it is accessible — `tests/contrast.test.ts`
proves the colour claims — but every new control is built from scratch, and the component surface a
maintainer has to hold in their head is 2,246 lines that a library would supply.

shadcn/ui supplies that layer as source code in the repo: Table, Dialog, DropdownMenu, Sidebar,
Field/FieldGroup forms, Command, AlertDialog, Empty, Progress. Adopting it trades bespoke primitives
for a maintained compositional API without giving up ownership of the files.

The pilot is the Ecopia KOM, 30 Sep–1 Oct 2026; the code freeze is 26 Sep. Unlike the 10 Sep
redesign, this work is **not** tied to that freeze (D61): it lands incrementally on `main`, and
whatever is green by 26 Sep ships with the pilot. Nothing here is pilot scope.

## 2. Decisions

- **D53** shadcn/ui becomes the component layer. The design system documented in
  `design-system/orange-lobby/MASTER.md` is retired, not extended.
- **D54** Components are used **stock**. No hand-tuning of shipped component source, no restyling to
  match the previous look. The single exception is D62.
- **D55** The orange identity survives. `--primary` is `#C2410C` (the current `--brand-strong`), and
  each event's `primary_color` is still injected at runtime — `brandStyle()` is rewritten to emit
  `--primary` / `--primary-foreground` instead of `--brand` / `--brand-ink` / `--brand-soft`.
- **D56** Light only. `color-scheme: light` stays pinned and shadcn's `.dark` block is left
  unpopulated. This reaffirms the 10 Sep no-dark-mode call rather than revisiting it.
- **D57** Base UI, not Radix — the resolved default for this project on shadcn 4.21.0. Custom
  triggers therefore use the `render` prop, never `asChild`.
- **D58** Tokens are written in **OKLCH**, shadcn's stock format. `tests/contrast.test.ts` gains an
  OKLCH→sRGB conversion step rather than the app keeping hex to suit the test. The WCAG 2.x maths and
  all 18 assertions are preserved.
- **D59** Preset `nova` to start. Swappable later in one command
  (`npx shadcn@latest apply <code> --only theme,font`), so it is not a load-bearing choice.
- **D60** `lucide-react` replaces `src/components/ui/Icon.tsx` and `icon-paths.ts`. All 30 registered
  names map onto lucide equivalents; the ones that are not a literal rename are `seat` → `armchair`,
  `qr` → `qr-code`, `close` → `x`, `logout` → `log-out`, `grip` → `grip-vertical`,
  `chat` → `message-square`, `grid` → `grid-3x3`, `chevron` → `chevron-down` (the base of the four
  rotations the current registry serves from one path). The remaining 22 are 1:1.
- **D61** Incremental on `main` in the phase order of §5. No commitment to land before the 26 Sep
  freeze; every commit leaves `main` green, lint-clean and building.
- **D62** `Badge` gains two variants — `success` and `warning`. This is the one place stock shadcn
  cannot express a domain state: *checked-in* and *expected* are core to the scanner and attendee
  table, and six contrast assertions depend on their colour pairs. **Open — see §9.**
- **D63** `Card` adopts shadcn's border. The 10 Sep decision to drop card borders in favour of the
  two-layer `--shadow-card` is superseded by D54.
- **D64** `--muted` inverts meaning on migration and gets its own commit. Today it is *text*
  (`#4B5563`); in shadcn it is a *background*, and the text token is `--muted-foreground`. A literal
  rename would silently turn every piece of secondary text into a pale grey fill.
- **D65** An old primitive is deleted only when its last call site is gone. There is never a
  half-wired component on `main`.
- **D66** `design-system/orange-lobby/MASTER.md` is replaced by a short pointer to shadcn's own docs
  plus the list of deliberate divergences (currently just D62).
- **D67** `RegisterForm` migrates **last**. Registration goes live 12 Sep and holds real KOM signups
  from that date; it is the one surface where a regression costs data rather than face.

## 3. Token layer — `src/app/globals.css`

shadcn's semantic token set, carrying Orange Lobby's values. Values are **written to `globals.css` in
OKLCH** (D58); the sRGB hex in the table below is the reference each one converts from, and is what
the contrast test converts back to in order to compute WCAG ratios.

| Today | Becomes | Value (sRGB) | Note |
|---|---|---|---|
| `--canvas` | `--background` | `#F5F5F3` | |
| `--surface` | `--card`, `--popover` | `#FFFFFF` | current shadcn ships its own `--surface` meaning "secondary surface"; ours retires to avoid the collision |
| `--ink` | `--foreground`, `--card-foreground` | `#111827` | |
| `--muted` | `--muted-foreground` | `#4B5563` | D64 |
| — | `--muted` (new role) | `#F1F2F4` | takes the old `--tint-slate` value |
| `--line` | `--border`, `--input` | `#E5E7EB` | |
| `--brand-strong` | `--primary` | `#C2410C` | `--primary-foreground` `#FFFFFF`, 5.2:1 |
| `--brand-soft` | `--accent` | `#FFF1E7` | `--accent-foreground` `#C2410C` |
| `--brand-ink` | `--ring` | `#C2410C` | focus ring stays brand-derived |
| `--brand` | retired | — | per-event colour now lands on `--primary` (D55) |
| `--danger` | `--destructive` | `#DC2626` | |
| `--danger-soft` / `--danger-strong` | `--destructive-soft` / `--destructive-strong` | unchanged | custom, registered in `@theme inline` |
| `--ok` / `--ok-soft` / `--ok-strong` | `--success` / `--success-soft` / `--success-strong` | unchanged | custom — shadcn has no success token |
| `--warn` / `--warn-soft` | `--warning` / `--warning-soft` | unchanged | custom — shadcn has no warning token |
| `--tint-pink` / `--tint-sky` / `--tint-lilac` | `--chart-1` … `--chart-5` | unchanged | feeds the Overview arrivals chart |
| `--radius-card` 18px, `--radius-control` 10px | `--radius` (preset default) | — | shadcn derives `sm`/`md`/`lg`/`xl` from one value |
| `--shadow-card`, `--shadow-bar` | retired | — | superseded by D63 |

Success and warning follow the documented custom-colour extension pattern: defined in `:root`,
registered as `--color-success` etc. in `@theme inline`. They are not a workaround.

Kept from the current stylesheet unchanged: the `:focus-visible` rule (3px outline, 2px offset,
`scroll-margin-block: 96px`), `touch-action: manipulation`, the `prefers-reduced-motion` block, and
`font-variant-numeric: tabular-nums` on `table` and `dl`. These encode accessibility decisions from
the 9 Sep UX pass that shadcn does not supply.

## 4. Component map

| Current | shadcn |
|---|---|
| `ui/Card.tsx` (`Card`, `Button`, `buttonClass`, `ButtonLink`) | `Card` + `CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`, `Button` |
| `ui/Badge.tsx` | `Badge` (+ D62 variants) |
| `ui/StatTile.tsx` | `Card` composition + `Badge` |
| `ui/Meter.tsx` | `Progress` — pure maths move to `src/lib/meter.ts` |
| `ui/Skeleton.tsx` | `Skeleton` |
| `ui/Toaster.tsx` | Base UI `toast` (not `sonner` — D57) |
| `ui/Icon.tsx`, `ui/icon-paths.ts` | `lucide-react` (D60) |
| `admin/Modal.tsx` (native `<dialog>`) | `Dialog` |
| `admin/AttendeeTable.tsx` (406 lines) | `Table` |
| `admin/Sidebar.tsx` | `Sidebar` |
| `admin/ColumnMenu.tsx` (173 lines) | `DropdownMenu` |
| `admin/ConfirmButton.tsx`, `admin/DangerButton.tsx` | `AlertDialog` + `Button variant="destructive"` |
| `admin/SubmitButton.tsx` | `Button` + `Spinner` (`data-icon`, `disabled` — `Button` has no `isPending`) |
| `admin/SearchInput.tsx` | `InputGroup` + `InputGroupInput` |
| `admin/Flash.tsx` | `Alert` |
| `admin/Field.tsx`, `admin/FieldInputs.tsx` | `FieldGroup` / `Field` / `FieldLabel` + `Input`, `Select`, `Textarea`, `Checkbox` |
| `admin/CopyButton.tsx`, `admin/CopyLink.tsx` | `InputGroup` + `InputGroupAddon` + `Button` + `toast` |
| `portal/AnnouncementBanner.tsx` | `Alert` |
| empty list states across portal and admin | `Empty` |

`Scanner.tsx` keeps all scan logic; only its presentation changes. `AutoRefresh.tsx`,
`RunningCheckpoint.tsx` and everything in `src/lib/` are untouched.

## 5. Order of work

Each phase is a commit range leaving `main` green.

0. **Foundation** — `npx shadcn@latest init --preset nova`, `components.json`, token layer (§3),
   OKLCH contrast test (§6), lucide swap, and the base set: `card button badge skeleton alert
   separator progress spinner`. Additive; no page renders differently yet.
1. **Admin** — `Sidebar`, `Table`, `Dialog`, `DropdownMenu`, `AlertDialog`, `Field`/`FieldGroup`
   forms. Login-gated and desktop-only, so zero attendee exposure while the pattern beds in.
2. **Portal** — `TileGrid`, `BadgeCard`, `NowCard`, `AgendaList`, `AnnouncementList` onto `Card`
   composition, `Alert` and `Empty`. First real exercise of per-event `--primary`.
3. **Scanner** — reskin only.
4. **Register** — `RegisterForm` onto `FieldGroup`/`Field`/`InputGroup` (D67).

## 6. Tests

265 tests across 33 files are green today; the suite stays green per phase.

- `tests/contrast.test.ts` — gains OKLCH→sRGB conversion (D58) and retargets to the new token names.
  All 18 assertions preserved, plus a new one covering the `--muted` / `--muted-foreground`
  inversion (D64). `assertPair` already throws on a missing token, so a mistyped rename fails loudly
  rather than passing on an empty set.
- `tests/meter.test.ts` — follows `meterPercent`, `meterAriaMax`, `meterAriaValue` to `src/lib/meter.ts`.
- `tests/brand.test.ts` — retargets to the rewritten `brandStyle()`. It already asserts
  `color-mix(in oklch, …)`, so it moves toward shadcn rather than away.
- `tests/badge.test.ts`, `tests/icon.test.ts` — retire with `Badge.tsx` and `icon-paths.ts` (D65).

`npm run lint` and `next build` clean at every phase boundary.

## 7. Out of scope

Dark mode (D56). Information architecture — this revamp changes the component layer, not what is on
which page; the 11 Sep admin IA stands. Data model, Supabase schema, exports, scan logic, auth.
Charts beyond repointing the arrivals chart at `--chart-*`. The `react-hook-form` + `zod` resolver
pattern shadcn documents for forms: server actions stay as they are.

## 8. Risks

- **Registration is live from 12 Sep with real signups.** Mitigated by D67 — it migrates last, after
  the pattern is proven on four other surfaces.
- **The `--muted` inversion (D64) fails silently by nature** — the app still renders, just wrongly.
  Mitigated by its own commit and its own assertion.
- **Verification gap, unchanged from the 10 Sep redesign.** Admin and scanner are login-gated and
  Claude cannot enter credentials; portal and register can be driven in the browser pane. The rest
  goes on a checklist for the user, as `docs/redesign-verification-checklist.md` did.
- **Per-event brand colours are unbounded.** `brandStyle()` has always bypassed the contrast test —
  named as an open finding in the 10 Sep Impeccable audit (an event mark at 3.97:1) and still open.
  This revamp does not fix it, but moving the injection onto `--primary`/`--primary-foreground` puts
  every event's colour behind one pair, which is the precondition for fixing it later.
- **`nova` is a guess.** D59 keeps it cheap to change, but the first real look at Phase 2 may prompt
  a swap.

## 9. Open decisions

- **D62 — the two `Badge` variants.** The alternative is forcing *checked-in* and *expected* into
  stock `secondary` / `outline`, which loses the green/amber semantic the scanner and attendee table
  rely on. Recommendation: add the variants. Proceeding on that unless told otherwise.

## 10. Verification

Per phase: `npm test`, `npm run lint`, `next build`. Portal and register verified in the browser
pane. Admin and scanner added to a checklist for the user, carrying forward the two still-open items
from `docs/redesign-verification-checklist.md`.
