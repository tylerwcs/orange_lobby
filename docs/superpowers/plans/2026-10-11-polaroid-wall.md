# Polaroid Wall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fourth activity kind, `polaroid`.
- People snap or pick a photo on an instant-camera screen. It ejects as an uncropped polaroid print, and they add a handwritten message and stickers.
- Posts go live at once on a dedicated LED wall. The wall shows alternating vertical columns that loop forever, and spotlights each new arrival.
- Admin can take any post down.

**Architecture:**
- **Feature module.** `src/features/polaroid/` is a new feature with a `client.ts` barrel and an `index.ts` barrel (D403):
  - pure rules in `lib/`
  - service-role queries in `db/`
  - the posting service `post.ts`
  - the wall's server state `wall-state.ts`
  - the components: card, composer, wall and admin panels
- **Kind wiring.** The activities feature gets the `polaroid` kind wiring in `src/features/activities/kinds/polaroid/`, and imports the polaroid feature only through its barrels. The polaroid feature never imports the activities feature, or `@/lib/portal` (which imports activities), so there is no import cycle.
- **Storage.** A polaroid is stored as parts:
  - the photo, in the public `polaroids` bucket under an unguessable path
  - the message
  - sticker placements, as fractions of the card's width

  One `PolaroidCard` draws it everywhere.
- **Wall updates.** The wall polls a versioned JSON endpoint every 2 s through `usePoll`. Before that, `usePoll` and the other display plumbing are lifted from the games feature into `src/lib`.

**Tech Stack:**
- Next.js 16 App Router, server actions and one route handler. Read `node_modules/next/dist/docs/` before using any Next API not already used in this repo. `cookies()` and `headers()` are async: `await cookies()`.
- React 19, TypeScript, Tailwind v4, shadcn `base-nova` (Base UI), `motion` 13 (`import { motion, AnimatePresence } from "motion/react"`), zod 4.
- Supabase:
  - the service-role client, RLS on with no policies
  - Storage: signed upload URLs (supabase-js ^2.115) and a public bucket
  - the Supabase MCP `apply_migration`
- `obscenity` (new dependency, MIT) for the English profanity check.
- `next/font/google` for the Caveat handwriting.
- Vitest: node environment, `tests/**/*.test.ts`, no DOM.

**Spec:** `docs/superpowers/specs/2026-10-11-polaroid-wall-design.md` (D471–D485). Read it first; this plan argues from it.

## Global Constraints

- **Kind name:** `polaroid`. KIND_META: label `"Polaroid wall"`, icon lucide `Camera`. It is unlocked by the `engagement` add-on.
- **Message (D479):**
  - At most **80 characters**, counted by code points (`[...s].length`).
  - Whitespace collapses to single spaces. An empty message is allowed.
  - Rejection copy, verbatim: `"Let's keep it friendly — please change the wording."`
- **Stickers (D476):**
  - At most **8** per polaroid.
  - Coordinates are fractions of the card width:
    - `x` is 0–1
    - `y` is 0 to the card's height ÷ width
    - `scale` is 0.08–0.6
    - `rot` is −180 to 180 degrees
- **Photos (D477):**
  - Re-encoded on the phone to JPEG, **1600 px long edge**, quality 0.85, at most 4 MB.
  - Never cropped.
  - The photo box's height ÷ width is clamped to **9/16 … 16/9**.
- **Card geometry (D483), as fractions of the card width:**
  - border 0.055 on the top and sides
  - message strip 0.27
  - washi tape on top
  - tilt between −3 and 3 degrees, set by the server
- **Rate limits (D480):**
  - 30 s between posts per device (`client_key`), and per attendee on portal posts.
  - Walk-ins also: 10 per hour per device and 30 per hour per IP hash (walk-in posts only).
  - Wait copy: `` `You can post again in ${s} s.` ``
- **Paths:**
  - photos: `<org>/<event>/<activity>/<uuid>.jpg` in bucket `polaroids`
  - event stickers and wall backgrounds: in `event-media`, kinds `polaroid-sticker` and `polaroid-background`
- **Routes:**
  - LED: `/wall/[token]`
  - state: `/api/wall/[token]/state`
  - walk-in: `/e/[slug]/polaroid/[publicToken]`, and `/polaroid/<token>` on an event's own domain
- **Wall (D484):**
  - Auto columns: `clamp(round(width / (height × 0.33)), 3, 10)`. The admin can override with 3–10.
  - Even column indexes (0, 2, …) scroll up and odd ones scroll down.
  - Base speeds at 1080 px height: slow 30, medium 50, fast 80 px/s.
  - Spotlight: 6 s, or 3 s while more than 5 wait. Beyond 15 queued, the rest skip it.
  - Poll every 2 s.
- **Activity type:** the new `Activity` fields are **optional** (`wall_token?`, `public_token?`, `polaroid?`), so the existing test fixtures keep compiling.
- **Features are imported only through their entry:** `@/features/<name>` on the server, `@/features/<name>/client` in the browser. Inside a feature, imports are relative. `src/lib` never imports a feature. Tests in `tests/polaroid/` may import internals directly.
- **Never test on the event with slug `ecphub`:** it is a real event. Use `ecpkom` (id `4e64a90c-728c-4a08-af62-8c8046afa0c9`). Never run Purge personal data on `ecpkom`.
- **Supabase project:** `wfmqwwcolfigjylkgrsv`. Load the MCP tools with ToolSearch: `select:mcp__0687aa52-4553-40db-b867-72024a86f547__apply_migration,mcp__0687aa52-4553-40db-b867-72024a86f547__execute_sql,mcp__0687aa52-4553-40db-b867-72024a86f547__get_advisors`.
- **Git:**
  - Work on `main`.
  - Run `git pull --rebase --autostash` before each commit. Never push.
  - Never stage `docs/superpowers/specs/2026-09-27-intro-video-design.md` or `docs/image-guide/`.
  - Every commit message ends with this trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **Checks before every commit:**
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npm test`

  All must pass. `npm run build` also runs in Tasks 12 and 13.
- **Copy:** use sentence case. Use no exclamation marks in admin copy. The attendee screens may use exactly these: `"It's on the wall!"`, `"TAP TO SNAP"`, `"Share the moment!"` (the default prompt).

## Review Focus

These five failure modes are implied by the spec but not covered by any obvious test. Each one has a test in the task that owns the code.

1. **A wall left running all day.**
   - Column offsets grow without limit.
   - `rebase` must keep them bounded without moving anything on screen.
   - Tested in Task 7.
2. **A polaroid removed while it waits for, or is in, the spotlight.**
   - It must never be inserted into a column afterwards.
   - `pruneQueue` drops it.
   - Tested in Task 7.
3. **The column count changes mid-event** (admin setting, or a window resize).
   - Every live card must still be on the wall, exactly once per column assignment.
   - Tested in Task 7 (`assignColumns`).
4. **An event sticker deleted after people used it.**
   - Old polaroids still draw, without that sticker.
   - `stickerSources` omits it, and the card skips unknown ids.
   - Tested in Task 3.
5. **Stickers on an extreme-shape photo.**
   - `y` is bounded by the clamped card ratio, not the raw photo ratio.
   - Tested in Task 5.

## File map

| File | Status | Responsibility |
| --- | --- | --- |
| `src/lib/poll.ts`, `src/lib/use-poll.ts`, `src/lib/memo.ts`, `src/lib/http.ts`, `src/lib/use-wake-lock.ts` | create | Display plumbing lifted from games (Task 1) |
| `src/features/games/poll.ts`, `components/usePoll.ts`, `memo.ts`, `http.ts`, `components/display/DisplayClient.tsx` | modify | Re-export from `src/lib` |
| `supabase/migrations/0076_polaroid_wall.sql` | create | Kind constraint, activity columns, `polaroids` table, bucket |
| `scripts/polaroid-db-check.mjs`, `package.json` | create/modify | DB evidence; `check:polaroid`, `load:polaroid` |
| `src/features/polaroid/lib/settings.ts` | create | `PolaroidSettings` schema, defaults, form parsers |
| `src/features/polaroid/lib/stickers.ts`, `public/polaroid-stickers/*.svg` | create | Built-in pack, tray, sources |
| `src/features/polaroid/lib/message.ts` | create | Message check (English, Malay, admin words) |
| `src/features/polaroid/lib/card.ts`, `placement.ts`, `gesture.ts` | create | Card geometry, sticker rules, gesture maths |
| `src/features/polaroid/lib/ratelimit.ts` | create | `waitSeconds` |
| `src/features/polaroid/lib/wall-layout.ts`, `spotlight.ts` | create | Columns, slots, insertion, rebase, queue |
| `src/features/polaroid/lib/post-types.ts`, `wire.ts` | create | Shared types for actions and the wall |
| `src/lib/storage.ts`, `src/lib/db/media.ts`, `src/lib/links.ts` | modify | Bucket, paths, image kinds, sweep, links |
| `src/features/polaroid/db/polaroids.ts`, `identity.ts`, `post.ts`, `context.ts`, `wall-state.ts` | create | Server side |
| `src/features/polaroid/actions.ts`, `admin/actions.ts` | create | Server actions |
| `src/features/polaroid/font.ts`, `polaroid.module.css`, `components/*` | create | Card, composer, wall, admin UI |
| `src/features/polaroid/client.ts`, `index.ts` | create | Barrels |
| `src/lib/types.ts`, `src/features/activities/**`, `src/features/catalogue/catalogue.ts`, `src/app/admin/events/[id]/activities/page.tsx` | modify | Kind wiring |
| `src/features/activities/kinds/polaroid/settings.ts`, `PolaroidDetail.tsx`, `PolaroidBody.tsx` | create | Kind screens |
| `src/app/wall/[token]/page.tsx`, `src/app/api/wall/[token]/state/route.ts`, `src/app/e/[slug]/polaroid/[publicToken]/page.tsx` | create | Routes |
| `src/features/domains/routing.ts` | modify | `polaroid` section on event domains |
| `src/app/admin/events/[id]/actions.ts` | modify | Purge clears polaroids |
| `scripts/polaroid-load.mjs` | create | Burst seeding for the wall |
| `tests/polaroid/*.test.ts`, `tests/activities/*.test.ts`, `tests/catalogue/catalogue.test.ts`, `tests/domains/*` | create/modify | Tests |

## Task order

1. Task 1: lift the plumbing, with no behaviour change.
2. Task 2: database.
3. Tasks 3–7: pure rules (settings and stickers, message, card and placements, rate limits, wall layout).
4. Task 8: server side.
5. Task 9: the card, the composer and the walk-in page. These are checked on a test activity made with SQL, because the kind isn't wired yet.
6. Task 10: kind wiring. The kind becomes usable in admin and the portal.
7. Task 11: admin tabs (moderation feed, stickers, wall settings, links).
8. Task 12: the LED wall.
9. Task 13: purge, load script, end-to-end check and docs.

Each task leaves the app building and working.

**Where this plan differs from the spec, on purpose:**
- **Closing pauses posting without hiding the portal card.** The spec says a closed wall's portal page shows "Posting is paused". Here closing follows D384, which hides every closed activity from attendees, so the composer only shows that line if the wall closes while the page is already open. The walk-in page shows it as specified.
- **Link rotation lives in a Setup "Links" card**, not the ⋯ menu. `ActivityMenu` is shared by every kind.
- **The post button shows "Posting…" without a progress percentage.** Supabase's `uploadToSignedUrl` reports no progress.
- **Photo paths are `<org>/<event>/<activity>/<uuid>.jpg`**, not `<event>/<activity>/…`. Every other bucket files under `<org>/<event>/`, and the event delete and purge sweeps rely on that.
- **The walk-in hammer moved out of the load script.** The rate limit is unit-tested (Task 6) and checked in the browser (Task 9). Server actions can't be called from a plain Node script.

---

### Task 1: Lift the live-display plumbing into `src/lib` (no behaviour change)

The wall needs `usePoll`, `createMemo`, `json`, the poll back-off and the wake lock. They live inside the games feature today, and the barrel rule forbids reaching in. This task moves them to `src/lib` and leaves re-exports in games, so no other file changes.

**Files:**
- Create: `src/lib/poll.ts`, `src/lib/use-poll.ts`, `src/lib/memo.ts`, `src/lib/http.ts`, `src/lib/use-wake-lock.ts`
- Modify: `src/features/games/poll.ts`, `src/features/games/components/usePoll.ts`, `src/features/games/memo.ts`, `src/features/games/http.ts`, `src/features/games/components/display/DisplayClient.tsx`
- Test: the existing `tests/games/poll.test.ts` and `tests/games/memo.test.ts`

**Interfaces:**
- Produces:
  - `clockOffset(sentAt, receivedAt, serverNow): number` and `backoff(failures): number`, from `@/lib/poll`
  - `usePoll<T extends { now: number; key?: string; unchanged?: true }>(url, initial, intervalFor, versioned)` and `useServerNow(offset, everyMs?, active?)`, from `@/lib/use-poll`
  - `createMemo<T>(ttlMs, clock?)` from `@/lib/memo`
  - `json(body, status?)` from `@/lib/http`
  - `useWakeLock(active: boolean)` from `@/lib/use-wake-lock`

- [ ] **Step 1: Run the games tests to record the baseline**

Run: `npx vitest run tests/games`
Expected: PASS.

- [ ] **Step 2: Create `src/lib/poll.ts`**

```ts
/** Server time minus the midpoint of the request: add it to Date.now() for server time (D257). */
export function clockOffset(sentAt: number, receivedAt: number, serverNow: number): number {
  return serverNow - (sentAt + receivedAt) / 2;
}

/** Wait after `failures` failed polls in a row: 1 s, 2 s, 4 s, then 8 s (D262). */
export function backoff(failures: number): number {
  return Math.min(8000, 1000 * 2 ** Math.max(0, failures - 1));
}
```

In `src/features/games/poll.ts`:
- delete the `clockOffset` and `backoff` function bodies
- add this line under the existing import:

```ts
export { clockOffset, backoff } from "@/lib/poll";
```

- [ ] **Step 3: Move `usePoll` and `useServerNow` to `src/lib/use-poll.ts`**

- Create `src/lib/use-poll.ts` with the **entire** current contents of `src/features/games/components/usePoll.ts`.
- Change its one import line to `import { backoff, clockOffset } from "./poll";`.
- In the doc comment, change "Polls a game endpoint (D256)" to "Polls a live endpoint (D256; games, the polaroid wall)".

Then replace the whole of `src/features/games/components/usePoll.ts` with:

```ts
export { usePoll, useServerNow } from "@/lib/use-poll";
```

- [ ] **Step 4: Move `createMemo` and `json`**

- Create `src/lib/memo.ts` with the entire current contents of `src/features/games/memo.ts`.
- Replace `src/features/games/memo.ts` with:

```ts
export { createMemo } from "@/lib/memo";
```

- Create `src/lib/http.ts`:

```ts
/** A JSON response no cache may keep: every live endpoint answers "right now". */
export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
```

- Replace `src/features/games/http.ts` with:

```ts
export { json } from "@/lib/http";
```

- [ ] **Step 5: Move `useWakeLock`**

Create `src/lib/use-wake-lock.ts`:

```ts
"use client";
import { useEffect } from "react";

/** Keeps the screen from sleeping (D284). Browsers drop the lock when the tab hides, so it is re-taken on return. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      try {
        const next = await navigator.wakeLock.request("screen");
        // Unmounted while the request was in flight: let the lock go rather than hold it forever.
        if (stopped) void next.release();
        else lock = next;
      } catch { /* denied or unsupported: the page still works */ }
    };
    const onVisible = () => { if (!stopped && document.visibilityState === "visible") void acquire(); };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [active]);
}
```

In `src/features/games/components/display/DisplayClient.tsx`:
- delete the local `useWakeLock` function and its doc comment
- add `import { useWakeLock } from "@/lib/use-wake-lock";`

- [ ] **Step 6: Run the checks**

Run: `npx vitest run tests/games && npx tsc --noEmit && npm run lint`
Expected: everything passes, with the same test count as Step 1.

- [ ] **Step 7: Commit**

```bash
git pull --rebase --autostash
git add src/lib/poll.ts src/lib/use-poll.ts src/lib/memo.ts src/lib/http.ts src/lib/use-wake-lock.ts src/features/games/poll.ts src/features/games/components/usePoll.ts src/features/games/memo.ts src/features/games/http.ts src/features/games/components/display/DisplayClient.tsx
git commit -m "refactor(display): lift polling, memo, json and wake lock into src/lib for the polaroid wall (D484)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Database — migration 0076 and its check script

**Files:**
- Create: `supabase/migrations/0076_polaroid_wall.sql`, `scripts/polaroid-db-check.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces:
  - table `polaroids`, with the columns in the migration below
  - columns `activities.wall_token`, `activities.public_token` and `activities.polaroid`
  - bucket `polaroids`
  - npm script `check:polaroid`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0076_polaroid_wall.sql`:

```sql
-- The polaroid wall (spec 2026-10-11-polaroid-wall-design.md, D471–D485): the fourth kind of
-- activity, its posts and its photo bucket. Adds three columns to activities, one table and one
-- bucket; no existing row changes.

alter table activities drop constraint if exists activities_kind_check;
alter table activities add constraint activities_kind_check
  check (kind in ('booking', 'submission', 'passport', 'polaroid'));

-- D474: the LED's link and the walk-in link, each its own token so neither opens the other.
-- `polaroid` is the kind's settings (D475); the app reads it with every default filled in.
alter table activities
  add column if not exists wall_token text unique,
  add column if not exists public_token text unique,
  add column if not exists polaroid jsonb;

create table if not exists public.polaroids (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete cascade,
  -- Null is a walk-in (D481). A deleted attendee's posts stay, unattributed.
  attendee_id uuid references public.attendees (id) on delete set null,
  -- Unique: one upload is one post, so a replayed path cannot post twice.
  photo_path  text not null unique,
  photo_w     int not null check (photo_w between 1 and 4000),
  photo_h     int not null check (photo_h between 1 and 4000),
  message     text not null default '' check (length(message) <= 80),
  stickers    jsonb not null default '[]'::jsonb
              check (jsonb_typeof(stickers) = 'array' and jsonb_array_length(stickers) <= 8),
  tilt        real not null default 0 check (tilt between -3 and 3),
  status      text not null default 'live' check (status in ('live', 'removed')),
  removed_by  text,
  removed_at  timestamptz,
  -- D480: sha-256 of a per-device cookie id, and an HMAC of the IP. Neither is reversible.
  client_key  text not null,
  ip_hash     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists polaroids_wall on public.polaroids (activity_id, status, created_at);
create index if not exists polaroids_client on public.polaroids (activity_id, client_key, created_at);
create index if not exists polaroids_ip on public.polaroids (activity_id, ip_hash, created_at);
create index if not exists polaroids_attendee on public.polaroids (attendee_id, created_at);

alter table public.polaroids enable row level security;

-- D474: public read, so the LED loads photos without signed links that change every poll. No
-- write policy: only a server-minted signed upload URL puts anything in it. 4 MB, JPEG/WebP.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('polaroids', 'polaroids', true, 4194304, array['image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
```

- [ ] **Step 2: Apply it**

Apply with the Supabase MCP `apply_migration` tool:
- project `wfmqwwcolfigjylkgrsv`
- name `0076_polaroid_wall`
- the file contents as the query

Then run `get_advisors` (type `security`).
Expected: no new advisory naming `polaroids`. The "RLS enabled, no policies" notice is expected, as for every other table.

- [ ] **Step 3: Write the check script**

Create `scripts/polaroid-db-check.mjs`:

```js
// Executable evidence that migration 0076 (polaroid wall, D474) holds against a real database.
// vitest has no database (D141), so the pure rules are unit-tested and this proves the SQL.
//
// WHAT THIS PROVES:
//   1. activities accepts kind 'polaroid', and wall_token / public_token are unique.
//   2. polaroids refuses a 81-character message, 9 stickers, a tilt of 4, and status 'gone'.
//   3. photo_path is unique: the same upload cannot post twice.
//   4. The polaroids bucket is public-read and refuses an anonymous upload.
//   5. Removing a photo object leaves the row; deleting the event removes every polaroid row.
//
// HOW TO RUN: npm run check:polaroid (node --env-file=.env.local scripts/polaroid-db-check.mjs).
// SAFE TO RE-RUN: it creates its own draft event with a random slug and deletes it in `finally`.
// It never touches the event with slug `ecphub`.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key || !anonKey) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/polaroid-db-check.mjs");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const runId = randomUUID().replaceAll("-", "");
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
};
const must = ({ data, error }) => { if (error) throw error; return data; };

const org = must(await db.from("organisations").select("id").limit(1).single());
const event = must(await db.from("events").insert({ org_id: org.id, name: `Polaroid check ${runId}`, slug: `polaroid-check-${runId}` }).select("id, org_id").single());

try {
  // 1. The kind and its tokens.
  const tokenA = runId.slice(0, 12);
  const activity = must(await db.from("activities").insert({
    org_id: event.org_id, event_id: event.id, name: "Wall", kind: "polaroid", required: false, is_open: true,
    max_per_attendee: null, questions: [], per_day: false, wall_token: tokenA, public_token: runId.slice(12, 24), polaroid: {},
  }).select("id").single());
  check("activities accepts kind 'polaroid'", Boolean(activity.id));
  const dupe = await db.from("activities").insert({
    org_id: event.org_id, event_id: event.id, name: "Wall 2", kind: "polaroid", required: false, is_open: true,
    max_per_attendee: null, questions: [], per_day: false, wall_token: tokenA,
  });
  check("wall_token is unique", dupe.error?.code === "23505", dupe.error?.code ?? "inserted");

  // 2. Row checks.
  const base = (n) => ({
    event_id: event.id, activity_id: activity.id, photo_path: `${event.org_id}/${event.id}/${activity.id}/${runId}-${n}.jpg`,
    photo_w: 1200, photo_h: 1600, client_key: "check", ip_hash: "check",
  });
  const ok = await db.from("polaroids").insert({ ...base(1), message: "Hello", stickers: [{ id: "heart", x: 0.5, y: 0.5, scale: 0.2, rot: 0 }], tilt: 1.5 });
  check("a valid polaroid is stored", !ok.error, ok.error?.message);
  for (const [label, row] of [
    ["an 81-character message", { ...base(2), message: "x".repeat(81) }],
    ["9 stickers", { ...base(3), stickers: Array.from({ length: 9 }, () => ({ id: "heart", x: 0, y: 0, scale: 0.1, rot: 0 })) }],
    ["a tilt of 4", { ...base(4), tilt: 4 }],
    ["status 'gone'", { ...base(5), status: "gone" }],
  ]) {
    const r = await db.from("polaroids").insert(row);
    check(`polaroids refuses ${label}`, r.error?.code === "23514", r.error?.code ?? "inserted");
  }

  // 3. One upload, one post.
  const again = await db.from("polaroids").insert({ ...base(1) });
  check("photo_path is unique", again.error?.code === "23505", again.error?.code ?? "inserted");

  // 4. The bucket.
  const bucket = must(await db.storage.getBucket("polaroids"));
  check("the polaroids bucket is public", bucket.public === true);
  const anonUp = await anon.storage.from("polaroids").upload(`${event.org_id}/${event.id}/anon-${runId}.jpg`, new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }));
  check("an anonymous upload is refused", Boolean(anonUp.error), anonUp.error?.message ?? "uploaded");
  if (!anonUp.error) await db.storage.from("polaroids").remove([`${event.org_id}/${event.id}/anon-${runId}.jpg`]);

  // 5. Removing the object leaves the row.
  const path = base(9).photo_path;
  must(await db.storage.from("polaroids").upload(path, new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" })));
  must(await db.from("polaroids").insert({ ...base(9) }));
  must(await db.storage.from("polaroids").remove([path]));
  const kept = must(await db.from("polaroids").select("id").eq("photo_path", path));
  check("removing the photo object leaves the row", kept.length === 1);
} catch (e) {
  failures += 1;
  console.error("ERROR", e);
} finally {
  const { error } = await db.from("events").delete().eq("id", event.id);
  if (error) console.error("WARNING: could not delete the check event", event.id, error);
  else {
    const left = await db.from("polaroids").select("id", { count: "exact", head: true }).eq("event_id", event.id);
    check("deleting the event removes every polaroid row", (left.count ?? 0) === 0);
  }
}
process.exit(failures ? 1 : 0);
```

In `package.json` `"scripts"`, after `"check:setup"`, add:

```json
    "check:polaroid": "node --env-file=.env.local scripts/polaroid-db-check.mjs",
```

- [ ] **Step 4: Run it**

Run: `npm run check:polaroid`
Expected: every line is `PASS`, and the exit code is 0.
- If a test row is refused on a column the script doesn't set, read the column list with `execute_sql` (`select column_name, is_nullable, column_default from information_schema.columns where table_name = 'activities'`) and add the missing column to the insert.
- Do not loosen the migration.

- [ ] **Step 5: Commit**

```bash
git pull --rebase --autostash
git add supabase/migrations/0076_polaroid_wall.sql scripts/polaroid-db-check.mjs package.json
git commit -m "feat(polaroid): migration 0076 — polaroid kind, polaroids table and bucket (D474)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Settings schema and the sticker pack

**Files:**
- Create: `src/features/polaroid/lib/settings.ts`, `src/features/polaroid/lib/stickers.ts`, `public/polaroid-stickers/*.svg` (18 files), `public/polaroid-stickers/LICENSE.md`
- Test: `tests/polaroid/settings.test.ts`, `tests/polaroid/stickers.test.ts`

**Interfaces:**
- Produces, from `lib/settings.ts`:
  - `WALL_SPEEDS`, `type WallSpeed`
  - `DEFAULT_PROMPT`, `MAX_PROMPT`
  - `type PolaroidSettings`, `type EventSticker`, `type WallBackground`
  - `readPolaroidSettings(raw: unknown): PolaroidSettings`
  - `parseBlockedWords(text: string): string[]`
  - `parseColumns(v: string): "auto" | number`
  - `parseSpeed(v: string): WallSpeed`
- Produces, from `lib/stickers.ts`:
  - `type StickerDef = { id: string; name: string; src: string }`
  - `BUILTIN_STICKERS: readonly StickerDef[]`
  - `stickerTray(settings): StickerDef[]`
  - `stickerSources(settings): Record<string, string>`
  - `newEventStickerId(rand?: () => number): string`

- [ ] **Step 1: Write the failing tests**

`tests/polaroid/settings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readPolaroidSettings, parseBlockedWords, parseColumns, parseSpeed, DEFAULT_PROMPT } from "@/features/polaroid/lib/settings";

describe("readPolaroidSettings (D475)", () => {
  it("fills every default from nothing", () => {
    expect(readPolaroidSettings(null)).toEqual({
      prompt: DEFAULT_PROMPT, public: false, hidden_builtin: [], stickers: [], blocked_words: [],
      columns: "auto", speed: "medium", background: null,
    });
  });
  it("keeps good fields and defaults only the damaged one", () => {
    const s = readPolaroidSettings({ prompt: "Say hi!", public: true, columns: 99, speed: "warp" });
    expect(s.prompt).toBe("Say hi!");
    expect(s.public).toBe(true);
    expect(s.columns).toBe("auto");
    expect(s.speed).toBe("medium");
  });
  it("keeps a valid column override and background", () => {
    const s = readPolaroidSettings({ columns: 6, background: { type: "video", url: "https://x.supabase.co/v.mp4" } });
    expect(s.columns).toBe(6);
    expect(s.background).toEqual({ type: "video", url: "https://x.supabase.co/v.mp4" });
  });
});

describe("form parsers", () => {
  it("splits blocked words on lines and commas, lowercases and dedupes", () => {
    expect(parseBlockedWords("Rival Co, rival co\n  competitor \n\n")).toEqual(["rival co", "competitor"]);
  });
  it("drops words over 40 characters and keeps at most 200", () => {
    expect(parseBlockedWords("x".repeat(41))).toEqual([]);
    expect(parseBlockedWords(Array.from({ length: 250 }, (_, i) => `w${i}`).join(","))).toHaveLength(200);
  });
  it("reads columns and speed, falling back safely", () => {
    expect(parseColumns("auto")).toBe("auto");
    expect(parseColumns("7")).toBe(7);
    expect(parseColumns("2")).toBe("auto");
    expect(parseSpeed("fast")).toBe("fast");
    expect(parseSpeed("x")).toBe("medium");
  });
});
```

`tests/polaroid/stickers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { BUILTIN_STICKERS, stickerTray, stickerSources, newEventStickerId } from "@/features/polaroid/lib/stickers";
import { readPolaroidSettings } from "@/features/polaroid/lib/settings";

describe("the built-in pack (D483)", () => {
  it("has 18 stickers with unique ids and a file each", () => {
    expect(BUILTIN_STICKERS).toHaveLength(18);
    expect(new Set(BUILTIN_STICKERS.map((s) => s.id)).size).toBe(18);
    for (const s of BUILTIN_STICKERS) expect(existsSync(path.join("public", s.src))).toBe(true);
  });
});

describe("stickerTray", () => {
  it("puts the event's stickers first, then the visible built-ins", () => {
    const settings = readPolaroidSettings({
      stickers: [{ id: "ev-abcd1234", url: "https://x.supabase.co/logo.png", name: "Logo" }],
      hidden_builtin: ["heart"],
    });
    const tray = stickerTray(settings);
    expect(tray[0]).toEqual({ id: "ev-abcd1234", name: "Logo", src: "https://x.supabase.co/logo.png" });
    expect(tray.some((s) => s.id === "heart")).toBe(false);
    expect(tray).toHaveLength(1 + 17);
  });
});

describe("stickerSources (Review Focus 4)", () => {
  it("still draws a hidden built-in, but not an event sticker that was deleted", () => {
    const settings = readPolaroidSettings({ hidden_builtin: ["heart"], stickers: [] });
    const src = stickerSources(settings);
    expect(src.heart).toBe("/polaroid-stickers/heart.svg");
    expect(src["ev-gone0000"]).toBeUndefined();
  });
});

describe("newEventStickerId", () => {
  it("makes ev- plus 8 lowercase letters or digits", () => {
    expect(newEventStickerId()).toMatch(/^ev-[a-z0-9]{8}$/);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/polaroid`
Expected: FAIL. The modules don't exist yet.

- [ ] **Step 3: Implement `lib/settings.ts`**

```ts
import { z } from "zod";

/** How fast the wall's columns move (D484). */
export const WALL_SPEEDS = ["slow", "medium", "fast"] as const;
export type WallSpeed = (typeof WALL_SPEEDS)[number];

export const DEFAULT_PROMPT = "Share the moment!";
export const MAX_PROMPT = 60;
const MAX_BLOCKED_WORDS = 200;
const MAX_WORD = 40;
const MAX_EVENT_STICKERS = 40;

const eventSticker = z.object({ id: z.string().regex(/^ev-[a-z0-9]{8}$/), url: z.url(), name: z.string().min(1).max(60) });
const background = z.object({ type: z.enum(["image", "video"]), url: z.url() });

const schema = z.object({
  prompt: z.string().trim().min(1).max(MAX_PROMPT).catch(DEFAULT_PROMPT),
  public: z.boolean().catch(false),
  hidden_builtin: z.array(z.string()).catch([]),
  stickers: z.array(eventSticker).max(MAX_EVENT_STICKERS).catch([]),
  blocked_words: z.array(z.string().min(1).max(MAX_WORD)).max(MAX_BLOCKED_WORDS).catch([]),
  columns: z.union([z.literal("auto"), z.number().int().min(3).max(10)]).catch("auto"),
  speed: z.enum(WALL_SPEEDS).catch("medium"),
  background: background.nullable().catch(null),
});

export type PolaroidSettings = z.infer<typeof schema>;
export type EventSticker = z.infer<typeof eventSticker>;
export type WallBackground = z.infer<typeof background>;

/**
 * An activity's `polaroid` column with every default filled in (D475). Never throws: each field
 * falls back on its own, so one damaged value never blanks the rest of the wall's settings.
 */
export function readPolaroidSettings(raw: unknown): PolaroidSettings {
  return schema.parse(raw && typeof raw === "object" ? raw : {});
}

/** The admin's blocked-words box: one per line or comma, lowercased, deduped, at most 200. */
export function parseBlockedWords(text: string): string[] {
  const words = text.split(/[\n,]/).map((w) => w.trim().toLowerCase().replace(/\s+/g, " ")).filter((w) => w && w.length <= MAX_WORD);
  return [...new Set(words)].slice(0, MAX_BLOCKED_WORDS);
}

export function parseColumns(v: string): "auto" | number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 3 && n <= 10 ? n : "auto";
}

export function parseSpeed(v: string): WallSpeed {
  return (WALL_SPEEDS as readonly string[]).includes(v) ? (v as WallSpeed) : "medium";
}
```

- [ ] **Step 4: Implement `lib/stickers.ts`**

```ts
import type { PolaroidSettings } from "./settings";

/** One sticker the tray offers or a card draws. `src` is an image URL. */
export type StickerDef = { id: string; name: string; src: string };

const BUILTIN: readonly (readonly [string, string])[] = [
  ["heart", "Heart"], ["hearts", "Hearts"], ["star", "Star"], ["sparkles", "Sparkles"],
  ["smiley", "Smiley"], ["wink", "Wink"], ["sun", "Sun"], ["flower", "Flower"],
  ["crown", "Crown"], ["balloon", "Balloon"], ["party-hat", "Party hat"], ["confetti", "Confetti"],
  ["music", "Music"], ["rainbow", "Rainbow"], ["bolt", "Bolt"], ["wow", "WOW"], ["yay", "YAY"], ["love", "LOVE"],
];

/** D483: the pack every event has. Original artwork, in public/polaroid-stickers. */
export const BUILTIN_STICKERS: readonly StickerDef[] = BUILTIN.map(([id, name]) => ({ id, name, src: `/polaroid-stickers/${id}.svg` }));

/** The tray (D482): the event's own stickers first, then the built-ins the admin has not hidden. */
export function stickerTray(settings: Pick<PolaroidSettings, "stickers" | "hidden_builtin">): StickerDef[] {
  const hidden = new Set(settings.hidden_builtin);
  return [
    ...settings.stickers.map((s) => ({ id: s.id, name: s.name, src: s.url })),
    ...BUILTIN_STICKERS.filter((s) => !hidden.has(s.id)),
  ];
}

/**
 * Every sticker a stored polaroid may name, for drawing (D476). Hidden built-ins still draw on
 * cards made before they were hidden; an event sticker deleted since is simply absent, and the
 * card skips it rather than breaking.
 */
export function stickerSources(settings: Pick<PolaroidSettings, "stickers">): Record<string, string> {
  return Object.fromEntries([
    ...BUILTIN_STICKERS.map((s) => [s.id, s.src] as const),
    ...settings.stickers.map((s) => [s.id, s.url] as const),
  ]);
}

const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
export function newEventStickerId(rand: () => number = Math.random): string {
  let id = "ev-";
  for (let i = 0; i < 8; i++) id += ID_CHARS[Math.floor(rand() * ID_CHARS.length)];
  return id;
}
```

- [ ] **Step 5: Create the 18 SVG stickers**

Every file uses a 100×100 viewBox. The white outline comes from `stroke="#fff"` with `paint-order="stroke"` on the group; inner details set `stroke="none"`. Create each file in `public/polaroid-stickers/` with exactly this content:

`heart.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="#fff" stroke-width="7" stroke-linejoin="round" paint-order="stroke"><path fill="#ff4d6d" d="M50 88C20 66 7 49 7 32 7 18 18 8 31 8c9 0 15 5 19 12 4-7 10-12 19-12 13 0 24 10 24 24 0 17-13 34-43 56z"/><path fill="#fff" stroke="none" opacity=".5" d="M24 22c-6 3-9 9-8 15 4-6 8-9 14-11z"/></g></svg>
```
`hearts.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="#fff" stroke-width="6" stroke-linejoin="round" paint-order="stroke"><path fill="#ff7aa2" transform="translate(4 30) scale(.55)" d="M50 88C20 66 7 49 7 32 7 18 18 8 31 8c9 0 15 5 19 12 4-7 10-12 19-12 13 0 24 10 24 24 0 17-13 34-43 56z"/><path fill="#ff2e63" transform="translate(42 6) scale(.55)" d="M50 88C20 66 7 49 7 32 7 18 18 8 31 8c9 0 15 5 19 12 4-7 10-12 19-12 13 0 24 10 24 24 0 17-13 34-43 56z"/></g></svg>
```
`star.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="#fff" stroke-width="7" stroke-linejoin="round" paint-order="stroke"><path fill="#ffc83d" d="M50 6l12 31 33 1-26 20 9 33-28-19-28 19 9-33L5 38l33-1z"/></g></svg>
```
`sparkles.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="#fff" stroke-width="6" stroke-linejoin="round" paint-order="stroke"><path fill="#ffd84d" d="M42 8c4 26 12 34 38 38-26 4-34 12-38 38-4-26-12-34-38-38 26-4 34-12 38-38z"/><path fill="#7ad3ff" d="M80 58c2 12 6 16 16 18-10 2-14 6-16 18-2-12-6-16-16-18 10-2 14-6 16-18z"/></g></svg>
```
`smiley.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="#fff" stroke-width="7" paint-order="stroke"><circle cx="50" cy="50" r="42" fill="#ffd23f"/><ellipse cx="36" cy="40" rx="5" ry="8" fill="#3a2a00" stroke="none"/><ellipse cx="64" cy="40" rx="5" ry="8" fill="#3a2a00" stroke="none"/><path d="M28 58c8 16 36 16 44 0" fill="none" stroke="#3a2a00" stroke-width="6" stroke-linecap="round"/></g></svg>
```
`wink.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="#fff" stroke-width="7" paint-order="stroke"><circle cx="50" cy="50" r="42" fill="#ffb84d"/><path d="M29 41h14" stroke="#3a2a00" stroke-width="6" stroke-linecap="round"/><ellipse cx="64" cy="40" rx="5" ry="8" fill="#3a2a00" stroke="none"/><path d="M30 60c10 12 30 12 40 0" fill="none" stroke="#3a2a00" stroke-width="6" stroke-linecap="round"/><path d="M58 66c4 10 14 10 14 2" fill="#ff6b8b" stroke="none"/></g></svg>
```
`sun.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="#fff" stroke-width="6" stroke-linejoin="round" paint-order="stroke"><path fill="#ff9f1c" d="M50 2l7 16-7-2-7 2zM50 98l-7-16 7 2 7-2zM2 50l16-7-2 7 2 7zM98 50l-16 7 2-7-2-7zM16 16l16 6-6 4-4 6zM84 84l-16-6 6-4 4-6zM84 16l-6 16-4-6-6-4zM16 84l6-16 4 6 6 4z"/><circle cx="50" cy="50" r="27" fill="#ffd23f"/></g></svg>
```
`flower.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="#fff" stroke-width="6" paint-order="stroke"><g fill="#ff8fab"><circle cx="50" cy="24" r="18"/><circle cx="75" cy="42" r="18"/><circle cx="66" cy="72" r="18"/><circle cx="34" cy="72" r="18"/><circle cx="25" cy="42" r="18"/></g><circle cx="50" cy="50" r="14" fill="#ffd23f"/></g></svg>
```
`crown.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="#fff" stroke-width="7" stroke-linejoin="round" paint-order="stroke"><path fill="#ffc83d" d="M10 76L6 28l24 20 20-32 20 32 24-20-4 48z"/><rect x="10" y="74" width="80" height="12" rx="3" fill="#f4a300"/><circle cx="50" cy="56" r="6" fill="#ff4d6d" stroke="none"/></g></svg>
```
`balloon.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="#fff" stroke-width="6" stroke-linejoin="round" paint-order="stroke"><path d="M50 72c-2 8 6 12 2 26" fill="none" stroke="#555" stroke-width="3"/><ellipse cx="50" cy="38" rx="28" ry="34" fill="#4d9bff"/><path fill="#4d9bff" d="M44 71h12l-6 6z"/><ellipse cx="40" cy="24" rx="6" ry="10" fill="#fff" opacity=".45" stroke="none"/></g></svg>
```
`party-hat.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="#fff" stroke-width="7" stroke-linejoin="round" paint-order="stroke"><path fill="#9b5de5" d="M50 10L82 88H18z"/><path fill="#ffd23f" stroke="none" d="M42 30h16l4 10H38zM34 50h32l4 10H30zM26 70h48l4 10H22z"/><circle cx="50" cy="10" r="8" fill="#ff4d6d"/></g></svg>
```
`confetti.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="#fff" stroke-width="4" paint-order="stroke"><rect x="10" y="14" width="14" height="8" rx="2" fill="#ff4d6d" transform="rotate(-20 17 18)"/><rect x="44" y="8" width="14" height="8" rx="2" fill="#ffd23f" transform="rotate(25 51 12)"/><rect x="76" y="20" width="14" height="8" rx="2" fill="#4d9bff" transform="rotate(-35 83 24)"/><rect x="22" y="48" width="14" height="8" rx="2" fill="#2ec4b6" transform="rotate(40 29 52)"/><rect x="60" y="46" width="14" height="8" rx="2" fill="#9b5de5" transform="rotate(-10 67 50)"/><rect x="12" y="80" width="14" height="8" rx="2" fill="#ff9f1c" transform="rotate(15 19 84)"/><rect x="48" y="78" width="14" height="8" rx="2" fill="#ff4d6d" transform="rotate(-40 55 82)"/><rect x="80" y="74" width="14" height="8" rx="2" fill="#ffd23f" transform="rotate(30 87 78)"/></g></svg>
```
`music.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="#fff" stroke-width="7" stroke-linejoin="round" paint-order="stroke"><path fill="#2ec4b6" d="M36 20l50-12v56h-10V26L46 33v41H36z"/><ellipse cx="28" cy="76" rx="15" ry="12" fill="#2ec4b6"/><ellipse cx="78" cy="66" rx="15" ry="12" fill="#2ec4b6"/></g></svg>
```
`rainbow.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="none" stroke-linecap="round"><path d="M10 78a40 40 0 0 1 80 0" stroke="#fff" stroke-width="34"/><path d="M14 78a36 36 0 0 1 72 0" stroke="#ff4d6d" stroke-width="8"/><path d="M22 78a28 28 0 0 1 56 0" stroke="#ffd23f" stroke-width="8"/><path d="M30 78a20 20 0 0 1 40 0" stroke="#2ec4b6" stroke-width="8"/><path d="M38 78a12 12 0 0 1 24 0" stroke="#4d9bff" stroke-width="8"/></g></svg>
```
`bolt.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="#fff" stroke-width="7" stroke-linejoin="round" paint-order="stroke"><path fill="#ffd23f" d="M58 4L18 56h26l-8 40 46-56H54z"/></g></svg>
```
`wow.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="#fff" stroke-width="6" stroke-linejoin="round" paint-order="stroke"><path fill="#ff4d6d" d="M8 18h84v50H44L26 86l4-18H8z"/><text x="50" y="54" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="28" font-weight="900" fill="#fff" stroke="none">WOW</text></g></svg>
```
`yay.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="#fff" stroke-width="6" stroke-linejoin="round" paint-order="stroke"><path fill="#9b5de5" d="M8 18h84v50H70l4 18-18-18H8z"/><text x="50" y="54" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="28" font-weight="900" fill="#ffd23f" stroke="none">YAY!</text></g></svg>
```
`love.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="#fff" stroke-width="6" stroke-linejoin="round" paint-order="stroke"><rect x="6" y="26" width="88" height="44" rx="22" fill="#ff7aa2"/><text x="50" y="58" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="26" font-weight="900" fill="#fff" stroke="none">LOVE</text></g></svg>
```

`public/polaroid-stickers/LICENSE.md`:

```md
# Polaroid wall stickers

Original artwork drawn for ECP Hub's polaroid wall (spec 2026-10-11, D483). No third-party
assets. Each is a 100×100 SVG with a white outline so it reads on any photo.
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run tests/polaroid`
Expected: PASS (settings: 5, stickers: 4).

- [ ] **Step 7: Commit**

```bash
git pull --rebase --autostash
git add src/features/polaroid/lib/settings.ts src/features/polaroid/lib/stickers.ts public/polaroid-stickers tests/polaroid/settings.test.ts tests/polaroid/stickers.test.ts
git commit -m "feat(polaroid): settings schema and the built-in sticker pack (D475, D476, D483)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The message check

**Files:**
- Modify: `package.json`, `package-lock.json` (adds `obscenity`)
- Create: `src/features/polaroid/lib/message.ts`
- Test: `tests/polaroid/message.test.ts`

**Interfaces:**
- Produces:
  - `MAX_MESSAGE = 80`, `FRIENDLY_REJECTION`, `MESSAGE_TOO_LONG`
  - `MALAY_BLOCKED: readonly string[]`
  - `normaliseForMatch(text: string): string`
  - `hasBlockedWord(text: string, words: readonly string[]): boolean`
  - `type MessageCheck = { ok: true; message: string } | { ok: false; error: string }`
  - `checkMessage(raw: string, extraWords?: readonly string[]): MessageCheck`
  - `messageLength(text: string): number`

- [ ] **Step 1: Add the dependency**

Run: `npm install obscenity@^0.4.0`
Expected: `package.json` lists `"obscenity"` under dependencies.
- If 0.4 isn't available, install the latest 0.x.
- Its API (`RegExpMatcher`, `englishDataset`, `englishRecommendedTransformers`) has been stable since 0.1.

- [ ] **Step 2: Write the failing test**

`tests/polaroid/message.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checkMessage, FRIENDLY_REJECTION, MESSAGE_TOO_LONG, normaliseForMatch, hasBlockedWord, messageLength } from "@/features/polaroid/lib/message";

describe("checkMessage (D479)", () => {
  it("passes friendly messages and collapses whitespace", () => {
    expect(checkMessage("  Happy   KOM 2026!\n")).toEqual({ ok: true, message: "Happy KOM 2026!" });
    expect(checkMessage("")).toEqual({ ok: true, message: "" });
    expect(checkMessage("Special thanks to the team")).toEqual({ ok: true, message: "Special thanks to the team" });
  });
  it("rejects English profanity, including leetspeak", () => {
    expect(checkMessage("what the fuck")).toEqual({ ok: false, error: FRIENDLY_REJECTION });
    expect(checkMessage("f4ck this")).toEqual({ ok: false, error: FRIENDLY_REJECTION });
  });
  it("rejects Malay and Manglish words, with stretched letters and particles", () => {
    expect(checkMessage("babi")).toEqual({ ok: false, error: FRIENDLY_REJECTION });
    expect(checkMessage("Babiii lah")).toEqual({ ok: false, error: FRIENDLY_REJECTION });
    expect(checkMessage("b4bilah")).toEqual({ ok: false, error: FRIENDLY_REJECTION });
    expect(checkMessage("haram jadah betul")).toEqual({ ok: false, error: FRIENDLY_REJECTION });
  });
  it("rejects the admin's own words", () => {
    expect(checkMessage("Go Rival Co", ["rival co"])).toEqual({ ok: false, error: FRIENDLY_REJECTION });
    expect(checkMessage("Go team", ["rival co"]).ok).toBe(true);
  });
  it("counts characters by code point, at most 80", () => {
    expect(checkMessage("😀".repeat(80)).ok).toBe(true);
    expect(checkMessage("😀".repeat(81))).toEqual({ ok: false, error: MESSAGE_TOO_LONG });
    expect(messageLength("😀a")).toBe(2);
  });
});

describe("normaliseForMatch", () => {
  it("lowercases, undoes leetspeak, strips accents and collapses repeated letters", () => {
    // "!" reads as "i", joins the run of i's, and the run squeezes to one.
    expect(normaliseForMatch("BÁBIIII!!")).toBe("babi");
    expect(normaliseForMatch("k1m4k")).toBe("kimak");
  });
  it("matches whole words only", () => {
    expect(hasBlockedWord("special", ["sial"])).toBe(false);
    expect(hasBlockedWord("sial betul", ["sial"])).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to see it fail**

Run: `npx vitest run tests/polaroid/message.test.ts`
Expected: FAIL. The module doesn't exist yet.

- [ ] **Step 4: Implement `lib/message.ts`**

```ts
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";

export const MAX_MESSAGE = 80;
export const FRIENDLY_REJECTION = "Let's keep it friendly — please change the wording.";
export const MESSAGE_TOO_LONG = `Keep your message to ${MAX_MESSAGE} characters.`;

/**
 * D479: common Malay, Manglish and Malaysian Hokkien/Cantonese/Tamil-origin swear words and
 * insults. `obscenity` knows only English. Admins add their own per event (`blocked_words`).
 */
export const MALAY_BLOCKED: readonly string[] = [
  "babi", "bangsat", "bodoh", "sial", "celaka", "puki", "pukimak", "kimak", "lancau", "pantat",
  "butoh", "konek", "jubur", "haram jadah", "sundal", "pelacur", "keparat", "pepek", "cibai",
  "kanina", "knn", "nabei", "lanjiao", "pundek", "bapak kau", "mak kau",
];

/** Particles Malaysians tack onto a word, so "babilah" is still caught. */
const SUFFIXES = ["", "la", "lah", "nya", "kau", "ke"];

const english = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });

const LEET: Record<string, string> = { "4": "a", "@": "a", "3": "e", "1": "i", "!": "i", "0": "o", "5": "s", "$": "s", "7": "t" };

/** Characters as people count them: an emoji is one, not two UTF-16 units. */
export function messageLength(text: string): number {
  return [...text].length;
}

/**
 * Text reduced to plain lowercase words: accents stripped, leetspeak undone, anything else a
 * space, and runs of one letter squeezed to one ("babiii" is "babi").
 */
export function normaliseForMatch(text: string): string {
  return text
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[4@3105$7!]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z]+/g, " ")
    .replace(/([a-z])\1+/g, "$1")
    .trim();
}

/** Whether `text` holds any of `words` as a whole word (or phrase), allowing a Malay particle after it. */
export function hasBlockedWord(text: string, words: readonly string[]): boolean {
  const hay = normaliseForMatch(text);
  if (!hay) return false;
  const tokens = hay.split(" ");
  const spaced = ` ${hay} `;
  return words.some((w) => {
    const n = normaliseForMatch(w);
    if (!n) return false;
    if (n.includes(" ")) return spaced.includes(` ${n} `);
    return tokens.some((t) => SUFFIXES.some((s) => t === n + s));
  });
}

export type MessageCheck = { ok: true; message: string } | { ok: false; error: string };

/** D479: the server's check on every post; the composer runs the same one for instant feedback. */
export function checkMessage(raw: string, extraWords: readonly string[] = []): MessageCheck {
  const message = raw.replace(/\s+/g, " ").trim();
  if (messageLength(message) > MAX_MESSAGE) return { ok: false, error: MESSAGE_TOO_LONG };
  if (!message) return { ok: true, message };
  if (english.hasMatch(message) || hasBlockedWord(message, MALAY_BLOCKED) || hasBlockedWord(message, extraWords)) {
    return { ok: false, error: FRIENDLY_REJECTION };
  }
  return { ok: true, message };
}
```

- [ ] **Step 5: Run the test to see it pass**

Run: `npx vitest run tests/polaroid/message.test.ts`
Expected: PASS.
- If `"f4ck this"` passes the English matcher, change the test to `"fuuuck this"` (the recommended transformers collapse repeats) and record the finding in the commit message.
- Don't hand-roll an English list.

- [ ] **Step 6: Commit**

```bash
git pull --rebase --autostash
git add package.json package-lock.json src/features/polaroid/lib/message.ts tests/polaroid/message.test.ts
git commit -m "feat(polaroid): message check — obscenity, Malay list and admin words (D479)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Card geometry, sticker placements and gesture maths

**Files:**
- Create: `src/features/polaroid/lib/card.ts`, `src/features/polaroid/lib/placement.ts`, `src/features/polaroid/lib/gesture.ts`
- Test: `tests/polaroid/card.test.ts`, `tests/polaroid/placement.test.ts`

**Interfaces:**
- Produces, from `card.ts`:
  - `CARD = { border: 0.055, strip: 0.27 }`, `PHOTO_INNER`, `MIN_PHOTO_RATIO`, `MAX_PHOTO_RATIO`
  - `photoBoxRatio(w, h): number`
  - `cardRatio(w, h): number`
  - `messageScale(length): number`
  - `randomTilt(rand?): number`
- Produces, from `placement.ts`:
  - `type StickerPlacement = { id: string; x: number; y: number; scale: number; rot: number }`
  - `MAX_STICKERS = 8`, `MIN_SCALE`, `MAX_SCALE`
  - `normaliseAngle(deg)`
  - `clampPlacement(p, ratio)`
  - `newPlacement(id, ratio)`
  - `type PlacementCheck`
  - `cleanPlacements(raw: unknown, allowed: ReadonlySet<string>, ratio: number): PlacementCheck`
- Produces, from `gesture.ts`:
  - `type Point = { x: number; y: number }`
  - `pinch(start: [Point, Point], now: [Point, Point], base: { scale: number; rot: number })`
  - `handleDrag(center: Point, start: Point, now: Point, base)`

  Both return `{ scale, rot }`.

- [ ] **Step 1: Write the failing tests**

`tests/polaroid/card.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { photoBoxRatio, cardRatio, messageScale, randomTilt, MAX_PHOTO_RATIO, MIN_PHOTO_RATIO } from "@/features/polaroid/lib/card";

describe("photoBoxRatio (D477)", () => {
  it("keeps an ordinary photo's own shape", () => {
    expect(photoBoxRatio(1200, 1600)).toBeCloseTo(4 / 3);
    expect(photoBoxRatio(1600, 900)).toBeCloseTo(9 / 16);
  });
  it("stops at 16:9 tall and 16:9 wide", () => {
    expect(photoBoxRatio(1080, 2400)).toBe(MAX_PHOTO_RATIO);
    expect(photoBoxRatio(4000, 1000)).toBe(MIN_PHOTO_RATIO);
  });
  it("treats missing dimensions as square", () => {
    expect(photoBoxRatio(0, 10)).toBe(1);
  });
});

describe("cardRatio (D483)", () => {
  it("adds the top border and the message strip to the photo box", () => {
    expect(cardRatio(1, 1)).toBeCloseTo(0.055 + 0.89 + 0.27);
  });
});

describe("messageScale", () => {
  it("shrinks longer messages so two lines fit", () => {
    expect(messageScale(10)).toBe(1);
    expect(messageScale(40)).toBe(0.8);
    expect(messageScale(80)).toBe(0.66);
  });
});

describe("randomTilt", () => {
  it("stays within ±3 degrees", () => {
    expect(randomTilt(() => 0)).toBe(-3);
    expect(randomTilt(() => 0.5)).toBe(0);
    expect(randomTilt(() => 0.9999)).toBeLessThanOrEqual(3);
  });
});
```

`tests/polaroid/placement.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cleanPlacements, clampPlacement, normaliseAngle, newPlacement, MAX_STICKERS } from "@/features/polaroid/lib/placement";
import { pinch, handleDrag } from "@/features/polaroid/lib/gesture";
import { cardRatio } from "@/features/polaroid/lib/card";

const allowed = new Set(["heart", "star"]);
const p = (over = {}) => ({ id: "heart", x: 0.5, y: 0.5, scale: 0.2, rot: 0, ...over });

describe("cleanPlacements (D476)", () => {
  it("accepts up to 8 known stickers", () => {
    expect(cleanPlacements(Array.from({ length: MAX_STICKERS }, () => p()), allowed, 1.2).ok).toBe(true);
  });
  it("refuses 9, an unknown id, a non-number and a non-list", () => {
    expect(cleanPlacements(Array.from({ length: 9 }, () => p()), allowed, 1.2)).toEqual({ ok: false, error: "Use up to 8 stickers." });
    expect(cleanPlacements([p({ id: "ev-gone0000" })], allowed, 1.2).ok).toBe(false);
    expect(cleanPlacements([p({ x: Number.NaN })], allowed, 1.2).ok).toBe(false);
    expect(cleanPlacements("nope", allowed, 1.2).ok).toBe(false);
  });
  it("clamps position, size and angle into the card", () => {
    const r = cleanPlacements([p({ x: 1.4, y: -1, scale: 2, rot: 270 })], allowed, 1.2);
    expect(r).toEqual({ ok: true, stickers: [{ id: "heart", x: 1, y: 0, scale: 0.6, rot: -90 }] });
  });
  it("bounds y by the clamped card ratio of an extreme photo (Review Focus 5)", () => {
    const ratio = cardRatio(1, 4000);
    const r = cleanPlacements([p({ y: 50 })], allowed, ratio);
    expect(r.ok && r.stickers[0].y).toBeCloseTo(ratio, 3);
    expect(ratio).toBeLessThan(2);
  });
});

describe("normaliseAngle", () => {
  it("wraps into −180…180", () => {
    expect(normaliseAngle(270)).toBe(-90);
    expect(normaliseAngle(-190)).toBe(170);
    expect(normaliseAngle(45)).toBe(45);
  });
});

describe("newPlacement and clampPlacement", () => {
  it("drops a new sticker in the middle of the photo, 22% of the card wide", () => {
    // 0.055 + (1.2 − 0.055 − 0.27) / 2 = 0.4925
    expect(newPlacement("star", 1.2)).toEqual({ id: "star", x: 0.5, y: 0.4925, scale: 0.22, rot: 0 });
  });
  it("rounds to four decimals", () => {
    expect(clampPlacement(p({ x: 0.123456 }), 1).x).toBe(0.1235);
  });
});

describe("gestures", () => {
  it("pinch scales by the spread and rotates by the turn", () => {
    const k = pinch([{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 0, y: 0 }, { x: 0, y: 20 }], { scale: 0.2, rot: 10 });
    expect(k.scale).toBeCloseTo(0.4);
    expect(k.rot).toBeCloseTo(100);
  });
  it("the corner handle measures from the sticker's centre", () => {
    const k = handleDrag({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { scale: 0.3, rot: 0 });
    expect(k.scale).toBeCloseTo(0.3);
    expect(k.rot).toBeCloseTo(90);
  });
  it("ignores a pinch that starts with both fingers on one spot", () => {
    expect(pinch([{ x: 5, y: 5 }, { x: 5, y: 5 }], [{ x: 0, y: 0 }, { x: 9, y: 9 }], { scale: 0.2, rot: 0 })).toEqual({ scale: 0.2, rot: 0 });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/polaroid/card.test.ts tests/polaroid/placement.test.ts`
Expected: FAIL. The modules don't exist yet.

- [ ] **Step 3: Implement `lib/card.ts`**

```ts
/**
 * A polaroid's proportions (D483), all as fractions of the card's width so the phone, the LED
 * and admin draw the same card at any size: an even border on the top and sides, the photo box,
 * and a deeper strip at the bottom for the message.
 */
export const CARD = { border: 0.055, strip: 0.27 } as const;
export const PHOTO_INNER = 1 - 2 * CARD.border;

/** D477: the photo box's height ÷ width stops at 16:9 either way; the photo is never cropped. */
export const MIN_PHOTO_RATIO = 9 / 16;
export const MAX_PHOTO_RATIO = 16 / 9;

export function photoBoxRatio(w: number, h: number): number {
  if (!(w > 0 && h > 0)) return 1;
  return Math.min(MAX_PHOTO_RATIO, Math.max(MIN_PHOTO_RATIO, h / w));
}

/** The whole card's height ÷ width. */
export function cardRatio(w: number, h: number): number {
  return CARD.border + PHOTO_INNER * photoBoxRatio(w, h) + CARD.strip;
}

/** The message's size against its base (8.5% of the card width), so 80 characters still fit two lines. */
export function messageScale(length: number): number {
  return length <= 24 ? 1 : length <= 48 ? 0.8 : 0.66;
}

/** D483: a small random tilt, set by the server so every screen shows the same one. */
export function randomTilt(rand: () => number = Math.random): number {
  return Math.round((rand() * 6 - 3) * 100) / 100;
}
```

- [ ] **Step 4: Implement `lib/placement.ts`**

```ts
import { CARD, PHOTO_INNER } from "./card";

/** D476: a sticker on a card, in card widths: centre (x, y), width (scale), angle in degrees. */
export type StickerPlacement = { id: string; x: number; y: number; scale: number; rot: number };

export const MAX_STICKERS = 8;
export const MIN_SCALE = 0.08;
export const MAX_SCALE = 0.6;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function normaliseAngle(deg: number): number {
  const a = ((((deg + 180) % 360) + 360) % 360) - 180;
  return Math.round(a * 10) / 10;
}

/** `ratio` is the card's height ÷ width (`cardRatio`), so y never leaves the card. */
export function clampPlacement(p: StickerPlacement, ratio: number): StickerPlacement {
  return {
    id: p.id,
    x: round4(clamp(p.x, 0, 1)),
    y: round4(clamp(p.y, 0, ratio)),
    scale: round4(clamp(p.scale, MIN_SCALE, MAX_SCALE)),
    rot: normaliseAngle(p.rot),
  };
}

/** Where a sticker lands when tapped in the tray: the middle of the photo, 22% of the card wide. */
export function newPlacement(id: string, ratio: number): StickerPlacement {
  const photoMiddle = CARD.border + (ratio - CARD.border - CARD.strip) / 2;
  return { id, x: 0.5, y: round4(Math.max(PHOTO_INNER / 4, photoMiddle)), scale: 0.22, rot: 0 };
}

export type PlacementCheck = { ok: true; stickers: StickerPlacement[] } | { ok: false; error: string };

const UNREADABLE = "Those stickers could not be read. Try again.";

/** The server's check (D476): at most 8, every id one the tray offers, every number finite, then clamped. */
export function cleanPlacements(raw: unknown, allowed: ReadonlySet<string>, ratio: number): PlacementCheck {
  if (!Array.isArray(raw)) return { ok: false, error: UNREADABLE };
  if (raw.length > MAX_STICKERS) return { ok: false, error: `Use up to ${MAX_STICKERS} stickers.` };
  const stickers: StickerPlacement[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") return { ok: false, error: UNREADABLE };
    const { id, x, y, scale, rot } = r as Record<string, unknown>;
    if (typeof id !== "string" || !allowed.has(id)) return { ok: false, error: "One of those stickers is no longer available. Remove it and try again." };
    if (![x, y, scale, rot].every((n) => typeof n === "number" && Number.isFinite(n))) return { ok: false, error: UNREADABLE };
    stickers.push(clampPlacement({ id, x: x as number, y: y as number, scale: scale as number, rot: rot as number }, ratio));
  }
  return { ok: true, stickers };
}
```

- [ ] **Step 5: Implement `lib/gesture.ts`**

```ts
export type Point = { x: number; y: number };

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const angle = (a: Point, b: Point) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

/** Two fingers (D482): scale by how far apart they moved, rotate by how far the line between them turned. */
export function pinch(start: [Point, Point], now: [Point, Point], base: { scale: number; rot: number }): { scale: number; rot: number } {
  const d0 = dist(start[0], start[1]);
  if (d0 < 1) return base;
  return {
    scale: (base.scale * dist(now[0], now[1])) / d0,
    rot: base.rot + angle(now[0], now[1]) - angle(start[0], start[1]),
  };
}

/** The one-thumb corner handle: a pinch whose first finger is pinned at the sticker's centre. */
export function handleDrag(center: Point, start: Point, now: Point, base: { scale: number; rot: number }): { scale: number; rot: number } {
  return pinch([center, start], [center, now], base);
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run tests/polaroid/card.test.ts tests/polaroid/placement.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git pull --rebase --autostash
git add src/features/polaroid/lib/card.ts src/features/polaroid/lib/placement.ts src/features/polaroid/lib/gesture.ts tests/polaroid/card.test.ts tests/polaroid/placement.test.ts
git commit -m "feat(polaroid): card geometry, sticker placement rules and gesture maths (D476, D477, D483)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Rate limits

**Files:**
- Create: `src/features/polaroid/lib/ratelimit.ts`
- Test: `tests/polaroid/ratelimit.test.ts`

**Interfaces:**
- Produces:
  - `SPACING_MS = 30_000`, `WALKIN_PER_HOUR = 10`, `WALKIN_IP_PER_HOUR = 30`, `HOUR_MS`
  - `type RecentPost = { created_at: string; attendee_id: string | null; client_key: string; ip_hash: string }`
  - `type Poster = { attendeeId: string | null; clientKey: string; ipHash: string }`
  - `waitSeconds(recent: readonly RecentPost[], who: Poster, now: number): number`

- [ ] **Step 1: Write the failing test**

`tests/polaroid/ratelimit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { waitSeconds, HOUR_MS } from "@/features/polaroid/lib/ratelimit";

const NOW = Date.parse("2026-10-11T10:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const post = (msAgo: number, over: Partial<{ attendee_id: string | null; client_key: string; ip_hash: string }> = {}) =>
  ({ created_at: ago(msAgo), attendee_id: null, client_key: "dev-a", ip_hash: "ip-1", ...over });
const walkIn = { attendeeId: null, clientKey: "dev-a", ipHash: "ip-1" };
const portal = { attendeeId: "att-1", clientKey: "dev-z", ipHash: "ip-9" };

describe("waitSeconds (D480)", () => {
  it("lets a first post through", () => {
    expect(waitSeconds([], walkIn, NOW)).toBe(0);
  });
  it("spaces one device's posts 30 s apart", () => {
    expect(waitSeconds([post(10_000)], walkIn, NOW)).toBe(20);
    expect(waitSeconds([post(31_000)], walkIn, NOW)).toBe(0);
  });
  it("spaces one attendee's posts across devices", () => {
    expect(waitSeconds([post(5_000, { attendee_id: "att-1", client_key: "dev-b" })], portal, NOW)).toBe(25);
  });
  it("caps a walk-in device at 10 an hour, freeing a slot when the oldest ages out", () => {
    // Ten posts, the oldest 59 min ago: the next is allowed in 1 min.
    const ten = Array.from({ length: 10 }, (_, i) => post(HOUR_MS - 60_000 - i * 60_000));
    expect(waitSeconds(ten, walkIn, NOW)).toBe(60);
  });
  it("caps one IP's walk-ins at 30 an hour across devices", () => {
    const thirty = Array.from({ length: 30 }, (_, i) => post(HOUR_MS - 120_000 - i * 1000, { client_key: `dev-${i}` }));
    expect(waitSeconds(thirty, { attendeeId: null, clientKey: "dev-new", ipHash: "ip-1" }, NOW)).toBe(120);
  });
  it("does not hold portal attendees to the hourly caps, or count their posts against the IP", () => {
    const many = Array.from({ length: 40 }, (_, i) => post(60_000 + i * 60_000, { attendee_id: `att-${i + 2}`, client_key: `dev-${i}` }));
    expect(waitSeconds(many, portal, NOW)).toBe(0);
    expect(waitSeconds(many, { attendeeId: null, clientKey: "dev-new", ipHash: "ip-1" }, NOW)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run tests/polaroid/ratelimit.test.ts`
Expected: FAIL. The module doesn't exist yet.

- [ ] **Step 3: Implement `lib/ratelimit.ts`**

```ts
/** D480: one post per 30 s per device (and per attendee); walk-ins also 10 an hour per device, 30 per IP. */
export const SPACING_MS = 30_000;
export const WALKIN_PER_HOUR = 10;
export const WALKIN_IP_PER_HOUR = 30;
export const HOUR_MS = 3_600_000;

/** One of the activity's posts from the last hour, removed ones included: a takedown is not a refund. */
export type RecentPost = { created_at: string; attendee_id: string | null; client_key: string; ip_hash: string };
export type Poster = { attendeeId: string | null; clientKey: string; ipHash: string };

/** When `cap` posts already sit in the hour, the next is allowed once the oldest of the last `cap` ages out. */
function capFreesAt(times: number[], cap: number): number {
  if (times.length < cap) return 0;
  const sorted = [...times].sort((a, b) => a - b);
  return sorted[times.length - cap] + HOUR_MS;
}

/** Whole seconds until `who` may post again; 0 is now. */
export function waitSeconds(recent: readonly RecentPost[], who: Poster, now: number): number {
  const at = (p: RecentPost) => Date.parse(p.created_at);
  const inHour = recent.filter((p) => now - at(p) < HOUR_MS);
  const mine = inHour.filter((p) => p.client_key === who.clientKey || (who.attendeeId !== null && p.attendee_id === who.attendeeId));

  let until = mine.length ? Math.max(...mine.map(at)) + SPACING_MS : 0;
  if (who.attendeeId === null) {
    until = Math.max(until, capFreesAt(inHour.filter((p) => p.client_key === who.clientKey).map(at), WALKIN_PER_HOUR));
    until = Math.max(until, capFreesAt(inHour.filter((p) => p.attendee_id === null && p.ip_hash === who.ipHash).map(at), WALKIN_IP_PER_HOUR));
  }
  return Math.max(0, Math.ceil((until - now) / 1000));
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `npx vitest run tests/polaroid/ratelimit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git pull --rebase --autostash
git add src/features/polaroid/lib/ratelimit.ts tests/polaroid/ratelimit.test.ts
git commit -m "feat(polaroid): posting rate limits (D480)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Wall layout and the spotlight queue

The LED's motion is pure maths, so it gets tested here rather than by eye:
- column count
- which column each card joins
- where each card sits on an endless repeat
- where a new card is inserted so nothing on screen moves
- keeping offsets bounded
- the spotlight queue

**Files:**
- Create: `src/features/polaroid/lib/wall-layout.ts`, `src/features/polaroid/lib/spotlight.ts`
- Test: `tests/polaroid/wall-layout.test.ts`, `tests/polaroid/spotlight.test.ts`

**Interfaces:**
- Consumes: `WallSpeed` (Task 3).
- Produces, from `wall-layout.ts`:
  - `autoColumns(w, h)`, `columnCount(setting, w, h)`
  - `assignColumns(items: readonly { id: string; height: number }[], columns: number, gap: number): string[][]`
  - `shortestColumn(heights): number`
  - `type ColumnLayout = { tops: number[]; heights: number[]; cycle: number }`
  - `layoutColumn(heights, gap)`
  - `type Slot = { index: number; repeat: number; y: number }`
  - `visibleSlots(layout, offset, view, buffer): Slot[]`
  - `keepAnchor(prev, next, offset, view, newIndexOf): number`
  - `insertionFor(layout, offset, view, direction: 1 | -1, newHeight, gap): { index; offset }`
  - `rebase(offset, cycle, limit?)`
  - `SPEED_PX`
  - `columnSpeed(speed, column, viewH)`: signed px/s
- Produces, from `spotlight.ts`:
  - `SPOTLIGHT_MS`, `BUSY_SPOTLIGHT_MS`, `BUSY_AT`, `SKIP_BEYOND`
  - `spotlightMs(waiting)`
  - `splitQueue(queue)`
  - `arrivals(prev, next, now)`
  - `pruneQueue(queue, liveIds)`

- [ ] **Step 1: Write the failing tests**

`tests/polaroid/wall-layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  autoColumns, columnCount, assignColumns, shortestColumn, layoutColumn, visibleSlots, keepAnchor, insertionFor, rebase, columnSpeed,
} from "@/features/polaroid/lib/wall-layout";

const items = (hs: number[]) => hs.map((height, i) => ({ id: String.fromCharCode(97 + i), height }));

describe("column count (D484)", () => {
  it("fits the KOM LED and an ordinary TV", () => {
    expect(autoColumns(5504, 2322)).toBe(7);
    expect(autoColumns(1920, 1080)).toBe(5);
  });
  it("never goes under 3 or over 10, and honours an override", () => {
    expect(autoColumns(800, 1080)).toBe(3);
    expect(autoColumns(20000, 1000)).toBe(10);
    expect(autoColumns(0, 0)).toBe(3);
    expect(columnCount(6, 5504, 2322)).toBe(6);
    expect(columnCount("auto", 1920, 1080)).toBe(5);
  });
});

describe("assignColumns", () => {
  it("gives each card, oldest first, to the column with the least content", () => {
    expect(assignColumns(items([100, 100, 100, 300, 100]), 2, 0)).toEqual([["a", "c", "e"], ["b", "d"]]);
  });
  it("repeats cards across columns when there are fewer cards than columns", () => {
    expect(assignColumns(items([100, 100]), 3, 0)).toEqual([["a"], ["b"], ["a"]]);
    expect(assignColumns([], 3, 0)).toEqual([[], [], []]);
  });
  it("keeps every card exactly once whatever the column count (Review Focus 3)", () => {
    const seven = items([120, 90, 200, 150, 110, 130, 170]);
    for (const cols of [3, 5, 7]) {
      expect(assignColumns(seven, cols, 10).flat().sort()).toEqual(seven.map((s) => s.id).sort());
    }
  });
  it("finds the shortest column", () => {
    expect(shortestColumn([300, 120, 120, 400])).toBe(1);
  });
});

describe("visibleSlots", () => {
  const layout = layoutColumn([100, 50], 10);
  it("lays cards out with a gap and a cycle", () => {
    expect(layout).toEqual({ tops: [0, 110], heights: [100, 50], cycle: 170 });
  });
  it("finds what overlaps the window, across the repeat", () => {
    expect(visibleSlots(layout, 150, 100, 0)).toEqual([
      { index: 1, repeat: 0, y: 110 },
      { index: 0, repeat: 1, y: 170 },
    ]);
  });
  it("repeats a short column until it fills the screen", () => {
    expect(visibleSlots(layoutColumn([100], 10), 0, 400, 0).map((s) => s.y)).toEqual([0, 110, 220, 330]);
  });
  it("is empty for an empty column", () => {
    expect(visibleSlots(layoutColumn([], 10), 0, 400, 0)).toEqual([]);
  });
});

describe("insertionFor: nothing on screen moves", () => {
  const layout = layoutColumn([100, 100, 100], 0);
  it("scrolling up, goes in just below the last card on screen", () => {
    expect(insertionFor(layout, 0, 150, 1, 100, 0)).toEqual({ index: 2, offset: 0 });
  });
  it("scrolling down, goes in just above the first card on screen, with the offset carried", () => {
    expect(insertionFor(layout, 0, 150, -1, 100, 0)).toEqual({ index: 0, offset: 100 });
  });
  it("keeps every visible card at the same screen position, wherever the window is", () => {
    for (const [offset, dir] of [[250, 1], [250, -1], [620, 1], [-130, -1]] as const) {
      const { index, offset: next } = insertionFor(layout, offset, 150, dir, 80, 0);
      const heights = [100, 100, 100];
      heights.splice(index, 0, 80);
      const after = layoutColumn(heights, 0);
      const before = visibleSlots(layout, offset, 150, 0).map((s) => s.y - offset);
      const kept = visibleSlots(after, next, 150, 0).filter((s) => s.index !== index).map((s) => s.y - next);
      expect(kept).toEqual(before);
    }
  });
});

describe("keepAnchor", () => {
  it("a removal above the screen shifts the offset by the removed card", () => {
    const prev = layoutColumn([100, 100, 100], 0);
    const next = layoutColumn([100, 100], 0);
    expect(keepAnchor(prev, next, 150, 100, (i) => (i === 0 ? null : i - 1))).toBe(50);
  });
});

describe("rebase (Review Focus 1)", () => {
  it("leaves small offsets alone", () => {
    expect(rebase(500, 300)).toBe(500);
  });
  it("pulls a huge offset back by whole cycles, so the picture is unchanged", () => {
    expect(rebase(2_500_000.5, 300)).toBeCloseTo(100.5);
    expect(rebase(-2_500_000, 300)).toBeCloseTo(-100);
  });
  it("does nothing to an empty column", () => {
    expect(rebase(5_000_000, 0)).toBe(5_000_000);
  });
});

describe("columnSpeed", () => {
  it("alternates direction and scales with the screen height", () => {
    expect(columnSpeed("medium", 0, 1080)).toBe(50);
    expect(columnSpeed("medium", 1, 1080)).toBeCloseTo(-53.5);
    expect(columnSpeed("slow", 0, 2160)).toBe(60);
  });
});
```

`tests/polaroid/spotlight.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { spotlightMs, splitQueue, arrivals, pruneQueue } from "@/features/polaroid/lib/spotlight";

const NOW = Date.parse("2026-10-11T10:00:00Z");
const card = (id: string, secondsAgo = 1) => ({ id, created_at: new Date(NOW - secondsAgo * 1000).toISOString() });

describe("spotlight (D484)", () => {
  it("lasts 6 s, or 3 s while more than 5 wait", () => {
    expect(spotlightMs(0)).toBe(6000);
    expect(spotlightMs(5)).toBe(6000);
    expect(spotlightMs(6)).toBe(3000);
  });
  it("keeps 15 in the queue and sends the rest straight to the columns", () => {
    const q = Array.from({ length: 20 }, (_, i) => i);
    expect(splitQueue(q)).toEqual({ spotlight: q.slice(0, 15), direct: q.slice(15) });
  });
  it("spotlights nothing on the first load", () => {
    expect(arrivals(null, [card("a")], NOW)).toEqual([]);
  });
  it("spotlights only new, recent cards", () => {
    expect(arrivals(new Set(["a"]), [card("a"), card("b"), card("c", 120)], NOW).map((c) => c.id)).toEqual(["b"]);
  });
  it("drops a queued card that was taken down (Review Focus 2)", () => {
    expect(pruneQueue([card("a"), card("b")], new Set(["b"])).map((c) => c.id)).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/polaroid/wall-layout.test.ts tests/polaroid/spotlight.test.ts`
Expected: FAIL. The modules don't exist yet.

- [ ] **Step 3: Implement `lib/wall-layout.ts`**

```ts
import type { WallSpeed } from "./settings";

/** D484: about a third of the screen's height per column: 7 on the 5504×2322 KOM LED, 5 on a 16:9 TV. */
export function autoColumns(width: number, height: number): number {
  if (!(width > 0 && height > 0)) return 3;
  return Math.min(10, Math.max(3, Math.round(width / (height * 0.33))));
}

export function columnCount(setting: "auto" | number, width: number, height: number): number {
  return setting === "auto" ? autoColumns(width, height) : setting;
}

export function shortestColumn(heights: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < heights.length; i++) if (heights[i] < heights[best]) best = i;
  return best;
}

/**
 * Each card, oldest first, to the column with the least content so far. With fewer cards than
 * columns every column still gets one, repeating cards, so a new wall never shows bare columns.
 */
export function assignColumns(items: readonly { id: string; height: number }[], columns: number, gap: number): string[][] {
  if (items.length > 0 && items.length < columns) return Array.from({ length: columns }, (_, c) => [items[c % items.length].id]);
  const ids: string[][] = Array.from({ length: columns }, () => []);
  const filled = Array.from({ length: columns }, () => 0);
  for (const it of items) {
    const c = shortestColumn(filled);
    ids[c].push(it.id);
    filled[c] += it.height + gap;
  }
  return ids;
}

/** One column's cards stacked from 0; `cycle` is one full pass, after which it repeats. */
export type ColumnLayout = { tops: number[]; heights: number[]; cycle: number };

export function layoutColumn(heights: readonly number[], gap: number): ColumnLayout {
  const tops: number[] = [];
  let y = 0;
  for (const h of heights) {
    tops.push(y);
    y += h + gap;
  }
  return { tops, heights: [...heights], cycle: y };
}

/** A card on the endless repeat: which card, which pass, and its top in column coordinates. */
export type Slot = { index: number; repeat: number; y: number };

/** Every slot overlapping [offset − buffer, offset + view + buffer], top to bottom. */
export function visibleSlots(layout: ColumnLayout, offset: number, view: number, buffer: number): Slot[] {
  const { tops, heights, cycle } = layout;
  if (tops.length === 0 || cycle <= 0) return [];
  const from = offset - buffer;
  const to = offset + view + buffer;
  const out: Slot[] = [];
  for (let r = Math.floor(from / cycle) - 1; r * cycle < to; r++) {
    for (let i = 0; i < tops.length; i++) {
      const y = r * cycle + tops[i];
      if (y + heights[i] > from && y < to) out.push({ index: i, repeat: r, y });
    }
  }
  return out;
}

/**
 * The offset that keeps the screen still when a column's cards change: the first card still on
 * screen stays exactly where it was. `newIndexOf` maps an old card to its new index, or null if it
 * went. Everything between that card and the edge of the change keeps its place, so nothing jumps.
 */
export function keepAnchor(prev: ColumnLayout, next: ColumnLayout, offset: number, view: number, newIndexOf: (i: number) => number | null): number {
  const anchor = visibleSlots(prev, offset, view, 0).find((s) => newIndexOf(s.index) !== null);
  if (!anchor || next.cycle <= 0) return offset;
  const j = newIndexOf(anchor.index)!;
  return offset + (anchor.repeat * next.cycle + next.tops[j] - anchor.y);
}

/**
 * D484: where a new card joins a moving column so it arrives from off-screen. Scrolling up, cards
 * enter from below, so it goes in after the last card on screen; scrolling down, before the first.
 */
export function insertionFor(layout: ColumnLayout, offset: number, view: number, direction: 1 | -1, newHeight: number, gap: number): { index: number; offset: number } {
  const n = layout.tops.length;
  const shown = visibleSlots(layout, offset, view, 0);
  if (n === 0 || shown.length === 0) return { index: n, offset };
  const index = direction === 1 ? shown[shown.length - 1].index + 1 : shown[0].index;
  const heights = [...layout.heights];
  heights.splice(index, 0, newHeight);
  const next = layoutColumn(heights, gap);
  return { index, offset: keepAnchor(layout, next, offset, view, (i) => (i >= index ? i + 1 : i)) };
}

/** Review Focus 1: a wall left on all day keeps its offsets small by dropping whole cycles, which moves nothing. */
export function rebase(offset: number, cycle: number, limit = 1_000_000): number {
  if (cycle <= 0 || Math.abs(offset) < limit) return offset;
  return offset - Math.trunc(offset / cycle) * cycle;
}

/** Base px/s on a 1080 px-high screen. */
export const SPEED_PX: Record<WallSpeed, number> = { slow: 30, medium: 50, fast: 80 };
const JITTER = [0, 0.07, -0.05, 0.1, -0.08, 0.03, -0.1, 0.06, -0.02, 0.09];

/** Signed px/s: even columns scroll up (+), odd down (−), each a little off the others (D484). */
export function columnSpeed(speed: WallSpeed, column: number, viewH: number): number {
  const v = SPEED_PX[speed] * (viewH / 1080) * (1 + JITTER[column % JITTER.length]);
  return Math.round((column % 2 === 0 ? v : -v) * 1000) / 1000;
}
```

- [ ] **Step 4: Implement `lib/spotlight.ts`**

```ts
export const SPOTLIGHT_MS = 6000;
export const BUSY_SPOTLIGHT_MS = 3000;
export const BUSY_AT = 5;
export const SKIP_BEYOND = 15;

/** D484: 6 s each, 3 s while more than 5 wait behind it. */
export function spotlightMs(waiting: number): number {
  return waiting > BUSY_AT ? BUSY_SPOTLIGHT_MS : SPOTLIGHT_MS;
}

/** Beyond 15 queued, the rest skip the spotlight and go straight into the columns. */
export function splitQueue<T>(queue: readonly T[]): { spotlight: T[]; direct: T[] } {
  return { spotlight: queue.slice(0, SKIP_BEYOND), direct: queue.slice(SKIP_BEYOND) };
}

const RECENT_MS = 60_000;

/** New cards worth a spotlight: unseen and under a minute old. A first load (prev null) has none. */
export function arrivals<T extends { id: string; created_at: string }>(prev: ReadonlySet<string> | null, next: readonly T[], now: number): T[] {
  if (prev === null) return [];
  return next.filter((c) => !prev.has(c.id) && now - Date.parse(c.created_at) < RECENT_MS);
}

/** Review Focus 2: anything taken down while it waited never reaches the wall. */
export function pruneQueue<T extends { id: string }>(queue: readonly T[], live: ReadonlySet<string>): T[] {
  return queue.filter((c) => live.has(c.id));
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run tests/polaroid/wall-layout.test.ts tests/polaroid/spotlight.test.ts`
Expected: PASS. If the "wherever the window is" loop fails, the bug is in `keepAnchor` or `insertionFor`, not in the test: the test states the requirement.

- [ ] **Step 6: Commit**

```bash
git pull --rebase --autostash
git add src/features/polaroid/lib/wall-layout.ts src/features/polaroid/lib/spotlight.ts tests/polaroid/wall-layout.test.ts tests/polaroid/spotlight.test.ts
git commit -m "feat(polaroid): wall layout, jump-free insertion and the spotlight queue (D484)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Server side — storage, links, queries, identity, posting, contexts and wall state

**Files:**
- Modify: `src/lib/storage.ts`, `src/lib/db/media.ts`, `src/lib/links.ts`, `src/features/domains/routing.ts`
- Create:
  - `src/features/polaroid/lib/post-types.ts`, `lib/post-rules.ts`, `lib/wire.ts`
  - `src/features/polaroid/db/polaroids.ts`, `identity.ts`, `post.ts`, `context.ts`, `wall-state.ts`
  - `src/features/polaroid/client.ts`, `index.ts`
- Test: `tests/polaroid/post-rules.test.ts`, `tests/polaroid/paths.test.ts`, `tests/domains/routing.test.ts` (add one case)

**Interfaces:**
- Consumes: Tasks 3–7 (`readPolaroidSettings`, `stickerTray`, `stickerSources`, `checkMessage`, `cardRatio`, `randomTilt`, `cleanPlacements`, `waitSeconds`, `HOUR_MS`, `StickerPlacement`, `RecentPost`, `WallSpeed`, `WallBackground`).
- Produces (later tasks rely on these exact names):
  - `@/lib/storage`:
    - `POLAROID_BUCKET`, `MAX_POLAROID_BYTES`
    - `polaroidFolder({orgId, eventId, activityId}): string`, which ends in `/`
    - `polaroidPhotoPath(input, id): string`
    - `isOwnPolaroidPath(folder, path): boolean`
    - `ImageKind` gains `"polaroid-sticker" | "polaroid-background"`
  - `@/lib/db/media`: `sweepPolaroidPrefix(prefix)`. `deleteEventFiles` also sweeps `polaroids`.
  - `@/lib/links`: `polaroidWalkinLink(addr, token)`, `polaroidWallLink(base, token)`
  - `lib/post-types.ts`:
    - `PostInput = { path: string; width: number; height: number; message: string; stickers: unknown }`
    - `Refusal = { ok: false; error: string; wait?: number }`
    - `StartResult = { ok: true; path: string; token: string } | Refusal`
    - `PostResult = { ok: true; id: string } | Refusal`
    - `RemoveResult = { ok: true } | { ok: false; error: string }`
  - `lib/post-rules.ts`:
    - `PAUSED`, `OVER`, `LINK_OFF`, `GONE`, `NOT_UPLOADED`, `TOO_BIG`, `BAD_PHOTO`
    - `waitMessage(s)`
    - `refusalFor(event, activity, walkIn): string | null`
    - `photoSize(w, h): { w: number; h: number } | null`
  - `lib/wire.ts`:
    - `CardData = { src: string | null; w: number; h: number; message: string; stickers: StickerPlacement[]; tilt: number }`
    - `WallCard = CardData & { id: string; created_at: string }`
    - `WallState = { now; key; cards: WallCard[]; stickerSrc: Record<string,string>; columns: "auto" | number; speed: WallSpeed; background: WallBackground | null; brand: string | null; qr: string | null; open: boolean }`
  - `db/polaroids.ts`:
    - `PolaroidRow`, `NewPolaroid`
    - `photoUrl(path)`
    - `getPolaroidActivity(id, eventId)`
    - `activityByToken(column, token)`
    - `livePolaroids(activityId)`, `polaroidsForAdmin(activityId)`, `polaroidsForAttendee(attendeeId)`
    - `countLiveByActivity(eventId)`, `countByActivity(activityId)`
    - `recentPosts(activityId, since)`
    - `getPolaroid(id, activityId)`, `insertPolaroid(row)`, `removePolaroid(id, activityId, by)`
    - `createPhotoUpload(path)`, `uploadedSize(path)`, `deletePhotos(paths)`
    - `savePolaroidSettings(activityId, eventId, settings)`
    - `setActivityToken(activityId, eventId, column, token)`
    - `sweepActivityPhotos(orgId, eventId, activityId)`, `purgePolaroids(orgId, eventId)`
  - `post.ts`:
    - `PostContext = { event: Pick<Event,"id"|"org_id"|"status">; activity: Activity; attendeeId: string | null }`
    - `startPolaroid(ctx)`, `postPolaroid(ctx, input)`
  - `context.ts`:
    - `portalContext(slug, token, activityId)`, `walkinContext(slug, publicToken)`
    - `WalkinPage` and `walkinPage(slug, publicToken)`
    - `WallLink` and `wallLinkState(token)`
  - `wall-state.ts`: `wallState(activity, event)`

- [ ] **Step 1: Write the failing tests**

`tests/polaroid/post-rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { refusalFor, photoSize, PAUSED, OVER, LINK_OFF, waitMessage } from "@/features/polaroid/lib/post-rules";

const open = { is_open: true, polaroid: { public: true } };

describe("refusalFor (D478, D481)", () => {
  it("lets an open activity take posts", () => {
    expect(refusalFor({ status: "published" }, open, true)).toBeNull();
    expect(refusalFor({ status: "draft" }, open, false)).toBeNull();
  });
  it("refuses an archived event, a closed activity, and a walk-in when the link is off", () => {
    expect(refusalFor({ status: "archived" }, open, false)).toBe(OVER);
    expect(refusalFor({ status: "published" }, { ...open, is_open: false }, false)).toBe(PAUSED);
    expect(refusalFor({ status: "published" }, { is_open: true, polaroid: { public: false } }, true)).toBe(LINK_OFF);
    expect(refusalFor({ status: "published" }, { is_open: true, polaroid: null }, false)).toBeNull();
  });
});

describe("photoSize", () => {
  it("takes whole pixel sizes from 1 to 4000", () => {
    expect(photoSize(1200, 1600.4)).toEqual({ w: 1200, h: 1600 });
    expect(photoSize(0, 10)).toBeNull();
    expect(photoSize(5000, 10)).toBeNull();
    expect(photoSize("12", 10)).toBeNull();
  });
});

describe("waitMessage", () => {
  it("says how long", () => {
    expect(waitMessage(18)).toBe("You can post again in 18 s.");
  });
});
```

`tests/polaroid/paths.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { polaroidFolder, polaroidPhotoPath, isOwnPolaroidPath } from "@/lib/storage";
import { polaroidWalkinLink, polaroidWallLink } from "@/lib/links";

const where = { orgId: "o1", eventId: "e1", activityId: "a1" };
const uuid = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";

describe("polaroid paths (D474)", () => {
  it("files every photo under its org, event and activity", () => {
    expect(polaroidFolder(where)).toBe("o1/e1/a1/");
    expect(polaroidPhotoPath(where, uuid)).toBe(`o1/e1/a1/${uuid}.jpg`);
  });
  it("accepts only a uuid .jpg directly in the activity's folder", () => {
    const folder = polaroidFolder(where);
    expect(isOwnPolaroidPath(folder, `o1/e1/a1/${uuid}.jpg`)).toBe(true);
    expect(isOwnPolaroidPath(folder, `o1/e1/a2/${uuid}.jpg`)).toBe(false);
    expect(isOwnPolaroidPath(folder, `o1/e1/a1/x/${uuid}.jpg`)).toBe(false);
    expect(isOwnPolaroidPath(folder, `o1/e1/a1/../a2/${uuid}.jpg`)).toBe(false);
    expect(isOwnPolaroidPath(folder, `o1/e1/a1/${uuid}.png`)).toBe(false);
  });
});

describe("polaroid links", () => {
  it("puts the walk-in link on the event's own address when it has one", () => {
    expect(polaroidWalkinLink({ slug: "kom", domain: null }, "abc")).toBe("http://localhost:3000/e/kom/polaroid/abc");
    expect(polaroidWalkinLink({ slug: "kom", domain: "kom.example.com" }, "abc")).toBe("http://kom.example.com:3000/polaroid/abc");
  });
  it("keeps the wall on the app's address", () => {
    expect(polaroidWallLink("https://ecphub.vercel.app", "tok")).toBe("https://ecphub.vercel.app/wall/tok");
  });
});
```

In `tests/domains/routing.test.ts`, add next to the other section cases (copy the style of the existing `register`/`agenda` rewrite case):

```ts
  it("rewrites the polaroid walk-in link on an event's own address (D481)", () => {
    expect(routeEventPath("/polaroid/abc", "kom")).toEqual({ kind: "rewrite", path: "/e/kom/polaroid/abc" });
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/polaroid/post-rules.test.ts tests/polaroid/paths.test.ts tests/domains/routing.test.ts`
Expected: FAIL. The modules and exports are missing, and routing answers `main`.

- [ ] **Step 3: Storage, media, links and routing**

**`src/lib/storage.ts`:**
- Add `| "polaroid-sticker" | "polaroid-background"` to the `ImageKind` union.
- Append:

```ts
/** Polaroid photos (D474). Public read so the LED needs no signed links; the paths are unguessable. */
export const POLAROID_BUCKET = "polaroids";

/** D477: the phone re-encodes far under this; the bucket's own 4 MB cap stands behind it. */
export const MAX_POLAROID_BYTES = 4 * 1024 * 1024;

/** One polaroid activity's folder, with its trailing slash: `<org>/<event>/<activity>/`. */
export function polaroidFolder(input: { orgId: string; eventId: string; activityId: string }): string {
  return `${input.orgId}/${input.eventId}/${input.activityId}/`;
}

/** Where one photo lives. `id` is a uuid the caller supplies, as for every other path builder here. */
export function polaroidPhotoPath(input: { orgId: string; eventId: string; activityId: string }, id: string): string {
  return `${polaroidFolder(input)}${id}.jpg`;
}

const UUID_JPG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;

/** Whether a posted path is one `startPolaroid` could have minted for this activity: a uuid file directly in its folder. */
export function isOwnPolaroidPath(folder: string, path: string): boolean {
  return path.startsWith(folder) && UUID_JPG.test(path.slice(folder.length));
}
```

**`src/lib/db/media.ts`:**
- Import `POLAROID_BUCKET`.
- In `deleteEventFiles`, change the bucket list to `[MEDIA_BUCKET, SUBMISSION_BUCKET, SETUP_BUCKET, POLAROID_BUCKET]`, and change "in all three buckets" in its doc comment to "in all four buckets: … and its polaroid photos".
- Append:

```ts
/** Every polaroid photo under a prefix (D485): one activity's folder when it is deleted, the event's on purge. */
export async function sweepPolaroidPrefix(prefix: string): Promise<void> {
  const paths = await listAllObjectPaths(POLAROID_BUCKET, prefix);
  for (let i = 0; i < paths.length; i += LIST_PAGE) {
    const { error } = await serviceClient().storage.from(POLAROID_BUCKET).remove(paths.slice(i, i + LIST_PAGE));
    if (error) throw error;
  }
}
```

**`src/lib/links.ts`:** append:

```ts
/** The polaroid wall's walk-in composer (D481), on the event's own address when it has one. */
export function polaroidWalkinLink(addr: EventAddress, token: string) {
  return addr.domain ? `${hostUrl(addr.domain)}/polaroid/${token}` : `${appBaseUrl()}/e/${addr.slug}/polaroid/${token}`;
}

/** The LED's polaroid wall (D484). Staff-facing like the display link, so always on the app's own address. */
export function polaroidWallLink(base: string, token: string) {
  return `${base}/wall/${token}`;
}
```

**`src/features/domains/routing.ts`:** add `"polaroid"` to `SECTIONS`.

- [ ] **Step 4: The pure shared types and rules**

`src/features/polaroid/lib/post-types.ts`:

```ts
/** What the composer sends once its photo is in the bucket (D478). */
export type PostInput = { path: string; width: number; height: number; message: string; stickers: unknown };
/** A refusal the composer shows as it is; `wait` is seconds, for the countdown on the button. */
export type Refusal = { ok: false; error: string; wait?: number };
export type StartResult = { ok: true; path: string; token: string } | Refusal;
export type PostResult = { ok: true; id: string } | Refusal;
export type RemoveResult = { ok: true } | { ok: false; error: string };
```

`src/features/polaroid/lib/post-rules.ts`:

```ts
import { readPolaroidSettings } from "./settings";

export const PAUSED = "Posting is paused right now.";
export const OVER = "This event is over.";
export const LINK_OFF = "This link isn't taking posts right now.";
export const GONE = "This page has expired. Reload it and try again.";
export const NOT_UPLOADED = "That photo didn't upload. Try again.";
export const TOO_BIG = "That photo is too big. Try a different photo.";
export const BAD_PHOTO = "That photo can't be opened here. Try a different photo.";

export function waitMessage(seconds: number): string {
  return `You can post again in ${seconds} s.`;
}

/**
 * Why a post is refused before anything else is checked, or null (D478, D481). A draft event is
 * not refused here: organisers test through the portal before publishing, as for bookings. The
 * walk-in page refuses drafts itself, because it is public.
 */
export function refusalFor(event: { status: string }, activity: { is_open: boolean; polaroid?: unknown }, walkIn: boolean): string | null {
  if (event.status === "archived") return OVER;
  if (!activity.is_open) return PAUSED;
  if (walkIn && !readPolaroidSettings(activity.polaroid).public) return LINK_OFF;
  return null;
}

/** The photo's reported size, as whole pixels from 1 to 4000, or null. It only sizes the card. */
export function photoSize(w: unknown, h: unknown): { w: number; h: number } | null {
  if (typeof w !== "number" || typeof h !== "number") return null;
  const rw = Math.round(w);
  const rh = Math.round(h);
  return rw >= 1 && rw <= 4000 && rh >= 1 && rh <= 4000 ? { w: rw, h: rh } : null;
}
```

`src/features/polaroid/lib/wire.ts`:

```ts
import type { StickerPlacement } from "./placement";
import type { WallBackground, WallSpeed } from "./settings";

/** What `PolaroidCard` draws: the photo (null once removed), its pixel size, the message, the stickers and the tilt. */
export type CardData = { src: string | null; w: number; h: number; message: string; stickers: StickerPlacement[]; tilt: number };

export type WallCard = CardData & { id: string; created_at: string };

/** The LED's whole picture (D484). `key` changes whenever anything on it does, for "unchanged" answers. */
export type WallState = {
  now: number;
  key: string;
  cards: WallCard[];
  stickerSrc: Record<string, string>;
  columns: "auto" | number;
  speed: WallSpeed;
  background: WallBackground | null;
  brand: string | null;
  qr: string | null;
  open: boolean;
};
```

- [ ] **Step 5: The queries — `src/features/polaroid/db/polaroids.ts`**

```ts
import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { selectAll } from "@/lib/db/select-all";
import { sweepPolaroidPrefix } from "@/lib/db/media";
import { POLAROID_BUCKET, polaroidFolder } from "@/lib/storage";
import type { Activity } from "@/lib/types";
import type { StickerPlacement } from "../lib/placement";
import type { RecentPost } from "../lib/ratelimit";
import type { PolaroidSettings } from "../lib/settings";

export type PolaroidRow = {
  id: string;
  event_id: string;
  activity_id: string;
  attendee_id: string | null;
  photo_path: string;
  photo_w: number;
  photo_h: number;
  message: string;
  stickers: StickerPlacement[];
  tilt: number;
  status: "live" | "removed";
  removed_by: string | null;
  removed_at: string | null;
  created_at: string;
};

export type NewPolaroid = Pick<PolaroidRow, "event_id" | "activity_id" | "attendee_id" | "photo_path" | "photo_w" | "photo_h" | "message" | "stickers" | "tilt"> & {
  client_key: string;
  ip_hash: string;
};

// Never the client_key or ip_hash: nothing outside the rate limit reads them.
const COLUMNS = "id, event_id, activity_id, attendee_id, photo_path, photo_w, photo_h, message, stickers, tilt, status, removed_by, removed_at, created_at";
const polaroids = () => serviceClient().from("polaroids");
const bucket = () => serviceClient().storage.from(POLAROID_BUCKET);

export function photoUrl(path: string): string {
  return bucket().getPublicUrl(path).data.publicUrl;
}

export async function getPolaroidActivity(id: string, eventId: string): Promise<Activity | null> {
  const { data, error } = await serviceClient().from("activities").select("*").eq("id", id).eq("event_id", eventId).eq("kind", "polaroid").maybeSingle();
  if (error) throw error;
  return (data as Activity | null) ?? null;
}

/** The polaroid activity a wall or walk-in token names (D474). */
export async function activityByToken(column: "wall_token" | "public_token", token: string): Promise<Activity | null> {
  const { data, error } = await serviceClient().from("activities").select("*").eq(column, token).eq("kind", "polaroid").maybeSingle();
  if (error) throw error;
  return (data as Activity | null) ?? null;
}

/** Oldest first: the wall assigns columns in posting order. Paged (D401). */
export async function livePolaroids(activityId: string): Promise<PolaroidRow[]> {
  return selectAll<PolaroidRow>((from, to) => polaroids().select(COLUMNS).eq("activity_id", activityId).eq("status", "live")
    .order("created_at").order("id").range(from, to));
}

/** Newest first, removed ones included, for the moderation feed. */
export async function polaroidsForAdmin(activityId: string): Promise<PolaroidRow[]> {
  return selectAll<PolaroidRow>((from, to) => polaroids().select(COLUMNS).eq("activity_id", activityId)
    .order("created_at", { ascending: false }).order("id").range(from, to));
}

/** An attendee's own live polaroids, newest first, for "Your polaroids". */
export async function polaroidsForAttendee(attendeeId: string): Promise<PolaroidRow[]> {
  const { data, error } = await polaroids().select(COLUMNS).eq("attendee_id", attendeeId).eq("status", "live")
    .order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []) as PolaroidRow[];
}

export async function countLiveByActivity(eventId: string): Promise<Record<string, number>> {
  const rows = await selectAll<{ activity_id: string }>((from, to) => polaroids().select("activity_id").eq("event_id", eventId).eq("status", "live").order("id").range(from, to));
  const out: Record<string, number> = {};
  for (const r of rows) out[r.activity_id] = (out[r.activity_id] ?? 0) + 1;
  return out;
}

export async function countByActivity(activityId: string): Promise<number> {
  const { count, error } = await polaroids().select("id", { count: "exact", head: true }).eq("activity_id", activityId);
  if (error) throw error;
  return count ?? 0;
}

/** The last hour of one activity's posts, for `waitSeconds` (D480). */
export async function recentPosts(activityId: string, since: string): Promise<RecentPost[]> {
  const { data, error } = await polaroids().select("created_at, attendee_id, client_key, ip_hash").eq("activity_id", activityId).gte("created_at", since).limit(5000);
  if (error) throw error;
  return (data ?? []) as RecentPost[];
}

export async function getPolaroid(id: string, activityId: string): Promise<PolaroidRow | null> {
  const { data, error } = await polaroids().select(COLUMNS).eq("id", id).eq("activity_id", activityId).maybeSingle();
  if (error) throw error;
  return (data as PolaroidRow | null) ?? null;
}

/** The new row's id, or null when this photo was already posted (photo_path is unique). */
export async function insertPolaroid(row: NewPolaroid): Promise<string | null> {
  const { data, error } = await polaroids().insert(row).select("id").single();
  if (error?.code === "23505") return null;
  if (error) throw error;
  return (data as { id: string }).id;
}

/**
 * D473: final. The status flips first, so the wall drops it on its next poll even if the file
 * delete fails and has to be retried; then the photo itself goes. False if it was already gone.
 */
export async function removePolaroid(id: string, activityId: string, by: string): Promise<boolean> {
  const { data, error } = await polaroids().update({ status: "removed", removed_by: by, removed_at: new Date().toISOString() })
    .eq("id", id).eq("activity_id", activityId).eq("status", "live").select("photo_path");
  if (error) throw error;
  const row = (data ?? [])[0] as { photo_path: string } | undefined;
  if (!row) return false;
  await deletePhotos([row.photo_path]);
  return true;
}

/** D478: a signed upload URL's token for one fresh path; the browser uploads straight to the bucket. */
export async function createPhotoUpload(path: string): Promise<string> {
  const { data, error } = await bucket().createSignedUploadUrl(path);
  if (error || !data) throw new Error("Could not start the upload. Try again.");
  return data.token;
}

/** The uploaded object's size in bytes, or null if nothing is there. */
export async function uploadedSize(path: string): Promise<number | null> {
  const slash = path.lastIndexOf("/");
  const name = path.slice(slash + 1);
  const { data, error } = await bucket().list(path.slice(0, slash), { search: name, limit: 1 });
  if (error) throw error;
  const hit = (data ?? []).find((o) => o.name === name);
  const size = (hit?.metadata as { size?: unknown } | null | undefined)?.size;
  return typeof size === "number" ? size : null;
}

export async function deletePhotos(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await bucket().remove(paths);
  if (error) throw error;
}

export async function savePolaroidSettings(activityId: string, eventId: string, settings: PolaroidSettings): Promise<void> {
  const { error } = await serviceClient().from("activities").update({ polaroid: settings }).eq("id", activityId).eq("event_id", eventId).eq("kind", "polaroid");
  if (error) throw error;
}

/** Rotation IS the revocation (D108, D252): the old link stops the moment this lands. */
export async function setActivityToken(activityId: string, eventId: string, column: "wall_token" | "public_token", token: string): Promise<void> {
  const { error } = await serviceClient().from("activities").update({ [column]: token }).eq("id", activityId).eq("event_id", eventId).eq("kind", "polaroid");
  if (error) throw error;
}

/** One activity's photos, before its row (and with it, by cascade, its polaroids) is deleted. */
export async function sweepActivityPhotos(orgId: string, eventId: string, activityId: string): Promise<void> {
  await sweepPolaroidPrefix(polaroidFolder({ orgId, eventId, activityId }).slice(0, -1));
}

/** Purge personal data (D485): every photo, then every row. Files first, as the attendee purge does. */
export async function purgePolaroids(orgId: string, eventId: string): Promise<void> {
  await sweepPolaroidPrefix(`${orgId}/${eventId}`);
  const { error } = await polaroids().delete().eq("event_id", eventId);
  if (error) throw error;
}
```

- [ ] **Step 6: Who is posting — `src/features/polaroid/identity.ts`**

Read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md` first. Cookies can be set only in a Server Action or a Route Handler, and this is only ever called from the actions.

```ts
import "server-only";
import { cookies, headers } from "next/headers";
import { createHash, createHmac, randomUUID } from "node:crypto";

const COOKIE = "ecp_polaroid";
const ID = /^[0-9a-f-]{36}$/;

/**
 * D480: the rate limit's two keys. `clientKey` is the sha-256 of a random id this device keeps in a
 * cookie; `ipHash` is an HMAC of the request's IP, keyed with a server secret so the stored value
 * cannot be reversed by trying every address. Neither identifies anyone.
 */
export async function posterKeys(): Promise<{ clientKey: string; ipHash: string }> {
  const jar = await cookies();
  let id = jar.get(COOKIE)?.value;
  if (!id || !ID.test(id)) {
    id = randomUUID();
    jar.set(COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30, path: "/" });
  }
  const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "polaroid";
  return {
    clientKey: createHash("sha256").update(id).digest("hex"),
    ipHash: createHmac("sha256", secret).update(ip).digest("hex"),
  };
}
```

- [ ] **Step 7: Posting — `src/features/polaroid/post.ts`**

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import { MAX_POLAROID_BYTES, isOwnPolaroidPath, polaroidFolder, polaroidPhotoPath } from "@/lib/storage";
import type { Activity, Event } from "@/lib/types";
import { createPhotoUpload, deletePhotos, insertPolaroid, recentPosts, uploadedSize } from "./db/polaroids";
import { posterKeys } from "./identity";
import { cardRatio, randomTilt } from "./lib/card";
import { checkMessage } from "./lib/message";
import { cleanPlacements } from "./lib/placement";
import { HOUR_MS, waitSeconds } from "./lib/ratelimit";
import { readPolaroidSettings } from "./lib/settings";
import { stickerTray } from "./lib/stickers";
import { BAD_PHOTO, NOT_UPLOADED, TOO_BIG, photoSize, refusalFor, waitMessage } from "./lib/post-rules";
import type { PostInput, PostResult, StartResult } from "./lib/post-types";

/** Who is posting where. `attendeeId` null is a walk-in (D481). */
export type PostContext = { event: Pick<Event, "id" | "org_id" | "status">; activity: Activity; attendeeId: string | null };

const where = (ctx: PostContext) => ({ orgId: ctx.event.org_id, eventId: ctx.event.id, activityId: ctx.activity.id });

async function waitFor(ctx: PostContext, keys: { clientKey: string; ipHash: string }): Promise<number> {
  const recent = await recentPosts(ctx.activity.id, new Date(Date.now() - HOUR_MS).toISOString());
  return waitSeconds(recent, { attendeeId: ctx.attendeeId, ...keys }, Date.now());
}

/** D478 step 1: refuse early, before the phone spends its upload, or mint a signed URL for a fresh path. */
export async function startPolaroid(ctx: PostContext): Promise<StartResult> {
  const no = refusalFor(ctx.event, ctx.activity, ctx.attendeeId === null);
  if (no) return { ok: false, error: no };
  const wait = await waitFor(ctx, await posterKeys());
  if (wait > 0) return { ok: false, error: waitMessage(wait), wait };
  const path = polaroidPhotoPath(where(ctx), randomUUID());
  return { ok: true, path, token: await createPhotoUpload(path) };
}

/**
 * D478 step 3: everything again, because the browser can send anything. Then the row. A photo
 * uploaded but never posted stays in the bucket until the event is purged or deleted (D485).
 */
export async function postPolaroid(ctx: PostContext, input: PostInput): Promise<PostResult> {
  const no = refusalFor(ctx.event, ctx.activity, ctx.attendeeId === null);
  if (no) return { ok: false, error: no };
  if (typeof input?.path !== "string" || !isOwnPolaroidPath(polaroidFolder(where(ctx)), input.path)) return { ok: false, error: NOT_UPLOADED };
  const size = photoSize(input.width, input.height);
  if (!size) return { ok: false, error: BAD_PHOTO };

  const settings = readPolaroidSettings(ctx.activity.polaroid);
  const message = checkMessage(typeof input.message === "string" ? input.message : "", settings.blocked_words);
  if (!message.ok) return message;
  const placed = cleanPlacements(input.stickers, new Set(stickerTray(settings).map((s) => s.id)), cardRatio(size.w, size.h));
  if (!placed.ok) return placed;

  const keys = await posterKeys();
  const wait = await waitFor(ctx, keys);
  if (wait > 0) return { ok: false, error: waitMessage(wait), wait };

  const bytes = await uploadedSize(input.path);
  if (bytes === null) return { ok: false, error: NOT_UPLOADED };
  if (bytes > MAX_POLAROID_BYTES) {
    await deletePhotos([input.path]);
    return { ok: false, error: TOO_BIG };
  }

  const id = await insertPolaroid({
    event_id: ctx.event.id, activity_id: ctx.activity.id, attendee_id: ctx.attendeeId,
    photo_path: input.path, photo_w: size.w, photo_h: size.h,
    message: message.message, stickers: placed.stickers, tilt: randomTilt(),
    client_key: keys.clientKey, ip_hash: keys.ipHash,
  });
  return id ? { ok: true, id } : { ok: false, error: "That polaroid is already on the wall." };
}
```

- [ ] **Step 8: Contexts — `src/features/polaroid/context.ts`**

This must not import `@/lib/portal` or `@/features/activities`, because both import this feature and that would create a cycle.

```ts
import "server-only";
import { getEvent, getEventBySlug } from "@/lib/db/events";
import { findByToken } from "@/lib/db/attendees";
import { isValidToken } from "@/lib/tokens";
import { categoryMatches } from "@/lib/agenda";
import { crewLinkLive } from "@/lib/crew";
import { nowInKL } from "@/lib/time";
import { createMemo } from "@/lib/memo";
import type { Activity, Event } from "@/lib/types";
import { activityByToken, getPolaroidActivity } from "./db/polaroids";
import { LINK_OFF, OVER, PAUSED, refusalFor } from "./lib/post-rules";
import type { PostContext } from "./post";

/** A portal attendee posting from their own link (D481). Drafts are allowed, as for bookings. */
export async function portalContext(slug: string, token: string, activityId: string): Promise<PostContext | null> {
  if (!isValidToken(token)) return null;
  const event = await getEventBySlug(slug);
  if (!event) return null;
  const attendee = await findByToken(event.id, token);
  if (!attendee) return null;
  const activity = await getPolaroidActivity(activityId, event.id);
  if (!activity || !categoryMatches(activity.categories, attendee.category)) return null;
  return { event, activity, attendeeId: attendee.id };
}

async function lookupWalkin(slug: string, publicToken: string): Promise<{ event: Event; activity: Activity } | null> {
  if (!isValidToken(publicToken)) return null;
  const event = await getEventBySlug(slug);
  // Public, so a draft is never shown, unlike the portal.
  if (!event || event.status === "draft") return null;
  const activity = await activityByToken("public_token", publicToken);
  if (!activity || activity.event_id !== event.id) return null;
  return { event, activity };
}

export async function walkinContext(slug: string, publicToken: string): Promise<PostContext | null> {
  const found = await lookupWalkin(slug, publicToken);
  return found ? { ...found, attendeeId: null } : null;
}

export type WalkinPage =
  | { kind: "missing" }
  | { kind: "closed"; eventName: string; title: string; body: string }
  | { kind: "open"; eventName: string; activity: Activity };

const CLOSED_BODY: Record<string, string> = {
  [PAUSED]: "The wall is still on screen. Check back soon.",
  [OVER]: "Thanks for being part of it.",
  [LINK_OFF]: "Ask the event team how to share a photo.",
};

/** What the walk-in page shows (D481): the composer, a friendly "not now", or a 404. */
export async function walkinPage(slug: string, publicToken: string): Promise<WalkinPage> {
  const found = await lookupWalkin(slug, publicToken);
  if (!found) return { kind: "missing" };
  const no = refusalFor(found.event, found.activity, true);
  if (no) return { kind: "closed", eventName: found.event.name, title: no, body: CLOSED_BODY[no] ?? "" };
  return { kind: "open", eventName: found.event.name, activity: found.activity };
}

export type WallLink = { event: Event; activity: Activity } | { refused: "missing" | "draft" | "expired" };

// One read per second per instance, however often the wall polls (D259).
const tokenMemo = createMemo<Activity | null>(1000);
const eventMemo = createMemo<Event | null>(1000);

/** D484: gated like the games display: a real token, a published event, not past the crew link's day. */
export async function wallLinkState(token: string): Promise<WallLink> {
  if (!isValidToken(token)) return { refused: "missing" };
  const activity = await tokenMemo.get(token, () => activityByToken("wall_token", token));
  if (!activity) return { refused: "missing" };
  const event = await eventMemo.get(activity.event_id, () => getEvent(activity.event_id));
  if (!event) return { refused: "missing" };
  if (event.status === "draft") return { refused: "draft" };
  if (!crewLinkLive(event, nowInKL().date)) return { refused: "expired" };
  return { event, activity };
}
```

- [ ] **Step 9: The wall's state — `src/features/polaroid/wall-state.ts`**

```ts
import "server-only";
import { createHash } from "node:crypto";
import { createMemo } from "@/lib/memo";
import { qrDataUrl } from "@/lib/qr";
import { polaroidWalkinLink } from "@/lib/links";
import { eventAddress } from "@/features/domains";
import type { Activity, Event } from "@/lib/types";
import { livePolaroids, photoUrl } from "./db/polaroids";
import { readPolaroidSettings } from "./lib/settings";
import { stickerSources } from "./lib/stickers";
import type { WallState } from "./lib/wire";

const stateMemo = createMemo<Omit<WallState, "now">>(1000);
const qrMemo = createMemo<string>(10 * 60_000);

/** D484: the whole wall in one answer, memoised for a second per instance. */
export async function wallState(activity: Activity, event: Pick<Event, "id" | "slug" | "primary_color">): Promise<WallState> {
  const body = await stateMemo.get(activity.id, async () => {
    const settings = readPolaroidSettings(activity.polaroid);
    const rows = await livePolaroids(activity.id);
    const link = settings.public && activity.public_token ? polaroidWalkinLink(await eventAddress(event), activity.public_token) : null;
    const core = {
      cards: rows.map((r) => ({ id: r.id, src: photoUrl(r.photo_path), w: r.photo_w, h: r.photo_h, message: r.message, stickers: r.stickers, tilt: r.tilt, created_at: r.created_at })),
      stickerSrc: stickerSources(settings),
      columns: settings.columns,
      speed: settings.speed,
      background: settings.background,
      brand: event.primary_color,
      qr: link ? await qrMemo.get(link, () => qrDataUrl(link)) : null,
      open: activity.is_open,
    };
    return { ...core, key: createHash("sha1").update(JSON.stringify(core)).digest("base64url").slice(0, 16) };
  });
  return { now: Date.now(), ...body };
}
```

Before relying on it, confirm that `@/features/domains` does not import `@/features/activities` or `@/lib/portal`:

```bash
grep -rn "features/activities\|lib/portal" src/features/domains
```

Expected: no output.

- [ ] **Step 10: Add the polaroid fields to `Activity` and `NewActivity`**

In `src/lib/types.ts`, inside `Activity` (after `reward_message`), add the optional fields:

```ts
  /** Polaroid kind only (D474): the LED wall's link. Rotating it shuts a leaked link. Optional so fixtures need not name it. */
  wall_token?: string | null;
  /** Polaroid kind only (D474): the walk-in composer's link, live only while its settings say `public`. */
  public_token?: string | null;
  /** Polaroid kind only (D475): its settings, always read through `readPolaroidSettings`, which fills every default. */
  polaroid?: Record<string, unknown> | null;
```

Do **not** add `"polaroid"` to `ActivityKind` yet; Task 10 does.

In `src/features/activities/db/activities.ts` `NewActivity`, after `show_leaderboard`, add:

```ts
  /** Polaroid kind only (D474, D475). Left out, the columns' nulls stand. */
  wall_token?: string | null;
  public_token?: string | null;
  polaroid?: Record<string, unknown> | null;
```

- [ ] **Step 11: The barrels**

`src/features/polaroid/client.ts`:

```ts
/**
 * The polaroid wall's client-safe entry (D402, D403): the pure rules and, from Task 9 on, the
 * screens. Code outside this folder imports the feature only from here or from `index.ts`.
 */
export * from "./lib/settings";
export * from "./lib/stickers";
export * from "./lib/message";
export * from "./lib/card";
export * from "./lib/placement";
export * from "./lib/gesture";
export * from "./lib/ratelimit";
export * from "./lib/wall-layout";
export * from "./lib/spotlight";
export * from "./lib/post-rules";
export * from "./lib/post-types";
export * from "./lib/wire";
```

`src/features/polaroid/index.ts`:

```ts
/** The polaroid wall's server entry (D402): everything in `client.ts`, plus its reads, writes and server state. */
export * from "./client";
export * from "./db/polaroids";
export * from "./post";
export * from "./context";
export * from "./wall-state";
```

- [ ] **Step 12: Run every check**

Run: `npx vitest run tests/polaroid tests/domains && npx tsc --noEmit && npm run lint && npm test`
Expected: everything passes.

- [ ] **Step 13: Commit**

```bash
git pull --rebase --autostash
git add src/lib/storage.ts src/lib/db/media.ts src/lib/links.ts src/lib/types.ts src/features/domains/routing.ts src/features/activities/db/activities.ts src/features/polaroid tests/polaroid/post-rules.test.ts tests/polaroid/paths.test.ts tests/domains/routing.test.ts
git commit -m "feat(polaroid): server side — queries, posting, contexts and wall state (D473, D474, D478, D480, D481, D484)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The card, the instant-camera composer and the walk-in page

Deliverable: on a test activity made with SQL, `/e/ecpkom/polaroid/<publicToken>` works end to end:
- the camera
- the eject and develop
- the message
- stickers you can drag, pinch and rotate
- posting
- the rate limit

**Files:**
- Create:
  - `src/features/polaroid/font.ts`, `polaroid.module.css`
  - `components/PolaroidCard.tsx`, `components/Camera.tsx`, `components/StickerLayer.tsx`, `components/StickerTray.tsx`, `components/MessageField.tsx`, `components/PolaroidComposer.tsx`, `components/prepare-photo.ts`
  - `src/features/polaroid/actions.ts`
  - `src/app/e/[slug]/polaroid/[publicToken]/page.tsx`
- Modify: `src/features/polaroid/client.ts`, `src/features/polaroid/index.ts`

**Interfaces:**
- Consumes: Task 8 (`PostInput`, `StartResult`, `PostResult`, `Refusal`, `CardData`, `walkinPage`, `portalContext`, `walkinContext`, `startPolaroid`, `postPolaroid`, `getPolaroid`, `removePolaroid`, `GONE`, `POLAROID_BUCKET`), and Tasks 3 and 5.
- Produces:
  - `handFont` (CSS variable `--font-hand`)
  - `PolaroidCard({ card, width, stickerSrc, developing?, hideMessage?, className?, style?, children? })`
  - `PolaroidComposer({ prompt, stickers, start, post })`
  - server actions:
    - `startPortalPolaroidAction(slug, token, activityId)`
    - `postPortalPolaroidAction(slug, token, activityId, input)`
    - `removeOwnPolaroidAction(slug, token, activityId, polaroidId)`
    - `startWalkinPolaroidAction(slug, publicToken)`
    - `postWalkinPolaroidAction(slug, publicToken, input)`

- [ ] **Step 1: Font and styles**

`src/features/polaroid/font.ts`:

```ts
import { Caveat } from "next/font/google";

/**
 * The handwriting on every polaroid (D482): Caveat, as on the old Digital Wall. `variable` defines
 * --font-hand on whatever element carries `handFont.variable`. Not preloaded: only the composer,
 * the wall and admin's feed draw cards.
 */
export const handFont = Caveat({ subsets: ["latin"], weight: "700", variable: "--font-hand", display: "swap", preload: false });
```

`src/features/polaroid/polaroid.module.css`:

```css
/* D483: the film tone every card is drawn with, never baked into the photo. */
.film { filter: contrast(1.04) saturate(1.06) sepia(0.08) brightness(1.02); }

/* D482: a fresh print comes out pale and develops over 1.5 s, ending on the film tone. */
.develop { animation: develop 1.6s ease-out both; }
@keyframes develop {
  from { filter: sepia(0.35) saturate(0.15) brightness(1.55) contrast(0.6) blur(1.5px); }
  to { filter: contrast(1.04) saturate(1.06) sepia(0.08) brightness(1.02); }
}

.sticker { filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.35)); }

.lensPulse { animation: lensPulse 0.9s ease-in-out infinite; }
@keyframes lensPulse { 50% { opacity: 0.35; } }

.flash { animation: flash 0.6s ease-out; }
@keyframes flash {
  0% { background: #fffbe0; box-shadow: 0 0 60px 30px rgb(255 251 224 / 0.9); }
}
```

- [ ] **Step 2: `components/PolaroidCard.tsx`**

The file has no `"use client"`: it has no state, so server pages (admin, the portal list) and the client composer can both render it.

```tsx
import type { CSSProperties, ReactNode } from "react";
import { handFont } from "../font";
import { CARD, PHOTO_INNER, cardRatio, messageScale, photoBoxRatio } from "../lib/card";
import type { CardData } from "../lib/wire";
import styles from "../polaroid.module.css";

/**
 * One polaroid, drawn from its parts (D472) at any width. The composer, the LED and admin all draw
 * this, so what someone composes is exactly what the wall shows. Every length is a fraction of
 * `width` (D483); stickers whose id is not in `stickerSrc` are skipped (D476).
 */
export function PolaroidCard({ card, width, stickerSrc, developing = false, hideMessage = false, className = "", style, children }: {
  card: CardData;
  width: number;
  stickerSrc: Record<string, string>;
  developing?: boolean;
  hideMessage?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const w = width;
  const border = CARD.border * w;
  const photoH = PHOTO_INNER * w * photoBoxRatio(card.w, card.h);
  const base = w * 0.085;
  return (
    <div className={`${handFont.variable} relative select-none ${className}`}
      style={{ width: w, height: w * cardRatio(card.w, card.h), transform: `rotate(${card.tilt}deg)`, ...style }}>
      <div className="absolute inset-0 bg-[#fdfbf6]" style={{ borderRadius: w * 0.012, boxShadow: `0 ${w * 0.02}px ${w * 0.06}px rgb(0 0 0 / 0.35)` }} />
      <div aria-hidden className="absolute left-1/2 -translate-x-1/2 -rotate-3"
        style={{
          top: -w * 0.03, width: w * 0.26, height: w * 0.075, borderRadius: w * 0.006,
          backgroundColor: "rgba(216, 207, 191, 0.7)",
          backgroundImage: "linear-gradient(105deg, rgba(255,255,255,0.25), rgba(255,255,255,0) 45%, rgba(0,0,0,0.06))",
        }} />
      <div className="absolute overflow-hidden bg-[#ece6da]" style={{ left: border, top: border, width: PHOTO_INNER * w, height: photoH }}>
        {card.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.src} alt="" draggable={false} decoding="async" className={`size-full object-contain ${developing ? styles.develop : styles.film}`} />
        ) : (
          <div className="flex size-full items-center justify-center text-black/40" style={{ fontSize: base * 0.6 }}>Removed</div>
        )}
      </div>
      {!hideMessage && card.message && (
        <p className="absolute inset-x-0 flex items-center justify-center overflow-hidden px-[6%] text-center leading-[1.05] text-[#2b2b2b] [overflow-wrap:anywhere]"
          style={{ top: border + photoH, height: CARD.strip * w, fontFamily: "var(--font-hand)", fontWeight: 700, fontSize: base * messageScale([...card.message].length) }}>
          {card.message}
        </p>
      )}
      {card.stickers.map((s, i) => {
        const src = stickerSrc[s.id];
        if (!src) return null;
        const size = s.scale * w;
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${s.id}-${i}`} src={src} alt="" draggable={false} className={`pointer-events-none absolute object-contain ${styles.sticker}`}
            style={{ left: s.x * w - size / 2, top: s.y * w - size / 2, width: size, height: size, transform: `rotate(${s.rot}deg)` }} />
        );
      })}
      {children}
    </div>
  );
}
```

- [ ] **Step 3: `components/Camera.tsx`**

Its fixed sizes put the film slot's top 300 px below the camera's top. The composer relies on that number (`SLOT_IN_CAMERA`).

```tsx
import styles from "../polaroid.module.css";

const STRIPE = ["#FF3B30", "#FF9500", "#FFCC00", "#4CD964", "#5AC8FA"];

/**
 * The instant camera (D482), after the old Digital Wall's upload screen: tap the lens or the red
 * shutter to take or choose a photo. Fixed size, so the print can eject from its slot.
 */
export function Camera({ onShoot, disabled, flash }: { onShoot: () => void; disabled: boolean; flash: boolean }) {
  return (
    <div className="relative w-[300px] rounded-[40px] border-b-8 border-gray-300 bg-[#f3f3f3] px-6 pb-4 pt-7 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)]">
      <div className="mb-5 flex h-12 items-start justify-between px-2">
        <div className={`relative h-12 w-24 overflow-hidden rounded-xl border-2 border-gray-600 bg-gray-800 ${flash ? styles.flash : ""}`}>
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent" />
        </div>
        <div className="flex size-12 items-center justify-center rounded-xl border-2 border-gray-700 bg-[#1a1a1a]">
          <div className="size-4 rounded-full bg-black/50 blur-sm" />
        </div>
      </div>
      <div className="relative flex h-40 justify-center">
        <div aria-hidden className="absolute left-1/2 top-full z-0 flex h-14 w-6 -translate-x-1/2">
          {STRIPE.map((c) => <div key={c} className="flex-1" style={{ background: c }} />)}
        </div>
        <button type="button" onClick={onShoot} disabled={disabled} aria-label="Take or choose a photo"
          className="relative z-10 flex size-40 items-center justify-center rounded-full border-[6px] border-[#2a2a2a] bg-[#1a1a1a] shadow-xl transition-transform active:scale-95 disabled:cursor-default">
          <span className="relative flex size-32 items-center justify-center overflow-hidden rounded-full border border-gray-800 bg-black">
            <span className="absolute right-6 top-6 h-4 w-8 rotate-45 rounded-full bg-white/10 blur-md" />
            <span className="flex size-24 items-center justify-center rounded-full border border-gray-800 bg-[#0a0a0a]">
              <span className="size-10 rounded-full bg-[#151515] shadow-inner" />
            </span>
            {!disabled && <span className={`absolute text-[10px] font-bold tracking-widest text-white ${styles.lensPulse}`}>TAP TO SNAP</span>}
          </span>
        </button>
        <button type="button" onClick={onShoot} disabled={disabled} aria-label="Shutter"
          className="absolute bottom-0 right-1 z-20 size-16 translate-y-1/2 rounded-full border-[6px] border-white bg-[#ff3b30] shadow-lg active:scale-95" />
      </div>
      <div className="relative z-30 mx-auto mt-11 h-4 w-[260px] rounded-lg border-b border-zinc-700 bg-[#1a1a1a] shadow-inner" />
    </div>
  );
}
```

- [ ] **Step 4: `components/prepare-photo.ts`**

```ts
import { fitWithin } from "@/lib/shrink-image";
import { MAX_POLAROID_BYTES } from "@/lib/storage";
import { BAD_PHOTO, TOO_BIG } from "../lib/post-rules";

/** D477: every polaroid photo is re-encoded to this long edge. */
export const POLAROID_EDGE = 1600;

/**
 * The photo as a JPEG no longer than 1600 px, with its EXIF rotation applied (createImageBitmap
 * does that) and its final pixel size. Unlike `shrinkImage` it always re-encodes, so what is
 * uploaded is always small and upright. Throws the sentence the composer shows.
 */
export async function preparePhoto(file: File): Promise<{ file: File; width: number; height: number }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(BAD_PHOTO);
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, POLAROID_EDGE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(BAD_PHOTO);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error(BAD_PHOTO);
  if (blob.size > MAX_POLAROID_BYTES) throw new Error(TOO_BIG);
  return { file: new File([blob], "polaroid.jpg", { type: "image/jpeg" }), width, height };
}
```

- [ ] **Step 5: `components/StickerLayer.tsx`**

Gestures are tracked on `window`, so a second finger landing anywhere joins the pinch. The layer itself ignores pointers, so the message field underneath stays tappable. Only the stickers take pointers.

```tsx
"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { clampPlacement, type StickerPlacement } from "../lib/placement";
import { handleDrag, pinch, type Point } from "../lib/gesture";
import styles from "../polaroid.module.css";

type Gesture = { index: number; mode: "move" | "handle"; base: StickerPlacement; start: Map<number, Point>; origin: DOMRect };

/** The composer's editable stickers (D482): drag, pinch to scale and rotate, a corner handle for one thumb, × to remove. */
export function StickerLayer({ placed, onChange, selected, onSelect, width, ratio, srcs }: {
  placed: StickerPlacement[];
  onChange: (next: StickerPlacement[]) => void;
  selected: number | null;
  onSelect: (index: number | null) => void;
  width: number;
  ratio: number;
  srcs: Record<string, string>;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const live = useRef(new Map<number, Point>());
  const latest = useRef(placed);
  useEffect(() => { latest.current = placed; }, [placed]);

  useEffect(() => {
    const at = (e: PointerEvent, origin: DOMRect): Point => ({ x: e.clientX - origin.left, y: e.clientY - origin.top });
    const restart = (g: Gesture) => {
      g.base = latest.current[g.index];
      g.start = new Map(live.current);
    };
    const move = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || !live.current.has(e.pointerId)) return;
      e.preventDefault();
      live.current.set(e.pointerId, at(e, g.origin));
      const ids = [...live.current.keys()];
      let next: StickerPlacement;
      if (g.mode === "handle") {
        const centre = { x: g.base.x * width, y: g.base.y * width };
        next = { ...g.base, ...handleDrag(centre, g.start.get(ids[0])!, live.current.get(ids[0])!, g.base) };
      } else if (ids.length >= 2 && g.start.has(ids[0]) && g.start.has(ids[1])) {
        next = { ...g.base, ...pinch([g.start.get(ids[0])!, g.start.get(ids[1])!], [live.current.get(ids[0])!, live.current.get(ids[1])!], g.base) };
      } else {
        const from = g.start.get(ids[0]);
        const to = live.current.get(ids[0]);
        if (!from || !to) return;
        next = { ...g.base, x: g.base.x + (to.x - from.x) / width, y: g.base.y + (to.y - from.y) / width };
      }
      const list = [...latest.current];
      list[g.index] = clampPlacement(next, ratio);
      onChange(list);
    };
    // A second finger anywhere on the screen turns a drag into a pinch.
    const down = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || g.mode !== "move" || live.current.has(e.pointerId) || live.current.size !== 1) return;
      live.current.set(e.pointerId, at(e, g.origin));
      restart(g);
    };
    const up = (e: PointerEvent) => {
      if (!live.current.delete(e.pointerId)) return;
      const g = gesture.current;
      if (!g) return;
      if (live.current.size === 0) gesture.current = null;
      else restart(g);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [width, ratio, onChange]);

  const begin = (e: React.PointerEvent, index: number, mode: Gesture["mode"]) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect(index);
    const origin = layer.current!.getBoundingClientRect();
    live.current = new Map([[e.pointerId, { x: e.clientX - origin.left, y: e.clientY - origin.top }]]);
    gesture.current = { index, mode, base: latest.current[index], start: new Map(live.current), origin };
  };

  return (
    <div ref={layer} className="pointer-events-none absolute inset-0">
      {placed.map((s, i) => {
        const src = srcs[s.id];
        if (!src) return null;
        const size = s.scale * width;
        return (
          <div key={i} data-sticker className="pointer-events-auto absolute" onPointerDown={(e) => begin(e, i, "move")}
            style={{ left: s.x * width - size / 2, top: s.y * width - size / 2, width: size, height: size, transform: `rotate(${s.rot}deg)`, touchAction: "none" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" draggable={false} className={`size-full object-contain ${styles.sticker}`} />
            {i === selected && (
              <>
                <span className="pointer-events-none absolute -inset-1 rounded border-2 border-dashed border-white" />
                <button type="button" aria-label="Remove sticker" onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => { onChange(placed.filter((_, j) => j !== i)); onSelect(null); }}
                  className="absolute -right-3 -top-3 flex size-7 items-center justify-center rounded-full bg-black text-white shadow">
                  <X className="size-4" />
                </button>
                <span role="button" aria-label="Resize or rotate" onPointerDown={(e) => begin(e, i, "handle")}
                  className="absolute -bottom-3 -right-3 size-7 rounded-full border-2 border-black bg-white shadow" style={{ touchAction: "none" }} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: `components/StickerTray.tsx` and `components/MessageField.tsx`**

```tsx
"use client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { StickerDef } from "../lib/stickers";

/** One tray (D482): the event's own stickers first, then the built-ins, no tabs. */
export function StickerTray({ open, onOpenChange, stickers, onPick }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stickers: StickerDef[];
  onPick: (id: string) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[70dvh] overflow-y-auto">
        <SheetHeader><SheetTitle>Stickers</SheetTitle></SheetHeader>
        <div className="grid grid-cols-4 gap-3 px-4 pb-6 sm:grid-cols-6">
          {stickers.map((s) => (
            <button key={s.id} type="button" aria-label={s.name} onClick={() => onPick(s.id)}
              className="flex aspect-square items-center justify-center rounded-xl bg-muted p-2 transition-transform active:scale-95">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.src} alt="" className="size-full object-contain" />
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

```tsx
"use client";
import { CARD, messageScale } from "../lib/card";
import { MAX_MESSAGE, messageLength } from "../lib/message";

/** The message, typed straight onto the card's strip in the handwriting it will appear in (D482). */
export function MessageField({ width, ratio, value, onChange, disabled }: {
  width: number;
  ratio: number;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <textarea value={value} disabled={disabled} rows={2} aria-label="Message" placeholder="Write a message…"
      onChange={(e) => {
        const v = e.target.value.replace(/\n/g, " ");
        if (messageLength(v) <= MAX_MESSAGE) onChange(v);
      }}
      className="absolute inset-x-[6%] resize-none bg-transparent text-center leading-[1.05] text-[#2b2b2b] outline-none placeholder:text-black/25"
      style={{
        top: width * (ratio - CARD.strip) + width * 0.02,
        height: width * (CARD.strip - 0.04),
        fontFamily: "var(--font-hand)",
        fontWeight: 700,
        fontSize: width * 0.085 * messageScale(messageLength(value)),
      }} />
  );
}
```

- [ ] **Step 7: `components/PolaroidComposer.tsx`**

```tsx
"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { browserStorage } from "@/lib/supabase/browser";
import { POLAROID_BUCKET } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { handFont } from "../font";
import { cardRatio } from "../lib/card";
import { checkMessage, MAX_MESSAGE, messageLength } from "../lib/message";
import { MAX_STICKERS, newPlacement, type StickerPlacement } from "../lib/placement";
import type { StickerDef } from "../lib/stickers";
import type { PostInput, PostResult, Refusal, StartResult } from "../lib/post-types";
import { Camera } from "./Camera";
import { MessageField } from "./MessageField";
import { PolaroidCard } from "./PolaroidCard";
import { StickerLayer } from "./StickerLayer";
import { StickerTray } from "./StickerTray";
import { preparePhoto } from "./prepare-photo";

type Stage = "camera" | "ejecting" | "editing" | "posting" | "posted";
type Photo = { file: File; url: string; width: number; height: number };

const EJECT_MS = 1300;
/** Where the camera sits, and its film slot within it (Camera's fixed sizes). */
const CAMERA_TOP = 112;
const SLOT_IN_CAMERA = 300;
const SLOT_Y = CAMERA_TOP + SLOT_IN_CAMERA;
const PRINT_TOP = 16;

const onResize = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};
const fitWidth = () => Math.min(340, window.innerWidth - 48);

/**
 * The instant-camera composer (D482), for portal attendees and walk-ins alike: snap or choose a
 * photo, the print ejects and develops, write on it, decorate it, post it. `start` and `post` are
 * server actions bound to who is posting; everything they refuse is shown as it is said.
 */
export function PolaroidComposer({ prompt, stickers, start, post }: {
  prompt: string;
  stickers: StickerDef[];
  start: () => Promise<StartResult>;
  post: (input: PostInput) => Promise<PostResult>;
}) {
  const router = useRouter();
  const width = useSyncExternalStore(onResize, fitWidth, () => 320);
  const [stage, setStage] = useState<Stage>("camera");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [message, setMessage] = useState("");
  const [placed, setPlaced] = useState<StickerPlacement[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => { timers.current.forEach((t) => clearTimeout(t)); }, []);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);
  useEffect(() => {
    if (retryAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [retryAt]);

  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  const wait = retryAt === null ? 0 : Math.max(0, Math.ceil((retryAt - now) / 1000));
  const srcs = Object.fromEntries(stickers.map((s) => [s.id, s.src]));
  const ratio = photo ? cardRatio(photo.width, photo.height) : 1.2;
  const cardH = width * ratio;
  const editing = stage === "editing" || stage === "posting";
  const controlsTop = PRINT_TOP + cardH + 28;

  const reset = () => {
    setPhoto(null); setMessage(""); setPlaced([]); setSelected(null); setError(null); setTrayOpen(false); setStage("camera");
  };

  const pick = async (file: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!file) return;
    setError(null);
    try {
      const p = await preparePhoto(file);
      setPhoto({ ...p, url: URL.createObjectURL(p.file) });
      setStage("ejecting");
      later(() => setStage("editing"), EJECT_MS);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const refused = (r: Refusal) => {
    setError(r.error);
    if (r.wait) {
      setRetryAt(Date.now() + r.wait * 1000);
      setNow(Date.now());
    }
    setStage("editing");
  };

  const send = async () => {
    if (!photo || wait > 0) return;
    const check = checkMessage(message);
    if (!check.ok) { setError(check.error); return; }
    setError(null); setSelected(null); setRetryAt(null); setStage("posting");
    try {
      const s = await start();
      if (!s.ok) return refused(s);
      const { error: upload } = await browserStorage().storage.from(POLAROID_BUCKET)
        .uploadToSignedUrl(s.path, s.token, photo.file, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (upload) return refused({ ok: false, error: "That photo didn't upload. Check your connection and try again." });
      const r = await post({ path: s.path, width: photo.width, height: photo.height, message: check.message, stickers: placed });
      if (!r.ok) return refused(r);
      setStage("posted");
      router.refresh();
      later(reset, 2600);
    } catch {
      refused({ ok: false, error: "Something went wrong. Check your connection and try again." });
    }
  };

  const addSticker = (id: string) => {
    setTrayOpen(false);
    if (placed.length >= MAX_STICKERS) { setError(`Use up to ${MAX_STICKERS} stickers.`); return; }
    setPlaced([...placed, newPlacement(id, ratio)]);
    setSelected(placed.length);
  };

  const card = photo ? { src: photo.url, w: photo.width, h: photo.height, message, stickers: editing ? [] : placed, tilt: 0 } : null;

  return (
    <section
      className={`${handFont.variable} relative overflow-hidden rounded-3xl bg-zinc-950 px-4 text-white`}
      style={{ minHeight: editing ? controlsTop + 190 : CAMERA_TOP + 440 }}
      onPointerDown={(e) => { if (!(e.target as HTMLElement).closest("[data-sticker]")) setSelected(null); }}>
      <p className="absolute inset-x-4 top-8 flex h-[72px] -rotate-2 items-center justify-center text-center text-4xl transition-opacity duration-500"
        style={{ fontFamily: "var(--font-hand)", fontWeight: 700, opacity: editing ? 0 : 1 }}>
        {stage === "posted" ? "It's on the wall!" : prompt}
      </p>

      <motion.div className="absolute left-1/2" style={{ top: CAMERA_TOP, marginLeft: -150 }}
        animate={stage === "camera" || stage === "posted" ? { opacity: 1, scale: 1, filter: "blur(0px)" } : { opacity: 0.3, scale: 0.92, filter: "blur(4px)" }}
        transition={{ duration: 0.8 }}>
        <Camera onShoot={() => input.current?.click()} disabled={stage !== "camera"} flash={stage === "ejecting"} />
      </motion.div>

      <AnimatePresence>
        {card && stage !== "posted" && (
          <motion.div key="print" className="absolute z-20" style={{ left: `calc(50% - ${width / 2}px)`, width }}
            initial={{ top: SLOT_Y }} animate={{ top: stage === "ejecting" ? SLOT_Y : PRINT_TOP }}
            exit={{ top: -cardH - 80, rotate: 8, opacity: 0, transition: { duration: 0.7, ease: "easeIn" } }}
            transition={{ duration: 0.7, ease: "easeOut" }}>
            {/* While ejecting, everything above the slot is clipped, so the print slides out of it. */}
            <div className={stage === "ejecting" ? "overflow-hidden" : ""} style={{ height: cardH + 24 }}>
              <motion.div initial={{ y: -cardH }} animate={{ y: 0 }} transition={{ duration: EJECT_MS / 1000, ease: [0.22, 1, 0.36, 1] }}>
                <PolaroidCard card={card} width={width} stickerSrc={srcs} developing hideMessage={editing}>
                  {editing && (
                    <>
                      <MessageField width={width} ratio={ratio} value={message} onChange={setMessage} disabled={stage === "posting"} />
                      <StickerLayer placed={placed} onChange={setPlaced} selected={selected} onSelect={setSelected} width={width} ratio={ratio} srcs={srcs} />
                    </>
                  )}
                </PolaroidCard>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {editing && (
        <div className="absolute inset-x-4 z-30 flex flex-col items-center gap-3" style={{ top: controlsTop }}>
          {error && <p role="alert" className="w-full max-w-[340px] rounded-lg bg-red-500/15 px-3 py-2 text-center text-sm text-red-100">{error}</p>}
          <div className="flex w-full max-w-[340px] justify-between text-xs text-white/60">
            <span>{messageLength(message)}/{MAX_MESSAGE}</span>
            <span>{placed.length}/{MAX_STICKERS} stickers</span>
          </div>
          <div className="flex w-full max-w-[340px] gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setTrayOpen(true)} disabled={stage === "posting"}>Stickers</Button>
            <Button type="button" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={reset} disabled={stage === "posting"}>Cancel</Button>
          </div>
          <Button type="button" size="lg" className="w-full max-w-[340px]" onClick={() => void send()} disabled={stage === "posting" || wait > 0}>
            {stage === "posting" ? "Posting…" : wait > 0 ? `You can post again in ${wait} s` : "Post to wall"}
          </Button>
        </div>
      )}
      {!editing && error && (
        <p role="alert" className="absolute inset-x-4 z-30 text-center text-sm text-red-200" style={{ top: CAMERA_TOP + 390 }}>{error}</p>
      )}

      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      <StickerTray open={trayOpen} onOpenChange={setTrayOpen} stickers={stickers} onPick={addSticker} />
    </section>
  );
}
```

- [ ] **Step 8: The server actions — `src/features/polaroid/actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { portalContext, walkinContext } from "./context";
import { getPolaroid, removePolaroid } from "./db/polaroids";
import { postPolaroid, startPolaroid } from "./post";
import { GONE } from "./lib/post-rules";
import type { PostInput, PostResult, RemoveResult, StartResult } from "./lib/post-types";

// Returns, never redirects: the composer is mid-flow and must keep the photo, text and stickers.
const portalPath = (slug: string, token: string, activityId: string) => `/e/${slug}/a/${token}/activities/${activityId}`;

export async function startPortalPolaroidAction(slug: string, token: string, activityId: string): Promise<StartResult> {
  const ctx = await portalContext(slug, token, activityId);
  return ctx ? startPolaroid(ctx) : { ok: false, error: GONE };
}

export async function postPortalPolaroidAction(slug: string, token: string, activityId: string, input: PostInput): Promise<PostResult> {
  const ctx = await portalContext(slug, token, activityId);
  if (!ctx) return { ok: false, error: GONE };
  const r = await postPolaroid(ctx, input);
  if (r.ok) revalidatePath(portalPath(slug, token, activityId));
  return r;
}

/** D482: an attendee takes their own polaroid down. Works while posting is paused, too. */
export async function removeOwnPolaroidAction(slug: string, token: string, activityId: string, polaroidId: string): Promise<RemoveResult> {
  const ctx = await portalContext(slug, token, activityId);
  if (!ctx) return { ok: false, error: GONE };
  const row = await getPolaroid(polaroidId, ctx.activity.id);
  if (!row || row.attendee_id !== ctx.attendeeId || row.status !== "live") return { ok: false, error: "That polaroid is already gone." };
  await removePolaroid(row.id, ctx.activity.id, "self");
  revalidatePath(portalPath(slug, token, activityId));
  return { ok: true };
}

export async function startWalkinPolaroidAction(slug: string, publicToken: string): Promise<StartResult> {
  const ctx = await walkinContext(slug, publicToken);
  return ctx ? startPolaroid(ctx) : { ok: false, error: GONE };
}

export async function postWalkinPolaroidAction(slug: string, publicToken: string, input: PostInput): Promise<PostResult> {
  const ctx = await walkinContext(slug, publicToken);
  return ctx ? postPolaroid(ctx, input) : { ok: false, error: GONE };
}
```

- [ ] **Step 9: Barrels**

Append to `src/features/polaroid/client.ts`:

```ts

// The screens.
export { handFont } from "./font";
export { PolaroidCard } from "./components/PolaroidCard";
export { PolaroidComposer } from "./components/PolaroidComposer";
```

Append to `src/features/polaroid/index.ts`:

```ts
export * from "./actions";
```

- [ ] **Step 10: The walk-in page — `src/app/e/[slug]/polaroid/[publicToken]/page.tsx`**

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Activity } from "@/lib/types";
import {
  walkinPage, readPolaroidSettings, stickerTray, PolaroidComposer, startWalkinPolaroidAction, postWalkinPolaroidAction,
} from "@/features/polaroid";

// Never cached: whether the link is on, and whether posting is paused, can change at any moment.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Polaroid wall", robots: { index: false, follow: false } };

/** The wall's QR lands here (D481): no login, posts are anonymous. */
export default async function WalkinPolaroidPage({ params }: { params: Promise<{ slug: string; publicToken: string }> }) {
  const { slug, publicToken } = await params;
  const page = await walkinPage(slug, publicToken);
  if (page.kind === "missing") notFound();
  return (
    <main className="min-h-dvh bg-zinc-950 px-4 py-6 text-white">
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-white/50">{page.eventName}</p>
        {page.kind === "closed"
          ? <Closed title={page.title} body={page.body} />
          : <Composer activity={page.activity} slug={slug} publicToken={publicToken} />}
      </div>
    </main>
  );
}

function Closed({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-3xl bg-white/5 p-8 text-center">
      <h1 className="text-xl font-extrabold">{title}</h1>
      <p className="mt-2 text-white/70">{body}</p>
    </div>
  );
}

function Composer({ activity, slug, publicToken }: { activity: Activity; slug: string; publicToken: string }) {
  const settings = readPolaroidSettings(activity.polaroid);
  return (
    <PolaroidComposer prompt={settings.prompt} stickers={stickerTray(settings)}
      start={startWalkinPolaroidAction.bind(null, slug, publicToken)}
      post={postWalkinPolaroidAction.bind(null, slug, publicToken)} />
  );
}
```

- [ ] **Step 11: Static checks**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: everything passes.
- If lint flags `react-hooks/set-state-in-effect` or `react-hooks/refs` in `StickerLayer` or `PolaroidComposer`, move the flagged write into an event handler or a callback ref. Don't disable the rule.
- `latest.current` is written only inside an effect, and `setNow` only inside an interval callback, so neither rule should fire.

- [ ] **Step 12: Make a test activity on `ecpkom` and check it in a browser**

1. Load the Supabase MCP tools from Global Constraints and run `execute_sql`:

   ```sql
   select status from events where slug = 'ecpkom';
   insert into activities (org_id, event_id, name, kind, required, is_open, max_per_attendee, questions, per_day, wall_token, public_token, polaroid, sort_order)
   select org_id, id, 'Polaroid test (plan Task 9)', 'polaroid', false, true, null, '[]'::jsonb, false, 'wazt9tesgh22', 'pubt9tesgh23', '{"public": true}'::jsonb, 999
   from events where slug = 'ecpkom'
   returning id;
   ```

   - If the status is `draft`, the walk-in page 404s by design. Skip to Task 10 and do this check through the portal there instead.
   - Never publish `ecpkom` from here.
   - If `questions` is not `jsonb`, match the column's type from `information_schema.columns`.

2. Start the dev server with `preview_start` `{name: "dev"}`. Load the Playwright MCP tools with ToolSearch: `select:mcp__plugin_playwright_playwright__browser_navigate,mcp__plugin_playwright_playwright__browser_resize,mcp__plugin_playwright_playwright__browser_click,mcp__plugin_playwright_playwright__browser_file_upload,mcp__plugin_playwright_playwright__browser_take_screenshot,mcp__plugin_playwright_playwright__browser_snapshot,mcp__plugin_playwright_playwright__browser_type`. They can upload a file; the built-in browser pane cannot.

3. Resize to 390×844 and open `http://localhost:3000/e/ecpkom/polaroid/pubt9tesgh23`, then check each item below:

   - **Camera:** the camera shows with "Share the moment!" above it.
   - **Upload:** click the lens, then `browser_file_upload` any PNG or JPEG in the repo (find one with Glob `src/app/*.png`).
   - **Eject:** the print slides out of the slot, then rises, and the camera dims.
   - **Slot position:** if the print does not emerge exactly at the slot, adjust `SLOT_IN_CAMERA` to the slot's measured offset (`getBoundingClientRect` via `javascript_tool`) and note the new number in the commit.
   - **Message:** type "Hello KOM" in the strip. It appears in Caveat.
   - **Stickers:** open the tray, add two stickers, then:
     - drag one
     - drag its corner handle to rotate and resize it
     - remove one with ×
   - **Post:** post it. The card flies off, "It's on the wall!" appears, and the camera returns.
   - **Rate limit:** post again at once. The button shows "You can post again in N s" and counts down.
   - **Profanity:** post "babi" after the wait. The friendly rejection appears, and the photo and stickers are still there.
   - **Saved row:** `execute_sql`: `select message, jsonb_array_length(stickers), photo_w, photo_h from polaroids where activity_id = '<id>'`. Expect one row, "Hello KOM", 1 sticker, and a long edge of at most 1600.
   - **Screenshot:** take one of the editing stage and one of the posted stage.

- [ ] **Step 13: Commit**

```bash
git pull --rebase --autostash
git add src/features/polaroid "src/app/e/[slug]/polaroid"
git commit -m "feat(polaroid): instant-camera composer, card and walk-in page (D472, D477, D481, D482, D483)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Leave the test activity in place: Tasks 10–13 use it.

---

### Task 10: Wire `polaroid` in as the fourth activity kind

Adding `"polaroid"` to `ActivityKind` breaks the build at every exhaustive site (D414–D420). This task fills each one. Afterwards an admin can add a polaroid wall from New activity, and attendees see it in their portal and post from it.

**Files:**
- Modify: `src/lib/types.ts`
- Modify, in `src/features/activities/`:
  - `kinds/meta.ts`, `kinds/settings.ts`
  - `tabs.ts`, `row.ts`, `cards.ts`
  - `lib/activity-card.ts`, `lib/portal-activity-entries.ts`
  - `admin/ActivityDetailPage.tsx`, `admin/ActivityMenu.tsx`, `admin/actions.ts`
  - `portal/ActivityPage.tsx`
- Modify: `src/features/catalogue/catalogue.ts`, `src/app/admin/events/[id]/activities/page.tsx`
- Create:
  - `src/features/activities/kinds/polaroid/settings.ts`
  - `src/features/activities/kinds/polaroid/PolaroidDetail.tsx` (Setup only; Task 11 finishes it)
  - `src/features/activities/kinds/polaroid/PolaroidBody.tsx`
  - `src/features/polaroid/components/YourPolaroids.tsx`
- Test: `tests/activities/kinds.test.ts`, `tests/activities/row.test.ts`, `tests/activities/activity-card.test.ts`, `tests/catalogue/catalogue.test.ts`, `tests/activities/settings.test.ts`

**Interfaces:**
- Consumes:
  - Task 8: `polaroidsForAttendee`, `PolaroidRow`, `photoUrl`, `countLiveByActivity`, `countByActivity`, `sweepActivityPhotos`
  - Task 3: `readPolaroidSettings`, `DEFAULT_PROMPT`, `MAX_PROMPT`, `stickerTray`, `stickerSources`
  - Task 9: `PolaroidComposer`, `PolaroidCard`, `startPortalPolaroidAction`, `postPortalPolaroidAction`, `removeOwnPolaroidAction`
- Produces:
  - `ActivityKind` includes `"polaroid"`
  - `PolaroidKindSettings`, `readPolaroidKindSettings(form)`, `newPolaroid(settings, isOpen)`
  - `polaroidRow({ live, walkIn })`
  - `polaroidCard({ posted })`
  - `PolaroidEntry = { activity: Activity; mine: PolaroidRow[] }`
  - `addPolaroidActivityAction`, `savePolaroidActivityAction`, `deletePolaroidActivityAction`
  - `PolaroidDetail({ ev, activity, tab, show })`, `PolaroidBody({ entry, slug, token })`
  - `YourPolaroids({ items, stickerSrc, remove })`
  - `ActivityMenuProps.exportHref` becomes optional

- [ ] **Step 1: Update the tests first**

`tests/activities/kinds.test.ts`: replace the first two `it` bodies:

```ts
    expect(ACTIVITY_KINDS).toEqual(["booking", "submission", "passport", "polaroid"]);
    expect(Object.keys(KIND_META).sort()).toEqual([...ACTIVITY_KINDS].sort());
```

```ts
    expect(ACTIVITY_KINDS.map((k) => KIND_META[k].label)).toEqual(["Sessions", "Submission", "Passport", "Polaroid wall"]);
    expect(KIND_META.passport.title).toBe("Add a booth passport");
```

Then add:

```ts
describe("the polaroid kind (D471)", () => {
  it("has a Setup tab, by its own entry", () => {
    expect(activityTabs("polaroid", {}).map((t) => t.tab)).toEqual(["setup"]);
  });
});
```

`tests/catalogue/catalogue.test.ts`:
- Change `["submission", "passport"]` to `["submission", "passport", "polaroid"]`.
- Next to the two `featureForActivityKind` lines, add `expect(featureForActivityKind("polaroid")).toBe("engagement");`.

`tests/activities/row.test.ts`: add (import `polaroidRow` and `removeWarning` from `@/features/activities/client` beside the existing imports):

```ts
describe("polaroidRow (D485)", () => {
  it("counts what is on the wall and says when the walk-in link is on", () => {
    expect(polaroidRow({ live: 3, walkIn: true })).toEqual({
      kind: "Polaroid wall", detail: "Walk-in link on", progress: { done: 3, total: 3, label: "3 polaroids on the wall" }, attention: null,
    });
    expect(polaroidRow({ live: 1, walkIn: false }).progress.label).toBe("1 polaroid on the wall");
  });
  it("warns that the photos go with it", () => {
    expect(removeWarning({ kind: "polaroid", polaroids: 2 })).toBe("Its 2 polaroids and their photos go with it. This can't be undone.");
    expect(removeWarning({ kind: "polaroid", polaroids: 0 })).toBe("This can't be undone.");
  });
});
```

`tests/activities/activity-card.test.ts`: add (import `polaroidCard`):

```ts
describe("polaroidCard (D481)", () => {
  it("opens the camera, and says how many of theirs are up", () => {
    expect(polaroidCard({ posted: 0 })).toEqual({ status: null, meta: null, action: { label: "Open camera", primary: true } });
    expect(polaroidCard({ posted: 2 }).status).toEqual({ label: "2 on the wall", tone: "success" });
  });
});
```

`tests/activities/settings.test.ts`: add (import `readSettings` the way the file already does):

```ts
describe("polaroid settings (D471, D475)", () => {
  const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
  it("reads a name and a prompt, defaulting the prompt", () => {
    const r = readSettings("polaroid", fd({ name: "Wall" }));
    expect(r).toEqual({ ok: true, settings: { name: "Wall", description: null, categories: null, prompt: "Share the moment!" } });
  });
  it("refuses a missing name and a long prompt", () => {
    expect(readSettings("polaroid", fd({ name: "" })).ok).toBe(false);
    expect(readSettings("polaroid", fd({ name: "Wall", prompt: "x".repeat(61) })).ok).toBe(false);
  });
});
```

If `cleanRichText("")` or `parseCategories("")` answer something other than `null`, match the expectation to what the passport tests in the same file already assert for an empty description and categories.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/activities tests/catalogue`
Expected: FAIL. `polaroid` isn't a kind yet.

- [ ] **Step 3: The kind, its meta, its settings and its catalogue unlock**

`src/lib/types.ts`:

```ts
/** What an attendee does with an activity: take a seat, send answers, collect stamps, or post a polaroid (D178, D179, D471). */
export type ActivityKind = "booking" | "submission" | "passport" | "polaroid";
```

`kinds/meta.ts`:
- Import `Camera` from lucide.
- `ACTIVITY_KINDS = ["booking", "submission", "passport", "polaroid"] as const …`
- Add:

```ts
  polaroid: { label: "Polaroid wall", icon: Camera, what: "Attendees post photos to an LED wall", title: "Add a polaroid wall", hint: "It gets its own LED wall link. Add stickers and the walk-in link on its page." },
```

`src/features/catalogue/catalogue.ts`:
- `engagement: addon("Engagement activities", "Stamp passport, submissions, scored challenges and the polaroid wall.", { activityKinds: ["submission", "passport", "polaroid"] }, [`
- `ACTIVITY_KIND_ORDER = ["booking", "submission", "passport", "polaroid"] as const …`

Create `src/features/activities/kinds/polaroid/settings.ts`:

```ts
import { parseCategories } from "@/lib/agenda";
import { cleanRichText } from "@/lib/rich-text";
import type { NewActivity } from "../../db/activities";
import { categoryValues, type FormReader } from "../form";

// The same two values as the polaroid feature's DEFAULT_PROMPT and MAX_PROMPT (D475), written out
// rather than imported: its client entry also carries its screens (next/font, CSS), which a pure
// settings reader, and the vitest node run that loads it, must not pull in. The settings test
// pins the default.
const DEFAULT_PROMPT = "Share the moment!";
const MAX_PROMPT = 60;

export type PolaroidKindSettings = { name: string; description: string | null; categories: string[] | null; prompt: string };

/** A polaroid wall's add form and its Details card (D420). The wall's own settings save on their own card (D485). */
export function readPolaroidKindSettings(form: FormReader): PolaroidKindSettings {
  const name = form.text("name");
  if (!name) throw new Error("A polaroid wall needs a name");
  const prompt = form.text("prompt") || DEFAULT_PROMPT;
  if (prompt.length > MAX_PROMPT) throw new Error(`Keep the prompt to ${MAX_PROMPT} characters`);
  return { name, description: cleanRichText(form.text("description")), categories: parseCategories(categoryValues(form)), prompt };
}

/** Never owed and never capped (D471). Its two links are minted by the add action. */
export function newPolaroid(settings: PolaroidKindSettings, isOpen: boolean): NewActivity {
  const { prompt, ...details } = settings;
  return { ...details, kind: "polaroid", required: false, is_open: isOpen, max_per_attendee: null, questions: [], per_day: false, polaroid: { prompt } };
}
```

`kinds/settings.ts`:
- Import `{ newPolaroid, readPolaroidKindSettings, type PolaroidKindSettings } from "./polaroid/settings"`.
- Add `polaroid: PolaroidKindSettings` to `SettingsFor`.
- Add `polaroid: { read: (form) => readPolaroidKindSettings(form), create: newPolaroid },` to `KIND_SETTINGS`.

- [ ] **Step 4: Tabs, row, cards and portal entries**

`tabs.ts`, in `TABS`:

```ts
  // Setup only until the moderation feed and stickers land (Task 11).
  polaroid: () => [setup()],
```

`row.ts`:
- Add `polaroid: { polaroids: number };` to `RemoveFacts`.
- Add a case before `default` in `removeWarning`:

```ts
    // Cascades its posts; the photos are swept from the bucket by the delete action (D485).
    case "polaroid":
      return `${input.polaroids > 0 ? `Its ${plural(input.polaroids, "polaroid")} and their photos go with it. ` : ""}This can't be undone.`;
```

- Add:

```ts
export function polaroidRow(input: { live: number; walkIn: boolean }): ActivityRowView {
  const { live, walkIn } = input;
  return {
    kind: KIND_META.polaroid.label,
    detail: walkIn ? "Walk-in link on" : null,
    // Nothing to be "done" against: a wall is never owed (D471), so the count is the progress.
    progress: { done: live, total: live, label: `${plural(live, "polaroid")} on the wall` },
    attention: null,
  };
}
```

`lib/activity-card.ts`: add:

```ts
/** A polaroid wall's card (D481): the camera is the action; how many of theirs are up is its status. */
export function polaroidCard({ posted }: { posted: number }): CardView {
  return { status: posted > 0 ? { label: `${posted} on the wall`, tone: "success" } : null, meta: null, action: { label: "Open camera", primary: true } };
}
```

`lib/portal-activity-entries.ts`:
- Import `{ polaroidsForAttendee, type PolaroidRow } from "@/features/polaroid"`.
- Add the type:

```ts
/** A polaroid wall this attendee may post to, and their own live polaroids on it (D482). */
export type PolaroidEntry = { activity: Activity; mine: PolaroidRow[] };
```

- Change `EntryMap` to `{ booking: ActivityEntry; submission: SubmissionEntry; passport: PassportEntry; polaroid: PolaroidEntry }`.
- Before the final `return`, add:

```ts
  // Read only when the event runs a wall this attendee can see: most portal loads never do.
  const walls = activities.filter((a) => a.kind === "polaroid" && eligible(a, attendee.category));
  const myPolaroids = walls.length ? await polaroidsForAttendee(attendee.id) : [];
  const polaroids = walls.map((activity) => ({ activity, mine: myPolaroids.filter((p) => p.activity_id === activity.id) }));
```

- Return `{ booking: bookings, submission: forms, passport: passports, polaroid: polaroids, people }`.

`cards.ts`:
- Import `polaroidCard`.
- Add to `cardsFor`:

```ts
    polaroid: (list) => list.map(({ activity, mine }) => ({
      activity, view: polaroidCard({ posted: mine.length }), href: href(activity), emphasis: false, section: "open" as const,
    })),
```

- Add to `finders`:

```ts
    polaroid: (list) => {
      const e = list.find((p) => p.activity.id === activityId);
      return e ? { entry: e, activity: e.activity } : null;
    },
```

- [ ] **Step 5: `ActivityMenu` without an export**

In `admin/ActivityMenu.tsx`:
- Make the prop optional: `exportHref?: string;` with the doc comment `/** Left out for a kind with nothing to export (a polaroid wall). */`.
- Wrap the Export item in `{exportHref && ( … )}`.

- [ ] **Step 6: The attendee's polaroids — `src/features/polaroid/components/YourPolaroids.tsx`**

```tsx
"use client";
import { DangerButton } from "@/components/admin/DangerButton";
import { toast } from "@/lib/toast-store";
import type { CardData } from "../lib/wire";
import type { RemoveResult } from "../lib/post-types";
import { PolaroidCard } from "./PolaroidCard";

/** "Your polaroids" (D482): what this attendee has up, each removable by them. */
export function YourPolaroids({ items, stickerSrc, remove }: {
  items: (CardData & { id: string })[];
  stickerSrc: Record<string, string>;
  remove: (id: string) => Promise<RemoveResult>;
}) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-extrabold">Your polaroids</h2>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {items.map((p) => (
          <div key={p.id} className="flex shrink-0 flex-col items-center gap-2 pt-3">
            <PolaroidCard card={p} width={140} stickerSrc={stickerSrc} />
            <DangerButton message="This takes it off the wall and deletes the photo."
              action={async () => {
                const r = await remove(p.id);
                toast(r.ok ? "Removed from the wall." : r.error, r.ok ? "ok" : "error");
              }}>
              Remove
            </DangerButton>
          </div>
        ))}
      </div>
    </section>
  );
}
```

Add `export { YourPolaroids } from "./components/YourPolaroids";` to `src/features/polaroid/client.ts`.

- [ ] **Step 7: The portal body — `kinds/polaroid/PolaroidBody.tsx`**

```tsx
import { RichSections } from "@/components/portal/RichSections";
import {
  readPolaroidSettings, stickerTray, stickerSources, photoUrl, PolaroidComposer, YourPolaroids,
  startPortalPolaroidAction, postPortalPolaroidAction, removeOwnPolaroidAction,
} from "@/features/polaroid";
import type { PolaroidEntry } from "../../lib/portal-activity-entries";

/**
 * A polaroid wall in the portal (D481, D482): the organiser's words, the camera, and the
 * attendee's own polaroids. A closed wall never arrives here (D384); the composer shows the
 * server's "Posting is paused" if it closes while the page is open.
 */
export function PolaroidBody({ entry: { activity, mine }, slug, token }: { entry: PolaroidEntry; slug: string; token: string }) {
  const settings = readPolaroidSettings(activity.polaroid);
  return (
    <div className="flex flex-col gap-6">
      <RichSections html={activity.description} />
      <PolaroidComposer prompt={settings.prompt} stickers={stickerTray(settings)}
        start={startPortalPolaroidAction.bind(null, slug, token, activity.id)}
        post={postPortalPolaroidAction.bind(null, slug, token, activity.id)} />
      <YourPolaroids stickerSrc={stickerSources(settings)} remove={removeOwnPolaroidAction.bind(null, slug, token, activity.id)}
        items={mine.map((p) => ({ id: p.id, src: photoUrl(p.photo_path), w: p.photo_w, h: p.photo_h, message: p.message, stickers: p.stickers, tilt: p.tilt }))} />
    </div>
  );
}
```

In `portal/ActivityPage.tsx`:
- Import `PolaroidBody`.
- Add before `default`:

```tsx
      case "polaroid":
        return <PolaroidBody entry={found.entry} slug={slug} token={token} />;
```

- Change the doc comment's "the same shape for all three kinds" to "for every kind".

- [ ] **Step 8: Admin actions for the kind (in `src/features/activities/admin/actions.ts`)**

Add imports: `generateToken` from `@/lib/tokens`, and `readPolaroidSettings, sweepActivityPhotos` from `@/features/polaroid`. Then add after the passport actions:

```ts
/** The polaroid wall a posted id names, or a flash back to the list (as `passportOf`). */
async function polaroidOf(ev: Event, activityId: string): Promise<Activity> {
  const wall = await getActivity(activityId, ev.id);
  if (!wall || wall.kind !== "polaroid") redirect(flashPath(listPath(ev.id), "That polaroid wall no longer exists.", "error"));
  await allowKind(ev, wall.kind);
  return wall;
}

/** D474: both links are minted here, so a wall always has its LED link from the start. */
export async function addPolaroidActivityAction(eventId: string, fd: FormData) {
  const ev = await event(eventId);
  await allowKind(ev, "polaroid");
  const read = readSettings("polaroid", fd);
  if (!read.ok) redirect(flashPath(listPath(eventId), read.error, "error"));
  let image: ImageChange = { url: null, stale: null };
  try {
    image = await nextImage(fd, "image", null, { orgId: ev.org_id, eventId: ev.id, kind: "activity" });
  } catch (e) {
    redirect(flashPath(listPath(eventId), (e as Error).message, "error"));
  }
  const id = await createActivity(ev, {
    ...newActivityFrom("polaroid", read.settings, checked(fd, "is_open")),
    image_url: image.url, wall_token: generateToken(), public_token: generateToken(),
  });
  revalidatePath(listPath(eventId));
  redirect(flashPath(detailPath(eventId, id), "Polaroid wall added. Open its wall link on the LED."));
}

/** Never touches `is_open`; merges the prompt into the wall's other settings rather than replacing them. */
export async function savePolaroidActivityAction(eventId: string, activityId: string, fd: FormData) {
  const ev = await event(eventId);
  const back = detailPath(eventId, activityId);
  const current = await polaroidOf(ev, activityId);
  const read = readSettings("polaroid", fd);
  if (!read.ok) redirect(flashPath(back, read.error, "error"));
  const { prompt, ...details } = read.settings;
  let image: ImageChange = { url: current.image_url, stale: null };
  try {
    image = await nextImage(fd, "image", current.image_url, { orgId: ev.org_id, eventId: ev.id, kind: "activity" });
  } catch (e) {
    redirect(flashPath(back, (e as Error).message, "error"));
  }
  await updateActivity(activityId, ev.id, { ...details, image_url: image.url, polaroid: { ...readPolaroidSettings(current.polaroid), prompt } });
  await deleteEventImage(image.stale);
  revalidatePath(listPath(eventId));
  revalidatePath(back);
  redirect(flashPath(back, "Polaroid wall saved."));
}

/** D485: the photos first, then the row (its polaroids cascade), then its images. */
export async function deletePolaroidActivityAction(eventId: string, activityId: string) {
  const ev = await event(eventId);
  const doomed = await polaroidOf(ev, activityId);
  await sweepActivityPhotos(ev.org_id, ev.id, activityId);
  await deleteActivity(activityId, ev.id);
  const settings = readPolaroidSettings(doomed.polaroid);
  for (const url of [doomed.image_url, settings.background?.url ?? null, ...settings.stickers.map((s) => s.url)]) await deleteEventImage(url);
  revalidatePath(listPath(eventId));
  redirect(flashPath(listPath(eventId), "Polaroid wall deleted."));
}
```

- [ ] **Step 9: The admin detail page, Setup only for now — `kinds/polaroid/PolaroidDetail.tsx`**

```tsx
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { formKey } from "@/lib/form-key";
import { listCategories } from "@/lib/db/attendees";
import { appBaseUrl, polaroidWallLink } from "@/lib/links";
import type { Activity, Event } from "@/lib/types";
import { readPolaroidSettings, countByActivity, countLiveByActivity } from "@/features/polaroid";
import { CategoryCombo } from "@/components/admin/AgendaCombos";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Field } from "@/components/admin/Field";
import { SaveBar } from "@/components/admin/SaveBar";
import { OpenSwitch } from "@/components/admin/OpenSwitch";
import { RichTextEditor, SECTIONS_HINT } from "@/components/admin/RichTextEditor";
import { ImageField } from "@/components/admin/ImageField";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { ActivityMenu } from "../../admin/ActivityMenu";
import { COVER_HINT } from "../../admin/ActivityRows";
import { removeWarning } from "../../row";
import { toggleOpenAction, togglePinAction, savePolaroidActivityAction, deletePolaroidActivityAction, uploadActivityImageAction } from "../../admin/actions";

/** A polaroid wall's page (D485). Task 11 adds the moderation feed, stickers and wall settings. */
export async function PolaroidDetail({ ev, activity }: { ev: Event; activity: Activity; tab?: string; show?: string }) {
  const path = `/admin/events/${ev.id}/activities/${activity.id}`;
  const [categories, live, total] = await Promise.all([listCategories(ev.id), countLiveByActivity(ev.id), countByActivity(activity.id)]);
  const settings = readPolaroidSettings(activity.polaroid);
  const wall = activity.wall_token ? polaroidWallLink(appBaseUrl(), activity.wall_token) : null;
  const onWall = live[activity.id] ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title={activity.name}
        subtitle={`${onWall} polaroid${onWall === 1 ? "" : "s"} on the wall`}
        actions={
          <>
            <OpenSwitch open={activity.is_open} action={toggleOpenAction.bind(null, ev.id, activity.id, "setup")} name={activity.name} verb="Posting" showLabel />
            {wall && (
              <Link href={wall} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <ExternalLink data-icon="inline-start" />Open wall
              </Link>
            )}
            <ActivityMenu
              name={activity.name}
              pinned={activity.pinned}
              togglePin={togglePinAction.bind(null, ev.id, activity.id, "setup")}
              settingsHref={path}
              remove={deletePolaroidActivityAction.bind(null, ev.id, activity.id)}
              removeMessage={removeWarning({ kind: "polaroid", polaroids: total })}
            />
          </>
        }
      />
      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent>
          <form key={formKey({ ...activity, is_open: undefined })} action={savePolaroidActivityAction.bind(null, ev.id, activity.id)} className="grid grid-cols-1 gap-4">
            <Field label="Name" name="name" defaultValue={activity.name} />
            <Field label="Prompt above the camera" name="prompt" defaultValue={settings.prompt} placeholder="Share the moment!" />
            <RichTextEditor name="description" label="Description (optional)" defaultValue={activity.description} description={SECTIONS_HINT} uploadImage={uploadActivityImageAction.bind(null, ev.id)} />
            <ImageField label="Image (optional)" name="image" url={activity.image_url} description={COVER_HINT} />
            <CategoryCombo categories={categories} defaultValue={activity.categories ?? []} />
            <SaveBar inCard />
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- If `OpenSwitch`'s `verb` prop reads oddly ("Posting InBody Scan"), drop it and keep the default.
- If `buttonVariants` has no `size: "sm"`, use the size `PassportDetail` uses for its back link.

In `admin/ActivityDetailPage.tsx`:
- Add `show?: string` to the `searchParams` type and destructure it.
- Import `PolaroidDetail` and add the case:

```tsx
    case "polaroid": return <PolaroidDetail ev={ev} activity={activity} tab={tab} show={show} />;
```

- [ ] **Step 10: The admin list page — `src/app/admin/events/[id]/activities/page.tsx`**

**Imports and data:**
- Add `polaroidRow, addPolaroidActivityAction, deletePolaroidActivityAction` to the `@/features/activities` import.
- Add `import { countLiveByActivity, readPolaroidSettings } from "@/features/polaroid";`.
- Add `countLiveByActivity(ev.id)` to the `Promise.all` and name it `liveByWall`.

**`RowFacts` and `listItem`:**
- Add `polaroids: number; walkIn: boolean;` to `RowFacts`.
- Pass them in `items`: `polaroids: liveByWall[a.id] ?? 0, walkIn: a.kind === "polaroid" && readPolaroidSettings(a.polaroid).public,`.
- Add a case to `listItem`:

```tsx
    case "polaroid":
      return {
        activity: a, href,
        view: polaroidRow({ live: facts.polaroids, walkIn: facts.walkIn }),
        toggle: toggleOpenAction.bind(null, ev.id, a.id, "list"),
        menu: {
          ...base,
          remove: deletePolaroidActivityAction.bind(null, ev.id, a.id),
          removeMessage: removeWarning({ kind: "polaroid", polaroids: facts.polaroids }),
        },
      };
```

The warning counts live polaroids here (the list has no total). The detail page counts every row; both are true statements of what goes.

**The add form:** add to the `forms` object:

```tsx
              polaroid: (
                <form action={addPolaroidActivityAction.bind(null, ev.id)} className="grid grid-cols-1 gap-4">
  <Field label="Name" name="name" defaultValue="Polaroid wall" />
  <Field label="Prompt above the camera" name="prompt" placeholder="Share the moment!" />
  <RichTextEditor name="description" label="Description (optional)" description={SECTIONS_HINT} uploadImage={uploadActivityImageAction.bind(null, ev.id)} />
  <ImageField label="Image (optional)" name="image" description={COVER_HINT} />
  <CategoryCombo categories={categories} />
  {/* Checked by default: a wall nobody opened is a camera that refuses every photo. */}
  <label className={check}>
    <input type="checkbox" name="is_open" className="size-4" defaultChecked />
    Open for posting now
  </label>
  <SubmitButton>Add polaroid wall</SubmitButton>
                </form>
              ),
```

- [ ] **Step 11: Run every check**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: everything passes.
- `tsc` lists any exhaustive site this plan missed. Add the polaroid branch there in the same style.
- Don't use a `default:` fall-through.

- [ ] **Step 12: Check it in the browser (ecpkom)**

Start `preview_start` `{name: "dev"}` and sign in to admin as usual. Then:

1. On ecpkom's Settings → Features, confirm the engagement add-on is on. Do not change ecphub.
2. **Add a wall:** Activities → New activity → Polaroid wall → Add.
   - Expected: you land on its page with the flash, "Open wall" in the header, and the Details card.
   - Expected: the list shows "Polaroid wall · 0 polaroids on the wall".
3. **Portal:** open an ecpkom test attendee's portal (`/e/ecpkom/a/<token>` from `execute_sql`: `select token from attendees where event_id = '4e64a90c-728c-4a08-af62-8c8046afa0c9' limit 1`) and go to Activities.
   - Expected: the wall's card shows "Open camera".
   - Open it, post a polaroid with the Playwright file upload, as in Task 9.
   - Expected: "Your polaroids" shows it.
   - Remove it.
   - Expected: it disappears, and `select status, removed_by from polaroids …` shows `removed` / `self`.
4. **Closed wall:** close the wall from the header switch.
   - Expected: the portal card disappears (D384).
   - Reopen it.
5. **Delete:** delete the wall from the ⋯ menu.
   - Expected: the warning names its polaroids.
   - Then: `select count(*) from polaroids where activity_id = '<id>'` is 0, and the storage folder is gone (`execute_sql`: `select count(*) from storage.objects where bucket_id = 'polaroids' and name like '<org>/<event>/<id>/%'`).

Take a screenshot of the portal activity page and of the admin page.

- [ ] **Step 13: Commit**

```bash
git pull --rebase --autostash
git add src/lib/types.ts src/features/activities src/features/catalogue/catalogue.ts src/features/polaroid "src/app/admin/events/[id]/activities/page.tsx" tests/activities tests/catalogue
git commit -m "feat(activities): polaroid wall as the fourth activity kind (D471, D481, D482, D485)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Admin — moderation feed, stickers, wall settings and links

**Files:**
- Modify: `src/features/activities/tabs.ts`, `src/features/activities/kinds/polaroid/PolaroidDetail.tsx`, `src/features/polaroid/client.ts`, `src/features/polaroid/index.ts`
- Create:
  - `src/features/polaroid/admin/actions.ts`
  - `src/features/polaroid/admin/PolaroidFeed.tsx`
  - `src/features/polaroid/admin/StickersPanel.tsx`
  - `src/features/polaroid/admin/WallSettingsCard.tsx`
  - `src/features/polaroid/admin/WallBackgroundField.tsx`
  - `src/features/polaroid/admin/LinksCard.tsx`
- Test: `tests/activities/kinds.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 8, 9 and 10.
- Produces:
  - tabs `"polaroids" | "stickers"`, and `TabCounts.polaroids`
  - admin actions (all `(eventId, activityId, …)`):
    - `saveWallSettingsAction(eventId, activityId, fd)`
    - `wallBackgroundUploadAction(eventId, activityId, type, size)`
    - `removePolaroidAction(eventId, activityId, polaroidId)`
    - `rotateWallLinkAction(eventId, activityId)`, `rotateWalkinLinkAction(eventId, activityId)`
    - `addStickerAction(eventId, activityId, fd)`, `deleteStickerAction(eventId, activityId, stickerId)`
    - `toggleBuiltinStickerAction(eventId, activityId, stickerId)`
  - `PolaroidFeed`, `StickersPanel`, `WallSettingsCard`, `LinksCard`

- [ ] **Step 1: Update the tab test**

In `tests/activities/kinds.test.ts`, change the polaroid test to:

```ts
  it("has Setup, Polaroids (counted) and Stickers", () => {
    const tabs = activityTabs("polaroid", { polaroids: 4 });
    expect(tabs.map((t) => t.tab)).toEqual(["setup", "polaroids", "stickers"]);
    expect(tabs[1].count).toBe(4);
  });
```

Run: `npx vitest run tests/activities/kinds.test.ts`
Expected: FAIL.

- [ ] **Step 2: Tabs**

In `tabs.ts`:
- Add `| "polaroids" | "stickers"` to `ActivityTab`.
- Add `/** D485: a polaroid wall's live count, for its Polaroids tab. */ polaroids?: number;` to `TabCounts`.
- Set the polaroid entry:

```ts
  // D485: the moderation feed and the sticker pack; Setup holds details, links and the wall.
  polaroid: (c) => [setup(), item("polaroids", "Polaroids", c.polaroids ?? 0), item("stickers", "Stickers")],
```

Run: `npx vitest run tests/activities/kinds.test.ts`
Expected: PASS.

- [ ] **Step 3: The admin actions — `src/features/polaroid/admin/actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { flashPath } from "@/lib/flash";
import { generateToken } from "@/lib/tokens";
import { acceptImage, acceptVideo, isEventMediaFor } from "@/lib/storage";
import { createMediaUpload, deleteEventImage, uploadEventImage } from "@/lib/db/media";
import { requireFeature } from "@/features/catalogue";
import type { Activity, Event } from "@/lib/types";
import { getPolaroidActivity, removePolaroid, savePolaroidSettings, setActivityToken } from "../db/polaroids";
import { parseBlockedWords, parseColumns, parseSpeed, readPolaroidSettings, type PolaroidSettings } from "../lib/settings";
import { BUILTIN_STICKERS, newEventStickerId } from "../lib/stickers";

const MAX_STICKER_BYTES = 1024 * 1024;
const STICKER_TYPES = new Set(["image/png", "image/webp", "image/svg+xml"]);

// This feature cannot import the activities feature (it imports us), so it builds its own paths.
const pageOf = (eventId: string, activityId: string, tab?: "polaroids" | "stickers") =>
  `/admin/events/${eventId}/activities/${activityId}${tab ? `?tab=${tab}` : ""}`;

async function wallOf(eventId: string, activityId: string): Promise<{ ev: Event; userId: string; activity: Activity; settings: PolaroidSettings }> {
  const { orgId, userId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const list = `/admin/events/${eventId}/activities`;
  await requireFeature(ev.id, "engagement", list);
  const activity = await getPolaroidActivity(activityId, ev.id);
  if (!activity) redirect(flashPath(list, "That polaroid wall no longer exists.", "error"));
  return { ev, userId, activity, settings: readPolaroidSettings(activity.polaroid) };
}

async function saved(ev: Event, activity: Activity, next: PolaroidSettings, back: string, message: string): Promise<never> {
  await savePolaroidSettings(activity.id, ev.id, next);
  revalidatePath(back);
  redirect(flashPath(back, message));
}

/** D485: walk-in link, blocked words, columns, speed and background, in one save. */
export async function saveWallSettingsAction(eventId: string, activityId: string, fd: FormData) {
  const back = pageOf(eventId, activityId);
  const { ev, activity, settings } = await wallOf(eventId, activityId);
  const type = String(fd.get("background_type") ?? "none");
  const url = String(fd.get("background_url") ?? "");
  let background = settings.background;
  if (type === "none") background = null;
  else if ((type === "image" || type === "video") && url) {
    // A hidden field is client-controlled: only a background WE stored for this event is taken (D300).
    if (!isEventMediaFor(url, process.env.NEXT_PUBLIC_SUPABASE_URL!, ev.org_id, ev.id, ["polaroid-background"])) {
      redirect(flashPath(back, "That background was not uploaded here. Upload it again.", "error"));
    }
    background = { type, url };
  }
  const next: PolaroidSettings = {
    ...settings,
    public: fd.get("public") !== null,
    blocked_words: parseBlockedWords(String(fd.get("blocked_words") ?? "")),
    columns: parseColumns(String(fd.get("columns") ?? "auto")),
    speed: parseSpeed(String(fd.get("speed") ?? "medium")),
    background,
  };
  await savePolaroidSettings(activity.id, ev.id, next);
  // Only after the save: a failed save must not leave the wall pointing at a deleted file.
  if (settings.background && settings.background.url !== background?.url) await deleteEventImage(settings.background.url);
  revalidatePath(back);
  redirect(flashPath(back, "Wall settings saved."));
}

/** A background image or video goes straight to the bucket on a signed URL (D300); Save then keeps its URL. */
export async function wallBackgroundUploadAction(eventId: string, activityId: string, type: string, size: number):
  Promise<{ ok: true; path: string; token: string; url: string; kind: "image" | "video" } | { ok: false; error: string }> {
  const { ev } = await wallOf(eventId, activityId);
  const video = type.startsWith("video/");
  let ext: string;
  try {
    ext = video ? acceptVideo({ type, size }) : acceptImage({ type, size });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const up = await createMediaUpload({ orgId: ev.org_id, eventId: ev.id, kind: "polaroid-background", ext });
  return { ok: true, ...up, kind: video ? "video" : "image" };
}

/** D473: final. The wall drops it on its next poll; the photo is deleted. */
export async function removePolaroidAction(eventId: string, activityId: string, polaroidId: string) {
  const back = pageOf(eventId, activityId, "polaroids");
  const { userId, activity } = await wallOf(eventId, activityId);
  const removed = await removePolaroid(polaroidId, activity.id, `admin:${userId}`);
  revalidatePath(back);
  redirect(flashPath(back, removed ? "Removed from the wall." : "That polaroid was already removed."));
}

async function rotate(eventId: string, activityId: string, column: "wall_token" | "public_token", message: string) {
  const back = pageOf(eventId, activityId);
  const { ev, activity } = await wallOf(eventId, activityId);
  await setActivityToken(activity.id, ev.id, column, generateToken());
  revalidatePath(back);
  redirect(flashPath(back, message));
}

export async function rotateWallLinkAction(eventId: string, activityId: string) {
  await rotate(eventId, activityId, "wall_token", "New wall link made. Open it on the LED; the old one has stopped.");
}

export async function rotateWalkinLinkAction(eventId: string, activityId: string) {
  await rotate(eventId, activityId, "public_token", "New walk-in link made. The wall's QR has changed; the old link has stopped.");
}

/** D485: an event sticker, PNG, WebP or SVG up to 1 MB. Rendered only in <img>, so SVG is safe (acceptImage). */
export async function addStickerAction(eventId: string, activityId: string, fd: FormData) {
  const back = pageOf(eventId, activityId, "stickers");
  const { ev, activity, settings } = await wallOf(eventId, activityId);
  const file = fd.get("sticker");
  if (!(file instanceof File) || file.size === 0) redirect(flashPath(back, "Choose a sticker image first.", "error"));
  if (!STICKER_TYPES.has(file.type.toLowerCase())) redirect(flashPath(back, "Stickers must be PNG, WebP or SVG.", "error"));
  if (file.size > MAX_STICKER_BYTES) redirect(flashPath(back, "Stickers must be 1 MB or smaller.", "error"));
  if (settings.stickers.length >= 40) redirect(flashPath(back, "A wall can have up to 40 event stickers.", "error"));
  const url = await uploadEventImage({ orgId: ev.org_id, eventId: ev.id, kind: "polaroid-sticker", file });
  const name = String(fd.get("name") ?? "").trim().slice(0, 60) || file.name.replace(/\.[^.]*$/, "").slice(0, 60) || "Sticker";
  await saved(ev, activity, { ...settings, stickers: [...settings.stickers, { id: newEventStickerId(), url, name }] }, back, "Sticker added.");
}

/** Polaroids already using it draw without it (D476). */
export async function deleteStickerAction(eventId: string, activityId: string, stickerId: string) {
  const back = pageOf(eventId, activityId, "stickers");
  const { ev, activity, settings } = await wallOf(eventId, activityId);
  const doomed = settings.stickers.find((s) => s.id === stickerId);
  if (!doomed) redirect(flashPath(back, "That sticker was already deleted."));
  await savePolaroidSettings(activity.id, ev.id, { ...settings, stickers: settings.stickers.filter((s) => s.id !== stickerId) });
  await deleteEventImage(doomed.url);
  revalidatePath(back);
  redirect(flashPath(back, "Sticker deleted."));
}

export async function toggleBuiltinStickerAction(eventId: string, activityId: string, stickerId: string) {
  const back = pageOf(eventId, activityId, "stickers");
  const { ev, activity, settings } = await wallOf(eventId, activityId);
  if (!BUILTIN_STICKERS.some((s) => s.id === stickerId)) redirect(flashPath(back, "That sticker is not in the pack.", "error"));
  const hidden = settings.hidden_builtin.includes(stickerId)
    ? settings.hidden_builtin.filter((id) => id !== stickerId)
    : [...settings.hidden_builtin, stickerId];
  await saved(ev, activity, { ...settings, hidden_builtin: hidden }, back, hidden.includes(stickerId) ? "Sticker hidden." : "Sticker shown.");
}
```

Add `export * from "./admin/actions";` to `src/features/polaroid/index.ts`.

- [ ] **Step 4: `admin/WallBackgroundField.tsx` (client)**

```tsx
"use client";
import { useState } from "react";
import { MEDIA_BUCKET } from "@/lib/storage";
import { browserStorage } from "@/lib/supabase/browser";
import { wallBackgroundUploadAction } from "./actions";
import type { WallBackground } from "../lib/settings";

/** The wall's background (D484): the event colour, or an uploaded image or looping video. Uploads before Save (D300). */
export function WallBackgroundField({ eventId, activityId, current }: { eventId: string; activityId: string; current: WallBackground | null }) {
  const [bg, setBg] = useState<WallBackground | null>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const r = await wallBackgroundUploadAction(eventId, activityId, file.type, file.size);
      if (!r.ok) { setError(r.error); return; }
      const { error: upload } = await browserStorage().storage.from(MEDIA_BUCKET)
        .uploadToSignedUrl(r.path, r.token, file, { contentType: file.type, cacheControl: "31536000" });
      if (upload) { setError("Could not upload that file. Try again."); return; }
      setBg({ type: r.kind, url: r.url });
    } catch {
      setError("Could not upload that file. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-bold">Wall background</legend>
      <input type="hidden" name="background_type" value={bg ? bg.type : "none"} />
      <input type="hidden" name="background_url" value={bg?.url ?? ""} />
      <p className="text-sm text-muted-foreground">
        {bg ? `Your ${bg.type}. ` : "The event colour. "}An image or an MP4/WebM up to 30 MB; it fills the LED, so 5504 × 2322 or 2560 × 1080 fits KOM&apos;s screen.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-sm font-medium">
          {busy ? "Uploading…" : bg ? "Replace" : "Upload"}
          <input type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" className="sr-only" disabled={busy}
            onChange={(e) => void choose(e.target.files?.[0])} />
        </label>
        {bg && <button type="button" className="h-8 px-3 text-sm font-medium text-destructive" onClick={() => setBg(null)}>Use the event colour</button>}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </fieldset>
  );
}
```

- [ ] **Step 5: `admin/WallSettingsCard.tsx` and `admin/LinksCard.tsx` (server)**

```tsx
import { formKey } from "@/lib/form-key";
import { SaveBar } from "@/components/admin/SaveBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PolaroidSettings } from "../lib/settings";
import { saveWallSettingsAction } from "./actions";
import { WallBackgroundField } from "./WallBackgroundField";

const select = "h-9 w-full max-w-48 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs";

/** D485: how the wall looks and who may post to it. */
export function WallSettingsCard({ eventId, activityId, settings }: { eventId: string; activityId: string; settings: PolaroidSettings }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader><CardTitle>Wall and moderation</CardTitle></CardHeader>
      <CardContent>
        <form key={formKey(settings)} action={saveWallSettingsAction.bind(null, eventId, activityId)} className="grid grid-cols-1 gap-5">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="public" defaultChecked={settings.public} className="mt-0.5 size-4" />
            <span><span className="font-bold">Walk-in link</span><br /><span className="text-muted-foreground">Anyone who scans the wall&apos;s QR can post, without a name. Rate-limited per phone.</span></span>
          </label>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="blocked_words" className="text-sm font-bold">Blocked words</label>
            <textarea id="blocked_words" name="blocked_words" rows={3} defaultValue={settings.blocked_words.join("\n")}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs" placeholder="One per line, e.g. a competitor's name" />
            <p className="text-xs text-muted-foreground">On top of the built-in English and Malay lists. Messages with any of these are refused.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="columns" className="text-sm font-bold">Columns</label>
              <select id="columns" name="columns" defaultValue={String(settings.columns)} className={select}>
                <option value="auto">Fit the screen</option>
                {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="speed" className="text-sm font-bold">Speed</label>
              <select id="speed" name="speed" defaultValue={settings.speed} className={select}>
                <option value="slow">Slow</option>
                <option value="medium">Medium</option>
                <option value="fast">Fast</option>
              </select>
            </div>
          </div>
          <WallBackgroundField eventId={eventId} activityId={activityId} current={settings.background} />
          <SaveBar inCard />
        </form>
      </CardContent>
    </Card>
  );
}
```

```tsx
import { ShareLink } from "@/components/admin/ShareLink";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { rotateWalkinLinkAction, rotateWallLinkAction } from "./actions";

/** D484, D481: the LED's link and the walk-in link, each copyable and replaceable. */
export function LinksCard({ eventId, activityId, wall, walkin }: { eventId: string; activityId: string; wall: string | null; walkin: string | null }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader><CardTitle>Links</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-5">
        {wall && (
          <div className="flex flex-col gap-2">
            <ShareLink label="Wall (open on the LED PC)" url={wall} />
            <form action={rotateWallLinkAction.bind(null, eventId, activityId)}>
              <ConfirmButton message="The LED will stop until you open the new link on it." confirmLabel="Make a new link" tone="default">New wall link</ConfirmButton>
            </form>
          </div>
        )}
        {walkin ? (
          <div className="flex flex-col gap-2">
            <ShareLink label="Walk-in (the QR on the wall)" url={walkin} />
            <form action={rotateWalkinLinkAction.bind(null, eventId, activityId)}>
              <ConfirmButton message="Anyone holding the old link can no longer post. The wall shows the new QR." confirmLabel="Make a new link" tone="default">New walk-in link</ConfirmButton>
            </form>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Turn on the walk-in link below to show a QR on the wall.</p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: `admin/PolaroidFeed.tsx` and `admin/StickersPanel.tsx` (server)**

```tsx
import Link from "next/link";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { listAttendeesByIds } from "@/lib/db/attendees";
import { scannerNames } from "@/lib/db/users";
import { shortDateTime } from "@/lib/text";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import type { Activity, Event } from "@/lib/types";
import { photoUrl, polaroidsForAdmin } from "../db/polaroids";
import { readPolaroidSettings } from "../lib/settings";
import { stickerSources } from "../lib/stickers";
import { PolaroidCard } from "../components/PolaroidCard";
import { removePolaroidAction } from "./actions";

/** D485: every post as it looks on the wall, newest first, refreshing while crew watch it. */
export async function PolaroidFeed({ ev, activity, show }: { ev: Event; activity: Activity; show?: string }) {
  const rows = await polaroidsForAdmin(activity.id);
  const removedView = show === "removed";
  const shown = rows.filter((r) => (removedView ? r.status === "removed" : r.status === "live"));
  const live = rows.filter((r) => r.status === "live").length;
  const people = new Map((await listAttendeesByIds(ev.id, [...new Set(shown.flatMap((r) => (r.attendee_id ? [r.attendee_id] : [])))])).map((a) => [a.id, a.name]));
  const removers = await scannerNames(shown.flatMap((r) => (r.removed_by?.startsWith("admin:") ? [r.removed_by.slice(6)] : [])));
  const src = stickerSources(readPolaroidSettings(activity.polaroid));
  const base = `/admin/events/${ev.id}/activities/${activity.id}?tab=polaroids`;
  return (
    <div className="flex flex-col gap-4">
      <AutoRefresh seconds={5} />
      <nav className="flex gap-2 text-sm">
        <Link href={base} aria-current={!removedView ? "page" : undefined} className={!removedView ? "font-bold" : "text-muted-foreground"}>Live {live}</Link>
        <span className="text-muted-foreground">·</span>
        <Link href={`${base}&show=removed`} aria-current={removedView ? "page" : undefined} className={removedView ? "font-bold" : "text-muted-foreground"}>Removed {rows.length - live}</Link>
      </nav>
      {shown.length === 0 ? (
        <Empty className="border-0 bg-transparent">
          <EmptyHeader>
            <EmptyTitle>{removedView ? "Nothing removed" : "Nothing on the wall yet"}</EmptyTitle>
            <EmptyDescription>{removedView ? "Polaroids you take down show here." : "New polaroids appear here within a few seconds of being posted."}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-6">
          {shown.map((r) => {
            const who = r.attendee_id ? people.get(r.attendee_id) ?? "Removed attendee" : "Walk-in";
            const by = r.removed_by === "self" ? "the poster" : r.removed_by ? removers.get(r.removed_by.slice(6)) ?? "an admin" : null;
            return (
              <div key={r.id} className="flex flex-col items-center gap-2 pt-3">
                <PolaroidCard width={180} stickerSrc={src}
                  card={{ src: r.status === "live" ? photoUrl(r.photo_path) : null, w: r.photo_w, h: r.photo_h, message: r.message, stickers: r.stickers, tilt: r.tilt }} />
                <div className="w-full text-center text-xs">
                  <div className="font-bold">{who}</div>
                  <div className="text-muted-foreground">{shortDateTime(r.created_at)}</div>
                  {r.status === "removed" && <div className="text-muted-foreground">Removed by {by}</div>}
                </div>
                {r.status === "live" && (
                  <form action={removePolaroidAction.bind(null, ev.id, activity.id, r.id)}>
                    <ConfirmButton message="It leaves the wall within a few seconds and the photo is deleted. This can't be undone." confirmLabel="Remove">Remove from wall</ConfirmButton>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- `scannerNames` is how `BookingDetail` names deciders. It returns `Map<userId, string>`; check its signature before relying on it.
- If `shortDateTime` doesn't exist in `@/lib/text`, use whatever `RecentScans` or `SubmissionTable` uses to print a timestamp.
- `listAttendeesByIds(eventId, ids)` is the reader `loadActivityEntries` uses.

```tsx
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PolaroidSettings } from "../lib/settings";
import { BUILTIN_STICKERS } from "../lib/stickers";
import { addStickerAction, deleteStickerAction, toggleBuiltinStickerAction } from "./actions";

/** D485: the event's own stickers, and the built-in pack with a show/hide each. */
export function StickersPanel({ eventId, activityId, settings }: { eventId: string; activityId: string; settings: PolaroidSettings }) {
  const hidden = new Set(settings.hidden_builtin);
  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Event stickers</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={addStickerAction.bind(null, eventId, activityId)} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Image
              <input type="file" name="sticker" accept="image/png,image/webp,image/svg+xml" className="text-sm font-normal" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Name (optional)
              <input name="name" maxLength={60} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm font-normal shadow-xs" />
            </label>
            <SubmitButton>Add sticker</SubmitButton>
          </form>
          <p className="text-xs text-muted-foreground">PNG, WebP or SVG with a transparent background, up to 1 MB. They come first in the tray.</p>
          {settings.stickers.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {settings.stickers.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.url} alt="" className="size-10 object-contain" />
                  <span className="flex-1 text-sm">{s.name}</span>
                  <form action={deleteStickerAction.bind(null, eventId, activityId, s.id)}>
                    <ConfirmButton message="Polaroids that already use it keep everything else.">Delete</ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Built-in pack</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-3">
            {BUILTIN_STICKERS.map((s) => (
              <form key={s.id} action={toggleBuiltinStickerAction.bind(null, eventId, activityId, s.id)}
                className={`flex flex-col items-center gap-1 rounded-lg border p-2 ${hidden.has(s.id) ? "opacity-40" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.src} alt="" className="size-12 object-contain" />
                <span className="text-xs">{s.name}</span>
                <SubmitButton variant="outline" size="sm">{hidden.has(s.id) ? "Show" : "Hide"}</SubmitButton>
              </form>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

If `SubmitButton` takes no `variant` or `size` props, use its default and keep the label.

- [ ] **Step 7: Finish `PolaroidDetail.tsx`**

Replace the component body so that it:
1. Reads `tab` and `show`.
2. Computes `const tabs = activityTabs("polaroid", { polaroids: onWall }); const current = resolveTab(tabs, tab); const href = (t: ActivityTab) => activityHref(ev.id, activity.id, t);`. Import `activityTabs, resolveTab, activityHref, type ActivityTab` from `../../tabs`, and `ActivityTabs` from `../../admin/ActivityTabs`.
3. Renders `<ActivityTabs tabs={tabs} current={current} href={href} />` under the header.
4. Renders the current tab:
   - `"polaroids"`: `<PolaroidFeed ev={ev} activity={activity} show={show} />`
   - `"stickers"`: `<StickersPanel eventId={ev.id} activityId={activity.id} settings={settings} />`
   - otherwise (Setup), in order:
     - the existing **Details** card
     - `<LinksCard eventId={ev.id} activityId={activity.id} wall={wall} walkin={walkin} />`
     - `<WallSettingsCard eventId={ev.id} activityId={activity.id} settings={settings} />`

   Here `walkin` is `settings.public && activity.public_token ? polaroidWalkinLink(await eventAddress(ev), activity.public_token) : null`. Import `polaroidWalkinLink` from `@/lib/links` and `eventAddress` from `@/features/domains`.

Export the three admin components for it. Add to `src/features/polaroid/index.ts` (server: they render server components and bind server actions):

```ts
export { PolaroidFeed } from "./admin/PolaroidFeed";
export { StickersPanel } from "./admin/StickersPanel";
export { WallSettingsCard } from "./admin/WallSettingsCard";
export { LinksCard } from "./admin/LinksCard";
```

Import them in `PolaroidDetail.tsx` from `@/features/polaroid`.

- [ ] **Step 8: Run every check**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: everything passes.

- [ ] **Step 9: Check it in the browser (ecpkom)**

On the test wall from Task 9 (or a new one added through the menu):
1. **Setup:** Links shows the wall link. Tick Walk-in link and Save.
   - Expected: the walk-in link appears with its QR source URL.
   - Add `rival co` to Blocked words, set Columns 6 and Speed Fast, upload a small MP4 or JPEG background, and Save.
   - `execute_sql` `select polaroid from activities where id = '<id>'` shows all of it.
2. **Stickers:** upload a small transparent PNG and hide Heart.
   - Expected: on the walk-in composer's tray, the PNG comes first and Heart is gone.
   - Post "go rival co".
   - Expected: refused.
3. **Polaroids:** post twice from the walk-in page.
   - Expected: both appear in the feed within about 5 s, labelled "Walk-in".
   - Remove one.
   - Expected: it moves to Removed, greyed, "Removed by" your admin name, and its object is gone from `storage.objects`.
4. **Rotate:** rotate the walk-in link.
   - Expected: the old walk-in URL now 404s.

Take a screenshot of each tab.

- [ ] **Step 10: Commit**

```bash
git pull --rebase --autostash
git add src/features/activities src/features/polaroid tests/activities
git commit -m "feat(polaroid): admin — moderation feed, stickers, wall settings and links (D485)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The LED wall

**Files:**
- Create:
  - `src/features/polaroid/components/wall/engine.ts`
  - `src/features/polaroid/components/wall/WallClient.tsx`
  - `src/app/wall/[token]/page.tsx`
  - `src/app/api/wall/[token]/state/route.ts`
- Modify: `src/features/polaroid/client.ts`

**Interfaces:**
- Consumes:
  - Task 7: `assignColumns`, `columnCount`, `columnSpeed`, `insertionFor`, `keepAnchor`, `layoutColumn`, `rebase`, `shortestColumn`, `visibleSlots`, `arrivals`, `pruneQueue`, `spotlightMs`, `splitQueue`
  - Task 1: `usePoll`, `useWakeLock`, `json`
  - Task 8: `wallLinkState`, `wallState`, `WallState`, `WallCard`
  - Task 9: `PolaroidCard`
- Produces:
  - `createWallEngine()`
  - `WallClient({ token, initial })`
  - routes `/wall/[token]` and `/api/wall/[token]/state`

The engine is plain TypeScript outside React. It owns every moving number: column offsets (written straight to each column's `transform` once a frame), arrivals, fades and the spotlight. React only draws the snapshot it publishes 4 times a second, through `useSyncExternalStore`. This keeps 60 fps motion out of React, and keeps the hooks lint (`set-state-in-effect`, `refs`, `immutability`) satisfied without disables.

**Position model:**
- A card's top is drawn at `slot.y − column.base`.
- The column's track is translated by `−(offset − base)`.
- When an insert or removal moves `offset` by Δ, the engine moves `base` by the same Δ. Every visible card then keeps its exact screen position, both before and after React re-renders, so nothing on screen ever jumps.
- Rebasing (Review Focus 1) moves `base` by whole cycles. Draws and transforms can then disagree for one frame, so it is done only while a spotlight has the columns dimmed and blurred, or past 8,000,000 px (about 20 hours).

- [ ] **Step 1: `components/wall/engine.ts`**

```ts
import { cardRatio } from "../../lib/card";
import { arrivals, pruneQueue, spotlightMs, splitQueue } from "../../lib/spotlight";
import {
  assignColumns, columnCount, columnSpeed, insertionFor, keepAnchor, layoutColumn, rebase, shortestColumn, visibleSlots, type ColumnLayout,
} from "../../lib/wall-layout";
import type { WallSpeed } from "../../lib/settings";
import type { WallCard, WallState } from "../../lib/wire";

export type WallSlot = { key: string; card: WallCard; top: number; fading: boolean };
export type WallSnapshot = {
  colW: number;
  cardW: number;
  columns: { x: number; slots: WallSlot[] }[];
  spotlight: { card: WallCard; column: number } | null;
};

type Col = { ids: string[]; layout: ColumnLayout; offset: number; base: number; speed: number };

const FADE_MS = 700;
const SNAPSHOT_MS = 250;
const SOFT_REBASE = 1_000_000;
const HARD_REBASE = 8_000_000;
const CARD_OF_COLUMN = 0.84;
const GAP_OF_COLUMN = 0.08;

const EMPTY: WallSnapshot = { colW: 0, cardW: 0, columns: [], spotlight: null };

/** The wall's motion (D484), outside React: see the plan's position model. */
export function createWallEngine() {
  let cards = new Map<string, WallCard>();
  const known = new Map<string, WallCard>();
  let size = { w: 1920, h: 1080 };
  let columnsSetting: "auto" | number = "auto";
  let speed: WallSpeed = "medium";
  let cols: Col[] = [];
  let geometryKey = "";
  let seen: Set<string> | null = null;
  let queue: WallCard[] = [];
  let current: { card: WallCard; column: number; until: number } | null = null;
  let preparing = false;
  const fading = new Map<string, number>();
  const tracks: (HTMLDivElement | null)[] = [];
  let snapshot = EMPTY;
  const listeners = new Set<() => void>();
  let raf = 0;
  let last = 0;
  let lastSnap = 0;

  const geometry = () => {
    const n = columnCount(columnsSetting, size.w, size.h);
    const colW = size.w / n;
    return { n, colW, cardW: colW * CARD_OF_COLUMN, gap: colW * GAP_OF_COLUMN };
  };
  const heightOf = (id: string) => {
    const c = known.get(id);
    return c ? geometry().cardW * cardRatio(c.w, c.h) : 0;
  };
  const relayoutColumn = (col: Col) => { col.layout = layoutColumn(col.ids.map(heightOf), geometry().gap); };
  const onWall = () => new Set(cols.flatMap((c) => c.ids));

  /** Everything laid out afresh: the first load, a tiny wall, or new geometry (Review Focus 3). */
  function relayoutAll() {
    const g = geometry();
    const waiting = new Set([...queue.map((c) => c.id), ...(current ? [current.card.id] : [])]);
    const items = [...cards.values()].filter((c) => !waiting.has(c.id)).map((c) => ({ id: c.id, height: heightOf(c.id) }));
    cols = assignColumns(items, g.n, g.gap).map((ids, i) => ({
      ids, layout: layoutColumn(ids.map(heightOf), g.gap), offset: cols[i]?.offset ?? 0, base: cols[i]?.base ?? 0, speed: columnSpeed(speed, i, size.h),
    }));
    geometryKey = `${g.n}:${g.cardW}`;
  }

  function insert(card: WallCard, column?: number) {
    if (cards.size <= geometry().n) { relayoutAll(); return; }
    const c = column ?? shortestColumn(cols.map((x) => x.layout.cycle));
    const col = cols[c];
    if (!col) return;
    const { index, offset } = insertionFor(col.layout, col.offset, size.h, col.speed >= 0 ? 1 : -1, heightOf(card.id), geometry().gap);
    col.ids.splice(index, 0, card.id);
    relayoutColumn(col);
    col.base += offset - col.offset;
    col.offset = offset;
  }

  function remove(id: string) {
    for (const col of cols) {
      const at = col.ids.indexOf(id);
      if (at < 0) continue;
      const prev = col.layout;
      col.ids = col.ids.filter((x) => x !== id);
      relayoutColumn(col);
      const offset = keepAnchor(prev, col.layout, col.offset, size.h, (i) => (i === at ? null : i > at ? i - 1 : i));
      col.base += offset - col.offset;
      col.offset = offset;
    }
  }

  function emit() {
    const g = geometry();
    snapshot = {
      colW: g.colW,
      cardW: g.cardW,
      columns: cols.map((col, i) => ({
        x: i * g.colW,
        slots: visibleSlots(col.layout, col.offset, size.h, size.h).flatMap((s) => {
          const id = col.ids[s.index];
          const card = known.get(id);
          return card ? [{ key: `${id}:${s.repeat}`, card, top: s.y - col.base, fading: fading.has(id) }] : [];
        }),
      })),
      spotlight: current ? { card: current.card, column: current.column } : null,
    };
    listeners.forEach((l) => l());
  }

  function startSpotlight() {
    const card = queue.shift();
    if (!card) return;
    preparing = true;
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      preparing = false;
      if (!cards.has(card.id)) return;
      current = { card, column: shortestColumn(cols.map((c) => c.layout.cycle)), until: Date.now() + spotlightMs(queue.length) };
      emit();
    };
    // Shown once its photo is decoded, so it never arrives blank; 4 s at most.
    const img = new Image();
    img.src = card.src ?? "";
    const timeout = setTimeout(go, 4000);
    img.decode().then(go, go).finally(() => clearTimeout(timeout));
  }

  function frame(t: number) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
    last = t;
    const now = Date.now();
    let dirty = false;
    cols.forEach((col, i) => {
      col.offset += col.speed * dt;
      const span = col.offset - col.base;
      if (Math.abs(span) > HARD_REBASE || (current && Math.abs(span) > SOFT_REBASE)) {
        col.base += span - rebase(span, col.layout.cycle, 0);
        dirty = true;
      }
      const el = tracks[i];
      if (el) el.style.transform = `translate3d(0, ${-(col.offset - col.base)}px, 0)`;
    });
    for (const [id, at] of fading) {
      if (now - at >= FADE_MS) { fading.delete(id); remove(id); dirty = true; }
    }
    if (current && now >= current.until) {
      const done = current;
      current = null;
      if (cards.has(done.card.id)) insert(done.card, done.column);
      dirty = true;
    }
    if (!current && !preparing && queue.length) startSpotlight();
    if (dirty || t - lastSnap >= SNAPSHOT_MS) {
      lastSnap = t;
      emit();
    }
  }

  return {
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
    getSnapshot: () => snapshot,
    setTrack(i: number, el: HTMLDivElement | null) { tracks[i] = el; },
    /** A new poll answer or a new screen size. */
    update(state: WallState, viewport: { w: number; h: number }) {
      cards = new Map(state.cards.map((c) => [c.id, c]));
      for (const c of state.cards) known.set(c.id, c);
      columnsSetting = state.columns;
      speed = state.speed;
      size = viewport;
      const live = new Set(cards.keys());
      queue = pruneQueue(queue, live);
      if (current && !live.has(current.card.id)) current = null;

      const placed = onWall();
      const waiting = new Set([...queue.map((c) => c.id), ...(current ? [current.card.id] : [])]);
      const added = state.cards.filter((c) => !placed.has(c.id) && !waiting.has(c.id));
      const fresh = new Set(arrivals(seen, added, Date.now()).map((c) => c.id));
      const split = splitQueue([...queue, ...added.filter((c) => fresh.has(c.id))]);
      queue = split.spotlight;
      const direct = [...added.filter((c) => !fresh.has(c.id)), ...split.direct];
      for (const id of placed) if (!live.has(id) && !fading.has(id)) fading.set(id, Date.now());

      const g = geometry();
      if (seen === null || cards.size <= g.n || geometryKey !== `${g.n}:${g.cardW}`) relayoutAll();
      else direct.forEach((c) => insert(c));
      cols.forEach((col, i) => { col.speed = columnSpeed(speed, i, size.h); });
      seen = live;
      emit();
    },
    start() { if (!raf) raf = requestAnimationFrame(frame); },
    stop() { cancelAnimationFrame(raf); raf = 0; last = 0; },
  };
}
```

- [ ] **Step 2: `components/wall/WallClient.tsx`**

```tsx
"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Camera } from "lucide-react";
import { usePoll } from "@/lib/use-poll";
import { useWakeLock } from "@/lib/use-wake-lock";
import { handFont } from "../../font";
import { cardRatio } from "../../lib/card";
import type { WallBackground } from "../../lib/settings";
import type { WallState } from "../../lib/wire";
import { PolaroidCard } from "../PolaroidCard";
import { createWallEngine } from "./engine";

const every = () => 2000;
const onResize = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};
const viewportKey = () => `${window.innerWidth}x${window.innerHeight}`;

/** The LED polaroid wall (D484): alternating looping columns, spotlights, the walk-in QR. */
export function WallClient({ token, initial }: { token: string; initial: WallState }) {
  const { state } = usePoll<WallState>(`/api/wall/${token}/state`, initial, every, true);
  const [engine] = useState(createWallEngine);
  const sizeKey = useSyncExternalStore(onResize, viewportKey, () => "1920x1080");
  const snap = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const [started, setStarted] = useState(false);
  useWakeLock(started);

  useEffect(() => {
    const [w, h] = sizeKey.split("x").map(Number);
    engine.update(state, { w, h });
  }, [engine, state, sizeKey]);
  useEffect(() => {
    engine.start();
    return () => engine.stop();
  }, [engine]);

  const [vw, vh] = sizeKey.split("x").map(Number);
  const spot = snap.spotlight;
  const spotRatio = spot ? cardRatio(spot.card.w, spot.card.h) : 1;
  const spotW = spot ? Math.min(vw * 0.4, (vh * 0.8) / spotRatio) : 0;

  const start = () => {
    setStarted(true);
    void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className={`${handFont.variable} fixed inset-0 overflow-hidden bg-[#0d0d10] text-white ${started ? "cursor-none" : ""}`}>
      <Backdrop background={state.background} brand={state.brand} />

      {snap.columns.map((col, i) => (
        <div key={i} className="absolute top-0 h-full" style={{ left: col.x, width: snap.colW }}>
          <div ref={(el) => engine.setTrack(i, el)} className="absolute inset-x-0 top-0 will-change-transform">
            {col.slots.map((s) => (
              <div key={s.key} className="absolute transition-[top,opacity] duration-700 ease-out"
                style={{ top: s.top, left: (snap.colW - snap.cardW) / 2, opacity: s.fading ? 0 : 1 }}>
                <PolaroidCard card={s.card} width={snap.cardW} stickerSrc={state.stickerSrc} />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="pointer-events-none absolute inset-0 z-30 bg-black/45 backdrop-blur-sm transition-opacity duration-700" style={{ opacity: spot ? 1 : 0 }} />
      <AnimatePresence>
        {spot && (
          <motion.div key={spot.card.id} className="absolute left-1/2 top-1/2 z-40"
            style={{ width: spotW, marginLeft: -spotW / 2, marginTop: -(spotW * spotRatio) / 2 }}
            initial={{ y: vh * 0.6, scale: 0.5, rotate: -10, opacity: 0 }}
            animate={{ y: 0, scale: 1, rotate: 2, opacity: 1 }}
            exit={{
              x: spot.column * snap.colW + snap.colW / 2 - vw / 2, y: 0, scale: snap.cardW / spotW, rotate: spot.card.tilt, opacity: 0,
              transition: { duration: 0.9, ease: "easeInOut" },
            }}
            transition={{ type: "spring", stiffness: 110, damping: 18 }}>
            <PolaroidCard card={{ ...spot.card, tilt: 0 }} width={spotW} stickerSrc={state.stickerSrc} developing />
          </motion.div>
        )}
      </AnimatePresence>

      {state.cards.length === 0 && !spot && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-[2vh] text-center">
          <Camera className="size-[14vh] opacity-80" strokeWidth={1.25} />
          <p className="text-[7vh] leading-none" style={{ fontFamily: "var(--font-hand)", fontWeight: 700 }}>Be the first on the wall</p>
        </div>
      )}

      {state.qr && (
        <div className="absolute bottom-[3vh] right-[2vw] z-20 flex items-center gap-[1.2vh] rounded-[1.6vh] bg-white p-[1.2vh] text-black shadow-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.qr} alt="" className="size-[16vh]" />
          <div className="pr-[1vh] text-[2.6vh] font-extrabold leading-tight">Scan to<br />share</div>
        </div>
      )}

      {!started && (
        <button type="button" onClick={start}
          className="absolute inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-4 bg-black/85">
          <span className="text-5xl font-extrabold">Click to start display</span>
          <span className="text-xl opacity-70">Goes full screen and keeps the screen awake.</span>
        </button>
      )}
    </div>
  );
}

function Backdrop({ background, brand }: { background: WallBackground | null; brand: string | null }) {
  if (background?.type === "video") {
    return <video className="absolute inset-0 size-full object-cover" src={background.url} autoPlay muted loop playsInline />;
  }
  if (background?.type === "image") {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={background.url} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-black/30" />
      </>
    );
  }
  const c = brand ?? "#f97316";
  return (
    <div className="absolute inset-0"
      style={{ background: `radial-gradient(120% 90% at 20% 10%, color-mix(in oklab, ${c} 45%, transparent), transparent 60%), linear-gradient(160deg, #0d0d10 0%, color-mix(in oklab, ${c} 30%, #0d0d10) 100%)` }} />
  );
}
```

Add to `src/features/polaroid/client.ts`: `export { WallClient } from "./components/wall/WallClient";`

- [ ] **Step 3: The routes**

`src/app/api/wall/[token]/state/route.ts`:

```ts
import { json } from "@/lib/http";
import { wallLinkState, wallState } from "@/features/polaroid";

export const dynamic = "force-dynamic";

/** D484: the wall's state, or "unchanged" when the wall already has this version. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await wallLinkState(token);
  if ("refused" in link) return json({ error: link.refused }, link.refused === "missing" ? 404 : 403);
  const state = await wallState(link.activity, link.event);
  const v = new URL(req.url).searchParams.get("v");
  return json(v && v === state.key ? { now: state.now, unchanged: true } : state);
}
```

`src/app/wall/[token]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LinkRefused } from "@/features/games";
import { wallLinkState, wallState, WallClient } from "@/features/polaroid";

// Never cached: the wall is live, and an expired link must stop on the day it does.
export const dynamic = "force-dynamic";
// A wall link opens the event's live wall: keep it out of search indexes, like the display link.
export const metadata: Metadata = { title: "Polaroid wall", robots: { index: false, follow: false } };

export default async function WallPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await wallLinkState(token);
  if ("refused" in link) {
    if (link.refused === "missing") notFound();
    return link.refused === "draft"
      ? <LinkRefused title="This event is not published yet" body="Publish the event in Settings, then reload this page." />
      : <LinkRefused title="This wall link has expired" body="The event is over. Ask the organiser for a new link if you still need it." />;
  }
  return <WallClient token={token} initial={await wallState(link.activity, link.event)} />;
}
```

- [ ] **Step 4: Static checks**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: everything passes. The build lists `/wall/[token]` and `/api/wall/[token]/state` as dynamic.

- [ ] **Step 5: Check it at the LED's size (ecpkom)**

On the test wall (ecpkom must be published for the wall link; if it is not, check the wall on a published test event of the user's choosing, never `ecphub`):

1. **Seed:** add about 20 polaroids with the load script's seed command from Task 13 Step 3. Or post 6–8 through the walk-in page if you do this task before Task 13.
2. **Open the wall:** in the built-in browser, `resize_window` to 5504×2322 (the pane scales it down) and open the wall link from Setup → Links.
3. **Check each item:**
   - "Click to start display" covers the screen. Click it.
   - About 7 columns. Even columns scroll up, odd ones down, at slightly different speeds. No column has a seam where its loop restarts. Watch one full cycle.
   - The QR panel shows bottom-right when Walk-in is on, and disappears within about 2 s of turning it off.
   - **Spotlight:** post from the walk-in page. Within about 2 s the columns dim and blur, the new card appears large and develops from pale, then after about 6 s it flies towards a column. Afterwards it scrolls into view from off-screen, and nothing already visible moves.
   - **Takedown:** remove a visible card in admin. Within about 2 s it fades out and its column closes the gap smoothly.
   - **Memory:** `javascript_tool` `performance.memory?.usedJSHeapSize` before and after 3 minutes stays roughly flat, and `document.querySelectorAll("[style*='top']").length` stays bounded (about 7 columns × a few cards). Chromium only.
   - **Empty wall:** remove everything. "Be the first on the wall" shows.
4. **A 16:9 TV:** `resize_window` to 1920×1080. About 5 columns, re-laid out with no card lost.
5. Reset with `resize_window` preset `desktop`.

Take a screenshot at 5504×2322 and one mid-spotlight.

- [ ] **Step 6: Commit**

```bash
git pull --rebase --autostash
git add src/features/polaroid "src/app/wall" "src/app/api/wall"
git commit -m "feat(polaroid): the LED wall — alternating looping columns, spotlight and walk-in QR (D484)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Purge, load script, end-to-end check and docs

**Files:**
- Modify: `src/app/admin/events/[id]/actions.ts`, `package.json`, `docs/runbook.md`
- Create: `scripts/polaroid-load.mjs`
- Memory: `C:\Users\QK-LOQ_08\.claude\projects\C--Users-QK-LOQ-08-Desktop-Dev-Projects-orange-lobby\memory\polaroid-wall.md`, `MEMORY.md`

- [ ] **Step 1: Purge personal data clears polaroids (D485)**

In `src/app/admin/events/[id]/actions.ts`:
- Import `purgePolaroids` from `@/features/polaroid`.
- In `purgeEventAction`, add a line after `await purgeSetupFiles(orgId, eventId);` (files first, as the others do):

```ts
  await purgePolaroids(orgId, eventId);
```

- In the Settings page's purge description (search `src/app/admin/events/[id]/settings/page.tsx` for "Purge"), add "polaroid wall photos" to the list of what goes, in the same sentence style.

- [ ] **Step 2: The load script — `scripts/polaroid-load.mjs`**

```js
// Load and burst test for the polaroid wall (spec 2026-10-11-polaroid-wall-design.md, D405.6).
//
//   seed    <activity-id> <photo-folder> [n=150] [seconds=60]   post n polaroids over `seconds`, cycling the folder's JPEGs
//   cleanup <activity-id>                                        delete every seeded polaroid and its photo
//
// HOW TO RUN: npm run load:polaroid -- seed <id> ./some-photos 150 60
// While `seed` runs, watch the wall: spotlights queue, shorten to 3 s above 5 waiting, and past 15
// the rest slide straight into the columns; memory stays flat.
//
// SAFETY: refuses any activity whose event's slug is `ecphub` (the live event). Only ever touches
// rows it seeded itself (client_key = 'load'), and their photos.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars. Run with: npm run load:polaroid -- <command> ...");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const must = ({ data, error }) => { if (error) throw error; return data; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [command, activityId, ...rest] = process.argv.slice(2);

const activity = must(await db.from("activities").select("id, event_id, kind, events(slug, org_id)").eq("id", activityId ?? "").maybeSingle());
if (!activity || activity.kind !== "polaroid") { console.error("No polaroid activity with that id."); process.exit(1); }
if (activity.events.slug === "ecphub") { console.error("Refusing: that is the live ecphub event."); process.exit(1); }
const folder = `${activity.events.org_id}/${activity.event_id}/${activity.id}`;

if (command === "seed") {
  const [dir, nArg = "150", secondsArg = "60"] = rest;
  const photos = readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).map((f) => readFileSync(path.join(dir, f)));
  if (photos.length === 0) { console.error("No .jpg files in", dir); process.exit(1); }
  const n = Number(nArg);
  const gap = (Number(secondsArg) * 1000) / n;
  for (let i = 0; i < n; i++) {
    const photo = `${folder}/${randomUUID()}.jpg`;
    must(await db.storage.from("polaroids").upload(photo, photos[i % photos.length], { contentType: "image/jpeg" }));
    must(await db.from("polaroids").insert({
      event_id: activity.event_id, activity_id: activity.id, photo_path: photo, photo_w: 1200, photo_h: 1600,
      message: `Load test ${i + 1}`, stickers: [{ id: "star", x: 0.8, y: 0.2, scale: 0.18, rot: 12 }],
      tilt: Math.round((Math.random() * 6 - 3) * 100) / 100, client_key: "load", ip_hash: "load",
    }));
    process.stdout.write(`\rposted ${i + 1}/${n}`);
    await sleep(gap);
  }
  console.log("\ndone");
} else if (command === "cleanup") {
  const rows = must(await db.from("polaroids").select("id, photo_path").eq("activity_id", activity.id).eq("client_key", "load"));
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    must(await db.storage.from("polaroids").remove(batch.map((r) => r.photo_path)));
    must(await db.from("polaroids").delete().in("id", batch.map((r) => r.id)));
  }
  console.log(`deleted ${rows.length}`);
} else {
  console.error("Usage: seed <activity-id> <photo-folder> [n] [seconds] | cleanup <activity-id>");
  process.exit(1);
}
```

The seeded rows say 1200×1600 whatever each photo's real size is. That's fine for a load test: the card draws it contained in a 3:4 box.

In `package.json` `"scripts"`, after `"load:games"`, add:

```json
    "load:polaroid": "node --env-file=.env.local scripts/polaroid-load.mjs",
```

- [ ] **Step 3: Run the burst against the wall (ecpkom)**

1. Put 5–10 JPEGs in a scratch folder outside the repo. Never use the `digital-polaroid` repo's `server/uploads`: those may be real guests.
2. Open the ecpkom test wall at 5504×2322 as in Task 12 and start it.
3. Run `npm run load:polaroid -- seed <activity-id> <folder> 150 60`.

Watch each of these:
- Spotlights run 6 s at first, then 3 s once more than 5 are waiting.
- Beyond 15 waiting, the rest slide straight into the columns.
- No visible jumps.
- Heap stays roughly flat over the minute and the 2 minutes after (`performance.memory`).

Then run `npm run load:polaroid -- cleanup <activity-id>`. Expected: `deleted 150`.

- [ ] **Step 4: Full end-to-end pass and the release checks**

Run: `npm run check:polaroid && npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: everything passes.

Then repeat one short pass in the browser:
1. Add a fresh wall through the admin menu.
2. Post from the portal, and from the walk-in QR (scan the wall's QR URL).
3. See both on the LED wall.
4. Remove one in admin; it leaves the wall.
5. Delete the wall.
6. Delete the Task 9 SQL test activity the same way, from the admin menu, so its photos are swept.

- [ ] **Step 5: Runbook and memory**

Append to `docs/runbook.md`:

```md
## Polaroid wall on the day (D471–D485)

- **LED:** open the wall link from the activity's Setup → Links on the LED PC, click "Click to start display". It fills the screen at any size (about 7 columns on the 5504×2322 KOM LED).
- **Walk-in QR:** turn on "Walk-in link" in Setup → Wall and moderation; the QR appears on the wall within 2 s. Walk-ins are rate-limited (1 per 30 s, 10 an hour per phone, 30 an hour per IP).
- **Moderation:** posts go live at once (D473). Keep the Polaroids tab open on a crew laptop; it refreshes every 5 s. "Remove from wall" takes it off within 2 s and deletes the photo.
- **Pause:** the activity's Open switch. Closed, nobody can post (the wall keeps showing what is there). If the walk-in link is abused, close the activity or rotate the walk-in link.
- **Load test:** `npm run load:polaroid -- seed <activity-id> <jpeg-folder> 150 60`, then `cleanup <activity-id>`. Never on ecphub.
```

Write the memory file `polaroid-wall.md` (type `project`). It should say:
- what shipped (D471–D485)
- that it is the fourth activity kind under `engagement`, with feature code in `src/features/polaroid/`
- the routes
- that `ecpkom` is the test event
- that the old `tylerwcs/digital-polaroid` repo is public and its `server/uploads` may hold guest photos, so it must not be used for test data

Add its line to `MEMORY.md`.

- [ ] **Step 6: Commit**

```bash
git pull --rebase --autostash
git add "src/app/admin/events/[id]/actions.ts" "src/app/admin/events/[id]/settings/page.tsx" scripts/polaroid-load.mjs package.json docs/runbook.md
git commit -m "feat(polaroid): purge clears polaroids, burst load script and runbook (D485, D405.6)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
