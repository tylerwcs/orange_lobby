# Cancellation Needs Approval — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attendees *ask* to cancel; an organiser (admin or committee) approves or declines in Attendees. While waiting, they stay fully registered; checking in withdraws the request.

**Architecture:** Two new attendee columns (`cancel_requested_at`, `cancel_declined_at`, migration `0085`). The existing cancel (`cancelAttendee`, D580–D582) becomes the *approve* step. The portal's cancel action becomes a request action plus a withdraw action. Attendees gets a `?show=requests` view rendered as a server table with Approve/Decline forms; the sidebar's Attendees item gets a waiting-count badge. `recordCheckin(s)` clears a waiting request.

**Tech Stack:** Next.js app router (Server Actions; check `node_modules/next/dist/docs/` for anything unfamiliar, per AGENTS.md), Supabase Postgres (service client), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-15-attendee-self-cancel-design.md` — the **Amendment: approval (D593–D599)** section at the top. Read it and the original D580–D592.

## Global Constraints

- Decision numbers D593–D599; migration `0085`. Cite them in comments.
- **Test only on ecpkom** (`4e64a90c-728c-4a08-af62-8c8046afa0c9`). Never write to ecphub or uobih2.
- **Work on `main`.** Stage only your own files; never `git add -A`; never stage `docs/superpowers/specs/2026-09-27-intro-video-design.md`, `docs/ECP-Hub-Privacy-Policy.pdf`, `docs/image-guide/`. Commit messages end with a `Co-Authored-By:` line naming the model. Do not push.
- **Feature imports** go through `@/features/cancel` (server entry) or `@/features/cancel/client` (client-safe) — lint rule D403; inside the feature, import relatively.
- **Guards that must keep passing:** `tests/access-guard.test.ts` (use `requireEventAccess` for approve/decline; no `requireAdmin*`/`requireEvent` calls) and `tests/attendee-reads-guard.test.ts` (every `.from("attendees").select(` filters `cancelled_at` or carries an `any-status:` marker).
- **Supabase project** `wfmqwwcolfigjylkgrsv`. **Verification:** `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- **Copy, verbatim:**
  - Dialog title `Ask to cancel your registration for <event name>?`; body `Your request goes to the organiser. You stay registered until they approve it.`; buttons `Yes, ask to cancel` / `Keep my place`. The trigger keeps `Cancel my registration` (Me) and `Can't make it? Cancel my registration` (draft).
  - Flash after asking `Request sent. The organiser will confirm.`; after withdrawing `Request withdrawn.`
  - Waiting text `You asked to cancel on <d MMM>. The organiser will confirm.`; button `Withdraw request`.
  - Declined note `The organiser declined your cancellation request.`
  - Second request refusal `You've already asked to cancel.`
  - Admin: toggle `Cancellation requests (<n>)`; columns `Name`, `Email`, `Asked on`; buttons `Approve` / `Decline`; flashes `Cancelled <name>.` / `Declined <name>'s request.`; empty `No cancellation requests.`; subtitle `<n> waiting`.

## Review Focus

1. **A waiting request must not exclude anyone.** Counts, lists, check-in, booking and the portal behave as for any registered person until approval. Pinned by Task 1 (only `cancelled_at` drives exclusion; the request column is never read by the D581 filters) and Task 4's check.
2. **Approve must be the full D582 cancel**, scoped to the event, and only for a row with a waiting request. Pinned by Task 1's `approveCancelRequest` and Task 3's action.
3. **Replays and races:** asking twice, withdrawing twice, approving a withdrawn/checked-in request, declining after approval. Each must be a no-op with a sensible flash. Pinned by the conditional writes in Task 1.
4. **Check-in clears the request** on every check-in path (scanner, crew link, admin bulk). Pinned by Task 1 putting it in `recordCheckin`/`recordCheckins`.
5. **Committee can approve/decline; nobody without event access can.** Pinned by `requireEventAccess` in Task 3.

---

### Task 1: Data, rules and the server writes

**Files:** Create `supabase/migrations/0085_cancel_requests.sql`. Modify `src/lib/types.ts`, `src/features/cancel/lib/rules.ts`, `src/features/cancel/db.ts`, `src/lib/db/attendees.ts`, `src/lib/db/checkins.ts`, `tests/cancel-rules.test.ts`.

**Produces:** `Attendee.cancel_requested_at?: string | null`, `Attendee.cancel_declined_at?: string | null`; `canSelfCancel` refuses a second request; `requestCancel(eventId, attendeeId): Promise<boolean>`, `withdrawCancelRequest(eventId, attendeeId): Promise<boolean>`, `approveCancelRequest(eventId, attendeeId): Promise<boolean>`, `declineCancelRequest(eventId, attendeeId): Promise<boolean>`; `listCancelRequests(eventId): Promise<Attendee[]>`, `countCancelRequests(eventId): Promise<number>`.

- [ ] **Step 1: Migration** `0085_cancel_requests.sql`, then apply with MCP `apply_migration` (name `0085_cancel_requests`):

```sql
-- Cancellation needs an organiser's approval (spec amendment D593-D599).
-- D593: when the attendee asked; null = no waiting request.
alter table public.attendees add column if not exists cancel_requested_at timestamptz;
-- D596: when an organiser last declined; shown to the attendee until they ask again.
alter table public.attendees add column if not exists cancel_declined_at timestamptz;
-- D598: the requests view and the sidebar badge.
create index if not exists attendees_event_cancel_requests_idx on public.attendees (event_id)
  where cancel_requested_at is not null and cancelled_at is null;
```

Check: `select count(*) filter (where cancel_requested_at is not null) from attendees;` → 0.

- [ ] **Step 2: Types** — `Attendee` gains `/** D593 */ cancel_requested_at?: string | null;` and `/** D596 */ cancel_declined_at?: string | null;` (optional, like `cancelled_at`).

- [ ] **Step 3: Failing test** — add to `tests/cancel-rules.test.ts` inside `describe("canSelfCancel (D584)")`:

```ts
  it("refuses a second request while one waits (D595)", () => {
    expect(canSelfCancel(ev, { cancelled_at: null, cancel_requested_at: "2026-10-15T01:00:00Z" }, false, now))
      .toEqual({ ok: false, reason: "You've already asked to cancel." });
  });
```

(`a`'s type in `canSelfCancel` widens to `Pick<Attendee, "cancelled_at" | "cancel_requested_at">`.) Run → FAIL.

- [ ] **Step 4: Rule** — in `canSelfCancel`, right after the `cancelled_at` check: `if (a.cancel_requested_at) return { ok: false, reason: "You've already asked to cancel." };`. Run → PASS.

- [ ] **Step 5: Writes in `src/features/cancel/db.ts`** (all scoped by `event_id`, all conditional so replays change nothing):

```ts
/** D593: ask to cancel. Only for a registered row with no waiting request; clears an old decline. */
export async function requestCancel(eventId: string, attendeeId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await serviceClient().from("attendees")
    .update({ cancel_requested_at: now, cancel_declined_at: null, updated_at: now })
    .eq("id", attendeeId).eq("event_id", eventId).is("cancelled_at", null).is("cancel_requested_at", null).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** D595: the attendee takes it back. */
export async function withdrawCancelRequest(eventId: string, attendeeId: string): Promise<boolean> {
  const { data, error } = await serviceClient().from("attendees")
    .update({ cancel_requested_at: null, updated_at: new Date().toISOString() })
    .eq("id", attendeeId).eq("event_id", eventId).is("cancelled_at", null).not("cancel_requested_at", "is", null).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** D596: an organiser says no. */
export async function declineCancelRequest(eventId: string, attendeeId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await serviceClient().from("attendees")
    .update({ cancel_requested_at: null, cancel_declined_at: now, updated_at: now })
    .eq("id", attendeeId).eq("event_id", eventId).is("cancelled_at", null).not("cancel_requested_at", "is", null).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/**
 * D598: an organiser says yes - the D580-D582 cancel, only for a row whose request is still
 * waiting (a withdrawn or checked-in request approves nothing).
 */
export async function approveCancelRequest(eventId: string, attendeeId: string): Promise<boolean> {
  const { data, error } = await serviceClient().from("attendees").select("id") // any-status: checking a waiting request on a registered row
    .eq("id", attendeeId).eq("event_id", eventId).is("cancelled_at", null).not("cancel_requested_at", "is", null).maybeSingle();
  if (error) throw error;
  if (!data) return false;
  return cancelAttendee(eventId, attendeeId);
}
```

And in `cancelAttendee`'s mark update add `cancel_requested_at: null` to the patch (approving clears the request with the mark).

- [ ] **Step 6: Reads in `src/lib/db/attendees.ts`**

```ts
/** D598: waiting requests, oldest first. Registered rows only. */
export async function listCancelRequests(eventId: string): Promise<Attendee[]> {
  return selectAll<Attendee>((from, to) => serviceClient().from("attendees").select("*").eq("event_id", eventId)
    .is("cancelled_at", null).not("cancel_requested_at", "is", null)
    .order("cancel_requested_at").order("id").range(from, to));
}

export async function countCancelRequests(eventId: string): Promise<number> {
  const { count, error } = await serviceClient().from("attendees").select("id", { count: "exact", head: true })
    .eq("event_id", eventId).is("cancelled_at", null).not("cancel_requested_at", "is", null);
  if (error) throw error;
  return count ?? 0;
}
```

- [ ] **Step 7: Check-in withdraws (D597)** — in `src/lib/db/checkins.ts`, after a successful insert in `recordCheckin` and in `recordCheckins`, clear waiting requests for those attendee ids:

```ts
/** D597: turning up withdraws a waiting cancellation request. */
async function clearCancelRequests(eventId: string, attendeeIds: string[]): Promise<void> {
  if (attendeeIds.length === 0) return;
  const { error } = await serviceClient().from("attendees").update({ cancel_requested_at: null })
    .eq("event_id", eventId).in("id", attendeeIds).not("cancel_requested_at", "is", null);
  if (error) throw error;
}
```

Call it with the event id and the attendee id(s) the function just recorded (read both functions; only call it when the insert succeeded — a duplicate check-in can still clear it, that's fine). Keep `recordCheckins`' chunking if it chunks.

- [ ] **Step 8:** guard tests, `npx tsc --noEmit`, `npm test`. **Commit** `feat(cancel): cancellation requests - data, rules and writes (D593-D599)`.

---

### Task 2: The attendee asks and withdraws

**Files:** Modify `src/features/cancel/portal/actions.ts`, `src/features/cancel/portal/CancelSection.tsx`, `src/app/e/[slug]/a/[token]/me/page.tsx`, `src/app/e/[slug]/a/[token]/layout.tsx`. Create `src/features/cancel/portal/CancelRequestNote.tsx`.

- [ ] **Step 1: Actions** — replace `selfCancelAction` with `requestCancelAction(slug, token)` (same checks; calls `requestCancel`; redirect `flashPath(\`${base}/me\`, "Request sent. The organiser will confirm.")` for a live event, `flashPath(base, …)` for a draft) and add:

```ts
/** D595: take a waiting request back. */
export async function withdrawCancelRequestAction(slug: string, token: string) {
  const base = `/e/${slug}/a/${token}`;
  if (!allow(`cancel:${token}`, 5, 60_000)) redirect(flashPath(`${base}/me`, "Too many attempts. Try again in a minute.", "error"));
  const { event, attendee } = await loadPortalAttendee(slug, token);
  await withdrawCancelRequest(event.id, attendee.id);
  revalidatePath(base, "layout");
  redirect(flashPath(event.status === "draft" ? base : `${base}/me`, "Request withdrawn."));
}
```

Update every import of `selfCancelAction` (Me page, layout, index exports).

- [ ] **Step 2: Dialog copy** — in `CancelSection.tsx`, the dialog title becomes `Ask to cancel your registration for {eventName}?`, the body `Your request goes to the organiser. You stay registered until they approve it.`, the confirm `Yes, ask to cancel`. The trigger labels stay.

- [ ] **Step 3: `CancelRequestNote.tsx`** (server component, exported through `index.ts`):

```tsx
import { SubmitButton } from "@/components/admin/SubmitButton";
import { klDay } from "../lib/rules";

/** D595/D596: the waiting request (with Withdraw) or the decline note. Renders nothing otherwise. */
export function CancelRequestNote({ requestedAt, declinedAt, withdraw, variant }: {
  requestedAt: string | null | undefined;
  declinedAt: string | null | undefined;
  withdraw: () => Promise<void>;
  variant: "me" | "draft";
}) {
  if (requestedAt) {
    return (
      <div className={variant === "me" ? "rounded-xl border bg-card p-4 text-sm" : "text-sm"}>
        <p className="text-muted-foreground">You asked to cancel on {klDay(requestedAt)}. The organiser will confirm.</p>
        <form action={withdraw} className="mt-3"><SubmitButton variant="outline">Withdraw request</SubmitButton></form>
      </div>
    );
  }
  if (declinedAt) return <p className="text-sm text-muted-foreground">The organiser declined your cancellation request.</p>;
  return null;
}
```

(If `SubmitButton` from `components/admin` reads oddly on the portal, use the portal's own submit button pattern from `ConsentGate.tsx` — read it.)

- [ ] **Step 4: Me page** — at the bottom: render `<CancelRequestNote variant="me" … withdraw={withdrawCancelRequestAction.bind(null, slug, token)} />` when `event.self_cancel || attendee.cancel_requested_at || attendee.cancel_declined_at`; then render the existing `CancelSection` only when there is no waiting request and `canSelfCancel(...).ok` (unchanged rule, now also refusing a waiting request).

- [ ] **Step 5: Draft page (layout `draftExtra`)** — same logic for the draft: the note (with Withdraw) when a request waits, else the decline note above the cancel link when allowed. Only query `hasAnyCheckin` when the cancel link might show.

- [ ] **Step 6:** `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`. **Commit** `feat(cancel): attendees ask to cancel and can withdraw (D593, D595, D596)`.

---

### Task 3: Organisers approve or decline

**Files:** Modify `src/features/cancel/admin/actions.ts`, `src/app/admin/events/[id]/attendees/page.tsx`, `src/app/admin/events/[id]/layout.tsx`, `src/components/admin/nav.ts`, `src/components/admin/AppSidebar.tsx`, `tests/nav.test.ts`. Create `src/features/cancel/admin/CancelRequestsTable.tsx`.

- [ ] **Step 1: Actions** (`src/features/cancel/admin/actions.ts`):

```ts
const requestsPath = (eventId: string) => `/admin/events/${eventId}/attendees?show=requests`;

/** D598: approve - the D580-D582 cancel. Admins and committee alike. */
export async function approveCancelRequestAction(eventId: string, attendeeId: string) {
  const { ev } = await requireEventAccess(eventId);
  const a = await getAttendee(attendeeId);
  if (!a || a.event_id !== ev.id) redirect(flashPath(requestsPath(ev.id), "That attendee is no longer on this event.", "error"));
  const ok = await approveCancelRequest(ev.id, a.id);
  revalidatePath(`/admin/events/${ev.id}`, "layout");
  redirect(flashPath(requestsPath(ev.id), ok ? `Cancelled ${a.name}.` : `${a.name} no longer has a waiting request.`, ok ? "ok" : "error"));
}

/** D596/D598: decline. */
export async function declineCancelRequestAction(eventId: string, attendeeId: string) {
  // same shape; declineCancelRequest; flash `Declined ${a.name}'s request.` or the "no longer" error
}
```

Write `declineCancelRequestAction` out in full in the same shape. `revalidatePath(..., "layout")` so the sidebar badge updates.

- [ ] **Step 2: `CancelRequestsTable.tsx`** (server component, through `index.ts`): a `Table` (as `VerificationTab.tsx` uses) with columns `Name`, `Email`, `Asked on` (`klDayTime(a.cancel_requested_at)`), and an actions cell with two plain forms: `<form action={approveCancelRequestAction.bind(null, eventId, a.id)}><SubmitButton>Approve</SubmitButton></form>` and the same with `variant="outline"` for `Decline`. Empty state `No cancellation requests.`

- [ ] **Step 3: Attendees page** — read `sp.show === "requests"`. Load `countCancelRequests(ev.id)` with the other counts. Header: add `Cancellation requests (${n})` (when `n > 0`, or when on that view) beside `Cancelled (n)`; on the requests view show `Back to registered`. On the requests view render the page header with subtitle `${n} waiting` and `<CancelRequestsTable eventId={ev.id} rows={await listCancelRequests(ev.id)} />` instead of the search/table block.

- [ ] **Step 4: Sidebar badge** — `groupsFor`'s `badges` type gains `attendees?: number`; the Attendees item gets `...(badges.attendees ? { badge: badges.attendees } : {})`. `AppSidebar`'s `badges` prop type likewise. The event layout passes `badges={{ setup: waiting, attendees: await countCancelRequests(ev.id) }}` (for admins and committee). Add to `tests/nav.test.ts`:

```ts
  it("badges Attendees with the waiting cancellation requests (D598)", () => {
    const onsite = groupsFor({ id: "e1", check_in_enabled: true }, [], { attendees: 3 }).find((g) => g.title === "Onsite");
    expect(onsite?.items.find((i) => i.label === "Attendees")).toMatchObject({ badge: 3 });
  });
```

- [ ] **Step 5:** guard tests, `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`. **Commit** `feat(cancel): organisers approve or decline cancellation requests (D598)`.

---

### Task 4: End-to-end on ecpkom (controller), then final review

- [ ] Record ecpkom's starting values; turn `self_cancel` on (SQL stand-in for the Settings save); insert a throwaway consented attendee.
- [ ] Playwright, their link: Me → Cancel → dialog copy → `Yes, ask to cancel` → flash, waiting text with `Withdraw request`; counts unchanged (still registered); Attendees badge shows 1; `?show=requests` lists them.
- [ ] Withdraw → back to the Cancel card; ask again; approve via the requests view form (pane fetch + native submit if needed) → their link shows the cancelled card, Cancelled view lists them.
- [ ] Restore (SQL stand-in), ask again, decline → Me shows the decline note above the Cancel card.
- [ ] Ask again, then insert a check-in → the request is gone, no Cancel card (checked in).
- [ ] Draft: status draft, restore/clear, ask from the draft link → waiting text + Withdraw on the draft page.
- [ ] Clean up: delete the attendee, restore ecpkom's values.
