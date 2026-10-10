# Feature Catalogue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One catalogue in code lists what ECP Hub sells. Each event records its add-ons and its
custom modules. The admin hides, and refuses writes to, areas the event doesn't have.

**Architecture:**

- A new feature folder, `src/features/catalogue/`, holds:
  - the pure catalogue (`catalogue.ts`)
  - the set logic (`features.ts`)
  - custom-module form reading (`custom-modules.ts`)
  - database reads and writes plus the request-memoised reader and guard (`db.ts`)
  - admin screens and actions (`admin/`)
- Two new tables: `event_features` (stored add-ons) and `event_custom_modules`.
- Gating happens in four places:
  - the sidebar (`groupsFor`)
  - the settings tabs
  - the pages: a "Not part of this event" panel with Turn on
  - the per-kind server-action guards: `requireFeature`, or `has()` for actions that return
    errors instead of redirecting

**Tech Stack:** Next.js 16 (App Router, server actions; read `node_modules/next/dist/docs/`
before using any Next API you haven't seen in this repo), Supabase (service-role client, RLS on
with no policies), Vitest, TypeScript.

**Spec:** `docs/superpowers/specs/2026-10-10-feature-catalogue-design.md`. Read it first. Task 1
corrects four details in it that the code reading turned up.

## Global Constraints

- **Add-on keys, exactly:** `whatsapp`, `booking`, `engagement`, `live_games`, `lucky_draw`,
  `custom_domain`, `slido`, `custom`.
- **`custom` is never stored.** An event has it exactly when it has at least one custom module
  (D436).
- **Base keys, exactly:** `portal`, `attendees`, `agenda`, `info`, `announcements`, `exports`,
  `registration`, `check_in`, `groups`, `breakouts`. They are always on and never stored.
- **Turning an add-on off deletes only its `event_features` row** (D439). Nothing else.
- **The attendee portal, the LED display and the host console are never gated** (D438).
- **Features are used only through their entry:** `@/features/<name>` on the server,
  `@/features/<name>/client` in the browser. ESLint enforces this (D403). Inside a feature,
  files import each other relatively.
- **Every new table:** `enable row level security` with no policies. Reads and writes go through
  `serviceClient()`.
- **Copy for a refused or hidden feature, exactly:**
  `"<Feature name> isn't part of this event. Turn it on in Settings → Features."`
- **Never test on the event with slug `ecphub`.** It is a real event.
- **Work on `main`.** No worktree (the user's standing preference).
- **Commit message trailer:** `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **Shared tree.** Other sessions push to `main` too. Run `git pull --rebase` before each commit,
  and only `git add` the files your task touched.

## File map

| File | Status | Responsibility |
| --- | --- | --- |
| `supabase/migrations/0070_event_features.sql` | create | Both tables and the backfill |
| `src/features/catalogue/catalogue.ts` | create | Keys, `FEATURES`, kind order lists (pure) |
| `src/features/catalogue/features.ts` | create | `FeatureSet`, `has`, allowed kinds, hidden nav and tabs, `notPartOf` (pure) |
| `src/features/catalogue/custom-modules.ts` | create | `readCustomModule(fd)` (pure) |
| `src/features/catalogue/client.ts` | create | Client-safe entry: the three pure files |
| `src/features/catalogue/db.ts` | create | Table reads and writes, `eventFeatures`, `requireFeature` |
| `src/features/catalogue/admin/actions.ts` | create | Turn on and off, custom module add, edit and remove |
| `src/features/catalogue/admin/FeaturesTab.tsx` | create | Settings → Features |
| `src/features/catalogue/admin/NotInEvent.tsx` | create | The "Not part of this event" panel |
| `src/features/catalogue/index.ts` | create | Server entry |
| `tests/catalogue/catalogue.test.ts` | create | Pure tests |
| `tests/catalogue/custom-modules.test.ts` | create | Form reader tests |
| `scripts/catalogue-db-check.mjs` | create | Database check |
| `package.json` | modify | `check:catalogue` script |
| `src/components/admin/nav.ts` | modify | `Item.key`, `hidden` parameter |
| `tests/nav.test.ts` | modify | Hidden-item tests |
| `src/components/admin/AppSidebar.tsx` | modify | Passes `hidden` |
| `src/app/admin/events/[id]/layout.tsx` | modify | Loads features, passes `hidden` |
| `src/app/admin/events/[id]/settings/page.tsx` | modify | Features tab; Address tab hidden |
| `src/app/admin/events/[id]/whatsapp/page.tsx` | modify | Gate |
| `src/app/admin/events/[id]/actions.ts` | modify | Gate `sendWhatsappAction` |
| `src/features/domains/admin/actions.ts` | modify | Gate every address action |
| `src/app/admin/events/[id]/activities/page.tsx` | modify | Gate, filter list, menu kinds |
| `src/features/activities/admin/NewActivityMenu.tsx` | modify | `kinds` prop |
| `src/features/activities/admin/ActivityDetailPage.tsx` | modify | Gate |
| `src/features/activities/admin/actions.ts` | modify | Kind guards |
| `src/app/admin/events/[id]/games/page.tsx` | modify | Gate, filter list, menu kinds |
| `src/features/games/admin/NewGameMenu.tsx` | modify | `kinds` prop |
| `src/app/admin/events/[id]/games/[gameId]/page.tsx` | modify | Gate |
| `src/app/admin/events/[id]/games/actions.ts` | modify | Kind guards |

---

### Task 1: Migration, and correcting the spec

**Files:**
- Create: `supabase/migrations/0070_event_features.sql`
- Modify: `docs/superpowers/specs/2026-10-10-feature-catalogue-design.md`

**Interfaces:**
- Produces:
  - table `public.event_features(event_id uuid, feature text, created_at timestamptz)`, primary
    key `(event_id, feature)`
  - table `public.event_custom_modules(id, org_id, event_id, name, description, sort_order,
    created_at)`

- [ ] **Step 1: Check the migration number is free**

Run: `ls supabase/migrations | tail -3`
Expected: the last file is `0069_event_domains.sql`. If another session has added `0070_*`, use
the next free number and say so in your report.

- [ ] **Step 2: Write the migration**

```sql
-- D434, D436: an event's add-ons and its custom modules. Adds two tables and backfills the
-- first; no existing table, row or policy changes.

-- D434: one row per add-on an event has. Base features are always on and never stored, and
-- `custom` is never stored either: an event has it when it has a custom module (D436).
create table public.event_features (
  event_id   uuid not null references public.events (id) on delete cascade,
  feature    text not null check (feature in ('whatsapp', 'booking', 'engagement', 'live_games', 'lucky_draw', 'custom_domain', 'slido')),
  created_at timestamptz not null default now(),
  primary key (event_id, feature)
);
-- Read and written only by the server with the service role: no policies on purpose.
alter table public.event_features enable row level security;

-- D436: bespoke work sold with an event. Nothing in the code is gated by these.
create table public.event_custom_modules (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations (id),
  event_id    uuid not null references public.events (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 2000),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index event_custom_modules_event on public.event_custom_modules (event_id, sort_order);
alter table public.event_custom_modules enable row level security;

-- D435: every event that exists today keeps every add-on, so nothing disappears when gating
-- arrives. Events created after this start with none.
insert into public.event_features (event_id, feature)
select e.id, f.feature
from public.events e
cross join (values ('whatsapp'), ('booking'), ('engagement'), ('live_games'), ('lucky_draw'), ('custom_domain'), ('slido')) as f (feature)
on conflict do nothing;
```

- [ ] **Step 3: Apply it**

Apply with the Supabase MCP `apply_migration` tool:
- name: `event_features`
- query: the file's contents, exactly as written

The project's Supabase holds test data plus the live `ecphub` event. This migration only adds
tables and inserts rows, so it is safe for both.

- [ ] **Step 4: Verify the backfill**

Run with the Supabase MCP `execute_sql` tool:

```sql
select
  (select count(*) from public.events) as events,
  (select count(*) from public.event_features) as rows,
  (select count(*) from public.events e where (select count(*) from public.event_features f where f.event_id = e.id) <> 7) as short;
```

Expected: `rows = events × 7` and `short = 0`.

- [ ] **Step 5: Correct the spec where the code disagrees**

Make these edits in `docs/superpowers/specs/2026-10-10-feature-catalogue-design.md`:

1. **Add-ons table, the `engagement` row, "Admin areas it unlocks" column:** replace
   `The `passport` and `submission` activity kinds, and Submissions in the sidebar` with
   `The `passport` and `submission` activity kinds`.
   - Why: there is no Submissions sidebar item. `submissions/[submissionId]/files` is a file
     route under Activities.
2. **D433:** replace the bullet starting `- `setup`: the setup steps and guide cards it adds.`
   with:
   `- `setup` is added by the setup-page project, which defines its shape. This project leaves it out.`
3. **D437:** replace `Returns `{ has(key), addons, custom }`.` with:
   `Returns `{ addons, custom }`. The check is the pure `has(features, key)` in `features.ts`, so it can be tested without a database.`
   Also replace the line about `requireFeature(event, key)` sitting beside `requireEvent` in
   `src/lib/db/events.ts` (in D438) with:
   `The check is `requireFeature(eventId, key, back)` in `src/features/catalogue/db.ts`. Actions that return an error object instead of redirecting use `has()`.`
4. **D438:** append this bullet:
   `- Writes are refused at each kind's own guard (`bookingOf`, `submissionOf`, `passportOf`, the add actions, and every game action that loads a game). List-level toggles (open/close, pin) aren't gated, because a hidden kind's rows aren't listed. Automatic WhatsApp notices (booking changes, committee alerts) still send; only the manual WhatsApp page and its send are gated.`
5. **D440:** replace the bullet starting `- **Custom domain off while the event has a live domain:**`
   with:
   `- **Turning any add-on off asks for confirmation.** For Custom domain, the confirmation also says that attendee links keep using the event's own address until it is removed in Settings → Address.`

- [ ] **Step 6: Commit**

```bash
git pull --rebase
git add supabase/migrations/0070_event_features.sql docs/superpowers/specs/2026-10-10-feature-catalogue-design.md
git commit -m "feat(catalogue): event_features and event_custom_modules, existing events keep every add-on (D434-D436)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The pure catalogue

**Files:**
- Create: `src/features/catalogue/catalogue.ts`
- Create: `src/features/catalogue/features.ts`
- Create: `src/features/catalogue/custom-modules.ts`
- Create: `src/features/catalogue/client.ts`
- Test: `tests/catalogue/catalogue.test.ts`
- Test: `tests/catalogue/custom-modules.test.ts`

**Interfaces:**
- Produces, all exported from `@/features/catalogue/client`:
  - **Types:** `BaseKey`, `AddonKey`, `StoredAddon` (= `Exclude<AddonKey, "custom">`),
    `FeatureKey`, `NavKey` (= `"whatsapp" | "activities" | "games"`), `SettingsTabKey`
    (= `"address"`), `Feature`, `FeatureSet` (= `{ readonly addons: ReadonlySet<AddonKey> }`)
  - **Constants:** `BASE_KEYS`, `ADDON_KEYS`, `STORED_ADDONS`, `FEATURES`,
    `ACTIVITY_KIND_ORDER`, `GAME_KIND_ORDER`
  - **Functions:**
    - `featureSet(stored: readonly string[], customCount: number): FeatureSet`
    - `has(fs: FeatureSet, key: FeatureKey): boolean`
    - `activityKindsFor(fs: FeatureSet): ActivityKind[]`
    - `gameKindsFor(fs: FeatureSet): GameKind[]`
    - `featureForActivityKind(kind: ActivityKind): AddonKey`
    - `featureForGameKind(kind: GameKind): AddonKey`
    - `hiddenNav(fs: FeatureSet): NavKey[]`
    - `hiddenSettingsTabs(fs: FeatureSet): SettingsTabKey[]`
    - `notPartOf(key: FeatureKey): string`
    - `isStoredAddon(key: string): key is StoredAddon`
    - `readCustomModule(fd: FormData): { ok: true; value: { name: string; description: string | null } } | { ok: false; error: string }`

- [ ] **Step 1: Write the failing tests**

`tests/catalogue/catalogue.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ADDON_KEYS, BASE_KEYS, FEATURES, STORED_ADDONS, ACTIVITY_KIND_ORDER, GAME_KIND_ORDER,
  featureSet, has, activityKindsFor, gameKindsFor, featureForActivityKind, featureForGameKind,
  hiddenNav, hiddenSettingsTabs, notPartOf, isStoredAddon,
} from "@/features/catalogue/client";
// Straight from the defining files, as tests/games does: the games client entry also exports
// its screens, which vitest's node environment has no reason to load.
import { ACTIVITY_KINDS } from "@/features/activities/kinds/meta";
import { GAME_KINDS } from "@/features/games/config";

const none = featureSet([], 0);
const all = featureSet(STORED_ADDONS, 1);

describe("the catalogue (D433)", () => {
  it("defines every base and add-on key, with the right tier", () => {
    for (const k of BASE_KEYS) expect(FEATURES[k].tier).toBe("base");
    for (const k of ADDON_KEYS) expect(FEATURES[k].tier).toBe("addon");
  });
  it("stores every add-on except custom (D436)", () => {
    expect(STORED_ADDONS).toEqual(["whatsapp", "booking", "engagement", "live_games", "lucky_draw", "custom_domain", "slido"]);
  });
  it("orders activity and game kinds the way their menus do", () => {
    expect([...ACTIVITY_KIND_ORDER]).toEqual([...ACTIVITY_KINDS]);
    expect([...GAME_KIND_ORDER]).toEqual([...GAME_KINDS]);
  });
  it("unlocks every activity kind and every game kind through exactly one add-on", () => {
    for (const kind of ACTIVITY_KINDS) expect(ADDON_KEYS.filter((a) => FEATURES[a].unlocks.activityKinds?.includes(kind))).toHaveLength(1);
    for (const kind of GAME_KINDS) expect(ADDON_KEYS.filter((a) => FEATURES[a].unlocks.gameKinds?.includes(kind))).toHaveLength(1);
  });
});

describe("featureSet and has (D437)", () => {
  it("treats base features as always on", () => {
    for (const k of BASE_KEYS) expect(has(none, k)).toBe(true);
  });
  it("has an add-on only when it is stored", () => {
    const fs = featureSet(["whatsapp"], 0);
    expect(has(fs, "whatsapp")).toBe(true);
    expect(has(fs, "booking")).toBe(false);
  });
  it("ignores a stored key the code no longer knows", () => {
    expect([...featureSet(["raffle", "whatsapp"], 0).addons]).toEqual(["whatsapp"]);
  });
  it("has custom exactly when there is a custom module, whatever is stored", () => {
    expect(has(featureSet([], 0), "custom")).toBe(false);
    expect(has(featureSet([], 2), "custom")).toBe(true);
    expect(has(featureSet(["custom"], 0), "custom")).toBe(false);
  });
});

describe("allowed kinds", () => {
  it("allows no activity or game kind with no add-ons", () => {
    expect(activityKindsFor(none)).toEqual([]);
    expect(gameKindsFor(none)).toEqual([]);
  });
  it("allows booking alone with Session booking", () => {
    expect(activityKindsFor(featureSet(["booking"], 0))).toEqual(["booking"]);
  });
  it("allows submission and passport with Engagement activities", () => {
    expect(activityKindsFor(featureSet(["engagement"], 0))).toEqual(["submission", "passport"]);
  });
  it("splits games between Live games and Lucky draw", () => {
    expect(gameKindsFor(featureSet(["live_games"], 0))).toEqual(["tap_race", "survival"]);
    expect(gameKindsFor(featureSet(["lucky_draw"], 0))).toEqual(["draw"]);
  });
  it("allows every kind with every add-on, in menu order", () => {
    expect(activityKindsFor(all)).toEqual(["booking", "submission", "passport"]);
    expect(gameKindsFor(all)).toEqual(["tap_race", "survival", "draw"]);
  });
  it("names the add-on behind each kind", () => {
    expect(featureForActivityKind("booking")).toBe("booking");
    expect(featureForActivityKind("submission")).toBe("engagement");
    expect(featureForActivityKind("passport")).toBe("engagement");
    expect(featureForGameKind("tap_race")).toBe("live_games");
    expect(featureForGameKind("survival")).toBe("live_games");
    expect(featureForGameKind("draw")).toBe("lucky_draw");
  });
});

describe("hidden admin areas (D438)", () => {
  it("hides WhatsApp, Activities and Games with no add-ons", () => {
    expect(hiddenNav(none)).toEqual(["whatsapp", "activities", "games"]);
  });
  it("hides nothing with every add-on", () => {
    expect(hiddenNav(all)).toEqual([]);
    expect(hiddenSettingsTabs(all)).toEqual([]);
  });
  it("keeps Activities while either activity add-on is on", () => {
    expect(hiddenNav(featureSet(["booking"], 0))).not.toContain("activities");
    expect(hiddenNav(featureSet(["engagement"], 0))).not.toContain("activities");
  });
  it("hides the Address tab without Custom domain", () => {
    expect(hiddenSettingsTabs(none)).toEqual(["address"]);
    expect(hiddenSettingsTabs(featureSet(["custom_domain"], 0))).toEqual([]);
  });
});

describe("notPartOf and isStoredAddon", () => {
  it("says what is missing and where to turn it on", () => {
    expect(notPartOf("lucky_draw")).toBe("Lucky draw isn't part of this event. Turn it on in Settings → Features.");
  });
  it("accepts only storable add-on keys", () => {
    expect(isStoredAddon("whatsapp")).toBe(true);
    expect(isStoredAddon("custom")).toBe(false);
    expect(isStoredAddon("agenda")).toBe(false);
    expect(isStoredAddon("raffle")).toBe(false);
  });
});
```

`tests/catalogue/custom-modules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readCustomModule } from "@/features/catalogue/client";

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

describe("readCustomModule (D436)", () => {
  it("reads a name and a description, trimmed", () => {
    expect(readCustomModule(form({ name: "  Photo mosaic wall ", description: " Live wall of guest photos " })))
      .toEqual({ ok: true, value: { name: "Photo mosaic wall", description: "Live wall of guest photos" } });
  });
  it("stores an empty description as null", () => {
    expect(readCustomModule(form({ name: "Mosaic", description: "   " }))).toEqual({ ok: true, value: { name: "Mosaic", description: null } });
  });
  it("refuses a missing name", () => {
    expect(readCustomModule(form({ name: "  " }))).toEqual({ ok: false, error: "Give the custom module a name." });
  });
  it("refuses a name over 80 characters", () => {
    expect(readCustomModule(form({ name: "x".repeat(81) }))).toEqual({ ok: false, error: "Keep the name to 80 characters." });
  });
  it("refuses a description over 2,000 characters", () => {
    expect(readCustomModule(form({ name: "Mosaic", description: "x".repeat(2001) }))).toEqual({ ok: false, error: "Keep the description to 2,000 characters." });
  });
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `npx vitest run tests/catalogue`
Expected: FAIL. Both files fail to import `@/features/catalogue/client`.

- [ ] **Step 3: Write `catalogue.ts`**

```ts
import type { ActivityKind } from "@/lib/types";
import type { GameKind } from "@/features/games/client";

/** Always on for every event, never stored (D433). */
export const BASE_KEYS = ["portal", "attendees", "agenda", "info", "announcements", "exports", "registration", "check_in", "groups", "breakouts"] as const;
export type BaseKey = (typeof BASE_KEYS)[number];

/** What an event can add (D433). A key added here must be added to FEATURES: the Record stops the build until it is. */
export const ADDON_KEYS = ["whatsapp", "booking", "engagement", "live_games", "lucky_draw", "custom_domain", "slido", "custom"] as const;
export type AddonKey = (typeof ADDON_KEYS)[number];
export type FeatureKey = BaseKey | AddonKey;

/** Stored in `event_features`. `custom` never is: an event has it when it has a custom module (D436). */
export type StoredAddon = Exclude<AddonKey, "custom">;
export const STORED_ADDONS = ADDON_KEYS.filter((k): k is StoredAddon => k !== "custom");

/** Sidebar items and settings tabs an add-on can hide. Activities and Games are hidden by their kinds, not named here. */
export type NavKey = "whatsapp" | "activities" | "games";
export type SettingsTabKey = "address";

export type Unlocks = {
  nav?: readonly NavKey[];
  activityKinds?: readonly ActivityKind[];
  gameKinds?: readonly GameKind[];
  settingsTabs?: readonly SettingsTabKey[];
};

export type Feature = { name: string; summary: string; tier: "base" | "addon"; unlocks: Unlocks };

const base = (name: string, summary: string): Feature => ({ name, summary, tier: "base", unlocks: {} });
const addon = (name: string, summary: string, unlocks: Unlocks = {}): Feature => ({ name, summary, tier: "addon", unlocks });

/** The one place a feature's name, summary and what it opens in admin live (D433). */
export const FEATURES: Record<FeatureKey, Feature> = {
  portal: base("Attendee portal and personal links", "Each attendee's own link to the portal."),
  attendees: base("Attendee list", "Import and manage who is coming."),
  agenda: base("Agenda", "Days and sessions."),
  info: base("Event info and floor plan", "Info tabs and the venue plan."),
  announcements: base("Announcements", "News for attendees, pinned or not."),
  exports: base("Exports", "Spreadsheets, links and QR codes."),
  registration: base("Self-registration", "A sign-up form with your own questions."),
  check_in: base("Check-in", "Crew scanning, checkpoints and badges."),
  groups: base("Groups", "Teams built from a column."),
  breakouts: base("Breakout rooms", "Rounds and room assignment."),
  whatsapp: addon("WhatsApp messaging", "Send portal links and announcements by WhatsApp.", { nav: ["whatsapp"] }),
  booking: addon("Session booking", "Time slots attendees book, with capacity.", { activityKinds: ["booking"] }),
  engagement: addon("Engagement activities", "Stamp passport, submissions and scored challenges.", { activityKinds: ["submission", "passport"] }),
  live_games: addon("Live games", "Tap race and Last one standing on the LED.", { gameKinds: ["tap_race", "survival"] }),
  lucky_draw: addon("Lucky draw", "Slot machine, wheel, mosaic and card round.", { gameKinds: ["draw"] }),
  custom_domain: addon("Custom domain", "The event on its own address.", { settingsTabs: ["address"] }),
  slido: addon("Slido embedding", "Slido inside the portal. Until the embed is built, use a link tile."),
  custom: addon("Custom module", "Bespoke work, described per event."),
};

/** The activity kinds in the New activity menu's order (`ACTIVITY_KINDS`). A kind missing here stops the build. */
export const ACTIVITY_KIND_ORDER = ["booking", "submission", "passport"] as const satisfies readonly ActivityKind[];
type CoversActivities = [ActivityKind] extends [(typeof ACTIVITY_KIND_ORDER)[number]] ? true : never;
const coversActivities: CoversActivities = true;
void coversActivities;

/** The game kinds in the New game menu's order (`GAME_KINDS`). A kind missing here stops the build. */
export const GAME_KIND_ORDER = ["tap_race", "survival", "draw"] as const satisfies readonly GameKind[];
type CoversGames = [GameKind] extends [(typeof GAME_KIND_ORDER)[number]] ? true : never;
const coversGames: CoversGames = true;
void coversGames;
```

- [ ] **Step 4: Write `features.ts`**

```ts
import type { ActivityKind } from "@/lib/types";
import type { GameKind } from "@/features/games/client";
import {
  ADDON_KEYS, FEATURES, STORED_ADDONS, ACTIVITY_KIND_ORDER, GAME_KIND_ORDER,
  type AddonKey, type FeatureKey, type NavKey, type SettingsTabKey, type StoredAddon,
} from "./catalogue";

/** An event's add-ons. Base features are not in it: `has` answers yes for them (D437). */
export type FeatureSet = { readonly addons: ReadonlySet<AddonKey> };

export function isStoredAddon(key: string): key is StoredAddon {
  return (STORED_ADDONS as readonly string[]).includes(key);
}

/** From the stored rows and the number of custom modules. A stored key the code no longer knows is ignored. */
export function featureSet(stored: readonly string[], customCount: number): FeatureSet {
  const addons = new Set<AddonKey>(stored.filter(isStoredAddon));
  if (customCount > 0) addons.add("custom");
  return { addons };
}

export function has(fs: FeatureSet, key: FeatureKey): boolean {
  return FEATURES[key].tier === "base" || fs.addons.has(key as AddonKey);
}

const unlockedBy = (fs: FeatureSet, pick: (a: AddonKey) => readonly string[] | undefined) =>
  new Set([...fs.addons].flatMap((a) => pick(a) ?? []));

export function activityKindsFor(fs: FeatureSet): ActivityKind[] {
  const on = unlockedBy(fs, (a) => FEATURES[a].unlocks.activityKinds);
  return ACTIVITY_KIND_ORDER.filter((k) => on.has(k));
}

export function gameKindsFor(fs: FeatureSet): GameKind[] {
  const on = unlockedBy(fs, (a) => FEATURES[a].unlocks.gameKinds);
  return GAME_KIND_ORDER.filter((k) => on.has(k));
}

export function featureForActivityKind(kind: ActivityKind): AddonKey {
  const key = ADDON_KEYS.find((a) => FEATURES[a].unlocks.activityKinds?.includes(kind));
  if (!key) throw new Error(`No add-on unlocks the ${kind} activity kind`);
  return key;
}

export function featureForGameKind(kind: GameKind): AddonKey {
  const key = ADDON_KEYS.find((a) => FEATURES[a].unlocks.gameKinds?.includes(kind));
  if (!key) throw new Error(`No add-on unlocks the ${kind} game kind`);
  return key;
}

/** Sidebar items to leave out, in sidebar order (D438). */
export function hiddenNav(fs: FeatureSet): NavKey[] {
  const nav = unlockedBy(fs, (a) => FEATURES[a].unlocks.nav);
  const out: NavKey[] = [];
  if (!nav.has("whatsapp")) out.push("whatsapp");
  if (activityKindsFor(fs).length === 0) out.push("activities");
  if (gameKindsFor(fs).length === 0) out.push("games");
  return out;
}

export function hiddenSettingsTabs(fs: FeatureSet): SettingsTabKey[] {
  const tabs = unlockedBy(fs, (a) => FEATURES[a].unlocks.settingsTabs);
  return (["address"] as const).filter((t) => !tabs.has(t));
}

export function notPartOf(key: FeatureKey): string {
  return `${FEATURES[key].name} isn't part of this event. Turn it on in Settings → Features.`;
}
```

- [ ] **Step 5: Write `custom-modules.ts`**

```ts
export const CUSTOM_NAME_MAX = 80;
export const CUSTOM_DESCRIPTION_MAX = 2000;

type Read = { ok: true; value: { name: string; description: string | null } } | { ok: false; error: string };

/** A custom module from its add or edit form (D436). The table's checks say the same, so a refusal here never reaches the database. */
export function readCustomModule(fd: FormData): Read {
  const name = String(fd.get("name") ?? "").trim();
  const description = String(fd.get("description") ?? "").trim();
  if (!name) return { ok: false, error: "Give the custom module a name." };
  if (name.length > CUSTOM_NAME_MAX) return { ok: false, error: "Keep the name to 80 characters." };
  if (description.length > CUSTOM_DESCRIPTION_MAX) return { ok: false, error: "Keep the description to 2,000 characters." };
  return { ok: true, value: { name, description: description || null } };
}
```

- [ ] **Step 6: Write `client.ts`**

```ts
/**
 * The catalogue's client-safe entry (D402, D403): the feature list and the pure rules over it.
 * `index.ts` re-exports this and adds the database reads and the admin screens.
 */
export * from "./catalogue";
export * from "./features";
export * from "./custom-modules";
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/catalogue`
Expected: PASS, every test in both files.

- [ ] **Step 8: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/features/catalogue tests/catalogue`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git pull --rebase
git add src/features/catalogue tests/catalogue
git commit -m "feat(catalogue): the feature list and its rules, in code (D433, D437)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Database reads, the reader and the guard

**Files:**
- Create: `src/features/catalogue/db.ts`
- Create: `src/features/catalogue/index.ts`

**Interfaces:**
- Consumes (Task 2): `featureSet`, `has`, `notPartOf`, `FeatureSet`, `FeatureKey`, `StoredAddon`
- Produces, all exported from `@/features/catalogue`:
  - `type CustomModule = { id: string; event_id: string; name: string; description: string | null; sort_order: number }`
  - `type EventFeatures = FeatureSet & { custom: CustomModule[] }`
  - `eventFeatures(eventId: string): Promise<EventFeatures>`, memoised per request
  - `requireFeature(eventId: string, key: FeatureKey, back: string): Promise<void>`, which
    redirects to `back` with the `notPartOf` flash when the feature is missing
  - `setAddon(eventId: string, key: StoredAddon, on: boolean): Promise<void>`
  - `listCustomModules(eventId: string): Promise<CustomModule[]>`
  - `addCustomModule(ev: { id: string; org_id: string }, input: { name: string; description: string | null }): Promise<void>`
  - `updateCustomModule(eventId: string, id: string, input: { name: string; description: string | null }): Promise<boolean>`
  - `removeCustomModule(eventId: string, id: string): Promise<void>`
  - everything from `./client`

The database behaviour is proven by `scripts/catalogue-db-check.mjs` in Task 8. Vitest has no
database (D141).

- [ ] **Step 1: Write `db.ts`**

```ts
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { serviceClient } from "@/lib/supabase/service";
import { flashPath } from "@/lib/flash";
import { featureSet, has, notPartOf, type FeatureSet } from "./features";
import type { FeatureKey, StoredAddon } from "./catalogue";

export type CustomModule = { id: string; event_id: string; name: string; description: string | null; sort_order: number };
export type EventFeatures = FeatureSet & { custom: CustomModule[] };

export async function listCustomModules(eventId: string): Promise<CustomModule[]> {
  const { data, error } = await serviceClient()
    .from("event_custom_modules").select("id, event_id, name, description, sort_order")
    .eq("event_id", eventId).order("sort_order").order("created_at");
  if (error) throw error;
  return data as CustomModule[];
}

/** Memoised per request, like requireEvent: the layout, the page and its actions all ask (D437). */
export const eventFeatures = cache(async (eventId: string): Promise<EventFeatures> => {
  const [stored, custom] = await Promise.all([
    serviceClient().from("event_features").select("feature").eq("event_id", eventId),
    listCustomModules(eventId),
  ]);
  if (stored.error) throw stored.error;
  const keys = (stored.data as { feature: string }[]).map((r) => r.feature);
  return { ...featureSet(keys, custom.length), custom };
});

/** The guard every gated write calls (D438). Sends the admin back with the reason. */
export async function requireFeature(eventId: string, key: FeatureKey, back: string): Promise<void> {
  if (!has(await eventFeatures(eventId), key)) redirect(flashPath(back, notPartOf(key), "error"));
}

/** Turning off deletes this one row and nothing else (D439). */
export async function setAddon(eventId: string, key: StoredAddon, on: boolean): Promise<void> {
  const table = serviceClient().from("event_features");
  const { error } = on
    ? await table.upsert({ event_id: eventId, feature: key }, { onConflict: "event_id,feature", ignoreDuplicates: true })
    : await table.delete().eq("event_id", eventId).eq("feature", key);
  if (error) throw error;
}

export async function addCustomModule(ev: { id: string; org_id: string }, input: { name: string; description: string | null }): Promise<void> {
  const existing = await listCustomModules(ev.id);
  const sort_order = existing.length ? Math.max(...existing.map((m) => m.sort_order)) + 1 : 0;
  const { error } = await serviceClient().from("event_custom_modules").insert({ org_id: ev.org_id, event_id: ev.id, ...input, sort_order });
  if (error) throw error;
}

/** False when the id isn't one of this event's, so a crafted post changes nothing. */
export async function updateCustomModule(eventId: string, id: string, input: { name: string; description: string | null }): Promise<boolean> {
  const { data, error } = await serviceClient().from("event_custom_modules").update(input).eq("id", id).eq("event_id", eventId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function removeCustomModule(eventId: string, id: string): Promise<void> {
  const { error } = await serviceClient().from("event_custom_modules").delete().eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}
```

- [ ] **Step 2: Write `index.ts`**

```ts
/** The catalogue's server entry (D402): everything in `client.ts`, plus its reads and writes. */
export * from "./client";
export * from "./db";
```

Tasks 4 and 5 add exports for the admin screens.

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/features/catalogue`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git pull --rebase
git add src/features/catalogue/db.ts src/features/catalogue/index.ts
git commit -m "feat(catalogue): eventFeatures, requireFeature and the table writes (D437, D439)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Settings → Features

**Files:**
- Create: `src/features/catalogue/admin/actions.ts`
- Create: `src/features/catalogue/admin/FeaturesTab.tsx`
- Modify: `src/features/catalogue/index.ts`
- Modify: `src/app/admin/events/[id]/settings/page.tsx` (imports; `rememberedTab` at line 90;
  `TabsList` at lines 106-113; add a `TabsContent`)

**Interfaces:**
- Consumes (Task 3): `eventFeatures`, `setAddon`, `addCustomModule`, `updateCustomModule`,
  `removeCustomModule`, `readCustomModule`, `isStoredAddon`, `FEATURES`, `BASE_KEYS`,
  `STORED_ADDONS`, `has`
- Produces:
  - `setAddonAction(eventId: string, key: string, on: boolean, back: string): Promise<void>`.
    Task 5 uses it for Turn on.
  - `addCustomModuleAction(eventId: string, fd: FormData)`
  - `updateCustomModuleAction(eventId: string, moduleId: string, fd: FormData)`
  - `removeCustomModuleAction(eventId: string, moduleId: string)`
  - `<FeaturesTab eventId={string} />`

- [ ] **Step 1: Write the actions**

`src/features/catalogue/admin/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { flashPath } from "@/lib/flash";
import { FEATURES } from "../catalogue";
import { isStoredAddon } from "../features";
import { readCustomModule } from "../custom-modules";
import { setAddon, addCustomModule, updateCustomModule, removeCustomModule } from "../db";

const settingsPath = (eventId: string) => `/admin/events/${eventId}/settings`;

async function event(eventId: string) {
  const { orgId } = await requireAdmin();
  return requireEvent(eventId, orgId);
}

/**
 * Turn on from the "Not part of this event" panel returns to the page it was pressed on, and
 * the Features tab returns to Settings. Only a path inside this event is accepted, so a crafted
 * `back` can't send the admin anywhere else.
 */
function safeBack(eventId: string, back: string): string {
  const root = `/admin/events/${eventId}`;
  return back === root || back.startsWith(`${root}/`) ? back : settingsPath(eventId);
}

export async function setAddonAction(eventId: string, key: string, on: boolean, back: string) {
  const ev = await event(eventId);
  const to = safeBack(ev.id, back);
  if (!isStoredAddon(key)) redirect(flashPath(to, "That isn't an add-on.", "error"));
  await setAddon(ev.id, key, on);
  // The layout's sidebar reads the features too, so refresh the whole event.
  revalidatePath(`/admin/events/${ev.id}`, "layout");
  redirect(flashPath(to, on ? `${FEATURES[key].name} is on.` : `${FEATURES[key].name} is off. Nothing was deleted.`));
}

export async function addCustomModuleAction(eventId: string, fd: FormData) {
  const ev = await event(eventId);
  const read = readCustomModule(fd);
  if (!read.ok) redirect(flashPath(settingsPath(ev.id), read.error, "error"));
  await addCustomModule(ev, read.value);
  revalidatePath(settingsPath(ev.id));
  redirect(flashPath(settingsPath(ev.id), `${read.value.name} added.`));
}

export async function updateCustomModuleAction(eventId: string, moduleId: string, fd: FormData) {
  const ev = await event(eventId);
  const read = readCustomModule(fd);
  if (!read.ok) redirect(flashPath(settingsPath(ev.id), read.error, "error"));
  if (!(await updateCustomModule(ev.id, moduleId, read.value))) redirect(flashPath(settingsPath(ev.id), "That custom module no longer exists.", "error"));
  revalidatePath(settingsPath(ev.id));
  redirect(flashPath(settingsPath(ev.id), "Saved."));
}

export async function removeCustomModuleAction(eventId: string, moduleId: string) {
  const ev = await event(eventId);
  await removeCustomModule(ev.id, moduleId);
  revalidatePath(settingsPath(ev.id));
  redirect(flashPath(settingsPath(ev.id), "Custom module removed."));
}
```

- [ ] **Step 2: Write `FeaturesTab.tsx`**

It is a server component, in the approved admin style: cards, table-style rows, a ⋯ menu per
custom module.

```tsx
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { RowActions } from "@/components/admin/RowActions";
import { Modal } from "@/components/admin/Modal";
import { BASE_KEYS, FEATURES, STORED_ADDONS, type StoredAddon } from "../catalogue";
import { has } from "../features";
import { eventFeatures } from "../db";
import { setAddonAction, addCustomModuleAction, updateCustomModuleAction, removeCustomModuleAction } from "./actions";

const OFF_NOTE = "Nothing is deleted. Turn it back on and everything returns.";
const offMessage = (key: StoredAddon) =>
  key === "custom_domain"
    ? `Turn off ${FEATURES[key].name}? The Address tab is hidden, but attendee links keep using the event's own address until you remove it there. ${OFF_NOTE}`
    : `Turn off ${FEATURES[key].name}? It disappears from the admin. ${OFF_NOTE}`;

function ModuleForm({ action, name = "", description = "" }: { action: (fd: FormData) => Promise<void>; name?: string; description?: string }) {
  return (
    <form action={action} className="grid grid-cols-1 gap-4">
      <Field label="Name" name="name" defaultValue={name} placeholder="Photo mosaic wall" />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-bold">What it is (optional)</label>
        <Textarea id="description" name="description" rows={4} defaultValue={description} maxLength={2000} />
      </div>
      <SubmitButton>Save</SubmitButton>
    </form>
  );
}

export async function FeaturesTab({ eventId }: { eventId: string }) {
  const features = await eventFeatures(eventId);
  const back = `/admin/events/${eventId}/settings`;
  return (
    <>
      <Card className="overflow-hidden pb-0">
        <CardHeader>
          <CardTitle>Add-ons</CardTitle>
          <CardDescription>What this event has beyond the basics. An add-on that is off is hidden in the admin. {OFF_NOTE}</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <ul className="divide-y divide-border border-t border-border">
            {STORED_ADDONS.map((key) => {
              const on = has(features, key);
              return (
                <li key={key} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-bold">{FEATURES[key].name}</span>
                    <span className="text-xs text-muted-foreground">{FEATURES[key].summary}</span>
                  </span>
                  <Badge variant={on ? "success" : "secondary"}>{on ? "On" : "Off"}</Badge>
                  <form action={setAddonAction.bind(null, eventId, key, !on, back)}>
                    {on
                      ? <ConfirmButton message={offMessage(key)} confirmLabel="Turn off">Turn off</ConfirmButton>
                      : <SubmitButton variant="outline">Turn on</SubmitButton>}
                  </form>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card className="overflow-hidden pb-0">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <span className="flex flex-col gap-1.5">
            <CardTitle>Custom modules</CardTitle>
            <CardDescription>Bespoke work sold with this event. They show on the organiser&apos;s setup checklist; nothing in the admin depends on them.</CardDescription>
          </span>
          <Modal title="Add a custom module" trigger="Add custom module" icon="plus">
            <ModuleForm action={addCustomModuleAction.bind(null, eventId)} />
          </Modal>
        </CardHeader>
        <CardContent className="px-0">
          {features.custom.length === 0 ? (
            <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground">None. Add one when an event needs something bespoke.</p>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {features.custom.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-bold">{m.name}</span>
                    {m.description && <span className="line-clamp-2 text-xs text-muted-foreground">{m.description}</span>}
                  </span>
                  <RowActions
                    name={m.name}
                    edit={{ title: "Edit custom module", form: <ModuleForm action={updateCustomModuleAction.bind(null, eventId, m.id)} name={m.name} description={m.description ?? ""} /> }}
                    remove={{ action: removeCustomModuleAction.bind(null, eventId, m.id), message: `Remove "${m.name}"?` }}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Included with every event</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-x-6 gap-y-2 text-sm @xl:grid-cols-2">
            {BASE_KEYS.map((key) => <li key={key}><span className="font-bold">{FEATURES[key].name}</span> <span className="text-muted-foreground">— {FEATURES[key].summary}</span></li>)}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
```

Before you write it, open these and match their real APIs:
- `src/components/admin/Modal.tsx`: `icon` takes an `IconName`. Check that `"plus"` is one, in
  `src/components/ui/icon.tsx`. If it isn't, use an icon name that exists.
- `ConfirmButton.tsx`: check the `confirmLabel` prop name.
- `badge.tsx`: check that `variant="success"` exists. The sidebar already uses it.

If any prop differs, use the real one and note it in your report.

- [ ] **Step 3: Export it from `index.ts`**

Add to `src/features/catalogue/index.ts`:

```ts
export { FeaturesTab } from "./admin/FeaturesTab";
export { setAddonAction } from "./admin/actions";
```

- [ ] **Step 4: Add the tab to Settings, first and as the default**

In `src/app/admin/events/[id]/settings/page.tsx`:

1. Add the import: `import { FeaturesTab } from "@/features/catalogue";`
2. Line 90 becomes:

```ts
  const openTab = rememberedTab(jar, tabScope, ["features", "details", "registration", "checkpoints", "address", "alerts", "danger"]) ?? "features";
```

3. Add a trigger as the first child of `<TabsList>`:

```tsx
          <TabsTrigger value="features">Features</TabsTrigger>
```

4. Add a content panel next to `<TabsContent value="address" …>`, outside the settings
   `<form>`. The Features tab has its own forms, and a form can't sit inside another form.

```tsx
      <TabsContent value="features" className="flex flex-col gap-4 @container">
        <FeaturesTab eventId={ev.id} />
      </TabsContent>
```

- [ ] **Step 5: Typecheck, lint and test**

Run: `npx tsc --noEmit && npx eslint src/features/catalogue "src/app/admin/events/[id]/settings" && npm test`
Expected: no errors, and every test passes.

- [ ] **Step 6: Check it in the browser**

1. Start the dev server with `preview_start` (`.claude/launch.json`).
2. Ask the user to sign in to admin in the browser pane. You must not type their password.
3. Open Settings on a test event. Use any event except `ecphub`; `ecpkom` is the usual test
   event.
4. Confirm Features opens first and lists every add-on as On, because of the backfill.
5. Turn Slido embedding off and back on, and confirm the flash messages.
6. Add a custom module, edit it, and remove it.
7. Take a screenshot.

- [ ] **Step 7: Commit**

```bash
git pull --rebase
git add src/features/catalogue "src/app/admin/events/[id]/settings/page.tsx"
git commit -m "feat(catalogue): Settings -> Features, add-on switches and custom modules (D440)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Hiding in the sidebar and settings, the panel, WhatsApp and Address

**Files:**
- Create: `src/features/catalogue/admin/NotInEvent.tsx`
- Modify: `src/features/catalogue/index.ts`
- Modify: `src/components/admin/nav.ts`
- Modify: `tests/nav.test.ts`
- Modify: `src/components/admin/AppSidebar.tsx`
- Modify: `src/app/admin/events/[id]/layout.tsx`
- Modify: `src/app/admin/events/[id]/settings/page.tsx`
- Modify: `src/app/admin/events/[id]/whatsapp/page.tsx`
- Modify: `src/app/admin/events/[id]/actions.ts` (`sendWhatsappAction`, line 1378)
- Modify: `src/features/domains/admin/actions.ts` (the `event()` helper, line 15)

**Interfaces:**
- Consumes: `hiddenNav`, `hiddenSettingsTabs`, `has`, `eventFeatures`, `requireFeature`,
  `setAddonAction`, `FEATURES`, `NavKey`, `AddonKey`
- Produces:
  - `groupsFor(ev, hidden: readonly NavKey[] = [])`
  - `Item.key?: NavKey`
  - `<NotInEvent eventId={string} title={string} keys={AddonKey[]} back={string} />`.
    Tasks 6 and 7 use it.

- [ ] **Step 1: Write the failing nav tests**

Append inside the `describe("groupsFor", …)` block in `tests/nav.test.ts`:

```ts
  it("leaves out the items it is told to hide, and nothing else (D438)", () => {
    const shown = groupsFor({ id: "e1", check_in_enabled: true }, ["whatsapp", "games"]).flatMap((g) => g.items.map((i) => i.label));
    expect(shown).not.toContain("WhatsApp");
    expect(shown).not.toContain("Games");
    expect(shown).toContain("Activities");
    expect(shown).toContain("Settings");
  });

  it("hides Activities on request, keeping the rest of Portal in order", () => {
    const portal = groupsFor({ id: "e1", check_in_enabled: true }, ["activities"]).find((g) => g.title === "Portal");
    expect(portal?.items.map((i) => i.label)).toEqual(["Agenda", "Info page", "Announcements", "Modules"]);
  });
```

Run: `npx vitest run tests/nav.test.ts`
Expected: FAIL. `groupsFor` ignores the second argument, so WhatsApp is still listed.

- [ ] **Step 2: Implement `hidden` in `nav.ts`**

- Change the `Item` type to:
  `export type Item = { href: string; label: string; icon: IconName; newTab?: boolean; key?: NavKey };`
  with `import type { NavKey } from "@/features/catalogue/client";`
- Change the signature to:
  `export function groupsFor(ev: { id: string; check_in_enabled: boolean } | null | undefined, hidden: readonly NavKey[] = []): Group[]`
- Add `key: "games"` to the Games item, `key: "activities"` to the Activities item, and
  `key: "whatsapp"` to the WhatsApp item.
- Store the array the function builds today in `const groups: Group[] = [ …the three groups… ];`
  and end with:

```ts
  return groups.map((g) => ({ ...g, items: g.items.filter((i) => !i.key || !hidden.includes(i.key)) }));
```

- Add to the doc comment: "Add-ons the event doesn't have are left out (D438): WhatsApp,
  Activities and Games each carry the key `hiddenNav` names."

Run: `npx vitest run tests/nav.test.ts`
Expected: PASS, both the old tests and the new ones.

- [ ] **Step 3: Pass `hidden` through the sidebar and the layout**

`AppSidebar.tsx`:
- Change the props to `{ email, event, hidden = [] }: { email: string; event?: Event | null; hidden?: NavKey[] }`.
- Change `const groups = groupsFor(event);` to `const groups = groupsFor(event, hidden);`.
- Add `import type { NavKey } from "@/features/catalogue/client";`

`src/app/admin/events/[id]/layout.tsx`:
- Add `import { eventFeatures, hiddenNav } from "@/features/catalogue";`
- After `const ev = await requireEvent(id, orgId);` add `const features = await eventFeatures(ev.id);`
- Pass `hidden={hiddenNav(features)}` to `<AppSidebar …>`.

- [ ] **Step 4: Write `NotInEvent.tsx`**

```tsx
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Card, CardContent } from "@/components/ui/card";
import { FEATURES, type AddonKey } from "../catalogue";
import { setAddonAction } from "./actions";

/**
 * What a hidden area shows when it is opened by URL (D438): which add-on it needs and a way to
 * turn it on, rather than a 404 that reads like something broke. Activities and Games can need
 * either of two add-ons, so it takes a list.
 */
export function NotInEvent({ eventId, title, keys, back }: { eventId: string; title: string; keys: AddonKey[]; back: string }) {
  const names = keys.map((k) => FEATURES[k].name).join(" or ");
  return (
    <div className="flex flex-col gap-4">
      <AdminHeader title={title} />
      <Card>
        <CardContent className="flex flex-col items-start gap-3">
          <p className="text-sm font-bold">Not part of this event</p>
          <p className="text-sm text-muted-foreground">This needs {names}. Turning it on hides nothing else and deletes nothing.</p>
          <div className="flex flex-wrap gap-2">
            {keys.map((k) => (
              <form key={k} action={setAddonAction.bind(null, eventId, k, true, back)}>
                <SubmitButton>Turn on {FEATURES[k].name}</SubmitButton>
              </form>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

Check `AdminHeader`'s props (`src/components/admin/AdminHeader.tsx`). If `subtitle` or
`actions` are required, pass what it needs.

Add `export { NotInEvent } from "./admin/NotInEvent";` to `src/features/catalogue/index.ts`.

- [ ] **Step 5: Gate WhatsApp**

`src/app/admin/events/[id]/whatsapp/page.tsx`:
- Add `import { eventFeatures, has, NotInEvent } from "@/features/catalogue";`
- Right after the line that sets `ev` with `requireEvent`, add:

```tsx
  if (!has(await eventFeatures(ev.id), "whatsapp")) {
    return <NotInEvent eventId={ev.id} title="WhatsApp" keys={["whatsapp"]} back={`/admin/events/${ev.id}/whatsapp`} />;
  }
```

`src/app/admin/events/[id]/actions.ts`, in `sendWhatsappAction`:
- Add `import { requireFeature } from "@/features/catalogue";` with the other imports.
- After the line `const fail = …`, add `await requireFeature(ev.id, "whatsapp", here);`.

- [ ] **Step 6: Gate the Address tab and its actions**

`settings/page.tsx`:
- Add `eventFeatures` and `hiddenSettingsTabs` to the catalogue import.
- After `requireEvent`, add:
  `const hiddenTabs = hiddenSettingsTabs(await eventFeatures(ev.id));`
- Change the allowed list in `rememberedTab` to filter out hidden tabs:

```ts
  const tabs = (["features", "details", "registration", "checkpoints", "address", "alerts", "danger"] as const).filter((t) => !(hiddenTabs as readonly string[]).includes(t));
  const openTab = rememberedTab(jar, tabScope, tabs) ?? "features";
```

- Render the Address `TabsTrigger` and its `TabsContent` only when
  `!hiddenTabs.includes("address")`.

`src/features/domains/admin/actions.ts`:
- Add `import { requireFeature } from "@/features/catalogue";`
- Change `event()` to:

```ts
async function event(eventId: string) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  await requireFeature(ev.id, "custom_domain", back(eventId));
  return ev;
}
```

  `back` is declared above `event()` already, so no reordering is needed.

- [ ] **Step 7: Typecheck, lint and test**

Run: `npx tsc --noEmit && npx eslint src && npm test`
Expected: no errors, and every test passes.

- [ ] **Step 8: Check it in the browser (signed in, test event)**

1. Turn WhatsApp off. Check the sidebar item is gone.
2. Open `/admin/events/<id>/whatsapp` directly. Check the panel shows. Press Turn on and check
   you land back on WhatsApp.
3. Turn Custom domain off. Check the Address tab is gone. Turn it back on.
4. Take a screenshot of the panel.

- [ ] **Step 9: Commit**

```bash
git pull --rebase
git add src/features/catalogue src/components/admin/nav.ts src/components/admin/AppSidebar.tsx tests/nav.test.ts "src/app/admin/events/[id]/layout.tsx" "src/app/admin/events/[id]/settings/page.tsx" "src/app/admin/events/[id]/whatsapp/page.tsx" "src/app/admin/events/[id]/actions.ts" src/features/domains/admin/actions.ts
git commit -m "feat(catalogue): hide WhatsApp and Address without their add-ons, with a Turn on panel (D438)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Activities

**Files:**
- Modify: `src/features/activities/admin/NewActivityMenu.tsx`
- Modify: `src/app/admin/events/[id]/activities/page.tsx`
- Modify: `src/features/activities/admin/ActivityDetailPage.tsx`
- Modify: `src/features/activities/admin/actions.ts`

**Interfaces:**
- Consumes: `eventFeatures`, `has`, `activityKindsFor`, `featureForActivityKind`,
  `requireFeature`, `NotInEvent`
- Produces: `NewActivityMenu({ forms, kinds }: { forms: Record<ActivityKind, React.ReactNode>; kinds: readonly ActivityKind[] })`

- [ ] **Step 1: Limit the New activity menu**

In `NewActivityMenu.tsx`:
- Change the props to
  `{ forms, kinds }: { forms: Record<ActivityKind, React.ReactNode>; kinds: readonly ActivityKind[] }`.
- Change `{ACTIVITY_KINDS.map((kind) => {` to `{kinds.map((kind) => {`.
- Remove `ACTIVITY_KINDS` from the `../kinds/meta` import if nothing else in the file uses it.
- Add to the doc comment: "Only the kinds the event's add-ons allow are offered (D438)."

- [ ] **Step 2: Gate the list page and filter it**

In `src/app/admin/events/[id]/activities/page.tsx`:
- Add `import { activityKindsFor, eventFeatures, NotInEvent } from "@/features/catalogue";`
- Right after `const ev = await requireEvent(id, orgId);` add:

```tsx
  const kinds = activityKindsFor(await eventFeatures(ev.id));
  if (kinds.length === 0) {
    return <NotInEvent eventId={ev.id} title="Activities" keys={["booking", "engagement"]} back={`/admin/events/${ev.id}/activities`} />;
  }
```

- In the `Promise.all` destructuring, rename `activities` to `allActivities`. Directly after
  the `Promise.all`, add:

```ts
  // An activity of a kind this event no longer has is kept, not deleted (D439), but not listed.
  const activities = allActivities.filter((a) => kinds.includes(a.kind));
```

- Pass `kinds={kinds}` to `<NewActivityMenu …>`.

- [ ] **Step 3: Gate the detail page**

In `ActivityDetailPage.tsx`:
- Add `import { eventFeatures, featureForActivityKind, has, NotInEvent } from "@/features/catalogue";`
- After `if (!activity) notFound();` add:

```tsx
  const need = featureForActivityKind(activity.kind);
  if (!has(await eventFeatures(ev.id), need)) {
    return <NotInEvent eventId={ev.id} title={activity.name} keys={[need]} back={`/admin/events/${ev.id}/activities/${activity.id}`} />;
  }
```

- [ ] **Step 4: Guard the writes**

In `src/features/activities/admin/actions.ts`:
- Add `import { featureForActivityKind, requireFeature } from "@/features/catalogue";`
- Add `ActivityKind` to the `@/lib/types` type import.
- Add below `event()`:

```ts
/** Refuses a write for a kind whose add-on is off (D438). Its rows stay; only writes stop. */
async function allowKind(ev: Event, kind: ActivityKind) {
  await requireFeature(ev.id, featureForActivityKind(kind), listPath(ev.id));
}
```

- Add `await allowKind(ev, "booking");` as the line after `const ev = await event(eventId);`
  in `addActivityAction`.
- Add `await allowKind(ev, "submission");` the same way in `addSubmissionActivityAction`.
- Add `await allowKind(ev, "passport");` the same way in `addPassportActivityAction`.
- In `bookingOf`, `submissionOf` and `passportOf`, add `await allowKind(ev, activity.kind);`
  (for `passportOf`: `await allowKind(ev, passport.kind);`) just before the `return`. Every
  per-kind save, session, booth, request and submission action goes through one of these three.

- [ ] **Step 5: Typecheck, lint and test**

Run: `npx tsc --noEmit && npx eslint src && npm test`
Expected: no errors, and every test passes.

- [ ] **Step 6: Check it in the browser (signed in, test event)**

1. Turn Session booking off.
   - New activity offers only Submission and Passport.
   - A booking activity has gone from the list.
   - Its old URL shows the panel.
2. Turn Engagement activities off as well. Activities leaves the sidebar, and its URL shows
   the panel with two Turn on buttons.
3. Turn both back on and check every activity is back, with its bookings intact.

- [ ] **Step 7: Commit**

```bash
git pull --rebase
git add src/features/activities/admin "src/app/admin/events/[id]/activities/page.tsx"
git commit -m "feat(catalogue): activity kinds follow Session booking and Engagement activities (D438)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Games

**Files:**
- Modify: `src/features/games/admin/NewGameMenu.tsx`
- Modify: `src/app/admin/events/[id]/games/page.tsx`
- Modify: `src/app/admin/events/[id]/games/[gameId]/page.tsx`
- Modify: `src/app/admin/events/[id]/games/actions.ts`

**Interfaces:**
- Consumes: `eventFeatures`, `has`, `gameKindsFor`, `featureForGameKind`, `requireFeature`,
  `notPartOf`, `NotInEvent`
- Produces: `NewGameMenu({ forms, kinds }: { forms: Record<GameKind, React.ReactNode>; kinds: readonly GameKind[] })`

- [ ] **Step 1: Limit the New game menu**

In `NewGameMenu.tsx`:
- Change the props to
  `{ forms, kinds }: { forms: Record<GameKind, React.ReactNode>; kinds: readonly GameKind[] }`.
- Wherever the component maps over `KINDS` to render menu items, map over
  `KINDS.filter((k) => kinds.includes(k.kind))` instead.
- Leave `current = KINDS.find(…)` as it is.

- [ ] **Step 2: Gate the list page and filter it**

In `games/page.tsx`:
- Add `import { eventFeatures, gameKindsFor, NotInEvent } from "@/features/catalogue";`
- After `requireEvent`, add:

```tsx
  const kinds = gameKindsFor(await eventFeatures(ev.id));
  if (kinds.length === 0) {
    return <NotInEvent eventId={ev.id} title="Games" keys={["live_games", "lucky_draw"]} back={`/admin/events/${ev.id}/games`} />;
  }
```

- Change `const games = await listGames(ev.id);` to:

```ts
  // A game of a kind this event no longer has is kept (D439), but not listed.
  const games = (await listGames(ev.id)).filter((g) => kinds.includes(g.kind));
```

  Move this line below the `kinds` check.
- Pass `kinds={kinds}` to `<NewGameMenu …>`.
- Change the empty-state sentence to:

```tsx
`No games yet. Use New game to add ${kinds.map((k) => GAME_KIND_LABELS[k].toLowerCase()).join(", ")}.`
```

  Check the result reads naturally against `GAME_KIND_LABELS`, e.g. "tap race, last one standing,
  lucky draw".

- [ ] **Step 3: Gate the editor**

In `games/[gameId]/page.tsx`:
- Add `import { eventFeatures, featureForGameKind, has, NotInEvent } from "@/features/catalogue";`
- After `if (!game) notFound();` add:

```tsx
  const need = featureForGameKind(game.kind);
  if (!has(await eventFeatures(ev.id), need)) {
    return <NotInEvent eventId={ev.id} title={game.title} keys={[need]} back={`/admin/events/${ev.id}/games/${game.id}`} />;
  }
```

- [ ] **Step 4: Guard the writes**

In `games/actions.ts`:
- Add `import { eventFeatures, featureForGameKind, has, notPartOf, requireFeature } from "@/features/catalogue";`
- `createGameAction`: after the `isGameKind` check, add
  `await requireFeature(ev.id, featureForGameKind(kind), gamesPath(ev.id));`
- `updateGameAction`: after the `if (!game) redirect(…)` line, add
  `await requireFeature(ev.id, featureForGameKind(game.kind), gamesPath(ev.id));`
- `resetDrawAction`: after its not-found check, add the same `requireFeature` line.
- `backgroundVideoUploadAction` returns an object, so it can't use a redirect. Replace its
  `if (!(await getGame(gameId, ev.id))) return …;` line with:

```ts
  const game = await getGame(gameId, ev.id);
  if (!game) return { ok: false, error: "That game no longer exists." };
  if (!has(await eventFeatures(ev.id), featureForGameKind(game.kind))) return { ok: false, error: notPartOf(featureForGameKind(game.kind)) };
```

- `gameImageUploadAction`: after `if (!game) return …;` add:

```ts
  if (!has(await eventFeatures(ev.id), featureForGameKind(game.kind))) return { ok: false, error: notPartOf(featureForGameKind(game.kind)) };
```

- `deleteGameAction` and the two link rotations stay ungated. Deleting doesn't need the add-on,
  and the host and display links serve the event, not one kind.

- [ ] **Step 5: Typecheck, lint and test**

Run: `npx tsc --noEmit && npx eslint src && npm test`
Expected: no errors, and every test passes.

- [ ] **Step 6: Check it in the browser (signed in, test event)**

1. Turn Lucky draw off.
   - New game offers only Tap race and Last one standing.
   - Draws leave the list.
   - A draw's old URL shows the panel.
2. Check the host console link still opens. It isn't gated.
3. Turn Live games off as well. Games leaves the sidebar.
4. Turn both back on and check every game is back, winners included.

- [ ] **Step 7: Commit**

```bash
git pull --rebase
git add src/features/games/admin/NewGameMenu.tsx "src/app/admin/events/[id]/games"
git commit -m "feat(catalogue): game kinds follow Live games and Lucky draw (D438)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Database check and close-out

**Files:**
- Create: `scripts/catalogue-db-check.mjs`
- Modify: `package.json` (the `scripts` block)
- Modify: `docs/superpowers/specs/2026-10-10-feature-catalogue-design.md` (Status line)

**Interfaces:**
- Consumes: the tables from Task 1

- [ ] **Step 1: Write the check**

`scripts/catalogue-db-check.mjs`:

```js
// Executable evidence that the catalogue's tables (supabase/migrations/0070_event_features.sql)
// behave as the spec says against a real database. vitest has no database (D141).
//
// WHAT THIS PROVES:
//   1. Every event created before the migration has all seven stored add-ons (D435).
//   2. A new event starts with none.
//   3. event_features refuses `custom` and unknown keys, and a duplicate row (D434, D436).
//   4. Turning an add-on off (deleting its row) leaves the event's games untouched (D439).
//   5. event_custom_modules refuses an empty name, a name over 80 characters and a description
//      over 2,000 (D436).
//   6. Deleting the event removes its feature rows and custom modules (cascade).
//
// HOW TO RUN: npm run check:catalogue (node --env-file=.env.local scripts/catalogue-db-check.mjs).
// SAFE TO RE-RUN: it creates its own draft event with a random slug and deletes it in `finally`.
// It never touches the event with slug `ecphub`, except to read its add-on count.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// When 0070 was applied: events created before this must have been backfilled. Set it to the
// time Task 1 applied the migration (Malaysia time).
const MIGRATED_AT = "2026-10-10T23:59:59+08:00";
const STORED = ["whatsapp", "booking", "engagement", "live_games", "lucky_draw", "custom_domain", "slido"];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/catalogue-db-check.mjs");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const runId = randomUUID().replaceAll("-", "");
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
};
const must = ({ data, error }) => { if (error) throw error; return data; };

// 1. The backfill.
const older = must(await db.from("events").select("id, slug").lt("created_at", MIGRATED_AT));
const rows = must(await db.from("event_features").select("event_id, feature").in("event_id", older.map((e) => e.id)));
const short = older.filter((e) => rows.filter((r) => r.event_id === e.id).length !== STORED.length);
check("every event from before the migration has all seven add-ons", short.length === 0, short.map((e) => e.slug).join(", "));

const org = must(await db.from("organisations").select("id").limit(1).single());
const event = must(await db.from("events").insert({ org_id: org.id, name: `Catalogue check ${runId}`, slug: `catalogue-check-${runId}` }).select("id, org_id").single());

try {
  // 2. A new event starts empty.
  check("a new event starts with no add-ons", must(await db.from("event_features").select("feature").eq("event_id", event.id)).length === 0);

  // 3. What event_features accepts.
  must(await db.from("event_features").insert({ event_id: event.id, feature: "lucky_draw" }));
  check("custom is refused", Boolean((await db.from("event_features").insert({ event_id: event.id, feature: "custom" })).error));
  check("an unknown key is refused", Boolean((await db.from("event_features").insert({ event_id: event.id, feature: "raffle" })).error));
  check("a duplicate row is refused", Boolean((await db.from("event_features").insert({ event_id: event.id, feature: "lucky_draw" })).error));

  // 4. Turning off keeps the data.
  const game = must(await db.from("games").insert({ org_id: event.org_id, event_id: event.id, kind: "draw", title: "Check draw" }).select("id").single());
  must(await db.from("event_features").delete().eq("event_id", event.id).eq("feature", "lucky_draw"));
  const kept = must(await db.from("games").select("id").eq("id", game.id));
  check("turning Lucky draw off keeps the draw", kept.length === 1);

  // 5. What event_custom_modules accepts.
  const base = { org_id: event.org_id, event_id: event.id };
  must(await db.from("event_custom_modules").insert({ ...base, name: "Photo mosaic wall", description: "Live wall" }));
  check("an empty name is refused", Boolean((await db.from("event_custom_modules").insert({ ...base, name: "   " })).error));
  check("an 81-character name is refused", Boolean((await db.from("event_custom_modules").insert({ ...base, name: "x".repeat(81) })).error));
  check("a 2,001-character description is refused", Boolean((await db.from("event_custom_modules").insert({ ...base, name: "Long", description: "x".repeat(2001) })).error));
  must(await db.from("event_features").insert({ event_id: event.id, feature: "whatsapp" }));
} finally {
  // 6. Cascade.
  must(await db.from("events").delete().eq("id", event.id));
  const left = [
    ...must(await db.from("event_features").select("event_id").eq("event_id", event.id)),
    ...must(await db.from("event_custom_modules").select("id").eq("event_id", event.id)),
  ];
  check("deleting the event removes its add-ons and custom modules", left.length === 0);
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
```

Set `MIGRATED_AT` to a time after Task 1's `apply_migration` and before any event was created
since. Check with:

```sql
select max(created_at) from events;
```

If an event was created after the migration, it correctly has no add-ons. Pick a time between
the migration and that event.

- [ ] **Step 2: Add the npm script**

In `package.json`, after `"check:games": …,` add:

```json
    "check:catalogue": "node --env-file=.env.local scripts/catalogue-db-check.mjs",
```

- [ ] **Step 3: Run it**

Run: `npm run check:catalogue`
Expected: every line `PASS`, then `All checks passed.` and exit code 0.

- [ ] **Step 4: Run everything**

Run: `npx tsc --noEmit && npx eslint src && npm test && npm run build`
Expected: no errors, every test passes, and the build succeeds.

- [ ] **Step 5: Mark the spec built**

In the spec, change the status line to:

```markdown
**Status: approved in chat on 10 Oct 2026. Built <date>; plan docs/superpowers/plans/2026-10-10-feature-catalogue.md.**
```

- [ ] **Step 6: Commit**

```bash
git pull --rebase
git add scripts/catalogue-db-check.mjs package.json docs/superpowers/specs/2026-10-10-feature-catalogue-design.md
git commit -m "test(catalogue): database check for the backfill, keys, custom modules and cascade

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Spec coverage

| Spec decision | Task |
| --- | --- |
| D433 Catalogue in code | 2 |
| D434 `event_features` | 1 |
| D435 Backfill | 1, checked in 8 |
| D436 Custom modules | 1, 2 (`readCustomModule`), 3, 4 |
| D437 Reader | 3 |
| D438 Hidden areas, panel, refused writes | 5, 6, 7 |
| D439 Off never deletes | 3 (`setAddon`), checked in 8 |
| D440 Features tab | 4 |
| Testing | 2, 5 (vitest), 8 (database), 4–7 (browser) |
