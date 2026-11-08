# Booth Passport Stamp Artwork, Show my QR and Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Booths can carry the designer's stamp artwork. The passport page gets a "Show my QR" dialog that notices a booth's scan and plays a "grow from centre" reveal. Stamps collected while the dialog was closed replay on the next visit. Every passport loses the booth count, the stamp times and the name/glyph on the completed card.

**Architecture:**
- **Pure logic** in `src/features/activities/lib/booths.ts`, unit-tested:
  - which look a passport uses;
  - which stamps are unseen;
  - which stamps are newer than a cursor;
  - when the QR button shows.
- **Data:** two columns, `booths.stamp_image_url` and `booth_stamps.seen_at` (back-filled).
- **Server actions:** two portal actions, polling for new stamps after a cursor and marking stamps seen, both token-authorised. Neither writes in a draft preview.
- **Client:** client components in `kinds/passport/` for the dialog, polling and reveal. The grid stays server-rendered and is refreshed with `router.refresh()` after each reveal.

**Tech Stack:** Next.js (repo version — read `node_modules/next/dist/docs/` first), React, TypeScript, Supabase Postgres + Storage, Tailwind, vitest (node environment, pure-function tests only).

**Spec:** `docs/superpowers/specs/2026-11-08-passport-stamp-artwork-design.md`

## Global Constraints

- Decisions are numbered from the next free D-number (D844 at time of writing). The migration is the next free number (0132 at time of writing). Other sessions push to `main`, so check `git log` and `supabase/migrations/` before naming either.
- Work on `main`. Do not create a worktree.
- New passport code lives in `src/features/activities/kinds/passport/`, and its logic lives in `src/features/activities/lib/booths.ts`.
- Colours come from theme tokens. Only the white disc and the gold outline are fixed. Mark them `/* theme-fixed: … */`, as the QR's white tile is (D627).
- Gold outline: gradient `#C08552` → `#F0C88E`.
- Reveal timings: scrim fades in over 0.3 s to about 0.75 opacity. Then the disc scales 0.9 → 1 over about 0.35 s, the outline draws over about 0.9 s from 12 o'clock clockwise with a leading glowing dot, and the artwork grows from the centre over about 0.7 s. "{booth name}" + "Stamp collected" holds for about 1.5 s, then the disc moves into its slot over about 0.55 s. Durations may vary by ±20%.
- Copy (English, hard-coded like the rest of the passport):
  - "Show my QR", "Show this to the booth", "Waiting for the booth…", "Stamp collected".
  - Artwork field: label "Stamp artwork (optional)", hint "A transparent PNG, square, about 1000 px. Shown once this booth is stamped."
- Polling interval: about 2 s, only while the dialog is open and `document.visibilityState === "visible"`.
- `prefers-reduced-motion: reduce`: no outline, grow or move. The stamped disc fades in on its slot, with the name and "Stamp collected" shown briefly.
- A draft preview (`isDraftPreview(slug)`) never writes `seen_at`, and its page load never replays.
- Test on a test event, never on `ecphub` or `uobih2`.

## Review Focus

1. **Repeat scan while the dialog is open.** A duplicate creates no row and its `stamped_at` is old, so nothing reveals and the dialog stays open. Pinned in Task 2 (`revealsAfter` ignores stamps at or before the cursor).
2. **Several unseen stamps on load.** They play one after another in the order collected, and each stays a "?" until its own reveal lands. Pinned in Task 2 (`unseenReveals` ordering, `asShown` hides only unseen).
3. **Passport complete before every booth is stamped** (`stamps_required` below the booth count). The QR button stays, and extra stamps still reveal. Pinned in Task 2 (`qrButtonShown`).
4. **A booth stamp undone** (`deleteStamp`) between poll and reveal. No crash: the reveal plays, the refresh shows "?", and the next load has nothing to replay. Pinned in Task 2 (`unseenReveals` reads only rows that exist).
5. **A mixed passport** where some booths have artwork and some don't. Every slot is round, and a booth without artwork reveals with `StampGlyph`. Pinned in Task 2 (`passportLook`, `Reveal.image` null).

---

### Task 1: Columns, back-fill and types

**Files:**
- Create: `supabase/migrations/0132_passport_stamp_artwork.sql` (renumber if taken)
- Modify: `src/lib/types.ts` (the `Booth` type at about line 291, the `BoothStamp` type at about line 326)
- Modify: `src/lib/storage.ts:17-20` (`ImageKind`)
- Modify: `tests/activities/booths.test.ts:5-10` (fixtures gain the new fields)

**Interfaces:**
- Produces:
  - `Booth.stamp_image_url: string | null`
  - `BoothStamp.seen_at: string | null`
  - `ImageKind` includes `"booth-stamp"`

- [ ] **Step 1: Write the migration**

```sql
alter table booths add column stamp_image_url text;
alter table booth_stamps add column seen_at timestamptz;
-- Existing stamps were collected before the reveal existed: nobody gets a backlog.
update booth_stamps set seen_at = stamped_at where seen_at is null;
```

- [ ] **Step 2: Add the fields to `Booth` and `BoothStamp`**

Add a doc comment to each, citing the D-number. Add `"booth-stamp"` to `ImageKind`, and update the `booth()` and `stamp()` fixtures in `tests/activities/booths.test.ts` with `stamp_image_url: null` and `seen_at: stamped_at`.

- [ ] **Step 3: Type-check and run the existing tests**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

- [ ] **Step 4: Apply the migration to Supabase**

Use the Supabase MCP `apply_migration` tool, project `wfmqwwcolfigjylkgrsv`.

Verify:
```sql
select count(*) from booth_stamps where seen_at is null;
```
Expected: `0`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0132_passport_stamp_artwork.sql src/lib/types.ts src/lib/storage.ts tests/activities/booths.test.ts
git commit -m "feat(passport): stamp artwork and seen columns (D844, 0132)"
```

---

### Task 2: Passport logic: look, reveals, cursor, QR button

**Files:**
- Modify: `src/features/activities/lib/booths.ts`
- Test: `tests/activities/booths.test.ts`

**Interfaces:**
- Consumes: Task 1 fields.
- Produces:
  - `PassportCell` gains `stampId: string | null` and `seenAt: string | null`. `buildPassport` fills them from the stamp row.
  - `type Reveal = { stampId: string; boothId: string; name: string; image: string | null; stampedAt: string }`
  - `passportLook(p: Passport): "round" | "boxes"`: `"round"` when any cell's booth has a `stamp_image_url`.
  - `unseenReveals(p: Passport): Reveal[]`: stamped cells with `seenAt === null`, sorted by `stampedAt` ascending.
  - `revealsAfter(p: Passport, after: string | null): Reveal[]`: stamped cells with `stampedAt > after` (all stamped cells when `after` is null), ascending.
  - `latestStampAt(p: Passport): string | null`
  - `asShown(p: Passport, hidden: ReadonlySet<string>): Passport`: cells whose `stampId` is in `hidden` get `stampedAt`, `stampId` and `seenAt` set to null. `collected`, `target`, `remaining`, `complete` and `completedAt` are untouched, so the progress card counts the stamp.
  - `qrButtonShown(p: Passport, isOpen: boolean): boolean`: true when `isOpen` and at least one cell is unstamped.

- [ ] **Step 1: Write the failing tests**

```ts
describe("passportLook", () => {
  it("is boxes when no booth has artwork", () => expect(passportLook(buildPassport([booth("b1")], [], null))).toBe("boxes"));
  it("is round when any booth has artwork", () => {
    const art = { ...booth("b2", 1), stamp_image_url: "https://x/b2.png" };
    expect(passportLook(buildPassport([booth("b1"), art], [], null))).toBe("round");
  });
});

describe("unseenReveals", () => {
  it("lists unseen stamps oldest first, with name and image", () => {
    const art = { ...booth("b2", 1), stamp_image_url: "https://x/b2.png" };
    const p = buildPassport([booth("b1"), art], [
      { ...stamp("b2", "a1", "2026-11-08T12:00:00Z"), seen_at: null },
      { ...stamp("b1", "a1", "2026-11-08T11:00:00Z"), seen_at: null },
    ], null);
    expect(unseenReveals(p).map((r) => [r.boothId, r.image])).toEqual([["b1", null], ["b2", "https://x/b2.png"]]);
  });
  it("skips seen stamps", () => {
    const p = buildPassport([booth("b1")], [stamp("b1", "a1", "2026-11-08T11:00:00Z")], null); // fixture: seen_at = stamped_at
    expect(unseenReveals(p)).toEqual([]);
  });
});

describe("revealsAfter", () => {
  const p = buildPassport([booth("b1"), booth("b2", 1)], [
    stamp("b1", "a1", "2026-11-08T11:00:00Z"), stamp("b2", "a1", "2026-11-08T12:00:00Z"),
  ], null);
  it("returns only stamps after the cursor", () => expect(revealsAfter(p, "2026-11-08T11:00:00Z").map((r) => r.boothId)).toEqual(["b2"]));
  // Review Focus 1: a repeat scan keeps its original stamped_at, so it never passes the cursor.
  it("returns nothing when the cursor is the latest stamp", () => expect(revealsAfter(p, latestStampAt(p))).toEqual([]));
  it("returns everything stamped for a null cursor", () => expect(revealsAfter(p, null)).toHaveLength(2));
});

describe("asShown", () => {
  it("hides only the named stamps and keeps the count", () => {
    const p = buildPassport([booth("b1"), booth("b2", 1)], [stamp("b1", "a1", "2026-11-08T11:00:00Z"), stamp("b2", "a1", "2026-11-08T12:00:00Z")], null);
    const shown = asShown(p, new Set(["b2-a1"]));
    expect(shown.cells.map((c) => c.stampedAt)).toEqual(["2026-11-08T11:00:00Z", null]);
    expect(shown.collected).toBe(2);
  });
});

describe("qrButtonShown", () => {
  // Review Focus 3: complete at 1 of 2 booths, but booth 2 can still stamp.
  it("stays while a booth is unstamped even when the card is complete", () => {
    const p = buildPassport([booth("b1"), booth("b2", 1)], [stamp("b1", "a1", "2026-11-08T11:00:00Z")], 1);
    expect(p.complete).toBe(true);
    expect(qrButtonShown(p, true)).toBe(true);
  });
  it("goes once every booth is stamped", () => {
    const p = buildPassport([booth("b1")], [stamp("b1", "a1", "2026-11-08T11:00:00Z")], null);
    expect(qrButtonShown(p, true)).toBe(false);
  });
  it("is hidden while the passport is closed", () => expect(qrButtonShown(buildPassport([booth("b1")], [], null), false)).toBe(false));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/activities/booths.test.ts`
Expected: FAIL, with `passportLook` (and the others) not exported.

- [ ] **Step 3: Implement the interfaces above in `booths.ts`**

Use the cell's `stampId` and `seenAt` from the stamp row. `Reveal.name` is `booth.name`, and `Reveal.image` is `booth.stamp_image_url`. Compare ISO strings by `Date.parse`, not by lexical order: the database may return `+00:00` rather than `Z`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/activities/booths.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/activities/lib/booths.ts tests/activities/booths.test.ts
git commit -m "feat(passport): reveal, cursor and look rules (D845)"
```

---

### Task 3: Server side: mark seen, poll, booth artwork save

**Files:**
- Modify: `src/features/activities/db/booths.ts` (add `markStampsSeen`; widen the `updateBooth` patch)
- Modify: `src/features/activities/portal/actions.ts` (two new actions)
- Modify: `src/features/activities/admin/actions.ts:983-1010` (`renameBoothAction` and `deleteBoothAction`)
- Modify: `src/features/activities/index.ts` / `client.ts` (export whatever the passport components import, following the existing barrel split)

**Interfaces:**
- Consumes: Task 2 `Reveal`, `revealsAfter`, `buildPassport`.
- Produces:
  - `markStampsSeen(attendeeId: string, stampIds: string[]): Promise<void>`: sets `seen_at = now()` where `id in stampIds and attendee_id = attendeeId and seen_at is null`.
  - `updateBooth(id, eventId, activityId, patch: { name; location; location_url; stamp_image_url?: string | null })`
  - `pollRevealsAction(slug: string, token: string, activityId: string, after: string | null): Promise<Reveal[]>`
    - Loads with `loadPortalAttendee`.
    - Finds the passport among the attendee's eligible passports (the same rule as `loadActivityEntries`). It returns `[]` when that passport is missing, ineligible or closed.
    - Builds the passport from `listPassportBooths` + `stampsForAttendee` and returns `revealsAfter(p, after)`.
  - `markStampsSeenAction(slug: string, token: string, stampIds: string[]): Promise<void>`: does nothing when `await isDraftPreview(slug)`; otherwise calls `markStampsSeen(attendee.id, stampIds)`. Cap `stampIds` at 50.

- [ ] **Step 1: Implement `markStampsSeen` and the wider `updateBooth` patch**

`markStampsSeen` is scoped by `attendee_id`, so a forged id belonging to another attendee updates nothing.

- [ ] **Step 2: Implement the two portal actions**

Follow `bookAction`'s auth shape. Neither action redirects, and neither calls `revalidatePath`: the client calls `router.refresh()` itself.

- [ ] **Step 3: Save the artwork in `renameBoothAction`**

Use `nextImage(fd, "stamp_image", booth.stamp_image_url, { orgId: ev.org_id, eventId: ev.id, kind: "booth-stamp" })`, then `updateBooth(..., { ..., stamp_image_url: image.url })`, then `deleteEventImage(image.stale)` after the write.

`renameBoothAction` needs the current booth: read it with `getBoothInEvent(boothId, ev.id)` and check `activity_id === activityId`. When `deleteBoothAction` removes a booth, delete its image afterwards; read the booth before the delete for that.

- [ ] **Step 4: Type-check and run all tests**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/activities/db/booths.ts src/features/activities/portal/actions.ts src/features/activities/admin/actions.ts src/features/activities/index.ts src/features/activities/client.ts
git commit -m "feat(passport): poll for new stamps, mark seen, save booth artwork (D846, D847)"
```

---

### Task 4: Admin: stamp artwork on each booth

**Files:**
- Modify: `src/features/activities/kinds/passport/BoothList.tsx:108-116` (edit form) and the row (thumbnail)

**Interfaces:**
- Consumes: Task 3 `renameBoothAction` reading `stamp_image` / `stamp_image_remove`.

- [ ] **Step 1: Add the `ImageField` to the edit form**

Add `<ImageField label="Stamp artwork (optional)" name="stamp_image" url={b.stamp_image_url} description="A transparent PNG, square, about 1000 px. Shown once this booth is stamped." />` after the map link field. `ImageField` already handles preview and remove through `stamp_image_remove`.

- [ ] **Step 2: Add a thumbnail to the row**

Show a 32 px round thumbnail of `b.stamp_image_url` beside the booth name when it is set. Use an `<img>` with `alt=""`, since the name sits next to it.

- [ ] **Step 3: Check it in the browser**

On a test event's passport:
1. Upload `stamp-jom.png` (kept in `.superpowers/brainstorm/1156-1794126020/content/`).
2. Save. The thumbnail shows.
3. Reopen the form. The preview shows.
4. Tick remove and save. The thumbnail is gone, and the object is deleted from Storage.

- [ ] **Step 4: Commit**

```bash
git add src/features/activities/kinds/passport/BoothList.tsx
git commit -m "feat(passport): upload stamp artwork per booth (D848)"
```

---

### Task 5: Every passport: removals and round slots

**Files:**
- Modify: `src/features/activities/kinds/passport/PassportBody.tsx` (drop the "N booths to visit" `InfoRows` entry; keep the groups row)
- Modify: `src/features/activities/kinds/passport/PassportGrid.tsx`
- Create: `src/features/activities/kinds/passport/StampDisc.tsx`

**Interfaces:**
- Consumes: Task 2 `passportLook`, `PassportCell.booth.stamp_image_url`.
- Produces:
  - `StampDisc({ image, name, deg, className }: { image: string | null; name: string; deg: number; className?: string })`: a white disc (`theme-fixed`) with the artwork at 92%, or `StampGlyph` when `image` is null. The reveal in Task 6 uses it too.
  - `StampGlyph` is exported from `PassportGrid.tsx`.

- [ ] **Step 1: Make the removals in `PassportGrid.tsx`**

Remove:
- the `shortTime(cell.stampedAt)` lines in both cell shapes;
- the `StampGlyph` and attendee name in `CompleteHeader`;
- the "A new chop appears the next time you open this page." line.

Keep `attendeeName` as the locked-view switch, but stop passing it into `CompleteHeader`. Rewrite `CompleteHeader`'s doc comment: the name was dropped by the user's call (D849), so a forwarded screenshot now looks genuine.

Change the subtitle to "Visit a booth and show your QR to collect a stamp."

- [ ] **Step 2: Add `RoundGrid`, used when `passportLook(passport) === "round"`**

- Two columns of square slots, with a gap of `gap-3.5`.
- Unstamped: a dashed circle (`border-2 border-dashed`, a token colour that reads on the page) holding a large "?", the booth name and, if set, the location.
- Stamped: `StampDisc` with `TILTS[i % 4]`.
- An odd last slot is centred, not spanned.
- `MapLink` stays under the slot when `location_url` is set.

`BoothGrid` stays for `"boxes"`.

- [ ] **Step 3: Check it in the browser on a dark-theme test event**

Check four cases:
- a passport without artwork looks as before, minus the times;
- a passport with artwork shows "?" slots;
- once stamped, the disc and art show;
- the completed card has no name or glyph.

Screenshot each.

- [ ] **Step 4: Run lint and tests, then commit**

```bash
npx tsc --noEmit && npm test && npm run lint
git add src/features/activities/kinds/passport/
git commit -m "feat(passport): round stamp slots; drop booth count, stamp times and name on the full card (D849, D850)"
```

---

### Task 6: Show my QR, polling, the reveal and replay

**Files:**
- Create: `src/features/activities/kinds/passport/PassportQr.tsx` (client: the button, the dialog and the polling)
- Create: `src/features/activities/kinds/passport/StampReveal.tsx` (client: the queue and the animation)
- Create: `src/features/activities/kinds/passport/PassportLive.tsx` (client: holds the queue and the cursor; renders `PassportQr` and `StampReveal`)
- Modify: `src/features/activities/kinds/passport/PassportBody.tsx`
- Modify: `src/features/activities/portal/ActivityPage.tsx:69-70` (pass `slug`, `token`, `qr`, `preview`)

**Interfaces:**
- Consumes:
  - Task 2: `unseenReveals`, `latestStampAt`, `asShown`, `qrButtonShown`.
  - Task 3: `pollRevealsAction`, `markStampsSeenAction`.
  - Task 5: `StampDisc`.
- Produces:
  - `PassportBody({ entry, attendeeName, slug, token, qr, preview })`, where `qr: string` is a data URL and `preview: boolean`.
  - `PassportLive({ slug, token, activityId, qr, name, initial, cursor, showButton })`, where `initial: Reveal[]`, `cursor: string | null` and `showButton: boolean`.
  - Reveal targets: each slot root carries `data-booth-slot={booth.id}`, so `StampReveal` can measure where to land.

- [ ] **Step 1: Wire up the server side**

In `ActivityPage.tsx`, for `case "passport"`:
- compute `qr = await qrDataUrl(attendeeLink(await eventAddress(event), attendee.token))`, the same as `me/page.tsx:45`;
- compute `preview = await isDraftPreview(slug)`.

In `PassportBody`:
1. `initial = preview ? [] : unseenReveals(passport)`.
2. Render `PassportGrid` with `asShown(passport, new Set(initial.map((r) => r.stampId)))`.
3. Render `PassportLive` with `cursor = latestStampAt(passport)` and `showButton = qrButtonShown(passport, activity.is_open)`.

- [ ] **Step 2: Build `PassportQr`**

- A sticky full-width button at the foot of the page (as in `BookingBody`: `sticky bottom-4`), labelled "Show my QR".
- It opens a `Dialog` showing the QR image (same size and white tile as `BadgeQrDialog`), the title "Show this to the booth", and "Waiting for the booth…" with a pulsing dot.
- While the dialog is open and the page is visible, it calls `pollRevealsAction(slug, token, activityId, cursor)` every ~2 s, and never overlaps requests.
- On a non-empty result it closes the dialog and hands the reveals to `PassportLive`.

- [ ] **Step 3: Build `StampReveal`**

- Plays its queue one at a time with the Global Constraints timings: scrim, disc, then the SVG circle outline drawn by `stroke-dashoffset` with the dot following its angle. The artwork's `mask-image` is a radial gradient growing from 0% to about 75%. Then the caption, then the move to `[data-booth-slot=…]`.
- Under reduced motion, it uses the short fade instead.
- After the queue drains:
  1. `await markStampsSeenAction(slug, token, ids)`;
  2. set the cursor to the last reveal's `stampedAt`;
  3. `router.refresh()`.
- The grid then shows the stamp from the server.
- A slot it can't find (the booth was deleted or the layout changed) ends the move at the disc's own place, then fades out.

- [ ] **Step 4: Check it end to end in the browser on a test event with artwork and a dark theme**

Check:
- open the dialog, then stamp from the booth scanner in another tab: the dialog closes and the reveal plays into the right slot;
- a repeat scan from the booth: nothing plays, and the dialog stays open;
- close the dialog, stamp the second booth, reload: the second booth replays once, then stays stamped on another reload;
- the same flow in a draft preview: nothing replays on load;
- a passport without artwork: the reveal shows `StampGlyph`;
- the console has no errors.

Screenshot the reveal mid-grow and the landed state.

- [ ] **Step 5: Run lint and tests, then commit**

```bash
npx tsc --noEmit && npm test && npm run lint
git add src/features/activities/kinds/passport/ src/features/activities/portal/ActivityPage.tsx
git commit -m "feat(passport): Show my QR with a live stamp reveal, replayed for stamps not yet seen (D851-D853)"
```
