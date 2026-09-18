# Portal shell in the layout — design

Date: 2026-09-18
Status: approved for implementation
Extends `2026-09-07-orange-lobby-pilot.md`. Decisions D113–D119.

## 1. Why

`PortalShell` — the header, the brand colour, the desktop nav and the phone's bottom bar — is
rendered by every portal **page** rather than by a layout. `a/[token]/layout.tsx` is a
pass-through: `<>{children}</>`.

The consequence is that the chrome is part of each page's own output, so it unmounts and remounts
on every navigation. Tapping Agenda in the bottom bar throws away the bar and builds a new one.
Nothing is broken, but nothing persists either: there is no element on screen that survives a
tap.

That is also why the portal had no usable loading state. `f999f83` added skeletons that redraw a
grey copy of the header and bottom bar, because a `loading.tsx` had no chrome to sit inside. The
skeletons work, and they are treating the symptom: the right answer is that the bar should never
have gone away.

## 2. Scope

The **personal portal only** — the 8 pages under `e/[slug]/a/[token]/`.

The anonymous portal (6 pages under `e/[slug]/`) has the same problem and is deliberately left
alone, because fixing it needs a route-group restructure (see D113). `register` and
`register/done` are not portal pages at all — they use `PortalHeader` directly with their own
narrow layout — and are untouched.

## 3. Decisions

- **D113** The anonymous portal is **not** converted in this change. `e/[slug]/layout.tsx` wraps
  everything below it, including `a/[token]/` and `register/`, so an anonymous shell placed there
  would give personal pages two sets of chrome and give the register pages one they do not want.
  Converting it needs the 6 anonymous pages moved into an `e/[slug]/(shell)/` route group — file
  moves, unchanged URLs — and that is a separate change with its own risk, two weeks from the
  pilot. The cost of deferring is a codebase where the two halves of the portal render their
  chrome differently until someone finishes the job. That is accepted and recorded here so the
  next person knows it was a decision rather than an oversight.

- **D114** The chrome is **extracted once and shared**, not copied. `PortalChrome` becomes the
  single implementation of the header, navs and main wrapper. `PortalShell` keeps its exact
  current signature and delegates to it, so the 6 anonymous pages change in no way at all. The
  alternative — a new chrome for the personal layout alongside the old one in `PortalShell` — was
  rejected: two near-identical copies of a nav is precisely the thing that drifts, and D113
  guarantees both would live for a while.

- **D115** `PortalChrome` is a **client component that reads `usePathname()`**. Three props exist
  today only because the page knew something the shell did not: `current` (which nav item is
  active), `hero` (draw the banner) and `dashboard` (the wider three-column home). A layout cannot
  receive them — it does not know which child is rendering. The URL already holds the answer, and
  it is a better source than a prop a page could forget to pass or pass wrongly. `hero` and
  `dashboard` are both exactly "this is the home route", so one predicate replaces both.

- **D116** The pathname decisions are **pure functions in `src/lib/portal-nav.ts`**, not logic
  embedded in the component: `activeNavHref(pathname, basePath)` and `isPortalHome(pathname,
  basePath)`. The cases that will actually break it — a trailing slash, `?day=2026-09-30` on the
  agenda, a basePath that is a prefix of another route — are cheap to unit-test and invisible in a
  client component. This suite has no DOM, so anything left inside the component is untestable
  here.

- **D117** The layout **loads the attendee, and the pages keep loading it too**. Passing the
  attendee down from layout to page is not possible in the App Router without context, and context
  would make every page a client component. Two loads per request is the honest cost — and it is
  paid once, not twice, because of D118.

- **D118** `loadPortalEvent` and `loadPortalAttendee` are wrapped in React's **`cache()`**, so the
  layout's load and the page's load of the same request are one query each. Without this the
  change doubles every portal request's database work: `getEventBySlug` plus `findByToken`, twice.
  This is a per-request memo, not a cross-request cache, so nothing goes stale.

- **D119a** `PortalSkeleton` is **deleted**, not kept. It exists only because a `loading.tsx`
  had no chrome to sit inside; once the chrome persists, redrawing it in a fallback would paint a
  grey header underneath the real one. Its own doc comment already says to delete rather than
  maintain it when this change lands. The three `loading.tsx` files render their body blocks
  directly against the `Skeleton` primitive.

- **D119** The draft "Coming soon" card moves to the **layout**, which renders it instead of
  `{children}`. Behaviour is unchanged from today, where `PortalShell`'s early return does the
  same thing. The page still executes and still loads its data — the layout can decline to render
  children but cannot stop the page component running — which is exactly what happens now.

## 4. What changes

| File | Change |
|---|---|
| `src/components/portal/PortalChrome.tsx` | New. Client. The header, both navs, the main wrapper, the banner and the draft card. |
| `src/components/portal/PortalShell.tsx` | Becomes a thin server wrapper that delegates to `PortalChrome`. Signature unchanged. |
| `src/lib/portal-nav.ts` | New. `activeNavHref`, `isPortalHome`. |
| `src/lib/portal.ts` | Both loaders wrapped in `cache()`. |
| `src/app/e/[slug]/a/[token]/layout.tsx` | Async; loads the attendee; renders `PortalChrome` around children. |
| 8 personal pages | Drop the `<PortalShell>` wrapper and its props; return the body. |
| 3 personal `loading.tsx` | Body-only; the chrome now persists and must not be drawn twice. |
| `src/components/portal/PortalSkeleton.tsx` | **Deleted.** Its only job was drawing chrome a `loading.tsx` had nowhere else to get; the chrome now persists. |
| `tests/portal-nav.test.ts` | New. |

## 5. Testing

Unit: `activeNavHref` and `isPortalHome` against the home route, each nav route, a route not in
the nav (`/stamps`), a trailing slash, a query string, and a basePath that prefixes another path.

Browser, at 375px: capture the bottom bar's DOM node, navigate by tapping a nav item, and assert
the captured node is still in the document and is the same object. That is the literal claim this
change makes — "the bar does not unmount" — and it is checkable, unlike an impression of flicker.
Then confirm the three converted pages still render correctly and the anonymous portal is
unchanged.

## 5a. Client-component compatibility

Checked before committing to D115: nothing the chrome needs is server-only. `lib/text`,
`lib/brand`, `PortalHeader` and `ui/icon` all import cleanly into a client component, and the
`event` it receives is a plain object from the database. Server components passed as `children`
through a client component are a supported pattern, so the anonymous pages keep working unchanged.

## 6. Risks

The personal portal is the surface every attendee sees on the day, and this change touches all 8
of its pages at once. The mitigation is that the pages lose code rather than gain it: each one
drops a wrapper and its props, and the markup inside is untouched.

The real exposure is `PortalChrome` being wrong about the active nav item or the home layout,
which is why D116 puts that decision in a tested pure function rather than in the component.

## 7. Not doing

The anonymous portal (D113). The register pages. Route groups. Any change to what a page fetches,
to `PortalShell`'s public signature, or to the desktop layout's shape.
