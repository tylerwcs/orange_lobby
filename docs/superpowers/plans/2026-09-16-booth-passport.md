# Booth Passport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let booth staff stamp an attendee's badge from a printed link, and give the attendee a card that fills up as they walk the room.

**Architecture:** Two new tables — `booths` (a stand, with its own scanner token) and `booth_stamps` (`unique (booth_id, attendee_id)`, so one stamp per booth per event). All derivation is pure functions in `src/lib/booths.ts` over rows the database already returns. The booth scanner is a public route authorised by the booth's token alone, reusing the crew scanner's anatomy but none of its `requireAdmin` path. The attendee's card is a portal route reached through a `TILE_ROUTES` tile.

**Tech Stack:** Next.js 16.3.4 (App Router, server components, server actions), React 19.2.8, Tailwind CSS v4, TypeScript 5, Vitest 5 (node environment, `tests/**/*.test.ts`, `@` aliased to `src`), Supabase (`serviceClient()`, no RLS), ExcelJS, html5-qrcode, qrcode.

**Spec:** `docs/superpowers/specs/2026-09-16-booth-passport-design.md`

**Mockups:** `.design/booth-passport/` — `Main.dc.html` (card in progress), `PassComplete.dc.html`, `PassLocked.dc.html`, `BoothScan.dc.html`, `BoothDupe.dc.html`, `AdminBooths.dc.html`, `BoothPrint.dc.html`.

## Global Constraints

- **Branch from `main`** (clean at 174c70d). Do not stack on an unmerged branch.
- **Migration 0010 is applied at merge, not during implementation.** Production has live registration. Until then, code must build and tests must pass without the tables existing.
- **The print sheet (Task 5) must be done before 24 Sep** — that is when badges and signage go to print. Freeze is 26 Sep.
- **A booth never sees more than a name and a category.** No company, no table, no phone, no email reaches `/booth/<token>` — not in a server action's return type, not in a props object (spec D98, D99).
- **A booth never creates an attendee.** No walk-in path on the booth scanner (D99).
- `Attendee.token` is 12 characters from `TOKEN_ALPHABET` (`abcdefghjkmnpqrstuvwxyz23456789`). Booth tokens use the same `generateToken()` and the same `isValidToken()` check.
- Pure libraries under `src/lib/*.ts` are unit-tested. `src/lib/db/*.ts` is `server-only` and has no unit tests — it is verified by `tsc`, the build, and the user's click-through.
- Admin pages are login-gated and the booth scanner needs a camera; Claude can verify neither. Portal pages can be driven in the browser pane.
- Touch targets stay >= 44px. Numbers use `tabular-nums`. No dark mode. Colours come from tokens in `src/app/globals.css` — never a literal hex in a component.
- Run `npm run lint` and `npm test` before every commit.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## Two notes on coverage

**Spec D97 has no task, on purpose.** Collecting the prize is a checkpoint named "Prize counter",
created through the existing Settings UI and scanned with the existing crew scanner. There is no
code to write; it is on the verification checklist at the end instead. If you find yourself building
a redemption screen, stop — that is the subsystem the spec declined.

**Tasks 4, 5 and 6 point their UI steps at an existing component and a mockup rather than inlining
the JSX.** `BoothScanner.tsx` mirrors `src/app/scan/[eventId]/Scanner.tsx`, and the three portal and
admin surfaces are drawn pixel-by-pixel in `.design/booth-passport/`. Reproducing ~700 lines of JSX
here would give the implementer a second source of truth that drifts from the first. Read the named
file and the named artboard; the steps list every place the new surface deliberately departs from
them, and those departures are the part that matters.

---

### Task 1: Schema and types

**Files:**
- Create: `supabase/migrations/0010_booths.sql`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Booth = { id, org_id, event_id, name, location: string | null, token, sort_order }`, `BoothStamp = { id, org_id, event_id, booth_id, attendee_id, stamped_at }`, and `Event.stamps_required: number | null`, `Event.stamps_message: string | null`.

No unit test: DDL has no behaviour to assert from node, and the migration is not applied during implementation. Verified by `tsc`, the build, and reading the SQL.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0010_booths.sql`:

```sql
-- Booth Passport: a stand an attendee visits, and the chop they collect there.
--
-- A booth is deliberately NOT a checkpoint with a kind (D89). A checkpoint is a moment on a
-- date that crew work, and its `day` is `not null`; a booth stands for the whole event and has
-- no day. Sharing the table would have inherited dedupe, undo and the export for free, at the
-- price of a `kind` filter on every door-side query — activeCheckpoint(), the Overview counts,
-- the scanner's landing screen — that is invisible when forgotten and lands the crew on a booth.
create table booths (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  location text,
  -- The booth's authority to stamp (D91). Unique across the table, not per event: it is looked
  -- up on its own, before any event is known. Same alphabet and length as an attendee token.
  token text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index booths_event_idx on booths (event_id, sort_order);

-- One stamp per booth per attendee for the WHOLE event (D92): a second scan on day two is an
-- "already stamped" carrying the original time, not a second stamp.
--
-- No `scanned_by`. The scan is authorised by a booth token rather than by a user, so there is
-- no auth.users id to record; the booth is the booth_id.
create table booth_stamps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  event_id uuid not null references events(id) on delete cascade,
  booth_id uuid not null references booths(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,
  stamped_at timestamptz not null default now(),
  unique (booth_id, attendee_id)
);

create index booth_stamps_event_idx on booth_stamps (event_id);
create index booth_stamps_attendee_idx on booth_stamps (attendee_id);

alter table booths enable row level security;
alter table booth_stamps enable row level security;
-- No policies on purpose: only the service role (which bypasses RLS) may access data.

-- How many stamps fill the card, and what to say when it does (D95, D96). Null `stamps_required`
-- means "all booths", so an event that adds a booth before setting a target still behaves.
alter table events add column stamps_required int;
alter table events add column stamps_message text;
```

- [ ] **Step 2: Add the types**

In `src/lib/types.ts`, add two fields to `Event` immediately after `collected_fields`:

```ts
  /** How many stamps fill the Booth Passport. Null means every booth this event has. */
  stamps_required: number | null;
  /** What the passport says when it is full. Admin-authored, because the prize is decided late. */
  stamps_message: string | null;
```

And after the `Checkin` type, add:

```ts
export type Booth = {
  id: string;
  org_id: string;
  event_id: string;
  name: string;
  location: string | null;
  /** The booth's scanner authority. Printed as a QR; never shown to attendees. */
  token: string;
  sort_order: number;
};

export type BoothStamp = {
  id: string;
  org_id: string;
  event_id: string;
  booth_id: string;
  attendee_id: string;
  stamped_at: string;
};
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0010_booths.sql src/lib/types.ts
git commit -m "feat(booths): schema and types for the Booth Passport

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The passport, as pure functions

**Files:**
- Create: `src/lib/booths.ts`
- Create: `tests/booths.test.ts`
- Modify: `src/lib/links.ts`
- Modify: `tests/links.test.ts`

**Interfaces:**
- Consumes: `Booth`, `BoothStamp` from Task 1.
- Produces:
  - `stampsTarget(boothCount: number, required: number | null): number`
  - `buildPassport(booths: Booth[], stamps: BoothStamp[], required: number | null): Passport`
  - `type PassportCell = { booth: Booth; stampedAt: string | null }`
  - `type Passport = { cells: PassportCell[]; collected: number; target: number; remaining: number; complete: boolean; completedAt: string | null }`
  - `progressLine(p: Pick<Passport, "collected" | "target" | "remaining" | "complete">): string`
  - `completionByAttendee(booths: Booth[], stamps: BoothStamp[], required: number | null): Map<string, { collected: number; complete: boolean }>`
  - `boothScannerLink(base: string, token: string): string` in `src/lib/links.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/booths.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPassport, completionByAttendee, progressLine, stampsTarget } from "@/lib/booths";
import type { Booth, BoothStamp } from "@/lib/types";

const booth = (id: string, sort_order = 0): Booth => ({
  id, org_id: "o", event_id: "e", name: id, location: null, token: `tok${id}`, sort_order,
});
const stamp = (booth_id: string, attendee_id: string, stamped_at: string): BoothStamp => ({
  id: `${booth_id}-${attendee_id}`, org_id: "o", event_id: "e", booth_id, attendee_id, stamped_at,
});

describe("stampsTarget", () => {
  it("is the booth count when no target is configured", () => {
    expect(stampsTarget(5, null)).toBe(5);
  });

  it("is the configured target when it is lower than the booth count", () => {
    expect(stampsTarget(5, 3)).toBe(3);
  });

  // A booth deleted after the target was typed must not leave the card asking for 7 of 5.
  it("clamps a target above the booth count", () => {
    expect(stampsTarget(5, 7)).toBe(5);
  });

  it("is zero when the event has no booths", () => {
    expect(stampsTarget(0, 3)).toBe(0);
  });

  it("treats a zero or negative target as every booth", () => {
    expect(stampsTarget(4, 0)).toBe(4);
    expect(stampsTarget(4, -1)).toBe(4);
  });
});

describe("buildPassport", () => {
  const booths = [booth("b1", 0), booth("b2", 1), booth("b3", 2)];

  it("marks a cell for every booth, stamped or not, in the order given", () => {
    const p = buildPassport(booths, [stamp("b2", "a1", "2026-09-30T02:41:00Z")], null);
    expect(p.cells.map((c) => c.booth.id)).toEqual(["b1", "b2", "b3"]);
    expect(p.cells.map((c) => c.stampedAt)).toEqual([null, "2026-09-30T02:41:00Z", null]);
  });

  it("counts what is collected and what is left", () => {
    const p = buildPassport(booths, [
      stamp("b1", "a1", "2026-09-30T02:24:00Z"),
      stamp("b2", "a1", "2026-09-30T02:41:00Z"),
    ], null);
    expect(p.collected).toBe(2);
    expect(p.target).toBe(3);
    expect(p.remaining).toBe(1);
    expect(p.complete).toBe(false);
    expect(p.completedAt).toBeNull();
  });

  // The card fills at the target, not at the last booth — completedAt is the moment it filled.
  it("completes at the target and reports when it filled", () => {
    const p = buildPassport(booths, [
      stamp("b1", "a1", "2026-09-30T02:24:00Z"),
      stamp("b3", "a1", "2026-09-30T07:42:00Z"),
      stamp("b2", "a1", "2026-09-30T03:05:00Z"),
    ], 2);
    expect(p.complete).toBe(true);
    expect(p.remaining).toBe(0);
    // Second-earliest stamp: b1 02:24, then b2 03:05.
    expect(p.completedAt).toBe("2026-09-30T03:05:00Z");
  });

  it("ignores stamps belonging to booths that no longer exist", () => {
    const p = buildPassport(booths, [stamp("gone", "a1", "2026-09-30T02:24:00Z")], null);
    expect(p.collected).toBe(0);
  });

  it("is never complete when the event has no booths", () => {
    const p = buildPassport([], [], null);
    expect(p.target).toBe(0);
    expect(p.complete).toBe(false);
  });
});

describe("progressLine", () => {
  it("counts down to the target", () => {
    expect(progressLine({ collected: 2, target: 5, remaining: 3, complete: false })).toBe("2 of 5 · 3 more to go");
  });

  it("uses the singular for the last one", () => {
    expect(progressLine({ collected: 4, target: 5, remaining: 1, complete: false })).toBe("4 of 5 · 1 more to go");
  });

  it("says so when the card is full", () => {
    expect(progressLine({ collected: 5, target: 5, remaining: 0, complete: true })).toBe("5 of 5 · card full");
  });

  it("says nothing numeric when there are no booths", () => {
    expect(progressLine({ collected: 0, target: 0, remaining: 0, complete: false })).toBe("No booths yet");
  });
});

describe("completionByAttendee", () => {
  const booths = [booth("b1"), booth("b2"), booth("b3")];

  it("counts each attendee separately and only counts live booths", () => {
    const m = completionByAttendee(booths, [
      stamp("b1", "a1", "2026-09-30T02:24:00Z"),
      stamp("b2", "a1", "2026-09-30T02:41:00Z"),
      stamp("gone", "a1", "2026-09-30T02:50:00Z"),
      stamp("b1", "a2", "2026-09-30T03:00:00Z"),
    ], 2);
    expect(m.get("a1")).toEqual({ collected: 2, complete: true });
    expect(m.get("a2")).toEqual({ collected: 1, complete: false });
  });

  it("has no entry for an attendee with no stamps", () => {
    const m = completionByAttendee(booths, [], null);
    expect(m.get("a3")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/booths.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/booths"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/booths.ts`:

```ts
import type { Booth, BoothStamp } from "@/lib/types";

export type PassportCell = { booth: Booth; stampedAt: string | null };

export type Passport = {
  /** Every booth this event has, in admin order — unstamped ones included (D102). */
  cells: PassportCell[];
  collected: number;
  target: number;
  remaining: number;
  complete: boolean;
  /** When the card filled: the time of the target-th stamp, not of the latest one. */
  completedAt: string | null;
};

/**
 * How many stamps this event asks for.
 *
 * Clamped to the booths that actually exist, because `stamps_required` is a number an
 * organiser typed and a booth can be deleted after they typed it — and "7 of 5" on an
 * attendee's phone is a card that can never be finished.
 */
export function stampsTarget(boothCount: number, required: number | null): number {
  if (boothCount === 0) return 0;
  if (required === null || required <= 0) return boothCount;
  return Math.min(required, boothCount);
}

/**
 * One attendee's card. Takes the event's booths and only that attendee's stamps.
 *
 * A stamp whose booth is gone is ignored rather than counted: it can only exist if a booth
 * was deleted before its first stamp check, and counting it would let the total exceed the
 * number of cells on screen.
 */
export function buildPassport(booths: Booth[], stamps: BoothStamp[], required: number | null): Passport {
  const byBooth = new Map(stamps.map((s) => [s.booth_id, s]));
  const cells: PassportCell[] = booths.map((b) => ({ booth: b, stampedAt: byBooth.get(b.id)?.stamped_at ?? null }));
  const times = cells.map((c) => c.stampedAt).filter((t): t is string => t !== null).sort();
  const target = stampsTarget(booths.length, required);
  const collected = times.length;
  const complete = target > 0 && collected >= target;
  return {
    cells,
    collected,
    target,
    remaining: Math.max(0, target - collected),
    complete,
    completedAt: complete ? times[target - 1] : null,
  };
}

/** The one line the card and the booth scanner both show. */
export function progressLine(p: Pick<Passport, "collected" | "target" | "remaining" | "complete">): string {
  if (p.target === 0) return "No booths yet";
  if (p.complete) return `${p.collected} of ${p.target} · card full`;
  return `${p.collected} of ${p.target} · ${p.remaining} more to go`;
}

/**
 * Every attendee who has at least one stamp, with how far along they are. Feeds the admin's
 * completed count and the passport export; an attendee with no stamps has no entry, and the
 * callers treat a missing entry as zero.
 */
export function completionByAttendee(
  booths: Booth[],
  stamps: BoothStamp[],
  required: number | null,
): Map<string, { collected: number; complete: boolean }> {
  const live = new Set(booths.map((b) => b.id));
  const target = stampsTarget(booths.length, required);
  const counts = new Map<string, number>();
  for (const s of stamps) {
    if (!live.has(s.booth_id)) continue;
    counts.set(s.attendee_id, (counts.get(s.attendee_id) ?? 0) + 1);
  }
  const out = new Map<string, { collected: number; complete: boolean }>();
  for (const [attendeeId, collected] of counts) {
    out.set(attendeeId, { collected, complete: target > 0 && collected >= target });
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/booths.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Add the booth link helper and its test**

In `src/lib/links.ts`, add after `registrationLink`:

```ts
/**
 * The booth's scanner. Not under /e/<slug>: it is staff-facing, it is not part of the
 * attendee portal, and the token is looked up on its own before any event is known.
 */
export function boothScannerLink(base: string, token: string) {
  return `${trimSlash(base)}/booth/${token}`;
}
```

In `tests/links.test.ts`, add:

```ts
import { boothScannerLink } from "@/lib/links";

describe("boothScannerLink", () => {
  it("points at the staff route, outside the attendee portal", () => {
    expect(boothScannerLink("https://events.example.com", "k7m2xq9rt4bd"))
      .toBe("https://events.example.com/booth/k7m2xq9rt4bd");
  });

  it("tolerates a trailing slash on the base", () => {
    expect(boothScannerLink("https://events.example.com/", "k7m2xq9rt4bd"))
      .toBe("https://events.example.com/booth/k7m2xq9rt4bd");
  });
});
```

- [ ] **Step 6: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/booths.ts tests/booths.test.ts src/lib/links.ts tests/links.test.ts
git commit -m "feat(booths): passport arithmetic and the booth scanner link

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Database access

**Files:**
- Create: `src/lib/db/booths.ts`

**Interfaces:**
- Consumes: `Booth`, `BoothStamp`, `Event` from Task 1.
- Produces:
  - `listBooths(eventId: string): Promise<Booth[]>`
  - `getBoothByToken(token: string): Promise<Booth | null>`
  - `createBooth(event: Pick<Event, "id" | "org_id">, name: string, location: string | null): Promise<void>`
  - `updateBooth(id: string, eventId: string, patch: { name: string; location: string | null }): Promise<void>`
  - `setBoothOrder(eventId: string, orderedIds: string[]): Promise<void>`
  - `deleteBoothIfUnstamped(id: string, eventId: string): Promise<boolean>`
  - `recordStamp(booth: Booth, attendeeId: string): Promise<{ created: boolean; existing?: BoothStamp }>`
  - `deleteStamp(boothId: string, attendeeId: string): Promise<boolean>`
  - `listStampsForEvent(eventId: string): Promise<BoothStamp[]>`
  - `stampsForAttendee(attendeeId: string): Promise<BoothStamp[]>`
  - `countStampsByBooth(eventId: string): Promise<Record<string, number>>`

No unit test: `src/lib/db/*.ts` is `server-only` and is verified by `tsc`, the build and the user's click-through, exactly as `src/lib/db/checkins.ts` is.

- [ ] **Step 1: Write the module**

Create `src/lib/db/booths.ts`:

```ts
import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { generateToken } from "@/lib/tokens";
import type { Booth, BoothStamp, Event } from "@/lib/types";

export async function listBooths(eventId: string): Promise<Booth[]> {
  const { data, error } = await serviceClient().from("booths").select("*")
    .eq("event_id", eventId).order("sort_order").order("created_at");
  if (error) throw error;
  return data as Booth[];
}

/**
 * The booth behind a scanner link. Looked up by token alone — there is no event in the URL,
 * and the token is unique across the table for exactly that reason.
 */
export async function getBoothByToken(token: string): Promise<Booth | null> {
  const { data, error } = await serviceClient().from("booths").select("*").eq("token", token).maybeSingle();
  if (error) throw error;
  return (data as Booth | null) ?? null;
}

/** Appends to the end: a new booth is the next stand, not the first. */
export async function createBooth(event: Pick<Event, "id" | "org_id">, name: string, location: string | null) {
  const db = serviceClient();
  const { data: last } = await db.from("booths").select("sort_order")
    .eq("event_id", event.id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const sort_order = (last?.sort_order ?? -1) + 1;
  const { error } = await db.from("booths")
    .insert({ org_id: event.org_id, event_id: event.id, name, location, token: generateToken(), sort_order });
  if (error) throw error;
}

/**
 * Renaming is always allowed, including for a booth that has stamped people: the stamps point
 * at the row, not at its name, so nothing is lost (D94).
 */
export async function updateBooth(id: string, eventId: string, patch: { name: string; location: string | null }) {
  const { error } = await serviceClient().from("booths").update(patch).eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}

/** Scoped by event id as well as row id, so a posted id from another event updates nothing. */
export async function setBoothOrder(eventId: string, orderedIds: string[]) {
  const db = serviceClient();
  for (const [index, id] of orderedIds.entries()) {
    const { error } = await db.from("booths").update({ sort_order: index }).eq("id", id).eq("event_id", eventId);
    if (error) throw error;
  }
}

/**
 * Deletes a booth only while nobody has stamped there (D94). Deleting a stamped booth would
 * cascade its stamps away and silently drop attendees out of "completed" — so the count is
 * checked here rather than trusted to a disabled button, which a second tab does not have.
 *
 * Returns false when the booth has stamps; the caller turns that into a message.
 */
export async function deleteBoothIfUnstamped(id: string, eventId: string): Promise<boolean> {
  const db = serviceClient();
  const { count, error: countError } = await db.from("booth_stamps")
    .select("id", { count: "exact", head: true }).eq("booth_id", id);
  if (countError) throw countError;
  if ((count ?? 0) > 0) return false;
  const { error } = await db.from("booths").delete().eq("id", id).eq("event_id", eventId);
  if (error) throw error;
  return true;
}

/**
 * One stamp. The unique constraint on (booth_id, attendee_id) is what makes a second scan a
 * duplicate rather than a second chop — the same shape `recordCheckin` uses, for the same
 * reason: the check has to happen in the database, not in a read-then-write.
 */
export async function recordStamp(booth: Booth, attendeeId: string): Promise<{ created: boolean; existing?: BoothStamp }> {
  const db = serviceClient();
  const { error } = await db.from("booth_stamps")
    .insert({ org_id: booth.org_id, event_id: booth.event_id, booth_id: booth.id, attendee_id: attendeeId });
  if (!error) return { created: true };
  if (error.code === "23505") {
    const { data } = await db.from("booth_stamps").select("*")
      .eq("booth_id", booth.id).eq("attendee_id", attendeeId).single();
    return { created: false, existing: data as BoothStamp };
  }
  throw error;
}

/** The booth scanner's Undo. Returns whether a row was deleted. */
export async function deleteStamp(boothId: string, attendeeId: string): Promise<boolean> {
  const { data, error } = await serviceClient().from("booth_stamps").delete()
    .eq("booth_id", boothId).eq("attendee_id", attendeeId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function listStampsForEvent(eventId: string): Promise<BoothStamp[]> {
  const { data, error } = await serviceClient().from("booth_stamps").select("*").eq("event_id", eventId);
  if (error) throw error;
  return data as BoothStamp[];
}

export async function stampsForAttendee(attendeeId: string): Promise<BoothStamp[]> {
  const { data, error } = await serviceClient().from("booth_stamps").select("*").eq("attendee_id", attendeeId);
  if (error) throw error;
  return data as BoothStamp[];
}

export async function countStampsByBooth(eventId: string): Promise<Record<string, number>> {
  const rows = await listStampsForEvent(eventId);
  return rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.booth_id] = (acc[r.booth_id] ?? 0) + 1;
    return acc;
  }, {});
}
```

- [ ] **Step 2: Verify it compiles and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/booths.ts
git commit -m "feat(booths): database access for booths and stamps

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The booth scanner

**Files:**
- Create: `src/app/booth/[token]/page.tsx`
- Create: `src/app/booth/[token]/actions.ts`
- Create: `src/app/booth/[token]/BoothScanner.tsx`
- Reference (do not modify): `src/app/scan/[eventId]/Scanner.tsx`

**Interfaces:**
- Consumes: `listBooths`, `getBoothByToken`, `recordStamp`, `deleteStamp`, `stampsForAttendee` (Task 3); `buildPassport`, `progressLine` (Task 2); `extractToken`, `describeCameraError` from `src/lib/scan.ts`; `allow` from `src/lib/ratelimit.ts`.
- Produces:
  - `type BoothScanResult = { status: "ok" | "duplicate" | "notfound" | "error" | "undone"; name?: string; attendeeId?: string; progress?: string; collected?: number; target?: number; earlier?: { at: string }; message?: string }`
  - `type BoothHit = { id: string; name: string; category: string | null }`
  - `stampByTokenAction(boothToken: string, scanned: string): Promise<BoothScanResult>`
  - `stampByIdAction(boothToken: string, attendeeId: string): Promise<BoothScanResult>`
  - `undoStampAction(boothToken: string, attendeeId: string): Promise<BoothScanResult>`
  - `searchForBoothAction(boothToken: string, q: string): Promise<BoothHit[]>`

The result type carries a **name and a progress string, never an attendee object** — that is how D98 is enforced at the wire rather than in a component.

- [ ] **Step 1: Write the server actions**

Create `src/app/booth/[token]/actions.ts`:

```ts
"use server";
import { getEvent } from "@/lib/db/events";
import { findByToken, getAttendee, listAttendees } from "@/lib/db/attendees";
import { listBooths, getBoothByToken, recordStamp, deleteStamp, stampsForAttendee } from "@/lib/db/booths";
import { buildPassport, progressLine } from "@/lib/booths";
import { extractToken } from "@/lib/scan";
import { isValidToken } from "@/lib/tokens";
import { allow } from "@/lib/ratelimit";
import type { Booth, Event } from "@/lib/types";

/**
 * What crosses the wire to a booth: a name, and how far along that person is (D98).
 *
 * There is deliberately no `attendee` here. The crew scanner returns the whole row because a
 * door is identifying a guest; a booth is a stranger's stand, and after KOM it is a third
 * party. Keeping the shape this narrow means no component can leak a field by accident.
 */
export type BoothScanResult = {
  status: "ok" | "duplicate" | "notfound" | "error" | "undone";
  name?: string;
  attendeeId?: string;
  progress?: string;
  collected?: number;
  target?: number;
  earlier?: { at: string };
  message?: string;
};

export type BoothHit = { id: string; name: string; category: string | null };

/**
 * The booth token IS the authorisation (D91). No session, no org membership: whoever holds
 * the printed sheet may stamp, and may do nothing else.
 *
 * Rate-limited by token. `allow` is an in-memory Map, so on Vercel this is per-instance and
 * therefore weak — the same limit registration already relies on. It is a speed bump against
 * a loop, not a security control; the control is the 12-character token.
 */
async function authoriseBooth(boothToken: string): Promise<{ booth: Booth; event: Event } | { error: string }> {
  if (!isValidToken(boothToken)) return { error: "This scanner link is not valid." };
  if (!allow(`booth:${boothToken}`, 120, 60_000)) return { error: "Too many scans at once. Wait a moment and try again." };
  const booth = await getBoothByToken(boothToken);
  if (!booth) return { error: "This scanner link no longer works. Ask the organiser for a new one." };
  const event = await getEvent(booth.event_id);
  if (!event) return { error: "This scanner link no longer works. Ask the organiser for a new one." };
  if (event.status === "archived") return { error: "This event is closed, so stamping has finished." };
  return { booth, event };
}

/** The progress line for one attendee, computed after the write so the booth sees the new total. */
async function progressFor(event: Event, attendeeId: string): Promise<Pick<BoothScanResult, "progress" | "collected" | "target">> {
  const [booths, stamps] = await Promise.all([listBooths(event.id), stampsForAttendee(attendeeId)]);
  const p = buildPassport(booths, stamps, event.stamps_required);
  return { progress: progressLine(p), collected: p.collected, target: p.target };
}

async function stamp(booth: Booth, event: Event, attendeeId: string, name: string): Promise<BoothScanResult> {
  const r = await recordStamp(booth, attendeeId);
  const progress = await progressFor(event, attendeeId);
  return r.created
    ? { status: "ok", name, attendeeId, ...progress }
    : { status: "duplicate", name, attendeeId, ...progress, earlier: { at: r.existing!.stamped_at } };
}

export async function stampByTokenAction(boothToken: string, scanned: string): Promise<BoothScanResult> {
  const auth = await authoriseBooth(boothToken);
  if ("error" in auth) return { status: "error", message: auth.error };
  const token = extractToken(scanned);
  if (!token) return { status: "notfound", message: "That code isn't an attendee badge. Try the name search." };
  const a = await findByToken(auth.event.id, token);
  // A booth cannot create attendees (D99): an unknown badge is sent to registration, not added.
  if (!a) return { status: "notfound", message: "This badge isn't on the list for this event. Please see registration." };
  return stamp(auth.booth, auth.event, a.id, a.name);
}

export async function stampByIdAction(boothToken: string, attendeeId: string): Promise<BoothScanResult> {
  const auth = await authoriseBooth(boothToken);
  if ("error" in auth) return { status: "error", message: auth.error };
  const a = await getAttendee(attendeeId);
  if (!a || a.event_id !== auth.event.id) return { status: "notfound", message: "That attendee is no longer on the list." };
  return stamp(auth.booth, auth.event, a.id, a.name);
}

export async function undoStampAction(boothToken: string, attendeeId: string): Promise<BoothScanResult> {
  const auth = await authoriseBooth(boothToken);
  if ("error" in auth) return { status: "error", message: auth.error };
  const removed = await deleteStamp(auth.booth.id, attendeeId);
  if (!removed) return { status: "error", message: "Nothing to undo." };
  const a = await getAttendee(attendeeId);
  return { status: "undone", name: a?.name, attendeeId };
}

/**
 * The fallback when a camera will not start (D99). Name and category only — enough to tell two
 * Sarahs apart, and nothing a booth could harvest. The fields are dropped here, on the server,
 * rather than filtered in the component, so they never reach the booth's phone at all.
 */
export async function searchForBoothAction(boothToken: string, q: string): Promise<BoothHit[]> {
  const auth = await authoriseBooth(boothToken);
  if ("error" in auth) return [];
  if (q.trim().length < 2) return [];
  const rows = await listAttendees(auth.event.id, q);
  return rows.slice(0, 20).map((a) => ({ id: a.id, name: a.name, category: a.category }));
}
```

- [ ] **Step 2: Write the page**

Create `src/app/booth/[token]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getBoothByToken, listBooths, countStampsByBooth } from "@/lib/db/booths";
import { getEvent } from "@/lib/db/events";
import { countAttendees } from "@/lib/db/attendees";
import { isValidToken } from "@/lib/tokens";
import { stampsTarget } from "@/lib/booths";
import { BoothScanner } from "./BoothScanner";

// Never cached: the booth's own count must be live, and a stale page would re-stamp against a
// booth that has since been renamed.
export const dynamic = "force-dynamic";

export default async function BoothPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isValidToken(token)) notFound();
  const booth = await getBoothByToken(token);
  if (!booth) notFound();
  const event = await getEvent(booth.event_id);
  if (!event) notFound();

  const [booths, counts, total] = await Promise.all([
    listBooths(event.id),
    countStampsByBooth(event.id),
    countAttendees(event.id),
  ]);

  return (
    <BoothScanner
      boothToken={token}
      booth={{ name: booth.name, location: booth.location }}
      eventName={event.name}
      archived={event.status === "archived"}
      initialCount={counts[booth.id] ?? 0}
      total={total}
      target={stampsTarget(booths.length, event.stamps_required)}
    />
  );
}
```

- [ ] **Step 3: Write the client scanner**

Create `src/app/booth/[token]/BoothScanner.tsx`. Build it by reading `src/app/scan/[eventId]/Scanner.tsx` and keeping its structure: the same camera lifecycle, the same `handle()` wrapper that clears the previous result before awaiting, the same `min-h-44` fixed-height result panel, the same `UNDO_SECONDS = 6` countdown, the same `describeCameraError` copy. Differences, all of them deliberate:

- Header shows the booth name and location, not a checkpoint chooser — a booth link goes to one booth and there is nowhere else to go.
- The progress meter uses `bg-brand` rather than `bg-success-strong`: a stamp is not attendance (D100), and the different colour is what stops a crew member mistaking one scanner for the other.
- The result panel shows `result.name` at `text-2xl font-extrabold`, then `result.progress`, and **no field list**.
- There is no walk-in button anywhere in the file.
- Search hits render `name` and `category` only.
- When `archived` is true, render the panel's error copy and do not start the camera.

Tone map, matching `Scanner.tsx`'s:

```tsx
const TONE: Record<BoothScanResult["status"], string> = {
  ok: "bg-success-soft text-success-strong",
  duplicate: "bg-warning-soft text-warning",
  undone: "bg-foreground text-background",
  notfound: "bg-destructive-soft text-destructive-strong",
  error: "bg-destructive-soft text-destructive-strong",
};

const LABEL: Record<BoothScanResult["status"], string> = {
  ok: "Stamped",
  duplicate: "Already stamped",
  undone: "Stamp undone",
  notfound: "Not on the list",
  error: "Not saved",
};
```

- [ ] **Step 4: Build and lint**

Run: `npm run lint && npx next build`
Expected: PASS, and the build output lists `/booth/[token]` as a dynamic route.

- [ ] **Step 5: Commit**

```bash
git add src/app/booth
git commit -m "feat(booths): booth scanner on an unguessable link, no admin login

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Admin booths page and the printable sheet

**Deadline: this task must be done before 24 Sep.** It produces the sheet that goes to print.

**Files:**
- Create: `src/app/admin/events/[id]/booths/page.tsx`
- Create: `src/app/admin/events/[id]/booths/actions.ts`
- Create: `src/components/admin/BoothList.tsx`
- Create: `src/components/admin/BoothQr.tsx`
- Modify: `src/components/admin/nav.ts`

**Interfaces:**
- Consumes: everything from Task 3; `boothScannerLink` (Task 2); `completionByAttendee`, `stampsTarget` (Task 2); `qrDataUrl` from `src/lib/qr.ts`; `appBaseUrl` from `src/lib/links.ts`.
- Produces: server actions `addBoothAction(eventId, formData)`, `renameBoothAction(eventId, boothId, formData)`, `reorderBoothsAction(eventId, ids)`, `deleteBoothAction(eventId, boothId)`, `savePassportAction(eventId, formData)`.

Mockup: `.design/booth-passport/AdminBooths.dc.html` and `BoothPrint.dc.html`.

- [ ] **Step 1: Add the nav entry**

In `src/components/admin/nav.ts`, add to the `Onsite` group, between Scanner and Attendees:

```ts
      { href: `${b}/booths`, label: "Booths", icon: "star" },
```

Booths sit under Onsite rather than Portal because what you do on that page is operational — print the links, watch the counts. The tile that points attendees at the passport stays in Modules (D101).

- [ ] **Step 2: Write the server actions**

Create `src/app/admin/events/[id]/booths/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent, updateEvent } from "@/lib/db/events";
import { createBooth, updateBooth, setBoothOrder, deleteBoothIfUnstamped, listBooths } from "@/lib/db/booths";
import { flashPath } from "@/lib/flash";

async function event(eventId: string) {
  const { orgId } = await requireAdmin();
  return requireEvent(eventId, orgId);
}

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

export async function addBoothAction(eventId: string, fd: FormData) {
  const ev = await event(eventId);
  const name = text(fd, "name");
  if (!name) throw new Error("A booth needs a name");
  await createBooth(ev, name, text(fd, "location") || null);
  revalidatePath(`/admin/events/${eventId}/booths`);
}

export async function renameBoothAction(eventId: string, boothId: string, fd: FormData) {
  const ev = await event(eventId);
  const name = text(fd, "name");
  if (!name) throw new Error("A booth needs a name");
  await updateBooth(boothId, ev.id, { name, location: text(fd, "location") || null });
  revalidatePath(`/admin/events/${eventId}/booths`);
}

export async function reorderBoothsAction(eventId: string, ids: string[]) {
  const ev = await event(eventId);
  await setBoothOrder(ev.id, ids);
  revalidatePath(`/admin/events/${eventId}/booths`);
}

/**
 * Checked again in the database (D94). The button is disabled once a booth has stamps, but a
 * second tab opened before the first stamp still has a live one.
 */
export async function deleteBoothAction(eventId: string, boothId: string) {
  const ev = await event(eventId);
  const removed = await deleteBoothIfUnstamped(boothId, ev.id);
  revalidatePath(`/admin/events/${eventId}/booths`);
  redirect(removed
    ? flashPath(`/admin/events/${eventId}/booths`, "Booth deleted.")
    : flashPath(`/admin/events/${eventId}/booths`, "That booth has stamped somebody, so it can't be deleted. Rename it, or lower the stamps needed.", "error"));
}

/**
 * The target and the message (D95, D96). An empty target is stored as null, which the portal
 * reads as "every booth" — so clearing the box is a meaningful answer, not a validation error.
 */
export async function savePassportAction(eventId: string, fd: FormData) {
  const ev = await event(eventId);
  const path = `/admin/events/${eventId}/booths`;
  const raw = text(fd, "stamps_required");
  const parsed = raw === "" ? null : Number.parseInt(raw, 10);
  if (parsed !== null && (!Number.isFinite(parsed) || parsed < 1)) {
    redirect(flashPath(path, "Stamps needed must be a whole number, or blank for every booth.", "error"));
  }
  const booths = await listBooths(ev.id);
  if (parsed !== null && parsed > booths.length) {
    redirect(flashPath(path, `This event has ${booths.length} booths, so the target cannot be ${parsed}.`, "error"));
  }
  await updateEvent(ev.id, { stamps_required: parsed, stamps_message: text(fd, "stamps_message") || null });
  revalidatePath(path);
  redirect(flashPath(path, "Passport saved."));
}
```

- [ ] **Step 3: Write the QR panel**

Create `src/components/admin/BoothQr.tsx` — a server component that takes `{ boothName: string; location: string | null; eventName: string; link: string; qr: string }` (the `qr` being a data URL from `qrDataUrl`) and renders the printable sheet from `.design/booth-passport/BoothPrint.dc.html`: event eyebrow, booth name at the display size, the QR, the link as monospace text, the instruction paragraph, and the accent band reading:

> Staff only. Do not show this sheet or this link to attendees.

That line is not boilerplate — the link *is* the stamping authority, and a photo of it in an attendee's camera roll is a booth that stamps itself. Wrap the sheet in a `print:` -friendly container and give the page a `window.print()` button outside it.

- [ ] **Step 4: Write the list and the page**

Create `src/components/admin/BoothList.tsx` following `src/components/admin/CheckpointList.tsx` exactly: `useOptimistic` for order, a drag handle that is also the keyboard route (focus it, arrow keys move the row — a drag with no keyboard equivalent fails WCAG 2.5.7), and a `ConfirmButton` for delete. Each row shows name, location, its stamp count as a `Badge`, a link to its QR sheet, Rename, and Delete — **Delete disabled whenever the count is above zero**, with the reason in its `title` rather than in a colour (the mockup's first version carried that rule in a 2.5:1 grey; it must be a labelled, visibly disabled control).

Create `src/app/admin/events/[id]/booths/page.tsx` rendering, in order: the page header with an Add booth dialog; the Passport card (stamps needed, message, Save, and a completed count from `completionByAttendee`); the booth list; and the note explaining the delete rule.

- [ ] **Step 5: Build and lint**

Run: `npm run lint && npx next build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/events/\[id\]/booths src/components/admin/BoothList.tsx src/components/admin/BoothQr.tsx src/components/admin/nav.ts
git commit -m "feat(booths): admin booths page with printable scanner sheets

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The attendee's passport

**Files:**
- Create: `src/app/e/[slug]/a/[token]/stamps/page.tsx`
- Create: `src/app/e/[slug]/stamps/page.tsx`
- Create: `src/components/portal/PassportGrid.tsx`
- Modify: `src/lib/modules.ts`
- Modify: `tests/modules.test.ts`

**Interfaces:**
- Consumes: `buildPassport`, `progressLine` (Task 2); `listBooths`, `stampsForAttendee` (Task 3); `loadPortalEvent`, `loadPortalAttendee` from `src/lib/portal.ts`; `PortalShell`.
- Produces: `"stamps"` in `TILE_ROUTES`; `PassportGrid({ passport, message, attendeeName }: { passport: Passport; message: string | null; attendeeName: string | null })`.

Mockups: `Main.dc.html`, `PassComplete.dc.html`, `PassLocked.dc.html`.

- [ ] **Step 1: Write the failing test for the new route**

In `tests/modules.test.ts`, add:

```ts
it("accepts a tile pointing at the passport", () => {
  const [m] = parseModules([{ key: "tile", id: "passport", enabled: true, label: "Booth Passport", icon: "star", target: { kind: "route", route: "stamps" } }]);
  expect(m).toMatchObject({ key: "tile", target: { kind: "route", route: "stamps" } });
});

it("resolves that tile to the attendee's passport path", () => {
  const tiles = resolveTiles({
    event: { floor_plan_url: null, info_page_html: null, info_page_title: "Info", modules: [
      { key: "tile", id: "passport", enabled: true, label: "Booth Passport", icon: "star", target: { kind: "route", route: "stamps" } },
    ] },
    basePath: "/e/kom/a/abcdefghjkmn",
  });
  expect(tiles).toHaveLength(1);
  expect(tiles[0].href).toBe("/e/kom/a/abcdefghjkmn/stamps");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/modules.test.ts`
Expected: FAIL — `parseModules` throws `Module 0: route — Invalid option`.

- [ ] **Step 3: Add the route**

In `src/lib/modules.ts`, extend `TILE_ROUTES`:

```ts
export const TILE_ROUTES = ["agenda", "announcements", "info", "me", "seat", "stamps"] as const;
```

The list's own comment permits this: it may gain entries, never lose them. Nothing else in the file changes — a route tile already resolves to `${basePath}/${route}`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/modules.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the grid component**

Create `src/components/portal/PassportGrid.tsx`, building from `.design/booth-passport/Main.dc.html` and `PassComplete.dc.html`. What matters, beyond the pixels:

- Unstamped cells keep the booth **name and location** (D102) — the card is a wayfinding tool, and an empty cell that says nothing is a grey box.
- The empty ring is drawn in `text-muted-foreground`, not a hairline: that ring *is* the "not yet" state and has to survive a lit foyer at arm's length.
- An odd cell count makes the last cell span both columns rather than leaving a hole that reads as a rendering bug.
- Complete: the dark card carries the attendee's **name largest** — it is what the counter checks against the badge in their hand, and it is what makes a forwarded screenshot useless — then the event's `stamps_message`, then `completedAt`.
- A footer line saying a new chop appears the next time the page is opened. D20 means the portal refetches on open and never pushes; without that line, a stamp given while the page is open reads as a stamp that did not happen.

- [ ] **Step 6: Write the two pages**

`src/app/e/[slug]/a/[token]/stamps/page.tsx`:

```tsx
import { loadPortalAttendee } from "@/lib/portal";
import { listBooths, stampsForAttendee } from "@/lib/db/booths";
import { buildPassport } from "@/lib/booths";
import { PortalShell } from "@/components/portal/PortalShell";
import { PassportGrid } from "@/components/portal/PassportGrid";

export const dynamic = "force-dynamic";

export default async function StampsPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const [booths, stamps] = await Promise.all([listBooths(event.id), stampsForAttendee(attendee.id)]);
  const passport = buildPassport(booths, stamps, event.stamps_required);
  return (
    <PortalShell event={event} basePath={`/e/${slug}/a/${token}`} personal current={null}>
      <PassportGrid passport={passport} message={event.stamps_message} attendeeName={attendee.name} />
    </PortalShell>
  );
}
```

`src/app/e/[slug]/stamps/page.tsx` renders the same shell with `personal={false}`, an empty-state card reading "Your passport is on your badge — scan the QR code on your badge to open your own passport. Stamps are saved to you, not to this phone", and the booth list beneath it (D103): somebody reading the signage QR in the foyer still wants to know where the stands are.

- [ ] **Step 7: Verify in the browser pane**

Start the dev server and open the personal passport for a real attendee on the live event. Check: cells match the booths, the counter matches the cells, the page does not scroll horizontally at 390px, and the empty ring is visible at arm's length. Then `resize_window` to `mobile` and re-read.

- [ ] **Step 8: Run the suite, lint, build**

Run: `npm test && npm run lint && npx next build`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/e src/components/portal/PassportGrid.tsx src/lib/modules.ts tests/modules.test.ts
git commit -m "feat(booths): the attendee's Booth Passport, and the tile that reaches it

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: The passport export

**Files:**
- Modify: `src/lib/exports.ts`
- Modify: `tests/exports.test.ts`
- Create: `src/app/admin/events/[id]/export/passport.xlsx/route.ts`
- Modify: `src/app/admin/events/[id]/exports/page.tsx`

**Interfaces:**
- Consumes: `completionByAttendee`, `stampsTarget` (Task 2); `listBooths`, `listStampsForEvent` (Task 3).
- Produces: `buildPassportWorkbook(attendees: Attendee[], booths: Booth[], stamps: BoothStamp[], required: number | null): ExcelJS.Workbook`.

- [ ] **Step 1: Write the failing test**

In `tests/exports.test.ts`, add:

```ts
import { buildPassportWorkbook } from "@/lib/exports";
import type { Booth, BoothStamp } from "@/lib/types";

describe("buildPassportWorkbook", () => {
  const booths: Booth[] = [
    { id: "b1", org_id: "o", event_id: "e", name: "Operations", location: "Foyer", token: "t1", sort_order: 0 },
    { id: "b2", org_id: "o", event_id: "e", name: "Creative Studio", location: "Foyer", token: "t2", sort_order: 1 },
  ];
  const stamps: BoothStamp[] = [
    { id: "s1", org_id: "o", event_id: "e", booth_id: "b1", attendee_id: "a1", stamped_at: "2026-09-30T02:24:00Z" },
    { id: "s2", org_id: "o", event_id: "e", booth_id: "b2", attendee_id: "a1", stamped_at: "2026-09-30T02:41:00Z" },
  ];
  const attendees = [
    { id: "a1", name: "Aiman Zulkifli", email: "a@x.my", company: "Ecopia", category: "Management" },
    { id: "a2", name: "Sarah Lim", email: "s@x.my", company: "Ecopia", category: "Crew" },
  ] as unknown as Parameters<typeof buildPassportWorkbook>[0];

  it("writes a column per booth plus a total and a completed flag", () => {
    const ws = buildPassportWorkbook(attendees, booths, stamps, null).getWorksheet("Booth Passport")!;
    expect(ws.getRow(1).values).toEqual([undefined, "Name", "Email", "Company", "Category", "Operations", "Creative Studio", "Stamps", "Completed"]);
  });

  it("marks who has been where, and who has finished", () => {
    const ws = buildPassportWorkbook(attendees, booths, stamps, null).getWorksheet("Booth Passport")!;
    expect(ws.getRow(2).values).toEqual([undefined, "Aiman Zulkifli", "a@x.my", "Ecopia", "Management", "Yes", "Yes", 2, "Yes"]);
    expect(ws.getRow(3).values).toEqual([undefined, "Sarah Lim", "s@x.my", "Ecopia", "Crew", "No", "No", 0, "No"]);
  });

  it("honours a target below the booth count", () => {
    const ws = buildPassportWorkbook(attendees, booths, stamps.slice(0, 1), 1).getWorksheet("Booth Passport")!;
    expect(ws.getRow(2).values).toEqual([undefined, "Aiman Zulkifli", "a@x.my", "Ecopia", "Management", "Yes", "No", 1, "Yes"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/exports.test.ts`
Expected: FAIL — `buildPassportWorkbook is not a function`.

- [ ] **Step 3: Write the builder**

In `src/lib/exports.ts`, import `completionByAttendee` from `@/lib/booths` and `Booth`, `BoothStamp` from `@/lib/types`, then add:

```ts
/**
 * The passport, as its own sheet (D100).
 *
 * Deliberately not folded into the attendance workbook: five booths there would add fifteen
 * columns to a file that answers a different question, and a booth visit is not attendance.
 * One row per attendee, one column per booth, then the two numbers anyone actually reads —
 * how many stamps, and whether the card is full.
 */
export function buildPassportWorkbook(attendees: Attendee[], booths: Booth[], stamps: BoothStamp[], required: number | null): ExcelJS.Workbook {
  const completion = completionByAttendee(booths, stamps, required);
  const stamped = new Set(stamps.map((s) => `${s.booth_id}:${s.attendee_id}`));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Booth Passport");
  ws.addRow(["Name", "Email", "Company", "Category", ...booths.map((b) => b.name), "Stamps", "Completed"]);
  for (const a of attendees) {
    const c = completion.get(a.id) ?? { collected: 0, complete: false };
    ws.addRow([
      a.name, a.email, a.company, a.category,
      ...booths.map((b) => (stamped.has(`${b.id}:${a.id}`) ? "Yes" : "No")),
      c.collected,
      c.complete ? "Yes" : "No",
    ]);
  }
  ws.columns?.forEach((col) => { col.width = 20; });
  return wb;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/exports.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the route**

Create `src/app/admin/events/[id]/export/passport.xlsx/route.ts`, following `export/attendance.xlsx/route.ts` exactly — `requireAdmin`, `requireEvent`, parallel loads, `Content-Disposition: attachment; filename="${ev.slug}-passport.xlsx"`:

```ts
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAttendees } from "@/lib/db/attendees";
import { listBooths, listStampsForEvent } from "@/lib/db/booths";
import { buildPassportWorkbook } from "@/lib/exports";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { orgId } = await requireAdmin(); const ev = await requireEvent(id, orgId);
  const [attendees, booths, stamps] = await Promise.all([listAttendees(ev.id), listBooths(ev.id), listStampsForEvent(ev.id)]);
  const buf = await buildPassportWorkbook(attendees, booths, stamps, ev.stamps_required).xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${ev.slug}-passport.xlsx"`,
    },
  });
}
```

- [ ] **Step 6: Link it from the Exports page**

In `src/app/admin/events/[id]/exports/page.tsx`, add a card for the passport sheet alongside the attendance one, worded as what it answers: who went to which booth, and who filled their card. Render it **only when the event has booths** — an export that is always empty is a link that teaches people to ignore the page.

- [ ] **Step 7: Run the suite, lint, build**

Run: `npm test && npm run lint && npx next build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/exports.ts tests/exports.test.ts src/app/admin/events/\[id\]/export/passport.xlsx src/app/admin/events/\[id\]/exports/page.tsx
git commit -m "feat(booths): passport export, one sheet of its own

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## The user's verification checklist

Claude can verify neither the admin (login-gated) nor the booth scanner (needs a camera). Run these by hand, ideally at the 23 Sep dry run:

- [ ] Apply migration 0010 at merge.
- [ ] Admin → Booths: add three booths, reorder by drag and by keyboard, rename one.
- [ ] Delete a booth with no stamps — it goes. Stamp another, then try to delete it — refused. **Confirm the refusal message actually appears on screen.** It rides a redirect-with-flash that no other admin delete in this repo uses, it could not be verified without a database, and it is the only signal the admin gets that the booth was spared.
- [ ] **Print a booth sheet to paper or PDF and count the pages.** It must be exactly one. The sheet is printed by hiding the admin shell and collapsing its boxes; this is the only print surface in the repository, so nothing here has ever survived a real printer. Check too that the orange band behind "Staff only" prints as orange rather than white.
- [ ] Scan a sheet's QR with a second phone; the scanner opens on the right booth.
- [ ] Stamp a real badge. The panel shows the name and the progress, and **no company, table or phone**.
- [ ] Scan the same badge again — "already stamped", with the original time, and the count does not move.
- [ ] Undo within six seconds; the count drops.
- [ ] Turn the camera off (deny permission) and search by name — results show name and category only, and there is no way to add a walk-in.
- [ ] From the booth scanner, search a **company name** and an **email domain** belonging to someone on the list. Both must return nothing. The booth searches names only; the crew scanner still searches email and company, so check that one still finds someone by their registered email.
- [ ] Open the attendee passport at 390px (phone, or a narrowed window) with a deliberately long booth name — no sideways scroll.
- [ ] Open the attendee's portal: the chop is there, the counter agrees with the cells.
- [ ] Set stamps needed to the number you have stamped; the card flips to complete and shows the message.
- [ ] Scan that attendee on a "Prize counter" checkpoint in the crew scanner; scan them again — "already in".
- [ ] Download the passport export; the columns match the booths and the completed flags match the cards.
- [ ] Open the generic `/e/<slug>/stamps` link — locked, with the booth list, and no "Me" tab.
