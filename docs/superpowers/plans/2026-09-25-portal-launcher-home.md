# Portal launcher home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the phone bottom bar and tile cards with a round-icon launcher on the portal home, add an activities card row to the phone home, and let admins upload an image per tile icon.

**Architecture:** Two new pure functions carry the rules — `launcherItems` (which icons, in which order, deduped) and `activityCards` (the Activities page's ordering, shared with the home row). Components only draw what those return. Chrome loses the phone bar and gains a phone-only "‹ Home" header on subpages; desktop is unchanged.

**Tech Stack:** Next.js (App Router, server components), Tailwind v4 with container queries, zod, vitest, Supabase storage (`event-media`).

**Spec:** `docs/superpowers/specs/2026-09-25-portal-launcher-home-design.md` (D209–D215)

## Global Constraints

- Desktop (`md` and up) keeps its header text nav and three-column dashboard (D210).
- `events.modules` is jsonb: new fields are optional; enums may gain but never lose entries.
- `icon_image` must match `^https?://` on parse and again on render (same rule as tile URLs).
- Test in the browser on any event except slug `ecphub`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: `icon_image` on tiles (data + admin)

**Files:**
- Modify: `src/lib/modules.ts` (schemas, `BuiltinModule`, `TileModule`, `Tile`, `resolveTiles`)
- Modify: `src/lib/modules-form.ts` (`moduleFromForm` reads `icon_image`)
- Modify: `src/lib/storage.ts` (`ImageKind` gains `"tile-icon"`)
- Modify: `src/app/admin/events/[id]/actions.ts` (`saveModuleAction` uploads; `deleteModuleAction` cleans up)
- Modify: `src/app/admin/events/[id]/modules/page.tsx` (`ImageField name="icon_image"`)
- Test: `tests/modules.test.ts`, `tests/modules-form.test.ts`

**Interfaces — Produces:**
- `Tile = { id; label; subtitle; href; icon: ModuleIcon; image: string | null; route: TileRoute | null; external }`
- `TileModule.icon_image?: string`, `BuiltinModule.icon_image?: string`

- [ ] Step 1: tests — a tile and the floor plan with `icon_image: "https://x/i.png"` parse; `"javascript:x"` throws `/icon_image/`; `resolveTiles` returns `image` (null when absent) and `route` (`"stamps"` for a route tile, null for url tiles / floor plan); `moduleFromForm` with `icon_image` set keeps it, and with it empty omits the key.
- [ ] Step 2: `npx vitest run tests/modules.test.ts tests/modules-form.test.ts` → FAIL.
- [ ] Step 3: implement. `icon_image: z.string().regex(SAFE_URL, …).optional()` on `builtinSchema` and `tileSchema`; `moduleFromForm` adds `...(t("icon_image") ? { icon_image: t("icon_image") } : {})` to both branches; `resolveTiles` sets `image: m.icon_image && SAFE_URL.test(m.icon_image) ? m.icon_image : null`.
- [ ] Step 4: tests PASS.
- [ ] Step 5: action — find the current row (`moduleId(m) === (isPlan ? "floor_plan" : id)`), pass its `icon_image` through `readWith` for the key `icon_image` (the posted value is a `File`), run `nextImage(formData, "icon_image", current, { kind: "tile-icon" })`, delete `icon.stale` after saving. `saveModules` gains an optional `stale` url deleted between the update and the redirect; `deleteModuleAction` passes the removed row's `icon_image`.
- [ ] Step 6: editor — `ImageField label="Icon image (optional)" name="icon_image"` in both the tile and floor-plan forms.
- [ ] Step 7: commit `feat(admin): optional image per tile icon`.

### Task 2: `launcherItems`

**Files:** Create `src/lib/launcher.ts`; Test `tests/launcher.test.ts`

**Interfaces — Produces:**
```ts
export type LauncherItem = { id: string; label: string; href: string; icon: IconName; image: string | null; external: boolean; dot: boolean; builtin: boolean };
export function launcherItems(input: { basePath: string; personal: boolean; hasInfo: boolean; activities?: ActivityNav; tiles: Tile[] }): LauncherItem[];
```
Rules: `Agenda`/`calendar` or (`hasInfo`) `Info`/`info` → `/agenda`; `Activities`/`ticket` (dot = `owed`) when `personal && activities?.show`; `Me`/`user` when `personal`; then tiles, dropping a route tile whose route is covered: `agenda` and `info` always, `activities` when the Activities item is shown, `me` when personal.

- [ ] Step 1: tests for each rule (info vs agenda, activities hidden / shown / dot, public portal gets one built-in, dedupe of covered routes, an uncovered route tile kept, tile order preserved after built-ins).
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS. Step 5: commit `feat(portal): launcher items`.

### Task 3: shared activity ordering

**Files:** Create `src/lib/activity-cards.ts`; Modify `src/components/portal/ActivitiesTab.tsx`; Test `tests/activity-cards.test.ts`

**Interfaces — Produces:**
```ts
export type ActivityCardItem = { activity: Activity; view: CardView; href: string; emphasis: boolean; section: ActivitySection };
export function activityCards(entries: { bookings: ActivityEntry[]; submissions: SubmissionEntry[]; passports: PassportEntry[] }, basePath: string): ActivityCardItem[];
```
Order: choose (emphasis) → booked → open (bookings, then forms not `ineligible`, then passports collecting) → done passports. Ineligible bookings dropped.
`ActivitiesTab` groups this list by `section`; `ActivityCard` is exported with an optional `className`.

- [ ] Steps: test ordering with one of each kind → FAIL → implement → PASS → refactor `ActivitiesTab` onto it → `npx vitest run` → commit `refactor(portal): one activity ordering for tab and home`.

### Task 4: chrome without the bar

**Files:** Modify `src/components/portal/PortalChrome.tsx`, `src/app/e/[slug]/a/[token]/layout.tsx`, `src/components/portal/PortalShellSkeleton.tsx`, `src/components/portal/ActivityActionDialog.tsx`, `src/app/e/[slug]/a/[token]/loading.tsx`

- [ ] Remove the phone `<nav>`; `<main>` `pb-24` → `pb-10`; skeleton loses its bar and `pb-24`; toaster back to default; `ActivityActionDialog` sticky `bottom-20` → `bottom-4`.
- [ ] Below `md` on non-home pages the header is `‹ Home` (link to `basePath`, `min-h-11`, `text-primary`) + `Mark` on the right; the full `PortalHeader` shows from `md`, and on the home page at all widths.
- [ ] Commit `feat(portal): drop the phone bottom bar for a Home link`.

### Task 5: launcher grid + home pages

**Files:** Create `src/components/portal/LauncherGrid.tsx`, `src/components/portal/HomeActivities.tsx`; Delete `src/components/portal/TileGrid.tsx`; Modify `src/app/e/[slug]/a/[token]/page.tsx`, `src/app/e/[slug]/page.tsx`

- [ ] `LauncherGrid({ items })`: `<nav aria-label="Sections">`, 4 columns (`@xl:grid-cols-6`), each a 56px `rounded-full bg-accent text-primary` circle — the `image` (`object-contain`) or the `Icon` — with a dot + sr-only text when `dot`, label under it (`line-clamp-2 text-xs font-bold`). External items open in a new tab. Renders nothing for an empty list.
- [ ] `HomeActivities({ cards, basePath })`: heading "Activities", "See all ›" to `/activities`, a `snap-x` row bleeding to the screen edge (`-mx-4 px-4 scroll-px-4`) of up to 5 `ActivityCard`s at `w-[260px]`, or full width for one.
- [ ] Personal home: load `loadActivityNav` and, when `show`, `loadActivityEntries`; phone order banner → badge → announcement → launcher → breakout → activities (phone-only blocks in the left column, `md:hidden`); desktop right column shows `LauncherGrid` of the non-built-in items only.
- [ ] Public home: same, without activities and Me.
- [ ] `loading.tsx`: skeleton rows match the new order (a 4-circle row in place of the tile grid).
- [ ] Commit `feat(portal): launcher home with activities row`.

### Task 6: verify

- [ ] `npx vitest run`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- [ ] Browser at 375px on a non-`ecphub` event: home, a subpage's back link, activity detail sticky button, then desktop width.
- [ ] Mark the spec as built.
