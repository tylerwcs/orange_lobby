# Activity Kinds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fourth activity kind would fail to compile until every place that needs it handles
it. Kind labels and icons get one source, and the activity logic starts living in
`src/features/activities/`.

**Architecture:** D404 is implemented by **exhaustive dispatch**:
- `Record<ActivityKind, …>` maps, plus `switch` statements whose `default` assigns to `never`.
  This replaces every `if/else` where one kind was the silent fall-through.
- The kind-keyed portal entry map (`ActivityEntries`) carries a compile-time check that its keys
  equal `ActivityKind`.
- The pure activity logic (tabs, list rows, portal cards) moves into `src/features/activities/`.
  That move is its own commit with no behaviour change (D407).

**Tech Stack:** Next.js 16 (App Router, server components), TypeScript strict, Vitest 5, ESLint
(the D403 `no-restricted-imports` rule).

**Spec:** `docs/superpowers/specs/2026-10-07-modular-features-design.md` (D402–D408)

## Global Constraints

- Work on `main`, not a worktree (memory: works-on-main). Pull with `git pull --rebase --autostash`
  before each commit, because other sessions push to main.
- **Never test against the event with slug `ecphub`.** It is live. Use `ecpkom`. It has 3
  submission activities and 1 passport. For the booking check, add a booking activity named
  `ZZ Kinds check` and delete it afterwards.
- No behaviour change anywhere. Every existing test keeps its assertions, and only import paths
  and entry-key names change in them.
- Code outside `src/features/activities/` imports it only as `@/features/activities` or
  `@/features/activities/client` (D403 lint rule). Files inside it use relative imports.
- The exhaustiveness idiom already used in `src/lib/attendee-fields.ts:261`:
  `default: { const exhaustive: never = x; throw new Error(\`Unhandled activity kind: ${String(exhaustive)}\`); }`
- New decisions: D414 (the first slice of the activities feature, and exhaustive dispatch instead
  of a component registry), D415 (`KIND_META` is the only source of kind labels and icons), D416
  (portal entries keyed by kind, with card order by section, then kind).
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Checks after every task: `npx tsc --noEmit -p .`, `npx eslint`, `npm test`. All three must
  pass.

### Deviation from the spec's D404 sketch (record as D414)

The spec sketched one `ActivityKindDef` object per kind, holding React components too
(`AdminDetail`, `PortalBody`). The real pages pass each kind different props, from data loaded
differently per kind. Forcing them through one uniform component signature would mean rewriting
three working detail pages. The spec's actual goal is "a missing kind is a compile error, and
labels come from one place". This plan meets it with exhaustive maps and switches. The kinds'
screens stay in their pages for now, and move into `src/features/activities/kinds/<kind>/` under
D407 the next time each is worked on.

## File map

| File | Change |
|---|---|
| `src/features/activities/tabs.ts` | moved from `src/lib/activity-tabs.ts`; `activityTabs` becomes a `Record` |
| `src/features/activities/row.ts` | moved from `src/lib/activity-row.ts`; `removeWarning` becomes a switch; labels from `KIND_META` |
| `src/features/activities/cards.ts` | moved from `src/lib/activity-cards.ts`; takes `ActivityEntries`; adds `findEntry` |
| `src/features/activities/kinds.ts` | new: `ACTIVITY_KINDS`, `KIND_META` |
| `src/features/activities/client.ts` | new: the client-safe entry, re-exporting the four files above |
| `src/features/activities/index.ts` | new: the server entry, `export * from "./client"` |
| `src/lib/portal-activity-entries.ts` | returns `{ booking, submission, passport, people }`; `EntryMap`, `ActivityEntries` |
| `src/components/portal/ActivityParts.tsx` | `KIND_LABELS` → `KIND_META` |
| `src/components/admin/ActivityRows.tsx` | `KIND_ICONS` → `KIND_META` |
| `src/components/admin/NewActivityMenu.tsx` | local `Kind`/`KINDS` → `ActivityKind`/`KIND_META` |
| `src/components/admin/ActivityTabs.tsx`, `src/components/portal/HomeActivities.tsx` | import path only |
| `src/components/portal/ActivitiesTab.tsx` | takes `entries: ActivityEntries` |
| `src/app/admin/events/[id]/activities/page.tsx` | `listItem` becomes a switch |
| `src/app/admin/events/[id]/activities/[activityId]/page.tsx` | detail dispatch becomes a switch; import path |
| `src/app/admin/events/[id]/activities/[activityId]/PassportDetail.tsx`, `.../activities/actions.ts` | import path only |
| `src/app/e/[slug]/a/[token]/activities/page.tsx`, `.../page.tsx` (home), `.../group/page.tsx` | entry keys |
| `src/app/e/[slug]/a/[token]/activities/[activityId]/page.tsx` | `findEntry` + exhaustive switch |
| `tests/activity-tabs.test.ts`, `tests/activity-row.test.ts`, `tests/activity-cards.test.ts` | import path; entry keys |
| `tests/activity-kinds.test.ts` | new |

---

### Task 1: Move tabs, rows and cards into `src/features/activities/` (no behaviour change)

**Files:**
- Move: `src/lib/activity-tabs.ts` → `src/features/activities/tabs.ts`
- Move: `src/lib/activity-row.ts` → `src/features/activities/row.ts`
- Move: `src/lib/activity-cards.ts` → `src/features/activities/cards.ts`
- Create: `src/features/activities/client.ts`, `src/features/activities/index.ts`
- Modify (import path only): `src/app/admin/events/[id]/activities/actions.ts:32`, `src/app/admin/events/[id]/activities/page.tsx:15`, `src/app/admin/events/[id]/activities/[activityId]/page.tsx:11,24`, `src/app/admin/events/[id]/activities/[activityId]/PassportDetail.tsx:18`, `src/app/e/[slug]/a/[token]/page.tsx:4`, `src/components/admin/ActivityRows.tsx:5`, `src/components/admin/ActivityTabs.tsx:2`, `src/components/portal/ActivitiesTab.tsx:2`, `src/components/portal/HomeActivities.tsx:2`, `tests/activity-cards.test.ts:4`, `tests/activity-row.test.ts:2`, `tests/activity-tabs.test.ts:2`

**Interfaces:**
- Produces: `@/features/activities` and `@/features/activities/client` export everything the
  three old modules exported, under the same names (`activityTabs`, `resolveTab`,
  `activityHref`, `ActivityTab`, `TabItem`, `TabCounts`, `bookingRow`, `submissionRow`,
  `passportRow`, `listSummary`, `removeWarning`, `ActivityRowView`, `RowProgress`,
  `activityCards`, `ActivityCardItem`, `CardSection`).

- [ ] **Step 1: Move the files with git, so history follows them**

```bash
mkdir -p src/features/activities
git mv src/lib/activity-tabs.ts src/features/activities/tabs.ts
git mv src/lib/activity-row.ts src/features/activities/row.ts
git mv src/lib/activity-cards.ts src/features/activities/cards.ts
```

- [ ] **Step 2: Create the two entries**

`src/features/activities/client.ts`:
```ts
/**
 * The activities feature's client-safe entry (D402, D403): everything here is pure and runs in
 * the browser as well as on the server. Code outside this folder imports the feature only
 * from here or from `index.ts`.
 */
export * from "./tabs";
export * from "./row";
export * from "./cards";
```

`src/features/activities/index.ts`:
```ts
/** The activities feature's server entry (D402). Nothing server-only lives here yet. */
export * from "./client";
```

- [ ] **Step 3: Point every importer at the entry**

In each file listed under **Modify** above, replace the import source string only:
- `"@/lib/activity-tabs"` → `"@/features/activities"`
- `"@/lib/activity-row"` → `"@/features/activities"`
- `"@/lib/activity-cards"` → `"@/features/activities"`

There is one exception. In `"use client"` files, use `"@/features/activities/client"`. Check
each file's first line. The bundler does not care, but it tells the next reader that the file is
browser code.

Inside the moved files, the imports of `@/lib/...` (for example `cards.ts` importing
`@/lib/portal-activities`) stay as they are, because the shared core is allowed (D402).

- [ ] **Step 4: Check that nothing still points at the old paths**

Run: `grep -rn "@/lib/activity-tabs\|@/lib/activity-row\|@/lib/activity-cards" src tests`
Expected: no output.

- [ ] **Step 5: Run the checks**

Run: `npx tsc --noEmit -p . && npx eslint && npm test`
Expected: tsc exits 0, eslint reports 0 errors, vitest passes every file.

- [ ] **Step 6: Commit**

```bash
git add -A src/features/activities src/lib src/app src/components tests
git commit -m "refactor(activities): move tabs, rows and cards into src/features/activities (D414)

No behaviour change. The first slice of the activities feature (D402); importers use its entry.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: One source for kind labels and icons (`KIND_META`)

**Files:**
- Create: `src/features/activities/kinds.ts`
- Modify: `src/features/activities/client.ts` (export kinds)
- Modify: `src/features/activities/row.ts` (`kind` labels)
- Modify: `src/components/portal/ActivityParts.tsx:21-30`
- Modify: `src/components/admin/ActivityRows.tsx:93-101`
- Modify: `src/components/admin/NewActivityMenu.tsx:1-30`
- Test: `tests/activity-kinds.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const ACTIVITY_KINDS: readonly ActivityKind[]   // ["booking", "submission", "passport"]
  export type KindMeta = { label: string; icon: LucideIcon; what: string; title: string; hint: string };
  export const KIND_META: Record<ActivityKind, KindMeta>;
  ```

- [ ] **Step 1: Write the failing test**

`tests/activity-kinds.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { ACTIVITY_KINDS, KIND_META } from "@/features/activities";

describe("KIND_META (D415)", () => {
  it("lists every kind once, in the order the menu and the portal use", () => {
    expect(ACTIVITY_KINDS).toEqual(["booking", "submission", "passport"]);
    expect(Object.keys(KIND_META).sort()).toEqual([...ACTIVITY_KINDS].sort());
  });

  it("keeps the words attendees and organisers already see", () => {
    expect(ACTIVITY_KINDS.map((k) => KIND_META[k].label)).toEqual(["Sessions", "Submission", "Passport"]);
    expect(KIND_META.passport.title).toBe("Add a booth passport");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/activity-kinds.test.ts`
Expected: FAIL, because `ACTIVITY_KINDS` is not exported.

- [ ] **Step 3: Create `src/features/activities/kinds.ts`**

```ts
import { CalendarClock, FileText, Stamp, type LucideIcon } from "lucide-react";
import type { ActivityKind } from "@/lib/types";

/**
 * Every activity kind, in the order the New activity menu offers them and the portal lists
 * them within a section (D415, D416). A kind added to `ActivityKind` must be added here: the
 * check below stops the build until it is.
 */
export const ACTIVITY_KINDS = ["booking", "submission", "passport"] as const satisfies readonly ActivityKind[];

type Covers = [ActivityKind] extends [(typeof ACTIVITY_KINDS)[number]] ? true : never;
const covers: Covers = true;
void covers;

export type KindMeta = {
  /** What the kind is called on the list row, the portal's tag and the New activity menu. */
  label: string;
  icon: LucideIcon;
  /** The New activity menu's one line on what it is for. */
  what: string;
  /** The add dialog's title and hint. */
  title: string;
  hint: string;
};

/** The one place a kind's name, icon and menu copy live (D415). */
export const KIND_META: Record<ActivityKind, KindMeta> = {
  booking: { label: "Sessions", icon: CalendarClock, what: "Attendees book a seat at a time", title: "Add a booking activity", hint: "Add its sessions once it exists." },
  submission: { label: "Submission", icon: FileText, what: "Attendees send you answers", title: "Add a submission activity", hint: "Add its questions now, or come back and edit them later." },
  passport: { label: "Passport", icon: Stamp, what: "Booths stamp a card", title: "Add a booth passport", hint: "Add its booths once it exists. Each booth gets a scanner link to print." },
};
```

Add to `src/features/activities/client.ts`:
```ts
export * from "./kinds";
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/activity-kinds.test.ts`
Expected: PASS.

- [ ] **Step 5: Replace the copies**

1. `src/components/portal/ActivityParts.tsx`: delete the `KIND_LABELS` const (line 21) and
   render `{KIND_META[kind].label}` in `KindTag`. Add
   `import { KIND_META } from "@/features/activities/client";`.
2. `src/components/admin/ActivityRows.tsx`: delete the `KIND_ICONS` const (line 93). In
   `ActivityThumb`, use `const Icon = KIND_META[activity.kind].icon;`. Remove `CalendarClock`,
   `FileText` and `Stamp` from the lucide import if nothing else in the file uses them (check
   with grep). Add `KIND_META` to the existing `@/features/activities/client` import.
3. `src/components/admin/NewActivityMenu.tsx`: delete `type Kind` and the `KINDS` array (lines
   11–16). Then:
   - Change the props to `forms: Record<ActivityKind, React.ReactNode>`.
   - Change the state to `useState<ActivityKind | null>(null)`.
   - Use `const current = which ? { kind: which, ...KIND_META[which] } : null;`.
   - Render the menu with
     `ACTIVITY_KINDS.map((kind) => { const { icon: Icon, label, what } = KIND_META[kind]; return (<DropdownMenuItem key={kind} ...>); })`,
     keeping the item's markup exactly as it is.
   - Remove `CalendarClock`, `FileText` and `Stamp` from its lucide import.
   - Add `import { ACTIVITY_KINDS, KIND_META } from "@/features/activities/client";` and
     `import type { ActivityKind } from "@/lib/types";`.
4. `src/features/activities/row.ts`:
   - Change the `ActivityRowView` field to `kind: string;`, and update its doc comment to say
     the label comes from `KIND_META`.
   - In `bookingRow`, `submissionRow` (both returns) and `passportRow`, replace the literals
     with `KIND_META.booking.label`, `KIND_META.submission.label` and
     `KIND_META.passport.label`.
   - Add `import { KIND_META } from "./kinds";`.

- [ ] **Step 6: Check that no copy is left**

Run: `grep -rn "\"Sessions\" | \"Submission\"\|KIND_LABELS\|KIND_ICONS\|type Kind = " src`
Expected: no output.

- [ ] **Step 7: Run the checks**

Run: `npx tsc --noEmit -p . && npx eslint && npm test`
Expected: all pass. `tests/activity-row.test.ts` still expects `kind: "Sessions"` and friends,
and still passes.

- [ ] **Step 8: Commit**

```bash
git add src/features/activities src/components tests/activity-kinds.test.ts
git commit -m "refactor(activities): one source for kind labels, icons and menu copy (D415)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Exhaustive dispatch on the admin side

**Files:**
- Modify: `src/features/activities/tabs.ts` (`activityTabs`)
- Modify: `src/features/activities/row.ts` (`removeWarning`)
- Modify: `src/app/admin/events/[id]/activities/page.tsx` (`listItem`)
- Modify: `src/app/admin/events/[id]/activities/[activityId]/page.tsx:80-82`
- Test: `tests/activity-kinds.test.ts`, existing `tests/activity-tabs.test.ts`, `tests/activity-row.test.ts`

**Interfaces:**
- Consumes: `ActivityKind` from `@/lib/types`.
- Produces: unchanged signatures, `activityTabs(kind: ActivityKind, c: TabCounts): TabItem[]`
  and `removeWarning(input)`.

- [ ] **Step 1: Add a test that pins passport's tabs**

Append to `tests/activity-kinds.test.ts`:
```ts
import { activityTabs } from "@/features/activities";

describe("activityTabs per kind (D414)", () => {
  it("gives a passport its Setup tab only, by its own entry rather than a fall-through", () => {
    expect(activityTabs("passport", {}).map((t) => t.tab)).toEqual(["setup"]);
  });
});
```
(Move the new import to the top of the file, beside the first one.)

Run: `npx vitest run tests/activity-kinds.test.ts`
Expected: PASS. This test guards the refactor rather than driving it.

- [ ] **Step 2: `activityTabs` as a `Record`**

In `src/features/activities/tabs.ts`, replace the body of `activityTabs` with:

```ts
/** One entry per kind (D414): a kind added to ActivityKind does not build until it has its tabs. */
const TABS: Record<ActivityKind, (c: TabCounts) => TabItem[]> = {
  // The dot, because pending requests left the landing view when Setup became it (D235).
  booking: (c) => [setup(), item("bookings", "Bookings", c.booked ?? 0, (c.pendingRequests ?? 0) > 0), item("not-booked", "Not booked", c.notBooked ?? 0)],
  submission: (c) => {
    const tabs = [setup(), item("submissions", "Submissions", c.submissions ?? 0), item("not-submitted", c.grouped ? "Not done" : "Not submitted", c.notSubmitted ?? 0)];
    if (c.grouped) return tabs;
    const withDaily = c.perDay ? [...tabs, item("participation", "Participation")] : tabs;
    return c.scored ? [...withDaily, item("leaderboard", "Leaderboard")] : withDaily;
  },
  // A passport's booths and links are all on Setup (D190).
  passport: () => [setup()],
};

export function activityTabs(kind: ActivityKind, c: TabCounts): TabItem[] {
  return TABS[kind](c);
}
```
Add `const setup = () => item("setup", "Setup");` directly under the `item` helper.

- [ ] **Step 3: `removeWarning` as a switch**

In `src/features/activities/row.ts`, replace the body of `removeWarning` with:

```ts
  switch (input.kind) {
    // Cascades sessions and bookings (D135): the organiser is cancelling people's afternoons.
    case "booking":
      return `Its ${plural(input.sessions, "session")} and ${plural(input.bookings, "booking")} go with it. This can't be undone.`;
    case "submission":
      return `${input.submissions > 0 ? `It takes ${plural(input.submissions, "submission")} and any uploaded files with it. ` : ""}This can't be undone.`;
    // Refused by the database once anyone is stamped (D188), so it says what to do instead.
    case "passport": {
      const links = input.booths === 1 ? "its scanner link" : "their scanner links";
      return `Its ${plural(input.booths, "booth")} and ${links} go with it. Once anyone has been stamped it can't be deleted, so close it instead.`;
    }
    default: {
      const exhaustive: never = input;
      throw new Error(`Unhandled activity kind: ${String((exhaustive as { kind: string }).kind)}`);
    }
  }
```

- [ ] **Step 4: `listItem` as a switch**

In `src/app/admin/events/[id]/activities/page.tsx`, restructure `listItem` so that:
- The three branches become `case "booking": { … }`, `case "submission": { … }` and
  `case "passport": { … }` of `switch (a.kind)`. Each case body is the existing branch body,
  unchanged.
- The switch ends with:
  ```ts
      default: {
        const exhaustive: never = a.kind;
        throw new Error(`Unhandled activity kind: ${String(exhaustive)}`);
      }
  ```

Update the function's doc comment: "What differs by kind is decided here and nowhere else, in
one case per kind (D414)".

- [ ] **Step 5: The admin detail page dispatch as a switch**

In `src/app/admin/events/[id]/activities/[activityId]/page.tsx`, replace lines 80–82 with:

```tsx
  switch (activity.kind) {
    case "booking": return <BookingDetail ev={ev} activity={activity} tab={tab} />;
    case "submission": return <SubmissionDetail ev={ev} activity={activity} requestedDay={requestedDay} tab={tab} week={week} teamId={team} />;
    case "passport": return <PassportDetail ev={ev} activity={activity} qr={qr} />;
    default: {
      const exhaustive: never = activity.kind;
      throw new Error(`Unhandled activity kind: ${String(exhaustive)}`);
    }
  }
```

- [ ] **Step 6: Prove the guard works, then undo it**

Temporarily change `src/lib/types.ts:231` to
`export type ActivityKind = "booking" | "submission" | "passport" | "raffle";`
Run: `npx tsc --noEmit -p . 2>&1 | grep -c "error TS"`
Expected: a number above 0. The errors should point at `kinds.ts` (`covers`, `KIND_META`),
`tabs.ts` (`TABS`), `page.tsx` (both switches), and `ActivityParts`/`ActivityRows` via
`KIND_META`. Note the files it names in the commit message. Then revert the change:
`git checkout src/lib/types.ts`.

- [ ] **Step 7: Run the checks**

Run: `npx tsc --noEmit -p . && npx eslint && npm test`
Expected: all pass, and `tests/activity-tabs.test.ts` and `tests/activity-row.test.ts` are
unchanged and green.

- [ ] **Step 8: Commit**

```bash
git add src/features/activities "src/app/admin/events/[id]/activities" tests/activity-kinds.test.ts
git commit -m "refactor(activities): every admin branch on kind is exhaustive (D414)

Tabs, the delete warning, the list row and the detail page each name all three kinds; a
fourth kind does not build until each one handles it (checked by adding one: <files tsc named>).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Portal entries keyed by kind, cards and the detail page exhaustive

**Files:**
- Modify: `src/lib/portal-activity-entries.ts` (types, return keys)
- Modify: `src/features/activities/cards.ts` (`activityCards`, new `findEntry`)
- Modify: `src/components/portal/ActivitiesTab.tsx`
- Modify: `src/app/e/[slug]/a/[token]/activities/page.tsx`
- Modify: `src/app/e/[slug]/a/[token]/activities/[activityId]/page.tsx:74-102`
- Modify: `src/app/e/[slug]/a/[token]/group/page.tsx:24-31`
- Test: `tests/activity-cards.test.ts`, `tests/activity-kinds.test.ts`

**Interfaces:**
- Produces, in `src/lib/portal-activity-entries.ts`:
  ```ts
  export type EntryMap = { booking: ActivityEntry; submission: SubmissionEntry; passport: PassportEntry };
  export type ActivityEntries = { [K in keyof EntryMap]: EntryMap[K][] };
  // loadActivityEntries(...): Promise<ActivityEntries & { people: Record<string, { name: string; movedTo: string | null }> }>
  ```
- Produces, in `src/features/activities/cards.ts`:
  ```ts
  export type FoundEntry = { [K in ActivityKind]: { kind: K; entry: EntryMap[K]; activity: Activity } }[ActivityKind];
  export function findEntry(entries: ActivityEntries, activityId: string): FoundEntry | null;
  export function activityCards(entries: ActivityEntries, basePath: string): ActivityCardItem[];   // unchanged output
  ```

- [ ] **Step 1: Update `tests/activity-cards.test.ts` to the new keys, and add `findEntry` tests**

In every `activityCards({ … })` call in `tests/activity-cards.test.ts`, rename the keys
`bookings:` → `booking:`, `submissions:` → `submission:` and `passports:` → `passport:`. Change
nothing else.

Append to `tests/activity-kinds.test.ts`. The `booking`, `form` and `passport` fixture builders
are copied from `tests/activity-cards.test.ts` lines 1–30. Copy that file's imports and helper
functions verbatim to the top of this file.

```ts
import { findEntry } from "@/features/activities";

describe("findEntry (D416)", () => {
  const entries = {
    booking: [booking("b"), booking("vip", { categories: ["VIP"] }, false, "Guest")],
    submission: [form("f")],
    passport: [passport("p", false)],
  };

  it("finds each kind's entry with its kind and activity", () => {
    expect(findEntry(entries, "b")).toMatchObject({ kind: "booking", activity: { id: "b" } });
    expect(findEntry(entries, "f")).toMatchObject({ kind: "submission", activity: { id: "f" } });
    expect(findEntry(entries, "p")).toMatchObject({ kind: "passport", activity: { id: "p" } });
  });

  it("does not find a booking the attendee's category cannot see, or an unknown id", () => {
    expect(findEntry(entries, "vip")).toBeNull();
    expect(findEntry(entries, "nope")).toBeNull();
  });
});
```

Run: `npx vitest run tests/activity-cards.test.ts tests/activity-kinds.test.ts`
Expected: FAIL, because `findEntry` is not exported and the keys don't match the type.

- [ ] **Step 2: Key the entries by kind**

In `src/lib/portal-activity-entries.ts`:
- After the three entry types, add:
  ```ts
  /** Each kind's portal entry (D416). Its keys must be exactly ActivityKind: the check below fails the build otherwise. */
  export type EntryMap = { booking: ActivityEntry; submission: SubmissionEntry; passport: PassportEntry };
  export type ActivityEntries = { [K in keyof EntryMap]: EntryMap[K][] };
  type Covers = [ActivityKind] extends [keyof EntryMap] ? ([keyof EntryMap] extends [ActivityKind] ? true : never) : never;
  const covers: Covers = true;
  void covers;
  ```
  Add `ActivityKind` to the `@/lib/types` type import.
- Change the return type of `loadActivityEntries` to
  `Promise<ActivityEntries & { people: Record<string, { name: string; movedTo: string | null }> }>`.
- Change its last line to `return { booking: bookings, submission: forms, passport: passports, people };`.

- [ ] **Step 3: `activityCards` per kind, ordered by section, then kind**

In `src/features/activities/cards.ts`, replace `activityCards` with the following. The output
is identical to today's: sorting the per-kind lists by section, using a stable sort, gives
exactly the old interleaving, because forms are only ever "open" and kinds are concatenated in
`ACTIVITY_KINDS` order.

```ts
const SECTION_ORDER: readonly ActivitySection[] = ["choose", "booked", "open", "done"];

export function activityCards(entries: ActivityEntries, basePath: string): ActivityCardItem[] {
  const href = (a: Activity) => `${basePath}/activities/${a.id}`;

  /** One card builder per kind (D416): a kind added to ActivityKind does not build until it has one. */
  const cardsFor: { [K in ActivityKind]: (list: ActivityEntries[K]) => ActivityCardItem[] } = {
    booking: (list) => list.flatMap((entry) => {
      const pending = entry.controls.pending !== null;
      const checkedIn = allCheckedIn(entry);
      const section = bookingSection(entry.state, pending, checkedIn);
      if (!section) return [];
      const activity = entry.state.activity;
      return [{ activity, view: bookingCard({ state: entry.state, pending, checkedIn }), href: href(activity), emphasis: section === "choose", section }];
    }),
    // Only "ineligible" hides a form here; a closed one never arrives (D384, `shownToAttendees`).
    submission: (list) => list
      .filter((s) => s.state.reason !== "ineligible")
      .map(({ form, state }) => ({ activity: form, view: formCard({ form, state }), href: href(form), emphasis: false, section: "open" as const })),
    passport: (list) => list.map(({ activity, passport }) => ({
      activity, view: passportCard({ passport, open: activity.is_open }), href: href(activity), emphasis: false, section: passportSection(passport),
    })),
  };
  const cardsOf = <K extends ActivityKind>(kind: K) => cardsFor[kind](entries[kind]);

  // Kinds in ACTIVITY_KINDS order, then a stable sort by section: within a section, bookings,
  // then forms, then passports, as the tab has always listed them.
  const rank = (s: CardSection) => SECTION_ORDER.indexOf(s as ActivitySection);
  const ordered = ACTIVITY_KINDS.flatMap((k) => cardsOf(k)).sort((a, b) => rank(a.section) - rank(b.section));
  const pinned = ordered.filter((c) => c.activity.pinned)
    .sort((a, b) => a.activity.sort_order - b.activity.sort_order)
    .map((c) => ({ ...c, section: "pinned" as const }));
  return [...pinned, ...ordered.filter((c) => !c.activity.pinned)];
}

/** The card behind one activity page, with its kind, for an exhaustive switch over what to draw (D416). */
export type FoundEntry = { [K in ActivityKind]: { kind: K; entry: EntryMap[K]; activity: Activity } }[ActivityKind];

export function findEntry(entries: ActivityEntries, activityId: string): FoundEntry | null {
  const finders: { [K in ActivityKind]: (list: ActivityEntries[K]) => { entry: EntryMap[K]; activity: Activity } | null } = {
    // An ineligible booking has no page, as before.
    booking: (list) => { const e = list.find((b) => b.state.activity.id === activityId && b.state.eligible); return e ? { entry: e, activity: e.state.activity } : null; },
    submission: (list) => { const e = list.find((s) => s.form.id === activityId); return e ? { entry: e, activity: e.form } : null; },
    passport: (list) => { const e = list.find((p) => p.activity.id === activityId); return e ? { entry: e, activity: e.activity } : null; },
  };
  for (const kind of ACTIVITY_KINDS) {
    const hit = finders[kind](entries[kind] as never);
    if (hit) return { kind, ...hit } as FoundEntry;
  }
  return null;
}
```

Update the imports at the top of `cards.ts`:
```ts
import { bookingSection, passportSection, type ActivitySection } from "@/lib/portal-activities";
import { bookingCard, formCard, passportCard, type CardView } from "@/lib/activity-card";
import { allCheckedIn } from "@/lib/booking-door";
import type { ActivityEntries, EntryMap } from "@/lib/portal-activity-entries";
import type { Activity, ActivityKind } from "@/lib/types";
import { ACTIVITY_KINDS } from "./kinds";
```

Update the doc comment above `activityCards`. Keep its wording, and add: "Each kind builds its
own cards (D416); the order is section first, then kind."

- [ ] **Step 4: Run the card tests**

Run: `npx vitest run tests/activity-cards.test.ts tests/activity-kinds.test.ts`
Expected: PASS. Every existing ordering assertion in `activity-cards.test.ts` holds unchanged.

- [ ] **Step 5: Update the callers**

1. `src/components/portal/ActivitiesTab.tsx`:
   - Change the props to `{ entries: ActivityEntries; basePath: string }`.
   - Use `const cards = activityCards(entries, basePath);`.
   - Change the type import to `import type { ActivityEntries } from "@/lib/portal-activity-entries";`.
   - Update the doc comment's kind list to "`bookingCard`, `formCard` and `passportCard`, one per kind".
2. `src/app/e/[slug]/a/[token]/activities/page.tsx`: use `const entries = await loadActivityEntries(event, attendee);` and `<ActivitiesTab entries={entries} basePath={…} />`.
3. `src/app/e/[slug]/a/[token]/group/page.tsx:27`: destructure `{ submission: submissions, people }`. The rest of the file keeps using `submissions`.
4. `src/app/e/[slug]/a/[token]/page.tsx:101` passes the whole result to `activityCards`, so it needs no change. Confirm that it compiles.
5. `src/app/e/[slug]/a/[token]/activities/[activityId]/page.tsx`: replace lines 74–79 and the body ternary (lines 88–101) with:

```tsx
  const entries = await loadActivityEntries(event, attendee);
  const basePath = `/e/${slug}/a/${token}`;
  const found = findEntry(entries, activityId);
  if (!found) notFound();
  const { activity } = found;
  const proxy = found.kind === "submission" ? await proxyFor(found.entry.form, attendee) : null;

  return (
    <div className="flex flex-col">
      <Link href={`${basePath}/activities`} className="mb-3 inline-flex items-center gap-1.5 self-start text-sm font-bold text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />Activities
      </Link>
      <ActivityCover activity={activity} variant="hero" />
      <h1 className="py-4 text-xl font-extrabold leading-tight">{activity.name}</h1>
      <Body found={found} />
    </div>
  );

  // One case per kind (D416): a kind added to ActivityKind does not build until it has a body here.
  function Body({ found }: { found: FoundEntry }) {
    switch (found.kind) {
      case "booking":
        return <BookingBody entry={found.entry} slug={slug} token={token} />;
      case "submission": {
        const form = found.entry;
        return form.form.scoring
          ? <TrackerBody entry={form} slug={slug} token={token} attendeeId={attendee.id} teamId={attendee.group_id} eventStartsOn={event.starts_on} edit={editorFor(form.form, slug, token, attendee)} proxy={proxy}
              day={typeof day === "string" ? day : null} writing={writing === "1"}
              // An old `?new=1` link opens the add dialog, which lives on My stats (D385).
              tab={writing === "1" ? "stats" : trackerTab(typeof tab === "string" ? tab : undefined, form.form.show_leaderboard)} />
          : <SubmissionBody entry={form} slug={slug} token={token} writing={writing === "1"} people={entries.people} selfId={attendee.id} edit={editorFor(form.form, slug, token, attendee)} proxy={proxy} />;
      }
      case "passport":
        return <PassportBody entry={found.entry} attendeeName={attendee.name} />;
      default: {
        const exhaustive: never = found;
        throw new Error(`Unhandled activity kind: ${String((exhaustive as { kind: string }).kind)}`);
      }
    }
  }
```

Update the imports:
- `import { loadActivityEntries, type ActivityEntry, type SubmissionEntry, type PassportEntry } from "@/lib/portal-activity-entries";` stays, because the body components use those types.
- Add `import { findEntry, type FoundEntry } from "@/features/activities";`.

Note: `Body` is declared inside the page function so that it closes over `slug`, `token`,
`attendee`, `event`, `day`, `tab`, `writing`, `proxy` and `entries`. If the linter's
`react/no-unstable-nested-components` rule objects, change it to a plain function call,
`{body(found)}`, with a lowercase `function body(found: FoundEntry): React.ReactNode`, keeping
the same switch.

- [ ] **Step 6: Prove the guard works, then undo it**

As in Task 3 Step 6, add `| "raffle"` to `ActivityKind`, run `npx tsc --noEmit -p .`, and
confirm that errors now also name `portal-activity-entries.ts` (`covers`), `cards.ts`
(`cardsFor`, `finders`) and the portal detail page's switch. Then run `git checkout src/lib/types.ts`.

- [ ] **Step 7: Run the checks**

Run: `npx tsc --noEmit -p . && npx eslint && npm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/portal-activity-entries.ts src/features/activities src/components/portal/ActivitiesTab.tsx "src/app/e/[slug]/a/[token]" tests
git commit -m "refactor(activities): portal entries keyed by kind; cards and the activity page exhaustive (D416)

A fourth kind could no longer vanish from the portal or 404 its own page: loadActivityEntries,
the card builders and the page each have to name it before the app builds.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Check in the browser, then record the decisions

**Files:**
- Modify: `docs/superpowers/specs/2026-10-07-modular-features-design.md` (D404 status, D414–D416)

- [ ] **Step 1: Set up a booking on the test event**

On `ecpkom` only, in Admin → Activities → New activity → Sessions, add `ZZ Kinds check` with one
session and **Open for booking now** ticked.

- [ ] **Step 2: Admin checks (preview_start `dev`, then sign in as the user's session)**

On `/admin/events/<ecpkom id>/activities`:
- the New activity menu lists Sessions, Submission and Passport, each with its icon and line
- the add dialog's title and hint
- each row's kind label and thumbnail icon
- each row's ⋯ menu delete warning

Open one detail page of each kind. Check its tabs: the booking has Setup, Bookings and Not
booked; a submission has Setup, Submissions and Not submitted; the passport has Setup only.

- [ ] **Step 3: Portal checks**

Take an `ecpkom` attendee token from the DB (`select token from attendees where event_id = <ecpkom id> limit 1`).
On `/e/ecpkom/a/<token>/activities`, check that the cards appear in the same sections and order
as on production (`ecphub.vercel.app/e/ecpkom/a/<token>/activities`, which is read-only). Then
open one activity of each kind and check that its body renders: the session grid, the form (or
tracker) and the stamp grid. Check the home page's activity row too.

- [ ] **Step 4: Clean up**

Delete `ZZ Kinds check` from Admin, then confirm in the DB that it has gone:
`select count(*) from activities where name = 'ZZ Kinds check'` must return 0.

- [ ] **Step 5: Record the decisions in the spec**

In `docs/superpowers/specs/2026-10-07-modular-features-design.md`, under D404, add a short
"Built 9 Oct 2026" paragraph:
- D414: the first slice of `src/features/activities/`; exhaustive maps and switches instead of a
  component registry, and why; the screens move into `kinds/<kind>/` under D407
- D415: `KIND_META`
- D416: portal entries keyed by kind; cards ordered by section, then kind

In D408, mark step 2 done.

- [ ] **Step 6: Commit and push**

```bash
git add docs/superpowers/specs/2026-10-07-modular-features-design.md
git commit -m "docs(arch): record D414-D416, the activity kinds as built

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git pull --rebase --autostash && git push
```

---

## Self-review

- **Spec coverage (D404):**
  - one source for labels and icons: Task 2
  - every silent fall-through made exhaustive:
    - admin detail: Task 3 Step 5
    - tabs: Task 3 Step 2
    - list rows: Task 3 Step 4
    - remove warning: Task 3 Step 3
    - portal detail: Task 4 Step 5
  - portal entries no longer dropping a kind: Task 4 Step 2
  - `NewActivityMenu`'s private kind type: Task 2
  - the type-level proof: Task 3 Step 6 and Task 4 Step 6, plus `covers` constants that stay in
    the code
  - the behaviour proof: the unchanged tab, row and card tests
  - Project Mileage stays a submission: no change to `scoring` code.
  - Deliberately not done here (recorded in D414): the screens move into `kinds/<kind>/`, and
    `readSettings` per kind, both under D407 when next touched.
- **Types:**
  - `ActivityEntries` and `EntryMap` are defined in Task 4 Step 2 and used in Step 3 and
    Step 5.
  - `FoundEntry` and `findEntry` are defined in Step 3 and used in Step 5.
  - `ACTIVITY_KINDS` and `KIND_META` are defined in Task 2 and used in Tasks 3 and 4.
- **No placeholders:** the one fill-in left is `<files tsc named>` in Task 3's commit message,
  which is the output of Step 6.
