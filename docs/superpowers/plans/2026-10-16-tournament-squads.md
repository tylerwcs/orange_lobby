# Tournament Squads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fifth activity kind, `tournament`. It holds several sports, each with a squad size. Captains (or members themselves) fill their attendee group's squad for every sport before a deadline. After it, admins swap players and export every squad.

**Architecture:**
- **New feature folder** `src/features/tournaments/`, with `index.ts` (server) and `client.ts` (browser) entries:
  - pure rules in `lib/`
  - service-role queries and the rpc wrappers in `db/`
  - portal and admin screens in `components/` and `admin/`
  - its own server actions
- **Kind glue** in `src/features/activities/kinds/tournament/`. It imports the tournaments feature only through its entries. The tournaments feature never imports `@/features/activities` or `@/lib/portal`, so there is no cycle; it builds its own portal context, as `src/features/polaroid/context.ts` does.
- **Squad writes** all go through two SQL functions (`add_squad_member`, `remove_squad_member`). They lock the sport row, so two captains can never fill the same last place.

**Tech Stack:**
- Next.js 16 App Router: server actions, one route handler. Read `node_modules/next/dist/docs/` before using any Next API this repo doesn't already use.
- React 19, TypeScript, Tailwind v4, shadcn `base-nova` (Base UI). Vitest (node, `tests/**/*.test.ts`, no DOM).
- Supabase: service-role client, RLS on with no policies, and the MCP `apply_migration`. `exceljs` via `src/lib/exports.ts`.

**Spec:** `docs/superpowers/specs/2026-10-16-tournament-squads-design.md` (D637–D652). Read it first; this plan argues from it.

## Global Constraints

- **Kind:** `tournament`. KIND_META:
  - label `"Tournament"`, icon lucide `Trophy`
  - what `"Groups send squads to each sport"`
  - title `"Add a tournament"`, hint `"Add its sports once it exists."`
  - Unlocked by the `engagement` add-on.
- **Words (D650):**
  - "Squad" and "Sport" in the UI, never "roster": `rosters.xlsx` is breakout rooms.
  - The code types are `TournamentSport` and `SquadRow`.
- **Squad size (D638):** `1 ≤ min ≤ max ≤ 30`. Sport names are unique per tournament, case-insensitive.
- **Size label:**
  - `"1 of 2"`, `"2 of 2 ✓"`
  - with subs: `"5 of 5–7 ✓"` (en dash)
  - over: `"Over · 1 too many"`
- **Deadline wording** uses the existing `opensLabel(iso)` format: `"Fri 24 Oct, 6:00pm"`. The spec's mockup `6:00 pm` is superseded, so the app has one time format.
- **Squad states (D646):**
  - before the deadline: `full` / `short` / `over`
  - from the deadline on: `ready` / `forfeit` / `over`
  - Short label: `"1 short"`.
- **Counted row (D643):** a squad row counts only while its attendee has `cancelled_at is null` and `group_id = row.group_id`. Every count, list, hint and the export uses counted rows only.
- **Flash copy (D642), verbatim:**
  - `full` → `"<Sport> is full."`
  - `locked` → `"Squads are locked. Ask the organisers to make changes."`
  - `not_allowed` → `"Only your captain can change squads."`
  - `not_member` → `"They're not in your group."`
  - `already` → `"<Name> is already in <Sport>."`
  - `missing` → `"That squad no longer exists."`
  - `closed` → `"This tournament is closed."`
- **Imports:** a feature is imported only through its entry — `@/features/<name>` on the server, `@/features/<name>/client` in the browser. Inside a feature, imports are relative. `src/lib` never imports a feature. Tests in `tests/tournaments/` may import internals.
- **Never test on slug `ecphub`.** Use `ecpkom` (id `4e64a90c-728c-4a08-af62-8c8046afa0c9`). Its Team 1 has a Captain (Adrian) and a Vice Captain (Tan Wei Jie).
- **Supabase project** `wfmqwwcolfigjylkgrsv`. Load the tools with `ToolSearch` `select:mcp__0687aa52-4553-40db-b867-72024a86f547__apply_migration,mcp__0687aa52-4553-40db-b867-72024a86f547__execute_sql,mcp__0687aa52-4553-40db-b867-72024a86f547__get_advisors`.
- **Git:**
  - Work on `main`. Run `git pull --rebase --autostash` before each commit. Never push.
  - Never stage `docs/superpowers/specs/2026-09-27-intro-video-design.md`, `docs/image-guide/`, `docs/ECP-Hub-Privacy-Policy.pdf` or `.superpowers/`.
  - Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Checks before every commit:** `npx tsc --noEmit`, `npm run lint`, `npm test`. `npm run build` also runs in Task 8.
- **Copy:** sentence case, no exclamation marks.

## Review Focus

1. **Two captains, or a captain and a vice, adding to the last place at the same moment.** One gets in; the other is told `"<Sport> is full."`. Covered by the Task 1 check script.
2. **A member moves group or cancels after being picked.** They stop counting at once, everywhere: the squad goes short, the "not in any sport" notice drops them, and the export leaves them out. Their new group's captain can add them, which replaces the stale row. Tests in Task 2 (pure) and Task 1 (SQL replace).
3. **An admin shrinks a sport after squads are full** (5 → 4). Nobody is removed. The squad reads `Over · 1 too many`, the captain can remove but not add, and admin rows show Over. Tests in Task 2 and Task 1 (a portal add refused while over).
4. **The deadline passes while a captain's page is open.** Their next tap is refused with the `locked` flash, because the server compares with `now()`, not the page. Covered by the Task 1 check script (deadline in the past → `locked`; admin path still `ok`).
5. **An attendee with no group, or outside the tournament's categories.** No card, no page (404), not in Coming soon, not pickable. Tests in Task 4 (entries and coming filter) and Task 1 (`not_member` for a category mismatch).

## File map

| File | Status | Responsibility |
| --- | --- | --- |
| `supabase/migrations/0097_tournament_squads.sql` | create | Kind, columns, two tables, two functions |
| `scripts/squads-db-check.mjs`, `package.json` | create/modify | DB evidence, `check:squads` |
| `src/features/tournaments/lib/squads.ts` | create | Counted rows, states, labels, hints, export rows, refusals |
| `src/features/tournaments/lib/sports.ts` | create | Sport form reader |
| `src/features/tournaments/db/tournaments.ts` | create | Sports CRUD, squad rows, rpc wrappers |
| `src/features/tournaments/context.ts` | create | Portal attendee context |
| `src/features/tournaments/actions.ts`, `admin/actions.ts` | create | Portal and admin squad actions, sport actions |
| `src/features/tournaments/components/*`, `admin/*` | create | Portal page, picker, admin tabs |
| `src/features/tournaments/index.ts`, `client.ts` | create | Entries |
| `src/lib/types.ts`, `src/features/activities/**`, `src/features/catalogue/catalogue.ts`, `src/app/admin/events/[id]/activities/page.tsx` | modify | Kind wiring |
| `src/features/activities/kinds/tournament/settings.ts`, `TournamentDetail.tsx`, `TournamentBody.tsx` | create | Kind shells |
| `src/app/admin/events/[id]/export/squads.xlsx/route.ts` | create | Export (D649) |
| `tests/tournaments/*.test.ts`, `tests/activities/*.test.ts`, `tests/catalogue/catalogue.test.ts` | create/modify | Tests |

**Where this plan differs from the spec, on purpose:**
- **The admin page still opens on Setup.** The tab strip is Setup · Squads · Sports. Every activity page lands on Setup and a bare link carries no `tab` (D234, D236). After creating a tournament, the add action redirects to the Sports tab; after that the organiser lives on Squads.
- **The deadline reads "6:00pm".** This matches every other time in the app.

---

### Task 1: Database — migration 0097 and its check script

**Files:**
- Create: `supabase/migrations/0097_tournament_squads.sql`, `scripts/squads-db-check.mjs`
- Modify: `package.json` (add `"check:squads": "node --env-file=.env.local scripts/squads-db-check.mjs"` after `check:schedule`)

**Interfaces:**
- Produces:
  - columns `activities.squads_close_at timestamptz` and `activities.squad_fill text`
  - tables `tournament_sports` and `tournament_squad_members`
  - `add_squad_member(p_sport_id uuid, p_attendee_id uuid, p_actor_id uuid, p_admin boolean) returns text`
  - `remove_squad_member(p_sport_id uuid, p_attendee_id uuid, p_actor_id uuid, p_admin boolean) returns text`
  - Each returns one of `ok | full | locked | not_allowed | not_member | already | missing | closed`.

- [ ] **Step 1: Write the migration**

Schema:
- The `activities_kind_check` constraint is recreated to allow `'tournament'` (copy 0076's drop/add pattern, adding the fifth value).
- `activities`:
  - `squads_close_at timestamptz`
  - `squad_fill text check (squad_fill in ('captains','self'))`
  - Both nullable; other kinds leave them null.
- `tournament_sports`:
  - `id uuid pk default gen_random_uuid()`
  - `activity_id uuid not null references activities on delete cascade`
  - `name text not null check (length(btrim(name)) between 1 and 60)`
  - `min_size int not null`, `max_size int not null`, with `check (min_size >= 1 and max_size >= min_size and max_size <= 30)`
  - `position int not null default 0`
  - `created_at timestamptz not null default now()`
  - unique index on `(activity_id, lower(name))`
  - index on `(activity_id, position)`
- `tournament_squad_members`:
  - `sport_id uuid not null references tournament_sports on delete cascade`
  - `group_id uuid not null references event_groups on delete cascade`
  - `attendee_id uuid not null references attendees on delete cascade`
  - `added_by uuid references attendees on delete set null` (null = admin)
  - `added_at timestamptz not null default now()`
  - `primary key (sport_id, attendee_id)`
  - index on `(sport_id, group_id)`
- RLS is enabled on both tables, with no policies.

Both functions:
- `language plpgsql`, `set search_path = ''`, every name schema-qualified (`public.`)
- `revoke execute … from public, anon, authenticated`, then `grant execute … to service_role`
- the 0080 header-comment style

Body of `add_squad_member`, in this order (this is the rule set; write it in that file's style):

```sql
-- 1. lock and load
select s.* into v_sport from public.tournament_sports s where s.id = p_sport_id for update;  -- not found → 'missing'
select a.* into v_act from public.activities a where a.id = v_sport.activity_id;            -- kind <> 'tournament' → 'missing'
select * into v_att from public.attendees where id = p_attendee_id;
--   not found, other event, cancelled_at not null, group_id null → 'not_member'
--   not public.category_matches(v_act.categories, v_att.category) → 'not_member'
-- 2. portal-only checks (skipped when p_admin)
--   not v_act.is_open → 'closed'
--   v_act.squads_close_at is not null and now() >= v_act.squads_close_at → 'locked'
--   actor: load p_actor_id; cancelled, other event, or group_id <> v_att.group_id → 'not_member'
--   v_proxy := exists (select 1 from unnest(v_act.proxy_fields) f(k)
--              where lower(btrim(coalesce(v_actor.extra->>f.k,''))) in ('yes','y','true'))
--   squad_fill = 'captains': not v_proxy → 'not_allowed'
--   squad_fill = 'self': p_actor_id <> p_attendee_id and not v_proxy → 'not_allowed'
-- 3. already counted in this sport → 'already'
--   (row exists for (sport, attendee) with row.group_id = v_att.group_id)
-- 4. capacity (portal only): counted rows for (sport, v_att.group_id) >= v_sport.max_size → 'full'
--   counted = join attendees x on x.id = m.attendee_id
--             where x.cancelled_at is null and x.group_id = m.group_id
-- 5. upsert: insert (sport, v_att.group_id, attendee, case when p_admin then null else p_actor_id end)
--   on conflict (sport_id, attendee_id) do update set group_id, added_by, added_at = now()
--   (this replaces a stale row from an old group - D643)
-- return 'ok'
```

`remove_squad_member` has the same step 1, except a missing attendee row is `missing`. The group and category checks are skipped: you can always remove someone. Step 2 is the same, except:
- under `self`, `p_actor_id = p_attendee_id` is allowed without proxy;
- the actor's group must equal the row's `group_id`.

Then it deletes the row and returns `ok`. A missing row returns `ok`: it's already gone.

- [ ] **Step 2: Apply it**

Use the MCP `apply_migration` with name `0097_tournament_squads` and the file's contents. Then run `get_advisors` (security).
Expected: no new advisory naming these tables or functions, other than the usual "RLS enabled, no policies".

- [ ] **Step 3: Write `scripts/squads-db-check.mjs`**

Copy the skeleton of `scripts/polaroid-db-check.mjs`:
- env check
- a throwaway draft event with a random slug, deleted in `finally`
- `check(label, ok, detail)`
- exit code

Seed:
- groups G1 and G2
- attendees: captain C (`extra: { captain: "Yes" }`, G1), vice V (`{ vice_captain: "Yes" }`, G1), members M1, M2, M3 (G1), M4 (G2)
- a tournament activity: `kind 'tournament'`, `is_open true`, `squad_fill 'captains'`, `proxy_fields ['captain','vice_captain']`, `squads_close_at = now() + 1 day`, `questions []`, `per_day false`, `required false`, `max_per_attendee null`
- sport "Badminton", min 2, max 2

The checks, in order (call via `db.rpc`):
1. C adds M1 → `ok`. M1 adds M2 → `not_allowed`. C adds M4 → `not_member`.
2. **Race:** C adds M2 and V adds M3 in `Promise.all`. Exactly one `ok` and one `full`, and the counted squad size is 2.
3. C adds M1 again → `already`.
4. **Stale row replaced:** move M1 to G2 (`update attendees set group_id`). G1's counted size is now 1. A G2 actor (give M4 `captain: Yes`) adds M1 → `ok`, the row's `group_id` is G2, and there's still only one row for (sport, M1).
5. **Cancelled member:** set the remaining G1 member's `cancelled_at` → G1 counts 0.
6. **Deadline:** set `squads_close_at = now() - 1 minute`. A portal add → `locked`. An admin add (`p_admin true`, actor null) → `ok`. An admin add past max → `ok`.
7. **Over max, portal:** reset the deadline to the future. G1 has 3 counted rows with max 2. A portal add → `full`, and a portal remove by C → `ok`.
8. **Self mode:** `squad_fill 'self'`. M2 adds M2 → `ok`. M2 adds M3 → `not_allowed`. M2 removes M2 → `ok`.
9. **Closed:** `is_open false` → portal add `closed`.
10. **Category:** set `categories ['VIP']`. Adding a member whose category is null → `not_member`.
11. After deleting the event, `tournament_squad_members` for the sport counts 0 (cascade).

- [ ] **Step 4: Run it**

Run: `npm run check:squads`
Expected: every line `PASS`, exit 0. If an insert fails on an activities column the script doesn't set, read `information_schema.columns` and add it to the insert. Never loosen the migration.

- [ ] **Step 5: Commit** `feat(tournaments): migration 0097 — tournament kind, sports, squads and their two functions (D637–D643)`, staging the migration, the script and `package.json`.

---

### Task 2: Pure squad rules

**Files:**
- Create: `src/features/tournaments/lib/squads.ts`, `src/features/tournaments/lib/sports.ts`
- Test: `tests/tournaments/squads.test.ts`, `tests/tournaments/sports.test.ts`

**Interfaces:**
- Produces (all exported from `lib/squads.ts` unless noted):
  ```ts
  export type TournamentSport = { id: string; activity_id: string; name: string; min_size: number; max_size: number; position: number };
  export type SquadRow = { sport_id: string; group_id: string; attendee_id: string; added_by: string | null; added_at: string };
  export type SquadPerson = { id: string; name: string; group_id: string | null; cancelled_at: string | null };
  export type SquadStateKey = "full" | "short" | "over" | "ready" | "forfeit";
  export type SquadRefusal = "full" | "locked" | "not_allowed" | "not_member" | "already" | "missing" | "closed";

  export function countedRows(rows: SquadRow[], people: Map<string, SquadPerson>): SquadRow[];
  export function squadMembers(rows: SquadRow[], sportId: string, groupId: string): string[];   // attendee ids, counted rows in, added_at order
  export function squadState(count: number, sport: Pick<TournamentSport, "min_size" | "max_size">, locked: boolean): { key: SquadStateKey; label: string };
  export function sizeLabel(count: number, sport: Pick<TournamentSport, "min_size" | "max_size">): string;
  export function isLocked(closeAt: string | null | undefined, now: Date): boolean;
  export function notInAnySport(memberIds: string[], rows: SquadRow[]): string[];             // counted rows in
  export function alsoIn(attendeeId: string, rows: SquadRow[], sports: TournamentSport[], exceptSportId: string): string[]; // sport names, sport order
  export function namesLine(names: string[], max?: number): string;                            // max default 10
  export function shortCount(sport: TournamentSport, groupIds: string[], rows: SquadRow[]): number; // groups below min
  export function refusalFlash(code: SquadRefusal, ctx: { sport: string; name?: string }): string;
  export type SquadExportRow = { sport: string; group: string; attendeeId: string | null; state: "" | "Short" | "Forfeit" };
  export function squadExportRows(input: { sports: TournamentSport[]; groups: { id: string; name: string }[]; rows: SquadRow[]; people: Map<string, SquadPerson>; locked: boolean }): SquadExportRow[];
  ```
  - `lib/sports.ts`: `export function readSport(form: { text(k: string): string; checked(k: string): boolean }): { name: string; min_size: number; max_size: number }`. It throws the organiser's sentence on bad input.

- [ ] **Step 1: Write the failing tests**

`tests/tournaments/squads.test.ts`, importing from `@/features/tournaments/lib/squads`:

```ts
const sport = (min: number, max: number) => ({ min_size: min, max_size: max });
it("labels sizes", () => {
  expect(sizeLabel(1, sport(2, 2))).toBe("1 of 2");
  expect(sizeLabel(2, sport(2, 2))).toBe("2 of 2 ✓");
  expect(sizeLabel(5, sport(5, 7))).toBe("5 of 5–7 ✓");
  expect(sizeLabel(3, sport(2, 2))).toBe("Over · 1 too many");
});
it("names states either side of the deadline (D646)", () => {
  expect(squadState(1, sport(2, 2), false)).toEqual({ key: "short", label: "1 short" });
  expect(squadState(2, sport(2, 2), false).key).toBe("full");
  expect(squadState(6, sport(5, 7), false).key).toBe("full");
  expect(squadState(3, sport(2, 2), false)).toEqual({ key: "over", label: "Over · 1 too many" });
  expect(squadState(0, sport(2, 2), true)).toEqual({ key: "forfeit", label: "Forfeit" });
  expect(squadState(2, sport(2, 2), true)).toEqual({ key: "ready", label: "Ready" });
});
it("locks at the deadline, not before", () => {
  const at = "2026-10-24T10:00:00.000Z";
  expect(isLocked(at, new Date("2026-10-24T09:59:59Z"))).toBe(false);
  expect(isLocked(at, new Date(at))).toBe(true);
  expect(isLocked(null, new Date())).toBe(false);
});
```

Also add tests for:
- `countedRows`: drops a cancelled person and a person whose `group_id` differs from the row's (D643).
- `notInAnySport(["a","b","c"], rows)`: `a` in one sport and `b` only on a stale row gives `["b","c"]` once rows are counted.
- `alsoIn`: returns the other sports in `position` order and leaves out `exceptSportId`.
- `namesLine` with 12 names gives the first 10 joined by `", "`, then `" … and 2 more"`. With 3 names: `"A, B and C"`.
- `shortCount`: counts only groups below min.
- `refusalFlash("full", { sport: "Badminton" })` → `"Badminton is full."`, and `refusalFlash("already", { sport: "Futsal", name: "Aina" })` → `"Aina is already in Futsal."`. The rest per the Global Constraints.
- `squadExportRows`: sport order, then group name, then person name. A group with 1 of 2 gives its one player row plus one row `{ attendeeId: null, state: "Short" }`, or `"Forfeit"` when `locked`. A full group has no blank row. Group order uses `localeCompare`.

`tests/tournaments/sports.test.ts`:
- `"Badminton"` + `size 2` → `{ name: "Badminton", min_size: 2, max_size: 2 }`.
- With `subs` ticked and `max 7`, `size 5` → min 5, max 7.
- Each throws with these exact sentences:
  - empty name → `"A sport needs a name"`
  - size 0 → `"Squad size must be at least 1"`
  - max below size → `"The most players can't be fewer than the squad size"`
  - size 31 → `"A squad can have at most 30 players"`

- [ ] **Step 2: Run** `npx vitest run tests/tournaments`. Expected: FAIL, modules missing.

- [ ] **Step 3: Implement both files.** Pure, with no imports outside `@/lib/types`. `squadState` takes the `short` label as `` `${min - count} short` ``, and the over label as `sizeLabel`'s.

- [ ] **Step 4: Run** `npx vitest run tests/tournaments`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(tournaments): pure squad rules — counted rows, states, labels, export rows (D643, D646, D649)`.

---

### Task 3: Server side — queries, rpc wrappers, portal context, entries

**Files:**
- Create: `src/features/tournaments/db/tournaments.ts`, `src/features/tournaments/context.ts`, `src/features/tournaments/index.ts`, `src/features/tournaments/client.ts`
- Modify: `eslint.config.*` only if the `no-restricted-imports` feature list is explicit, not a glob (check it)

**Interfaces:**
- Consumes: Task 2 types.
- Produces (`db/tournaments.ts`, `import "server-only"`, service client as `src/lib/db/groups.ts` does):
  ```ts
  listSports(activityId: string): Promise<TournamentSport[]>                       // position, then created_at
  listSportsForActivities(activityIds: string[]): Promise<TournamentSport[]>
  createSport(activityId: string, s: { name: string; min_size: number; max_size: number }): Promise<"ok" | "duplicate">  // position = max+1; 23505 → "duplicate"
  updateSport(activityId: string, sportId: string, s: { name: string; min_size: number; max_size: number }): Promise<"ok" | "duplicate">
  moveSport(activityId: string, sportId: string, dir: "up" | "down"): Promise<void> // swaps positions with the neighbour
  deleteSport(activityId: string, sportId: string): Promise<void>
  squadRows(activityId: string): Promise<SquadRow[]>                               // all rows of the activity's sports, uncounted; paged with selectAll
  squadPeople(eventId: string, ids: string[]): Promise<Map<string, SquadPerson>>   // includes cancelled
  addSquadMember(input: { sportId: string; attendeeId: string; actorId: string | null; admin: boolean }): Promise<"ok" | SquadRefusal>
  removeSquadMember(input: { sportId: string; attendeeId: string; actorId: string | null; admin: boolean }): Promise<"ok" | SquadRefusal>
  ```
- `context.ts`:
  ```ts
  export type SquadContext = { event: Event; activity: Activity; attendee: Attendee; members: Attendee[]; proxy: boolean };
  export async function portalSquadContext(slug: string, token: string, activityId: string): Promise<SquadContext | null>
  ```
  - Built like `portalContext` in `src/features/polaroid/context.ts`.
  - Returns null when: the attendee is cancelled or has no group; the activity isn't a tournament of this event; the category doesn't match; or the activity is closed.
  - `members` is `groupMembers(event.id, attendee.group_id)`, filtered by `categoryMatches(activity.categories, m.category)`.
  - `proxy` is computed the way `isProxy` does it, re-implemented locally with `isYes` and `fieldValue` from `@/lib/groups` and `@/lib/attendee-fields`, because `isProxy` lives in activities.
- `index.ts`: `export * from "./client"` plus the db, context, actions and screens from later tasks. `client.ts`: the pure lib.

- [ ] **Step 1:** Implement `db/tournaments.ts`. The rpc wrappers call `serviceClient().rpc("add_squad_member", { p_sport_id, p_attendee_id, p_actor_id, p_admin })` and return its text, throwing on `error`.
- [ ] **Step 2:** Implement `context.ts`, `client.ts` and `index.ts`.
- [ ] **Step 3: Run** `npx tsc --noEmit && npm run lint`. Expected: clean. Nothing calls these yet.
- [ ] **Step 4: Commit** `feat(tournaments): sports and squad queries, rpc wrappers, portal context`.

---

### Task 4: Wire `tournament` in as the fifth activity kind

Adding `"tournament"` to `ActivityKind` breaks the build at every exhaustive site (D414–D420); this task fills each one. Afterwards an admin can add a tournament, with Setup only (Task 5 adds Squads and Sports), and attendees in a group see its card.

**Files:**
- Modify:
  - `src/lib/types.ts`
  - in `src/features/activities/`: `kinds/meta.ts`, `kinds/settings.ts`, `tabs.ts`, `row.ts`, `cards.ts`, `lib/activity-card.ts`, `lib/portal-activity-entries.ts`, `db/activities.ts` (`NewActivity`), `admin/ActivityDetailPage.tsx`, `admin/actions.ts`, `portal/ActivityPage.tsx`
  - `src/features/catalogue/catalogue.ts`, `src/app/admin/events/[id]/activities/page.tsx`
- Create: `src/features/activities/kinds/tournament/settings.ts`, `TournamentDetail.tsx`, `TournamentBody.tsx` (a stub; Task 6 fills it)
- Test: `tests/activities/kinds.test.ts`, `row.test.ts`, `activity-card.test.ts`, `settings.test.ts`, `cards.test.ts`, `tests/catalogue/catalogue.test.ts`

**Interfaces:**
- Consumes: Task 3 `listSports`, `squadRows`, `squadPeople`, `listSportsForActivities`; Task 2 `countedRows`, `isLocked`, `shortCount`.
- Produces:
  - `ActivityKind` includes `"tournament"`. `Activity` gains `squads_close_at?: string | null` and `squad_fill?: "captains" | "self" | null`, and so does `NewActivity`.
  - `TournamentKindSettings = { name; description; categories; squads_close_at: string; squad_fill: "captains" | "self"; proxy_fields: string[] }`
  - `readTournamentKindSettings(form)`, `newTournament(settings, isOpen)`
  - `ActivityTab` gains `"squads" | "sports"`; `TabCounts` gains `shortSquads?: number`
  - `tournamentRow({ sports: number; groups: number; short: number; locked: boolean })`, and `RemoveFacts.tournament = { sports: number; players: number }`
  - `tournamentCard(input: { role: "picker" | "member"; ready: number; sports: number; playing: number; locked: boolean }): CardView`
  - `TournamentEntry = { activity: Activity; sports: TournamentSport[]; rows: SquadRow[] /* counted */; attendeeId: string; groupId: string; picker: boolean }` in `EntryMap`
  - `addTournamentActivityAction`, `saveTournamentActivityAction`, `deleteTournamentActivityAction`
  - `TournamentDetail({ ev, activity, tab })`, `TournamentBody({ entry, slug, token, attendee })`

- [ ] **Step 1: Update the tests first**
  - `kinds.test.ts`:
    - `ACTIVITY_KINDS` ends with `"tournament"`, and the labels end with `"Tournament"`.
    - `activityTabs("tournament", { shortSquads: 3 })` maps to tabs `["setup","squads","sports"]`, labels `["Setup","Squads","Sports"]`, and the Squads tab has `dot: true`. With `shortSquads: 0`, `dot` is false.
  - `catalogue.test.ts`: the engagement kinds gain `"tournament"`, and `featureForActivityKind("tournament")` is `"engagement"`.
  - `row.test.ts`:
    - `tournamentRow({ sports: 5, groups: 12, short: 3, locked: false })` → `{ kind: "Tournament", detail: "5 sports · 12 groups", progress: { done: 57, total: 60, label: "57 of 60 squads ready" }, attention: "3 squads short" }`
    - with `locked: true` → `attention: "3 squads forfeit"`
    - with `sports: 0` → `detail: null`, `attention: "No sports yet"`
    - `removeWarning({ kind: "tournament", sports: 5, players: 40 })` → `"Its 5 sports and 40 squad places go with it. This can't be undone."`
    - with 0 sports → `"This can't be undone."`
  - `activity-card.test.ts`:
    - `tournamentCard({ role: "picker", ready: 3, sports: 5, playing: 0, locked: false })` → `status { label: "3 of 5 sports ready", tone: "primary" }`, `action { label: "Pick squads", primary: true }`
    - `ready 5` → `{ label: "All squads ready ✓", tone: "success" }`
    - `role: "member", playing: 2` → `{ label: "You're playing 2 sports", tone: "success" }`, action `{ label: "View squads", primary: false }`
    - `playing 1` → `"You're playing 1 sport"`
    - `playing 0` → `{ label: "Not playing yet", tone: "muted" }`
    - `locked: true`, either role → `{ label: "Squads locked", tone: "muted" }`, action `View squads`
  - `settings.test.ts`:
    - `readSettings("tournament", fd({ name: "Sports Carnival", close_date: "2026-10-24", close_time: "18:00", squad_fill: "captains", proxy_fields: "captain" }))` is ok, with `squads_close_at: "2026-10-24T10:00:00.000Z"`, `squad_fill: "captains"` and `proxy_fields: ["captain"]`.
    - A missing date → `ok: false`, `error: "Set the squad deadline"`.
    - `squad_fill` missing → `"captains"`.
    - Empty description and categories match what the passport tests assert.
  - `cards.test.ts`: an entries fixture with one `tournament` entry gives one card in section `"open"` whose href ends in `/activities/<id>`.
- [ ] **Step 2: Run** `npx vitest run tests/activities tests/catalogue`. Expected: FAIL.
- [ ] **Step 3: Kind, meta, settings, catalogue**
  - `types.ts`: add the kind to the union and update its doc comment.
  - `meta.ts`: add the kind with `Trophy`, using the Global Constraints copy.
  - `catalogue.ts`:
    - engagement description `"Stamp passport, submissions, scored challenges, the polaroid wall and tournaments."`
    - engagement `activityKinds` gains `"tournament"`
    - `ACTIVITY_KIND_ORDER` gains `"tournament"`
  - `kinds/tournament/settings.ts`:
    - `squads_close_at` is `scheduleAt(form.text("close_date"), form.text("close_time"))`. Import `scheduleAt` from `../../lib/schedule`.
    - `proxy_fields` is read exactly as the submission reader reads it.
    - `newTournament` returns `{ ...settings, kind: "tournament", required: false, is_open: isOpen, max_per_attendee: null, questions: [], per_day: false }`.
  - Register it in `KIND_SETTINGS` and `SettingsFor`.
- [ ] **Step 4: Tabs, row, card, entries, finders**
  - `tabs.ts`: `tournament: (c) => [setup(), item("squads", "Squads", null, (c.shortSquads ?? 0) > 0), item("sports", "Sports")]`.
  - `row.ts`:
    - progress `done` = `sports × groups − short`, `total` = `sports × groups`
    - add the `removeWarning` case
  - `activity-card.ts`: `tournamentCard` exactly as the tests state.
  - `portal-activity-entries.ts`:
    - `const tournaments = attendee.group_id ? activities.filter((a) => a.kind === "tournament" && eligible(a, attendee.category)) : [];`
    - Read their sports, rows and people only when there are any. Count the rows with `countedRows`.
    - Return `tournament: tournaments.map(...)`.
    - Also filter `coming` so that a `tournament` is dropped when `attendee.group_id` is null.
  - `cards.ts`:
    - `cardsFor.tournament`: `role` is `"picker"` when the attendee holds a Yes in `activity.proxy_fields`. Use `isProxy` from `../lib/submissions`, then pass `.extra`; widen `loadActivityEntries`'s attendee `Pick` to include `extra` if needed.
    - `ready` = sports whose squad for the attendee's group is within min–max. `playing` = counted rows where `attendee_id` is the attendee's. `locked` = `isLocked(activity.squads_close_at, new Date())`. The section is `"open"` and `emphasis` is false (D647).
    - `cardsFor` gets only the list, so it reads `attendeeId`, `groupId` and `picker` off each `TournamentEntry`. The entries loader sets them.
    - `finders.tournament` follows the polaroid finder.
- [ ] **Step 5: Admin actions** (`admin/actions.ts`, following the polaroid trio)
  - `tournamentOf(ev, id)` mirrors `polaroidOf`, with the flash `"That tournament no longer exists."`.
  - `addTournamentActivityAction` redirects to `activityHref(eventId, id, "sports")` with `"Tournament added. Add its sports next."`.
  - `saveTournamentActivityAction` updates the details plus `squads_close_at`, `squad_fill` and `proxy_fields`. It never touches `is_open`. Flash: `"Tournament saved."`.
  - `deleteTournamentActivityAction` deletes the image too (cascade removes the sports and squads). Flash: `"Tournament deleted."`.
- [ ] **Step 6: `TournamentDetail`, Setup only**
  - Header: same as `PolaroidDetail`, with ScheduleOpen, OpenSwitch and ActivityMenu, and the subtitle `` `Squads lock ${opensLabel(close)}` `` (or `"No squad deadline"`).
  - Setup card:
    - Name, Description, Image, CategoryCombo
    - **Squad deadline**: two inputs `close_date` (`type="date"`) and `close_time` (`type="time"`), prefilled from `isoToLocalInput`
    - **Who fills squads**: radios `squad_fill`, either `Captains pick (members with a Yes in a ticked field)` or `Members join themselves`
    - a fieldset `Who picks squads` with the `proxy_fields` checkboxes. Copy the D392 fieldset markup from `ActivityRows.tsx`, and use the event's fields the way `SubmissionSetupFields` gets them.
    - When `squad_fill === "captains"` and `proxy_fields` is empty, show a warning line above the SaveBar: `"Nobody can pick squads yet. Tick at least one field, or let members join themselves."`
  - Tabs: `activityTabs("tournament", { shortSquads })`. Compute `shortSquads` from `listSports`, `squadRows`, `squadPeople`, `listGroups` and `shortCount`. Squads and Sports render `null` until Task 5.
  - Add the case to `ActivityDetailPage`.
- [ ] **Step 7: The list page**
  - Load the sports and rows for the tournaments on the page: `listSportsForActivities` plus one `squadRows` per tournament. There are few.
  - Add `tournament: { sports; short; players; locked }` facts and the `listItem` case, with `exportHref: \`${exports}/squads.xlsx?activity=${a.id}\``.
  - Add the add form: Name (default `"Sports Carnival"`), Squad deadline (both inputs), a `Who fills squads` radio, the `Who picks squads` ticks, CategoryCombo, the `Open now` checkbox (default checked), and `SubmitButton` `Add tournament`.
- [ ] **Step 8: Portal stub.** `TournamentBody` renders `<RichSections html={activity.description} />` for now. Add the `case "tournament"` to `ActivityPage`.
- [ ] **Step 9: Run** `npx tsc --noEmit && npm run lint && npm test`. Expected: PASS. tsc names any site missed; add the branch there with no `default` fall-through.
- [ ] **Step 10: Commit** `feat(activities): tournament as the fifth activity kind (D637, D640, D641, D647)`.

---

### Task 5: Admin — Sports and Squads tabs

**Files:**
- Create: `src/features/tournaments/admin/actions.ts`, `admin/SportsPanel.tsx`, `admin/SquadsPanel.tsx`, `admin/PlayerDialog.tsx`
- Modify: `src/features/activities/kinds/tournament/TournamentDetail.tsx`, `src/features/tournaments/index.ts`

**Interfaces:**
- Consumes: Tasks 2–3.
- Produces (every action is `(eventId, activityId, …, fd?)`, guarded by `requireEventAccess` and `requireFeature(ev.id, "engagement", …)`, and returns with `redirect(flashPath(activityHref(eventId, activityId, tab, extra), msg))`):
  - `addSportAction(eventId, activityId, fd)`
  - `saveSportAction(eventId, activityId, sportId, fd)`
  - `moveSportAction(eventId, activityId, sportId, dir)`
  - `deleteSportAction(eventId, activityId, sportId)`
  - `adminAddPlayerAction(eventId, activityId, sportId, fd /* attendee */)`
  - `adminRemovePlayerAction(eventId, activityId, sportId, attendeeId)`
  - `adminSwapPlayerAction(eventId, activityId, sportId, outId, fd /* attendee */)`
  - `SportsPanel({ ev, activity })`, `SquadsPanel({ ev, activity, sportId })`

- [ ] **Step 1: The sport actions**
  - They read with `readSport` and flash its thrown sentence as an error.
  - `"duplicate"` → `"There's already a sport called <name>."`
  - Flashes: `"Sport added."`, `"Sport saved."`, `"Sport deleted."`
  - `deleteSportAction` is called from a `DangerButton` whose message is `` `Delete ${name} and its ${n} squads?` ``, where n is the number of groups.
- [ ] **Step 2: The player actions**
  - They call `addSquadMember` / `removeSquadMember` with `admin: true, actorId: null`.
  - A refusal flashes `refusalFlash`. Admin only ever gets `not_member`, `already` or `missing`.
  - Swap is remove, then add. If the add is refused, re-add `outId` and flash the refusal.
  - Flashes: `"<Name> added to <Sport>."`, `"<Name> removed from <Sport>."`, `"Swapped <Out> for <In>."`
  - They land on `tab "squads"` with `{ sport: sportId }`.
- [ ] **Step 3: `SportsPanel`**
  - A table with Name, Squad size (`sizeLabel`'s range part: `2`, or `5–7`), and a ⋯ menu with Rename/resize (a dialog with the same form as Add), Move up, Move down and Delete.
  - Above it, an **Add sport** dialog with fields `name`, `size`, a checkbox `subs` "Allow subs", and `max` (shown when `subs` is ticked).
  - Empty state: `"No sports yet. Add the first one."`
  - Follow the admin style: capped, table-style list, ⋯ menu.
- [ ] **Step 4: `SquadsPanel` (D648)**
  - A strip of sport links, using `activityHref(..., "squads", { sport: id })`, each labelled `` `${name} · ${n} short` `` (or `forfeit` when locked), or just the name when n is 0. The selected sport defaults to the first.
  - Summary line: `` `${groups} groups · ${ready} ready · ${short} short` ``, with `forfeit` in place of `short` when locked.
  - A table, one row per group in `listGroups` order:
    - the group name
    - the player names (counted rows, in `added_at` order), joined `", "`, or `"—"`
    - a state pill (`squadState`): warning tone for short and forfeit, destructive for over, success for full and ready
    - a ⋯ menu: **Add player** (when not at or over max, though admins may still add), **Swap player**, **Remove player**
  - `PlayerDialog` holds a `<select name="attendee">` of that group's members, filtered to the tournament's categories and to people not already counted in this sport, each option `` `${name}${hints}` `` where hints is `" · also in Futsal, Basketball"` from `alsoIn`.
  - No sports: `"Add a sport first."`, linking to the Sports tab.
- [ ] **Step 5:** Render both panels in `TournamentDetail` for `current === "sports"` and `current === "squads"` (passing `searchParams.sport`). Thread `sport` through `ActivityDetailPage`'s `searchParams` as `show` is threaded.
- [ ] **Step 6: Run** `npx tsc --noEmit && npm run lint && npm test`. Expected: PASS.
- [ ] **Step 7: Browser check (ecpkom)**
  - `preview_start {name: "dev"}`.
  - Add a tournament "ZZ Sports test": deadline tomorrow 18:00, captains pick, Captain and Vice Captain ticked.
  - It lands on Sports. Add Pickleball 2, Badminton 2, Swimming 4, Futsal 5 and Basketball 3, then Futsal again (refused as a duplicate), then resize Futsal to 5 with subs up to 7. Move Swimming up.
  - On Squads → Badminton, add two Team 1 members and swap one. The "also in" hint shows after adding the same person to Futsal.
  - Resize Badminton to 1. Team 1 shows `Over · 1 too many`. Resize it back.
  - Screenshot both tabs.
- [ ] **Step 8: Commit** `feat(tournaments): admin Sports and Squads tabs (D638, D648)`.

---

### Task 6: Portal — the squads page

**Files:**
- Create: `src/features/tournaments/actions.ts`, `components/SquadsPage.tsx`, `components/MemberPicker.tsx` (`"use client"`)
- Modify: `src/features/activities/kinds/tournament/TournamentBody.tsx`, `src/features/tournaments/index.ts`, `client.ts`

**Interfaces:**
- Consumes: Task 3 `portalSquadContext`, `addSquadMember`, `removeSquadMember`; Task 4 `TournamentEntry`.
- Produces:
  - `pickSquadMemberAction(slug, token, activityId, sportId, attendeeId)` and `removeSquadMemberAction(slug, token, activityId, sportId, attendeeId)`. Join and leave are the same two actions with `attendeeId = self`.
  - Each loads `portalSquadContext`; null → flash `closed`. It calls the rpc with `admin: false, actorId: ctx.attendee.id`, then redirects to the activity page with `refusalFlash` or a success flash:
    - `"<Name> added to <Sport>."`, `"<Name> removed from <Sport>."`
    - when it's yourself: `"You're in <Sport>."`, `"You've left <Sport>."`
  - `SquadsPage(props: { activity; groupName: string; sports; rows; members: { id; name }[]; selfId; picker: boolean; selfMode: boolean; locked: boolean; deadline: string /* opensLabel text */; captainName: string | null; actions: {...bound} })`

- [ ] **Step 1: `TournamentBody`** is server-side: it loads the group's members and the context, then renders `SquadsPage`.
  - `captainName` is the first member, in `taggedFirst` order, holding a Yes in the first ticked field.
  - `deadline` is `opensLabel(activity.squads_close_at)`.
- [ ] **Step 2: `SquadsPage`** (D644, D645), in this order:
  1. `RichSections` description, then the group's name as a small heading (`groupName` prop, from `getGroup`).
  2. Top line:
     - `picker` and not locked: `` `You pick your group's squads. They lock ${deadline}.` ``
     - member under `captains`: `` `Your captain ${captainName} picks the squads. They lock ${deadline}.` `` (no name: `"Your group's captain picks the squads."`, plus the lock sentence)
     - member under `self`: `` `Join the sports you want to play. Squads lock ${deadline}.` ``
     - locked: `"Squads are locked. Ask the organisers for changes."`
  3. A green panel: `"You're playing Futsal and Basketball."`, using `namesLine` on the sport names; or `"You're not in any sport yet."`.
  4. Picker only, while not locked: an amber notice `` `${n} member${n===1?"":"s"} aren't in any sport yet: ${namesLine(names)}.` `` when `notInAnySport` is non-empty. Use "isn't" when n is 1.
  5. One card per sport, in position order:
     - the name and `sizeLabel`
     - the names, with the attendee's own shown as **You**
     - for a picker, not locked: ✕ beside each name (a form button), and a **Pick a member** button opening `MemberPicker` when `count < max`
     - in self mode, a non-picker who isn't locked: **Join** when not in it and `count < max`, **Leave** when in it
- [ ] **Step 3: `MemberPicker`** is a client dialog with a search input that filters names case-insensitively.
  - Each row is a form posting `pickSquadMemberAction`, labelled with the name plus the `alsoIn` hint (`"also in Futsal, Basketball"`, muted).
  - Members already in this sport are greyed out and not buttons, with `"already in this squad"`.
  - The hint data is computed on the server and passed as props: `{ id, name, alsoIn: string[], inThis: boolean }[]`.
- [ ] **Step 4: Run** `npx tsc --noEmit && npm run lint && npm test`. Expected: PASS.
- [ ] **Step 5: Browser check (ecpkom)**, on the tournament from Task 5. Get tokens with `execute_sql` for Adrian (Captain), Tan Wei Jie (Vice) and one ordinary Team 1 member.
  - **Captain:**
    - the card reads `"0 of 5 sports ready"`, or the right count
    - the page shows the notice listing members not in any sport
    - pick two for Pickleball → `2 of 2 ✓`, and Pick a member is gone
    - the picker shows the "also in" hints
    - remove one
  - **Member:** read-only, the "Your captain Adrian … picks" line, and **You** in their squad.
  - **Self mode:** switch the tournament to Members join themselves. The member gets Join and Leave and the line `"Join the sports…"`.
  - **Lock:** set `squads_close_at` to a minute ago with `execute_sql`. The captain gets no ✕ and no picker, the locked line, and the card says `Squads locked`. A stale open page's ✕ is refused with the `locked` flash. Admin Squads shows Forfeit and Ready.
  - **No group:** an attendee with `group_id null` sees no card, and the page URL 404s.
  - Screenshot the captain's and the member's views at phone width (375).
- [ ] **Step 6: Commit** `feat(tournaments): portal squads page — captain picks, members join, lock (D644, D645)`.

---

### Task 7: Export squads

**Files:**
- Create: `src/app/admin/events/[id]/export/squads.xlsx/route.ts`
- Modify: `src/lib/exports.ts` (add `buildSquadsWorkbook`), `TournamentDetail.tsx` (header **Export squads** button)
- Test: `tests/exports/squads.test.ts`, or the folder the other workbook tests use. Find it with `grep -rl buildRosterWorkbook tests`.

**Interfaces:**
- Consumes: Task 2 `squadExportRows`; Task 3 `listSports`, `squadRows`, `squadPeople`.
- Produces: `buildSquadsWorkbook(rows: SquadExportRow[], people: Map<string, { name: string; email: string | null; extra: Record<string, unknown> }>, columns: ExportColumn[]): ExcelJS.Workbook`. Its one sheet, `Squads`, has the header `Sport, Group, Name, …columns' labels, State`.

- [ ] **Step 1: Test**
  - Two rows, one player and one blank `Short`, give sheet rows `["Badminton","Group 01","Aina", <Master No>, ""]` and `["Badminton","Group 02","", "", "Short"]`.
  - The header is as stated.
  - Read the values back with `getRow(n).values` as the existing workbook tests do.
- [ ] **Step 2: Run it.** Expected: FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: The route**
  - `GET ?activity=<id>`: `requireEventAccess`. Then 404 unless the activity is a `tournament` of this event.
  - Load the sports, rows and groups, plus `listAttendees(ev.id, undefined, "wide", { includeCancelled: true })` for the people.
  - Columns: `exportColumns(eventFields(ev.registration_questions, ev.attendee_fields), ev.export_fields)`.
  - `locked` = `isLocked(activity.squads_close_at, new Date())`.
  - Filename: `` `${ev.slug}-${slugify(activity.name)}-squads.xlsx` ``, where `slugify` lowercases and turns runs of non-alphanumerics into `-`. Use an existing slug helper in `src/lib` if there is one.
- [ ] **Step 6:** Add the header button (an outline `Link`, Download icon, `"Export squads"`), and check that the list menu's Export (Task 4) hits the same URL.
- [ ] **Step 7: Run** the checks, then download from ecpkom. Expected: one sheet with sport order, group order, Master No (when chosen in ecpkom's export fields), and blank Short or Forfeit rows.
- [ ] **Step 8: Commit** `feat(tournaments): export squads (D649)`.

---

### Task 8: Final checks and tidy

- [ ] **Step 1: Run** `npm run build && npm run check:squads`. Expected: build OK, all checks PASS.
- [ ] **Step 2: End-to-end on ecpkom**, with all three views open: an admin removes a player while the captain's page is open, and the captain's next load shows the gap. A cancelled member, set by `execute_sql` on a ZZ test attendee only, drops out of the squad and the notice.
- [ ] **Step 3: Clean up:**
  - Delete the "ZZ Sports test" tournament from ecpkom. Its delete warning names its sports and places.
  - Reset any `extra` or `cancelled_at` you changed.
  - Leave ecphub untouched.
- [ ] **Step 4: Commit** any fixes found in Steps 1–2 as their own `fix(tournaments): …` commits.
