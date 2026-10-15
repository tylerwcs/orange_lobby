# Event committee access — design

Date: 15 Oct 2026. Decisions D550–D564. Migration 0083.

## Goal

An Ecopia admin can hand a client's event committee their own admin login for **one event**, so
they can see and manage everything about running it — attendees, agenda, activities, games,
WhatsApp, exports, the scanner, requests and settings — without seeing any other event and
without the few controls that stay with Ecopia.

Success looks like:
- You add a committee member by name and email on the event, send them a link, and they are in.
- They see only the events they are on, and lose access the moment the event is archived or you remove them.
- No path in the app — page, server action or export route — lets them reach another event or an admin-only control, including by forging a request.

## Where this departs from earlier decisions

- D18 / D112 said admin accounts are made by hand in Supabase, never in the app. Committee
  logins are made in the app (D554). Ecopia admin accounts are still made by hand; nothing here
  creates or changes an `org_members` row.
- The verifier spec's rule "limited access is done with event token links, never with roles"
  stays true for narrow jobs (crew, booth, verifier, setup). Committee access is broad — attendee
  personal data, exports, WhatsApp sends — so it is a real login (D550), not a forwardable link.
- `org_members.role` stays unused. The committee is a separate table on purpose (D551).

## Decisions

### Who can do what

**D550 — Committee members have their own login.** Email and password at the normal `/login`,
the same Supabase Auth as Ecopia admins. Not a link: a link can be forwarded, and this access
includes personal data.

**D551 — A separate table, and `requireAdmin()` stays strict.** `requireAdmin()` keeps meaning
"Ecopia admin" (an `org_members` row). Committee members never pass it. A new
`requireEventAccess(eventId)` passes an Ecopia admin of the event's org, or an active committee
member of that event. Every event-scoped page, action and route moves to it; admin-only ones keep
`requireAdmin()`. A call site missed in the move therefore **fails closed** — a committee member
gets a 404, never extra access. (A `role` on `org_members` was rejected: every missed call site
would fail open, into every event of the org.)

**D552 — What a committee member can do.** Everything inside their event, as an Ecopia admin
can, except the admin-only list in D553. On the Events list they see only their events; with
exactly one, `/admin` takes them straight into it.

**D553 — Admin-only, hidden from committee and refused on the server:**
- Create event (the New event button and `createEventAction`).
- Delete event and purge (the Danger zone tab, `deleteEventAction`, `purgeEventAction`).
- Setting the status to **Archived**. Draft ↔ Live is allowed: they can publish. Archiving would
  end their own access (D556) and only an admin could undo it.
- Features (add-ons) — the Features tab and every `features/catalogue/admin` action.
- Address / domains — the Address tab and every `features/domains/admin` action.
- Committee — the Committee tab and every committee action (D558).

**D554 — An admin's email cannot be added as committee.** Adding an email that belongs to an
`org_members` user is refused with "That's an Ecopia admin login already." Nobody is both.

**D555 — One login, several events.** A committee member is one Supabase user. Being added to a
second event with the same email adds the event to that login (D559); it does not make a second
account.

**D556 — Access ends when the event is archived.** `requireEventAccess` refuses a committee
member on an archived event, and the event drops out of their list. Un-archiving restores
access. Draft and Live events are both open to them (they may be setting it up).

**D557 — "Done by" keeps working.** Actor columns (`checkins.scanned_by`,
`activity_change_requests.decided_by`, `activity_submissions.revoked_by` / `edited_by`,
`verifier_links.created_by`, `challenge_scores.created_by`) already point at `auth.users`, and
`scannerNames()` resolves any user id to an email, so committee actions show their email with no
change.

### Data

**D558 — `event_committee`, one row per person per event (migration 0083):**

| column | |
|---|---|
| `id` | uuid pk |
| `event_id` | → events, on delete cascade |
| `name` | text, required |
| `email` | text, required, stored lower-cased and trimmed |
| `user_id` | → auth.users, null until the link is used |
| `added_by` | → auth.users (the admin) |
| `added_at` | timestamptz default now() |
| `accepted_at` | null until the set-up link is used |
| `removed_at` | null while active; set by Remove, row kept |
| `link_token` | text unique, null when there is no live link |
| `link_kind` | `'setup'` or `'reset'` |
| `link_expires_at` | timestamptz |

- Unique `(event_id, email)` where `removed_at is null`: one active row per person per event.
  Re-adding someone removed makes a new row.
- Index on `user_id` where `removed_at is null`, for `requireEventAccess` and the Events list.
- RLS on with no policies, like every other table: only the service role reads it.
- One live link per row. A new link overwrites `link_token`, which is what cancels the old one.
  Using a link sets `link_token` to null.

### Links and accounts

**D559 — The set-up link.** Adding a member makes a `setup` link,
`<main address>/join/<token>`, valid **7 days** and **single use**, shown to the admin to copy and
send however they like. The app sends nothing. Tokens come from `generateToken()`, like every
other link. `/join` lives on the main address only (the proxy already keeps event domains away
from it).

Opening a live link:
- **No login exists for that email.** The page shows the event name, their name, and their
  email (not editable), and asks for a password (at least 8 characters, typed twice). Submitting
  creates the user with `auth.admin.createUser({ email, password, email_confirm: true })`, sets
  `user_id` and `accepted_at`, clears the link, signs them in, and lands them on the event's
  Overview.
- **A login exists for that email** (they are on another event's committee). The page says
  "You already have an ECP Hub login — sign in to add *Event*" and asks for their current
  password. A correct password links the row (`user_id`, `accepted_at`), clears the link, and
  lands them on the event. A wrong one says so; the link stays usable until it expires.
- **The email belongs to an Ecopia admin** (became one after being added): refused, same copy as
  a dead link. (D554 normally stops this at add time.)

A used, expired, replaced, or removed link shows one message: "This link no longer works. Ask
the Ecopia team for a new one." It never says which.

**D560 — Password reset by link.** There is no forgot-password flow. The Committee list's ⋯
menu has **Password reset link** for an active member: a `reset` link, same 7 days and single
use, whose page asks for a new password twice and sets it with `auth.admin.updateUserById`, then
signs them in. Their login is shared across events, so the new password applies to all of them.
Available only for rows with a `user_id`.

**D561 — Rate limits and sign-in.** `/join` page loads and submits are rate-limited per IP with
`allow()`, like the organiser setup link. Signing in uses the existing session client
(`signInWithPassword`) so the cookies are set exactly as `/login` sets them.

**D562 — No access, clear message.** A signed-in user who is neither an Ecopia admin nor an
active committee member of any non-archived event is sent to
`/login?error=no-access`: "You don't have access to any events right now." This also fixes the
existing `not-a-member` code, which `LOGIN_ERRORS` does not know and which shows the generic
copy today.

### Admin UI

**D563 — Settings → Committee tab (admin only).** In the approved admin style:
- **Add member** in the header opens a modal (Name, Email). Saving shows the set-up link in a
  dialog with Copy.
- A table-style list: **Name**, **Email**, **Status** — "Invited · link expires 22 Oct",
  "Link expired", or "Active since 16 Oct" (plus "· reset link until 22 Oct" while one is live).
- ⋯ menu per row: **Copy set-up link** (while live), **New set-up link** (invited rows),
  **Password reset link** (active rows), **Remove** (confirm; sets `removed_at` and clears the link).
- Empty state explains what committee access is and what stays with Ecopia.

What a committee member sees: the same sidebar and pages, with no **New event** button, and
Settings without the Features, Address, Committee and Danger zone tabs. The status picker shows
Draft and Live only. Their email shows in the sidebar footer as it does for admins.

### The move

**D564 — `requireEventAccess` and a guard test.**

```ts
type Actor = { userId: string; email: string; kind: "admin" | "committee" };
requireEventAccess(eventId): Promise<{ actor: Actor; ev: Event }>   // 404 when refused
requireAdminEvent(eventId): Promise<{ actor: Actor; ev: Event }>    // Ecopia admin of the event's org only
requireSignedIn(): Promise<{ userId; email; orgId: string | null; eventIds: string[] }>  // the admin layout gate
```

- Memoised per request with `cache()`, like `requireAdmin` and `requireEvent`.
- The decision itself is a pure function, `canAccess(member, ev, orgId)`, unit-tested apart from
  Supabase.
- Every event-scoped call site changes from
  `const { orgId } = await requireAdmin(); const ev = await requireEvent(id, orgId);` to
  `const { ev } = await requireEventAccess(id);` (`actor.userId` where the old code used
  `userId`). This covers the event layout and pages, `app/admin/events/[id]/actions.ts` (≈54
  calls), the feature admin actions (activities, verifiers, polaroid, setup, groups, games), the
  export and file routes, `/admin/requests/[eventId]`, and `authorise()` in `/scan/[eventId]`.
- The admin layout gate becomes `requireSignedIn()`. The Events list and `/admin` home read
  `eventIds` for a committee member and `listEvents(orgId)` for an admin.
- Admin-only event actions (D553) use `requireAdminEvent(eventId)` from the same module:
  `requireAdmin()` plus the event's org match, i.e. exactly today's pair. `createEventAction`
  keeps bare `requireAdmin()`. `setStatusAction` uses `requireEventAccess` and refuses `archived`
  unless `actor.kind === "admin"`.
- `requireEvent` stops being exported for general use; only the access module calls it.
- Admin-only tabs are not rendered at all for a committee member. `AddressTab` checks access
  itself (it will use `requireAdminEvent`), so rendering it for a committee member would 404 the
  whole Settings page. The Settings page decides its tab list from `actor.kind` first, and
  `FeaturesTab` (which loads data but does not check) is skipped the same way.
- **Guard test** (`tests/access-guard.test.ts`) reads the source tree and fails when:
  1. any file other than the access module calls `requireEvent(`, or
  2. a file calls `requireAdmin()` or `requireAdminEvent(` and is not on the test's explicit
     admin-only list.
  So new code has to pick a side on purpose.

## Out of scope

- Ecopia admin accounts made in the app, and any change to `org_members`.
- Per-member permissions (a committee member who can do some things but not others).
- Email or WhatsApp delivery of links — the admin sends them.
- A self-service "forgot password" page.
- Microsoft 365 sign-in (still post-pilot, D18).
- Committee members on more than one org.

## Testing

- **Unit:** `canAccess` (admin of org, admin of another org, active member, removed member,
  member of another event, archived event, draft event); link state (live, used, expired,
  replaced, removed member); `normaliseEmail`; the guard test.
- **Browser, on ecpkom only (never ecphub), with a throwaway committee login:**
  add a member → open the set-up link → set a password → lands on ecpkom; the Events list shows
  only ecpkom; Features/Address/Committee/Danger zone and New event are absent; Archived is not
  offered; a forged `deleteEventAction`/archive post is refused; another event's URL 404s;
  a reset link changes the password; Remove locks them out on the next load; archiving ecpkom
  shows "no access" and un-archiving restores it.
- **Cleanup:** delete the test user and its `event_committee` rows afterwards, and put ecpkom's
  status back.
