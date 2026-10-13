# Groups page with All groups — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The portal's My group page becomes **Groups**. It has a **My group** tab (today's page) and an **All groups** tab: team cards with an optional picture each, which open to show their members.

**Architecture:**
- **Data:** one additive migration, `event_groups.image_url` and `events.all_groups`.
- **Rules:** pure helpers in `src/lib/groups.ts` decide which tabs show and build the All groups cards. They are unit-tested in `tests/groups.test.ts`.
- **Portal:** the route `src/app/e/[slug]/a/[token]/group/page.tsx` stays and becomes a tabbed page using the Info page's `?tab=` pattern (`PortalTabStrip`, `PendingScope`). Each tab is its own server component in the same folder.
- **Admin:** the group detail page gets a Picture card using the existing `ImageField` + `nextImage` flow. The Groups page's settings popup gains the switch.

**Tech Stack:** Next.js (app router, server components and Server Actions; read `node_modules/next/dist/docs/` before using an API you're unsure of, per AGENTS.md), Supabase (service client), Tailwind, shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-13-all-groups-design.md` (D506–D515). Read it before starting.

## Global Constraints

- **Decision numbers** are D506–D515 and the migration is `0078`. Cite the D-number in code comments the way the surrounding code does (`// D512: ...`).
- **`events.all_groups`** is `boolean not null default false`. **`event_groups.image_url`** is `text`, nullable.
- **The tile label is "Groups"**, and the route stays `/group`.
- **Tab keys in the URL** are `?tab=mine` and `?tab=all`, with labels "My group" and "All groups".
- **Other groups' cards** show member names and tag badges only. No other shared field value may reach the All groups markup.
- **Admin picture hint, verbatim:** "Landscape, about 3:2 (e.g. 900×600)".
- **Settings checkbox label, verbatim:** "Show all groups to attendees".
- **The admin popup** title is "Groups tile".
- **Test only on the ecpkom event. Never write to, toggle or upload on ecphub** (the live event).
- **Work happens on `main`.** No worktree.
- **Every commit message** ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Verification commands:**
  - `npm test` (Vitest)
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npm run build`
  - dev server via the `dev` entry in `.claude/launch.json` (`preview_start {name: "dev"}`)

## Review Focus

Most likely to bite first:

1. **A crafted or stale `?tab=`**, such as `?tab=all` when the switch is off, or `?tab=xyz`. It must fall back to the first tab the attendee may see, never show a tab they're not allowed. Pinned in Task 2 (`pickGroupTab` tests).
2. **Another group's table number or phone** leaking into the All groups cards. Pinned in Task 2: the test asserts a card member is exactly `{ id, name, tags }`.
3. **The tile is off but the switch is on.** The tile and the page must both be gone (404), as D367 promised. Pinned in Task 2 (`groupTabs` tile-off test) and checked in the Task 6 browser pass.
4. **A group with no members, or with no picture.** It must still be listed, with a "0 members" line and no empty picture box. Pinned in Task 2 (`allGroupCards` test) and Task 6 (browser).
5. **A failed or refused picture upload.** It must keep the old picture and leave no half-saved row; a replaced picture's object is deleted only after the row saves. Enforced in Task 5's action order, using the existing `nextImage` contract, and checked in Task 6.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `supabase/migrations/0078_all_groups.sql` | Create | The two columns |
| `src/lib/types.ts` | Modify | `EventGroup.image_url`, `Event.all_groups` |
| `src/lib/storage.ts` | Modify | `ImageKind` gains `"group"` |
| `src/lib/db/groups.ts` | Modify | `groupedAttendees`, `setGroupImage` |
| `src/lib/groups.ts` | Modify | `GroupTab`, `GROUP_TAB_LABELS`, `groupTabs`, `pickGroupTab`, `GroupCard`, `allGroupCards` |
| `tests/groups.test.ts` | Modify | Fixtures gain `image_url`; tests for the new helpers |
| `src/lib/launcher.ts` | Modify | Label "Groups" |
| `tests/launcher.test.ts` | Modify | Expect "Groups" |
| `src/app/e/[slug]/a/[token]/page.tsx` | Modify | Tile condition via `groupTabs` |
| `src/app/e/[slug]/a/[token]/group/page.tsx` | Rewrite | Tabs: picks the tab and renders a panel |
| `src/app/e/[slug]/a/[token]/group/my-group.tsx` | Create | Today's page body, moved here unchanged |
| `src/app/e/[slug]/a/[token]/group/all-groups.tsx` | Create | The card list |
| `src/app/admin/events/[id]/groups/actions.ts` | Modify | `setGroupImageAction`, delete removes the picture, the switch saved by `setGroupTileAction` |
| `src/app/admin/events/[id]/groups/page.tsx` | Modify | Popup title and the second checkbox |
| `src/app/admin/events/[id]/groups/[groupId]/page.tsx` | Modify | Picture card |

---

### Task 1: Data foundation (migration, types, image kind, db functions)

**Files:**
- Create: `supabase/migrations/0078_all_groups.sql`
- Modify: `src/lib/types.ts:85-86` (after `group_tile`) and `src/lib/types.ts:273` (`EventGroup`)
- Modify: `src/lib/storage.ts:17-20` (`ImageKind`)
- Modify: `src/lib/db/groups.ts` (two new functions)
- Modify: `tests/groups.test.ts:68` and `tests/groups.test.ts:133` (the `g` fixtures)

**Interfaces:**
- Produces:
  - `EventGroup` gains `image_url: string | null`.
  - `Event` gains `all_groups: boolean`.
  - `ImageKind` includes `"group"`.
  - `groupedAttendees(eventId: string): Promise<Pick<Attendee, "id" | "name" | "group_id" | "extra">[]>`
  - `setGroupImage(eventId: string, groupId: string, url: string | null): Promise<void>`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0078_all_groups.sql`:

```sql
-- Groups page with All groups (spec 2026-10-13-all-groups-design.md, D506–D515). Two additive
-- columns; no existing row changes meaning.

-- D506: one optional picture per group, a public MEDIA_BUCKET URL like the other event images.
alter table public.event_groups add column if not exists image_url text;

-- D507: the All groups tab. Off by default, so every event keeps the page it has today until
-- an admin turns it on. group_tile still hides the whole tile and page.
alter table public.events add column if not exists all_groups boolean not null default false;
```

- [ ] **Step 2: Apply the migration**

- Load the Supabase MCP tools with ToolSearch `select:mcp__0687aa52-4553-40db-b867-72024a86f547__list_projects,mcp__0687aa52-4553-40db-b867-72024a86f547__apply_migration,mcp__0687aa52-4553-40db-b867-72024a86f547__execute_sql`.
- Call `list_projects` and pick the project whose ref appears in `NEXT_PUBLIC_SUPABASE_URL` in `.env.local`.
- Call `apply_migration` with name `all_groups` and the SQL above.
- Verify with `execute_sql`:

```sql
select column_name, data_type, is_nullable, column_default from information_schema.columns
where (table_name = 'event_groups' and column_name = 'image_url') or (table_name = 'events' and column_name = 'all_groups');
```

Expected: two rows. `image_url` is `text` and nullable; `all_groups` is `boolean`, not nullable, with default `false`.

The change is additive and safe for the live ecphub rows: all of them get `all_groups = false` and `image_url = null`.

- [ ] **Step 3: Update the types**

In `src/lib/types.ts`, directly after the `group_tile: boolean;` line (line 86), add:

```ts
  /** D507: the Groups page's All groups tab. Off by default; `group_tile` off still hides everything. */
  all_groups: boolean;
```

Replace line 273:

```ts
/** A named set of one event's attendees (D345). An attendee is in at most one (D344). D506: an optional picture. */
export type EventGroup = { id: string; org_id: string; event_id: string; name: string; image_url: string | null; created_at: string };
```

In `src/lib/storage.ts`, extend `ImageKind`:

```ts
export type ImageKind =
  | "logo" | "banner" | "floor-plan" | "agenda" | "info" | "activity" | "tile-icon"
  | "game-background" | "game-video" | "game-prize" | "game-card-back"
  | "polaroid-sticker" | "polaroid-background" | "group";
```

- [ ] **Step 4: Fix the test fixtures the type change breaks**

In `tests/groups.test.ts`, change **both** `g` helpers (lines 68 and 133) to:

```ts
  const g = (id: string, name: string): EventGroup => ({ id, org_id: "o", event_id: "e", name, image_url: null, created_at: "" });
```

- [ ] **Step 5: Add the db functions**

In `src/lib/db/groups.ts`:

1. Add the import `import { selectAll } from "@/lib/db/select-all";`.
2. Widen the type import to `import type { Attendee, Event, EventGroup } from "@/lib/types";` (already present; leave it if unchanged).
3. Add after `groupMembers`:

```ts
/**
 * D512: everyone in a group, for the All groups tab - only the columns a card shows (the name)
 * and needs to work out tags (`extra`). Paged (D289): an event can outgrow PostgREST's
 * 1,000-row page, and the order ends on `id` so the pages never overlap.
 */
export async function groupedAttendees(eventId: string): Promise<Pick<Attendee, "id" | "name" | "group_id" | "extra">[]> {
  return selectAll((from, to) => serviceClient().from("attendees").select("id, name, group_id, extra")
    .eq("event_id", eventId).not("group_id", "is", null).order("name").order("id").range(from, to));
}

/** D506: the group's picture, or null to clear it. The caller removes the old object after. */
export async function setGroupImage(eventId: string, groupId: string, url: string | null): Promise<void> {
  const { error } = await serviceClient().from("event_groups").update({ image_url: url }).eq("event_id", eventId).eq("id", groupId);
  if (error) throw error;
}
```

- [ ] **Step 6: Run the type check and tests**

Run: `npx tsc --noEmit`
Expected: no errors. If a fixture elsewhere builds an `Event` or `EventGroup` literal and now errors, add `all_groups: false` / `image_url: null` to it.

Run: `npm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0078_all_groups.sql src/lib/types.ts src/lib/storage.ts src/lib/db/groups.ts tests/groups.test.ts
git commit -m "feat(groups): group pictures and the All groups switch, data side (D506, D507)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The rules (which tabs show, and the All groups cards)

**Files:**
- Modify: `src/lib/groups.ts` (append after `taggedFirst`)
- Test: `tests/groups.test.ts` (append; extend the import on line 2)

**Interfaces:**
- Consumes: `EventGroup.image_url` (Task 1), existing `groupFieldValues` and `taggedFirst`.
- Produces:
  - `type GroupTab = "mine" | "all"`
  - `const GROUP_TAB_LABELS: Record<GroupTab, string>`, which is `{ mine: "My group", all: "All groups" }`
  - `groupTabs(input: { tile: boolean; inGroup: boolean; allGroups: boolean }): GroupTab[]`
  - `pickGroupTab(tabs: GroupTab[], requested: string | undefined): GroupTab | null`
  - `type GroupCard = { id: string; name: string; imageUrl: string | null; mine: boolean; members: { id: string; name: string; tags: string[] }[] }`
  - `allGroupCards(groups: Pick<EventGroup, "id" | "name" | "image_url">[], members: Pick<Attendee, "id" | "name" | "group_id" | "extra">[], ownGroupId: string | null, groupFields: string[], fields: AttendeeField[]): GroupCard[]`

- [ ] **Step 1: Write the failing tests**

In `tests/groups.test.ts`:

- Add `groupTabs, pickGroupTab, allGroupCards` to the import on line 2.
- Add `import type { AttendeeField } from "@/lib/attendee-fields";`.
- Append:

```ts
describe("groupTabs (D508, D509, D514)", () => {
  it("shows My group alone for a member when All groups is off — today's page", () => {
    expect(groupTabs({ tile: true, inGroup: true, allGroups: false })).toEqual(["mine"]);
  });

  it("shows both tabs, My group first, for a member when All groups is on", () => {
    expect(groupTabs({ tile: true, inGroup: true, allGroups: true })).toEqual(["mine", "all"]);
  });

  it("shows All groups alone to someone in no group when it is on (D514)", () => {
    expect(groupTabs({ tile: true, inGroup: false, allGroups: true })).toEqual(["all"]);
  });

  it("shows nothing to someone in no group when All groups is off", () => {
    expect(groupTabs({ tile: true, inGroup: false, allGroups: false })).toEqual([]);
  });

  it("shows nothing at all when the organiser hid the tile, whatever the switch says (D367)", () => {
    expect(groupTabs({ tile: false, inGroup: true, allGroups: true })).toEqual([]);
  });
});

describe("pickGroupTab (D509)", () => {
  it("opens the asked-for tab when it is one of theirs", () => {
    expect(pickGroupTab(["mine", "all"], "all")).toBe("all");
  });

  it("falls back to the first tab for a missing, unknown or not-allowed tab", () => {
    expect(pickGroupTab(["mine", "all"], undefined)).toBe("mine");
    expect(pickGroupTab(["mine", "all"], "xyz")).toBe("mine");
    expect(pickGroupTab(["mine"], "all")).toBe("mine");
  });

  it("answers null when there is no tab to show", () => {
    expect(pickGroupTab([], "all")).toBeNull();
  });
});

describe("allGroupCards (D511–D513)", () => {
  const fields: AttendeeField[] = [
    { key: "captain", label: "Captain", type: "text" },
    { key: "table_no", label: "Table no.", type: "number" },
  ];
  const shared = ["captain", "table_no"];
  const groups = [
    { id: "g1", name: "Team 1", image_url: "https://x/1.png" },
    { id: "g2", name: "Team 2", image_url: null },
    { id: "g3", name: "Team 3", image_url: null },
  ];
  const people = [
    { id: "a", name: "Aisyah", group_id: "g1", extra: { table_no: "7" } },
    { id: "b", name: "Ben", group_id: "g1", extra: { captain: "Yes", table_no: "7" } },
    { id: "c", name: "Chen", group_id: "g2", extra: {} },
  ];

  it("puts the attendee's own group first and keeps the rest in the order given (D513)", () => {
    expect(allGroupCards(groups, people, "g2", shared, fields).map((c) => c.id)).toEqual(["g2", "g1", "g3"]);
    expect(allGroupCards(groups, people, null, shared, fields).map((c) => c.id)).toEqual(["g1", "g2", "g3"]);
  });

  it("marks only the attendee's own group as mine", () => {
    expect(allGroupCards(groups, people, "g2", shared, fields).map((c) => c.mine)).toEqual([true, false, false]);
  });

  it("lists tagged members first and gives each member only a name and tag labels (D512)", () => {
    const team1 = allGroupCards(groups, people, null, shared, fields)[0];
    expect(team1.members).toEqual([
      { id: "b", name: "Ben", tags: ["Captain"] },
      { id: "a", name: "Aisyah", tags: [] },
    ]);
    // A table number is a shared field but not a tag: it must never reach another group's card.
    expect(JSON.stringify(team1)).not.toContain("7");
  });

  it("keeps an empty group, and a group without a picture, in the list (D511)", () => {
    const team3 = allGroupCards(groups, people, null, shared, fields)[2];
    expect(team3).toEqual({ id: "g3", name: "Team 3", imageUrl: null, mine: false, members: [] });
  });

  it("carries the picture through", () => {
    expect(allGroupCards(groups, people, null, shared, fields)[0].imageUrl).toBe("https://x/1.png");
  });
});
```

`AttendeeField` is `{ key, label, type, options? }` (`src/lib/attendee-fields.ts:15`). `fieldValue` reads `extra[key]`, so `table_no: "7"` reads as "7". Check that against `src/lib/attendee-values.ts` if the tag test surprises you.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/groups.test.ts`
Expected: FAIL. `groupTabs`, `pickGroupTab` and `allGroupCards` are not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/groups.ts`, after `taggedFirst`:

```ts
/** D509: the Groups page's tabs, in the order they sit in the strip. */
export type GroupTab = "mine" | "all";

export const GROUP_TAB_LABELS: Record<GroupTab, string> = { mine: "My group", all: "All groups" };

/**
 * D508/D509/D514: which tabs this attendee gets. None means no tile on the home page and a 404
 * for the page - the same answer for both, so they can't disagree. The organiser's tile switch
 * (D367) still hides everything.
 */
export function groupTabs(input: { tile: boolean; inGroup: boolean; allGroups: boolean }): GroupTab[] {
  if (!input.tile) return [];
  const tabs: GroupTab[] = [];
  if (input.inGroup) tabs.push("mine");
  if (input.allGroups) tabs.push("all");
  return tabs;
}

/** D509: `?tab=` when it names one of their tabs; otherwise the first. A tab they may not see is never opened. */
export function pickGroupTab(tabs: GroupTab[], requested: string | undefined): GroupTab | null {
  return tabs.find((t) => t === requested) ?? tabs[0] ?? null;
}

/** One card on All groups (D511). Members carry a name and tag labels, nothing else (D512). */
export type GroupCard = {
  id: string;
  name: string;
  imageUrl: string | null;
  mine: boolean;
  members: { id: string; name: string; tags: string[] }[];
};

/**
 * D511–D513: the All groups cards. The attendee's own group leads; the rest keep the order
 * given (`listGroups` sorts by name), and so do each group's members (`groupedAttendees` sorts
 * by name) once `taggedFirst` has lifted the captains. Only tag labels survive from the shared
 * fields: a table number or phone is the attendee's own group's business, on My group.
 */
export function allGroupCards(
  groups: Pick<EventGroup, "id" | "name" | "image_url">[],
  members: Pick<Attendee, "id" | "name" | "group_id" | "extra">[],
  ownGroupId: string | null,
  groupFields: string[],
  fields: AttendeeField[],
): GroupCard[] {
  const ordered = [...groups.filter((g) => g.id === ownGroupId), ...groups.filter((g) => g.id !== ownGroupId)];
  return ordered.map((g) => ({
    id: g.id,
    name: g.name,
    imageUrl: g.image_url,
    mine: g.id === ownGroupId,
    members: taggedFirst(members.filter((m) => m.group_id === g.id), groupFields, fields).map((m) => ({
      id: m.id,
      name: m.name,
      tags: groupFieldValues(m, groupFields, fields).filter((f) => f.tag).map((f) => f.label),
    })),
  }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/groups.test.ts`
Expected: PASS, including every existing test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/groups.ts tests/groups.test.ts
git commit -m "feat(groups): which Groups tabs show, and the All groups cards (D509, D511-D514)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The tile becomes Groups

**Files:**
- Modify: `src/lib/launcher.ts:68-69, 85`
- Modify: `src/app/e/[slug]/a/[token]/page.tsx:101` (and the comment at line 166)
- Test: `tests/launcher.test.ts:61-65`

**Interfaces:**
- Consumes: `groupTabs` (Task 2), `Event.all_groups` (Task 1).
- Produces: the launcher item `builtin:group`, labelled "Groups", still linking to `/group`.

- [ ] **Step 1: Update the failing test**

In `tests/launcher.test.ts`, replace the test at lines 61-65:

```ts
  it("adds Groups after the built-in sections, only when the attendee has a Groups tab (D348, D508)", () => {
    expect(launcherItems(base).map((i) => i.label)).toEqual(["Agenda"]);
    const items = launcherItems({ ...base, hasInfo: true, hasGroup: true });
    expect(items.map((i) => i.label)).toEqual(["Agenda", "Info", "Groups"]);
    expect(items[2]).toMatchObject({ icon: "users", href: `${BASE}/group`, builtin: true, image: "/portal-icons/group.webp" });
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/launcher.test.ts`
Expected: FAIL. The label is still "My group".

- [ ] **Step 3: Implement**

In `src/lib/launcher.ts`, change the `hasGroup` doc comment (line 68) to:

```ts
  /** D348/D508: the attendee has a Groups tab (their own group, or All groups), so Groups has a tile. */
```

and line 85 to:

```ts
    ...(hasGroup ? [section("group", "Groups", "/group", "users", icons?.group ?? DEFAULT_SECTION_ICONS.group)] : []),
```

In `src/app/e/[slug]/a/[token]/page.tsx`:

- Add `import { groupTabs } from "@/lib/groups";`. If `@/lib/groups` is already imported there, add `groupTabs` to that import.
- Replace the `hasGroup: event.group_tile && !!attendee.group_id` argument on line 101 with:

```ts
hasGroup: groupTabs({ tile: event.group_tile, inGroup: !!attendee.group_id, allGroups: event.all_groups }).length > 0
```

In the comment near line 166, change "My group has no header link (F3)" to "Groups has no header link (F3)".

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/launcher.ts tests/launcher.test.ts "src/app/e/[slug]/a/[token]/page.tsx"
git commit -m "feat(portal): the My group tile becomes Groups, shown for either tab (D508)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The Groups page (tabs, My group panel, All groups cards)

**Files:**
- Create: `src/app/e/[slug]/a/[token]/group/my-group.tsx`
- Create: `src/app/e/[slug]/a/[token]/group/all-groups.tsx`
- Rewrite: `src/app/e/[slug]/a/[token]/group/page.tsx`

**Interfaces:**
- Consumes:
  - `groupTabs`, `pickGroupTab`, `GROUP_TAB_LABELS`, `allGroupCards`, `GroupCard` (Task 2)
  - `groupedAttendees` (Task 1)
  - existing `PortalTabStrip` (`src/components/portal/PortalTabStrip.tsx`, which renders nothing for fewer than two tabs)
  - `PendingScope`, `PendingSwap`, `PendingSwipe` from `@/components/PendingNav`
  - `Skeleton` from `@/components/ui/skeletons`
- Produces:
  - `MyGroup({ event, attendee, base, titled })`, an async server component
  - `AllGroups({ event, attendee })`, an async server component

- [ ] **Step 1: Move today's body into `my-group.tsx`**

Create `src/app/e/[slug]/a/[token]/group/my-group.tsx`. It is the current page's body, unchanged. The only addition is the `titled` prop, which drops the group name to an `h2` when the page already carries a "Groups" `h1` (D510):

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGroup, groupMembers } from "@/lib/db/groups";
import { loadActivityEntries, GroupStatus } from "@/features/activities";
import { groupFieldValues, taggedFirst } from "@/lib/groups";
import { Badge } from "@/components/ui/badge";
import { eventFields } from "@/lib/attendee-fields";
import type { Attendee, Event } from "@/lib/types";

/**
 * D348: the attendee's group - who is in it, what the organiser chose to share about each of
 * them, and where the group stands on every group form. D510: unchanged as the Groups page's
 * My group tab; `titled` means the page above already has its h1.
 */
export async function MyGroup({ event, attendee, base, titled }: {
  event: Event;
  attendee: Attendee;
  base: string;
  titled: boolean;
}) {
  const groupId = attendee.group_id;
  if (!groupId) notFound();
  const [group, members, { submission: submissions, people }] = await Promise.all([
    getGroup(event.id, groupId),
    groupMembers(event.id, groupId),
    loadActivityEntries(event, attendee),
  ]);
  if (!group) notFound();
  const fields = eventFields(event.registration_questions, event.attendee_fields);
  // Group forms this attendee can take part in; an ineligible one is not their group's business (D352).
  const forms = submissions.filter((s) => s.group && s.state.reason !== "ineligible");
  const Heading = titled ? "h2" : "h1";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">My group</p>
        <Heading className="text-2xl font-extrabold">{group.name}</Heading>
        <p className="text-sm text-muted-foreground">{members.length} member{members.length === 1 ? "" : "s"}</p>
      </div>

      <ul className="-mx-4 divide-y border-y md:mx-0 md:rounded-xl md:border">
        {taggedFirst(members, event.group_fields, fields).map((m) => {
          const facts = groupFieldValues(m, event.group_fields, fields);
          const tags = facts.filter((f) => f.tag);
          return (
            <li key={m.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-bold">{m.name}{m.id === attendee.id && <span className="font-normal text-muted-foreground"> (you)</span>}</span>
                {tags.map((f) => <Badge key={f.label}>{f.label}</Badge>)}
              </div>
              {facts.filter((f) => !f.tag).map((f) => <div key={f.label} className="text-sm text-muted-foreground">{f.label}: {f.value}</div>)}
            </li>
          );
        })}
      </ul>

      {forms.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-extrabold">Group submissions</h2>
          {forms.map(({ form, group: progress }) => (
            <div key={form.id} className="flex flex-col gap-2 rounded-xl border p-4">
              <Link href={`${base}/activities/${form.id}`} className="font-bold hover:underline">{form.name}</Link>
              <GroupStatus form={form} group={progress!} people={people} selfId={attendee.id} compact />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
```

`loadPortalAttendee` returns `{ event: Event; attendee: Attendee }` (`src/lib/portal.ts:59`), so these props match it.

- [ ] **Step 2: Write `all-groups.tsx`**

Create `src/app/e/[slug]/a/[token]/group/all-groups.tsx`:

```tsx
import { ChevronRight } from "lucide-react";
import { listGroups, groupedAttendees } from "@/lib/db/groups";
import { allGroupCards } from "@/lib/groups";
import { eventFields } from "@/lib/attendee-fields";
import { Badge } from "@/components/ui/badge";
import type { Attendee, Event } from "@/lib/types";

const memberCount = (n: number) => `${n} member${n === 1 ? "" : "s"}`;

/**
 * D511–D513: every group as a card - picture, name, a My group badge on theirs - that opens
 * to its members. Native <details>, so it is server-rendered, works without JavaScript and
 * opens from the keyboard. Other groups show names and tags only (D512).
 */
export async function AllGroups({ event, attendee }: { event: Event; attendee: Attendee }) {
  const [groups, members] = await Promise.all([listGroups(event.id), groupedAttendees(event.id)]);
  const fields = eventFields(event.registration_questions, event.attendee_fields);
  const cards = allGroupCards(groups, members, attendee.group_id, event.group_fields, fields);
  if (cards.length === 0) return <p className="text-sm text-muted-foreground">No groups yet.</p>;

  return (
    <ul className="flex flex-col gap-3">
      {cards.map((c) => (
        <li key={c.id}>
          <details className="group overflow-hidden rounded-[14px] border bg-card">
            <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 pr-4 [&::-webkit-details-marker]:hidden">
              {c.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.imageUrl} alt="" className="aspect-[3/2] w-[45%] shrink-0 object-cover" />
              )}
              <span className={`flex min-w-0 flex-1 flex-col gap-0.5 ${c.imageUrl ? "" : "py-3 pl-4"}`}>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-extrabold">{c.name}</span>
                  {c.mine && <Badge>My group</Badge>}
                </span>
                {!c.imageUrl && <span className="text-sm text-muted-foreground">{memberCount(c.members.length)}</span>}
              </span>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
            </summary>
            {c.members.length === 0 ? (
              <p className="border-t px-4 py-3 text-sm text-muted-foreground">No members yet.</p>
            ) : (
              <ol className="divide-y border-t px-4">
                {c.members.map((m, i) => (
                  <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="w-6 shrink-0 tabular-nums text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {m.name}{m.id === attendee.id && <span className="text-muted-foreground"> (you)</span>}
                    </span>
                    {m.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
                  </li>
                ))}
              </ol>
            )}
          </details>
        </li>
      ))}
    </ul>
  );
}
```

`Badge` has a `secondary` variant (`src/components/ui/badge.tsx:12`).

- [ ] **Step 3: Rewrite `page.tsx`**

Replace `src/app/e/[slug]/a/[token]/group/page.tsx`. The page loads only the open tab's data; the other tab is just its link (spec "Data loading").

```tsx
import { notFound } from "next/navigation";
import { loadPortalAttendee, isUnpublished } from "@/lib/portal";
import { groupTabs, pickGroupTab, GROUP_TAB_LABELS } from "@/lib/groups";
import { PortalTabStrip } from "@/components/portal/PortalTabStrip";
import { PendingScope, PendingSwap, PendingSwipe } from "@/components/PendingNav";
import { Skeleton } from "@/components/ui/skeletons";
import { MyGroup } from "./my-group";
import { AllGroups } from "./all-groups";

export const dynamic = "force-dynamic";

/**
 * D508/D509: the Groups page - My group (D348) and All groups (D511), as tabs in `?tab=`.
 * No tab for this attendee is a 404, the same answer that hides the home tile (D367, D514).
 * With My group alone, the page is exactly today's.
 */
export default async function GroupsPage({ params, searchParams }: {
  params: Promise<{ slug: string; token: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug, token } = await params;
  const { tab } = await searchParams;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  if (isUnpublished(event)) return null;
  const tabs = groupTabs({ tile: event.group_tile, inGroup: !!attendee.group_id, allGroups: event.all_groups });
  const selected = pickGroupTab(tabs, tab);
  if (!selected) notFound();
  const base = `/e/${slug}/a/${token}`;

  if (tabs.length === 1 && selected === "mine") return <MyGroup event={event} attendee={attendee} base={base} titled={false} />;

  const href = (t: string) => `${base}/group?tab=${t}`;
  const at = tabs.indexOf(selected);
  return (
    <>
      <h1 className="mb-3 text-xl font-extrabold">Groups</h1>
      {/* `?tab=` changes no route segment, so no loading.tsx sees it (as on Info, D206). */}
      <PendingScope>
        <div className="flex flex-col gap-4">
          <PortalTabStrip tabs={tabs.map((t) => ({ key: t, href: href(t), label: GROUP_TAB_LABELS[t] }))} selected={selected} />
          <PendingSwipe prevHref={at > 0 ? href(tabs[at - 1]) : null} nextHref={at < tabs.length - 1 ? href(tabs[at + 1]) : null}>
            <PendingSwap fallback={<Skeleton className="h-40 rounded-[14px]" />}>
              {selected === "mine"
                ? <MyGroup event={event} attendee={attendee} base={base} titled />
                : <AllGroups event={event} attendee={attendee} />}
            </PendingSwap>
          </PendingSwipe>
        </div>
      </PendingScope>
    </>
  );
}
```

- [ ] **Step 4: Type-check, lint, test**

Run: `npx tsc --noEmit`, then `npm run lint`, then `npm test`
Expected: no errors and all tests pass.

- [ ] **Step 5: Browser smoke check on ecpkom (the switch is still off)**

- Use the Supabase MCP `execute_sql` to find a grouped attendee's token:

  ```sql
  select a.token, a.name from attendees a join events e on e.id = a.event_id
  where e.slug = 'ecpkom' and a.group_id is not null limit 1;
  ```

- `preview_start {name: "dev"}`, set the size with `resize_window {preset: "mobile"}`, and open `/e/ecpkom/a/<token>/group`.
- Expected: the page looks exactly like today (group name as the heading, no tab bar, no "Groups" heading).
- `read_console_messages {onlyErrors: true}` shows nothing new.
- On the home page `/e/ecpkom/a/<token>`, the tile reads "Groups".

- [ ] **Step 6: Commit**

```bash
git add "src/app/e/[slug]/a/[token]/group"
git commit -m "feat(portal): Groups page with My group and All groups tabs (D509-D513)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Admin (picture per group, the switch, delete removes the picture)

**Files:**
- Modify: `src/app/admin/events/[id]/groups/actions.ts`
- Modify: `src/app/admin/events/[id]/groups/page.tsx:51-58`
- Modify: `src/app/admin/events/[id]/groups/[groupId]/page.tsx`

**Interfaces:**
- Consumes:
  - `setGroupImage` (Task 1) and `Event.all_groups` (Task 1)
  - `nextImage`, `deleteEventImage`, `ImageChange` from `@/lib/db/media`
  - `ImageField` from `@/components/admin/ImageField` (posts `image` as the file and `image_remove=on` to remove)
- Produces: `setGroupImageAction(eventId: string, groupId: string, fd: FormData)`.

- [ ] **Step 1: The actions**

In `src/app/admin/events/[id]/groups/actions.ts`:

1. Add the imports `import { setGroupImage } from "@/lib/db/groups";` (merge into the existing `@/lib/db/groups` import) and `import { nextImage, deleteEventImage, type ImageChange } from "@/lib/db/media";`.
2. Replace `deleteGroupAction` so the picture leaves storage after the row does (D515, in the D160 order):

```ts
export async function deleteGroupAction(eventId: string, groupId: string) {
  const ev = await event(eventId);
  const group = await getGroup(ev.id, groupId);
  if (!group) redirect(flashPath(list(eventId), "That group no longer exists.", "error"));
  await deleteGroup(ev.id, groupId);
  // D515: nothing leaves the bucket until no row names it (D160).
  await deleteEventImage(group.image_url);
  revalidatePath(list(eventId));
  redirect(flashPath(list(eventId), "Group deleted."));
}
```

3. Replace `setGroupTileAction` so the same form saves the switch (D507, D515):

```ts
/** D367: shows or hides Groups on the portal. D507: and whether it has the All groups tab. */
export async function setGroupTileAction(eventId: string, fd: FormData) {
  const ev = await event(eventId);
  const on = fd.get("group_tile") === "on";
  const all = fd.get("all_groups") === "on";
  await updateEvent(ev.id, { group_tile: on, all_groups: all });
  revalidatePath(list(eventId));
  const msg = !on ? "Groups is hidden from the portal." : all ? "Groups is shown, with all groups." : "Groups is shown, with each attendee's own group.";
  redirect(flashPath(list(eventId), msg));
}
```

4. Add after `renameGroupAction`:

```ts
/**
 * D506: the group's picture. Uploaded before the row is written, so a file we will not take
 * leaves the old picture in place; the old object goes only after the row has saved (D160).
 */
export async function setGroupImageAction(eventId: string, groupId: string, fd: FormData) {
  const ev = await event(eventId);
  const group = await getGroup(ev.id, groupId);
  if (!group) redirect(flashPath(list(eventId), "That group no longer exists.", "error"));
  let image: ImageChange = { url: group.image_url, stale: null };
  try {
    image = await nextImage(fd, "image", group.image_url, { orgId: ev.org_id, eventId: ev.id, kind: "group" });
  } catch (e) {
    redirect(flashPath(detail(eventId, groupId), (e as Error).message, "error"));
  }
  await setGroupImage(ev.id, group.id, image.url);
  await deleteEventImage(image.stale);
  revalidatePath(list(eventId));
  revalidatePath(detail(eventId, groupId));
  redirect(flashPath(detail(eventId, groupId), image.url ? "Picture saved." : "Picture removed."));
}
```

- [ ] **Step 2: The settings popup**

In `src/app/admin/events/[id]/groups/page.tsx`, replace lines 51-58 (the comment, `<Modal ...>`, and the tile `<form>`) with:

```tsx
            {/* D362: the Groups button's picture, set here as Agenda's and Info's are on their pages. */}
            <Modal title="Groups tile" hint="The round button attendees tap on the portal home." trigger="Groups tile settings" icon="settings" iconOnly>
              {/* D367/D507: separate form, so changing the switches never re-saves the picture. */}
              <form action={setGroupTileAction.bind(null, ev.id)} className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b p-1 pb-4">
                <div className="flex flex-col">
                  <label className="flex min-h-11 items-center gap-2 text-sm font-bold">
                    <input type="checkbox" name="group_tile" defaultChecked={ev.group_tile} className="size-4 accent-primary" /> Show Groups on the portal
                  </label>
                  <label className="flex min-h-11 items-center gap-2 text-sm font-bold">
                    <input type="checkbox" name="all_groups" defaultChecked={ev.all_groups} className="size-4 accent-primary" /> Show all groups to attendees
                  </label>
                </div>
                <SubmitButton variant="outline">Save</SubmitButton>
              </form>
```

Leave the `SectionIconForm` line and the closing `</Modal>` as they are.

- [ ] **Step 3: The Picture card on the group page**

In `src/app/admin/events/[id]/groups/[groupId]/page.tsx`:

- Add `import { ImageField } from "@/components/admin/ImageField";`.
- Add `setGroupImageAction` to the `../actions` import.
- Insert this card **before** the "Add people" card:

```tsx
      <Card>
        <CardHeader><CardTitle>Picture</CardTitle></CardHeader>
        <CardContent>
          {/* D506: shown on the group's card under All groups. Optional. */}
          <form action={setGroupImageAction.bind(null, ev.id, group.id)} className="flex flex-col items-start gap-3">
            <ImageField key={group.image_url ?? "none"} label="Group picture" name="image" url={group.image_url} description="Landscape, about 3:2 (e.g. 900×600)." />
            <SubmitButton>Save picture</SubmitButton>
          </form>
        </CardContent>
      </Card>
```

`key` resets the field's picked/removing state after a save, the same reason `FieldPicker` is keyed on the list page.

- [ ] **Step 4: Type-check, lint, test**

Run: `npx tsc --noEmit`, then `npm run lint`, then `npm test`
Expected: no errors and all tests pass.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/events/[id]/groups"
git commit -m "feat(groups): admin picture per group and the All groups switch (D506, D507, D515)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: End-to-end check on ecpkom, then put ecpkom back

**Files:** none. This task is verification; any fix it finds goes back into the task that owns the code, as its own commit.

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: the build succeeds.

- [ ] **Step 2: Gather test data (read-only)**

Run with Supabase `execute_sql`:

```sql
select e.id as event_id, e.group_tile, e.all_groups from events e where e.slug = 'ecpkom';
select a.token, a.name, g.name as group_name from attendees a
  left join event_groups g on g.id = a.group_id
  join events e on e.id = a.event_id
where e.slug = 'ecpkom' and (a.group_id is not null or a.name ilike '%test%') limit 10;
```

You need one grouped attendee and one ungrouped attendee. If ecpkom has no ungrouped attendee, use the admin group page's ⋯ → Remove from group on a test attendee such as "Tan Wei Jie" (ecpkom only), and put them back at the end.

- [ ] **Step 3: Admin checks** (dev server, signed-in admin in the browser pane, ecpkom only)

1. Open `/admin/events/<ecpkom id>/groups` and open the settings popup. It is titled "Groups tile" and shows both checkboxes. Tick "Show all groups to attendees" and Save. The flash reads "Groups is shown, with all groups."
2. Open a test group. Upload a picture in the Picture card and Save: the flash reads "Picture saved." and the thumbnail shows. Then:
   - upload a different picture: the old one is replaced;
   - pick a non-image file: there is a clear error, and the old picture stays;
   - Remove and Save: "Picture removed."
   - Upload a picture again, for the portal check.

   If the browser pane can't attach files, try the Playwright `browser_file_upload` tool. If neither can, set `image_url` with SQL on one ecpkom group to an existing public media URL from that event, and **report the upload path as unverified**.

- [ ] **Step 4: Portal checks** at `resize_window {preset: "mobile"}`

1. **Grouped attendee, `/e/ecpkom/a/<token>`:** the tile reads "Groups".
2. **The same attendee, `/group`:**
   - A "Groups" heading and two tabs, with My group open.
   - My group shows the same content as before, including table numbers and the Captain badge.
3. **The All groups tab:**
   - Their group is first, with a "My group" badge.
   - The group with a picture shows it at 3:2 on the left.
   - Groups without one show a name and member count.
   - Tapping a card opens a numbered member list, with Captain/Vice badges on the right people.
   - No table numbers appear on any card (check with `get_page_text`).
   - Long names truncate, and nothing scrolls sideways at 375px.
4. **`?tab=xyz`** opens My group.
5. **Ungrouped attendee:**
   - The tile shows.
   - `/group` shows the "Groups" heading and no tab bar, and the cards have no "My group" badge.
   - `?tab=mine` falls back to All groups.
6. **Switch off** (popup, untick, Save):
   - The ungrouped attendee has no tile, and `/group` 404s.
   - The grouped attendee sees today's page with no tab bar.
7. **Tile off with the switch on:** both attendees have no tile and `/group` 404s. Afterwards turn the tile back on.
8. `read_console_messages {onlyErrors: true}` shows nothing new on any page.

- [ ] **Step 5: Put ecpkom back**

- Set ecpkom's switch back to off: `all_groups = false`, with the tile on as it was.
- Undo any group membership change from Step 2.
- Leave the test picture on the ecpkom test group. It's test data; mention it in the hand-off.
- Take a final phone-width screenshot of the All groups tab, taken before switching it off, as proof for the hand-off.

- [ ] **Step 6: Commit any fixes**

If Steps 3–4 needed code fixes, commit each with the owning task's scope and a `fix(groups): ...` or `fix(portal): ...` message ending in the Co-Authored-By trailer. Do not push. Pushing to `origin/main` deploys and is the user's call.
