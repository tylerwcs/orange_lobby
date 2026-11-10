# Personality Passport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every booth passport's attendee page becomes an immersive 3D portrait passport. Where the organiser switches the personality test on, the guest answers one question per page, names the passport, and sees their personality fill in the holder page before stamps land on the page above.

**Architecture:**
- **New feature `src/features/passport-test/`** holds:
  - the test's settings (jsonb on `activities`);
  - the travel set;
  - the scoring and lock rules;
  - the results table's reads and writes;
  - the portal save action;
  - the admin cards.
  - It never imports `@/features/activities`, because activities imports it, as with polaroid.
- **The book** (3D scene, its 2D fallback, page painters and pure geometry) lives in the passport kind, `src/features/activities/kinds/passport/book/`, because it is every passport's view, test or not.
- **Pages** are painted on 2D canvases. The 3D scene uses them as `CanvasTexture`s, and the fallback shows the same canvases flat. One painter serves both.

**Tech Stack:** Next.js 16.3.4 (read `node_modules/next/dist/docs/` first), React 19.2.8, TypeScript, three ^0.186.1 + @react-three/fiber ^9.8.1 (no drei), zod 4, sharp, Supabase Postgres + Storage, Tailwind, vitest (node, pure functions only), `scripts/*-db-check.mjs` for SQL.

**Spec:** `docs/superpowers/specs/2026-11-09-personality-passport-design.md` (goal numbers below are the spec's). The approved look is the sketch, copied into the repo in Task 1 as `docs/superpowers/specs/2026-11-09-personality-passport-sketch.html`. When the plan says "as the sketch", open it.

## Global Constraints

- D-numbers D870–D889 are the spec's; cite them in commits and doc comments. Migration `0134_passport_test.sql`. Other sessions push to `main`, so check `git log origin/main` and `supabase/migrations/` before naming either; renumber if taken.
- Work on `main`, no worktree. Commit per task; push only when the user says.
- Words: "personality test", never "quiz", "score", "correct" or "wrong" anywhere a guest or organiser reads.
- Feature imports go through `@/features/passport-test` (server) or `@/features/passport-test/client` (browser/pure). Lint enforces this (D403).
- Settings are read only through `readPassportTest(raw)`, which never throws and fills every default (as `readPolaroidSettings`).
- Limits: 5–12 questions, exactly 4 answers each, 2–8 personalities, 6 traits with exactly 3 ticked, holder name at most 40 characters.
- Default labels: `KEY TRAITS`, `TRAVEL STYLE`, `LIKELY TO SAY`.
- Images: question scenes and personality pictures are stored at most 1600 px on the long side as WebP (`passport-scene`, `passport-character`, `passport-crest`). SVG is stored as is.
- Saving a result: rate limit `allow(\`passport-test:${token}\`, 10, 60_000)`. Refused while `!activity.is_open` (the user's call, goal 11). A draft preview (`isDraftPreview(slug)`) saves nothing.
- 3D code loads only through `next/dynamic(..., { ssr: false })` after `hasWebGL()` (copy the check from `src/features/qualifier/game/quality.ts` into the book; it cannot import qualifier internals).
- `prefers-reduced-motion: reduce`: page turns become crossfades, and the reveal shows the finished page.
- Test on `zz-queue-test` ("ZZ Booth Passport", activity `77ab95f9…`, booths zzpasstest01/02) only. Never `ecphub`, never `uobih2`.
- Copy, exact:
  - closed: "Your passport opens at the event";
  - closed mid-test: "The passport has closed";
  - name page: "THIS PASSPORT BELONGS TO", button "That's me";
  - banner: "YOU'RE A";
  - bar: "Show my QR", "Booths";
  - admin: "Personality test", "Use the travel set", "N guests have taken this test".

## Review Focus

1. **Double tap on "That's me", or two tabs.** The second save finds the stored row and returns the stored personality as success, never an error or a second row. Pinned in Task 3 (`saveOutcome` on a conflict) and in Task 1's db check (unique constraint).
2. **An organiser changes structure after results exist** (re-points an answer, adds or deletes a question, deletes a personality). It is refused with "N guests have taken this test", while text edits pass. Pinned in Task 2 (`lockedChange`).
3. **Stamps a booth gave before the guest finished the test.** They don't play on the test pages. They play one by one right after the reveal and land on the stamp page. Pinned in Task 5 (`heldReveals`), wired in Task 7.
4. **Long or odd text:**
   - a 40-character name;
   - a 60-character answer;
   - an emoji in the name;
   - a personality name like "FLAVOUR HUNTER".
   - Each shrinks to its minimum size, then wraps to two lines at most, never overflowing the page. Pinned in Task 5 (`fitText`).
5. **A missing or broken image** (none uploaded, deleted, or failing to load). The page shows the plain tinted panel with the answer emoji, never a broken-image frame. Pinned in Task 6 (`sceneArt` falls back), checked in Task 7's browser step.

---

### Task 1: Table, column, types, sketch copy, db check

**Files:**
- Create: `supabase/migrations/0134_passport_test.sql`
- Create: `scripts/passport-test-db-check.mjs`; add `"check:passport-test"` to `package.json`
- Create: `docs/superpowers/specs/2026-11-09-personality-passport-sketch.html` (copy of `.superpowers/brainstorm/2340-1794200510/content/passport-3d-sketch-v3.html`)
- Modify: `src/lib/types.ts` (`Activity`, next to `polaroid?` at about line 445)
- Modify: `src/lib/storage.ts:17-20` (`ImageKind`)

**Interfaces:**
- Produces:
  - `Activity.passport_test?: Record<string, unknown> | null`;
  - `ImageKind` gains `"passport-scene" | "passport-character" | "passport-crest"`;
  - table `passport_results (id uuid pk default gen_random_uuid(), org_id, event_id, activity_id → activities on delete cascade, attendee_id → attendees on delete cascade, personality_id text not null, answers jsonb not null, holder_name text not null, created_at timestamptz default now(), unique (activity_id, attendee_id))`, RLS on with no policies, index on `(activity_id)`.

- [ ] **Step 1:** Write the migration. Include `alter table activities add column passport_test jsonb;` and the table, with `org_id`/`event_id` referencing as `booth_stamps` does (read `0132_passport_stamp_artwork.sql` and the `booth_stamps` migration for the shape).
- [ ] **Step 2:** Write the db check, modelled on `scripts/lanes-db-check.mjs` (own draft event, random slug, deleted in `finally`). It proves:
  1. a result inserts;
  2. a second insert for the same activity and attendee is refused with `23505`;
  3. deleting the attendee deletes the result;
  4. deleting the activity deletes its results;
  5. the anon key reads no rows.
- [ ] **Step 3:** Apply the migration with the Supabase MCP `apply_migration`, then run `npm run check:passport-test`. Expected: every line `PASS`.
- [ ] **Step 4:** Add the type and image kinds, and copy the sketch. Run `npx tsc --noEmit && npm test`. Expected: clean.
- [ ] **Step 5:** Commit `feat(passport): results table and test column (D882, D884)`.

### Task 2: Test settings, travel set, rules

**Files:**
- Create: `src/features/passport-test/lib/settings.ts`, `lib/travel-set.ts`, `lib/rules.ts`, `lib/shades.ts`, `client.ts`, `index.ts`
- Test: `tests/passport-test/settings.test.ts`, `tests/passport-test/rules.test.ts`

**Interfaces:**
- Produces (all from `@/features/passport-test/client`):
  ```ts
  type TestAnswer = { id: string; text: string; icon: string | null; personality: string };
  type TestQuestion = { id: string; scene: string; text: string; image: string | null; answers: TestAnswer[] };
  type Personality = { id: string; name: string; colour: string; picture: string | null; traits: string[]; ticked: number[]; style: string; say: [string, string]; blurb: string };
  type PassportTest = { on: boolean; questions: TestQuestion[]; personalities: Personality[]; labels: [string, string, string]; cover: { colour: string | null; crest: string | null } };
  readPassportTest(raw: unknown): PassportTest
  newTestId(prefix: "q" | "a" | "p"): string        // `${prefix}-` + 8 lowercase hex
  travelSet(): PassportTest                          // on: false, fresh ids
  testProblems(t: PassportTest): string[]            // empty = may be on
  lockedChange(before: PassportTest, after: PassportTest, results: number): string | null
  personalityShades(hex: string): { accent: string; dark: string; light: string }
  coverColour(t: PassportTest, brand: string | null): string
  MIN_QUESTIONS = 5, MAX_QUESTIONS = 12, ANSWERS = 4, MIN_PERSONALITIES = 2, MAX_PERSONALITIES = 8, MAX_HOLDER_NAME = 40
  DEFAULT_LABELS = ["KEY TRAITS", "TRAVEL STYLE", "LIKELY TO SAY"]
  ```

- [ ] **Step 1: Write the failing tests**
  - `readPassportTest(null)` gives `{ on: false, questions: [], personalities: [], labels: DEFAULT_LABELS, cover: { colour: null, crest: null } }`. A damaged question (no id) is dropped while the rest survive, and `labels: 7` falls back to the defaults.
  - `travelSet()` has 10 questions, each with 4 answers, and 4 personalities named `TRAILBLAZER`, `NAVIGATOR`, `DAYDREAMER`, `FLAVOUR HUNTER`. Each question's answers point to 4 different personalities, `testProblems(travelSet())` is `[]`, and every `picture` starts with `/passport/characters/`. Two calls give different ids.
  - `testProblems`:
    - 4 questions gives a sentence naming "5";
    - an answer pointing to an unknown personality is reported;
    - duplicate personality names (case-insensitive) are reported;
    - a personality with 2 ticked traits is reported.
  - `lockedChange(a, b, 0)` is `null` for any change.
  - With `results = 3`, `lockedChange` returns `"3 guests have taken this test"` and the reason for each of:
    - an answer's personality changed;
    - a question added;
    - a question removed;
    - questions reordered;
    - a personality removed.
  - With `results = 3`, `lockedChange` is `null` for:
    - changed question text, scene, image or answer text;
    - personality name, colour, traits, ticked, style, say or blurb;
    - labels and cover;
    - an added personality.
  - `personalityShades("#E8693C")`: `dark` has contrast ≥ 7 with `light` (use `contrastRatio`/`hexToRgb` from `@/lib/contrast`).
  - `coverColour` with a null override and brand `#FFD54F` returns a colour on which gold `#D9B26A` has contrast ≥ 3 (use `darkenUntilReadable(fill, 3)` against the gold). An override wins, after the same darkening.
- [ ] **Step 2:** Run `npx vitest run tests/passport-test`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement.
  - **Schema:** zod with per-field `.catch`, as `src/features/polaroid/lib/settings.ts`. Arrays drop invalid items rather than failing whole.
  - **Picture field:** a `picture` accepts an `https:` URL or a path matching `^/passport/characters/[a-z-]+\.svg$`.
  - **Travel set:** copy from the sketch's `TYPES` and `QUESTIONS`: names, traits, ticked, `style`, `say`, question `scene`, `q` → `text`, and option `label` → `text` / `ic` → `icon`. The colour is the sketch's `accent`, and `blurb` is a one-liner you write per personality.
  - **Shades:** use `rgbToOklab`/`oklabToRgb` for `dark` (L≈0.32) and `light` (L≈0.93), keeping hue.
- [ ] **Step 4:** Run `npx vitest run tests/passport-test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(passport): personality test settings, travel set and lock rules (D884, D886, D887)`.

### Task 3: Scoring, results db, portal save action

**Files:**
- Create: `src/features/passport-test/lib/score.ts`, `db/results.ts`, `actions.ts`
- Modify: `src/features/passport-test/client.ts`, `index.ts`
- Test: `tests/passport-test/score.test.ts`

**Interfaces:**
- Consumes: `PassportTest`, `readPassportTest` (Task 2); `loadPortalAttendee`, `isDraftPreview` from `@/lib/portal`; `categoryMatches` from `@/lib/agenda`; `allow` from `@/lib/ratelimit`.
- Produces:
  ```ts
  type TestPick = { questionId: string; answerId: string };
  checkPicks(t: PassportTest, picks: TestPick[]): string | null   // null = one valid pick per question, in question order
  pickPersonality(t: PassportTest, picks: TestPick[]): string     // personality id (D883)
  cleanHolderName(typed: string, registered: string): string
  type PassportResult = { id: string; activity_id: string; attendee_id: string; personality_id: string; answers: TestPick[]; holder_name: string; created_at: string };
  type SaveResult = { ok: true; personalityId: string; holderName: string } | { ok: false; reason: "closed" | "off" | "invalid" | "busy" | "missing" };
  saveOutcome(existing: PassportResult | null, computed: { personalityId: string; holderName: string }): SaveResult  // pure: the stored row wins
  // db/results.ts (server)
  getTestActivity(activityId: string, eventId: string): Promise<Activity | null>   // kind = passport only
  getResult(activityId: string, attendeeId: string): Promise<PassportResult | null>
  insertResult(row: Omit<PassportResult, "id" | "created_at"> & { org_id: string; event_id: string }): Promise<PassportResult | null>  // null on 23505
  listResults(activityId: string): Promise<PassportResult[]>
  countResults(activityId: string): Promise<number>
  clearResult(activityId: string, attendeeId: string): Promise<void>
  clearAllResults(activityId: string): Promise<void>
  saveTest(activityId: string, eventId: string, t: PassportTest): Promise<void>
  // actions.ts ("use server")
  savePassportResultAction(slug: string, token: string, activityId: string, input: { picks: TestPick[]; holderName: string }): Promise<SaveResult>
  ```

- [ ] **Step 1: Write the failing tests**
  - `pickPersonality`:
    - 6 picks for A and 4 for B gives A;
    - 5 and 5 with the last pick B gives B;
    - 5 and 5 with the last pick A and the one before B gives A;
    - a 3-way tie gives whichever tied personality was picked latest.
  - `checkPicks` returns a sentence for:
    - a missing question;
    - two picks for one question;
    - an answer id from another question;
    - picks out of question order.
  - `checkPicks` returns `null` for a full, ordered set.
  - `cleanHolderName("  Ana   Lee ", "X")` → `"Ana Lee"`; `""` → the registered name; 50 characters → the first 40, trimmed. Emoji are kept and counted with `Array.from`, never split mid-surrogate.
  - `saveOutcome(existingRow, computed)` returns the existing row's personality and name; `saveOutcome(null, c)` returns `c`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement the pure functions. Then write the db functions (service client, as `src/features/polaroid/db/polaroids.ts`) and the action. The action:
  1. loads the attendee;
  2. on rate limit, returns `busy`;
  3. loads the activity; if it is missing or the category doesn't match, returns `missing`;
  4. if the test is off, returns `off`;
  5. if the passport is not open, returns `closed`;
  6. if `checkPicks` finds a problem, returns `invalid`;
  7. computes the personality;
  8. in a draft preview, returns `ok` without writing;
  9. otherwise inserts, and on conflict reads the stored row and returns `saveOutcome(stored, …)`.
- [ ] **Step 4:** Run `npx vitest run tests/passport-test && npx tsc --noEmit`. Expected: PASS, no type errors.
- [ ] **Step 5:** Commit `feat(passport): personality chosen on the server and saved once (D882, D883)`.

### Task 4: Shrink images on upload

**Files:**
- Modify: `src/lib/db/media.ts` (`uploadEventImage`, `nextImage`)
- Create: `src/lib/image-resize.ts` (server-only)
- Test: `tests/image-resize.test.ts`

**Interfaces:**
- Consumes: `fitWithin` from `src/lib/shrink-image.ts`.
- Produces:
  - `resizeForWeb(file: File, maxEdge: number): Promise<{ body: Buffer | File; type: string; ext: string }>`. It returns the input as is for SVG, or when the image already fits and is WebP.
  - `uploadEventImage({ …, maxEdge?: number })` and `nextImage(fd, name, current, { …, maxEdge?: number })` pass `maxEdge` through. Callers that don't pass it are unchanged.

- [ ] **Step 1:** Write the failing tests:
  - a 3000×2000 PNG generated with sharp comes back as WebP with long edge 1600;
  - an 800×600 JPEG comes back as WebP at 800×600;
  - an SVG `File` comes back unchanged with ext `svg`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement with `sharp(buf).rotate().resize({ width, height, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 })`, and wire it into `uploadEventImage` after `acceptImage`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(media): shrink large uploads to WebP where asked (D889)`.

### Task 5: The book's pure logic

**Files:**
- Create: `src/features/activities/kinds/passport/book/flow.ts`, `geometry.ts`, `stamp-spots.ts`, `fit.ts`
- Modify: `src/features/activities/client.ts` (export these for tests)
- Test: `tests/activities/book.test.ts`

**Interfaces:**
- Consumes: `Passport`, `Reveal`, `unseenReveals` from `../../lib/booths`; `PassportTest`, `PassportResult` (Task 2–3).
- Produces:
  ```ts
  type BookStage = "closed" | "locked" | "questions" | "name" | "revealing" | "done";
  type BookFlow = { stage: BookStage; index: number; picks: (string | null)[]; closedMessage: string | null };
  bookStart(o: { testOn: boolean; questions: number; hasResult: boolean; isOpen: boolean }): BookFlow
  bookStep(f: BookFlow, a: { type: "open" } | { type: "pick"; answerId: string } | { type: "back" } | { type: "revealed" } | { type: "closed" }): BookFlow
  heldReveals(p: Passport, o: { testOn: boolean; hasResult: boolean; preview: boolean }): { now: Reveal[]; afterTest: Reveal[] }
  PAGE = { w: 1024, h: 720 }
  answerBox(j: 0 | 1 | 2 | 3): { x: number; y: number; w: number; h: number }   // { x: 50, y: 232 + j*118, w: 924, h: 104 }
  answerAt(u: number, v: number): number | null   // UV (v up) → row index
  stampSpot(i: number, seed: string): { x: number; y: number; rot: number; scale: number }  // page px
  fitText(text: string, maxWidth: number, sizes: { max: number; min: number }, measure: (t: string, size: number) => number, maxLines?: number): { size: number; lines: string[] }
  ```

- [ ] **Step 1: Write the failing tests**
  - `bookStart`:
    - with a result, gives `done` (the cover is skipped);
    - test on, no result and closed gives `locked` with `"Your passport opens at the event"`;
    - test on and open gives `closed`;
    - test off gives `closed`, and `open` then goes to `done`.
  - `bookStep` on a 10-question test:
    - `open` gives `questions`, index 0;
    - `pick` stores the pick and advances;
    - `back` at index 3 gives index 2 with the earlier pick kept;
    - `back` at index 0 stays at 0 (the cover cannot close);
    - `pick` on index 9 gives `name`;
    - `back` from `name` gives index 9;
    - `revealed` gives `done`;
    - `closed` from `questions` or `name` gives `locked` with `"The passport has closed"`.
  - `heldReveals`:
    - test on, no result, 2 unseen gives `now: []` and `afterTest` with those 2 in stamp order;
    - with a result gives `now` = the 2;
    - preview gives both empty.
  - `answerAt(0.5, 1 - (232 + 50) / 720)` is 0; a point between rows 1 and 2 is `null`; `answerAt(0.5, 0.95)` is `null`.
  - `stampSpot`:
    - is deterministic for the same `(i, seed)`;
    - spot 0's position is the same whether 1 or 6 stamps exist (it depends only on `i`);
    - every spot for i < 12 keeps its centre inside x 140–884, y 120–600;
    - rot is within ±0.35 rad;
    - consecutive spots are at least 120 px apart.
  - `fitText` with `measure = (t, s) => t.length * s * 0.5`:
    - a short text keeps `max`;
    - a 40-character name at maxWidth 600 with sizes 64–34 shrinks below 64;
    - a text that can't fit at `min` on one line wraps to 2 lines at `min`;
    - with `maxLines` 2, a too-long third line is cut with "…".
- [ ] **Step 2:** Run `npx vitest run tests/activities/book.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. For `stampSpot`:
  - seed a small PRNG (mulberry32 of a string hash of `seed + i`);
  - place spot i on a loose 3×4 lattice walked in a fixed shuffled order;
  - jitter ±40 px, rot ±0.35, scale 0.9–1.1;
  - past 12, wrap with a fresh jitter.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(passport): book flow, answer rows, stamp spots and text fitting (D872, D877, D880)`.

### Task 6: Page painters and default characters

**Files:**
- Create: `src/features/activities/kinds/passport/book/paint.ts` (canvas 2D, browser only), `book/fonts.ts`
- Create: `public/passport/characters/trailblazer.svg`, `navigator.svg`, `daydreamer.svg`, `flavour-hunter.svg`
- Test: `tests/activities/book.test.ts` (add `sceneArt`)

**Interfaces:**
- Consumes: `answerBox`, `fitText`, `stampSpot`, `PAGE` (Task 5); `personalityShades`, `coverColour` (Task 2); `PAPER`, `PAPER_INK` from `../paper`.
- Produces:
  ```ts
  loadBookFonts(): Promise<void>   // document.fonts.load for the three faces; resolves after 2.5 s regardless
  sceneArt(q: TestQuestion, img: HTMLImageElement | null): { kind: "image"; img: HTMLImageElement } | { kind: "panel"; tint: string; emoji: string }  // pure
  paintCover(ctx, o: { colour: string; crest: HTMLImageElement | null; eventName: string }): void          // 720×1024 portrait
  paintScene(ctx, o: { q: TestQuestion; index: number; img: HTMLImageElement | null }): void
  paintQuestion(ctx, o: { q: TestQuestion; picked: string | null }): void
  paintName(ctx, o: { name: string }): void          // the field itself is DOM (Task 7/8)
  paintHolder(ctx, o: { test: PassportTest | null; personality: Personality | null; holderName: string; picture: HTMLImageElement | null; progress: number }): void  // progress 0..1 fills it in (D875); test null = name only (D881)
  paintStamps(ctx, o: { seed: string; stamps: { image: HTMLImageElement | null; name: string }[] }): void
  ```

- [ ] **Step 1:** Write the failing test. `sceneArt` with `image: null` gives a panel whose emoji is the first answer's icon (or "✈️" if none) and whose tint is a fixed pale colour from the question index. With an `img` whose `naturalWidth` is 0 (failed load), it gives a panel too.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement `sceneArt`, then port each painter from the sketch's `drawCover`, `drawScene`, `drawQuestion`, `drawName`, `drawBio` and `drawStamps`.
  - Use `fitText` everywhere text can grow.
  - The scene image is cover-fit into the rounded frame `{ x: 44, y: 84, w: 936, h: 580 }`.
  - Picked rows are filled `#2E7D46` with white text (D872); no other row colour changes.
  - The holder page uses the test's three labels and the personality's shades.
  - The fonts are the sketch's (Archivo Black, Caveat, DM Sans) via `next/font/google` CSS variables. Read the font guide in the Next docs first.
- [ ] **Step 4:** Draw the four characters as simple friendly SVG busts, one per personality. Each uses its accent, `dark` and `light`, in the spirit of the sketch's canvas faces, about 400×400 viewBox, under 8 KB each.
- [ ] **Step 5:** Run `npm test && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 6:** Commit `feat(passport): page painters and the travel set's characters (D876, D886)`.

### Task 7: The immersive passport page and its 2D book

The guest flow end to end, flat. This is what the 20 Nov checkpoint's no-WebGL path shows.

**Files:**
- Create: `src/features/activities/kinds/passport/book/PassportBook.tsx` (client shell), `book/FlatBook.tsx`, `book/BookA11y.tsx`, `book/BookBar.tsx`, `book/webgl.ts` (`hasWebGL`)
- Modify:
  - `src/features/activities/kinds/passport/PassportBody.tsx`;
  - `PassportLive.tsx`;
  - `PassportQr.tsx`;
  - `src/features/activities/lib/portal-activity-entries.ts` (`PassportEntry` gains `test: PassportTest; result: PassportResult | null`);
  - `src/features/activities/portal/ActivityPage.tsx` (passport returns `body(found)` without chrome, as polaroid does).

**Interfaces:**
- Consumes: Tasks 2, 3, 5 and 6; `savePassportResultAction`.
- Produces:
  - `PassportLive` provides `useLive(): { state: LiveState; arrived(reveals: Reveal[]): void; after: RefObject<string | null> }` and no longer renders `PassportQr` itself.
  - `PassportQr` gains `triggerClassName?: string`.
  - `PassportBook` props: `{ slug, token, activityId, eventName, brand, qr, preview, passport: Passport, test: PassportTest, result: PassportResult | null, registeredName: string, isOpen: boolean, afterTest: Reveal[], description: string | null, reward: string | null, render: "3d" | "flat" }`.
  - Task 8 plugs `BookScene` in where `render === "3d"`.

- [ ] **Step 1:** Load each passport's test and the attendee's result in `loadActivityEntries` with two queries for the whole event's passports, never per passport.
- [ ] **Step 2:** Change `PassportBody`:
  - `initial` = `heldReveals(...).now`;
  - render `<PassportLive …><PassportBook …/></PassportLive>` with `render` decided client-side.
- [ ] **Step 3:** Build `PassportBook`.
  - **Shell:** `createPortal` to `document.body`, `fixed inset-0 z-[100] h-dvh`, × pushes `/e/${slug}/a/${token}`, as `PortalCamera`.
  - **Flow:** holds `bookStep` state.
  - **Bottom bar** (D879), shown at `done`:
    - "Show my QR" (`PassportQr` with `useLive()`);
    - "Booths", which opens a bottom sheet with each booth's stamped/not yet, location and map link, `progressLine`, the reward once complete, and the description under "About".
  - **During questions:** a small corner QR button (D880).
  - **Saving:** on "That's me" it calls the action.
    - `ok`: set the personality, play the reveal, then `arrived(afterTest)`.
    - `closed`: dispatch `closed`.
    - `busy` or `invalid`: a toast "Something went wrong. Try again." and stay on the name page.
  - **Completion (goal 10):** when a landing makes `passport.complete` true, show the reward message once in a short celebratory card over the book. A passport already complete on load doesn't replay it; the reward stays in the Booths sheet.
- [ ] **Step 4:** Build `FlatBook`. The same painters render to `<canvas>` elements shown one spread at a time (top page above bottom page), with 250 ms crossfades. Taps map through `answerAt` on the bottom canvas, and a tap on the top page means back. The name field is a real `<input>` over the name page. On each `landed`, repaint the stamp page with the new stamp at `stampSpot(i)` (`i` = its position among the passport's stamps in stamp order), so the flat book shows stamps too.
- [ ] **Step 5:** Build `BookA11y`, an `sr-only` layer:
  - question `<h2>`;
  - four answer `<button>`s;
  - "Previous question";
  - name `<input>` + "That's me";
  - after `done`, the holder page's text.
  - Each fires the same `bookStep` actions.
- [ ] **Step 6:** Run `npx tsc --noEmit && npm run lint && npm test`. Expected: clean.
- [ ] **Step 7:** Load the travel set on the test passport only. Get it with `npx jiti -e "…console.log(JSON.stringify({...travelSet(), on: true}))"` (or write it via a one-off script under the scratchpad), then `update activities set passport_test = '<json>' where id = '77ab95f9-…'`, confirming the event slug is `zz-queue-test` first.
- [ ] **Step 8:** Browser check (`preview_start` the dev server, temporarily forcing `render = "flat"`) on a zz-queue-test attendee link at 375×812:
  1. the cover opens;
  2. back keeps the pick;
  3. all 10 questions work;
  4. a 40-character name fits;
  5. the reveal fills in;
  6. stamps given by booth link before the test play after the reveal;
  7. closing the passport mid-test shows "The passport has closed";
  8. a reload goes straight to the finished passport;
  9. with the test switched off, the page is name-only.
  Delete the test result rows afterwards with SQL.
- [ ] **Step 9:** Commit `feat(passport): immersive passport page, flat book and the test flow (D870, D874, D875, D879-D883)`.

### Task 8: The 3D book

**Files:**
- Create: `src/features/activities/kinds/passport/book/BookScene.tsx` (r3f `Canvas`), `book/leaf.ts` (curl geometry and leaf animation), `book/textures.ts` (texture budget)
- Modify: `book/PassportBook.tsx` (dynamic import, `render` from `hasWebGL()`)

**Interfaces:**
- Consumes: the painters (Task 6), `answerAt` (Task 5), `PassportBook`'s flow and callbacks (Task 7).
- Produces: `BookScene` props `{ flow: BookFlow; pages: PageCanvases; onPick(j: number): void; onBack(): void; onOpen(): void; onNameRect(r: DOMRect | null): void; revealProgress: number; reduced: boolean }`, where `PageCanvases` is the set of canvases `PassportBook` already paints for `FlatBook`.

- [ ] **Step 1:** Read `node_modules/next/dist/docs/` on `next/dynamic` and client components. Load `BookScene` with `dynamic(() => import("./BookScene"), { ssr: false })`, as `SlimeGame`.
- [ ] **Step 2:** Port the sketch's book:
  - **Leaves:** top-hinged leaves on a turned group (`rotation.z = π/2` for portrait, spine left). Leaf 0 = cover / scene 0, leaves 1–N = question / next scene, last = name / stamp page, and the base block = holder page.
  - **Flipping:** rotation `-π·f` about the hinge, with z from `zDown(k)` to `zUp(k)` plus lift `sin(πf)·0.25`. Back faces use `texture.rotation = π`, and the cover uses `-π/2`.
  - **Curl** (spec "left to the builder"): bend each leaf as a 12-segment strip whose segments rotate progressively by `f`, so it reads as paper, not a board.
  - **Opening:** closed passport floats with a light drag tilt; open flips leaf 0, then scale 1.15→0.7, then turn π/2→0, then scale to 0.98 at y 0.2. That is about 1.6 s in all (D871).
  - **Picking:** raycast the current leaf's front for a pick and the previous leaf's back for back.
  - **Name field:** report the name page's projected rect so the DOM `<input>` sits over it.
  - **Reveal:** move the passport to `y -0.12` so the "YOU'RE A" banner clears the top page.
- [ ] **Step 3:** Texture budget.
  - Only leaves within ±1 of the current one hold full-size canvases; the rest get a 256-px copy.
  - Dispose replaced textures.
  - Prefetch the next two questions' scene images with `new Image()` as each page is reached.
- [ ] **Step 4:** Reduced motion: flips become 200 ms opacity crossfades between spreads, and the reveal draws `progress = 1` at once.
- [ ] **Step 5:** Stamp landing (D878). `StampReveal` still plays its grow-from-centre overlay. On `landed`, `PassportBook` repaints the stamp page with the new stamp at `stampSpot(i)` and settles it with a 300 ms scale-from-1.15 on a small overlay plane, then bakes it into the texture.
- [ ] **Step 6:** Run `npx tsc --noEmit && npm run lint`. Expected: clean.
- [ ] **Step 7:** Browser check on zz-queue-test at 375×812 (the pane may throttle rAF when hidden; ask the user to show the pane before judging motion). Repeat Task 7 Step 8's walk in 3D. Also check:
  - that there are no console errors;
  - that `renderer.info.memory.textures` stays under about 12 through all 10 questions.
  Take screenshots of: the closed passport, question 3, the name page, the finished passport with two stamps.
- [ ] **Step 8:** Commit `feat(passport): the 3D passport (D870-D873, D877, D878, D889)`.
- [ ] **Step 9:** **Checkpoint about 20 Nov.** Tell the user it is ready to try on their phone and a mid-range Android, with the zz-queue-test link, and ask them to approve or reject the four characters. Fix what they find before Task 9.

### Task 9: Admin — the Personality test card

**Files:**
- Create: `src/features/passport-test/admin/actions.ts`, `admin/TestCard.tsx`, `admin/QuestionModal.tsx`, `admin/PersonalityModal.tsx`
- Modify: `src/features/passport-test/index.ts`; `src/features/activities/kinds/passport/PassportDetail.tsx` (render `<TestCard>` after "Booths")

**Interfaces:**
- Consumes: Tasks 2–4; `requireEventAccess`, `flashPath`, `nextImage` with `maxEdge: 1600`, `deleteEventImage`, `isEventMediaFor`.
- Produces (all `(eventId: string, activityId: string, …, fd?: FormData)` server actions, redirecting back with a flash):
  - `setTestOnAction(eventId, activityId, on: boolean)`: refuses with the first `testProblems` sentence when turning on.
  - `loadTravelSetAction(eventId, activityId)`: refuses when results exist. When questions exist, the button sits behind a confirm "Replace your questions and personalities with the travel set?".
  - `saveQuestionAction(eventId, activityId, questionId: string | "new", fd)`.
  - `moveQuestionAction(eventId, activityId, questionId, dir: "up" | "down")`.
  - `removeQuestionAction(eventId, activityId, questionId)`.
  - `savePersonalityAction(eventId, activityId, personalityId: string | "new", fd)`.
  - `removePersonalityAction(eventId, activityId, personalityId)`.
  - `saveLookAction(eventId, activityId, fd)`: labels, cover colour, crest.
  - Every save builds `after`, then runs:
    - `lockedChange(before, after, await countResults(id))`;
    - `testProblems(after)` when `after.on`, refusing with the sentence;
    - the item rules always: 4 answers each pointing to a personality; unique names; 3 ticked.
  - Then it saves and deletes stale images.

- [ ] **Step 1:** Read `PassportDetail.tsx`, `BoothList.tsx` and the polaroid admin cards for the admin style (25 Sep 2026: capped and centred, header actions, table-style lists with ⋯ menus, sticky save bar).
- [ ] **Step 2:** Build the card:
  - **Header:** the On/Off switch.
  - **Questions:** a table-style list (scene · question · image thumb) with ⋯ "Edit / Move up / Move down / Remove". "Add question" is disabled at 12, and Remove is disabled at 5 while on.
  - **Personalities:** a list (swatch · name · picture thumb · ticked traits) with ⋯ "Edit / Remove". "Add personality" is disabled at 8.
  - **Labels and cover:** a form with a sticky save bar.
  - **Locked state:** when results exist, a line "N guests have taken this test. Answers' personalities and the list of questions are locked." and the locked controls disabled.
  - **Question modal:** scene, question, `ImageField` "Picture (optional)", and four rows of answer text, icon (emoji, optional) and personality `<select>`.
  - **Personality modal:** name, colour, `ImageField` "Character picture", six trait inputs with checkboxes (exactly 3), the style line, two "likely to say" lines, and the blurb.
- [ ] **Step 3:** Run `npx tsc --noEmit && npm run lint && npm test`. Expected: clean.
- [ ] **Step 4:** Browser check on zz-queue-test admin (the user may need to sign in in the pane):
  - load the travel set;
  - edit a question with a picture (check the stored file is WebP ≤ 1600 px);
  - add a 5th personality;
  - switch on;
  - take the test as an attendee;
  - check re-pointing an answer is refused while text edits save.
- [ ] **Step 5:** Commit `feat(passport): Personality test admin card (D884, D885, D887)`.

### Task 10: Results in admin and the export

**Files:**
- Create: `src/features/passport-test/lib/results.ts`, `admin/ResultsCard.tsx`
- Modify:
  - `src/features/passport-test/admin/actions.ts` (`clearResultAction(eventId, activityId, attendeeId)`, `clearAllResultsAction(eventId, activityId)`);
  - `PassportDetail.tsx`;
  - `src/lib/exports.ts` (`PassportSheet` gains `results?: Map<string, { personality: string; holderName: string }>`);
  - `src/app/admin/events/[id]/export/passport.xlsx/route.ts`.
- Test: `tests/passport-test/results.test.ts`, `tests/exports.test.ts`

**Interfaces:**
- Produces:
  - `countByPersonality(results: PassportResult[], personalities: Personality[]): { id: string; name: string; count: number }[]`, in the personalities' order, zeros included. A result whose personality id is unknown counts under "Other".

- [ ] **Step 1:** Write the failing tests:
  - `countByPersonality` gives counts in order with zeros, and "Other" only when needed;
  - `buildPassportWorkbook` with `results` adds "Personality" and "Passport name" columns after "Completed" and fills them by attendee;
  - without `results`, the columns are unchanged.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
  - **The card**, shown when the test is on or results exist:
    - a line "Trailblazer 212 · Navigator 180 · …" and "N guests have taken this test";
    - a table (name · personality · passport name · when) with ⋯ "Clear result", which confirms "They can take the test again. Their stamps stay.";
    - a header ⋯ "Clear all results", which confirms with the count.
  - **The export route:** passes `results` for each passport whose test is on or has results.
- [ ] **Step 4:** Run `npm test && npx tsc --noEmit && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Browser check: counts match SQL, Clear result lets the attendee retake, and the export opens with the two columns.
- [ ] **Step 6:** Commit `feat(passport): personality counts, clear result and export columns (D882, D888)`.

### Task 11: Final checks

- [ ] **Step 1:** Run `npm test && npx tsc --noEmit && npm run lint && npm run check:passport-test`. Expected: all pass.
- [ ] **Step 2:** Run `npm run build`. Expected: success; the passport route's first-load JS has no three.js (it comes in a separate chunk).
- [ ] **Step 3:** Run a draft preview of zz-queue-test (D714–D716). The test plays and reveals, and SQL shows no new `passport_results` row.
- [ ] **Step 4:** Clean up the zz-queue-test results and stamps you made. Leave the travel set loaded for the user to try.
- [ ] **Step 5:** Update the memory note `personality-passport.md` with commits, migration status and what was not browser-checked. Tell the user it is ready for 27 Nov. Don't push until they say.
