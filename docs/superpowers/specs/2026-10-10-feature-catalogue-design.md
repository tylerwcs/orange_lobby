# Feature catalogue — design

**Status: approved in chat on 10 Oct 2026. Not built yet.**

ECP Hub is being launched as a product. Not every event uses every feature, so each event now
records which features it has. One catalogue in code lists what ECP Hub sells. Each event stores
the add-ons it bought, plus any custom modules. Three things read that list:

- **The admin**, which hides what the event doesn't have.
- **The organiser setup page**, which builds its checklist from it (see
  `2026-10-10-organiser-setup-design.md`).
- **A quotation and ordering site**, later. It will write the list, and it gets its own design.

This is the first of three projects: catalogue, then setup page, then quotation site.

## Where we are (checked 10 Oct 2026)

- **There are no feature flags.** Every feature is available on every event.
  - The only per-event choice is the home tiles (`src/lib/modules.ts`: up to 16, shown or hidden,
    reordered). Tiles decide what attendees see, not what the event has.
- **The admin shows everything to everyone.**
  - The event sidebar is `src/components/admin/AppSidebar.tsx`, rendered by
    `src/app/admin/events/[id]/layout.tsx`. It lists every area for every event.
  - Settings has six tabs: Event details, Registration form, Checkpoints, Address,
    Committee alerts, Danger zone (`settings/page.tsx:107-112`).
- **Activity kinds:** `booking`, `submission`, `passport`, with `KIND_META` in
  `src/features/activities/kinds/meta.ts` (D415). The New activity menu reads it.
- **Game kinds:** `tap_race`, `survival`, `draw` (`src/features/games/config.ts:8`).
- **Custom domains** are built (`src/features/domains`, the Address tab in settings, D424–D432).
- **Slido embedding is not built.** An external-link tile is the stopgap.

## Goals and non-goals

**Goals:** one place in code that defines every feature. An event's add-ons are stored and can
be changed by an admin. The admin hides areas the event doesn't have. Hiding never loses data.

**Not in this project:**

- **Prices and packages.** These belong to the quotation site.
- **Gating the attendee portal.** The portal shows only what has been set up, so it needs none.
- **The Slido embed.** It gets its own small task after this one.
- **Per-admin permissions.**

## The catalogue

**Base, on for every event:**

- Attendee portal and personal links
- Attendee list
- Agenda
- Event info and floor plan
- Announcements
- Exports
- Self-registration
- Check-in
- Groups
- Breakout rooms

**Add-ons:**

| Key | Name | Covers | Admin areas it unlocks |
| --- | --- | --- | --- |
| `whatsapp` | WhatsApp messaging | Sending portal links and announcements by WhatsApp | WhatsApp in the sidebar |
| `booking` | Session booking | Time slots with capacity | The `booking` activity kind |
| `engagement` | Engagement activities | Stamp passport, submissions, scored challenges | The `passport` and `submission` activity kinds, and Submissions in the sidebar |
| `live_games` | Live games | Tap race, Last one standing | The `tap_race` and `survival` game kinds |
| `lucky_draw` | Lucky draw | Slot machine, wheel, mosaic, card round | The `draw` game kind |
| `custom_domain` | Custom domain | The event's own address | The Address tab in settings |
| `slido` | Slido embedding | Slido inside the portal (embed not built yet) | Nothing yet |
| `custom` | Custom module | Bespoke work, described per event | Nothing (see D436) |

## Decisions

### D433 — The catalogue is code, in `src/features/catalogue/`

- `catalogue.ts` exports `FEATURES`, keyed by feature key. Each entry holds:
  - `name` and `summary`
  - `tier`: `"base"` or `"addon"`
  - `unlocks`: the admin areas it opens, as typed keys (sidebar items, activity kinds, game
    kinds, settings tabs)
  - `setup`: the setup steps and guide cards it adds. The setup design defines their shape.
- `AddonKey` is the union of add-on keys. A `Record<AddonKey, …>` anywhere fails the build when
  a key is added and not handled.
- **Why code, not a table:** each feature maps to code that either exists or doesn't. A new
  feature ships with a deploy anyway.

### D434 — An event's add-ons are rows in `event_features`

- Columns: `event_id`, `feature` (text, checked against the add-on keys) and `created_at`.
  The primary key is `(event_id, feature)`.
- Base features are never stored. They are always on.
- RLS is enabled with no policies, the same as every other table. Reads and writes go through
  the service client.

### D435 — Existing events get every add-on

The migration inserts a row for every add-on except `custom`, for every existing event. So KOM,
`ecphub` and the test events lose nothing. New events start with no add-ons.

### D436 — Custom modules are rows in `event_custom_modules`

- Columns: `id`, `org_id`, `event_id`, `name` (required, max 80), `description` (max 2,000),
  `sort_order` and `created_at`.
- An event can have several.
- Nothing in the code is gated by them. They appear on the setup page as guide cards, and the
  quotation site will price them.
- An event "has" the `custom` add-on when it has at least one custom module. `custom` is never
  stored in `event_features`.

### D437 — One reader: `eventFeatures(eventId)`

- Returns `{ has(key), addons, custom }`. Memoised per request with `cache()`, like
  `requireEvent`.
- The admin layout loads it once and passes it to the sidebar.
- Pages and server actions call `has()` themselves.
- Helpers derive the allowed activity kinds and game kinds from `unlocks`, so the New activity
  menu and the New game menu list only those.

### D438 — Hidden areas say why, and offer Turn on

- The sidebar and the settings tabs leave out what the event doesn't have.
- A hidden page opened by URL renders "Not part of this event", with the feature's name and a
  Turn on button. It does not render a 404. The same applies to an existing activity or game
  whose kind is no longer allowed.
- Server actions refuse writes for a feature the event doesn't have, with the same sentence.
  The check is `requireFeature(event, key)`, which sits beside `requireEvent` in
  `src/lib/db/events.ts`, so every action asks the same way.
- **Reads are never blocked.** Exports, the attendee portal and the LED display keep working on
  data from a feature that was turned off.

### D439 — Turning a feature off never deletes anything

- Turning an add-on off deletes its `event_features` row and nothing else.
- Activities, games, submissions, domains and templates all stay. Turning the add-on back on
  shows them again.
- The Features tab says this beside each toggle.

### D440 — A Features tab in settings

- It goes first in the settings tabs, in the approved admin style:
  - one row per add-on, with name, summary and an on/off switch
  - then the custom modules as a table-style list with a ⋯ menu (Edit, Remove), and an Add
    custom module button
- Base features are listed once, read-only, under "Included with every event".
- **Custom domain off while the event has a live domain:** the switch asks for confirmation
  first. Attendee links stay on the domain, because D439 deletes nothing. This keeps a
  mis-click from looking like the domain broke.

## Testing

- **Vitest, in `tests/catalogue/`:**
  - every add-on key appears in `FEATURES`
  - `unlocks` resolves to real activity kinds, game kinds and sidebar keys
  - the allowed-kind helpers return the right subsets
  - `has()` treats base features as always on, and `custom` as on exactly when there is a
    custom module
- **`scripts/check-catalogue.mjs`, a database check:**
  - the migration backfill gives an existing event every add-on except `custom`
  - turning off and on again keeps an activity and its submissions
  - a write action is refused for a missing feature
- **A browser walk-through on a test event, never `ecphub`:**
  1. Turn each add-on off and confirm its area disappears.
  2. Open the old URL and confirm the "Not part of this event" page.
  3. Turn it back on and confirm everything returns.

## Order of work

1. Migration: both tables and the backfill.
2. `src/features/catalogue/`: catalogue, reader and helpers, with tests.
3. The settings Features tab.
4. Gating, area by area: sidebar, settings tabs, activity kinds, game kinds, action guard,
   "Not part of this event" page.
5. Database check and browser walk-through.

## Open questions

- **Prices, packages and per-attendee pricing.** Settled in the quotation site design.
- **Number clash.** Another session may have used D433–D440 by the time this is built.
  If so, renumber when committing.
