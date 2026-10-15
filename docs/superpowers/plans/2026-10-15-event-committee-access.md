# Event Committee Access — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Ecopia admin adds a client's committee members to one event; each gets their own login, sees only their events, and can run everything inside them except the admin-only controls.

**Architecture:**
- **Data:** a new `event_committee` table (one row per person per event, carrying its one live link) and an `auth_user_id_by_email` SQL function. Migration `0083`.
- **Access:** a new `src/lib/access.ts` is the only module that calls `requireAdmin()` or `requireEvent()`. Event pages and actions call `requireEventAccess(id)` (admin of the org, or an active committee member of a non-archived event). Admin-only code calls `requireAdminEvent(id)` or `requireOrgAdmin()`. The decision itself is the pure `decideAccess()` in `src/lib/access-rules.ts`.
- **Feature:** `src/features/committee/` holds the table's reads and writes, the pure rules (emails, links, statuses, passwords), the Settings → Committee tab and the `/join/<token>` set-up and reset pages.
- **Guard test:** `tests/access-guard.test.ts` reads `src/` and fails if anything outside the access module reaches `requireAdmin`/`requireEvent`, or if admin-only checks appear anywhere not listed.

**Tech Stack:** Next.js app router (server components, Server Actions — check `node_modules/next/dist/docs/` for anything unfamiliar, per AGENTS.md), Supabase Postgres + Auth (service client, `auth.admin.*`, `@supabase/ssr` session client), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-15-event-committee-access-design.md` (D550–D564). Read it first.

## Global Constraints

- **Decision numbers** are D550–D564; D565–D569 are reserved spare. The migration is `0083`. Cite D-numbers in code comments the way the surrounding code does.
- **Test only on ecpkom** (`4e64a90c-728c-4a08-af62-8c8046afa0c9`). Never write to ecphub.
- **Work on `main`.** Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push until the user says so. Another session may commit to `main` at the same time: stage only your own files, never `git add -A`.
- **Supabase project** `wfmqwwcolfigjylkgrsv`; use the MCP `apply_migration` / `execute_sql`.
- **Verification commands:** `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- **Link lifetime:** 7 days, single use (`LINK_DAYS = 7`). **Password minimum:** 8 characters (`MIN_PASSWORD = 8`).
- **Copy, verbatim:**
  - Dead link: `This link no longer works. Ask the Ecopia team for a new one.`
  - Admin email added as committee: `That's an Ecopia admin login already.`
  - Duplicate: `<email> is already on this event's committee.`
  - Existing login heading: `You already have an ECP Hub login — sign in to add <event name>.` (use `APP_NAME` from `src/lib/app-name.ts`, not the literal "ECP Hub")
  - Login error `no-access`: title `No events to open`, description `You don't have access to any events right now.`
  - Archive refused: `Only the Ecopia team can archive an event.`
  - Status labels: `Invited · link expires <d MMM>`, `Link expired`, `Active since <d MMM>`, suffix ` · reset link until <d MMM>`.

## Ruling carried from planning

**Spec D563 says saving the Add member form "shows the set-up link in a dialog with Copy".** Server Actions here end in a redirect with a flash, and nothing on Settings reopens a dialog after a redirect. The verifier list solved the same problem with a **Link** column holding `CopyLink`. The Committee list does the same: the new row appears with its link ready to copy, and the flash says `Link made for <name>. Copy it from the list and send it to them.` Task 5 updates the spec line in its commit.

## Review Focus

Most likely to bite first:

1. **A committee member reaches an event page or action that was missed in the move.** It must 404, never open. Pinned by Task 3's guard test (nothing outside the access module can call `requireAdmin`/`requireEvent`), and by `requireAdmin` itself staying strict.
2. **A committee member forges a POST to an admin-only action** (delete, purge, archive, Features, Address, Committee). Pinned by Task 3's guard test counting every `requireAdminEvent`/`requireOrgAdmin` call (an action that uses one refuses a committee login on the server, whatever the request), and by `canSetStatus` (Task 1) inside `setStatusAction` (Task 4).
3. **The same person is added with different letter case or stray spaces** (`Ali@X.com ` then `ali@x.com`). One row per event, one login overall. Pinned by `normaliseEmail` tests (Task 1), the DB `check (email = lower(btrim(email)))` (Task 1), and the duplicate refusal (Task 5).
4. **A link is opened after Remove, after New link, after expiry, or a second time.** Always the one dead-link message. Pinned by `linkIsLive` tests (Task 1), `memberByToken` returning only the current token (Task 5), and Task 7.
5. **An archived event.** Committee access stops; the admin keeps it. Pinned by `decideAccess` tests (Task 1) and Task 7's archive/un-archive check.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `supabase/migrations/0083_event_committee.sql` | Create | Table, indexes, RLS, `auth_user_id_by_email` |
| `src/lib/access-rules.ts` | Create | Pure `decideAccess`, `AccessKind`, `SeatRow` |
| `src/lib/access.ts` | Create | `requireSignedIn`, `requireEventAccess`, `requireAdminEvent`, `requireOrgAdmin` |
| `src/lib/login-errors.ts` | Modify | `no-access` code and copy |
| `src/lib/links.ts` | Modify | `joinLink(base, token)` |
| `src/lib/db/events.ts` | Modify | `listEventsByIds(ids)` |
| `src/features/committee/types.ts` | Create | `CommitteeMember` |
| `src/features/committee/lib/rules.ts` | Create | Emails, member input, links, statuses, passwords, join error copy |
| `src/features/committee/db.ts` | Create | Reads and writes on `event_committee`, auth lookups |
| `src/features/committee/admin/actions.ts` | Create | Add, new set-up link, reset link, remove |
| `src/features/committee/admin/CommitteeTab.tsx` | Create | Settings → Committee |
| `src/features/committee/join/JoinPage.tsx` | Create | `/join/<token>` page |
| `src/features/committee/join/actions.ts` | Create | `joinAction` |
| `src/features/committee/index.ts` | Create | Feature entry |
| `src/app/join/[token]/page.tsx` | Create | Route → `JoinPage` |
| every event-scoped page, layout, action and route (Task 3 list) | Modify | Move to `requireEventAccess` |
| `src/app/admin/layout.tsx`, `(home)/page.tsx`, `events/(list)/layout.tsx`, `events/(list)/page.tsx` | Modify | Committee-aware lists and gate |
| `src/app/admin/events/[id]/settings/page.tsx` | Modify | Hide admin-only tabs, Committee tab, statuses |
| `tests/access-rules.test.ts`, `tests/committee-rules.test.ts`, `tests/access-guard.test.ts`, `tests/login-errors.test.ts` | Create/Modify | Tests |

---

### Task 1: Migration, types and the pure rules

**Files:**
- Create: `supabase/migrations/0083_event_committee.sql`, `src/lib/access-rules.ts`, `src/features/committee/types.ts`, `src/features/committee/lib/rules.ts`
- Test: `tests/access-rules.test.ts`, `tests/committee-rules.test.ts`

**Interfaces:**
- Produces:
  - `type AccessKind = "admin" | "committee"`
  - `type SeatRow = { event_id: string; user_id: string | null; removed_at: string | null }`
  - `decideAccess(a: { userId: string; adminOrgId: string | null; ev: { id: string; org_id: string; status: EventStatus }; seats: SeatRow[] }): AccessKind | null`
  - `canSetStatus(kind: AccessKind, status: EventStatus): boolean`
  - `type CommitteeMember` (columns of the table, below)
  - `LINK_DAYS`, `MIN_PASSWORD`, `normaliseEmail`, `parseMember`, `linkExpiry`, `linkIsLive`, `memberStatus`, `passwordProblem`, `JOIN_ERRORS`, `joinErrorCopy`

- [ ] **Step 1: Write the migration file**

```sql
-- Event committee access (spec 2026-10-15-event-committee-access-design.md, D550-D564).

-- D558: one row per person per event. The row carries its one live link; a new link overwrites
-- link_token, which is what cancels the old one. Removed rows are kept (removed_at), so "done by"
-- history and re-adds stay readable.
create table if not exists public.event_committee (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  email text not null check (email = lower(btrim(email))),
  user_id uuid references auth.users(id) on delete set null,
  added_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  accepted_at timestamptz,
  removed_at timestamptz,
  link_token text unique,
  link_kind text check (link_kind in ('setup', 'reset')),
  link_expires_at timestamptz
);
create unique index if not exists event_committee_active_email on public.event_committee (event_id, email) where removed_at is null;
create index if not exists event_committee_active_user on public.event_committee (user_id) where removed_at is null;
-- Like every table here: RLS on, no policies, only the service role reads it.
alter table public.event_committee enable row level security;

-- D559: the set-up link has to know whether a login already exists for an email. The Auth admin
-- API has no lookup by email, so this reads auth.users directly, for the service role only.
create or replace function public.auth_user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1
$$;
revoke all on function public.auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.auth_user_id_by_email(text) to service_role;
```

- [ ] **Step 2: Apply it**

Run the MCP `apply_migration` with name `0083_event_committee` and the file's SQL. Then check:
`execute_sql`: `select count(*) from event_committee; select public.auth_user_id_by_email('nobody@example.com');`
Expected: `0` and `null`.

- [ ] **Step 3: Write the failing tests**

`tests/access-rules.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { decideAccess, canSetStatus } from "@/lib/access-rules";

const ev = { id: "e1", org_id: "o1", status: "live" as const };
const seat = { event_id: "e1", user_id: "u1", removed_at: null };

describe("decideAccess", () => {
  it("lets an admin of the event's org in, archived or not", () => {
    expect(decideAccess({ userId: "u9", adminOrgId: "o1", ev, seats: [] })).toBe("admin");
    expect(decideAccess({ userId: "u9", adminOrgId: "o1", ev: { ...ev, status: "archived" }, seats: [] })).toBe("admin");
  });

  it("refuses an admin of another org", () => {
    expect(decideAccess({ userId: "u9", adminOrgId: "o2", ev, seats: [] })).toBeNull();
  });

  it("lets an active committee member of this event in, draft or live", () => {
    expect(decideAccess({ userId: "u1", adminOrgId: null, ev, seats: [seat] })).toBe("committee");
    expect(decideAccess({ userId: "u1", adminOrgId: null, ev: { ...ev, status: "draft" }, seats: [seat] })).toBe("committee");
  });

  it("refuses a committee member once the event is archived (D556)", () => {
    expect(decideAccess({ userId: "u1", adminOrgId: null, ev: { ...ev, status: "archived" }, seats: [seat] })).toBeNull();
  });

  it("refuses a removed member, another event's member, and a seat for someone else", () => {
    expect(decideAccess({ userId: "u1", adminOrgId: null, ev, seats: [{ ...seat, removed_at: "2026-10-15T00:00:00Z" }] })).toBeNull();
    expect(decideAccess({ userId: "u1", adminOrgId: null, ev, seats: [{ ...seat, event_id: "e2" }] })).toBeNull();
    expect(decideAccess({ userId: "u1", adminOrgId: null, ev, seats: [{ ...seat, user_id: "u2" }] })).toBeNull();
  });
});

describe("canSetStatus (D553)", () => {
  it("lets the committee publish and unpublish, but only an admin archive", () => {
    expect(canSetStatus("committee", "draft")).toBe(true);
    expect(canSetStatus("committee", "live")).toBe(true);
    expect(canSetStatus("committee", "archived")).toBe(false);
    expect(canSetStatus("admin", "archived")).toBe(true);
  });
});
```

`tests/committee-rules.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normaliseEmail, parseMember, linkExpiry, linkIsLive, memberStatus, passwordProblem, joinErrorCopy, LINK_DAYS } from "@/features/committee/lib/rules";

const now = new Date("2026-10-15T04:00:00Z"); // 12:00 in KL
const base = {
  id: "m1", event_id: "e1", name: "Aisyah", email: "aisyah@client.com", user_id: null, added_by: "a1",
  added_at: "2026-10-15T04:00:00Z", accepted_at: null, removed_at: null,
  link_token: "abcdefghjkmn", link_kind: "setup" as const, link_expires_at: "2026-10-22T04:00:00Z",
};

describe("normaliseEmail", () => {
  it("trims and lower-cases, so one person is one row and one login", () => {
    expect(normaliseEmail("  Ali@X.com ")).toBe("ali@x.com");
  });
});

describe("parseMember", () => {
  it("returns a tidy name and email", () => {
    expect(parseMember("  Aisyah  Rahman ", " Aisyah@Client.com")).toEqual({ name: "Aisyah Rahman", email: "aisyah@client.com" });
  });
  it("refuses a blank name, a long name, and a bad email", () => {
    expect(parseMember("", "a@b.co")).toEqual({ error: "Enter their name." });
    expect(parseMember("x".repeat(81), "a@b.co")).toEqual({ error: "Keep the name under 80 characters." });
    expect(parseMember("Ali", "ali@")).toEqual({ error: "Enter a valid email address." });
  });
});

describe("links", () => {
  it("expire LINK_DAYS after they are made", () => {
    expect(LINK_DAYS).toBe(7);
    expect(linkExpiry(now)).toBe("2026-10-22T04:00:00.000Z");
  });
  it("are live only with a token, before expiry, on a member not removed", () => {
    expect(linkIsLive(base, now)).toBe(true);
    expect(linkIsLive({ ...base, link_token: null }, now)).toBe(false);
    expect(linkIsLive(base, new Date("2026-10-22T04:00:00Z"))).toBe(false);
    expect(linkIsLive({ ...base, removed_at: "2026-10-16T00:00:00Z" }, now)).toBe(false);
  });
});

describe("memberStatus", () => {
  it("reads Invited, Link expired, Active, and Active with a reset link", () => {
    expect(memberStatus(base, now)).toBe("Invited · link expires 22 Oct");
    expect(memberStatus({ ...base, link_token: null }, now)).toBe("Link expired");
    const active = { ...base, user_id: "u1", accepted_at: "2026-10-16T02:00:00Z", link_token: null, link_kind: null, link_expires_at: null };
    expect(memberStatus(active, now)).toBe("Active since 16 Oct");
    expect(memberStatus({ ...active, link_token: "abcdefghjkmp", link_kind: "reset", link_expires_at: "2026-10-23T04:00:00Z" }, now))
      .toBe("Active since 16 Oct · reset link until 23 Oct");
  });
  it("uses the Malaysian date, not UTC, near midnight", () => {
    // 20 Oct 17:00 UTC is 21 Oct 01:00 in KL.
    expect(memberStatus({ ...base, link_expires_at: "2026-10-20T17:00:00Z" }, now)).toBe("Invited · link expires 21 Oct");
  });
});

describe("passwordProblem", () => {
  it("wants at least 8 characters, typed the same twice", () => {
    expect(passwordProblem("short", "short")).toBe("short");
    expect(passwordProblem("longenough", "longenougH")).toBe("mismatch");
    expect(passwordProblem("longenough", "longenough")).toBeNull();
  });
});

describe("joinErrorCopy", () => {
  it("has copy for every code and ignores anything else", () => {
    expect(joinErrorCopy("short")).toBe("Use at least 8 characters.");
    expect(joinErrorCopy("made-up")).toBeNull();
    expect(joinErrorCopy(undefined)).toBeNull();
  });
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `npx vitest run tests/access-rules.test.ts tests/committee-rules.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 5: Write `src/lib/access-rules.ts`**

```ts
import type { EventStatus } from "@/lib/types";

/** D551: who is acting on an event. An Ecopia admin, or a committee member of that one event. */
export type AccessKind = "admin" | "committee";

/** The `event_committee` columns the decision needs. */
export type SeatRow = { event_id: string; user_id: string | null; removed_at: string | null };

/**
 * D551/D556: the one access decision, kept pure so it is tested apart from Supabase.
 * An admin of the event's org always gets in. A committee member gets in on their own event while
 * it is not archived; archiving ends their access and un-archiving gives it back.
 */
export function decideAccess(a: {
  userId: string;
  adminOrgId: string | null;
  ev: { id: string; org_id: string; status: EventStatus };
  seats: SeatRow[];
}): AccessKind | null {
  if (a.adminOrgId && a.adminOrgId === a.ev.org_id) return "admin";
  if (a.ev.status === "archived") return null;
  const seated = a.seats.some((s) => s.event_id === a.ev.id && s.user_id === a.userId && !s.removed_at);
  return seated ? "committee" : null;
}

/** D553: archiving would end a committee member's own access (D556), so only Ecopia archives. */
export function canSetStatus(kind: AccessKind, status: EventStatus): boolean {
  return status !== "archived" || kind === "admin";
}
```

- [ ] **Step 6: Write `src/features/committee/types.ts`**

```ts
/** D558: one row of `event_committee`. */
export type CommitteeMember = {
  id: string;
  event_id: string;
  name: string;
  /** Lower-cased and trimmed (the column's check constraint enforces it). */
  email: string;
  /** Null until the set-up link is used. */
  user_id: string | null;
  added_by: string | null;
  added_at: string;
  accepted_at: string | null;
  /** Set by Remove; the row is kept. */
  removed_at: string | null;
  /** The one live link, or null. A new link overwrites it (D558). */
  link_token: string | null;
  link_kind: "setup" | "reset" | null;
  link_expires_at: string | null;
};
```

- [ ] **Step 7: Write `src/features/committee/lib/rules.ts`**

```ts
import { MONTHS } from "@/lib/text";
import type { CommitteeMember } from "../types";

/** D559/D560: every link lasts this long and works once. */
export const LINK_DAYS = 7;
export const MIN_PASSWORD = 8;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KL_OFFSET_MS = 8 * 60 * 60 * 1000;

/** One person is one row per event and one login: compare emails only in this form (D555). */
export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** The Add member form. Whitespace inside the name collapses; the email is normalised. */
export function parseMember(nameRaw: string, emailRaw: string): { name: string; email: string } | { error: string } {
  const name = nameRaw.trim().replace(/\s+/g, " ");
  if (!name) return { error: "Enter their name." };
  if (name.length > 80) return { error: "Keep the name under 80 characters." };
  const email = normaliseEmail(emailRaw);
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  return { name, email };
}

export function linkExpiry(now: Date): string {
  return new Date(now.getTime() + LINK_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function linkIsLive(m: Pick<CommitteeMember, "link_token" | "link_expires_at" | "removed_at">, now: Date): boolean {
  if (!m.link_token || !m.link_expires_at || m.removed_at) return false;
  return Date.parse(m.link_expires_at) > now.getTime();
}

/** "22 Oct" for an instant, on the Malaysian calendar. (`shortDate` would add a weekday.) */
function klDay(iso: string): string {
  const d = new Date(Date.parse(iso) + KL_OFFSET_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** D563: the Status column. */
export function memberStatus(m: CommitteeMember, now: Date): string {
  const live = linkIsLive(m, now);
  if (!m.accepted_at) return live ? `Invited · link expires ${klDay(m.link_expires_at!)}` : "Link expired";
  const active = `Active since ${klDay(m.accepted_at)}`;
  return live && m.link_kind === "reset" ? `${active} · reset link until ${klDay(m.link_expires_at!)}` : active;
}

/** A code, not a sentence: it travels in `?error=` like the login page's (see login-errors.ts). */
export function passwordProblem(password: string, confirm: string): "short" | "mismatch" | null {
  if (password.length < MIN_PASSWORD) return "short";
  if (password !== confirm) return "mismatch";
  return null;
}

const JOIN_COPY = {
  short: `Use at least ${MIN_PASSWORD} characters.`,
  mismatch: "The two passwords don't match.",
  wrong: "That isn't the password for this login. Try again, or ask the Ecopia team for a password reset link.",
  rejected: "That password wasn't accepted. Try a longer one.",
  busy: "Too many tries at once. Wait a minute and try again.",
} as const;
export const JOIN_ERRORS = Object.keys(JOIN_COPY) as (keyof typeof JOIN_COPY)[];
export type JoinError = keyof typeof JOIN_COPY;

/** Anything that is not one of our codes shows nothing, so a crafted URL cannot put words here. */
export function joinErrorCopy(raw: string | undefined): string | null {
  return raw && raw in JOIN_COPY ? JOIN_COPY[raw as JoinError] : null;
}
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run tests/access-rules.test.ts tests/committee-rules.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0083_event_committee.sql src/lib/access-rules.ts src/features/committee/types.ts src/features/committee/lib/rules.ts tests/access-rules.test.ts tests/committee-rules.test.ts
git commit -m "feat(committee): event_committee table and the access rules (D551, D556, D558-D560)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The access module and the no-access login error

**Files:**
- Create: `src/lib/access.ts`
- Modify: `src/lib/login-errors.ts`, `src/lib/db/events.ts`
- Test: `tests/login-errors.test.ts` (exists; add a case)

**Interfaces:**
- Consumes: `decideAccess`, `SeatRow`, `AccessKind` (Task 1); `requireAdmin` (`src/lib/auth.ts`); `getEvent`, `requireEvent` (`src/lib/db/events.ts`).
- Produces:
  - `type Actor = { userId: string; email: string; kind: AccessKind }`
  - `requireSignedIn(): Promise<{ userId: string; email: string; kind: "admin"; orgId: string; eventIds: [] } | { userId: string; email: string; kind: "committee"; orgId: null; eventIds: string[] }>`
  - `requireEventAccess(eventId: string): Promise<{ actor: Actor; ev: Event }>`
  - `requireAdminEvent(eventId: string): Promise<{ actor: Actor; ev: Event }>`
  - `requireOrgAdmin(): Promise<AdminContext>`
  - `listEventsByIds(ids: string[]): Promise<Event[]>`
  - login error code `"no-access"`

- [ ] **Step 1: Write the failing test**

Add to `tests/login-errors.test.ts`:

```ts
it("has its own copy for a login with no events left (D562)", () => {
  expect(loginErrorCopy("no-access")).toEqual({
    title: "No events to open",
    description: "You don't have access to any events right now.",
  });
});
```

(Import `loginErrorCopy` at the top if the file doesn't already.)

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/login-errors.test.ts`
Expected: FAIL, the copy is the `unknown` one.

- [ ] **Step 3: Add the code**

In `src/lib/login-errors.ts`, change the list and add the copy:

```ts
export const LOGIN_ERRORS = ["invalid", "unconfirmed", "rate", "disabled", "no-access", "unknown"] as const;
```

```ts
  "no-access": {
    title: "No events to open",
    description: "You don't have access to any events right now.",
  },
```

- [ ] **Step 4: Add `listEventsByIds` to `src/lib/db/events.ts`**

Put it beside `listEvents` (same newest-first order):

```ts
/** D552: a committee member's events, in the same order as the admin's list. */
export async function listEventsByIds(ids: string[]): Promise<Event[]> {
  if (ids.length === 0) return [];
  const { data, error } = await serviceClient().from("events").select("*").in("id", ids).order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown[]).map(hydrate);
}
```

- [ ] **Step 5: Write `src/lib/access.ts`**

```ts
import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { requireAdmin, type AdminContext } from "@/lib/auth";
import { getEvent, requireEvent, listEventsByIds } from "@/lib/db/events";
import { sessionClient } from "@/lib/supabase/session";
import { serviceClient } from "@/lib/supabase/service";
import { decideAccess, type AccessKind, type SeatRow } from "@/lib/access-rules";
import type { Event } from "@/lib/types";

/**
 * D551/D564: the only module that calls `requireAdmin()` or `requireEvent()`.
 * `tests/access-guard.test.ts` fails if anything else does.
 *
 * - `requireEventAccess(id)` for everything inside an event: an Ecopia admin, or a committee member
 *   of that event while it is not archived.
 * - `requireAdminEvent(id)` / `requireOrgAdmin()` for the admin-only list (D553). These are exactly
 *   the old pair, so a call site that was never moved still refuses a committee member: the move
 *   fails closed.
 */
export type Actor = { userId: string; email: string; kind: AccessKind };

const claimsOrLogin = cache(async (): Promise<{ userId: string; email: string }> => {
  const { data } = await (await sessionClient()).auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");
  return { userId: claims.sub, email: claims.email ?? "" };
});

const adminOrgOf = cache(async (userId: string): Promise<string | null> => {
  const { data } = await serviceClient().from("org_members").select("org_id").eq("user_id", userId).limit(1).maybeSingle();
  return (data?.org_id as string | undefined) ?? null;
});

const seatsOf = cache(async (userId: string): Promise<SeatRow[]> => {
  const { data, error } = await serviceClient().from("event_committee")
    .select("event_id, user_id, removed_at").eq("user_id", userId).is("removed_at", null);
  if (error) throw error;
  return (data ?? []) as SeatRow[];
});

/** Ecopia admins only (D553): create event, and the org-wide pages. */
export const requireOrgAdmin = (): Promise<AdminContext> => requireAdmin();

/**
 * The admin layout's gate (D552, D562). An admin, or a committee member with at least one event
 * that is not archived. Anyone else signed in is sent to the login page with `no-access`.
 */
export const requireSignedIn = cache(async () => {
  const { userId, email } = await claimsOrLogin();
  const orgId = await adminOrgOf(userId);
  if (orgId) return { userId, email, kind: "admin" as const, orgId, eventIds: [] as string[] };
  const ids = [...new Set((await seatsOf(userId)).map((s) => s.event_id))];
  const open = (await listEventsByIds(ids)).filter((e) => e.status !== "archived").map((e) => e.id);
  if (open.length === 0) redirect("/login?error=no-access");
  return { userId, email, kind: "committee" as const, orgId: null, eventIds: open };
});

/** Everything inside an event (D551). A refusal is a 404, as `requireEvent` always was. */
export const requireEventAccess = cache(async (eventId: string): Promise<{ actor: Actor; ev: Event }> => {
  const { userId, email } = await claimsOrLogin();
  const ev = await getEvent(eventId);
  if (!ev) notFound();
  const [adminOrgId, seats] = await Promise.all([adminOrgOf(userId), seatsOf(userId)]);
  const kind = decideAccess({ userId, adminOrgId, ev, seats });
  if (!kind) notFound();
  return { actor: { userId, email, kind }, ev };
});

/** The admin-only list inside an event (D553): delete, purge, Features, Address, Committee. */
export const requireAdminEvent = cache(async (eventId: string): Promise<{ actor: Actor; ev: Event }> => {
  const { userId, email, orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  return { actor: { userId, email, kind: "admin" }, ev };
});
```

- [ ] **Step 6: Point `requireAdmin`'s refusal at the new code**

In `src/lib/auth.ts`, change `redirect("/login?error=not-a-member")` to `redirect("/login?error=no-access")`. (The old code was never in `LOGIN_ERRORS` and showed the generic copy, D562.)

- [ ] **Step 7: Run tests and typecheck**

Run: `npx vitest run tests/login-errors.test.ts && npx tsc --noEmit`
Expected: PASS, and tsc exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/lib/access.ts src/lib/login-errors.ts src/lib/auth.ts src/lib/db/events.ts tests/login-errors.test.ts
git commit -m "feat(access): requireEventAccess and the admin-only checks, no-access login copy (D551, D562, D564)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Move every check, and the guard test

**Files:**
- Create: `tests/access-guard.test.ts`
- Modify: every file under `src/` that calls `requireAdmin(` or `requireEvent(`, except `src/lib/auth.ts`, `src/lib/db/events.ts` and `src/lib/access.ts`. Find them with:
  `rg -l "requireAdmin\(|requireEvent\(" src --glob "!src/lib/auth.ts" --glob "!src/lib/db/events.ts" --glob "!src/lib/access.ts"`
  At planning time that is about 47 files. The big one is `src/app/admin/events/[id]/actions.ts` (≈55 calls).

**Interfaces:**
- Consumes: `requireEventAccess`, `requireAdminEvent`, `requireOrgAdmin`, `requireSignedIn` (Task 2).
- Produces: no new names. After this task, `requireAdmin` and `requireEvent` appear in no other file.

- [ ] **Step 1: Write the guard test**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * D564: the access move fails closed only if nothing goes around it. This reads src/ and fails if
 * - anything outside the access module calls requireAdmin or requireEvent, or
 * - an admin-only check appears anywhere not listed below, or a different number of times.
 * Adding an admin-only control means adding it here on purpose.
 */
const SRC = join(process.cwd(), "src");
const ACCESS_FILES = new Set(["lib/auth.ts", "lib/db/events.ts", "lib/access.ts"]);

/** File → how many times each admin-only check is called in it (D553). */
const ADMIN_ONLY: Record<string, { requireOrgAdmin?: number; requireAdminEvent?: number }> = {
  "app/admin/events/[id]/actions.ts": { requireOrgAdmin: 1, requireAdminEvent: 2 }, // create; delete, purge
  "features/catalogue/admin/actions.ts": { requireAdminEvent: 1 }, // its event() helper
  "features/domains/admin/actions.ts": { requireAdminEvent: 1 }, // its event() helper
  "features/domains/admin/AddressTab.tsx": { requireAdminEvent: 1 },
  "features/committee/admin/actions.ts": { requireAdminEvent: 1 }, // its guard() helper (Task 5)
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}
const files = walk(SRC).map((p) => ({ rel: relative(SRC, p).split("\\").join("/"), src: readFileSync(p, "utf8") }));
const calls = (src: string, fn: string) => src.split(`${fn}(`).length - 1;

describe("access guard (D564)", () => {
  it("only the access module reaches requireAdmin and requireEvent", () => {
    const offenders = files
      .filter((f) => !ACCESS_FILES.has(f.rel))
      // Calls and imports, not comments: plenty of comments mention requireAdmin by name.
      .filter((f) => /\brequire(Admin|Event)\s*\(/.test(f.src) || /import[^;]*\brequire(Admin|Event)\b[^;]*from/.test(f.src))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("admin-only checks appear exactly where listed", () => {
    const found: Record<string, { requireOrgAdmin?: number; requireAdminEvent?: number }> = {};
    for (const f of files) {
      if (ACCESS_FILES.has(f.rel)) continue;
      const org = calls(f.src, "requireOrgAdmin");
      const ev = calls(f.src, "requireAdminEvent");
      if (org || ev) found[f.rel] = { ...(org ? { requireOrgAdmin: org } : {}), ...(ev ? { requireAdminEvent: ev } : {}) };
    }
    // The committee feature is created in Task 5; until then it is absent from both sides.
    const expected = Object.fromEntries(Object.entries(ADMIN_ONLY).filter(([rel]) => files.some((f) => f.rel === rel)));
    expect(found).toEqual(expected);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/access-guard.test.ts`
Expected: FAIL. The first test lists every file still calling `requireAdmin`/`requireEvent`. That list is this task's to-do list.

- [ ] **Step 3: Move the event-scoped call sites**

Work through the failing list file by file. The rewrites:

| Before | After |
|---|---|
| `const { orgId } = await requireAdmin();` + `const ev = await requireEvent(X, orgId);` | `const { ev } = await requireEventAccess(X);` |
| `const { orgId, userId } = await requireAdmin();` + `const ev = await requireEvent(X, orgId);` | `const { ev, actor } = await requireEventAccess(X);`, then `actor.userId` where `userId` was used |
| `const { orgId } = await requireAdmin();` + `await requireEvent(X, orgId);` (ev unused) | `await requireEventAccess(X);` |
| `const { orgId, email } = await requireAdmin();` (event layout) | `const { ev, actor } = await requireEventAccess(id);`, then `actor.email` |
| any other use of `orgId` after the move (e.g. `uploadEventImage({ orgId, ... })`, `nextImage(..., { orgId, ... })`) | `ev.org_id` |
| helpers `event()`, `guard()`, `wallOf()`, `currentModules()`, `authorise()` | same rewrite inside the helper; callers unchanged |

Import from `@/lib/access` and drop the `@/lib/auth` / `requireEvent` imports that are no longer used.

**Admin-only call sites** take the other path (D553):
- `createEventAction` in `app/admin/events/[id]/actions.ts`: `const { orgId } = await requireOrgAdmin();`
- `deleteEventAction` and `purgeEventAction` in the same file: `const { ev } = await requireAdminEvent(eventId);` (use `ev.org_id` where `orgId` was used, e.g. `deleteEvent(ev.id, ev.org_id)`).
- `features/catalogue/admin/actions.ts` and `features/domains/admin/actions.ts`: their `event()` helper becomes `return (await requireAdminEvent(eventId)).ev;` (keep the helper's existing return shape).
- `features/domains/admin/AddressTab.tsx`: `const { ev } = await requireAdminEvent(eventId);`

**Pages outside `[id]`:**
- `app/admin/layout.tsx`: `await requireSignedIn();`
- `app/admin/(home)/page.tsx`, `app/admin/events/(list)/layout.tsx`, `app/admin/events/(list)/page.tsx`: use `requireSignedIn()` (Task 4 makes them committee-aware; for now take `orgId`/`email` from it, and in `(list)/page.tsx` / `(home)/page.tsx` call `listEvents(me.orgId!)` when `me.kind === "admin"` and `listEventsByIds(me.eventIds)` otherwise).
- `app/admin/requests/[eventId]/page.tsx`, `app/scan/[eventId]/page.tsx`: `requireEventAccess(eventId)`.
- `app/scan/[eventId]/actions.ts` `authorise()`: the admin branch becomes
  `const { ev, actor } = await requireEventAccess(eventId); return { ev, userId: actor.userId };`

Run the guard test after each few files; the offender list shrinks.

- [ ] **Step 4: Typecheck as you go**

Run: `npx tsc --noEmit`
Expected: 0. A leftover `orgId` that the table above missed shows up here.

- [ ] **Step 5: Run the guard test and the full suite**

Run: `npx vitest run tests/access-guard.test.ts && npm test`
Expected: PASS everywhere.

- [ ] **Step 6: Admin smoke check in the browser**

Start the dev server (`preview_start` name `dev`), sign in as the admin (the user's session in the pane), and open on ecpkom: Overview, Attendees, Settings (every tab), Exports (download one), Activities, Games, Agenda, `/scan/<id>`, `/admin/requests/<id>`. Each should load as before. Read `preview_logs` for errors.

- [ ] **Step 7: Commit**

```bash
git add tests/access-guard.test.ts src
git status --short   # check only files this task changed are staged; unstage anything else
git commit -m "refactor(access): every event check goes through requireEventAccess; guard test (D564)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: What a committee member sees

**Files:**
- Modify: `src/app/admin/(home)/page.tsx`, `src/app/admin/events/(list)/page.tsx`, `src/app/admin/events/[id]/settings/page.tsx`, `src/app/admin/events/[id]/actions.ts` (`setStatusAction`)

**Interfaces:**
- Consumes: `requireSignedIn`, `requireEventAccess`, `Actor` (Task 2); `listEventsByIds` (Task 2); `canSetStatus` (Task 1); `pickLandingEvent` (`src/lib/landing.ts`).

- [ ] **Step 1: `/admin` home lands a committee member on their event**

```ts
export default async function AdminHome() {
  const me = await requireSignedIn();
  const events = me.kind === "admin" ? await listEvents(me.orgId) : await listEventsByIds(me.eventIds);
  // D552: one event goes straight in; several use the same landing rule as an admin.
  const landing = events.length === 1 ? events[0] : pickLandingEvent(events);
  redirect(landing ? `/admin/events/${landing.id}` : "/admin/events");
}
```

- [ ] **Step 2: The Events list shows only theirs, without New event**

In `(list)/page.tsx`: load events as in Step 1, and render the `AdminHeader` `actions` (the New event modal) only when `me.kind === "admin"`. For a committee member the empty state never shows (they always have one event, D562).

- [ ] **Step 3: Settings hides the admin-only tabs (D553, D563)**

In `settings/page.tsx`:
- `const { ev, actor } = await requireEventAccess(id); const isAdmin = actor.kind === "admin";`
- Build `tabs` from the existing list, then drop `features`, `address` and `danger` when `!isAdmin`. (Task 5 adds `committee` the same way.)
- Wrap the `TabsTrigger` and `TabsContent` for Features, Address and Danger zone in `isAdmin &&`. **Do not render `<FeaturesTab>` or `<AddressTab>` for a committee member**: `AddressTab` calls `requireAdminEvent` and would 404 the whole page.
- `const statuses = isAdmin ? STATUSES : STATUSES.filter((s) => s.value !== "archived");` and pass `statuses` to `StatusPicker`.

- [ ] **Step 4: `setStatusAction` refuses Archived for committee**

```ts
export async function setStatusAction(eventId: string, status: EventStatus) {
  const { actor } = await requireEventAccess(eventId);
  if (!canSetStatus(actor.kind, status)) {
    redirect(flashPath(`/admin/events/${eventId}/settings`, "Only the Ecopia team can archive an event.", "error"));
  }
  await setEventStatus(eventId, status);
  revalidatePath(`/admin/events/${eventId}`);
}
```

Import `canSetStatus` from `@/lib/access-rules`. Then run `rg "setEventStatus\(" src` and confirm no other path lets a non-admin reach `archived`. If one does, give it the same guard.

- [ ] **Step 5: Typecheck, tests, lint**

Run: `npx tsc --noEmit && npm test && npx eslint "src/app/admin"`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add "src/app/admin/(home)/page.tsx" "src/app/admin/events/(list)/page.tsx" "src/app/admin/events/[id]/settings/page.tsx" "src/app/admin/events/[id]/actions.ts"
git commit -m "feat(access): committee members see only their events and no admin-only tabs (D552, D553)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Settings → Committee

**Files:**
- Create: `src/features/committee/db.ts`, `src/features/committee/admin/actions.ts`, `src/features/committee/admin/CommitteeTab.tsx`, `src/features/committee/index.ts`
- Modify: `src/lib/links.ts`, `src/app/admin/events/[id]/settings/page.tsx`, `docs/superpowers/specs/2026-10-15-event-committee-access-design.md` (the ruling above)
- Test: `tests/links.test.ts` (exists; add a case), `tests/access-guard.test.ts` (already lists the actions file)

**Interfaces:**
- Consumes: `CommitteeMember` and the rules (Task 1); `requireAdminEvent` (Task 2).
- Produces (`db.ts`):
  - `listMembers(eventId: string): Promise<CommitteeMember[]>`
  - `addMember(eventId: string, name: string, email: string, addedBy: string): Promise<CommitteeMember | "duplicate">`
  - `issueLink(eventId: string, id: string, kind: "setup" | "reset"): Promise<boolean>`
  - `removeMember(eventId: string, id: string): Promise<boolean>`
  - `memberByToken(token: string): Promise<CommitteeMember | null>`
  - `acceptMember(id: string, userId: string): Promise<void>`
  - `clearLink(id: string): Promise<void>`
  - `userIdByEmail(email: string): Promise<string | null>`
  - `isOrgAdmin(userId: string): Promise<boolean>`
  - `joinLink(base: string, token: string): string` (in `src/lib/links.ts`)

- [ ] **Step 1: Write the failing link test**

Add to `tests/links.test.ts`:

```ts
it("builds the committee set-up link on the main address (D559)", () => {
  expect(joinLink("https://ecphub.vercel.app/", "abcdefghjkmn")).toBe("https://ecphub.vercel.app/join/abcdefghjkmn");
});
```

Run: `npx vitest run tests/links.test.ts` → FAIL (`joinLink` missing).

- [ ] **Step 2: Add `joinLink` to `src/lib/links.ts`**, beside `verifierLink`:

```ts
/** D559: a committee member's one-time set-up or reset link. Always the main address. */
export function joinLink(base: string, token: string) {
  return `${trimSlash(base)}/join/${token}`;
}
```

Run the test → PASS.

- [ ] **Step 3: Write `src/features/committee/db.ts`**

```ts
import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { generateToken, isValidToken } from "@/lib/tokens";
import type { CommitteeMember } from "./types";
import { linkExpiry } from "./lib/rules";

const table = () => serviceClient().from("event_committee");

/** D563: the active members, oldest first. Removed rows stay in the table, not in the list. */
export async function listMembers(eventId: string): Promise<CommitteeMember[]> {
  const { data, error } = await table().select("*").eq("event_id", eventId).is("removed_at", null).order("added_at");
  if (error) throw error;
  return (data ?? []) as CommitteeMember[];
}

/** D559: a new member comes with their set-up link. "duplicate" when they are already on it. */
export async function addMember(eventId: string, name: string, email: string, addedBy: string): Promise<CommitteeMember | "duplicate"> {
  const { data, error } = await table().insert({
    event_id: eventId, name, email, added_by: addedBy,
    link_token: generateToken(), link_kind: "setup", link_expires_at: linkExpiry(new Date()),
  }).select("*").single();
  if (error?.code === "23505") return "duplicate";
  if (error) throw error;
  return data as CommitteeMember;
}

/**
 * D558-D560: a fresh link overwrites the old one, which stops it. A reset link needs a login to
 * reset, so it is refused for someone who never finished setting up.
 */
export async function issueLink(eventId: string, id: string, kind: "setup" | "reset"): Promise<boolean> {
  let q = table().update({ link_token: generateToken(), link_kind: kind, link_expires_at: linkExpiry(new Date()) })
    .eq("id", id).eq("event_id", eventId).is("removed_at", null);
  q = kind === "reset" ? q.not("user_id", "is", null) : q.is("accepted_at", null);
  const { data, error } = await q.select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** D559: stamped, not deleted; any unused link dies with it. */
export async function removeMember(eventId: string, id: string): Promise<boolean> {
  const { data, error } = await table().update({ removed_at: new Date().toISOString(), link_token: null, link_kind: null, link_expires_at: null })
    .eq("id", id).eq("event_id", eventId).is("removed_at", null).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** The row a /join link belongs to. Liveness is the caller's check (`linkIsLive`). */
export async function memberByToken(token: string): Promise<CommitteeMember | null> {
  if (!isValidToken(token)) return null;
  const { data, error } = await table().select("*").eq("link_token", token).maybeSingle();
  if (error) throw error;
  return (data as CommitteeMember | null) ?? null;
}

/** D559: the set-up link was used. The link is spent. */
export async function acceptMember(id: string, userId: string): Promise<void> {
  const { error } = await table().update({ user_id: userId, accepted_at: new Date().toISOString(), link_token: null, link_kind: null, link_expires_at: null }).eq("id", id);
  if (error) throw error;
}

/** D560: a reset link was used. Only the link changes. */
export async function clearLink(id: string): Promise<void> {
  const { error } = await table().update({ link_token: null, link_kind: null, link_expires_at: null }).eq("id", id);
  if (error) throw error;
}

export async function userIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await serviceClient().rpc("auth_user_id_by_email", { p_email: email });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** D554: nobody is both an Ecopia admin and committee. */
export async function isOrgAdmin(userId: string): Promise<boolean> {
  const { data, error } = await serviceClient().from("org_members").select("user_id").eq("user_id", userId).limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
```

- [ ] **Step 4: Write `src/features/committee/admin/actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminEvent } from "@/lib/access";
import { flashPath } from "@/lib/flash";
import { parseMember } from "../lib/rules";
import { addMember, issueLink, removeMember, userIdByEmail, isOrgAdmin } from "../db";

const settingsPath = (eventId: string) => `/admin/events/${eventId}/settings`;

/** D553/D563: every committee write is Ecopia's. */
async function guard(eventId: string) {
  return requireAdminEvent(eventId);
}

export async function addMemberAction(eventId: string, fd: FormData) {
  const { ev, actor } = await guard(eventId);
  const path = settingsPath(eventId);
  const parsed = parseMember(String(fd.get("name") ?? ""), String(fd.get("email") ?? ""));
  if ("error" in parsed) redirect(flashPath(path, parsed.error, "error"));
  const existing = await userIdByEmail(parsed.email);
  if (existing && await isOrgAdmin(existing)) redirect(flashPath(path, "That's an Ecopia admin login already.", "error"));
  const made = await addMember(ev.id, parsed.name, parsed.email, actor.userId);
  if (made === "duplicate") redirect(flashPath(path, `${parsed.email} is already on this event's committee.`, "error"));
  revalidatePath(path);
  redirect(flashPath(path, `Link made for ${parsed.name}. Copy it from the list and send it to them.`));
}

export async function newSetupLinkAction(eventId: string, memberId: string) {
  const { ev } = await guard(eventId);
  const ok = await issueLink(ev.id, memberId, "setup");
  revalidatePath(settingsPath(eventId));
  redirect(flashPath(settingsPath(eventId), ok ? "New set-up link ready. The old one has stopped working." : "They've already set up their login. Send a password reset link instead.", ok ? "ok" : "error"));
}

export async function resetLinkAction(eventId: string, memberId: string) {
  const { ev } = await guard(eventId);
  const ok = await issueLink(ev.id, memberId, "reset");
  revalidatePath(settingsPath(eventId));
  redirect(flashPath(settingsPath(eventId), ok ? "Password reset link ready. Copy it from the list and send it to them." : "They haven't set up their login yet. Send a new set-up link instead.", ok ? "ok" : "error"));
}

export async function removeMemberAction(eventId: string, memberId: string) {
  const { ev } = await guard(eventId);
  const ok = await removeMember(ev.id, memberId);
  revalidatePath(settingsPath(eventId));
  redirect(flashPath(settingsPath(eventId), ok ? "Removed. Their access to this event has stopped." : "They were already removed.", ok ? "ok" : "error"));
}
```

- [ ] **Step 5: Write `src/features/committee/admin/CommitteeTab.tsx`**

Follow `src/features/activities/admin/VerificationTab.tsx` (same imports for `Card`, `Table`, `Modal`, `Field`, `SubmitButton`, `CopyLink`, `RowActions`):

```tsx
import { appBaseUrl, joinLink } from "@/lib/links";
import type { Event } from "@/lib/types";
// …same UI imports as VerificationTab…
import { listMembers } from "../db";
import { linkIsLive, memberStatus } from "../lib/rules";
import { addMemberAction, newSetupLinkAction, resetLinkAction, removeMemberAction } from "./actions";

/**
 * D563: Settings → Committee, Ecopia admins only. Outside the big Settings form: each control
 * posts its own small form. The Settings page renders this only for an admin.
 */
export async function CommitteeTab({ ev }: { ev: Event }) {
  const members = await listMembers(ev.id);
  const base = appBaseUrl();
  const now = new Date();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Committee</CardTitle>
        <CardDescription>
          People from the client who run this event with you. Each gets their own login and sees this event only — everything
          inside it, except Features, Address, this list, archiving and deleting, which stay with the Ecopia team.
          Their access ends when the event is archived.
        </CardDescription>
        <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
          <Modal title="Add a committee member" hint="You'll get a one-time link to send them. It works for 7 days." trigger="Add member" icon="plus">
            <form action={addMemberAction.bind(null, ev.id)} className="grid gap-4">
              <Field label="Name" name="name" placeholder="Aisyah Rahman" />
              <Field label="Email" name="email" type="email" placeholder="aisyah@client.com" description="They sign in with this. If they're on another event's committee, use the same email." />
              <SubmitButton>Make their link</SubmitButton>
            </form>
          </Modal>
        </div>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No committee members yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Link</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => {
                const live = linkIsLive(m, now);
                const url = live && m.link_token ? joinLink(base, m.link_token) : null;
                const setUp = Boolean(m.accepted_at);
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-semibold">{m.name}</TableCell>
                    <TableCell className="text-muted-foreground">{m.email}</TableCell>
                    <TableCell>{memberStatus(m, now)}</TableCell>
                    <TableCell>{url ? <CopyLink link={url} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        name={m.name}
                        dialog={setUp ? {
                          label: "Password reset link",
                          title: `Make a password reset link for ${m.name}?`,
                          hint: "It works once, for 7 days. Their new password applies to every event they're on.",
                          form: <form action={resetLinkAction.bind(null, ev.id, m.id)}><SubmitButton>Make reset link</SubmitButton></form>,
                        } : {
                          label: "New set-up link",
                          title: `Make a new set-up link for ${m.name}?`,
                          hint: "The old link stops working at once. Send them the new one.",
                          form: <form action={newSetupLinkAction.bind(null, ev.id, m.id)}><SubmitButton>Make new link</SubmitButton></form>,
                        }}
                        remove={{
                          action: removeMemberAction.bind(null, ev.id, m.id),
                          label: "Remove",
                          message: "Their access to this event stops at once, and any link they haven't used stops working. Things they did stay credited to them.",
                        }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Write `src/features/committee/index.ts`**

```ts
/** The committee feature's server entry (D550-D564). */
export * from "./db";
export * from "./types";
export { CommitteeTab } from "./admin/CommitteeTab";
```

Task 6 adds the `JoinPage` export.

- [ ] **Step 7: Add the tab to Settings**

In `settings/page.tsx`: add `"committee"` to the tab list before `"danger"`, drop it when `!isAdmin` (with Features/Address/Danger), and add:

```tsx
{isAdmin && <TabsTrigger value="committee">Committee</TabsTrigger>}
```
```tsx
{isAdmin && (
  <TabsContent value="committee" className="flex flex-col gap-4">
    <CommitteeTab ev={ev} />
  </TabsContent>
)}
```

Import `CommitteeTab` from `@/features/committee`.

- [ ] **Step 8: Update the spec line** (the ruling at the top of this plan): in D563 replace "Saving shows the set-up link in a dialog with Copy." with "Saving adds the row with its set-up link in a **Link** column with Copy, as the verifier list does, and the flash says to copy it."

- [ ] **Step 9: Run the checks**

Run: `npx tsc --noEmit && npm test && npx eslint src/features/committee "src/app/admin/events/[id]/settings"`
Expected: clean. The guard test now finds `features/committee/admin/actions.ts` with one `requireAdminEvent`, as listed.

- [ ] **Step 10: Commit**

```bash
git add src/features/committee src/lib/links.ts tests/links.test.ts "src/app/admin/events/[id]/settings/page.tsx" docs/superpowers/specs/2026-10-15-event-committee-access-design.md
git commit -m "feat(committee): Settings > Committee, add/link/reset/remove (D553, D554, D558-D560, D563)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The `/join` page

**Files:**
- Create: `src/features/committee/join/JoinPage.tsx`, `src/features/committee/join/actions.ts`, `src/app/join/[token]/page.tsx`
- Modify: `src/features/committee/index.ts`

**Interfaces:**
- Consumes: `memberByToken`, `acceptMember`, `clearLink`, `userIdByEmail`, `isOrgAdmin` (Task 5); `linkIsLive`, `passwordProblem`, `joinErrorCopy` (Task 1); `getEvent` (`src/lib/db/events.ts`); `sessionClient`, `serviceClient`; `allow` (`src/lib/ratelimit.ts`); `APP_NAME`.
- Produces: `JoinPage`, `joinAction(token: string, fd: FormData)`.

- [ ] **Step 1: Write `src/features/committee/join/actions.ts`**

```ts
"use server";
import { redirect } from "next/navigation";
import { getEvent } from "@/lib/db/events";
import { allow } from "@/lib/ratelimit";
import { sessionClient } from "@/lib/supabase/session";
import { serviceClient } from "@/lib/supabase/service";
import { linkIsLive, passwordProblem } from "../lib/rules";
import { memberByToken, acceptMember, clearLink, userIdByEmail, isOrgAdmin } from "../db";

/**
 * D559-D561: the token is the only authority. A Server Action is a public POST, so every call
 * re-reads the row and the event from the token. Any refusal that is about the link itself goes
 * back to the page with no error code, which shows the one dead-link message.
 */
export async function joinAction(token: string, fd: FormData) {
  const page = `/join/${token}`;
  if (!allow(`join-submit:${token}`, 10, 60_000)) redirect(`${page}?error=busy`);
  const m = await memberByToken(token);
  const ev = m ? await getEvent(m.event_id) : null;
  if (!m || !ev || ev.status === "archived" || !linkIsLive(m, new Date())) redirect(page);

  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  const existing = await userIdByEmail(m.email);
  if (existing && await isOrgAdmin(existing)) redirect(page); // D554
  const auth = serviceClient().auth.admin;

  if (m.link_kind === "reset") {
    // D560: a new password for an existing login.
    const problem = passwordProblem(password, confirm);
    if (problem) redirect(`${page}?error=${problem}`);
    if (!m.user_id) redirect(page);
    const { error } = await auth.updateUserById(m.user_id, { password });
    if (error) redirect(`${page}?error=rejected`);
    await clearLink(m.id);
  } else if (existing) {
    // D555/D559: they already have a login; their current password proves it is them.
    const { error } = await (await sessionClient()).auth.signInWithPassword({ email: m.email, password });
    if (error) redirect(`${page}?error=wrong`);
    await acceptMember(m.id, existing);
    redirect(`/admin/events/${m.event_id}`);
  } else {
    const problem = passwordProblem(password, confirm);
    if (problem) redirect(`${page}?error=${problem}`);
    const { data, error } = await auth.createUser({ email: m.email, password, email_confirm: true });
    if (error || !data.user) redirect(`${page}?error=rejected`);
    await acceptMember(m.id, data.user.id);
  }
  // D561: the same sign-in as /login, so the cookies are set the same way.
  await (await sessionClient()).auth.signInWithPassword({ email: m.email, password });
  redirect(`/admin/events/${m.event_id}`);
}
```

- [ ] **Step 2: Write `src/features/committee/join/JoinPage.tsx`**

Same frame and parts as `src/app/login/page.tsx`:

```tsx
import { TriangleAlert } from "lucide-react";
import { getEvent } from "@/lib/db/events";
import { allow } from "@/lib/ratelimit";
import { APP_NAME, APP_MARK } from "@/lib/app-name";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { linkIsLive, joinErrorCopy, MIN_PASSWORD } from "../lib/rules";
import { memberByToken, userIdByEmail, isOrgAdmin } from "../db";
import { joinAction } from "./actions";

const DEAD = "This link no longer works. Ask the Ecopia team for a new one.";
const BUSY = "Too many tries at once. Wait a minute and try again.";

/**
 * D559-D561: /join/<token>. A new login, an existing login, or a password reset, and one card
 * for every link that does not work. It never says why a link is dead.
 */
export async function JoinPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const busy = !allow(`join-page:${token}`, 60, 60_000);
  const m = busy ? null : await memberByToken(token);
  const ev = m ? await getEvent(m.event_id) : null;
  const existing = m ? await userIdByEmail(m.email) : null;
  const admin = existing !== null && await isOrgAdmin(existing);
  const open = Boolean(m && ev && ev.status !== "archived" && linkIsLive(m, new Date()) && !admin);
  const mode = !open ? null : m!.link_kind === "reset" ? "reset" : existing ? "existing" : "new";
  const problem = joinErrorCopy(error);

  const title = mode === "new" ? `Set up your ${APP_NAME} login`
    : mode === "existing" ? `You already have an ${APP_NAME} login — sign in to add ${ev!.name}.`
    : mode === "reset" ? "Choose a new password"
    : "Link not working";
  const description = mode === "new" ? `For ${ev!.name}. You'll sign in with this email from now on.`
    : mode === "existing" ? "Use the password you already sign in with."
    : mode === "reset" ? "It works for every event you're on."
    : busy ? BUSY : DEAD;
  const button = mode === "new" ? "Create my login" : mode === "existing" ? "Sign in and add this event" : "Save my new password";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm items-center bg-background p-6">
      <Card className="w-full">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={APP_MARK} alt="" width={40} height={40} className="size-10 shrink-0" />
            <span className="text-xl font-extrabold">{APP_NAME}</span>
          </div>
          <CardTitle className="text-base font-extrabold">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {mode && (
          <CardContent className="flex flex-col gap-4">
            {problem && (
              <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>Not saved</AlertTitle>
                <AlertDescription>{problem}</AlertDescription>
              </Alert>
            )}
            <form action={joinAction.bind(null, token)} className="flex flex-col gap-4">
              <FieldGroup>
                {mode === "new" && (
                  <Field>
                    <FieldLabel htmlFor="name">Name</FieldLabel>
                    <Input id="name" value={m!.name} readOnly className="h-11" />
                  </Field>
                )}
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input id="email" type="email" value={m!.email} readOnly autoComplete="username" className="h-11" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">{mode === "existing" ? "Password" : "New password"}</FieldLabel>
                  <Input id="password" name="password" type="password" required
                    autoComplete={mode === "existing" ? "current-password" : "new-password"}
                    minLength={mode === "existing" ? undefined : MIN_PASSWORD} className="h-11" />
                </Field>
                {mode !== "existing" && (
                  <Field>
                    <FieldLabel htmlFor="confirm">Type it again</FieldLabel>
                    <Input id="confirm" name="confirm" type="password" required autoComplete="new-password" minLength={MIN_PASSWORD} className="h-11" />
                  </Field>
                )}
              </FieldGroup>
              <SubmitButton className="h-11 w-full">{button}</SubmitButton>
            </form>
          </CardContent>
        )}
      </Card>
    </main>
  );
}
```

- [ ] **Step 3: Write the route**

`src/app/join/[token]/page.tsx`:

```tsx
import { JoinPage } from "@/features/committee";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join" };

export default function Page(props: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  return <JoinPage {...props} />;
}
```

Add `export { JoinPage } from "./join/JoinPage";` to `src/features/committee/index.ts`.

- [ ] **Step 4: Check the proxy leaves `/join` alone on the main address**

Read `src/proxy.ts`. `/join` is not in `ADMIN_PATHS`, so the main host serves it with no session check. On an event's own domain the proxy sends everything to `eventHost`, so `/join` is never served there. No change expected; if the proxy does something else with `/join`, stop and report.

- [ ] **Step 5: Run the checks**

Run: `npx tsc --noEmit && npm test && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/committee/join src/features/committee/index.ts "src/app/join/[token]/page.tsx"
git commit -m "feat(committee): /join set-up and password reset pages (D559-D561)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: End-to-end check on ecpkom, then clean up

**Files:** none (verification only), plus the memory note.

- [ ] **Step 1: Make a throwaway test login**

As the admin in the browser pane, Settings → Committee on **ecpkom**: Add member, name `ZZ Committee Test`, email `zz-committee-test@example.com`. Expected: flash "Link made…", a row "Invited · link expires <d MMM>" with a link.

Generate a random 16-character password into a scratchpad file (never the repo, never in chat).

- [ ] **Step 2: Set it up through the link**

Open the link in a **second** browser tab after signing the admin out (or use `mcp__Claude_Browser__tabs_create` and sign out there; the pane's cookies are shared, so sign the admin back in at the end). Check, in order:
- A mismatched confirmation shows "The two passwords don't match." and nothing is created (`select count(*) from auth.users where email = 'zz-committee-test@example.com'` → 0).
- The real password creates the login and lands on ecpkom's Overview.
- Opening the same link again shows the dead-link message.

- [ ] **Step 3: Check what the committee member can and can't do**
- `/admin/events` lists only ecpkom, with no New event button; `/admin` goes straight to ecpkom.
- Settings has no Features, Address, Committee or Danger zone tab; the status picker offers Draft and Live only.
- Another event's URL (`/admin/events/39405e56-89ea-4e87-9718-798329bea7ef`) is a 404.
- Attendees, Exports (download one), Activities, Agenda and `/scan/<ecpkom id>` all work.
- `read_page` on Settings shows no Danger zone, Features, Address or Committee content anywhere in the DOM (not only hidden tabs). The server-side refusal of those actions is proven by the guard test (Task 3) and `canSetStatus` (Task 1): their Server Actions are only reachable through `requireAdminEvent`/`requireOrgAdmin`, which a committee login never passes.
- `execute_sql`: `select scanned_by from checkins …` after one test check-in by the committee member shows their user id; Attendee detail shows their email as the scanner. Undo the check-in afterwards.

- [ ] **Step 4: Reset, archive and remove**
- Admin: ⋯ → Password reset link; open it as the committee member; set a new password; signed in again.
- Admin: archive ecpkom → the committee member's next page load goes to `/login?error=no-access` with "No events to open". Admin: set ecpkom back to **Live**.
- Admin: ⋯ → Remove → the committee member's next load is refused the same way.

- [ ] **Step 5: Clean up**

```sql
delete from event_committee where email = 'zz-committee-test@example.com';
delete from auth.users where email = 'zz-committee-test@example.com';
select status from events where slug = 'ecpkom';  -- expect 'live'
```

Sign the admin back in to the browser pane if the test signed them out. Delete the scratchpad password file.

- [ ] **Step 6: Full checks**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 7: Save the project memory and report**

Write a memory file `event-committee-access.md` (what shipped, D550–D564, 0083, where the guard test lives, that ecphub has no committee yet) and add its line to `MEMORY.md`. Report to the user what was checked, and ask before pushing.
