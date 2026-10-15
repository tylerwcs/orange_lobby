# Attendees Cancel Their Own Registration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On events where the organiser allows it, a registered attendee cancels from their personal link (Me page when live, under "Coming soon" when draft); the row is kept with `cancelled_at`, drops out of every count, list and door, and the organiser sees and can restore it.

**Architecture:**
- **Data:** migration `0084` adds `attendees.cancelled_at` and `events.self_cancel` / `events.self_cancel_closes_at`.
- **Reads:** every list/count reader of `attendees` filters `cancelled_at is null` unless it opts in with `{ includeCancelled: true }`; token/id lookups return the row and the caller decides. A guard test pins every `.from("attendees").select(` in `src/`.
- **Portal:** `loadPortalAttendee` refuses a cancelled attendee (so every portal page and action does); a new `loadPortalAttendeeAny` is used only by the personal layout, which shows the cancelled card instead of the portal.
- **Feature:** `src/features/cancel/` holds the pure rules, the cancel write, the portal UI and actions, and the admin Restore.

**Tech Stack:** Next.js app router (server components, Server Actions — check `node_modules/next/dist/docs/` for anything unfamiliar, per AGENTS.md), Supabase Postgres (service client), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-15-attendee-self-cancel-design.md` (D580–D592). Read it first.

## Global Constraints

- **Decision numbers** D580–D592 (spare up to D599); migration `0084`. Cite D-numbers in code comments the way surrounding code does.
- **Test only on ecpkom** (`4e64a90c-728c-4a08-af62-8c8046afa0c9`). Never write to ecphub or uobih2 (uobih2 now has real committee members).
- **Work on `main`.** Commit messages end with a `Co-Authored-By:` line naming the model. Stage only your own files; never `git add -A`; never stage `docs/superpowers/specs/2026-09-27-intro-video-design.md`, `docs/ECP-Hub-Privacy-Policy.pdf`, `docs/image-guide/`. Do not push.
- **Supabase project** `wfmqwwcolfigjylkgrsv` (MCP `apply_migration` / `execute_sql`).
- **Verification:** `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- **`tests/access-guard.test.ts` must keep passing** (no `requireAdmin`/`requireEvent` outside `src/lib/access.ts`; admin-only counts unchanged).
- **Copy, verbatim:**
  - Settings checkbox: `Attendees can cancel their own registration`; date field label: `Cancelling closes at`, description `Leave blank to allow it until the event is archived.`
  - Me section heading `Can't make it?`; line with cut-off `You can cancel your registration until <d MMM, HH:mm>.`, without cut-off `You can cancel your registration.`; button `Cancel my registration`.
  - Draft link: `Can't make it? Cancel my registration`.
  - Dialog title `Cancel your registration for <event name>?`; body `You'll lose your place and any activity bookings. This can't be undone from here.`; buttons `Yes, cancel` / `Keep my place`.
  - Cancelled card: `You've cancelled your registration for <event name>.`; with registration open, a link `Register again`; otherwise `If this was a mistake, contact the organiser.`
  - Refusals: off `Cancelling isn't available for this event.`; cut-off `Cancelling closed on <d MMM, HH:mm>.`; archived `This event has ended.`; checked in `You've already checked in, so your registration can't be cancelled.`; already `You've already cancelled.`; busy `Too many attempts. Try again in a minute.`
  - Scanner/booth refusal: `Cancelled registration. <name> cancelled on <d MMM>.`
  - Admin: badge `Cancelled · <d MMM>`; toggle `Cancelled (<n>)` / `Back to registered`; detail button `Restore registration`; flash `Restored <name>.`; attendance export column header `Cancelled at`.

## Rulings carried from planning

1. **"Attendees export" (spec D588) is the attendance export** (`export/attendance.xlsx`), the export the Attendees table offers. It includes cancelled rows with a `Cancelled at` column; every other export excludes them. Task 6 updates the spec wording.
2. **Lookups by id keep cancelled rows** (`getAttendee`, `listAttendeesByIds`): they resolve names for history (winners, revokes, polaroids) and the admin detail panel. Check-in/stamp by id refuse cancelled people in the action.
3. **Admin import matches cancelled rows** (no duplicate insert, `cancelled_at` untouched); **admin "Add attendee" and registration reactivate** through `upsertByEmail` (D587).
4. **`purgeAttendeePersonalData`'s count includes cancelled rows** (the purge rewrites every row).

## Review Focus

1. **A cancelled person still acts in the portal** (books, submits, plays, posts a polaroid) by a direct POST. Pinned by Task 4: `loadPortalAttendee` refuses cancelled, and polaroid/games token lookups refuse; checked in Task 7.
2. **A cancelled person is still counted or offered** somewhere (overview, door, booth, WhatsApp audience, groups, exports, scanner search). Pinned by Task 2's guard test over every `.from("attendees").select(`, and Task 7's count checks.
3. **Re-registering the same email after cancelling** must reactivate the same row and token, not fail or duplicate. Pinned by Task 2's `upsertByEmail` change and test; Task 7.
4. **The cancel action is replayed or forged** (switch off, past cut-off, checked in, archived, already cancelled, another event's token). Pinned by `canSelfCancel` tests (Task 1) and the action re-checking it (Task 4).
5. **Draft events:** the cancel link must work while the portal shows only "Coming soon", and the cancelled card must show for a draft too. Pinned by Task 4's layout change; checked in Task 7.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `supabase/migrations/0084_self_cancel.sql` | Create | Columns |
| `src/lib/types.ts` | Modify | `Attendee.cancelled_at`, `Event.self_cancel`, `Event.self_cancel_closes_at` |
| `src/features/cancel/lib/rules.ts` | Create | `canSelfCancel`, `registrationOpenNow`, `klDayTime`, `cancelledLabel` |
| `src/lib/db/attendees.ts` | Modify | Active filter, `includeCancelled`, `listCancelledAttendees`, `countCancelled`, reactivation |
| `src/lib/db/groups.ts`, `src/features/games/db.ts` | Modify | Active filter |
| `src/lib/db/checkins.ts` | Modify | `hasAnyCheckin` |
| `src/features/cancel/db.ts` | Create | `cancelAttendee`, `restoreAttendee` |
| `src/lib/portal.ts` | Modify | `loadPortalAttendeeAny`; `loadPortalAttendee` refuses cancelled |
| `src/features/cancel/portal/*` | Create | `CancelSection` (client), `CancelledCard`, `actions.ts` |
| `src/app/e/[slug]/a/[token]/layout.tsx`, `me/page.tsx` | Modify | Cancelled card, draft link, Me section |
| `src/components/portal/PortalChrome.tsx` | Modify | `draftExtra` slot |
| `src/app/scan/[eventId]/actions.ts`, `src/app/booth/[token]/actions.ts`, `src/features/games/live.ts`, `src/features/polaroid/context.ts` | Modify | Refuse cancelled |
| Settings page + `updateSettingsAction` | Modify | Switch and cut-off |
| Attendees page, `AttendeeDetail.tsx`, `features/cancel/admin/actions.ts`, attendance export | Modify/Create | Cancelled view, Restore, export column |
| `tests/cancel-rules.test.ts`, `tests/attendee-reads-guard.test.ts` | Create | Tests |

---

### Task 1: Migration, types and the pure rules

**Files:** Create `supabase/migrations/0084_self_cancel.sql`, `src/features/cancel/lib/rules.ts`, `tests/cancel-rules.test.ts`. Modify `src/lib/types.ts`.

**Interfaces — Produces:**
- `Attendee.cancelled_at?: string | null` (optional so old fixtures compile; rows from the DB always carry it)
- `Event.self_cancel: boolean`, `Event.self_cancel_closes_at: string | null`
- `canSelfCancel(ev: Pick<Event, "status" | "self_cancel" | "self_cancel_closes_at">, a: Pick<Attendee, "cancelled_at">, hasCheckin: boolean, now: Date): { ok: true } | { ok: false; reason: string }`
- `registrationOpenNow(ev: Pick<Event, "status" | "registration_open" | "registration_closes_at">, now: Date): boolean`
- `klDayTime(iso: string): string` → `"21 Oct, 18:00"`; `klDay(iso: string): string` → `"21 Oct"`
- `cancelledLabel(iso: string): string` → `"Cancelled · 21 Oct"`

- [ ] **Step 1: Write the migration**

```sql
-- Attendees cancel their own registration (spec 2026-10-15-attendee-self-cancel-design.md, D580-D592).

-- D580: cancel marks, it does not delete. Null = active.
alter table public.attendees add column if not exists cancelled_at timestamptz;
create index if not exists attendees_event_active_idx on public.attendees (event_id) where cancelled_at is null;

-- D583: off by default; the optional cut-off is when self-cancel stops.
alter table public.events add column if not exists self_cancel boolean not null default false;
alter table public.events add column if not exists self_cancel_closes_at timestamptz;
```

Apply with MCP `apply_migration` (name `0084_self_cancel`). Check: `select count(*) filter (where cancelled_at is not null) from attendees; select count(*) filter (where self_cancel) from events;` → `0`, `0`.

- [ ] **Step 2: Types** — in `src/lib/types.ts`:
  - `Attendee`: after `terms_agreed_at`, add `/** D580: when they cancelled; null/absent = active. Optional so old fixtures compile. */ cancelled_at?: string | null;`
  - `Event`: after `registration_closes_at`, add `/** D583: attendees may cancel their own registration. */ self_cancel: boolean;` and `/** D583: when self-cancel stops; null = until archived. */ self_cancel_closes_at: string | null;`
  - Fix any test fixtures `tsc` then flags for `Event` by adding `self_cancel: false, self_cancel_closes_at: null`.

- [ ] **Step 3: Write the failing tests** — `tests/cancel-rules.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canSelfCancel, registrationOpenNow, klDayTime, klDay, cancelledLabel } from "@/features/cancel/lib/rules";

const now = new Date("2026-10-15T04:00:00Z");
const ev = { status: "live" as const, self_cancel: true, self_cancel_closes_at: null as string | null };
const a = { cancelled_at: null as string | null };

describe("canSelfCancel (D584)", () => {
  it("allows a live or draft event with the switch on, before the cut-off, not checked in", () => {
    expect(canSelfCancel(ev, a, false, now)).toEqual({ ok: true });
    expect(canSelfCancel({ ...ev, status: "draft" }, a, false, now)).toEqual({ ok: true });
    expect(canSelfCancel({ ...ev, self_cancel_closes_at: "2026-10-16T00:00:00Z" }, a, false, now)).toEqual({ ok: true });
  });
  it("refuses with the reason, in this order", () => {
    expect(canSelfCancel(ev, { cancelled_at: "2026-10-14T00:00:00Z" }, false, now)).toEqual({ ok: false, reason: "You've already cancelled." });
    expect(canSelfCancel({ ...ev, self_cancel: false }, a, false, now)).toEqual({ ok: false, reason: "Cancelling isn't available for this event." });
    expect(canSelfCancel({ ...ev, status: "archived" }, a, false, now)).toEqual({ ok: false, reason: "This event has ended." });
    expect(canSelfCancel({ ...ev, self_cancel_closes_at: "2026-10-15T02:00:00Z" }, a, false, now)).toEqual({ ok: false, reason: "Cancelling closed on 15 Oct, 10:00." });
    expect(canSelfCancel(ev, a, true, now)).toEqual({ ok: false, reason: "You've already checked in, so your registration can't be cancelled." });
  });
});

describe("registrationOpenNow", () => {
  const r = { status: "live" as const, registration_open: true, registration_closes_at: null as string | null };
  it("follows the switch, the closing time and archive", () => {
    expect(registrationOpenNow(r, now)).toBe(true);
    expect(registrationOpenNow({ ...r, registration_open: false }, now)).toBe(false);
    expect(registrationOpenNow({ ...r, registration_closes_at: "2026-10-15T03:00:00Z" }, now)).toBe(false);
    expect(registrationOpenNow({ ...r, status: "archived" }, now)).toBe(false);
  });
});

describe("dates on the Malaysian calendar", () => {
  it("formats day and time in KL", () => {
    expect(klDayTime("2026-10-21T10:00:00Z")).toBe("21 Oct, 18:00");
    expect(klDay("2026-10-20T17:00:00Z")).toBe("21 Oct");
    expect(cancelledLabel("2026-10-20T17:00:00Z")).toBe("Cancelled · 21 Oct");
  });
});
```

Run `npx vitest run tests/cancel-rules.test.ts` → FAIL (module missing).

- [ ] **Step 4: Write `src/features/cancel/lib/rules.ts`**

```ts
import { MONTHS } from "@/lib/text";
import type { Attendee, Event } from "@/lib/types";

const KL_OFFSET_MS = 8 * 60 * 60 * 1000;
const kl = (iso: string) => new Date(Date.parse(iso) + KL_OFFSET_MS);
const pad = (n: number) => String(n).padStart(2, "0");

/** "21 Oct" on the Malaysian calendar. */
export function klDay(iso: string): string {
  const d = kl(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "21 Oct, 18:00" in Malaysian time. */
export function klDayTime(iso: string): string {
  const d = kl(iso);
  return `${klDay(iso)}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** D588: the badge on a cancelled attendee. */
export function cancelledLabel(iso: string): string {
  return `Cancelled · ${klDay(iso)}`;
}

/** D584: may this attendee cancel now? The reason is shown to them as-is. */
export function canSelfCancel(
  ev: Pick<Event, "status" | "self_cancel" | "self_cancel_closes_at">,
  a: Pick<Attendee, "cancelled_at">,
  hasCheckin: boolean,
  now: Date,
): { ok: true } | { ok: false; reason: string } {
  if (a.cancelled_at) return { ok: false, reason: "You've already cancelled." };
  if (!ev.self_cancel) return { ok: false, reason: "Cancelling isn't available for this event." };
  if (ev.status === "archived") return { ok: false, reason: "This event has ended." };
  if (ev.self_cancel_closes_at && Date.parse(ev.self_cancel_closes_at) <= now.getTime()) {
    return { ok: false, reason: `Cancelling closed on ${klDayTime(ev.self_cancel_closes_at)}.` };
  }
  if (hasCheckin) return { ok: false, reason: "You've already checked in, so your registration can't be cancelled." };
  return { ok: true };
}

/** D585/D587: whether "Register again" can be offered. Same rule as registerAction. */
export function registrationOpenNow(ev: Pick<Event, "status" | "registration_open" | "registration_closes_at">, now: Date): boolean {
  if (ev.status === "archived" || !ev.registration_open) return false;
  return !ev.registration_closes_at || Date.parse(ev.registration_closes_at) > now.getTime();
}
```

- [ ] **Step 5:** `npx vitest run tests/cancel-rules.test.ts` → PASS; `npx tsc --noEmit` → 0 (fix fixtures per Step 2).

- [ ] **Step 6: Commit** `feat(cancel): self-cancel columns and rules (D580, D583, D584)` — stage the migration, types.ts, rules, test and any fixture files you touched.

---

### Task 2: Every attendee read knows about cancellation

**Files:** Modify `src/lib/db/attendees.ts`, `src/lib/db/groups.ts`, `src/features/games/db.ts`, `src/lib/db/checkins.ts`, `src/app/admin/events/[id]/actions.ts` (import matching, ~L273). Create `tests/attendee-reads-guard.test.ts`. Add tests to `tests/attendee-merge.test.ts` or a new `tests/attendee-reactivate.test.ts`.

**Interfaces — Produces:**
- `listAttendees(eventId: string, q?: string, scope: "wide" | "name" = "wide", opts: { includeCancelled?: boolean } = {})`
- `countAttendees(eventId: string)` — active only
- `listCancelledAttendees(eventId: string): Promise<Attendee[]>`; `countCancelled(eventId: string): Promise<number>`
- `listCategories(eventId)` — active only
- `upsertByEmail(...)` — clears `cancelled_at` on an existing row (D587)
- `hasAnyCheckin(attendeeId: string): Promise<boolean>` in `src/lib/db/checkins.ts`
- Unchanged and returning cancelled rows too: `findByToken`, `findByEmail`, `getAttendee`, `listAttendeesByIds`, `getEventByAttendeeToken`, games `getAttendeeByToken`.

- [ ] **Step 1: Write the guard test** — `tests/attendee-reads-guard.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * D590/D591: every query that selects from `attendees` either keeps cancelled people out
 * (`.is("cancelled_at", null)`) or says on purpose that it includes them, with the marker
 * comment `any-status:` and a reason inside the same statement. New readers must choose.
 */
const SRC = join(process.cwd(), "src");
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : []; });
}

describe("attendee reads guard (D591)", () => {
  it("every select from attendees filters cancelled people or is marked any-status", () => {
    const offenders: string[] = [];
    for (const p of walk(SRC)) {
      const src = readFileSync(p, "utf8");
      const re = /\.from\("attendees"\)\s*\.select\(/g;
      for (let m; (m = re.exec(src)); ) {
        const end = src.indexOf(";", m.index);
        const stmt = src.slice(Math.max(0, src.lastIndexOf("\n", m.index - 200)), end === -1 ? undefined : end);
        const ok = stmt.includes('.is("cancelled_at", null)') || stmt.includes("cancelledFilter(") || /any-status:/.test(stmt);
        if (!ok) offenders.push(`${relative(SRC, p).split("\\").join("/")}:${src.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

Run it → FAIL listing every reader. That list is this task's to-do list.

- [ ] **Step 2: `src/lib/db/attendees.ts`**
  - `listAttendees`: add the `opts` param; inside the builder `let query = ...select("*").eq("event_id", eventId); query = opts.includeCancelled ? query /* any-status: caller asked */ : query.is("cancelled_at", null);`. Keep the rest. (Put the `any-status:` marker comment inside the statement so the guard sees it, or write the ternary so `.is("cancelled_at", null)` is in the `.select(` statement — either passes.)
  - `countAttendees`: add `.is("cancelled_at", null)`.
  - `listCategories`: add `.is("cancelled_at", null)`.
  - `findByToken`, `findByEmail`, `getAttendee`, `listAttendeesByIds`: add a `// any-status: <reason>` comment inside the statement (token lookups: caller decides, D581; by-id: history names, ruling 2).
  - `purgeAttendeePersonalData`'s count: `// any-status: the purge rewrites every row` (ruling 4).
  - Add:

```ts
/** D588: the Cancelled view in Attendees, newest cancellation first. */
export async function listCancelledAttendees(eventId: string): Promise<Attendee[]> {
  return selectAll<Attendee>((from, to) => serviceClient().from("attendees").select("*").eq("event_id", eventId)
    .not("cancelled_at", "is", null) // any-status: this is the cancelled list
    .order("cancelled_at", { ascending: false }).order("id").range(from, to));
}

export async function countCancelled(eventId: string): Promise<number> {
  const { count, error } = await serviceClient().from("attendees").select("id", { count: "exact", head: true })
    .eq("event_id", eventId).not("cancelled_at", "is", null); // any-status: counting the cancelled
  if (error) throw error;
  return count ?? 0;
}
```

  - `updateAttendee`: widen the patch type to `Partial<AttendeeInput> & { cancelled_at?: string | null }` (it already spreads the patch into the update).
  - `upsertByEmail`: build the existing-row patch with a new exported pure helper and use it for both the update and the returned object:

```ts
/** D587: registering (or being added) again reactivates a cancelled registration. */
export function reactivationPatch(existing: Pick<Attendee, "extra">, input: AttendeeInput) {
  return { ...input, extra: mergeExtra(existing.extra, dropBlankAnswers(input.extra ?? {})), cancelled_at: null };
}
```

    then `const patch = reactivationPatch(existing, input); await updateAttendee(existing.id, patch); return { attendee: { ...existing, ...patch, email: input.email.toLowerCase() } as Attendee, created: false };`.

- [ ] **Step 3: Other readers**
  - `src/lib/db/groups.ts` `groupMembers` and `groupedAttendees`: add `.is("cancelled_at", null)`. (`setGroupMembers` is an update, not a select.)
  - `src/features/games/db.ts` `listRoster`: add `.is("cancelled_at", null)`; `getAttendeeByToken`: `// any-status: playContext refuses cancelled (Task 3)`.
  - `src/lib/db/events.ts` `getEventByAttendeeToken`: `// any-status: the short link lands on the portal, which shows the cancelled card`.
  - `src/lib/db/checkins.ts`: add

```ts
/** D584: has this attendee been scanned anywhere at this event? */
export async function hasAnyCheckin(attendeeId: string): Promise<boolean> {
  const { count, error } = await serviceClient().from("checkins").select("id", { count: "exact", head: true }).eq("attendee_id", attendeeId);
  if (error) throw error;
  return (count ?? 0) > 0;
}
```

- [ ] **Step 4: Import keeps matching cancelled people (ruling 3)** — in `src/app/admin/events/[id]/actions.ts` (~L273, the import's existing-by-email map) call `listAttendees(ev.id, undefined, "wide", { includeCancelled: true })`. Check the import's write path: it must update the matched row without clearing `cancelled_at` (if it calls `upsertByEmail`, switch that call site to the plain update it already uses for matched rows, or pass a flag — read the code and keep the row cancelled).

- [ ] **Step 5: Reactivation test** — `tests/attendee-reactivate.test.ts` (`attendees.ts` imports `server-only`; if vitest refuses the import, move `reactivationPatch` to `src/lib/attendee-merge.ts` beside `mergeExtra` and import it from there in both places):

```ts
import { describe, it, expect } from "vitest";
import { reactivationPatch } from "@/lib/db/attendees";

describe("reactivationPatch (D587)", () => {
  it("clears cancelled_at and merges answers without blanking stored ones", () => {
    const patch = reactivationPatch({ extra: { shirt: "M", diet: "Veg" } }, { name: "Ali", email: "ali@x.com", extra: { shirt: "L", diet: "" } } as never);
    expect(patch.cancelled_at).toBeNull();
    expect(patch.extra).toEqual({ shirt: "L", diet: "Veg" });
  });
});
```

- [ ] **Step 6:** guard test PASS; `npx tsc --noEmit`; `npm test`.

- [ ] **Step 7: Commit** `feat(cancel): cancelled attendees drop out of every list and count (D581, D587, D590, D591)`.

---

### Task 3: Doors, booths, games and polaroids refuse cancelled people

**Files:** Modify `src/app/scan/[eventId]/actions.ts`, `src/app/booth/[token]/actions.ts`, `src/features/games/live.ts`, `src/features/polaroid/context.ts`.

- [ ] **Step 1: Scanner** — at the top of `doCheckin` (after the archived check), add:

```ts
  // D581: a cancelled registration is not an arrival. The badge still resolves so crew see why.
  if (attendee.cancelled_at) return { status: "error", attendee, message: `Cancelled registration. ${attendee.name} cancelled on ${klDay(attendee.cancelled_at)}.` };
```

(`klDay` from `@/features/cancel/lib/rules`). `doCheckin` is the one place check-ins are written, so by-token and by-id both pass through it. Search already excludes cancelled (Task 2).

- [ ] **Step 2: Booth** — in `stampByTokenAction` and `stampByIdAction`, before calling `stamp(...)`, if `a.cancelled_at` return `{ status: "error", name: a.name, message: \`Cancelled registration. ${a.name} cancelled on ${klDay(a.cancelled_at)}.\` }`.

- [ ] **Step 3: Games** — in `playContext` (`src/features/games/live.ts` ~L64), treat a cancelled attendee like a missing one (return null).

- [ ] **Step 4: Polaroid** — in `portalContext` (`src/features/polaroid/context.ts` ~L19), treat a cancelled attendee like a missing one.

- [ ] **Step 5:** `npx tsc --noEmit`; `npm test`; `npx eslint` on the four files.

- [ ] **Step 6: Commit** `feat(cancel): doors, booths, games and polaroids refuse cancelled registrations (D581)`.

---

### Task 4: The attendee cancels

**Files:** Create `src/features/cancel/db.ts`, `src/features/cancel/portal/actions.ts`, `src/features/cancel/portal/CancelSection.tsx`, `src/features/cancel/portal/CancelledCard.tsx`, `src/features/cancel/index.ts`. Modify `src/lib/portal.ts`, `src/app/e/[slug]/a/[token]/layout.tsx`, `src/app/e/[slug]/a/[token]/me/page.tsx`, `src/components/portal/PortalChrome.tsx`.

**Interfaces — Produces:** `cancelAttendee(eventId: string, attendeeId: string): Promise<boolean>`; `restoreAttendee(eventId: string, attendeeId: string): Promise<boolean>`; `selfCancelAction(slug: string, token: string): Promise<void>`; `loadPortalAttendeeAny(slug, token)`; `CancelSection`; `CancelledCard`.

- [ ] **Step 1: `src/features/cancel/db.ts`**

```ts
import "server-only";
import { serviceClient } from "@/lib/supabase/service";

/**
 * D580/D582: mark cancelled, free their activity bookings, withdraw pending change requests.
 * Conditional on still being active, so a replay changes nothing. Entries, points, check-ins and
 * polaroids stay.
 */
export async function cancelAttendee(eventId: string, attendeeId: string): Promise<boolean> {
  const db = serviceClient();
  const { data, error } = await db.from("attendees").update({ cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", attendeeId).eq("event_id", eventId).is("cancelled_at", null).select("id");
  if (error) throw error;
  if ((data?.length ?? 0) === 0) return false;
  const now = new Date().toISOString();
  const [b, r] = await Promise.all([
    db.from("activity_bookings").delete().eq("event_id", eventId).eq("attendee_id", attendeeId),
    db.from("activity_change_requests").update({ status: "withdrawn", decided_at: now }).eq("event_id", eventId).eq("attendee_id", attendeeId).eq("status", "pending"),
  ]);
  if (b.error) throw b.error;
  if (r.error) throw r.error;
  return true;
}

/** D588: Restore clears the mark. Bookings given up are not restored. */
export async function restoreAttendee(eventId: string, attendeeId: string): Promise<boolean> {
  const { data, error } = await serviceClient().from("attendees").update({ cancelled_at: null, updated_at: new Date().toISOString() })
    .eq("id", attendeeId).eq("event_id", eventId).not("cancelled_at", "is", null).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
```

(The `.from("attendees").update(` statements are writes, not `.select(` reads; if the guard test flags the trailing `.select("id")`, add `// any-status: write returning ids` inside the statement.)

- [ ] **Step 2: `src/lib/portal.ts`**

```ts
/** D585: the personal layout only — it shows the cancelled card. Everything else uses loadPortalAttendee. */
export const loadPortalAttendeeAny = cache(
  async (slug: string, token: string): Promise<{ event: Event; attendee: Attendee }> => {
    const event = await loadPortalEvent(slug);
    if (!isValidToken(token)) notFound();
    const attendee = await findByToken(event.id, token);
    if (!attendee) notFound();
    return { event, attendee };
  },
);

/**
 * Every portal page and action. A cancelled registration is refused here (D581), so no portal
 * write — booking, entry, game, polaroid — can run for them, whatever is POSTed.
 */
export const loadPortalAttendee = cache(
  async (slug: string, token: string): Promise<{ event: Event; attendee: Attendee }> => {
    const loaded = await loadPortalAttendeeAny(slug, token);
    if (loaded.attendee.cancelled_at) notFound();
    return loaded;
  },
);
```

- [ ] **Step 3: `src/features/cancel/portal/actions.ts`**

```ts
"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { loadPortalAttendee } from "@/lib/portal";
import { hasAnyCheckin } from "@/lib/db/checkins";
import { allow } from "@/lib/ratelimit";
import { flashPath } from "@/lib/flash";
import { canSelfCancel } from "../lib/rules";
import { cancelAttendee } from "../db";

/** D586: the token is the authority; every rule is re-checked here. */
export async function selfCancelAction(slug: string, token: string) {
  const base = `/e/${slug}/a/${token}`;
  if (!allow(`cancel:${token}`, 5, 60_000)) redirect(flashPath(`${base}/me`, "Too many attempts. Try again in a minute.", "error"));
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const verdict = canSelfCancel(event, attendee, await hasAnyCheckin(attendee.id), new Date());
  if (!verdict.ok) redirect(flashPath(`${base}/me`, verdict.reason, "error"));
  await cancelAttendee(event.id, attendee.id);
  revalidatePath(base, "layout");
  redirect(base);
}
```

- [ ] **Step 4: `src/features/cancel/portal/CancelSection.tsx`** — the dialog follows `EntryActions.tsx`'s AlertDialog use:

```tsx
"use client";
import { useState, useTransition } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

/**
 * D585: Cancel my registration. "me" is the card at the bottom of the Me page; "draft" is the small
 * link under Coming soon. Both confirm first; the action re-checks every rule (D586).
 */
export function CancelSection({ eventName, until, action, variant }: {
  eventName: string;
  /** The cut-off as "21 Oct, 18:00", or null for none. */
  until: string | null;
  action: () => Promise<void>;
  variant: "me" | "draft";
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const open = () => setConfirming(true);

  const dialog = (
    <AlertDialog open={confirming} onOpenChange={setConfirming}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel your registration for {eventName}?</AlertDialogTitle>
          <AlertDialogDescription>You&apos;ll lose your place and any activity bookings. This can&apos;t be undone from here.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep my place</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() => { setConfirming(false); startTransition(() => action()); }}>
            Yes, cancel
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (variant === "draft") {
    return (
      <>
        <button type="button" onClick={open} disabled={pending} aria-busy={pending}
          className="min-h-11 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
          {pending ? "Cancelling…" : "Can't make it? Cancel my registration"}
        </button>
        {dialog}
      </>
    );
  }
  return (
    <Card>
      <CardHeader><CardTitle className="text-base font-extrabold">Can&apos;t make it?</CardTitle></CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">
          {until ? `You can cancel your registration until ${until}.` : "You can cancel your registration."}
        </p>
        <Button type="button" variant="outline" onClick={open} disabled={pending} aria-busy={pending}
          className="h-11 border-destructive/40 text-destructive hover:bg-destructive/10">
          {pending && <Spinner data-icon="inline-start" />}
          Cancel my registration
        </Button>
        {dialog}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: `src/features/cancel/portal/CancelledCard.tsx`** — the same frame as PortalChrome's draft branch:

```tsx
import Link from "next/link";
import { Mark } from "@/components/portal/PortalHeader";
import { brandStyle } from "@/lib/brand";
import { buttonVariants } from "@/components/ui/button";
import type { ChromeEvent } from "@/components/portal/PortalChrome";

/** D585: every page on a cancelled attendee's link. No nav, no portal, no consent gate. */
export function CancelledCard({ event, registerHref }: { event: ChromeEvent; registerHref: string | null }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6" style={brandStyle(event.primary_color) as React.CSSProperties}>
      <div className="w-full rounded-xl border border-border bg-card p-6 text-center">
        <div className="mx-auto mb-4 w-fit"><Mark event={event} /></div>
        <h1 className="text-xl font-extrabold text-balance">You&apos;ve cancelled your registration for {event.name}.</h1>
        {registerHref ? (
          <Link href={registerHref} className={buttonVariants({ variant: "outline", className: "mt-5 h-11" })}>Register again</Link>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">If this was a mistake, contact the organiser.</p>
        )}
      </div>
    </main>
  );
}
```

(`Mark` takes the header event shape; `ChromeEvent` covers it — if tsc disagrees, pass the fields `Mark` needs. If `buttonVariants` doesn't take `className` in this project, use `cn(buttonVariants({ variant: "outline" }), "mt-5 h-11")` as `register/done/page.tsx` does. In the layout, build the `ChromeEvent` the same way it already does for `PortalChrome`.)

- [ ] **Step 6: `PortalChrome.tsx`** — add an optional prop `draftExtra?: React.ReactNode` and render it inside the draft card, after the Coming soon `<p>` (`{draftExtra && <div className="mt-4">{draftExtra}</div>}`).

- [ ] **Step 7: Personal layout** (`src/app/e/[slug]/a/[token]/layout.tsx`):
  - `generateMetadata` and `PersonalLayout` call `loadPortalAttendeeAny` instead of `loadPortalAttendee`.
  - Before the consent gate: `if (attendee.cancelled_at) return <CancelledCard event={event} registerHref={registrationOpenNow(event, new Date()) ? \`/e/${slug}/register\` : null} />;`
  - For a draft event, compute `draftExtra` when `canSelfCancel(event, attendee, await hasAnyCheckin(attendee.id), new Date()).ok`: `<CancelSection variant="draft" eventName={event.name} until={event.self_cancel_closes_at ? klDayTime(event.self_cancel_closes_at) : null} action={selfCancelAction.bind(null, slug, token)} />`, and pass it to `PortalChrome`. Only call `hasAnyCheckin` when `event.status === "draft" && event.self_cancel` (avoid a query on every live page load).

- [ ] **Step 8: Me page** (`me/page.tsx`) — after the last card, when `event.self_cancel` and `canSelfCancel(event, attendee, await hasAnyCheckin(attendee.id), new Date()).ok`, render `<CancelSection variant="me" … />`. Not part of the Me show/hide checklist (D585).

- [ ] **Step 9: `src/features/cancel/index.ts`** exports `cancelAttendee`, `restoreAttendee`, `CancelSection`, `CancelledCard`, `selfCancelAction`, and the rules.

- [ ] **Step 10:** `npx tsc --noEmit`, `npm test` (guard tests included), `npm run lint`, `npm run build`.

- [ ] **Step 11: Commit** `feat(cancel): attendees cancel from Me or under Coming soon; cancelled card (D582, D585, D586)`.

---

### Task 5: The organiser's switch and cut-off

**Files:** Modify `src/app/admin/events/[id]/settings/page.tsx`, `src/app/admin/events/[id]/actions.ts` (`updateSettingsAction`).

- [ ] **Step 1:** In the Registration card, after the `Closes automatically at` field, add (same grid):

```tsx
<label className="flex min-h-11 items-center gap-2 text-sm font-bold"><input type="checkbox" name="self_cancel" defaultChecked={ev.self_cancel} className="size-4 accent-primary" /> Attendees can cancel their own registration</label>
<Field label="Cancelling closes at" name="self_cancel_closes_at" type="datetime-local" defaultValue={isoToLocalInput(ev.self_cancel_closes_at)} description="Leave blank to allow it until the event is archived." />
```

- [ ] **Step 2:** add `ev.self_cancel, ev.self_cancel_closes_at` to the big form's `formKey` list.

- [ ] **Step 3:** in `updateSettingsAction`'s `updateEvent` patch, after `registration_closes_at`, add
`self_cancel: formData.get("self_cancel") === "on",` and `self_cancel_closes_at: localInputToIso(str(formData, "self_cancel_closes_at")),` with comment `// D583`.

- [ ] **Step 4:** `npx tsc --noEmit`, `npm test`, `npx eslint "src/app/admin/events/[id]"`.

- [ ] **Step 5: Commit** `feat(cancel): Settings switch and cut-off for self-cancel (D583)`.

---

### Task 6: What the organiser sees

**Files:** Modify `src/app/admin/events/[id]/attendees/page.tsx`, `src/components/admin/AttendeeDetail.tsx`, `src/app/admin/events/[id]/export/attendance.xlsx/route.ts`, `src/lib/exports.ts` (`buildAttendanceWorkbook`), the spec (ruling 1). Create `src/features/cancel/admin/actions.ts`.

- [ ] **Step 1: Cancelled view** — Attendees page reads `sp.show === "cancelled"`. When set, `everyone = await listCancelledAttendees(ev.id)`; otherwise unchanged. Load `countCancelled(ev.id)` alongside. In the header area add a link: on the default view `Cancelled (${n})` → same URL with `show=cancelled` (only when `n > 0`); on the cancelled view `Back to registered`. Preserve `show` in `pageHref` and in the table `key`. On the cancelled view, the name cell shows `<Badge variant="outline">{cancelledLabel(a.cancelled_at!)}</Badge>` next to the name (add `cancelledAt: string | null` to `AttendeeRow` and render it in the name cell when set).

- [ ] **Step 2: Detail panel** — in `AttendeeDetail.tsx` badges, when `a.cancelled_at`: `<Badge variant="outline">{cancelledLabel(a.cancelled_at)}</Badge>`; in the footer, before Delete, `<form action={restoreAttendeeAction.bind(null, ev.id, a.id)}><SubmitButton variant="outline">Restore registration</SubmitButton></form>` (it is outside the panel's edit form — place it so forms don't nest; read the file and put it beside the existing footer or above the edit form).

- [ ] **Step 3: `src/features/cancel/admin/actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEventAccess } from "@/lib/access";
import { getAttendee } from "@/lib/db/attendees";
import { flashPath } from "@/lib/flash";
import { restoreAttendee } from "../db";

/** D588: Restore — admins and committee alike (event data). Bookings are not restored. */
export async function restoreAttendeeAction(eventId: string, attendeeId: string) {
  const { ev } = await requireEventAccess(eventId);
  const a = await getAttendee(attendeeId);
  const path = `/admin/events/${ev.id}/attendees`;
  if (!a || a.event_id !== ev.id) redirect(path);
  await restoreAttendee(ev.id, a.id);
  revalidatePath(path);
  redirect(flashPath(path, `Restored ${a.name}.`));
}
```

- [ ] **Step 4: Attendance export** — the route loads `listAttendees(ev.id)` and `listCancelledAttendees(ev.id)` and passes both (cancelled after active); `buildAttendanceWorkbook` appends a final `Cancelled at` column (`klDayTime(a.cancelled_at)` or blank). The `ids` selection still applies. Add/adjust the existing `tests/exports.test.ts` case for the new column (header present; value for a cancelled row; blank for active).

- [ ] **Step 5: Spec** — in D588 replace "Exports: the Attendees export gets a **Cancelled at** column…" with "Exports: the Attendance export (the Attendees table's export) includes cancelled rows with a **Cancelled at** column; every other export excludes them." and in Testing replace "Attendance export excludes them, Attendees export includes them with the date" with "Attendance export includes them with the date; Links and other exports exclude them".

- [ ] **Step 6:** `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`.

- [ ] **Step 7: Commit** `feat(cancel): Cancelled view, Restore and the export column (D588)`.

---

### Task 7: End-to-end on ecpkom, then clean up (controller)

- [ ] Admin pane: Settings → Registration on ecpkom → tick the switch, no cut-off, save (or the same SQL write if the pane cannot hydrate). Record ecpkom's starting values first.
- [ ] Insert a throwaway attendee on ecpkom (`ZZ Cancel Test`, `zz-cancel-test@example.com`, consented) by SQL; note counts (`countAttendees`, Overview) before.
- [ ] Playwright, their link: Me shows `Can't make it?` → cancel → dialog → `Yes, cancel` → the link shows the cancelled card; Overview/Attendees counts drop by one; `?show=cancelled` lists them with the badge; attendance export has `Cancelled at`; scanner search doesn't offer them; scanning their token shows `Cancelled registration…`; a direct POST attempt (re-open `/me`) 404s.
- [ ] Register again with the same email (registration must be open on ecpkom — check first; if closed, open it temporarily and restore after) → same link works, no cancelled card.
- [ ] Set ecpkom to draft (SQL) → their link shows Coming soon with the cancel link → cancel → cancelled card. Set ecpkom back to its starting status.
- [ ] Restore from the admin detail (or SQL equivalent) → active again.
- [ ] Refusals: cut-off in the past → no button; check them in → no button.
- [ ] Clean up: delete the throwaway attendee, restore ecpkom's switch/cut-off/registration/status values.
