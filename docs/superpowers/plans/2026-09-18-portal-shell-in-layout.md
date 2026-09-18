# Portal shell in the layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the personal portal's header and bottom nav out of its 8 pages and into `a/[token]/layout.tsx`, so the chrome never unmounts during navigation.

**Architecture:** The chrome is extracted from `PortalShell` into a new client component `PortalChrome`, which derives the active nav item and the home layout from `usePathname()` instead of from per-page props. `PortalShell` keeps its exact signature and delegates, so the 6 anonymous portal pages are untouched. The personal layout loads the attendee and wraps children in `PortalChrome`; the 8 personal pages return their body directly.

**Tech Stack:** Next.js App Router (server + client components), React 19 `cache()`, Tailwind v4, Vitest (node environment, `tests/**/*.test.ts` only — no DOM).

**Spec:** `docs/superpowers/specs/2026-09-18-portal-shell-in-layout-design.md`

## Global Constraints

- **Personal portal only.** Do not touch `src/app/e/[slug]/{page,agenda,announcements,info,plan,stamps}` or `src/app/e/[slug]/register/**`. (D113)
- **`PortalShell`'s exported signature must not change.** The 6 anonymous pages call it with `event`, `basePath`, `personal`, `current`, `hero`, `dashboard` and must keep compiling untouched. (D114)
- **No new DOM-testing dependency.** `vitest.config.mts` is `environment: "node"` with `include: ["tests/**/*.test.ts"]`. Only `.ts` test files are collected — a `.tsx` test will be silently ignored. (spec §5)
- **Verification commands**, all run from the repo root:
  - `npx vitest run` — expect all tests passing
  - `npx tsc --noEmit` — expect no output
  - `npx eslint` — expect no output
  - `npx next build` — expect `✓ Compiled successfully`
- **Commit message trailer** on every commit in this plan:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- **A dev server is already running on port 3000** from another session against this same checkout; HMR picks up edits. Do not start a second one. Browser verification URLs use event slug `ecpkom` and attendee token `6dv9gkdhpe99`.

---

### Task 1: Pure pathname helpers

**Files:**
- Create: `src/lib/portal-nav.ts`
- Test: `tests/portal-nav.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `activeNavHref(pathname: string, basePath: string): string | null` — the nav href that should be marked current (`""`, `"/agenda"`, `"/info"`, `"/me"`), or `null` when the current page is not a nav destination.
  - `isPortalHome(pathname: string, basePath: string): boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/portal-nav.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { activeNavHref, isPortalHome } from "@/lib/portal-nav";

const BASE = "/e/ecpkom/a/6dv9gkdhpe99";

describe("isPortalHome", () => {
  it("is true only for the base path itself", () => {
    expect(isPortalHome(BASE, BASE)).toBe(true);
    expect(isPortalHome(`${BASE}/agenda`, BASE)).toBe(false);
  });

  it("tolerates a trailing slash", () => {
    // Next normalises most of these away, but a hand-typed or shared link may not be.
    expect(isPortalHome(`${BASE}/`, BASE)).toBe(true);
  });

  it("is false for a path that merely starts with the base path", () => {
    // The tokens are 12 chars of [a-z0-9]; one can be a prefix of nothing else, but the
    // anonymous portal's basePath ("/e/ecpkom") IS a prefix of every personal path.
    expect(isPortalHome(`${BASE}/me`, "/e/ecpkom")).toBe(false);
  });
});

describe("activeNavHref", () => {
  it("marks the home tab on the base path", () => {
    expect(activeNavHref(BASE, BASE)).toBe("");
  });

  it("marks each nav destination", () => {
    expect(activeNavHref(`${BASE}/agenda`, BASE)).toBe("/agenda");
    expect(activeNavHref(`${BASE}/info`, BASE)).toBe("/info");
    expect(activeNavHref(`${BASE}/me`, BASE)).toBe("/me");
  });

  it("marks nothing on a page that is not in the nav", () => {
    // stamps, plan, seat and announcements are reached from tiles, not the bar. The old
    // code said `current={null}` for these; nothing should light up.
    for (const p of ["/stamps", "/plan", "/seat", "/announcements"]) {
      expect(activeNavHref(`${BASE}${p}`, BASE), p).toBeNull();
    }
  });

  it("ignores a query string", () => {
    // The agenda links to itself with ?day=2026-09-30 to switch days.
    expect(activeNavHref(`${BASE}/agenda?day=2026-09-30`, BASE)).toBe("/agenda");
  });

  it("marks the parent nav item for a deeper path under it", () => {
    expect(activeNavHref(`${BASE}/agenda/anything`, BASE)).toBe("/agenda");
  });

  it("returns null when the pathname is not under the base path at all", () => {
    expect(activeNavHref("/admin/events/123", BASE)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/portal-nav.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/portal-nav"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/portal-nav.ts`:

```ts
/**
 * Which portal page the reader is on, worked out from the URL rather than from a prop.
 *
 * `PortalShell` used to be told by each page: `current="/agenda"`, `hero`, `dashboard`. A
 * layout cannot be told — it does not know which child is rendering — so the URL becomes the
 * source, which is also the one that cannot disagree with where the reader actually is.
 *
 * These live apart from the component because the cases that break them are string-handling
 * cases — a trailing slash, a query string, one path being a prefix of another — and the test
 * suite has no DOM to reach a component with.
 */

/** The nav hrefs, longest first, so `/me` cannot shadow a longer path that starts with it. */
const NAV_HREFS = ["/agenda", "/info", "/me"] as const;

/** The path with its query and trailing slash removed. */
function normalise(pathname: string): string {
  const path = pathname.split("?")[0].split("#")[0];
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/** The part of the path below `basePath`, or null when the path is not under it. */
function suffix(pathname: string, basePath: string): string | null {
  const path = normalise(pathname);
  const base = normalise(basePath);
  if (path === base) return "";
  return path.startsWith(`${base}/`) ? path.slice(base.length) : null;
}

export function isPortalHome(pathname: string, basePath: string): boolean {
  return suffix(pathname, basePath) === "";
}

/**
 * The nav href to mark as current, or null for a page the bar does not lead to — the booth
 * passport, the floor plan, the seat card, the announcement list. Those used to pass
 * `current={null}` or nothing at all, and nothing lit up; the same holds here.
 */
export function activeNavHref(pathname: string, basePath: string): string | null {
  const rest = suffix(pathname, basePath);
  if (rest === null) return null;
  if (rest === "") return "";
  return NAV_HREFS.find((href) => rest === href || rest.startsWith(`${href}/`)) ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/portal-nav.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/portal-nav.ts tests/portal-nav.test.ts
git commit -m "feat(portal): derive the active nav item from the URL

The shell is about to move into the layout, which cannot be told by a page
which of its children is rendering. The URL already knows.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Memoise the portal loaders

**Files:**
- Modify: `src/lib/portal.ts` (whole file, 20 lines)

**Interfaces:**
- Consumes: nothing.
- Produces: `loadPortalEvent(slug)` and `loadPortalAttendee(slug, token)` keep identical signatures and return types; they are now deduplicated within a single request.

**Why this task exists:** Task 4 makes the layout call `loadPortalAttendee` while the page still calls it too. Without this, every personal portal request runs `getEventBySlug` and `findByToken` twice. (D118)

- [ ] **Step 1: Replace the file**

Replace the whole of `src/lib/portal.ts` with:

```ts
import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getEventBySlug } from "@/lib/db/events";
import { findByToken } from "@/lib/db/attendees";
import { isValidToken } from "@/lib/tokens";
import type { Attendee, Event } from "@/lib/types";

/**
 * Wrapped in `cache()` because the personal layout and the page it wraps both load the same
 * attendee on the same request: the layout needs the event for the header and nav, the page
 * needs the attendee for its body, and the App Router gives a layout no way to hand anything
 * to its children short of context — which would make every page a client component.
 *
 * This is a per-request memo, not a cross-request cache. Nothing goes stale, and the second
 * caller costs nothing.
 */
export const loadPortalEvent = cache(async (slug: string): Promise<Event> => {
  const ev = await getEventBySlug(slug);
  if (!ev) notFound();
  return ev;
});

export const loadPortalAttendee = cache(
  async (slug: string, token: string): Promise<{ event: Event; attendee: Attendee }> => {
    const event = await loadPortalEvent(slug);
    if (!isValidToken(token)) notFound();
    const attendee = await findByToken(event.id, token);
    if (!attendee) notFound();
    return { event, attendee };
  },
);
```

- [ ] **Step 2: Verify nothing broke**

Run: `npx tsc --noEmit && npx eslint && npx vitest run`
Expected: no output from the first two; all tests pass.

- [ ] **Step 3: Verify the portal still renders**

Run: `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/e/ecpkom/a/6dv9gkdhpe99"`
Expected: `200`

- [ ] **Step 4: Commit**

```bash
git add src/lib/portal.ts
git commit -m "perf(portal): memoise the portal loaders per request

The layout is about to load the attendee that its page already loads. Without
this that is two round trips to Supabase for one page view.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Extract PortalChrome

**Files:**
- Create: `src/components/portal/PortalChrome.tsx`
- Modify: `src/components/portal/PortalShell.tsx` (whole file)

**Interfaces:**
- Consumes: `activeNavHref`, `isPortalHome` from Task 1.
- Produces: `PortalChrome({ event, basePath, personal, children }: { event: Event; basePath: string; personal: boolean; children: React.ReactNode })` — a client component. `PortalShell` keeps its current props exactly; `current`, `hero` and `dashboard` are still accepted and now ignored.

**Read first:** `src/components/portal/PortalShell.tsx` in full. Task 3 moves its body almost verbatim — the same class strings, the same comments. Do not retype the markup from memory; copy it.

- [ ] **Step 1: Create the client component**

Create `src/components/portal/PortalChrome.tsx`. Copy the existing `PortalShell` body into it, making exactly these changes:

1. Add `"use client";` as the first line.
2. Add `import { usePathname } from "next/navigation";` and `import { activeNavHref, isPortalHome } from "@/lib/portal-nav";`.
3. Props become `{ event, basePath, personal, children }` — drop `current`, `hero`, `dashboard`.
4. Inside the component, before the draft check:
   ```tsx
   const pathname = usePathname() ?? basePath;
   const current = activeNavHref(pathname, basePath);
   // `hero` and `dashboard` were only ever true together, on the home route.
   const home = isPortalHome(pathname, basePath);
   ```
5. Replace every use of `dashboard` with `home`, and every use of `hero` with `home`.
6. Keep the draft early return, the skip link, the header, the desktop nav, `<main>`, and the mobile nav byte-for-byte otherwise.

- [ ] **Step 2: Make PortalShell delegate**

Replace the whole of `src/components/portal/PortalShell.tsx` with:

```tsx
import type { Event } from "@/lib/types";
import { PortalChrome } from "./PortalChrome";

/**
 * The portal's chrome, for the pages that still render it themselves.
 *
 * The personal portal does not: its chrome lives in `a/[token]/layout.tsx` so the header and
 * the bottom bar survive a navigation instead of being rebuilt by whichever page you land on.
 * The anonymous portal still calls this, because moving its chrome into a layout needs a route
 * group — `e/[slug]/layout.tsx` also wraps the personal pages and the register pages — and that
 * is a separate change (D113).
 *
 * `current`, `hero` and `dashboard` are accepted and ignored. PortalChrome reads the URL now,
 * which is the same answer these props were carrying by hand. They stay in the signature so
 * the anonymous pages did not all have to change for a refactor that is not about them; when
 * the anonymous portal moves too, this component and these props go together.
 */
export function PortalShell({ event, basePath, personal, children }: {
  event: Event;
  basePath: string;
  personal: boolean;
  current?: "" | "/agenda" | "/me" | "/info" | null;
  hero?: boolean;
  dashboard?: boolean;
  children: React.ReactNode;
}) {
  return (
    <PortalChrome event={event} basePath={basePath} personal={personal}>
      {children}
    </PortalChrome>
  );
}
```

- [ ] **Step 3: Verify the build and the anonymous portal**

Run: `npx tsc --noEmit && npx eslint && npx next build`
Expected: no output from the first two; `✓ Compiled successfully`.

Then check the anonymous portal is visually unchanged — it is the half this task must not disturb:

Run: `curl -s "http://localhost:3000/e/ecpkom/agenda" | grep -c 'aria-label="Sections"'`
Expected: `2` (the desktop nav and the mobile bar, as before).

- [ ] **Step 4: Verify the desktop home is still the wide dashboard**

The `dashboard` prop widened the shell to `xl:max-w-[1200px]` on the home route only; `home` must now do the same.

Run: `curl -s "http://localhost:3000/e/ecpkom" | grep -c 'xl:max-w-\[1200px\]'`
Expected: `1` or more.

Run: `curl -s "http://localhost:3000/e/ecpkom/agenda" | grep -c 'xl:max-w-\[1200px\]'`
Expected: `0` — the agenda is not a dashboard.

If either number is wrong, `home` is not being computed or applied where `dashboard` was. Fix before committing.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal/PortalChrome.tsx src/components/portal/PortalShell.tsx
git commit -m "refactor(portal): extract PortalChrome, reading the route from the URL

One implementation of the header and navs, so the layout and the anonymous
pages cannot drift apart while both exist. PortalShell keeps its signature and
delegates; current/hero/dashboard are now ignored.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The personal layout renders the chrome

**Files:**
- Modify: `src/app/e/[slug]/a/[token]/layout.tsx` (whole file, 3 lines)

**Interfaces:**
- Consumes: `PortalChrome` from Task 3, `loadPortalAttendee` from Task 2.
- Produces: nothing new. After this task the personal pages render chrome **twice** — once from the layout, once from their own `PortalShell` — which Task 5 removes. This is deliberate: the layout is proven to work before 8 pages are edited.

- [ ] **Step 1: Replace the layout**

Replace the whole of `src/app/e/[slug]/a/[token]/layout.tsx` with:

```tsx
import { loadPortalAttendee } from "@/lib/portal";
import { PortalChrome } from "@/components/portal/PortalChrome";

/**
 * The personal portal's chrome lives here rather than in each page, so the header and the
 * bottom bar are rendered once and stay put. A page below only renders its own body; tapping
 * a nav item swaps that body and leaves the bar it was tapped on alone.
 *
 * `loadPortalAttendee` is memoised per request, so this costs nothing that the page below was
 * not already paying (D118).
 */
export default async function PersonalLayout({ children, params }: {
  children: React.ReactNode;
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  const { event } = await loadPortalAttendee(slug, token);
  return (
    <PortalChrome event={event} basePath={`/e/${slug}/a/${token}`} personal>
      {children}
    </PortalChrome>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit && npx eslint`
Expected: no output.

- [ ] **Step 3: Verify the doubling is present and expected**

Run: `curl -s "http://localhost:3000/e/ecpkom/a/6dv9gkdhpe99/agenda" | grep -c 'aria-label="Sections"'`
Expected: `4` — two navs from the layout and two from the page's own shell. This confirms the layout is rendering. Task 5 brings it back to `2`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/e/[slug]/a/[token]/layout.tsx"
git commit -m "feat(portal): render the personal chrome from the layout

Doubled with the pages' own shells for one commit; the next removes those.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Strip PortalShell from the 8 personal pages

**Files, each modified:**
- `src/app/e/[slug]/a/[token]/page.tsx` — import line 8, open 41, close 98
- `src/app/e/[slug]/a/[token]/agenda/page.tsx` — import 7, open 21, close 24
- `src/app/e/[slug]/a/[token]/announcements/page.tsx` — import 3, open 10, close 13
- `src/app/e/[slug]/a/[token]/info/page.tsx` — import 3, open 11, close 40
- `src/app/e/[slug]/a/[token]/me/page.tsx` — import 2, open 60, close 138
- `src/app/e/[slug]/a/[token]/plan/page.tsx` — import 2, open 13, close 28
- `src/app/e/[slug]/a/[token]/seat/page.tsx` — import 2, open 14, close 27
- `src/app/e/[slug]/a/[token]/stamps/page.tsx` — import 4, open 15, close 17

**Interfaces:**
- Consumes: the layout from Task 4.
- Produces: 8 pages that return their body only.

**The edit, applied identically to each file:**
1. Delete the `import { PortalShell } ...` line.
2. Replace the `<PortalShell ...>` opening tag with `<>`.
3. Replace the closing `</PortalShell>` with `</>`.
4. Leave everything between them, and every other import, exactly as it is.

**Do not** delete now-unused local variables without checking: `basePath` is still used inside the body of `page.tsx`, `agenda/page.tsx`, `me/page.tsx`, `seat/page.tsx` and `plan/page.tsx` for links. Let `npx eslint` tell you if one has genuinely become unused.

- [ ] **Step 1: Edit all 8 files**

Worked example — `src/app/e/[slug]/a/[token]/seat/page.tsx` becomes:

```tsx
import { loadPortalAttendee } from "@/lib/portal";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { floorPlanUrl } from "@/lib/modules";
import { fieldValue } from "@/lib/attendee-values";

export default async function Seat({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const basePath = `/e/${slug}/a/${token}`;
  const table = fieldValue(attendee, "table_no");
  return (
    <>
      <h1 className="mb-3 text-xl font-extrabold">My seat</h1>
      {table ? (
        <div className="mb-4 rounded-[14px] bg-foreground p-6 text-center text-white">
          <div className="text-xs font-bold uppercase tracking-[0.08em] text-gray-300">Table</div>
          <div className="text-6xl font-extrabold text-primary">{table}</div>
        </div>
      ) : (
        <p className="mb-4 text-sm text-muted-foreground">Your seat will be shown here once seating is confirmed.</p>
      )}
      {floorPlanUrl(event) && (
        <Link href={`${basePath}/plan`} className={buttonVariants({ variant: "outline" })}>Open floor plan</Link>
      )}
    </>
  );
}
```

> The other seven files take the same three edits. Work from each file as it stands rather than
> from this example — the bodies differ, and the point of the task is that nothing inside the
> wrapper changes.

- [ ] **Step 2: Verify no PortalShell remains under the personal portal**

Run: `grep -rn "PortalShell" "src/app/e/[slug]/a"`
Expected: no output.

Run: `grep -rln "PortalShell" src/app/e`
Expected: exactly the 6 anonymous pages — `[slug]/page.tsx`, `[slug]/agenda/page.tsx`, `[slug]/announcements/page.tsx`, `[slug]/info/page.tsx`, `[slug]/plan/page.tsx`, `[slug]/stamps/page.tsx`.

- [ ] **Step 3: Verify the chrome is back to one copy**

Run: `curl -s "http://localhost:3000/e/ecpkom/a/6dv9gkdhpe99/agenda" | grep -c 'aria-label="Sections"'`
Expected: `2`.

- [ ] **Step 4: Verify every personal page still renders**

```bash
for p in "" /agenda /announcements /info /me /plan /seat /stamps; do
  printf "%-16s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3000/e/ecpkom/a/6dv9gkdhpe99$p")"
done
```
Expected: `200` for every one.

- [ ] **Step 5: Full check**

Run: `npx tsc --noEmit && npx eslint && npx vitest run && npx next build`
Expected: clean; all tests pass; `✓ Compiled successfully`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/e/[slug]/a/[token]"
git commit -m "refactor(portal): personal pages render their body, not the chrome

Eight pages lose a wrapper and its props. The markup inside is untouched.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Skeletons lose their chrome

**Files:**
- Delete: `src/components/portal/PortalSkeleton.tsx`
- Modify: `src/app/e/[slug]/a/[token]/loading.tsx`
- Modify: `src/app/e/[slug]/a/[token]/agenda/loading.tsx`
- Modify: `src/app/e/[slug]/a/[token]/me/loading.tsx`

**Interfaces:**
- Consumes: the layout from Task 4. The chrome now sits outside the Suspense boundary, so a fallback that draws chrome would paint a grey header beneath the real one.
- Produces: nothing.

- [ ] **Step 1: Rewrite the three loading files**

In each, remove the `PortalSkeleton` import and wrapper, and replace it with a plain `<div>` carrying the status attributes the wrapper used to provide. The body blocks stay exactly as they are.

`src/app/e/[slug]/a/[token]/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeletons";

/**
 * The personal home's body. The header and the bottom bar are the layout's now and stay on
 * screen, so this covers only what is being replaced.
 *
 * Also the fallback for every personal route without one of its own — plan, seat, stamps,
 * info, announcements — because a `loading.tsx` covers its own segment and all of the ones
 * nested under it.
 */
export default function PersonalPortalLoading() {
  return (
    <div className="flex flex-col gap-3.5" role="status" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-[188px] rounded-[20px]" />
      <Skeleton className="h-[104px] rounded-xl" />
      <Skeleton className="h-[72px] rounded-xl" />
      <Skeleton className="h-[92px] rounded-xl" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[124px] rounded-xl" />)}
      </div>
    </div>
  );
}
```

`src/app/e/[slug]/a/[token]/agenda/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeletons";

/** The agenda's body: heading, the day tabs, then the day's sessions. */
export default function PersonalAgendaLoading() {
  // Sessions vary in height because they carry a description or they do not, and a column of
  // identical blocks reads as a table rather than as an agenda.
  const heights = ["h-[132px]", "h-[116px]", "h-[132px]", "h-[76px]", "h-[124px]"];
  return (
    <div className="flex flex-col gap-4" role="status" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-7 w-32" />
      <div className="flex gap-4 border-b border-border pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="flex flex-col gap-3">
        {heights.map((h, i) => <Skeleton key={i} className={`${h} rounded-xl`} />)}
      </div>
    </div>
  );
}
```

`src/app/e/[slug]/a/[token]/me/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeletons";

/** Me: the identity card with its badge button, the contact block, then the answers list. */
export default function PersonalMeLoading() {
  return (
    <div
      className="flex flex-col gap-3.5 md:mx-auto md:max-w-2xl md:gap-5"
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6">
        <Skeleton className="size-16 rounded-full" />
        <Skeleton className="h-6 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <Skeleton className="mt-1 h-11 w-full rounded-lg sm:w-64" />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-4 w-full" />
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
        <Skeleton className="h-3 w-36" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-6">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Delete the component**

```bash
rm src/components/portal/PortalSkeleton.tsx
```

- [ ] **Step 3: Verify nothing still imports it**

Run: `grep -rn "PortalSkeleton" src`
Expected: no output.

- [ ] **Step 4: Verify the skeleton streams without chrome**

With the personal home artificially slowed, the first flush must carry the fallback and exactly one nav pair (the layout's).

```bash
curl -s --max-time 2 "http://localhost:3000/e/ecpkom/a/6dv9gkdhpe99?probe=$RANDOM" > /tmp/flush.html
grep -c 'aria-label="Loading"' /tmp/flush.html   # expect 1
grep -c 'aria-label="Sections"' /tmp/flush.html  # expect 2
rm /tmp/flush.html
```

If the page is too fast for `--max-time 2` to catch the fallback, temporarily add
`await new Promise((r) => setTimeout(r, 9000));` as the first line of
`src/app/e/[slug]/a/[token]/page.tsx`, re-run, then **remove it and confirm with
`git diff` that the file is unchanged.**

- [ ] **Step 5: Full check**

Run: `npx tsc --noEmit && npx eslint && npx vitest run && npx next build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(portal): skeletons cover the body, not the chrome

The chrome persists now, so a fallback that drew it would paint a grey header
under the real one. PortalSkeleton existed only to supply chrome a loading.tsx
had nowhere else to get, and goes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Prove the bar does not unmount

**Files:** none changed. This task is verification only, and it checks the one claim the whole change is making.

**Interfaces:**
- Consumes: everything above.
- Produces: evidence, and a decision to stop or to go back.

- [ ] **Step 1: Open the portal at phone width**

Use the Browser pane: `resize_window` preset `mobile`, then navigate to
`http://localhost:3000/e/ecpkom/a/6dv9gkdhpe99`.

- [ ] **Step 2: Tag the bottom bar, navigate, and check identity**

Run via `javascript_tool`:

```js
// Tag the live node, then navigate by tapping the nav the way an attendee would.
const bar = document.querySelector('nav[aria-label="Sections"].fixed');
bar.dataset.probe = 'kept';
document.querySelector('nav[aria-label="Sections"].fixed a[href$="/agenda"]').click();
await new Promise((r) => setTimeout(r, 1500));
const after = document.querySelector('nav[aria-label="Sections"].fixed');
({
  url: location.pathname,
  // If the bar unmounted and remounted, the tag is gone: React built a new element.
  sameNode: after === bar,
  tagSurvived: after?.dataset.probe === 'kept',
  agendaIsCurrent: after?.querySelector('a[href$="/agenda"]')?.getAttribute('aria-current'),
})
```

Expected: `url` ends `/agenda`, `sameNode: true`, `tagSurvived: "kept"`, `agendaIsCurrent: "page"`.

`sameNode: false` means the chrome is still unmounting — the change has not achieved its goal. Stop and investigate before continuing; the most likely cause is a page still rendering its own `PortalShell` (re-run Task 5 Step 2).

- [ ] **Step 3: Check the active item on a non-nav page**

```js
document.querySelector('a[href$="/stamps"]')?.click();
await new Promise((r) => setTimeout(r, 1500));
[...document.querySelectorAll('nav[aria-label="Sections"] a[aria-current]')].map((a) => a.getAttribute('href'))
```

Expected: `[]` — the Booth Passport is not a nav destination, so nothing is marked.

- [ ] **Step 4: Check the anonymous portal is untouched**

Navigate to `http://localhost:3000/e/ecpkom/agenda` and confirm the header, the day tabs and the bottom bar all render as before. This half was not converted (D113) and must look exactly as it did.

- [ ] **Step 5: Reset the viewport**

`resize_window` preset `desktop`.

- [ ] **Step 6: Commit nothing; report**

No code changes in this task. Report the four results from Steps 2–4.

---

## Self-Review

**Spec coverage:**

| Spec | Task |
|---|---|
| D113 anonymous deferred | Global Constraints; Task 3 Step 3, Task 5 Step 2 and Task 7 Step 4 all assert it is untouched |
| D114 chrome extracted once, `PortalShell` signature unchanged | Task 3 |
| D115 client component reading `usePathname()` | Task 3 Step 1 |
| D116 pure functions in `portal-nav.ts` | Task 1 |
| D117 layout loads, pages keep loading | Task 4 |
| D118 `cache()` | Task 2 |
| D119 draft card in the layout | Task 3 Step 1 point 6 — the draft early return moves with the chrome into `PortalChrome`, which the layout renders |
| D120 `PortalSkeleton` deleted | Task 6 |
| §5 testing: unit cases | Task 1 Step 1 — home, each nav route, non-nav route, trailing slash, query string, prefix basePath |
| §5 testing: same-node check | Task 7 Step 2 |

**Placeholder scan:** none. Every code step carries the literal code; the one "copy it from the real file" instruction (Task 3 Step 1) is deliberate, because retyping 60 lines of Tailwind from memory is how class strings get corrupted, and it is paired with exact verification in Steps 3 and 4.

**Type consistency:** `activeNavHref` and `isPortalHome` are named identically in Task 1's implementation, Task 1's test and Task 3's usage. `PortalChrome`'s props (`event`, `basePath`, `personal`, `children`) match between Task 3's definition, Task 3's `PortalShell` delegation and Task 4's layout.

**One risk the plan deliberately accepts:** Task 4 leaves the tree in a doubled-chrome state for one commit. That is preferred to a single enormous commit, because it proves the layout works before 8 pages are edited, and Task 5 Step 3 has an exact assertion (`2`) that catches it if the cleanup is incomplete.
