# Modular features — design

**Status: approved in chat on 7 Oct 2026.** The lint rule (D403) is in. No restructuring happens
before the 1,000-pax event in November 2026.

ECP Hub keeps growing by features: activities, passports, groups, games, Project Mileage, WhatsApp.
The app runs well today, and D401 removed the 1,000-row ceiling. The risk now is **cost of change**.
Each new feature touches more files than the last, and each one is easier to break by accident
while working on something else. This doc sets out how new features are built, and how existing
ones move over, so that the app stays easy to change and keeps performing as events get bigger.

## Where we are (checked 7 Oct 2026)

- **Code is organised by layer, not by feature.** `src/lib/` is one flat folder of about 100
  files. A feature's code is spread across `src/lib/<x>.ts`, `src/lib/db/<x>.ts`,
  `src/components/admin/`, `src/components/portal/` and its routes. Project Mileage touched about
  40 files.
- **Activity kinds are the biggest hotspot.** `ActivityKind = "booking" | "submission" |
  "passport"` (`src/lib/types.ts:231`) is branched on in about 42 files, in about 107 places.
  - The kind decides admin forms, the detail page, tabs, list rows, portal cards, the portal
    detail page, actions and exports, and each of those is handled separately in its own file.
  - In several places one kind is the silent `else`, so a fourth kind would quietly be treated as
    that one:
    - admin detail page: booking (`activities/[activityId]/page.tsx:82`)
    - admin tabs: passport (`src/lib/activity-tabs.ts:41`)
    - admin list rows: passport (`activities/page.tsx:205`)
    - remove warning: passport (`src/lib/activity-row.ts:100`)
    - portal detail page: passport (`e/[slug]/a/[token]/activities/[activityId]/page.tsx`)
  - The portal's entry builder (`src/lib/portal-activity-entries.ts`) keeps one array per kind, so
    a new kind would simply disappear from the portal.
  - `NewActivityMenu.tsx:11` declares its own copy of the kind list, so the compiler would not flag
    it either.
  - The labels "Sessions / Submission / Passport" are written out three times.
- **One admin actions file holds about 12 features.** `src/app/admin/events/[id]/actions.ts` is
  1,472 lines with 55 server actions: attendees, agenda, announcements, info tabs, checkpoints,
  modules, pins, breakouts, WhatsApp, settings, and event deletion.
- **Games is the good example.** It has:
  - one file that defines every game kind: `src/lib/games/config.ts`, with a zod schema per kind,
    a `Record<GameKind, …>` of labels, and `parseConfig`/`hydrateGame`
  - its logic in `src/lib/games/`, separate from its screens in `src/components/games/`
  - thin route handlers in `src/app/api/play/`
  - its own load test
  
  Its database code still sits outside the folder, in `src/lib/db/games.ts`.
- **Scaling habits are mostly right.** The portal's main per-attendee pages read by one attendee
  ("one query, one attendee"). Game state is cached per server. Whole-event reads now page. Two
  things don't scale yet: about 30 admin pages load the whole attendee list, and long jobs (the
  WhatsApp blast, the QR zip) run inside one request and stop at Vercel's 300 s limit.

## Goals and non-goals

**Goals**
- Adding a feature means adding a folder, plus at most a migration and a nav entry. It does not
  mean editing a dozen shared files.
- Adding an activity kind is a compile error until every place that needs it handles it.
- A feature an event does not use costs that event nothing at runtime.
- Performance rules are written down, so the next feature follows them by default.

**Non-goals**
- No monorepo, no microservices, no separate databases, no runtime plugin loading. It stays one
  Next.js app on one Supabase project.
- No rewrite of working code for tidiness alone. Code moves when it is next worked on (D407).
- No change to the database shape of activities. Per-kind columns stay as they are.

## Decisions

### D402 — Feature folders

Each feature lives in `src/features/<name>/`:

```
src/features/groups/
  index.ts          ← the server-side entry: what the rest of the app may use
  client.ts         ← the client-safe entry: components and types for "use client" files
  db.ts             ← its Supabase reads and writes (moved from src/lib/db/<name>.ts)
  logic.ts          ← pure rules, unit-tested (as src/lib/groups.ts is today)
  actions.ts        ← its server actions (admin and portal)
  admin/            ← its admin screens
  portal/           ← its attendee-facing screens
```

- The folder shape is a guide, not a template. A small feature can be three files.
- **Routes stay in `src/app/`**, because Next.js requires it. A route file becomes a thin shell:
  it reads params, checks auth, and renders or calls what the feature exports. Example:
  `src/app/admin/events/[id]/groups/page.tsx` imports `GroupsAdminPage` from `@/features/groups`.
- **Migrations stay in `supabase/migrations/`**, because Supabase requires it. They keep their
  feature names (`0057_scored_challenges.sql`).
- **Tests go in `tests/<feature>/`**. Vitest's existing `tests/**/*.test.ts` already picks them up.
- **The shared core stays in `src/lib/`**: types, tokens, links, time, text, the Supabase clients,
  `select-all`, auth and storage. A feature may import the core. The core never imports a feature.

### D403 — One way in, enforced by lint

Code outside a feature imports only `@/features/<name>` (server) or `@/features/<name>/client`
(client). It never imports a file inside the folder. Inside a feature, files use relative imports.

ESLint enforces this, so it does not depend on remembering:

```js
// eslint.config.mjs
{
  rules: {
    "no-restricted-imports": ["error", { patterns: [{
      // "**/" also catches a relative path into a feature (../../features/x/db).
      group: ["**/features/*/**", "!**/features/*/client"],
      message: "Import a feature through its entry (@/features/<name> or @/features/<name>/client).",
    }] }],
  },
},
```

Why two entries: a single `index.ts` that re-exports server code would pull `server-only` modules
into client components and break the build. `client.ts` exports only what is safe in the browser.

The rule costs nothing to add today, because `src/features/` doesn't exist yet. It starts
protecting the first folder as soon as that folder is created.

### D404 — Activity kinds: one definition per kind

Each kind becomes one module that implements a shared interface. A registry typed as
`{ [K in ActivityKind]: … }` lists every kind, so leaving a kind out is a type error.

```
src/features/activities/
  kinds/
    meta.ts         ← client-safe: ACTIVITY_KINDS, KIND_META (label, icon, menu copy)
    types.ts        ← the ActivityKindDef interface
    registry.ts     ← KINDS: { booking, submission, passport }; kindOf(activity)
    booking/        ← sessions, door check-in, the .ics, booking exports
    submission/     ← forms, uploads, edit/revoke; scoring/ (Project Mileage) inside it
    passport/       ← booths, stamps, the booth scanner
```

The interface covers exactly the concerns that branch today. It starts with these and grows only
when a real second use shows up:

```ts
export interface ActivityKindDef<K extends ActivityKind> {
  kind: K;
  /** FormData → this kind's settings, or the message to show. Replaces readActivityPolicy / readSubmissionPolicy / readPassportPolicy. */
  readSettings(fd: FormData): { ok: true; settings: SettingsFor<K> } | { ok: false; error: string };
  /** Admin: the tabs on the detail page, and the page itself. */
  adminTabs(activity: ActivityOf<K>, counts: CountsFor<K>): Tab[];
  AdminDetail: (props: AdminDetailProps<K>) => Promise<ReactNode>;
  /** Admin: the list row and the warning before delete. */
  adminRow(activity: ActivityOf<K>, counts: CountsFor<K>): ActivityRowView;
  removeWarning(activity: ActivityOf<K>, counts: CountsFor<K>): string | null;
  /** Portal: this attendee's entries, the card for each, and the detail body. */
  portalEntries(ctx: PortalCtx, activities: ActivityOf<K>[]): Promise<PortalEntry<K>[]>;
  portalCard(entry: PortalEntry<K>): CardView;
  PortalBody: (props: PortalBodyProps<K>) => Promise<ReactNode>;
  /** Exports page: zero or more sheets this kind offers. */
  exports(activity: ActivityOf<K>): ExportLink[];
}
```

- **The app sees `kindOf(activity)` and nothing else.** The detail page becomes
  `kindOf(activity).AdminDetail(…)`, and the portal builder calls `portalEntries` for each kind.
  The five silent `else` fall-throughs listed above, and the per-kind arrays in
  `portal-activity-entries.ts`, all go away.
- **Labels and icons come only from `KIND_META`.** `NewActivityMenu`, `KIND_LABELS`, `KIND_ICONS`
  and the second label union in `activity-row.ts` all read from it.
- **Project Mileage stays inside `submission/`.** It is a submission with `scoring` (D368, 0057),
  not a fourth kind. The `scoring` branches belong to the submission kind's own code, and the rest
  of the app never sees them.
- **Feature code tied to a kind lives with that kind.** The booking door and the WhatsApp
  booked/unbooked audiences are booking-only, so they live with booking and are exposed from it.
  Other features ask the booking kind; they don't test `kind === "booking"` themselves.
- **The database guards stay.** The `if a.kind <> 'x'` checks in the write functions (0030, 0048,
  …) are the last line of defence and are not part of this change.
- **Proving it works:** a type-level test adds a fake kind to the union and checks that the
  registry fails to compile. A behaviour test checks that each kind's `adminTabs`, `adminRow`,
  `removeWarning` and `portalCard` return what the current code returns for the same inputs.

### D405 — Performance rules for every feature

1. **Attendee-facing requests read by attendee, never by event.** That covers the portal, play,
   booth and crew pages. Each reads this attendee's or this token's rows, by an indexed column.
   The only exception is shared state cached per server for a few seconds, as games does (D259).
2. **Whole-event reads happen only on admin pages, and always page** through `selectAll` (D401),
   ordered on a unique column.
3. **Counts and totals come from the database.** Use `count: "exact", head: true` or a function,
   not "load the rows and count them in JavaScript", as D400 did for group entries.
4. **Work that grows with event size and could pass about 30 s runs in the background** (D406),
   not inside the button press.
5. **A feature an event doesn't use runs no queries on that event's portal pages.** Check the
   event's setting, or that the feature has any rows, before loading anything else.
6. **A feature that polls or shows live updates gets a load test** in the style of
   `scripts/games-load.mjs` before its first live event.

### D406 — Background jobs, built when first needed

Not built now. The first time a job needs it (most likely a WhatsApp blast above about 1,500
recipients, or the QR zip on a large event), add:

- a `jobs` table: `kind`, `event_id`, `payload`, `status`, `progress`, `error`, timestamps
- a worker route, `/api/cron/jobs`, called every minute by pg_cron. It uses the same bearer
  pattern as committee reminders (0051). It claims one job and works on it for at most about
  250 s, saving progress so the next run carries on where it stopped.
- an admin progress line ("Sent 1,240 of 2,000"), instead of a button that waits.

The WhatsApp send can already pick up where it stopped (`claimSend` in `src/lib/db/whatsapp-sends.ts` claims each recipient before sending), so it
moves over without changing how sending works.

### D407 — Moving existing code: when it is next worked on, not all at once

Existing features move into `src/features/` when there is a reason to work in them, as part of
that work. There is no big-bang move.

- **Splitting `actions.ts` follows the same rule.** When attendee, agenda, WhatsApp or other
  actions are next changed, they move into their feature's `actions.ts`.
- **A move gets its own commit, with no behaviour change, before the real change.** Then the diff
  for the real change stays readable, and a broken move is easy to spot and revert.

### D408 — Order of work

1. **Now:** agree on this doc.
2. **After the 1,000-pax event: activity kinds (D404).** This has the largest payoff and fixes the
   silent fall-throughs. It is about 40 files, done kind by kind: `meta.ts` and the registry first,
   then booking, submission and passport, each in its own commit, with the full test suite and an
   admin plus portal browser check on a test event (never `ecphub`) after each.
3. **Then: move games into `src/features/games/` as the pilot** for the folder layout and the lint
   rule. It is already self-contained, so the move is mostly mechanical: the files move, and
   `src/lib/db/games.ts` becomes `db.ts`.
4. **From then on, every new feature starts in `src/features/`** (D402, D403, D405). Existing
   features move under D407.

## Settled on 7 Oct 2026

- **The folder name is `src/features/`.** `src/modules/` would have clashed with the portal's
  "Modules" tiles.
- **No single per-event switch for features yet.** Each feature keeps its own way of turning on:
  `check_in_enabled`, `badge_checkin`, or whether an event has any activities or games. Revisit
  this when the next feature needs a switch.
- **The 1,000-pax event is in November 2026.** Step 2 of D408 (activity kinds) starts after it.
