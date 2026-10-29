# Portal Popups (pass 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An event's organiser can set up popups that show each time an attendee opens the portal until they have booked a given booking activity; first use is MYBESTME's Health Screening Booking.

**Architecture:** New feature folder `src/features/popups/` (table `portal_popups`, db layer, a pure `pickPopup` rule, a memoised server loader, the portal dialog, the admin page + actions). The personal portal layout loads the one popup that applies and mounts a client dialog that opens once per page load; the home page holds back the add-to-home-screen popup on a load where a portal popup applies.

**Tech Stack:** Next.js App Router (read `node_modules/next/dist/docs/` before using an unfamiliar API), Supabase (service-role client), TypeScript, vitest, shadcn `Dialog`, existing `RichTextEditor` / `sanitizeHtml`.

**Spec:** `docs/superpowers/specs/2026-10-28-portal-popups-design.md` — pass 1 only.

## Global Constraints

- Decisions D751–D758; migration `0113_portal_popups.sql`. Cite the D numbers in comments as the codebase does.
- Feature-folder rule (D403): outside code imports only `@/features/popups` (server) or `@/features/popups/client` (browser-safe). `src/lib` never imports a feature.
- Organiser text is never translated. Only the close button follows EN | BM: key `popup.notNow`, en `"Not now"`, ms `"Bukan sekarang"` (same words as `install.notNow`).
- Table: RLS on, no policies; only the service role reads/writes (as every table here).
- Never test on the `ecphub` event. Test on `ecpkom`. MYBESTME (`zp-my-best-me`) gets its popup created **off**.
- Admin page follows the approved admin style (AdminHeader + one Card list + ⋯ RowActions + Modal form), modelled on `src/app/admin/events/[id]/announcements/page.tsx`.
- No extra query on portal pages of an event with no popup switched on beyond the single popups read.

## Review Focus

1. A booking session earlier **today** whose start time has passed must not count as bookable; one later today must (string compare of `HH:MM` in KL time) — test in Task 2.
2. Attendee whose category can't see the activity, or the activity closed/hidden (absent from `portalActivities`) → no popup — test in Task 2.
3. Two popups, the first not applicable (already booked) → the second shows; a switched-off popup never shows — test in Task 2.
4. Attendee already on that activity's page (`…/activities/<id>`, with or without trailing slash) → dialog does not open — test of `onTargetPage` in Task 2.
5. Every remaining session full (incl. capacity lowered below bookings, `seatsFor` clamps) → no popup — test in Task 2.

---

### Task 1: Table, types and db layer

**Files:**
- Create: `supabase/migrations/0113_portal_popups.sql`
- Create: `src/features/popups/types.ts`, `src/features/popups/db.ts`

**Interfaces:**
- Produces (types.ts):
  ```ts
  export type PopupTrigger = "not_done";
  export type PortalPopup = { id: string; org_id: string; event_id: string; heading: string; message_html: string; button_label: string; trigger_kind: PopupTrigger; activity_id: string; is_on: boolean; sort_order: number; created_at: string };
  /** What the portal needs to draw one; message_html already sanitised. */
  export type PopupShown = Pick<PortalPopup, "id" | "heading" | "message_html" | "button_label" | "activity_id">;
  export type PopupInput = Pick<PortalPopup, "heading" | "message_html" | "button_label" | "activity_id">;
  ```
- Produces (db.ts, `import "server-only"`, `serviceClient()`):
  `listPopups(eventId): Promise<PortalPopup[]>` (sort_order asc, created_at asc) ·
  `createPopup(event: Pick<Event,"id"|"org_id">, input: PopupInput): Promise<void>` (goes **last**: max sort_order + 10, trigger_kind `'not_done'`) ·
  `updatePopup(id, eventId, input: PopupInput)` · `setPopupOn(id, eventId, on: boolean)` · `deletePopup(id, eventId)` · `setPopupOrder(eventId, ids: string[])` (steps of 10, scoped by event — copy `setAnnouncementOrder`) ·
  `sessionsForActivities(activityIds: string[]): Promise<ActivitySession[]>` (trim `starts_at`/`ends_at` to `HH:MM` like `listSessions`) ·
  `bookingCountsForActivities(activityIds: string[]): Promise<Record<string, number>>` (bookings per session_id, from `activity_bookings` filtered by `activity_id in`).
  Every write is scoped `.eq("event_id", eventId)`.

- [ ] **Step 1: Write the migration**

```sql
create table if not exists public.portal_popups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  heading text not null,
  message_html text not null,
  button_label text not null,
  trigger_kind text not null default 'not_done' check (trigger_kind in ('not_done')),
  activity_id uuid references public.activities(id) on delete cascade,
  is_on boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  check (trigger_kind <> 'not_done' or activity_id is not null)
);
create index if not exists portal_popups_event on public.portal_popups (event_id, sort_order);
create index if not exists portal_popups_activity on public.portal_popups (activity_id);
alter table public.portal_popups enable row level security;
```
Check the orgs table name against `0001_init.sql` (announcements' `org_id` FK) before applying; use whatever announcements references.

- [ ] **Step 2: Apply it** to project `wfmqwwcolfigjylkgrsv` with the Supabase `apply_migration` tool, name `0113_portal_popups`. Verify: `select count(*) from portal_popups` returns 0.
- [ ] **Step 3: Write `types.ts` and `db.ts`** per the Interfaces block.
- [ ] **Step 4: Typecheck** — `npx tsc --noEmit` → no errors.
- [ ] **Step 5: Commit** — `feat(popups): portal_popups table and db layer (D757)`.

### Task 2: The pure rule and form reader

**Files:**
- Create: `src/features/popups/rules.ts`, `src/features/popups/client.ts` (re-exports `./types`, `./rules`, and later `./PortalPopup`), `src/features/popups/index.ts` (re-exports `./client`, `./db`, later loader/admin)
- Test: `tests/popups/rules.test.ts` (import from `@/features/popups/client`)

**Interfaces:**
- Consumes: `seatsFor`, `eligible` from `@/features/activities/client`; types from Task 1.
- Produces:
  ```ts
  export type PickInput = {
    popups: PortalPopup[];            // the event's, in sort order
    activities: Activity[];           // portalActivities(event) - already open & shown only
    category: string | null;
    held: ReadonlySet<string>;        // activity ids the attendee holds a booking in
    arrived: ReadonlySet<string>;     // activity ids they checked in at a door of (walk-ins)
    sessions: ActivitySession[];      // of the popups' activities
    counts: Record<string, number>;   // bookings per session id
    now: { date: string; time: string }; // nowInKL()
  };
  export function pickPopup(input: PickInput): PortalPopup | null;
  export function onTargetPage(pathname: string, basePath: string, activityId: string): boolean;
  export type PopupFormResult = { ok: true; input: Omit<PopupInput, "message_html"> & { message: string } } | { ok: false; error: string };
  export function readPopupForm(fd: FormData, bookingActivityIds: readonly string[]): PopupFormResult;
  ```
  `pickPopup` returns the first popup (in given order) where: `is_on`; `trigger_kind === "not_done"`; its activity is in `activities`, has `kind === "booking"`, and `eligible(activity, category)`; activity id not in `held` nor `arrived`; and at least one of its sessions has not started (`s.day > now.date || (s.day === now.date && s.starts_at > now.time)`) and is not `seatsFor(s, counts[s.id] ?? 0).full`.
  `readPopupForm` reads `heading`, `message` (raw editor HTML), `button_label`, `activity_id`; trims; errors: `"A popup needs a heading, a message and a button label."` (empty message = `isRichTextEmpty`), `"Pick the activity it reminds them about."` (missing or not in `bookingActivityIds`).

- [ ] **Step 1: Write the failing tests** — fixtures: one booking activity `a1` (categories null), sessions on `2026-11-06` at `10:00` capacity 1; `now = { date: "2026-11-01", time: "09:00" }`.
  - `shows the first on popup when nothing is booked` → returns popup p1.
  - `nothing when the activity is held` (`held = {a1}`) → null; `nothing after a walk-in` (`arrived = {a1}`) → null.
  - `nothing when switched off` → null; `falls through to the second popup` (p1 for held a1, p2 for a2 unheld) → p2.
  - `nothing when the activity is not shown` (activities = []) → null; `nothing for another category` (a1.categories ["VIP"], category "Staff") → null.
  - `nothing when every session is full` (counts `{s1: 1}`) and `capacity lowered below bookings` (capacity 1, counts 3) → null.
  - `a session earlier today has passed` (now `2026-11-06 10:30`, only s1 at 10:00) → null; `a session later today counts` (now `2026-11-06 09:59`) → p1.
  - `nothing for a submission activity` (kind "submission") → null (pass 2).
  - `onTargetPage`: `/e/x/a/t/activities/a1` and `/e/x/a/t/activities/a1/` → true; `/e/x/a/t` and `/e/x/a/t/activities` → false.
  - `readPopupForm`: valid → ok with trimmed fields; blank heading → the heading error; `<p></p>` message → the same error; activity not in list → the activity error.
- [ ] **Step 2: Run** `npx vitest run tests/popups` → FAIL (module missing).
- [ ] **Step 3: Implement** `rules.ts`, `client.ts`, `index.ts`.
- [ ] **Step 4: Run** `npx vitest run tests/popups` → PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** — `feat(popups): which popup an attendee sees (D752, D754)`.

### Task 3: Portal — loader, dialog, layout, home-screen hand-off

**Files:**
- Create: `src/features/popups/portal.ts` (server loader), `src/features/popups/PortalPopup.tsx` (client)
- Modify: `src/features/popups/index.ts`, `client.ts` (exports)
- Modify: `src/app/e/[slug]/(portal)/a/[token]/layout.tsx` (load + mount)
- Modify: `src/app/e/[slug]/(portal)/a/[token]/page.tsx:115` (pass `hold`)
- Modify: `src/components/portal/AddToHomeScreen.tsx` (new `hold` prop)
- Modify: `src/features/language/en.ts`, `ms.ts` (`popup: { notNow }`)

**Interfaces:**
- Consumes: Task 1 db, Task 2 `pickPopup`/`onTargetPage`; `portalActivities`, `portalBookings` (`@/lib/portal`); `bookingArrivalsFor` (`@/lib/db/checkins`); `nowInKL` (`@/lib/time`); `sanitizeHtml` + `toRichHtml`.
- Produces:
  - `export const portalPopupFor = cache(async (eventId: string, attendeeId: string, category: string | null): Promise<PopupShown | null>)` — primitive args so React `cache` dedupes the layout's and home page's calls. Order of reads: `listPopups` → return null if none `is_on`; then `portalActivities`, `portalBookings`, `bookingArrivalsFor` in parallel; then `sessionsForActivities` + `bookingCountsForActivities` for the on popups' activity ids that are still unheld; then `pickPopup`. Return `message_html` as `sanitizeHtml(toRichHtml(...))`.
  - `export function PortalPopup({ popup, basePath }: { popup: PopupShown | null; basePath: string })`.
  - `AddToHomeScreen({ appName, hold = false })` — when `hold`, neither the 1.5 s timer nor `beforeinstallprompt` opens it by itself (it still stores the prompt and opens on `OPEN_EVENT`), and nothing is written to `localStorage`.

- [ ] **Step 1: Dictionary** — add `popup: { notNow: "Not now" }` to `en.ts` and `popup: { notNow: "Bukan sekarang" }` to `ms.ts`; `npx vitest run tests/language.test.ts` → PASS.
- [ ] **Step 2: Loader** `portal.ts` per Interfaces.
- [ ] **Step 3: `PortalPopup`** — same look as `AddToHomeScreen` (`Dialog`, `DialogContent showCloseButton={false}`, centred `DialogTitle` heading, message in `div.rich-text.prose.prose-sm` via `dangerouslySetInnerHTML`, primary full-width `Button` with `button_label`, ghost `Button` with `useT().popup.notNow`). Opens 1500 ms after mount/prop change when `popup` is non-null, not already shown this load (a `useRef<Set<string>>` of shown ids), and `!onTargetPage(usePathname(), basePath, popup.activity_id)`. Closes when `popup` becomes null. Button: close, then `router.push(`${basePath}/activities/${activity_id}`)`. A comment cites D751/D753.
- [ ] **Step 4: Layout** — in the existing `Promise.all` with `loadActivityNav`, add `event.status === "draft" ? null : portalPopupFor(event.id, attendee.id, attendee.category)`; render `<PortalPopup popup={popup} basePath={`/e/${slug}/a/${token}`} />` as a sibling after `PortalChrome` (not inside it — its draft branch drops children).
- [ ] **Step 5: Home page** — `hold={event.status !== "draft" && !!(await portalPopupFor(event.id, attendee.id, attendee.category))}` on `AddToHomeScreen` (memoised: no extra read). Implement `hold` in `AddToHomeScreen`; extend its doc comment with D755.
- [ ] **Step 6: Verify** — `npx tsc --noEmit`, `npm run lint`, `npm test` → all pass.
- [ ] **Step 7: Commit** — `feat(popups): portal popup on every open until booked (D751, D753, D755)`.

### Task 4: Admin Popups page

**Files:**
- Create: `src/features/popups/admin/actions.ts` (`"use server"`), `src/features/popups/admin/PopupsPage.tsx` (server component)
- Create: `src/app/admin/events/[id]/popups/page.tsx` (thin shell: `export const metadata = { title: "Popups" }`, renders `PopupsPage`)
- Modify: `src/features/popups/index.ts` (export page + actions)
- Modify: `src/components/admin/nav.ts:45` — add `{ href: `${b}/popups`, label: "Popups", icon: "bell" }` right after Announcements.

**Interfaces:**
- Consumes: `requireEventAccess` (`@/lib/access`; admins + committee), Task 1 db, Task 2 `readPopupForm`, `listActivities` from `@/features/activities`, `sanitizeHtml`/`toRichHtml`, `flashPath`, `isValidOrder` (as announcements use them).
- Produces (actions, all `requireEventAccess(eventId)` first, `revalidatePath` the admin page **and** `revalidatePath(`/e/${ev.slug}`, "layout")` so portals refresh):
  `addPopupAction(eventId, fd)` · `updatePopupAction(eventId, popupId, fd)` · `setPopupOnAction(eventId, popupId, on: boolean)` (takes the wanted state, like `toggleOpenAction`) · `deletePopupAction(eventId, popupId)` · `reorderPopupsAction(eventId, ids)`.
  Add/update store `message_html = sanitizeHtml(toRichHtml(message))`; flash `“<heading>” saved.` / errors from `readPopupForm` via `flashPath(..., "error")`.

- [ ] **Step 1: Actions** per Interfaces.
- [ ] **Step 2: Page** — `AdminHeader` title "Popups", subtitle "They pop up when attendees open their portal, until they've done what it asks. Attendees see the first one that applies.", actions: `Modal` "New popup" (icon plus, variant default). Form: `Field` Heading (placeholder "Book your health screening"), `RichTextEditor name="message" label="Message"` (no uploadImage, `minHeight={120}`), `Field` Button label (placeholder "Book now"), native `<select name="activity_id">` labelled "Show until they've booked" listing the event's **booking** activities (all, open or closed), `SubmitButton` "Save" / "Create popup". If the event has no booking activity, the Modal shows "Add a booking activity first." instead of the form. List: `Card` + `SortableList` rows: heading (bold), detail line `Until they've booked ${activity.name}`, `OpenSwitch open={p.is_on} action={setPopupOnAction.bind(null, ev.id, p.id, !p.is_on)} name={p.heading} verb="Show" states={["On","Off"]}`, `RowActions` (Edit modal with the form, Delete with message "Attendees stop seeing it straight away."). Empty state title "No popups yet", description "A popup reminds attendees to do something each time they open their portal."
- [ ] **Step 3: Verify** — `npx tsc --noEmit`, `npm run lint`, `npm test` → pass.
- [ ] **Step 4: Commit** — `feat(popups): admin Popups page (D756)`.

### Task 5: Check it end to end on `ecpkom`

- [ ] **Step 1:** Start the dev server via `preview_start` (`.claude/launch.json`).
- [ ] **Step 2:** Using SQL on `ecpkom` only: pick a test attendee with no booking in a booking activity that has a future session with room (create a test booking activity + session if none, named with a `ZZ` prefix), and insert a `portal_popups` row (admin page needs the user's sign-in, so the admin UI is checked by build/lint only — say so).
- [ ] **Step 3:** Open that attendee's `/e/ecpkom/a/<token>` → popup appears after ~1.5 s, no add-to-home-screen popup; switch tabs → no repeat; reload → shows; tap the button → lands on the activity page with no popup; switch language to BM → "Bukan sekarang". Book a slot → reload home → no popup. Screenshot for the user.
- [ ] **Step 4:** Remove the test rows (popup, any ZZ activity/booking) from `ecpkom`.
- [ ] **Step 5:** `npm run build` → succeeds.

### Task 6: MYBESTME popup, switched off

- [ ] **Step 1:** Insert one `portal_popups` row for `zp-my-best-me` with `is_on = false`, `activity_id = '7968ddec-def9-4dea-8cbf-e87ed691ae51'`, drafted bilingual text:
  - heading: `Book your health screening · Tempah saringan kesihatan anda`
  - message_html: `<p>You haven't booked your health screening slot yet. Slots are limited, so pick yours now.</p><p>Anda belum menempah slot saringan kesihatan. Slot adalah terhad, jadi pilih slot anda sekarang.</p>`
  - button_label: `Book now · Tempah sekarang`
- [ ] **Step 2:** Verify with a read-only select; do **not** turn it on. Pushing to `main` (deploy) waits for the user's go-ahead.
