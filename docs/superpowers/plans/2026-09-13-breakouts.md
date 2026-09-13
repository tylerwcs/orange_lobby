# Breakout Room Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assign attendees to breakout rooms and show each attendee only their own rooms, on their agenda and on a card of their own.

**Architecture:** A breakout is an ordinary `agenda_items` row carrying two new nullable columns — `slot` (the round, e.g. "Breakout 1") and `code` (the room, e.g. "3A"). A `breakout_assignments` join table binds an attendee to one such item per slot, enforced by `unique (attendee_id, slot)`. All derivation is pure functions in `src/lib/breakouts.ts` over rows the database already returns; `visibleTo()` grows from "filter by a category string" to "filter by a viewer", applying the category rule and an assignment rule that must both pass.

**Tech Stack:** Next.js 16.3.4 (App Router, server components, server actions), React 19.2.8, Tailwind CSS v4, TypeScript 5, Vitest 5 (node environment, `tests/**/*.test.ts`, `@` aliased to `src`), Supabase (`serviceClient()`, no RLS), ExcelJS.

**Spec:** `docs/superpowers/specs/2026-09-13-breakout-sessions-design.md`

## Global Constraints

- **Do not start until `feat/custom-tiles` and `feat/pinned-fields` are verified by the user and merged** (spec §5). Branch from `main` after that merge.
- **Migration 0007 is applied at merge, not during implementation.** Production has live registration. Until then, code must build and tests must pass without the columns existing.
- An agenda item with a **null `slot` behaves exactly as it does today**. Nothing currently live may change behaviour.
- `visibleTo()` failing closed (showing too little) is acceptable; failing open (showing another group's room) is not.
- `AgendaItem` carries `starts_at`/`ends_at` as `"HH:MM"` strings and `day` as `"YYYY-MM-DD"`. `Attendee.extra` is `Record<string, string>`, never null after `hydrate`.
- `createAgendaItem` takes `Omit<AgendaItem, "id" | "event_id">`, so every new `AgendaItem` field must be supplied by the admin form.
- Pure libraries under `src/lib/*.ts` are unit-tested. `src/lib/db/*.ts` is `server-only` and has no unit tests — it is verified by `tsc`, the build, and the user's click-through.
- Admin pages are login-gated; Claude cannot verify them in a browser. Portal pages can be driven in the browser pane.
- Touch targets stay >= 44px. Numbers use `tabular-nums`. No dark mode.
- Run `npm run lint` and `npm test` before every commit.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

### Task 1: Schema and types

**Files:**
- Create: `supabase/migrations/0007_breakouts.sql`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `AgendaItem.slot: string | null`, `AgendaItem.code: string | null`, and `BreakoutAssignment = { id: string; event_id: string; agenda_item_id: string; attendee_id: string; slot: string }`.

No unit test: DDL has no behaviour to assert from node, and the migration is not applied during implementation. Verified by `tsc`, the build, and reading the SQL.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0007_breakouts.sql`:

```sql
-- Breakout rooms: which attendee goes to which room, in which round.
--
-- A breakout is an ordinary agenda item (D76) — it already has a day, a time, a room and a
-- title. `slot` names the round ("Breakout 1") and groups the items that are alternatives to
-- one another; `code` is this room's value ("3A"), and is what the client's spreadsheet
-- column holds. An item with a null slot is an ordinary agenda item and behaves as before.
alter table agenda_items add column slot text;
alter table agenda_items add column code text;

-- Assignment is a real relation rather than a match against the imported spreadsheet value,
-- so a typo in the client's sheet ("3a ", "Room 3B") cannot read as "unassigned" with
-- nothing to catch it (D79).
--
-- `slot` is denormalised onto this row for one reason: `unique (attendee_id, slot)` is what
-- stops one person holding two rooms in the same round, and a unique index cannot reach
-- through agenda_item_id to the slot on the item (D80). Renaming an item's slot must update
-- its assignment rows.
create table breakout_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  agenda_item_id uuid not null references agenda_items(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,
  slot text not null,
  created_at timestamptz not null default now(),
  unique (attendee_id, slot)
);

create index breakout_assignments_item_idx on breakout_assignments (agenda_item_id);
create index breakout_assignments_event_idx on breakout_assignments (event_id);
```

- [ ] **Step 2: Add the types**

In `src/lib/types.ts`, add two fields to `AgendaItem` immediately after `categories`:

```ts
  /** The breakout round this item belongs to, e.g. "Breakout 1". Null on an ordinary item. */
  slot: string | null;
  /** This room's value within the slot, e.g. "3A". What the client's spreadsheet column holds. */
  code: string | null;
```

And after the `AgendaItem` type:

```ts
export type BreakoutAssignment = {
  id: string;
  event_id: string;
  agenda_item_id: string;
  attendee_id: string;
  /** Copied from the agenda item so `unique (attendee_id, slot)` can enforce one room per round. */
  slot: string;
};
```

- [ ] **Step 3: Verify it compiles and the suite still passes**

Run: `npx tsc --noEmit && npm test`
Expected: `tsc` reports errors only where an `AgendaItem` literal is built without the new fields (test helpers). Fix each by adding `slot: null, code: null`. Then both clean.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0007_breakouts.sql src/lib/types.ts tests
git commit -m "feat(breakouts): a room is an agenda item someone is assigned to

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Slot derivation

**Files:**
- Create: `src/lib/breakouts.ts`
- Test: `tests/breakouts.test.ts`

**Interfaces:**
- Consumes: `AgendaItem` from Task 1.
- Produces: `isBreakout(item: AgendaItem): boolean`, `BreakoutSlot = { slot: string; items: AgendaItem[] }`, `breakoutSlots(items: AgendaItem[]): BreakoutSlot[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/breakouts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isBreakout, breakoutSlots } from "@/lib/breakouts";
import type { AgendaItem } from "@/lib/types";

const item = (over: Partial<AgendaItem>): AgendaItem => ({
  id: "i1", event_id: "e", day: "2026-09-30", starts_at: "13:30", ends_at: "15:00",
  title: "Breakout", description: null, location: null, categories: null,
  slot: null, code: null, sort_order: 0, ...over,
});

describe("isBreakout", () => {
  it("is a breakout when it carries a slot", () => {
    expect(isBreakout(item({ slot: "Breakout 1", code: "3A" }))).toBe(true);
  });

  it("is not a breakout without one, however it is titled", () => {
    // An ordinary agenda item must behave exactly as it did before this feature.
    expect(isBreakout(item({ title: "Breakout: regional teams" }))).toBe(false);
  });

  it("is not a breakout when the slot is blank", () => {
    expect(isBreakout(item({ slot: "   " }))).toBe(false);
  });
});

describe("breakoutSlots", () => {
  it("groups alternatives under one slot, in agenda order", () => {
    const slots = breakoutSlots([
      item({ id: "a", slot: "Breakout 1", code: "3A", starts_at: "13:30" }),
      item({ id: "x", title: "Lunch", starts_at: "12:15" }),
      item({ id: "b", slot: "Breakout 1", code: "3B", starts_at: "13:30" }),
      item({ id: "c", slot: "Breakout 2", code: "5A", starts_at: "15:30" }),
    ]);
    expect(slots.map((s) => s.slot)).toEqual(["Breakout 1", "Breakout 2"]);
    expect(slots[0].items.map((i) => i.code)).toEqual(["3A", "3B"]);
  });

  it("returns nothing for an event that runs no breakouts", () => {
    expect(breakoutSlots([item({ title: "Lunch" })])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/breakouts.test.ts`
Expected: FAIL — `Cannot find package '@/lib/breakouts'`. That is an error, not a failure: create `src/lib/breakouts.ts` exporting `export function isBreakout() { return false; }` and `export function breakoutSlots() { return []; }`, re-run, and confirm you now get four assertion failures before implementing.

- [ ] **Step 3: Write minimal implementation**

Replace `src/lib/breakouts.ts` with:

```ts
import type { AgendaItem } from "@/lib/types";

/**
 * Whether this agenda item is one room of a breakout round.
 *
 * The `slot` is what makes it one — not the title. An item called "Breakout: regional teams"
 * with no slot is the single all-hands row this feature replaces, and it keeps behaving
 * exactly as it does today.
 */
export function isBreakout(item: AgendaItem): boolean {
  return typeof item.slot === "string" && item.slot.trim() !== "";
}

export type BreakoutSlot = { slot: string; items: AgendaItem[] };

/**
 * The breakout rounds this event runs, each holding the rooms that are alternatives to one
 * another, in the order the agenda presents them.
 */
export function breakoutSlots(items: AgendaItem[]): BreakoutSlot[] {
  const sorted = [...items].sort((a, b) =>
    a.day.localeCompare(b.day) || a.starts_at.localeCompare(b.starts_at) || a.sort_order - b.sort_order);
  const out: BreakoutSlot[] = [];
  const byName = new Map<string, BreakoutSlot>();
  for (const i of sorted) {
    if (!isBreakout(i)) continue;
    const name = (i.slot as string).trim();
    let slot = byName.get(name);
    if (!slot) { slot = { slot: name, items: [] }; byName.set(name, slot); out.push(slot); }
    slot.items.push(i);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/breakouts.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/breakouts.ts tests/breakouts.test.ts
git commit -m "feat(breakouts): a slot is the rooms that are alternatives to each other

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: visibleTo filters on assignment too

**Files:**
- Modify: `src/lib/agenda.ts:1-6`
- Modify: `src/lib/portal-home.ts:20-40`
- Modify: `src/app/e/[slug]/a/[token]/agenda/page.tsx`
- Modify: `src/app/e/[slug]/agenda/page.tsx`
- Test: `tests/agenda.test.ts`

**Interfaces:**
- Consumes: `isBreakout` from Task 2.
- Produces: `AgendaViewer = { category: string | null; assignedItemIds: ReadonlySet<string> } | null` and `visibleTo(items: AgendaItem[], viewer: AgendaViewer): AgendaItem[]`, both from `src/lib/agenda.ts`. `loadHomeData` gains a fifth parameter `assignedItemIds: ReadonlySet<string> = new Set()`.

- [ ] **Step 1: Write the failing test**

Append to `tests/agenda.test.ts`. Its local `item` helper needs `slot: null, code: null` added (done in Task 1).

```ts
describe("visibleTo with breakouts", () => {
  const lunch = item({ id: "lunch", title: "Lunch" });
  const a = item({ id: "a", slot: "Breakout 1", code: "3A" });
  const b = item({ id: "b", slot: "Breakout 1", code: "3B" });
  const mgmtRoom = item({ id: "m", slot: "Breakout 1", code: "5A", categories: ["Management"] });

  it("shows the room this attendee is assigned to and hides the others", () => {
    const seen = visibleTo([lunch, a, b], { category: null, assignedItemIds: new Set(["a"]) });
    expect(seen.map((i) => i.id)).toEqual(["lunch", "a"]);
  });

  it("hides every room from an attendee assigned to none", () => {
    // Fails closed: showing nothing is recoverable, showing someone else's room is not.
    const seen = visibleTo([lunch, a, b], { category: null, assignedItemIds: new Set() });
    expect(seen.map((i) => i.id)).toEqual(["lunch"]);
  });

  it("hides every room from the anonymous portal", () => {
    expect(visibleTo([lunch, a, b], null).map((i) => i.id)).toEqual(["lunch"]);
  });

  it("requires BOTH filters to pass when an item carries a slot and a category", () => {
    expect(visibleTo([mgmtRoom], { category: "Staff", assignedItemIds: new Set(["m"]) })).toEqual([]);
    expect(visibleTo([mgmtRoom], { category: "Management", assignedItemIds: new Set(["m"]) }).map((i) => i.id)).toEqual(["m"]);
  });

  it("leaves an ordinary categorised item behaving exactly as before", () => {
    const vipOnly = item({ id: "v", categories: ["VIP"] });
    expect(visibleTo([vipOnly], { category: "VIP", assignedItemIds: new Set() }).map((i) => i.id)).toEqual(["v"]);
    expect(visibleTo([vipOnly], { category: "Staff", assignedItemIds: new Set() })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/agenda.test.ts`
Expected: FAIL — `visibleTo` receives an object where it expects a string, so `category?.trim` is undefined on an object and the assigned-room assertions do not hold.

- [ ] **Step 3: Write minimal implementation**

Replace the top of `src/lib/agenda.ts` (the import line and `visibleTo`):

```ts
import type { AgendaItem } from "@/lib/types";
import { isBreakout } from "@/lib/breakouts";

/** Who is looking. `null` is the anonymous portal — nobody signed in, so no assignments. */
export type AgendaViewer = { category: string | null; assignedItemIds: ReadonlySet<string> } | null;

/**
 * The items this viewer may see, under two independent filters that must BOTH pass.
 *
 * The category rule is unchanged: an item with no categories is for everyone. The assignment
 * rule applies only to items carrying a slot — a breakout room is visible only to someone
 * assigned to it — so an item with no slot behaves exactly as it did before breakouts existed.
 *
 * Both rules fail closed. An unassigned attendee sees no room rather than everyone's rooms;
 * the placeholder that tells them so is built by `myBreakouts`, not here, because this
 * function's job is to remove things.
 */
export function visibleTo(items: AgendaItem[], viewer: AgendaViewer): AgendaItem[] {
  const c = viewer?.category?.trim().toLowerCase() ?? null;
  const assigned = viewer?.assignedItemIds ?? new Set<string>();
  return items.filter((i) => {
    const categoryOk = !i.categories || i.categories.length === 0
      || (c !== null && i.categories.some((x) => x.trim().toLowerCase() === c));
    const assignmentOk = !isBreakout(i) || assigned.has(i.id);
    return categoryOk && assignmentOk;
  });
}
```

- [ ] **Step 4: Update the call sites**

In `src/lib/portal-home.ts`, add the parameter to `loadHomeData`:

```ts
  assignedItemIds: ReadonlySet<string> = new Set(),
```

as the last parameter, and replace the filter line:

```ts
  const agenda = visibleTo(allAgenda, attendee ? { category: attendee.category, assignedItemIds } : null);
```

In `src/app/e/[slug]/agenda/page.tsx` (anonymous), replace the call with `visibleTo(items, null)`.

In `src/app/e/[slug]/a/[token]/agenda/page.tsx` (personal), replace it with:

```ts
  const assignedItemIds = new Set<string>(); // filled in Task 5
  const visible = visibleTo(items, { category: attendee.category, assignedItemIds });
```

- [ ] **Step 5: Run the suite and typecheck**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: all clean. Every `visibleTo` call site now passes a viewer or `null`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agenda.ts src/lib/portal-home.ts src/app/e tests/agenda.test.ts
git commit -m "feat(breakouts): the agenda filter learns who you are, not just your category

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: An attendee's own rounds, with placeholders

**Files:**
- Modify: `src/lib/breakouts.ts`
- Test: `tests/breakouts.test.ts`

**Interfaces:**
- Consumes: `breakoutSlots` from Task 2.
- Produces: `MyBreakout = { slot: string; item: AgendaItem | null; day: string; starts_at: string; ends_at: string | null }` and `myBreakouts(items: AgendaItem[], assignedItemIds: ReadonlySet<string>): MyBreakout[]`.

- [ ] **Step 1: Write the failing test**

Append to `tests/breakouts.test.ts` (and add `myBreakouts` to its import line):

```ts
describe("myBreakouts", () => {
  const a = item({ id: "a", slot: "Breakout 1", code: "3A", starts_at: "13:30", ends_at: "15:00" });
  const b = item({ id: "b", slot: "Breakout 1", code: "3B", starts_at: "13:30", ends_at: "15:00" });
  const c = item({ id: "c", slot: "Breakout 2", code: "5A", starts_at: "15:30", ends_at: "17:00" });

  it("gives one row per round, carrying the room this attendee has", () => {
    const mine = myBreakouts([a, b, c], new Set(["b", "c"]));
    expect(mine.map((m) => [m.slot, m.item?.code])).toEqual([["Breakout 1", "3B"], ["Breakout 2", "5A"]]);
  });

  it("keeps a row with no item when the attendee is not assigned", () => {
    // A silently missing ninety-minute block is worse than an honest "not assigned yet".
    const mine = myBreakouts([a, b, c], new Set(["c"]));
    expect(mine[0]).toMatchObject({ slot: "Breakout 1", item: null, starts_at: "13:30", ends_at: "15:00" });
  });

  it("takes the placeholder's time from the round's rooms, which share it", () => {
    expect(myBreakouts([a, b], new Set())[0]).toMatchObject({ day: "2026-09-30", starts_at: "13:30", ends_at: "15:00" });
  });

  it("is empty for an event that runs no breakouts", () => {
    expect(myBreakouts([item({ title: "Lunch" })], new Set())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/breakouts.test.ts`
Expected: FAIL — `myBreakouts is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/breakouts.ts`:

```ts
/**
 * One row per breakout round for one attendee: the room they have, or null when they have none.
 *
 * The null row is the point. `visibleTo` removed every room this attendee is not in, so
 * without this an unassigned attendee's afternoon is a silent ninety-minute hole. The
 * placeholder's time comes from the round's own rooms, which share a time by definition —
 * they are alternatives to one another.
 */
export type MyBreakout = { slot: string; item: AgendaItem | null; day: string; starts_at: string; ends_at: string | null };

export function myBreakouts(items: AgendaItem[], assignedItemIds: ReadonlySet<string>): MyBreakout[] {
  return breakoutSlots(items).map((s) => {
    const first = s.items[0];
    return {
      slot: s.slot,
      item: s.items.find((i) => assignedItemIds.has(i.id)) ?? null,
      day: first.day,
      starts_at: first.starts_at,
      ends_at: first.ends_at,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/breakouts.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/breakouts.ts tests/breakouts.test.ts
git commit -m "feat(breakouts): an unassigned round still says it exists

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Database layer

**Files:**
- Create: `src/lib/db/breakouts.ts`
- Modify: `src/lib/db/agenda.ts`

**Interfaces:**
- Consumes: `BreakoutAssignment` from Task 1.
- Produces, all from `src/lib/db/breakouts.ts`:
  - `listAssignments(eventId: string): Promise<BreakoutAssignment[]>`
  - `assignedItemIdsFor(attendeeId: string): Promise<Set<string>>`
  - `assignMany(eventId: string, rows: { attendeeId: string; itemId: string; slot: string }[], overwrite: boolean): Promise<number>`
  - `unassign(eventId: string, attendeeId: string, slot: string): Promise<void>`
  - `renameSlotAssignments(itemId: string, slot: string): Promise<void>`

No unit tests: `server-only`, needs a live database. Verified by `tsc`, the build, and the click-through in Task 11.

- [ ] **Step 1: Write the module**

Create `src/lib/db/breakouts.ts`:

```ts
import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { BreakoutAssignment } from "@/lib/types";

export async function listAssignments(eventId: string): Promise<BreakoutAssignment[]> {
  const { data, error } = await serviceClient()
    .from("breakout_assignments").select("*").eq("event_id", eventId);
  if (error) throw error;
  return (data ?? []) as BreakoutAssignment[];
}

/** The breakout items one attendee is in. The portal's hot path — one query, one column. */
export async function assignedItemIdsFor(attendeeId: string): Promise<Set<string>> {
  const { data, error } = await serviceClient()
    .from("breakout_assignments").select("agenda_item_id").eq("attendee_id", attendeeId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => (r as { agenda_item_id: string }).agenda_item_id));
}

/**
 * Writes assignments, one round at a time.
 *
 * `unique (attendee_id, slot)` means a second room for the same round is a conflict, not a
 * duplicate row — so this upserts on that pair when overwriting, and skips people who
 * already have a room when not. Skipping is the default because re-running "Assign from
 * column" on the morning of day 2 must not undo the desk's moves at breakfast (D83).
 */
export async function assignMany(
  eventId: string,
  rows: { attendeeId: string; itemId: string; slot: string }[],
  overwrite: boolean,
): Promise<number> {
  if (rows.length === 0) return 0;
  const payload = rows.map((r) => ({ event_id: eventId, agenda_item_id: r.itemId, attendee_id: r.attendeeId, slot: r.slot }));
  const q = serviceClient().from("breakout_assignments");
  const { error, count } = overwrite
    ? await q.upsert(payload, { onConflict: "attendee_id,slot", count: "exact" })
    : await q.upsert(payload, { onConflict: "attendee_id,slot", ignoreDuplicates: true, count: "exact" });
  if (error) throw error;
  return count ?? 0;
}

export async function unassign(eventId: string, attendeeId: string, slot: string): Promise<void> {
  const { error } = await serviceClient()
    .from("breakout_assignments").delete().eq("event_id", eventId).eq("attendee_id", attendeeId).eq("slot", slot);
  if (error) throw error;
}

/**
 * Keeps the denormalised slot in step when an agenda item's slot is renamed.
 *
 * This is the one line D80 warns about: the copy on the assignment row is what the unique
 * index reads, so an item renamed without this leaves its people enforcing the old round.
 */
export async function renameSlotAssignments(itemId: string, slot: string): Promise<void> {
  const { error } = await serviceClient()
    .from("breakout_assignments").update({ slot }).eq("agenda_item_id", itemId);
  if (error) throw error;
}
```

- [ ] **Step 2: Wire the personal agenda and home to real assignments**

In `src/app/e/[slug]/a/[token]/agenda/page.tsx`, replace the placeholder from Task 3:

```ts
const assignedItemIds = await assignedItemIdsFor(attendee.id);
```

In `src/app/e/[slug]/a/[token]/page.tsx`, load them and pass them through:

```ts
const assignedItemIds = await assignedItemIdsFor(attendee.id);
const home = await loadHomeData(event, attendee, basePath, day, assignedItemIds);
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm test && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/breakouts.ts src/app/e
git commit -m "feat(breakouts): the portal reads the rooms you were put in

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Matching the spreadsheet column to rooms

**Files:**
- Modify: `src/lib/breakouts.ts`
- Test: `tests/breakouts.test.ts`

**Interfaces:**
- Consumes: `BreakoutSlot` from Task 2.
- Produces: `AssignMatch = { attendeeId: string; itemId: string; slot: string }`, `AssignReport = { matched: AssignMatch[]; unmatched: { value: string; count: number }[]; blank: number }`, and `matchAssignments(attendees: Pick<Attendee, "id" | "extra">[], slot: BreakoutSlot): AssignReport`.

- [ ] **Step 1: Write the failing test**

Append to `tests/breakouts.test.ts` (add `matchAssignments` to the import, and `import type { Attendee } from "@/lib/types";`):

```ts
describe("matchAssignments", () => {
  const slot = { slot: "Breakout 1", items: [
    item({ id: "a", slot: "Breakout 1", code: "3A" }),
    item({ id: "b", slot: "Breakout 1", code: "3B" }),
  ] };
  const who = (id: string, value?: string): Pick<Attendee, "id" | "extra"> =>
    ({ id, extra: value === undefined ? {} : { "Breakout 1": value } });

  it("matches a cell value to the room with that code", () => {
    const r = matchAssignments([who("p1", "3A"), who("p2", "3B")], slot);
    expect(r.matched).toEqual([
      { attendeeId: "p1", itemId: "a", slot: "Breakout 1" },
      { attendeeId: "p2", itemId: "b", slot: "Breakout 1" },
    ]);
  });

  it("forgives the spreadsheet's casing and padding", () => {
    expect(matchAssignments([who("p1", " 3a ")], slot).matched[0].itemId).toBe("a");
  });

  it("reports a value that matches no room, with how many people wrote it", () => {
    // This report is the typo detector the join table exists to make possible (D79/D83).
    const r = matchAssignments([who("p1", "Room 3B"), who("p2", "Room 3B"), who("p3", "9Z")], slot);
    expect(r.matched).toEqual([]);
    expect(r.unmatched).toEqual([{ value: "Room 3B", count: 2 }, { value: "9Z", count: 1 }]);
  });

  it("counts people whose cell is empty separately from people who typed something wrong", () => {
    const r = matchAssignments([who("p1"), who("p2", "  "), who("p3", "3A")], slot);
    expect(r.blank).toBe(2);
    expect(r.unmatched).toEqual([]);
    expect(r.matched).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/breakouts.test.ts`
Expected: FAIL — `matchAssignments is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/breakouts.ts` (add `Attendee` to the type import):

```ts
export type AssignMatch = { attendeeId: string; itemId: string; slot: string };
export type AssignReport = { matched: AssignMatch[]; unmatched: { value: string; count: number }[]; blank: number };

/**
 * Reads one round's assignments out of the column the client's spreadsheet already imported.
 *
 * The slot's name doubles as the spreadsheet's column header, which is what lets this work
 * with no mapping UI: the organiser types "Breakout 1" on four agenda items, the client's
 * column is headed "Breakout 1", and the values line up against each item's `code`.
 *
 * Comparison is trimmed and case-folded, because a spreadsheet is typed by hand. Anything
 * that still matches nothing is reported rather than dropped — that report is the only thing
 * standing between a typo and an attendee who silently has no room (D83). Blank cells are
 * counted apart from wrong ones: they are people nobody has placed yet, not mistakes.
 */
export function matchAssignments(attendees: Pick<Attendee, "id" | "extra">[], slot: BreakoutSlot): AssignReport {
  const norm = (s: string) => s.trim().toLowerCase();
  const byCode = new Map<string, string>();
  for (const i of slot.items) {
    if (i.code && i.code.trim()) byCode.set(norm(i.code), i.id);
  }
  const matched: AssignMatch[] = [];
  const misses = new Map<string, number>();
  let blank = 0;
  for (const a of attendees) {
    const raw = (a.extra?.[slot.slot] ?? "").trim();
    if (!raw) { blank++; continue; }
    const itemId = byCode.get(norm(raw));
    if (itemId) matched.push({ attendeeId: a.id, itemId, slot: slot.slot });
    else misses.set(raw, (misses.get(raw) ?? 0) + 1);
  }
  return { matched, unmatched: [...misses.entries()].map(([value, count]) => ({ value, count })), blank };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/breakouts.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/breakouts.ts tests/breakouts.test.ts
git commit -m "feat(breakouts): the spreadsheet column becomes assignments, typos and all

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Admin — slot and code on the agenda form, and the assign action

**Files:**
- Modify: `src/app/admin/events/[id]/agenda/page.tsx`
- Modify: `src/app/admin/events/[id]/actions.ts`

**Interfaces:**
- Consumes: `breakoutSlots`, `matchAssignments` (Tasks 2, 6); `listAttendees` from `@/lib/db/attendees`; `listAgenda` from `@/lib/db/agenda`; `assignMany`, `renameSlotAssignments` (Task 5); `flashPath` from `@/lib/flash`.
- Produces: `assignFromColumnAction(eventId: string, formData: FormData): Promise<void>` exported from `actions.ts`, reading form fields `slot` (string) and `overwrite` (`"on"` or absent).

- [ ] **Step 1: Add the two fields to the agenda form**

In `src/app/admin/events/[id]/agenda/page.tsx`, inside the "Add a session" form, after the categories `Field`:

```tsx
<div className="grid grid-cols-2 gap-3">
  <Field label="Breakout round" name="slot" placeholder="Blank = ordinary session" description="Name it the same as the column in the client's spreadsheet." />
  <Field label="Room code" name="code" placeholder="3A" description="The value that column holds for this room." />
</div>
```

- [ ] **Step 2: Carry them into `addAgendaItemAction`**

In `src/app/admin/events/[id]/actions.ts`, inside `addAgendaItemAction`, add to the object passed to `createAgendaItem`:

```ts
    slot: str(formData, "slot"),
    code: str(formData, "code"),
```

- [ ] **Step 3: Write the assign action**

Append to `src/app/admin/events/[id]/actions.ts`:

```ts
// ---- Breakouts ----

/**
 * Turns the imported spreadsheet column into assignments for one round.
 *
 * Deliberately not run by the import: the masterlist is imported before the agenda exists,
 * so anything automatic would silently assign nobody (D83). Re-runnable, and skips people who
 * already have a room unless `overwrite` is ticked, so running it again on the morning of
 * day 2 does not undo what the desk did at breakfast.
 */
export async function assignFromColumnAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const wanted = String(formData.get("slot") ?? "").trim();
  const overwrite = formData.get("overwrite") === "on";
  const agendaPath = `/admin/events/${eventId}/agenda`;

  const slot = breakoutSlots(await listAgenda(ev.id)).find((s) => s.slot === wanted);
  if (!slot) redirect(flashPath(agendaPath, "That breakout round no longer exists.", "error"));

  const report = matchAssignments(await listAttendees(ev.id), slot);
  const written = await assignMany(ev.id, report.matched, overwrite);

  const problems = report.unmatched.map((u) => `${u.value} (${u.count})`).join(", ");
  const message = [
    `${written} assigned to ${slot.slot}.`,
    report.blank ? `${report.blank} blank.` : "",
    problems ? `No room matches: ${problems}.` : "",
  ].filter(Boolean).join(" ");
  redirect(flashPath(agendaPath, message, report.unmatched.length ? "error" : "success"));
}
```

Add the imports this needs at the top of the file:

```ts
import { breakoutSlots, matchAssignments } from "@/lib/breakouts";
import { assignMany, renameSlotAssignments } from "@/lib/db/breakouts";
import { listAgenda } from "@/lib/db/agenda";
```

- [ ] **Step 4: Keep the denormalised slot in step**

Wherever an agenda item's `slot` can be edited, call `renameSlotAssignments(itemId, newSlot)` immediately after the item is updated. If the agenda page has no edit path yet (only add and delete), add this comment above `addAgendaItemAction` instead so the next person finds it:

```ts
// NOTE: if an edit path is added for agenda items, renaming `slot` MUST also call
// renameSlotAssignments() — the copy on each assignment row is what the unique index reads.
```

- [ ] **Step 5: Add the "Assign from column" control**

In the agenda page, above the session list, render one `Modal` per breakout round:

```tsx
{breakoutSlots(items).map((s) => (
  <Modal key={s.slot} title={`Assign from column: ${s.slot}`} hint={`Reads each attendee's "${s.slot}" column and matches it to a room code.`} trigger={`Assign ${s.slot}`} icon="users" variant="outline">
    <form action={assignFromColumnAction.bind(null, ev.id)} className="grid gap-4">
      <input type="hidden" name="slot" value={s.slot} />
      <p className="text-sm text-muted-foreground">Rooms in this round: {s.items.map((i) => i.code).filter(Boolean).join(", ") || "none have a code yet"}.</p>
      <label className="flex items-center gap-3 text-sm font-medium">
        <input type="checkbox" name="overwrite" className="size-4 accent-primary" />
        Overwrite people who already have a room
      </label>
      <SubmitButton>Assign from column</SubmitButton>
    </form>
  </Modal>
))}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm test && npm run lint && npm run build`
Expected: all clean. The admin UI itself cannot be verified here (login-gated) — it goes on the checklist in Task 12.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin
git commit -m "feat(breakouts): the organiser turns a column into rooms, and sees the typos

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Admin — per-room rosters and the unassigned count

**Files:**
- Modify: `src/lib/breakouts.ts`
- Modify: `src/app/admin/events/[id]/agenda/page.tsx`
- Test: `tests/breakouts.test.ts`

**Interfaces:**
- Consumes: `breakoutSlots` (Task 2), `listAssignments` (Task 5).
- Produces: `RosterRoom = { slot: string; code: string; title: string; location: string | null; attendeeIds: string[] }`, `SlotRoster = { slot: string; rooms: RosterRoom[]; unassignedIds: string[] }`, and `rosters(items: AgendaItem[], attendeeIds: string[], assignments: { agenda_item_id: string; attendee_id: string }[]): SlotRoster[]`.

- [ ] **Step 1: Write the failing test**

Append to `tests/breakouts.test.ts` (add `rosters` to the import):

```ts
describe("rosters", () => {
  const a = item({ id: "a", slot: "Breakout 1", code: "3A", location: "Room 3A" });
  const b = item({ id: "b", slot: "Breakout 1", code: "3B", location: "Room 3B" });

  it("puts each attendee in their room", () => {
    const [r] = rosters([a, b], ["p1", "p2", "p3"], [
      { agenda_item_id: "a", attendee_id: "p1" },
      { agenda_item_id: "b", attendee_id: "p2" },
    ]);
    expect(r.rooms.map((x) => [x.code, x.attendeeIds])).toEqual([["3A", ["p1"]], ["3B", ["p2"]]]);
  });

  it("names everyone who has no room in this round", () => {
    // The number the desk needs at breakfast, not at 13:29.
    const [r] = rosters([a, b], ["p1", "p2", "p3"], [{ agenda_item_id: "a", attendee_id: "p1" }]);
    expect(r.unassignedIds).toEqual(["p2", "p3"]);
  });

  it("counts a round separately from the others", () => {
    const c = item({ id: "c", slot: "Breakout 2", code: "5A" });
    const out = rosters([a, c], ["p1"], [{ agenda_item_id: "a", attendee_id: "p1" }]);
    expect(out.map((s) => [s.slot, s.unassignedIds.length])).toEqual([["Breakout 1", 0], ["Breakout 2", 1]]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/breakouts.test.ts`
Expected: FAIL — `rosters is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/breakouts.ts`:

```ts
export type RosterRoom = { slot: string; code: string; title: string; location: string | null; attendeeIds: string[] };
export type SlotRoster = { slot: string; rooms: RosterRoom[]; unassignedIds: string[] };

/**
 * Who is in which room, per round, plus everyone who is in none of them.
 *
 * The unassigned list is the operationally useful half: it is the people the desk has to find
 * before the round starts, and it is also what a typo in the client's spreadsheet looks like
 * from the organiser's side.
 */
export function rosters(
  items: AgendaItem[],
  attendeeIds: string[],
  assignments: { agenda_item_id: string; attendee_id: string }[],
): SlotRoster[] {
  const byItem = new Map<string, string[]>();
  for (const a of assignments) {
    const list = byItem.get(a.agenda_item_id);
    if (list) list.push(a.attendee_id); else byItem.set(a.agenda_item_id, [a.attendee_id]);
  }
  return breakoutSlots(items).map((s) => {
    const rooms = s.items.map((i) => ({
      slot: s.slot, code: i.code?.trim() || "", title: i.title, location: i.location,
      attendeeIds: byItem.get(i.id) ?? [],
    }));
    const placed = new Set(rooms.flatMap((r) => r.attendeeIds));
    return { slot: s.slot, rooms, unassignedIds: attendeeIds.filter((id) => !placed.has(id)) };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/breakouts.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Render the roster on the agenda page**

In `src/app/admin/events/[id]/agenda/page.tsx`, load `listAssignments(ev.id)` and `listAttendees(ev.id)` alongside the agenda, then render per round:

```tsx
{rosters(items, attendees.map((a) => a.id), assignments).map((s) => (
  <Card key={s.slot} className="gap-0 divide-y py-0">
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="font-bold">{s.slot}</div>
      {s.unassignedIds.length > 0
        ? <Badge variant="secondary">{s.unassignedIds.length} with no room</Badge>
        : <Badge variant="success">Everyone placed</Badge>}
    </div>
    {s.rooms.map((r) => (
      <div key={r.code} className="flex items-center justify-between gap-3 p-4 text-sm">
        <div><span className="font-bold">{r.code || "no code"}</span> <span className="text-muted-foreground">{r.location ?? r.title}</span></div>
        <span className="font-bold tabular-nums">{r.attendeeIds.length}</span>
      </div>
    ))}
  </Card>
))}
```

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit && npm test && npm run lint && npm run build`

```bash
git add src/lib/breakouts.ts tests/breakouts.test.ts src/app/admin
git commit -m "feat(breakouts): the desk can see who has no room yet

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Admin — assign from the attendee table

**Files:**
- Modify: `src/components/admin/BulkBar.tsx`
- Modify: `src/app/admin/events/[id]/actions.ts`

**Interfaces:**
- Consumes: `parseIds` from `@/lib/bulk`, `breakoutSlots` (Task 2), `assignMany`, `unassign` (Task 5).
- Produces: `bulkAssignBreakoutAction(eventId: string, formData: FormData): Promise<void>`, reading `ids` (comma-separated attendee ids, as the existing bulk actions do) and `item` (an agenda item id, or `""` to unassign).

- [ ] **Step 1: Write the action**

Append to `src/app/admin/events/[id]/actions.ts`:

```ts
/**
 * Moves a selection of attendees into one breakout room — the day-of edit, which starts from
 * the attendee list somebody is already searching rather than from the agenda.
 *
 * An empty `item` unassigns them from that round instead, which is how you undo a bad import
 * without picking a room nobody belongs in.
 */
export async function bulkAssignBreakoutAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const attendeesPath = `/admin/events/${eventId}/attendees`;

  const all = await listAttendees(ev.id);
  const ids = parseIds(String(formData.get("ids") ?? ""), new Set(all.map((a) => a.id)));
  if (ids.length === 0) redirect(flashPath(attendeesPath, "Select somebody first.", "error"));

  const itemId = String(formData.get("item") ?? "").trim();
  const slots = breakoutSlots(await listAgenda(ev.id));
  const room = slots.flatMap((s) => s.items).find((i) => i.id === itemId);
  const slotName = String(formData.get("slot") ?? "").trim();

  if (!room) {
    if (!slotName) redirect(flashPath(attendeesPath, "Choose a room, or a round to clear.", "error"));
    for (const id of ids) await unassign(ev.id, id, slotName);
    revalidatePath(attendeesPath);
    redirect(flashPath(attendeesPath, `${ids.length} cleared from ${slotName}.`));
  }

  const slot = (room.slot as string).trim();
  await assignMany(ev.id, ids.map((attendeeId) => ({ attendeeId, itemId: room.id, slot })), true);
  revalidatePath(attendeesPath);
  redirect(flashPath(attendeesPath, `${ids.length} moved to ${room.code ?? slot}.`));
}
```

- [ ] **Step 2: Add the control to the bulk bar**

In `src/components/admin/BulkBar.tsx`, add a select of every breakout room plus a "Clear round" option, in a form posting `ids`, `item` and `slot` to `bulkAssignBreakoutAction`. Render it only when the event has breakout rounds, so an event without them sees no change:

```tsx
{rooms.length > 0 && (
  <form action={assignBreakout} className="flex items-center gap-2">
    <input type="hidden" name="ids" value={selectedIds.join(",")} />
    <select name="item" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
      <option value="">Choose a room…</option>
      {rooms.map((r) => <option key={r.id} value={r.id}>{r.slot} · {r.code}</option>)}
    </select>
    <SubmitButton variant="outline">Assign</SubmitButton>
  </form>
)}
```

`rooms` is passed in from the attendee page as `breakoutSlots(await listAgenda(ev.id)).flatMap((s) => s.items.map((i) => ({ id: i.id, slot: s.slot, code: i.code ?? "" })))`.

- [ ] **Step 3: Verify and commit**

Run: `npx tsc --noEmit && npm test && npm run lint && npm run build`

```bash
git add src/components/admin/BulkBar.tsx src/app/admin
git commit -m "feat(breakouts): moving four people to another room is a selection, not a re-import

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Portal — the "Your breakouts" card

**Files:**
- Create: `src/components/portal/BreakoutCard.tsx`
- Modify: `src/app/e/[slug]/a/[token]/page.tsx`
- Modify: `src/components/portal/AgendaList.tsx`

**Interfaces:**
- Consumes: `myBreakouts`, `MyBreakout` (Task 4), `assignedItemIdsFor` (Task 5).
- Produces: `BreakoutCard({ breakouts, contactPhone }: { breakouts: MyBreakout[]; contactPhone: string | null })`.

- [ ] **Step 1: Write the component**

Create `src/components/portal/BreakoutCard.tsx`:

```tsx
import type { MyBreakout } from "@/lib/breakouts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const caption = "text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground";

/**
 * Every breakout round this attendee has, across the whole event.
 *
 * All of them rather than the next one: two rounds in one afternoon is exactly when somebody
 * wants to look ahead, and "what is next" is already the job of the card above this one.
 *
 * A round with no room still appears. This is the card someone opens when they do not know
 * where to go, so it is the worst possible place to say nothing.
 */
export function BreakoutCard({ breakouts, contactPhone }: { breakouts: MyBreakout[]; contactPhone: string | null }) {
  if (breakouts.length === 0) return null;
  return (
    <Card>
      <CardHeader><CardTitle className={caption}>Your breakouts</CardTitle></CardHeader>
      <CardContent>
        <dl className="divide-y text-sm">
          {breakouts.map((b) => (
            <div key={b.slot} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-0.5 py-2.5">
              <dt className="text-muted-foreground">
                {b.slot}
                <span className="ml-2 tabular-nums">{b.starts_at}{b.ends_at ? `–${b.ends_at}` : ""}</span>
              </dt>
              <dd className="ml-auto font-medium">
                {b.item
                  ? <span className="font-extrabold">{b.item.location ?? b.item.code ?? b.item.title}</span>
                  : <span className="text-muted-foreground">
                      Room not assigned yet{contactPhone ? <> · <a className="font-medium text-primary" href={`tel:${contactPhone}`}>{contactPhone}</a></> : null}
                    </span>}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Render it below the badge card**

In `src/app/e/[slug]/a/[token]/page.tsx`, inside the left column immediately after `<BadgeCard … />`:

```tsx
<BreakoutCard breakouts={myBreakouts(allAgenda, assignedItemIds)} contactPhone={event.contact_phone} />
```

`allAgenda` must be the UNFILTERED list — `visibleTo` has already removed the rooms this attendee is not in, so filtering first would erase the very rounds the placeholder exists to report. Load it with `listAgenda(event.id)`.

- [ ] **Step 3: Make the room read stronger on a breakout agenda row**

In `src/components/portal/AgendaList.tsx`, where the item's `location` renders, give a breakout item's location the emphasis an ordinary row's does not have:

```tsx
{item.location && (
  <div className={isBreakout(item) ? "text-sm font-extrabold text-primary" : "text-xs text-muted-foreground"}>
    {item.location}
  </div>
)}
```

- [ ] **Step 4: Verify in the browser**

Run: `npm test && npm run lint && npx tsc --noEmit`, then drive the portal in the browser pane against the live event:
- An attendee with an assignment sees exactly their room on the agenda and one row per round on the card.
- An attendee with none sees the placeholder with the desk's number, and no other group's room anywhere on the page.
- An event with no breakout rounds shows no card at all and an unchanged agenda.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal src/app/e
git commit -m "feat(breakouts): your afternoon says which room is yours

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Roster export

**Files:**
- Modify: `src/lib/exports.ts`
- Create: `src/app/admin/events/[id]/export/rosters.xlsx/route.ts`
- Modify: `src/app/admin/events/[id]/exports/page.tsx`
- Test: `tests/exports.test.ts`

**Interfaces:**
- Consumes: `SlotRoster`, `RosterRoom` (Task 8).
- Produces: `RosterPerson = { name: string; company: string | null; email: string | null }`, `rosterSheetName(slot: string, code: string, taken: Set<string>): string`, and `buildRosterWorkbook(slots: SlotRoster[], people: Map<string, RosterPerson>): ExcelJS.Workbook`.

- [ ] **Step 1: Write the failing test**

Append to `tests/exports.test.ts`:

```ts
describe("roster workbook", () => {
  const people = new Map([
    ["p1", { name: "Ann Tan", company: "Ecopia", email: "a@b.co" }],
    ["p2", { name: "Bryan Koh", company: null, email: null }],
  ]);
  const slots = [{
    slot: "Breakout 1",
    rooms: [{ slot: "Breakout 1", code: "3A", title: "Regional teams", location: "Room 3A", attendeeIds: ["p1"] }],
    unassignedIds: ["p2"],
  }];

  it("gives each room its own sheet, headed and filled", () => {
    const wb = buildRosterWorkbook(slots, people);
    const ws = wb.getWorksheet("Breakout 1 · 3A")!;
    expect(ws.getRow(1).values).toEqual([undefined, "Name", "Company", "Email"]);
    expect(ws.getRow(2).getCell(1).value).toBe("Ann Tan");
  });

  it("puts the people with no room on their own sheet", () => {
    const ws = buildRosterWorkbook(slots, people).getWorksheet("Breakout 1 · unassigned")!;
    expect(ws.getRow(2).getCell(1).value).toBe("Bryan Koh");
  });

  it("keeps sheet names legal and unique", () => {
    // Excel forbids : \\ / ? * [ ] and caps a sheet name at 31 characters.
    const taken = new Set<string>();
    const first = rosterSheetName("Breakout 1 / afternoon session", "3A", taken);
    taken.add(first);
    expect(first).not.toMatch(/[:\\/?*\[\]]/);
    expect(first.length).toBeLessThanOrEqual(31);
    expect(rosterSheetName("Breakout 1 / afternoon session", "3A", taken)).not.toBe(first);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/exports.test.ts`
Expected: FAIL — `buildRosterWorkbook is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/exports.ts` (import `SlotRoster` from `@/lib/breakouts`):

```ts
export type RosterPerson = { name: string; company: string | null; email: string | null };

/**
 * A sheet name Excel will actually accept: no : \ / ? * [ ], 31 characters, and unique within
 * the workbook. Two rooms called "3A" in rounds whose names collide after truncation would
 * otherwise make ExcelJS throw at the second one.
 */
export function rosterSheetName(slot: string, code: string, taken: Set<string>): string {
  const clean = (s: string) => s.replace(/[:\\/?*\[\]]/g, "-").trim();
  const base = `${clean(slot)} · ${clean(code) || "no code"}`.slice(0, 31);
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return base.slice(0, 29) + "~~";
}

/**
 * One printable sheet per room, plus one per round listing whoever has no room.
 *
 * Per room rather than one grid, because the artefact a facilitator asks for is the page for
 * their own room. The cross-tab of everyone against every round is the file the client sent
 * you in the first place.
 */
export function buildRosterWorkbook(slots: SlotRoster[], people: Map<string, RosterPerson>): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const taken = new Set<string>();
  const sheet = (slot: string, code: string, ids: string[]) => {
    const name = rosterSheetName(slot, code, taken);
    taken.add(name);
    const ws = wb.addWorksheet(name);
    ws.addRow(["Name", "Company", "Email"]);
    for (const id of ids) {
      const p = people.get(id);
      if (p) ws.addRow([p.name, p.company, p.email]);
    }
    ws.columns = [{ width: 28 }, { width: 24 }, { width: 28 }];
  };
  for (const s of slots) {
    for (const r of s.rooms) sheet(s.slot, r.code || "no code", r.attendeeIds);
    if (s.unassignedIds.length) sheet(s.slot, "unassigned", s.unassignedIds);
  }
  return wb;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/exports.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the route**

Create `src/app/admin/events/[id]/export/rosters.xlsx/route.ts`:

```ts
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAttendees } from "@/lib/db/attendees";
import { listAgenda } from "@/lib/db/agenda";
import { listAssignments } from "@/lib/db/breakouts";
import { rosters } from "@/lib/breakouts";
import { buildRosterWorkbook, type RosterPerson } from "@/lib/exports";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { orgId } = await requireAdmin(); const ev = await requireEvent(id, orgId);
  const [attendees, items, assignments] = await Promise.all([
    listAttendees(ev.id), listAgenda(ev.id), listAssignments(ev.id),
  ]);
  const people = new Map<string, RosterPerson>(
    attendees.map((a) => [a.id, { name: a.name, company: a.company, email: a.email }]),
  );
  const slots = rosters(items, attendees.map((a) => a.id), assignments);
  const buf = await buildRosterWorkbook(slots, people).xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${ev.slug}-breakout-rosters.xlsx"`,
    },
  });
}
```

Unlike `attendance.xlsx`, this route takes no `ids` parameter: a roster is the whole room or it is
not a roster, so there is no selection to honour and no way for it to fail open.

Then in `src/app/admin/events/[id]/exports/page.tsx`, add the link, rendered only when the event
runs breakouts so nothing changes for events that do not:

```tsx
{breakoutSlots(items).length > 0 && (
  <a href={`/admin/events/${ev.id}/export/rosters.xlsx`} className={buttonVariants({ variant: "outline" })}>
    Breakout rosters (.xlsx)
  </a>
)}
```

This needs `listAgenda(ev.id)` loaded on that page and `breakoutSlots` imported from `@/lib/breakouts`.

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit && npm test && npm run lint && npm run build`

```bash
git add src/lib/exports.ts tests/exports.test.ts src/app/admin
git commit -m "feat(breakouts): every facilitator gets their own page

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Migration, and the checklist for the user

**Files:**
- Modify: `docs/runbook.md`
- Create: `docs/breakouts-verification-checklist.md`

- [ ] **Step 1: Write the checklist**

Create `docs/breakouts-verification-checklist.md` with these items, which are the ones Claude cannot verify because the admin is login-gated:

```markdown
# Breakouts — what the organiser must check

1. Add four agenda items at the same time, all with slot "Breakout 1" and codes 3A–3D.
2. Import a masterlist with a "Breakout 1" column holding 3A/3B/3C/3D. Confirm the values
   land in the attendee table.
3. Run "Assign Breakout 1". Confirm the message counts the assignments and names any value
   that matched no room.
4. Deliberately put "Room 3B" in one cell and re-run. That row must be REPORTED, not silently
   dropped.
5. Run it a second time with overwrite unticked. Nobody already placed should move.
6. Move four people to another room from the attendee table's bulk bar.
7. Re-run "Assign from column" with overwrite unticked. Those four must STAY where you moved
   them.
8. Open the roster on the agenda page. Counts per room should add up, and the "with no room"
   badge should match the number of people you left out.
9. Download the roster export. One sheet per room, one for the unassigned.
10. Open one attendee's personal link on a phone: their room on the agenda, one row per round
    on the Your breakouts card, and no other group's room anywhere.
11. Open an unassigned attendee's link: the placeholder with the desk's number, in both places.
12. Open an event with no breakout rounds: no card, and an agenda unchanged from today.
```

- [ ] **Step 2: Document the migration in the runbook**

Add to `docs/runbook.md`, under deployment: migration `0007_breakouts.sql` is additive and is applied at merge; the currently deployed code neither knows nor reads the new columns, so the two deploys may land in either order.

- [ ] **Step 3: Apply the migration**

Apply `supabase/migrations/0007_breakouts.sql` to production at merge time, not before. Confirm afterwards:

```sql
select count(*) from information_schema.columns
where table_name = 'agenda_items' and column_name in ('slot','code');
-- expect 2
select count(*) from breakout_assignments;
-- expect 0
```

- [ ] **Step 4: Commit**

```bash
git add docs
git commit -m "docs(breakouts): what the organiser has to check, and when the migration runs

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
