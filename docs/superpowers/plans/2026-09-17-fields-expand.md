# Attendee Fields: Expand Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `company`, `phone` and `table_no` ordinary event fields stored in `attendees.extra`, so no code reads `events.collected_fields` or the three legacy columns directly — while both still exist and still work.

**Architecture:** Expand half of an expand/backfill/contract migration. Every read goes through one accessor, `fieldValue`, which prefers `extra` and falls back to the legacy column when the key is *absent* from `extra`. Writes go only to `extra`. Nothing is dropped in this step: migration 0014 adds field definitions and copies values; the columns and `collected_fields` stay in the database so this deploy can be rolled back. A later plan deletes them.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Supabase (Postgres + service-role client), Zod, Vitest, Tailwind + shadcn/base-ui.

**Spec:** `docs/superpowers/specs/2026-09-17-attendee-fields-unification-design.md`

## Global Constraints

- Only `name`, `email` and `category` are compulsory. They stay columns on `attendees`.
- Field keys are exactly `company`, `phone`, `table_no` — the same spelling as the columns they replace, so the backfill is a straight copy.
- The fallback in `fieldValue` keys on **absence** (`key in extra`), never on emptiness. An organiser clearing a value writes `""`, which is present, and must not resurrect the column's value.
- Writes go to `extra` only. No dual-writing to the legacy columns.
- No `drop column` in this step. Migration 0014 is additive.
- Tests first, always: every task writes a failing test, runs it, implements, runs it again, commits.
- Every commit message ends with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Run the full suite with `npx vitest run` before each commit; `npx tsc --noEmit` and `npx eslint src tests` must both be clean.
- Work happens on `main`, one commit per task.

---

### Task 1: The legacy value accessor

**Files:**
- Create: `src/lib/attendee-values.ts`
- Test: `tests/attendee-values.test.ts`

**Interfaces:**
- Consumes: `Attendee` from `@/lib/types`.
- Produces: `LEGACY_COLUMN_KEYS: readonly string[]`, `fieldValue(a: Pick<Attendee, "extra"> & Record<string, unknown>, key: string): string`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/attendee-values.test.ts
import { describe, it, expect } from "vitest";
import { fieldValue, LEGACY_COLUMN_KEYS } from "@/lib/attendee-values";

const attendee = (o: Record<string, unknown>) => ({ extra: {}, ...o }) as never;

describe("fieldValue", () => {
  it("reads the value out of extra", () => {
    expect(fieldValue(attendee({ extra: { company: "Ecopia" } }), "company")).toBe("Ecopia");
  });

  it("falls back to the legacy column while extra has no such key", () => {
    expect(fieldValue(attendee({ company: "Ecopia" }), "company")).toBe("Ecopia");
  });

  it("does not resurrect a column when extra holds an empty string", () => {
    // Clearing a value writes "", which is present. The old column must stay buried,
    // or an organiser deleting a company would watch it come back on the next render.
    expect(fieldValue(attendee({ company: "Ecopia", extra: { company: "" } }), "company")).toBe("");
  });

  it("never falls back for a key that was never a column", () => {
    expect(fieldValue(attendee({ shirt_size: "L" }), "shirt_size")).toBe("");
  });

  it("trims what it returns, from either source", () => {
    expect(fieldValue(attendee({ extra: { phone: " 012 " } }), "phone")).toBe("012");
    expect(fieldValue(attendee({ phone: " 012 " }), "phone")).toBe("012");
  });

  it("names exactly the three columns this migration retires", () => {
    expect([...LEGACY_COLUMN_KEYS].sort()).toEqual(["company", "phone", "table_no"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/attendee-values.test.ts`
Expected: FAIL — `Cannot find package '@/lib/attendee-values'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/attendee-values.ts
import type { Attendee } from "@/lib/types";

/**
 * The columns migration 0014 copies into `extra` and a later migration drops. Nothing
 * outside this file should name them.
 */
export const LEGACY_COLUMN_KEYS = ["company", "phone", "table_no"] as const;

const LEGACY = new Set<string>(LEGACY_COLUMN_KEYS);

/**
 * One field's value for one attendee: `extra` first, then the column it used to live in.
 *
 * TEMPORARY. This exists so the code that writes fields and the migration that moves the
 * data can land in separate deploys — the pattern floorPlanUrl() documents in modules.ts.
 * It goes in the contract step, along with the columns.
 *
 * The fallback tests for the key's ABSENCE, not for a blank: an organiser who clears a
 * company writes "", which is present, and must not have the old column answer for it.
 */
export function fieldValue(a: Pick<Attendee, "extra"> & Record<string, unknown>, key: string): string {
  const extra = a.extra ?? {};
  if (key in extra) return (extra[key] ?? "").trim();
  if (!LEGACY.has(key)) return "";
  const column = a[key];
  return typeof column === "string" ? column.trim() : "";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/attendee-values.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendee-values.ts tests/attendee-values.test.ts
git commit -m "$(cat <<'MSG'
feat(fields): one accessor for a field's value, column or extra

The expand half of moving company, phone and table into `extra` needs code
and data to land in separate deploys. fieldValue reads `extra` first and the
legacy column second, keyed on the absence of the key rather than on a blank
value — so clearing a field writes "" and stays cleared instead of being
answered by the column it replaced.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: A phone field type

**Files:**
- Modify: `src/lib/attendee-fields.ts` (`AttendeeFieldType`, `ATTENDEE_FIELD_TYPES`, `FIELD_TYPE_LABELS`, `coerceFieldValue`, `fieldsFromQuestions`)
- Modify: `src/lib/registration.ts` (`questionSchema`)
- Modify: `src/lib/types.ts` (`RegistrationQuestion["type"]`)
- Test: `tests/attendee-fields.test.ts`, `tests/registration.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `AttendeeFieldType` now includes `"phone"`; `RegistrationQuestion["type"]` is `"text" | "phone" | "number" | "select"`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/attendee-fields.test.ts`:

```ts
describe("phone fields", () => {
  it("parses a phone column", () => {
    expect(parseAttendeeFields([{ key: "phone", label: "Mobile", type: "phone" }]))
      .toEqual([{ key: "phone", label: "Mobile", type: "phone" }]);
  });

  it("keeps a phone value as typed — an events desk must not have a number rejected", () => {
    expect(coerceFieldValue({ key: "phone", label: "Mobile", type: "phone" }, " +60 12-345 6789 "))
      .toBe("+60 12-345 6789");
  });

  it("carries a phone question through to its column", () => {
    expect(fieldsFromQuestions([{ key: "phone", label: "Mobile", type: "phone", required: false }]))
      .toEqual([{ key: "phone", label: "Mobile", type: "phone" }]);
  });

  it("carries a number question through as a number column", () => {
    expect(fieldsFromQuestions([{ key: "guests", label: "Guests", type: "number", required: false }]))
      .toEqual([{ key: "guests", label: "Guests", type: "number" }]);
  });
});
```

Append to `tests/registration.test.ts`:

```ts
describe("phone and number questions", () => {
  it("accepts a phone question", () => {
    expect(parseQuestions([{ key: "phone", label: "Mobile", type: "phone", required: false }]))
      .toHaveLength(1);
  });

  it("accepts a number question", () => {
    expect(parseQuestions([{ key: "guests", label: "Guests", type: "number", required: false }]))
      .toHaveLength(1);
  });

  it("still rejects a type it does not know", () => {
    expect(() => parseQuestions([{ key: "x", label: "X", type: "file", required: false }])).toThrow();
  });
});
```

Check the existing imports at the top of each test file and add any of
`parseAttendeeFields`, `coerceFieldValue`, `fieldsFromQuestions`, `parseQuestions` that are
missing.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/attendee-fields.test.ts tests/registration.test.ts`
Expected: FAIL — the phone rows are dropped by `parseAttendeeFields` (unknown type falls back to `text`), and `parseQuestions` rejects `"phone"`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/attendee-fields.ts`:

```ts
export type AttendeeFieldType = "text" | "phone" | "number" | "date" | "select";

export const ATTENDEE_FIELD_TYPES: AttendeeFieldType[] = ["text", "phone", "number", "date", "select"];

export const FIELD_TYPE_LABELS: Record<AttendeeFieldType, string> = {
  text: "Text",
  phone: "Phone",
  number: "Number",
  date: "Date",
  select: "Choice",
};
```

In `coerceFieldValue`, add a case above `default`:

```ts
    // No format check. A phone number typed as +60 12-345 6789, 012 3456789 or with a
    // country code pasted from a spreadsheet is the same phone number, and a registration
    // desk rejecting one costs more than a messy one costs anybody.
    case "phone":
      return v.slice(0, 40);
```

In `fieldsFromQuestions`, carry the question's type instead of flattening to text:

```ts
export function fieldsFromQuestions(questions: RegistrationQuestion[]): AttendeeField[] {
  return questions.map((q) => {
    const options = q.options?.map((o) => o.trim()).filter(Boolean) ?? [];
    if (q.type === "select" && options.length > 0) return { key: q.key, label: q.label, type: "select" as const, options };
    // A select that lost its choices falls back to free text so the answer stays editable.
    if (q.type === "select") return { key: q.key, label: q.label, type: "text" as const };
    return { key: q.key, label: q.label, type: q.type };
  });
}
```

In `src/lib/types.ts`:

```ts
  type: "text" | "phone" | "number" | "select";
```

In `src/lib/registration.ts`:

```ts
  type: z.enum(["text", "phone", "number", "select"]),
```

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: PASS. If an existing test asserted `fieldsFromQuestions` flattens every non-select to `text`, it is now wrong about `phone`/`number` questions only — update that expectation; do not weaken the new tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendee-fields.ts src/lib/registration.ts src/lib/types.ts tests/attendee-fields.test.ts tests/registration.test.ts
git commit -m "$(cat <<'MSG'
feat(fields): phone and number field types

Company and phone are about to stop being hardcoded columns and become ordinary
questions. A question could only be text or a choice, so a phone asked that way
would lose its tel input and, on a mobile, its number keypad — a regression for
anyone registering on a phone, which is most people.

Phone values are stored as typed. A number written +60 12-345 6789 and one
written 012 3456789 are the same number, and a desk that rejects one costs more
than a messy one does.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: Un-reserve the three keys

**Files:**
- Modify: `src/lib/attendee-fields.ts` (`RESERVED_KEYS`)
- Test: `tests/attendee-fields.test.ts`

**Interfaces:**
- Consumes: Task 2's types.
- Produces: `addField` accepts labels keyed `company`, `phone`, `table_no`.

- [ ] **Step 1: Write the failing test**

```ts
describe("keys the attendee row no longer owns", () => {
  it("lets an event add its own Company column", () => {
    const r = addField([], { label: "Company", type: "text", options: "" });
    expect(r).toEqual({ ok: true, fields: [{ key: "company", label: "Company", type: "text" }] });
  });

  it("still refuses a column that would shadow the row's own identity", () => {
    for (const label of ["Email", "Name", "Category", "Token"]) {
      expect(addField([], { label, type: "text", options: "" })).toMatchObject({ ok: false });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/attendee-fields.test.ts`
Expected: FAIL — `"Company" is already a built-in column`.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Keys the attendee row still owns. company, phone and table_no left this list when they
 * became ordinary fields — an event may now define, rename and delete them like any other
 * column, which is the whole point of retiring collected_fields.
 */
const RESERVED_KEYS = new Set(["id", "name", "email", "category", "source", "status", "token", "extra"]);
```

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendee-fields.ts tests/attendee-fields.test.ts
git commit -m "$(cat <<'MSG'
feat(fields): company, phone and table are ordinary keys

They were reserved because the attendee row owned columns by those names. They
are becoming fields, so an event may define them — and rename or delete them —
exactly like Dietary or Shirt size. id, name, email, category, token, source and
status stay reserved: those the row still owns.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: Registration asks questions and nothing else

**Files:**
- Modify: `src/lib/registration.ts` (`RegistrationData`, `validateRegistration`)
- Modify: `src/app/e/[slug]/register/page.tsx` (drop the `collects` prop)
- Modify: `src/components/portal/RegisterForm.tsx` (drop `collects`, render by type)
- Modify: `src/app/e/[slug]/register/actions.ts` (write `extra` only)
- Test: `tests/registration.test.ts`

**Interfaces:**
- Consumes: Task 2's question types.
- Produces: `RegistrationData = { name: string; email: string; extra: Record<string, string> }`.

- [ ] **Step 1: Write the failing test**

```ts
describe("validateRegistration after unification", () => {
  const q = (key: string, type: "text" | "phone" = "text") =>
    ({ key, label: key, type, required: false }) as const;

  it("puts every answer in extra, including phone and company", () => {
    const r = validateRegistration(
      { name: "Sam", email: "S@x.com", phone: "012", company: "Ecopia" },
      [q("phone", "phone"), q("company")],
    );
    expect(r).toEqual({ ok: true, data: { name: "Sam", email: "s@x.com", extra: { phone: "012", company: "Ecopia" } } });
  });

  it("ignores a phone the event never asked for", () => {
    const r = validateRegistration({ name: "Sam", email: "s@x.com", phone: "012" }, []);
    expect(r).toEqual({ ok: true, data: { name: "Sam", email: "s@x.com", extra: {} } });
  });

  it("still requires name and a valid email", () => {
    expect(validateRegistration({ name: "", email: "nope" }, [])).toMatchObject({ ok: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/registration.test.ts`
Expected: FAIL — the returned `data` still carries `phone` and `company` keys at the top level.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/registration.ts`:

```ts
export type RegistrationData = { name: string; email: string; extra: Record<string, string> };
```

and end `validateRegistration` with:

```ts
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, data: { name, email, extra } };
```

Delete the `phone`/`company` reads. In `src/components/portal/RegisterForm.tsx` remove the
`collects` prop and its two hardcoded inputs, and give the question input an `inputMode`
and `type` from the question:

```tsx
const INPUT_TYPE: Record<string, string> = { phone: "tel", number: "number" };
// …where the question's input is rendered:
<Input name={q.key} type={INPUT_TYPE[q.type] ?? "text"} required={q.required} />
```

In `src/app/e/[slug]/register/page.tsx` drop `collects={event.collected_fields}`. In the
register action, pass `{ name, email, extra }` straight to `createAttendee` / `upsertByEmail`
with no `phone` or `company` keys.

- [ ] **Step 4: Run the full suite and the browser check**

Run: `npx vitest run` — expected PASS.
Then: add a Phone question to a draft event in Settings, open `/e/<slug>/register`, submit,
and confirm the answer lands in the attendee's `extra` (check the attendee detail panel).

- [ ] **Step 5: Commit**

```bash
git add src/lib/registration.ts src/components/portal/RegisterForm.tsx "src/app/e/[slug]/register/page.tsx" "src/app/e/[slug]/register/actions.ts" tests/registration.test.ts
git commit -m "$(cat <<'MSG'
feat(registration): the form is its questions, and nothing else

phone and company were read straight off the posted form and returned beside
name and email, which is why they needed a collects prop to know whether to
render at all. They are questions now: an event that wants a mobile number asks
for one, and the answer lands in extra like every other answer.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: The importer fills fields

**Files:**
- Modify: `src/lib/masterlist.ts` (`TEMPLATE`, row assembly)
- Test: `tests/masterlist.test.ts`

**Interfaces:**
- Consumes: `extraKeyFor(header, fields)`, already in the file.
- Produces: `MasterlistRow` keeps `name`, `email`, `category`; `phone`, `company`, `table_no` arrive inside `extra`.

- [ ] **Step 1: Write the failing test**

Follow the existing test file's helper for building a workbook buffer. Add:

```ts
it("files Mobile, Company and Table into extra like any other column", async () => {
  const buf = await sheet([
    ["Name", "Email", "Mobile", "Company", "Table", "Category"],
    ["Sam", "s@x.com", "012", "Ecopia", "7", "VIP"],
  ]);
  const res = await parseMasterlist(buf, [
    { key: "phone", label: "Mobile", type: "phone" },
    { key: "company", label: "Company", type: "text" },
    { key: "table_no", label: "Table", type: "text" },
  ]);
  expect(res.rows[0]).toMatchObject({
    name: "Sam",
    email: "s@x.com",
    category: "VIP",
    extra: { phone: "012", company: "Ecopia", table_no: "7" },
  });
  expect(res.rows[0]).not.toHaveProperty("phone");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/masterlist.test.ts`
Expected: FAIL — the row carries top-level `phone`/`company`/`table_no` and `extra` is empty.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Headers that name the attendee row itself. Mobile, Company and Table are not here any
 * more: they are fields, so they take the same path as Dietary — matched to one of the
 * event's own columns by extraKeyFor, and stored in `extra`.
 */
const TEMPLATE: Record<string, keyof AttendeeInput> = {
  name: "name", email: "email", category: "category",
};

/**
 * The spellings a spreadsheet uses for the three fields that used to be columns. An event
 * that has defined them under its own labels is matched by extraKeyFor first; this is the
 * fallback that keeps a client's existing template importing without being re-labelled.
 */
const LEGACY_HEADERS: Record<string, string> = {
  mobile: "phone", phone: "phone", company: "company", table: "table_no", "table no": "table_no",
};
```

and in the row loop, resolve each non-template header through the event's fields first and
the legacy spellings second:

```ts
    for (const h of extraColumns) {
      const key = fields.some((f) => f.label.toLowerCase() === h.toLowerCase())
        ? extraKeyFor(h, fields)
        : LEGACY_HEADERS[h.toLowerCase()] ?? extraKeyFor(h, fields);
      extra[key] = values[h] ?? "";
    }
    rows.push({ row: r, name, email: pick("email")?.toLowerCase() ?? null, category: pick("category"), extra });
```

`extraColumns` is derived from `TEMPLATE`, so shrinking `TEMPLATE` already lets Mobile,
Company and Table through as extra columns.

Then fix the one call site, in `importMasterlistAction` in
`src/app/admin/events/[id]/actions.ts` — it builds an `AttendeeInput` naming all six:

```ts
    const input: AttendeeInput = { name: r.name, email: r.email, category: r.category, extra: r.extra };
```

`mergeExtra(existing.extra, input.extra)` on the update path is unchanged and now carries
the three former columns with everything else.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: PASS. Existing importer tests asserting `row.company` must be updated to read
`row.extra.company` — that is the change, not a break.

- [ ] **Step 5: Commit**

```bash
git add src/lib/masterlist.ts tests/masterlist.test.ts
git commit -m "$(cat <<'MSG'
feat(import): Mobile, Company and Table are ordinary columns

They were template headers writing to their own attendee columns. They are
fields now, so they take the path Dietary already takes — matched against the
event's own labels, stored in extra. LEGACY_HEADERS keeps a client's existing
spreadsheet importing without anyone having to re-label its headers.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 6: Columns and bulk edit stop asking what the event collects

**Files:**
- Modify: `src/lib/columns.ts` (`BUILTIN_COLUMNS`, `OPTIONAL_KEYS`, `allColumns`, `BULK_BUILTIN_FIELDS`, `bulkFields`)
- Test: `tests/columns.test.ts`

**Interfaces:**
- Produces: `allColumns(registrationFields, customFields, breakoutFields?)` — the fourth `collected` parameter is gone. `bulkFields(eventFields)` — the second parameter is gone.

- [ ] **Step 1: Write the failing test**

```ts
it("has no built-in column for a field an event may not have", () => {
  expect(BUILTIN_COLUMNS.map((c) => c.key)).toEqual(["email", "category", "checked_in", "source"]);
});

it("takes company from the event's own fields, wherever it was defined", () => {
  const cols = allColumns([{ key: "company", label: "Company", type: "text" }], []);
  expect(cols.find((c) => c.key === "company")).toEqual({ key: "company", label: "Company", source: "registration" });
});

it("offers bulk edit the event's fields plus category", () => {
  expect(bulkFields([{ key: "table_no", label: "Table", type: "text" }]).map((f) => f.key))
    .toEqual(["category", "table_no"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/columns.test.ts`
Expected: FAIL — `BUILTIN_COLUMNS` still lists company, phone and table_no.

- [ ] **Step 3: Write minimal implementation**

```ts
export const BUILTIN_COLUMNS: ColumnDef[] = [
  { key: "email", label: "Email", source: "builtin" },
  { key: "category", label: "Category", source: "builtin" },
  { key: "checked_in", label: "Checked in", source: "builtin" },
  { key: "source", label: "Source", source: "builtin" },
];

export function allColumns(
  registrationFields: AttendeeField[],
  customFields: AttendeeField[],
  breakoutFields: AttendeeField[] = [],
): ColumnDef[] {
  const claimed = new Set(registrationFields.map((f) => f.key));
  return [
    ...BUILTIN_COLUMNS,
    ...registrationFields.map((f): ColumnDef => ({ key: f.key, label: f.label, source: "registration" })),
    ...customFields.filter((f) => !claimed.has(f.key)).map((f): ColumnDef => ({ key: f.key, label: f.label, source: "custom" })),
    ...breakoutFields.map((f): ColumnDef => ({ key: f.key, label: f.label, source: "breakout" })),
  ];
}

/**
 * Category is the only row column a bulk edit may set: name and email are per-person,
 * check-in has its own control, and source records how someone got on the list.
 */
export const BULK_BUILTIN_FIELDS: AttendeeField[] = [
  { key: "category", label: "Category", type: "text" },
];

export function bulkFields(eventFields: AttendeeField[]): AttendeeField[] {
  return [...BULK_BUILTIN_FIELDS, ...eventFields];
}
```

Delete the `OPTIONAL_KEYS` constant and the `collected-fields` import.

- [ ] **Step 4: Fix the call sites and run the suite**

Update `src/app/admin/events/[id]/attendees/page.tsx:76` and `:209`, and
`src/app/admin/events/[id]/actions.ts:306`, to drop the removed argument.
Run: `npx vitest run && npx tsc --noEmit` — expected PASS and clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/columns.ts tests/columns.test.ts "src/app/admin/events/[id]/attendees/page.tsx" "src/app/admin/events/[id]/actions.ts"
git commit -m "$(cat <<'MSG'
feat(table): columns come from the event's fields

allColumns and bulkFields took a collected_fields argument to decide whether
three built-in columns existed. Those three are fields now: they appear because
the event defined them, by the same route as every other column, and the
argument has nothing left to decide.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 7: Pins without native company, phone or table

**Files:**
- Modify: `src/lib/pinned-fields.ts` (`NATIVE_PINNABLE`, `pinValue`, `pinnableFields`, `resolvePins`, `hydratePins`)
- Test: `tests/pinned-fields.test.ts`

**Interfaces:**
- Produces: `pinnableFields(questions, custom)` and `resolvePins(pins, attendee, fields)` — each loses its trailing `collected` parameter. `pinValue(attendee, key)` is unchanged in shape.

- [ ] **Step 1: Write the failing test**

```ts
it("resolves a pin stored as company out of extra", () => {
  const a = { extra: { company: "Ecopia" } } as never;
  expect(pinValue(a, "company")).toBe("Ecopia");
});

it("still resolves a pin while the value is only in the legacy column", () => {
  const a = { company: "Ecopia", extra: {} } as never;
  expect(pinValue(a, "company")).toBe("Ecopia");
});

it("offers only email and category natively — the rest are the event's fields", () => {
  expect(NATIVE_PINNABLE.map((f) => f.key)).toEqual(["email", "category"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pinned-fields.test.ts`
Expected: FAIL on the `NATIVE_PINNABLE` assertion, and on the extra-first lookup (today
`pinValue` reads the column for any native key, ignoring `extra`).

- [ ] **Step 3: Write minimal implementation**

```ts
import { fieldValue } from "@/lib/attendee-values";

/**
 * Columns of the attendee row that may be pinned. company, phone and table_no are not
 * here any more: they are the event's own fields, so they arrive through eventFields and
 * are pinnable without being special.
 */
export const NATIVE_PINNABLE: AttendeeField[] = [
  { key: "email", label: "Email", type: "text" },
  { key: "category", label: "Category", type: "text" },
];

const NATIVE_KEYS = new Set(NATIVE_PINNABLE.map((f) => f.key));

/** The value behind a pin: a column the row still owns, or a field. */
export function pinValue(attendee: Attendee, key: string): string {
  if (NATIVE_KEYS.has(key)) {
    const v = (attendee as unknown as Record<string, unknown>)[key];
    return typeof v === "string" ? v.trim() : "";
  }
  return fieldValue(attendee, key);
}
```

Drop the `collected` parameter from `pinnableFields` and `resolvePins` and the
`collected-fields` import; a pin whose key names no field is already dropped by the
existing filter, which is what stops a stale pin rendering.

- [ ] **Step 4: Fix the call sites and run the suite**

`src/app/admin/events/[id]/settings/page.tsx:95` and
`src/app/e/[slug]/a/[token]/page.tsx:54` drop their last argument.
Run: `npx vitest run && npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pinned-fields.ts tests/pinned-fields.test.ts "src/app/admin/events/[id]/settings/page.tsx" "src/app/e/[slug]/a/[token]/page.tsx"
git commit -m "$(cat <<'MSG'
feat(badge): pins read fields, not three special columns

A pin stored as "company" now resolves through fieldValue, so it keeps working
whether the value has been backfilled into extra or is still sitting in the
column. NATIVE_PINNABLE keeps email and category — the two the attendee row
still owns — and everything else a badge can show arrives as an event field.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 8: The scan card and the crew search

**Files:**
- Modify: `src/lib/scan.ts` (`scanResultFields`)
- Modify: `src/app/scan/[eventId]/actions.ts:107-115`
- Modify: `src/app/scan/[eventId]/Scanner.tsx` and `src/app/booth/[token]/BoothScanner.tsx` if they type the search hit's `company`/`table_no`
- Test: `tests/scan.test.ts`

**Interfaces:**
- Produces: `scanResultFields(a, e)` where `e` is `Pick<Event, "scan_extra_fields" | "attendee_fields" | "registration_questions">` — the `collected_fields` member is gone.

- [ ] **Step 1: Write the failing test**

```ts
it("shows category, then the fields the event chose, resolved by key", () => {
  const a = { category: "VIP", extra: { company: "Ecopia" } } as never;
  const e = {
    scan_extra_fields: ["company"],
    attendee_fields: [{ key: "company", label: "Company", type: "text" as const }],
    registration_questions: [],
  };
  expect(scanResultFields(a, e)).toEqual([
    { label: "Category", value: "VIP" },
    { label: "Company", value: "Ecopia" },
  ]);
});

it("still resolves a field configured by its label, as the old free-text box stored it", () => {
  const a = { category: "", extra: { shirt_size: "L" } } as never;
  const e = {
    scan_extra_fields: ["Shirt size"],
    attendee_fields: [{ key: "shirt_size", label: "Shirt size", type: "text" as const }],
    registration_questions: [],
  };
  expect(scanResultFields(a, e)).toEqual([
    { label: "Category", value: "" },
    { label: "Shirt size", value: "L" },
  ]);
});

it("reads a value still sitting in the legacy column", () => {
  const a = { category: "", company: "Ecopia", extra: {} } as never;
  const e = {
    scan_extra_fields: ["company"],
    attendee_fields: [{ key: "company", label: "Company", type: "text" as const }],
    registration_questions: [],
  };
  expect(scanResultFields(a, e)[1]).toEqual({ label: "Company", value: "Ecopia" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scan.test.ts`
Expected: FAIL — the card still prepends a Company line of its own and gates on
`collected_fields`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { fieldValue } from "@/lib/attendee-values";

/**
 * The lines on a crew member's card after a scan: the category, then whatever fields this
 * event chose to show.
 *
 * Company and Table used to be printed here by name. They are ordinary fields now, so an
 * event that wants them on the card names them in Settings — and migration 0014 seeded
 * exactly that for every event that showed them before.
 */
export function scanResultFields(a: Attendee, e: Pick<Event, "scan_extra_fields" | "attendee_fields" | "registration_questions">) {
  const fields = eventFields(e.registration_questions ?? [], e.attendee_fields ?? []);
  const out = [{ label: "Category", value: a.category ?? "" }];
  for (const name of e.scan_extra_fields) {
    // A configured name may be a field's key (what the picker stores) or its label (what
    // the old free-text box stored). Either must find the field, or the card shows a raw
    // slug like shirt_size to someone standing at a door.
    const field = fields.find((f) => f.key === name || f.label.toLowerCase() === name.toLowerCase());
    out.push({ label: field?.label ?? name, value: field ? fieldValue(a, field.key) : fieldValue(a, name) });
  }
  return out;
}
```

In `src/app/scan/[eventId]/actions.ts`, replace the `collects` block with field reads:

```ts
  return rows.slice(0, 20).map((a) => ({
    id: a.id,
    name: a.name,
    company: fieldValue(a, "company") || null,
    category: a.category,
    table_no: fieldValue(a, "table_no") || null,
    checkedIn: checkedIn.has(a.id),
  }));
```

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src tests`

- [ ] **Step 5: Commit**

```bash
git add src/lib/scan.ts "src/app/scan/[eventId]/actions.ts" tests/scan.test.ts
git commit -m "$(cat <<'MSG'
feat(scanner): the card shows category and the event's chosen fields

Company and Table were printed on the card by name and gated on
collected_fields. They are fields now, so the card shows what the event asked
for — and a configured name resolves by key or by label, so values stored by the
old free-text box keep showing their proper label instead of a raw slug.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 9: Searching company through jsonb

**Files:**
- Modify: `src/lib/search-filter.ts` (`buildAttendeeSearchFilter`)
- Test: `tests/search-filter.test.ts`

**Interfaces:**
- Produces: `buildAttendeeSearchFilter(term)` returning a PostgREST `or` body that matches name, email and `extra->>company`.

- [ ] **Step 1: Write the failing test**

```ts
it("matches company inside extra, now that it is a field", () => {
  expect(buildAttendeeSearchFilter("eco"))
    .toBe("name.ilike.%eco%,email.ilike.%eco%,extra->>company.ilike.%eco%");
});

it("leaves the crew-facing name filter exactly as narrow as it was", () => {
  // D98/D99: the booth route is unauthenticated, so its search must not be usable as an
  // inference channel. Widening this is a privacy change, not a refactor.
  expect(buildNameSearchFilter("eco")).toBe("name.ilike.%eco%");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/search-filter.test.ts`
Expected: FAIL — the filter still names the `company` column.

- [ ] **Step 3: Write minimal implementation**

```ts
/** Builds the `or(...)` filter body matching name, email or the company field. */
export function buildAttendeeSearchFilter(term: string): string {
  return `name.ilike.%${term}%,email.ilike.%${term}%,extra->>company.ilike.%${term}%`;
}
```

- [ ] **Step 4: Run the suite and check it against the database**

Run: `npx vitest run`, then in the admin attendee list search for part of a company name
and confirm hits still come back. If the event's data has not been backfilled yet, search
falls back to nothing for company — expected until migration 0014 runs, and the reason
Task 10 runs it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/search-filter.ts tests/search-filter.test.ts
git commit -m "$(cat <<'MSG'
searching company means searching a field now

The wide filter names extra->>company instead of the column. The name-only
filter the booth route uses is untouched: D98/D99 treat it as an inference
channel, and widening it would be a privacy change wearing a refactor's clothes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 10: Migration 0014 — definitions and data

**Files:**
- Create: `supabase/migrations/0014_fields_expand.sql`
- Modify: `docs/runbook.md`

**Interfaces:**
- Consumes: nothing in code. Produces the data every earlier task's fallback is waiting to stop needing.

- [ ] **Step 1: Write the migration**

```sql
-- Expand step: company, phone and table_no become ordinary event fields.
--
-- Additive on purpose. The columns and events.collected_fields both stay, because the code
-- deployed alongside this reads `extra` first and falls back to the column — so this may be
-- applied after the deploy, and the deploy may be rolled back without stranding any data.
-- A later migration drops them, once the queries in the runbook come back zero.

-- 1. Field definitions. company and phone become registration questions, because that is
--    what the public form asked for them until now; table_no becomes an attendee column,
--    because it is assigned after seating and imported, never asked at sign-up.
update events set registration_questions = registration_questions ||
  jsonb_build_object('key','company','label','Company','type','text','required',false)
where 'company' = any(collected_fields)
  and not registration_questions @> '[{"key":"company"}]'::jsonb
  and not attendee_fields        @> '[{"key":"company"}]'::jsonb;

update events set registration_questions = registration_questions ||
  jsonb_build_object('key','phone','label','Mobile','type','phone','required',false)
where 'phone' = any(collected_fields)
  and not registration_questions @> '[{"key":"phone"}]'::jsonb
  and not attendee_fields        @> '[{"key":"phone"}]'::jsonb;

update events set attendee_fields = attendee_fields ||
  jsonb_build_object('key','table_no','label','Table','type','text')
where 'table_no' = any(collected_fields)
  and not registration_questions @> '[{"key":"table_no"}]'::jsonb
  and not attendee_fields        @> '[{"key":"table_no"}]'::jsonb;

-- 2. The values. `|| extra` last means an existing extra key always wins over the column.
update attendees set extra = jsonb_strip_nulls(jsonb_build_object(
    'company', company, 'phone', phone, 'table_no', table_no)) || extra
where company is not null or phone is not null or table_no is not null;

-- 3. The scan card showed Company, Category and Table by name. Category still shows; the
--    other two are fields now, so seed them as this event's chosen scan fields — otherwise
--    crew lose two lines they have been reading all along.
update events set scan_extra_fields = (
  select array_agg(k) from (
    select unnest(array['company','table_no']) as k
  ) legacy where k = any(collected_fields)
) || scan_extra_fields
where scan_extra_fields = '{}' and collected_fields && array['company','table_no'];
```

- [ ] **Step 2: Apply it and verify**

Run each statement in the Supabase SQL editor, then these three — all must return 0:

```sql
select count(*) from attendees where company  is not null and not extra ? 'company';
select count(*) from attendees where phone    is not null and not extra ? 'phone';
select count(*) from attendees where table_no is not null and not extra ? 'table_no';
```

and this, which must return one row per event that collects anything:

```sql
select slug, registration_questions, attendee_fields, scan_extra_fields from events;
```

- [ ] **Step 3: Write the runbook section**

Append to `docs/runbook.md` a section titled "Attendee fields: expand (migration 0014)"
containing the SQL above, the three verification queries, and this ordering note verbatim:

> Deploy the code first, then apply this migration. The deployed code reads `extra` and
> falls back to the old column, so it is correct either side of the migration — but between
> the deploy and the migration an event has no field definitions, so Company, Mobile and
> Table are missing from the attendee table and the scan card. Keep that window to minutes,
> and never open it during a live event.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0014_fields_expand.sql docs/runbook.md
git commit -m "$(cat <<'MSG'
feat(db): migration 0014, fields expand

Gives every event real field definitions for whatever it collects today, copies
each attendee's company, phone and table into extra, and seeds the scan card
with the two lines it used to print by name. Additive: the columns and
collected_fields stay, so this may be applied after the deploy and the deploy
may be rolled back.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 11: The admin surfaces

**Files:**
- Modify: `src/components/admin/AttendeeTable.tsx` (`cellValue`, the row type)
- Modify: `src/components/admin/AttendeeDetail.tsx:74,99-102`
- Modify: `src/app/admin/events/[id]/attendees/page.tsx:124-127`
- Modify: `src/app/admin/events/[id]/actions.ts` (attendee create/update actions)

**Interfaces:**
- Consumes: `fieldValue` (Task 1), `eventFields` (existing), `bulkFields` (Task 6).

- [ ] **Step 1: Replace the hardcoded inputs with the event's fields**

In the add-attendee form and `AttendeeDetail`, delete the three
`ev.collected_fields.includes(…)` inputs and render the event's fields through the existing
`FieldInputs` component, which already posts `f_<key>` names that `fieldValuesFromForm`
reads back:

```tsx
// AttendeeDetail.tsx — replacing the Mobile / Company / Table inputs
<FieldInputs fields={eventFields(ev.registration_questions, ev.attendee_fields)} values={a.extra} />
```

```tsx
// attendees/page.tsx — the add-attendee dialog, same replacement with no values
<FieldInputs fields={eventFields(ev.registration_questions, ev.attendee_fields)} />
```

If the detail panel already renders `FieldInputs` further down for the custom columns,
delete that second copy rather than rendering two — every field belongs in one list now.

The Table badge at `AttendeeDetail.tsx:74` becomes:

```tsx
{fieldValue(a, "table_no") && <Badge variant="secondary">Table {fieldValue(a, "table_no")}</Badge>}
```

In `AttendeeTable`, `cellValue` loses its `company`/`table_no` cases and falls through to
the field lookup:

```ts
    case "email": return a.email;
    case "category": return a.category;
    // company, phone and table_no are fields now — they arrive through `values`, which is
    // built from the event's fields, exactly like Dietary.
```

In the attendee create/update actions, stop reading `company`, `phone` and `table_no` from
the form and let `fieldValuesFromForm` carry them in `extra`.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src tests`
Expected: clean. Any error naming `a.company` is a call site still to move.

- [ ] **Step 3: Verify in the browser**

With migration 0014 applied to the dev project: open the attendee list, confirm Company,
Mobile and Table appear as columns with their values; open one attendee, edit the company,
save, and confirm it persists; bulk-edit Table across two attendees; import a masterlist
with Company/Mobile/Table headers and confirm the values land.

- [ ] **Step 4: Run the suite**

Run: `npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add src/components/admin src/app/admin
git commit -m "$(cat <<'MSG'
feat(admin): the attendee form and table render fields

Three hardcoded inputs gated on collected_fields become whatever fields the
event has, rendered by the component that already handles every other one. The
table reads them the same way, so Company sits beside Dietary instead of ahead
of it in a section of its own.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 12: The portal surfaces

**Files:**
- Modify: `src/app/e/[slug]/a/[token]/me/page.tsx:43-48`
- Modify: `src/app/e/[slug]/a/[token]/seat/page.tsx:14`
- Modify: `src/components/portal/BadgeCard.tsx:27`

**Interfaces:**
- Consumes: `fieldValue` (Task 1).

- [ ] **Step 1: Read the three surfaces through fields**

`me/page.tsx`: delete the `collects` set. The "answered" list already walks `eventFields`,
which now includes company, phone and table — so the contact block keeps only email:

```tsx
  const contactDetails = attendee.email ? [{ label: "Email", value: attendee.email }] : [];
```

`seat/page.tsx`:

```tsx
  const table = fieldValue(attendee, "table_no");
  // …
  {table ? ( /* the table card, rendering {table} */ ) : ( /* the "once seating is confirmed" line */ )}
```

`BadgeCard.tsx`:

```tsx
  const company = fieldValue(attendee, "company");
  // …
  {company && <div className="truncate text-xs font-medium text-background/70">{company}</div>}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Verify in the browser**

Open an attendee's portal link: the badge shows their company, `/seat` shows their table,
`/me` lists every answer once — check in particular that Mobile appears exactly once, not
both in the contact block and in the answers list.

- [ ] **Step 4: Run the suite**

Run: `npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add "src/app/e/[slug]/a/[token]/me/page.tsx" "src/app/e/[slug]/a/[token]/seat/page.tsx" src/components/portal/BadgeCard.tsx
git commit -m "$(cat <<'MSG'
feat(portal): badge, seat and profile read fields

The profile listed Mobile in a contact block gated on collected_fields and then
risked listing it again as an answer; it now appears once, with the rest. The
badge and the seat page read their values through fieldValue.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 13: Exports, with their column order intact

**Files:**
- Modify: `src/lib/exports.ts` (`LinkRow`, `RosterPerson`, the three sheet builders)
- Modify: `src/app/admin/events/[id]/export/links.xlsx/route.ts` and the exports page
- Test: `tests/exports.test.ts`

**Interfaces:**
- Produces: sheet builders that take attendees and an `AttendeeField[]`, emitting the legacy
  columns in their existing positions.

- [ ] **Step 1: Write the failing test**

```ts
it("keeps the sheet's column order after company became a field", () => {
  const rows = [{ name: "Sam", email: "s@x.com", category: "VIP", extra: { phone: "012", company: "Ecopia", table_no: "7" } }];
  expect(attendeeSheetRow(rows[0], [])).toEqual(["Sam", "s@x.com", "012", "Ecopia", "VIP", "7", undefined]);
});
```

Adjust the helper name to whatever the file exposes; if the row assembly is inline, extract
it to a named exported function first so it can be tested, and keep that extraction in the
same commit.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/exports.test.ts`
Expected: FAIL — the builder reads `a.phone`, which is undefined on this row.

- [ ] **Step 3: Write minimal implementation**

Read each of the three through `fieldValue(a, key)` while leaving the header row and the
column order exactly as they are:

```ts
  const row: (string | null)[] = [
    a.name, a.email, fieldValue(a, "phone"), fieldValue(a, "company"), a.category, fieldValue(a, "table_no"),
    a.source, ...extraColumns.map((c) => a.extra?.[c.key] ?? ""),
  ];
```

Exclude the three legacy keys from `extraColumns` so a value cannot be emitted twice.

- [ ] **Step 4: Run the suite and download a real sheet**

Run: `npx vitest run`, then download the attendee export from the admin and open it:
the columns must read Name, Email, Phone, Company, Category, Table, Source, then extras,
with no duplicated column.

- [ ] **Step 5: Commit**

```bash
git add src/lib/exports.ts tests/exports.test.ts "src/app/admin/events/[id]/export" "src/app/admin/events/[id]/exports"
git commit -m "$(cat <<'MSG'
feat(exports): same columns, read as fields

A client's process may read these sheets by position, so Phone, Company and
Table keep their places rather than drifting into the extras block. They are
read through fieldValue and excluded from the extras so nothing is emitted
twice.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 14: Delete collected_fields from the app

**Files:**
- Delete: `src/lib/collected-fields.ts`, `tests/collected-fields.test.ts`
- Modify: `src/lib/types.ts` (drop `collected_fields` from `Event`)
- Modify: `src/lib/db/events.ts` (drop `parseCollectedFields` from `hydrate`)
- Modify: `src/app/admin/events/[id]/settings/page.tsx` (delete the "What this event collects" card)
- Modify: `src/app/admin/events/[id]/actions.ts` (drop `collected_fields` from `updateSettingsAction`)

**Interfaces:**
- Produces: `Event` with no `collected_fields`. The database column stays until the contract step.

- [ ] **Step 1: Delete the module and its consumers**

```bash
git rm src/lib/collected-fields.ts tests/collected-fields.test.ts
```

Then remove the `Event.collected_fields` member, the `hydrate` line, the settings card and
its `COLLECTED_FIELDS` import, and the `collected_fields:` line in `updateSettingsAction`.

- [ ] **Step 2: Typecheck — the compiler is the checklist**

Run: `npx tsc --noEmit`
Expected: every remaining error names a call site that still reads `collected_fields`. Fix
each by reading the field instead; there should be none left after Tasks 6–13.

- [ ] **Step 3: Run the suite and lint**

Run: `npx vitest run && npx eslint src tests`
Expected: PASS and clean. The suite should be smaller by exactly the deleted file's tests.

- [ ] **Step 4: Verify in the browser**

Settings → Event details no longer shows "What this event collects"; saving Settings still
works and does not blank anything; the attendee table, badge, scan card and exports all
still show company, mobile and table.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'MSG'
feat(settings): retire "What this event collects"

The panel read as a rule about what is compulsory and was not one: it named
name, email and category as always collected, then offered three fixed toggles
for facts that are no more built-in than dietary requirements. Whether an event
collects something is now answered by whether a field for it exists.

events.collected_fields stays in the database until the contract step — nothing
reads it any more.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Done when

- `grep -rn "collected_fields" src` returns nothing.
- `grep -rn "\.company\b\|\.table_no\b\|\.phone\b" src` returns only `fieldValue`'s own fallback in `src/lib/attendee-values.ts`.
- `npx vitest run`, `npx tsc --noEmit` and `npx eslint src tests` are all clean.
- Migration 0014 is applied and its three verification queries return zero.
- On the pilot event: the attendee table shows Company, Mobile and Table; a scan shows
  Category, Company and Table; the badge shows the company; `/seat` shows the table; the
  attendee export's columns are unmoved.

## Not in this plan

- Dropping the columns and `collected_fields` — the contract step, its own plan, days later.
- `purgeAttendeePersonalData` keeps nulling the legacy columns as well as emptying `extra`.
  That is correct while both exist: a purge must clear the value wherever it is sitting.
  The column half goes with the columns, in the contract step.
- The scan-card combobox, the cap rising to 4, and moving the section to the Checkpoints
  tab — its own plan, after this one.
