# Scan Fields Picker, Cap of Four, and a Desktop Scanner

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Choose the scan card's extra fields from a searchable list instead of typing raw keys, raise the cap from two to four, move the setting to the Checkpoints tab, and make the scanner page a real layout on a desktop screen.

**Architecture:** Three independent changes to existing surfaces. The field list they pick from is `eventFields(registration_questions, attendee_fields)` — the unified list the whole app now works from. The scanner's phone layout is the primary one and does not change; desktop gets a second column at `lg` and up.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Tailwind v4, base-ui/shadcn primitives, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-attendee-fields-unification-design.md` (§Scan card, §Scanner settings)

**Predecessors:** the expand and contract plans, both complete, deployed, and their migrations applied.

## Global Constraints

- The cap is **4**, in one place: a `MAX_SCAN_FIELDS` constant, not a literal `.slice(0, 4)` in an action.
- The picker offers only fields the event actually has — `eventFields(ev.registration_questions, ev.attendee_fields)` — plus any stored value that no longer matches one, so a setting is never silently dropped on save.
- The Checkpoints tab sits **outside** the settings page's single form (the one SaveBar spans Event details and Registration only), and it already contains forms of its own. The moved section therefore gets its own form and its own action, with its own Save. Do not nest it in the big form; do not extend the big form to cover the tab.
- Phone layout is the one crew actually use. Any desktop change is additive at `lg` and above; below `lg` the rendered result must be unchanged.
- Tests first for the pure logic. Component and layout work is verified in the browser, and a browser check that was not run must be reported as not run.
- Every commit message ends with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- `npx vitest run`, `npx tsc --noEmit` and `npx eslint src tests` clean before each commit.
- Work on `main`, one commit per task.

---

### Task 1: The rule for what the scan card may show

**Files:**
- Modify: `src/lib/scan.ts` (add `MAX_SCAN_FIELDS` and `scanFieldsFromForm`)
- Modify: `src/app/admin/events/[id]/actions.ts:98` (stop parsing a comma string)
- Test: `tests/scan.test.ts`

**Interfaces:**
- Produces: `MAX_SCAN_FIELDS = 4`; `scanFieldsFromForm(posted: string[], fields: AttendeeField[]): string[]`.

- [ ] **Step 1: Write the failing test**

```ts
describe("scanFieldsFromForm", () => {
  const fields = [
    { key: "company", label: "Company", type: "text" as const },
    { key: "table_no", label: "Table", type: "text" as const },
    { key: "shirt_size", label: "Shirt size", type: "text" as const },
  ];

  it("keeps the fields the event has, in the order they were picked", () => {
    expect(scanFieldsFromForm(["table_no", "company"], fields)).toEqual(["table_no", "company"]);
  });

  it("drops a key the event has no field for", () => {
    expect(scanFieldsFromForm(["company", "ghost"], fields)).toEqual(["company"]);
  });

  it("drops a repeat rather than showing the same line twice", () => {
    expect(scanFieldsFromForm(["company", "company"], fields)).toEqual(["company"]);
  });

  it("stops at the cap", () => {
    const many = ["company", "table_no", "shirt_size", "a", "b"];
    const withAll = [...fields, { key: "a", label: "A", type: "text" as const }, { key: "b", label: "B", type: "text" as const }];
    expect(scanFieldsFromForm(many, withAll)).toHaveLength(MAX_SCAN_FIELDS);
  });

  it("keeps a stored value that matches a field by label, as the old free-text box wrote them", () => {
    // scanResultFields resolves by key or label, so a setting written before the picker
    // existed must survive a save made through it.
    expect(scanFieldsFromForm(["Shirt size"], fields)).toEqual(["Shirt size"]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/scan.test.ts`
Expected: FAIL — `scanFieldsFromForm is not a function`.

- [ ] **Step 3: Implement**

In `src/lib/scan.ts`:

```ts
/**
 * How many facts the card may carry besides the category. Four because the card used to
 * show company, category and table by name plus two chosen extras; a cap of two would have
 * cost crew lines they had been reading at a door for a year.
 */
export const MAX_SCAN_FIELDS = 4;

/**
 * The scan fields a save may store: the ones picked, in the order picked, minus repeats
 * and anything this event has no field for, capped.
 *
 * A value is kept when it names a field by key OR by label, because the free-text box this
 * replaced stored labels — dropping those on the first save through the picker would empty
 * the card of an event that had configured it perfectly well.
 */
export function scanFieldsFromForm(posted: string[], fields: AttendeeField[]): string[] {
  const out: string[] = [];
  for (const raw of posted) {
    const name = raw.trim();
    if (!name || out.includes(name)) continue;
    const known = fields.some((f) => f.key === name || f.label.toLowerCase() === name.toLowerCase());
    if (!known) continue;
    out.push(name);
    if (out.length === MAX_SCAN_FIELDS) break;
  }
  return out;
}
```

In `src/app/admin/events/[id]/actions.ts`, delete the comma-splitting line at :98 and the `scan_extra_fields` entry from `updateSettingsAction`'s patch — Task 2 moves this setting to its own action, and leaving it here would let the Event details form blank it.

- [ ] **Step 4: Run the suite**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src tests`

- [ ] **Step 5: Commit**

```bash
git add src/lib/scan.ts "src/app/admin/events/[id]/actions.ts" tests/scan.test.ts
git commit -m "$(cat <<'MSG'
feat(scanner): four fields on the card, and a rule about which

The cap was a `.slice(0, 2)` inside the settings action — invisible from the form
that fed it, so a third field was accepted and silently dropped. It is now a
named constant of four, which is what the card needs: migration 0014 seeded
company and table_no into every event that showed them, and two was the whole
allowance.

scanFieldsFromForm keeps a stored value that names a field by label as well as
by key, because the free-text box this replaces stored labels. Dropping those on
the first save through the new picker would empty the card of an event that had
configured it perfectly well.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: The picker, on the tab where the scanner lives

**Files:**
- Create: `src/components/admin/FieldPicker.tsx`
- Modify: `src/app/admin/events/[id]/actions.ts` (add `updateScanFieldsAction`)
- Modify: `src/app/admin/events/[id]/settings/page.tsx` (delete the Onsite scanner section from Event details; add it to the Checkpoints tab with its own form)

**Interfaces:**
- Consumes: `MAX_SCAN_FIELDS`, `scanFieldsFromForm` (Task 1); `eventFields` from `@/lib/attendee-fields`; `Popover`/`PopoverTrigger`/`PopoverContent` from `@/components/ui/popover`; `Input`, `Button`.
- Produces: `<FieldPicker name="scan_extra_fields" fields={…} selected={…} max={…} />`, posting one hidden input per choice.

- [ ] **Step 1: Build the picker**

A client component. State is the chosen list; the form reads hidden inputs, so it works without any controlled-form machinery:

```tsx
"use client";
// Trigger shows the chosen labels, or a prompt when empty. The popover holds a filter box
// and the event's fields as rows; a chosen row shows a tick. At the cap the unchosen rows
// go disabled rather than the save quietly dropping the extras, which is what the old
// `.slice(0, 2)` did.
export function FieldPicker({ name, fields, selected, max }: {
  name: string;
  fields: { key: string; label: string }[];
  selected: string[];
  max: number;
}) { … }
```

Requirements, each of which the review will check:
- One `<input type="hidden" name={name} value={key}>` per chosen field, in chosen order.
- A filter input that matches on label, case-insensitively.
- At `max` chosen, unchosen rows are `disabled` and a line says why.
- A chosen row can be un-chosen, at any time.
- A stored value that matches no field still renders as a chosen row (labelled as stored) so saving does not drop it.
- An event with no fields shows an empty state, not a dead popover.
- Every row is a real `<button type="button">`, reachable by keyboard.

- [ ] **Step 2: Add the action**

In `src/app/admin/events/[id]/actions.ts`:

```ts
/**
 * The scan card's fields, saved from the Checkpoints tab. Its own action because that tab
 * sits outside the one big settings form — see the SaveBar comment in settings/page.tsx.
 */
export async function updateScanFieldsAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const fields = eventFields(ev.registration_questions, ev.attendee_fields);
  await updateEvent(eventId, { scan_extra_fields: scanFieldsFromForm(formData.getAll("scan_extra_fields").map(String), fields) });
  const path = `/admin/events/${eventId}/settings`;
  revalidatePath(path);
  redirect(flashPath(path, "Scan card updated."));
}
```

- [ ] **Step 3: Move the section**

Delete the "Onsite scanner" `Section` from the Event details panel. Add a `Card` to the **Checkpoints** `TabsContent`, below the checkpoints card, containing its own `<form action={updateScanFieldsAction.bind(null, ev.id)}>` with the `FieldPicker` and a `SubmitButton`. Write the card's description to be true of the code: crew see the attendee's name and category, plus the fields chosen here.

- [ ] **Step 4: Verify in the browser**

The dev server is on port 3000. On Settings → Checkpoints: the picker lists the event's fields, filtering works, choosing a fifth is refused at the cap, Save persists, and the Event details tab no longer carries the section. Then confirm the crew scanner's card reflects a change. Report exactly what you checked.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/FieldPicker.tsx "src/app/admin/events/[id]/actions.ts" "src/app/admin/events/[id]/settings/page.tsx"
git commit -m "$(cat <<'MSG'
feat(scanner): pick the card's fields, next to the checkpoints they run

The setting was a comma-separated box asking for raw keys — an organiser had to
know that the Shirt size question is stored as `shirt_size`, and a typo failed
silently by showing nothing. It is a searchable picker over the event's own
fields now, and it lives on the Checkpoints tab, beside the doors the scanner is
run at rather than under the event's name and dates.

It carries its own form and action because that tab sits outside the single
settings form, which is the same reason the tab's checkpoint controls do.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: A scanner that uses a desktop screen

**Files:**
- Modify: `src/app/scan/[eventId]/Scanner.tsx:131` and the blocks below it
- Modify: `src/app/scan/[eventId]/loading.tsx` (so the skeleton matches the layout it precedes)

**Interfaces:** none — this is layout only. No prop, state or action changes.

- [ ] **Step 1: Widen the shell and split it at `lg`**

Today `main` is `mx-auto flex max-w-md flex-col gap-3 p-3`: a 448px column that, on a 1440px laptop, is a phone-shaped strip with ~500px of empty page either side and nothing in it. Crew use phones, so that column is right below `lg` and must not change. Above `lg`, the page gets a second column.

```tsx
<main className="mx-auto flex w-full max-w-md flex-col gap-3 p-3 lg:max-w-5xl lg:gap-4 lg:p-6">
  <header …>                       {/* unchanged; spans the full width */}
  <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-5">
    <div className="…camera…" />   {/* taller at lg: min-h-[240px] lg:min-h-[460px] */}
    <div className="flex flex-col gap-3">  {/* result card, then search and its hits */}
  </div>
</main>
```

The camera box keeps `min-h-[240px]` below `lg` and grows at `lg`; the result card and the search column sit to its right. Nothing gains a fixed height that could clip a long result.

- [ ] **Step 2: Match the loading skeleton to it**

`loading.tsx` copies the same shell classes today. Give it the same `lg` treatment so the page does not jump from a centred strip to a two-column layout when it finishes loading.

- [ ] **Step 3: Verify in the browser, at both sizes**

At 1440×900: two columns, camera on the left and taller, search on the right, no empty band down the page, nothing overflowing horizontally. At 390×844: byte-for-byte the same experience as before — one column, same spacing, same camera height. Screenshot both and say which you took.

The scanner asks for camera permission; in a headless pane that yields the "Camera blocked" card, which is a fine stand-in for the camera box's size and position. Say that is what you saw rather than implying a live preview.

- [ ] **Step 4: Commit**

```bash
git add "src/app/scan/[eventId]/Scanner.tsx" "src/app/scan/[eventId]/loading.tsx"
git commit -m "$(cat <<'MSG'
feat(scanner): a layout for the desk, not just the door

The scanner is a phone tool and stays one on a phone. On a laptop it was the
same 448px column centred in a 1440px page — a small camera box, a cramped
search, and two-thirds of the screen empty — which is what an organiser sees
when they open it to test a checkpoint, and what a desk with a webcam gets all
day.

At lg and up the page widens and splits: the camera takes the left column and
grows, the result card and the search sit to its right. Below lg nothing moves.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Done when

- The scan card's fields are chosen from a list, capped at four, saved from the Checkpoints tab.
- `grep -rn "slice(0, 2)" src` finds nothing related to scan fields; the cap is `MAX_SCAN_FIELDS`.
- The Event details tab no longer mentions the scanner.
- At 1440×900 the scanner fills the width in two columns; at 390×844 it is unchanged.
- `npx vitest run`, `npx tsc --noEmit`, `npx eslint src tests` all clean.

## Not in this plan

- The camera preview itself, its aspect ratio handling, or anything about decoding.
- Reordering chosen fields by drag — the picker keeps them in the order they were chosen, which is enough for four.
