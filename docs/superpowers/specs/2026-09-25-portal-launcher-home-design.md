# Portal launcher home — design

Date: 2026-09-25
Status: built 2026-09-25 (not yet deployed)
Decisions D209–D215. Target: live before the KOM pilot (30 Sep 2026).
Mockups: https://claude.ai/artifact/5ZFbpyK7wszw3enKihBuZj

## 1. Why

On a phone the home page is a column of big tile cards, and the most time-sensitive thing an
attendee has — an activity they still have to pick — sits behind a bottom-bar slot marked by
a dot. The bar and the tiles are two navigations for one small portal. Attendees arrive from
a WhatsApp link, check one thing and leave: hub-and-spoke, not tab-hopping.

## 2. Decisions

- **D209** **The phone bottom bar is removed.** Below `md` the home page is the hub: every
  section is a round icon button on it. Every other page shows a **"‹ Home"** link at the left
  of the header (below `md` only), in place of the event name block; the logo mark stays on
  the right. In-page back links that go up one level (an activity's "← Activities") stay as
  they are. `<main>` loses its `pb-24` bar clearance and the toaster goes back to `bottom-4`.

- **D210** **Desktop is unchanged.** From `md` the header keeps its text nav (Home, Agenda or
  Info, Activities with its dot, Me) and the three-column dashboard keeps its shape. The only
  desktop change is the tile look (D212).

- **D211** **The launcher grid** = built-in sections first, then the resolved tiles in their
  saved order. Built-ins, same rules as the bar had:
  Agenda (`calendar`) or Info (`info`) when `hasInfo` → `/agenda`;
  Activities (`ticket`, dot when a choice is owed) when `activityNav.show`;
  Me (`user`) on the personal portal only. The public portal gets only Agenda/Info.
  Built-ins are phone-only (`md:hidden`) because desktop has them in the header.
  An admin route tile pointing at a built-in's route (`agenda`, `info`, `activities`, `me`)
  is dropped from the phone grid rather than shown twice. Worked out by one pure function,
  `launcherItems`, so the rules are unit-tested.

- **D212** **Round icon buttons replace tile cards** everywhere tiles render (phone and the
  desktop right column): a 56px circle in `bg-accent text-primary` with the icon, label
  underneath (max 2 lines), subtitle dropped from the button. Grid: 4 per row on a phone,
  container-query driven so the 300px desktop column also fits 4. External links still open
  in a new tab.

- **D213** **Tiles may carry an uploaded icon image.** `TileModule` and the `floor_plan`
  built-in gain optional `icon_image` (an `http(s)://` URL, checked on parse and on render, uploaded to `event-media`, image kind
  `tile-icon`). When set, the image fills the circle (`object-contain`) in place of the line
  icon; the preset icon stays the fallback and stays required. The tile editor gets an
  `ImageField` "Icon image (optional)" with the same replace/remove/Undo flow as the floor
  plan. The old image is deleted from storage on replace, on remove, and when the tile is
  deleted. jsonb, so no migration: rows without the field parse as before.

- **D214** **Activities on the home page (phone only):** a heading "Activities" with
  "See all N ›" to `/activities`, then a horizontal, scroll-snapping row of the same
  `ActivityCard` the Activities page uses (card width ~260px; a single activity takes the
  full width). Order is the Activities page's own: To choose (ringed), Booked, Open to you,
  Done — the ordering is extracted from `ActivitiesTab` into a pure function both use.
  At most 5 cards. The whole block is absent when the attendee can see no activities, and on
  the public portal. Data is loaded only when `activityNav.show`, so events without
  activities pay nothing new.

- **D215** **Phone home order:** banner, badge, announcement banner, launcher grid, breakout
  card, activities row. The grid goes above the breakout card so the navigation is on the
  first screen.

## 3. Out of scope

Merging the breakout card into the badge (shown in the mockup), a horizontally scrolling
icon strip, and a desktop activities block.

## 4. Files

- `src/lib/modules.ts` — `icon_image` on schemas, types, `Tile`; `resolveTiles` passes it.
- `src/lib/modules-form.ts` — read `icon_image` like the floor plan's `url`.
- `src/lib/launcher.ts` (new) — `launcherItems`.
- `src/lib/portal-activities.ts` — ordered-cards function shared by the tab and the home row.
- `src/lib/storage.ts` — `tile-icon` image kind.
- `src/app/admin/events/[id]/modules/page.tsx`, `actions.ts` — icon upload, cleanup on delete.
- `src/components/portal/TileGrid.tsx` → round `LauncherGrid`; `ActivitiesTab.tsx` exports
  `ActivityCard`; new `HomeActivities.tsx`.
- `src/components/portal/PortalChrome.tsx`, `a/[token]/layout.tsx` — bar removed, back link.
- `src/app/e/[slug]/a/[token]/page.tsx`, `src/app/e/[slug]/page.tsx` — new home order.

## 5. Testing

Unit (vitest): `launcherItems` (info vs agenda, activities hidden/dot, public portal, route
tile dedupe), `icon_image` parse/reject non-https/`resolveTiles` carries it, `moduleFromForm`
with an image, the shared activity ordering. Then `npm run lint`, `npm run build`, and a
phone-width browser check of home, a subpage's back link, and desktop — on a test event,
never `ecphub`.
