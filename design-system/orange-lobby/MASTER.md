# Orange Lobby — design system

**This project uses shadcn/ui.** Its documentation is the design system; this file records
only what Orange Lobby does *differently*, and why.

Superseded 12 Sep 2026 by `docs/superpowers/specs/2026-09-12-shadcn-revamp-design.md`
(D53–D75). The migration finished 13 Sep: there are no hand-rolled primitives left, and
`globals.css` no longer carries the transition aliases (`--canvas`, `--ink`, `--surface`,
`--ok`, `--warn`, `--danger`, the tints, `--radius-card`, `--shadow-card`). If you find one
of those names in a diff, it came from somewhere old. The previous version of this file described eight hand-rolled primitives, a
nine-step type scale and a bespoke token vocabulary. None of that exists any more, and by
the end it was already describing components that had been deleted — which is the argument
for keeping this file short enough to stay true.

- Components: <https://ui.shadcn.com/docs/components>
- The installed source is in `src/components/ui/` — read that before the docs; it is what runs.
- Base library is **Base UI**, not Radix: custom triggers use `render`, never `asChild`.

## Tokens

`src/app/globals.css` carries shadcn's semantic tokens in OKLCH, with Orange Lobby's values.
Two additions shadcn has no equivalent for:

| Token | For |
|---|---|
| `--success` / `--success-soft` / `--success-strong` | checked-in states |
| `--warning` / `--warning-soft` | expected / duplicate-scan states |
| `--destructive-soft` / `--destructive-strong` | destructive text on a soft ground |

`tests/contrast.test.ts` parses that file and asserts WCAG 2.x on every pair the app uses.
Add a colour pair to the UI, add an assertion.

**Per-event colour** is injected at runtime by `brandStyle()` (`src/lib/brand.ts`) and is the
one thing that file cannot see, so the maths lives in `src/lib/contrast.ts` and is tested
directly. An event's `primary_color` drives two tokens, because one colour cannot do both
jobs (D72):

- `--brand` — the organiser's colour as chosen, for decorative fills, with
  `--brand-foreground` computed to be readable on it
- `--primary` — the same colour darkened **in Oklab** until it clears 4.5:1 as text on a
  white card, because `text-primary` is read on `--card` as well as being a button fill

Darkening must not scale RGB channels: that desaturates, and turned `#F97316` into a brown.

## Type

Four steps — **12 / 14 / 18 / 24** — plus one display size per surface where a number is the
point. Caps labels are 12px and separate from body text by weight, letterspacing and colour,
not by a pixel. Manrope, bound to `--font-sans` (D59 amended): the printed KOM badges assume
the current identity.

## Deliberate divergences from stock

Each is guarded, because these are source files an upgrade can silently overwrite.

| File | Divergence | Guard |
|---|---|---|
| `ui/badge.tsx` | `success` and `warning` variants — checked-in and expected are domain states stock cannot express (D62) | `tests/badge-variants.test.ts` |
| `ui/checkbox.tsx` | renders a minus when indeterminate; stock shows a tick, so a partial selection looked identical to "all selected" | `tests/stock-deviations.test.ts` |
| `hooks/use-mobile.ts` | `useSyncExternalStore` — stock sets state in an effect, which this project's eslint rejects | `tests/stock-deviations.test.ts` |
| `ui/toaster.tsx` | hand-rolled, not shadcn's toast — it is driven by `toast-store`, which is how a server action's redirect becomes an announcement (D71) | — |
| `ui/skeletons.tsx` | shimmer is `bg-border`; stock's `bg-muted` on `--background` is ~1.02:1, i.e. invisible | — |

One component choice that is not a divergence but is deliberate: the register form's selects
are **native**, not shadcn's `Select` (D75). On a phone a native select is the OS picker.

## Rules that are not shadcn's

Carried forward from the 9 Sep accessibility pass and kept in `globals.css`: the
`:focus-visible` ring (3px, 2px offset, `scroll-margin-block: 96px`), `touch-action:
manipulation`, the `prefers-reduced-motion` block, and `tabular-nums` on `table` and `dl`.
44px minimum touch targets on the portal and scanner.

**A link that looks like a button stays a link** (D73). Style it with `buttonVariants()`:
`<Link href={…} className={cn(buttonVariants({ variant: "outline" }), …)}>`. Base UI's
`Button` assumes a native `<button>` — given an `<a>` in `render` it errors, and with
`nativeButton={false}` it announces the anchor as a button, taking open-in-new-tab with it.
`Button` for things that do something, `buttonVariants` for things that go somewhere.

**A form posting to a server action must be controlled, and re-synced after it returns**
(D74). React resets the `<form>` when the action resolves. Text inputs survive it; a
controlled `<select>` does not, because React writes the DOM only when the prop changed and
the answer did not — so the selects silently blank while state still holds them. See the
effect at the top of `RegisterForm`.

**Use container queries, not viewport ones, for anything inside a sidebar or a column.**
This was got wrong three times: the admin lives in `SidebarInset`, the portal dashboard has
a 300px rail, and the attendee panel is a 576px sheet — in all three the viewport is not the
space the component gets. `@container` must be on a **parent** of whatever reads it; an
element does not query itself.

## Persisted vocabularies

Two lists look like code and are actually data. Narrowing either breaks parsing of rows that
already exist:

- `ICON_NAMES` (`ui/icon.tsx`) — `events.modules` rows carry an icon *name*
- `BUILTIN_MODULES` (`lib/modules.ts`) — validated by `z.enum`; `TILE_BUILTINS` is the
  subset that still renders

Renaming an entry in either is a data migration, not a refactor.
