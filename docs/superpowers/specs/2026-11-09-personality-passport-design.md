# Booth passport: a 3D passport with a personality test — design

9 Nov 2026. Replaces the attendee view built in `2026-11-08-passport-stamp-artwork-design.md` (D844–D853) and `2026-11-08-passport-paper-page-design.md` (D854–D859). Decisions D870–D889.

Reference sketch (throwaway, gitignored, open it in a browser): `.superpowers/brainstorm/2340-1794200510/content/passport-3d-sketch-v3.html`. Earlier sketches `passport-3d-sketch.html` and `-v2.html` sit beside it and show rejected directions.

## Why

The user finds the booth passport plain and boring: a card of empty circles waiting for stamps. Nothing about it belongs to the guest holding it. Clients want engagement pieces like Klook's "The Best You" quiz (experiencethebestyou.com: ten travel scenes, four picture choices each, one of eight character types) and the "Flavour Passport" card the user shared: a passport page with a character, a ticked taste profile, a destination and a "perfect for" line, and overlapping stamps above.

The idea: the guest **makes their own passport** by taking a short personality test inside it. The test ends by revealing their personality on their passport page. Only then do booth stamps start landing on it. It should feel immersive, like the polaroid camera, not like a form.

First use: **UOB Innovation Hub 2 Gala Dinner** (`uobih2`, Fri 5 Dec 2026, 685 attendees, one booth passport with two round gold stamps). Guests will take the test **at the venue**, on their phones, on venue Wi-Fi, before visiting booths.

Success: at the UOB dinner a guest opens Booth Passport, flips through about ten pages answering, sees "You're a Trailblazer" fill itself in on their own passport page, and then watches booth stamps land on the page above it. Nobody is stuck on a slow load, an old phone or a lost stamp.

## Words

- **Personality test**, never "quiz" (the user's correction). There are no right or wrong answers and nothing reads as a score. Admin and portal copy say "personality test", "personality" and "result".
- **Personality**: one of the outcomes, e.g. Trailblazer. **Holder page**: the guest's own page (character, name, traits). **Stamp page**: the page the booth stamps land on.

## Goals

### Attendee experience

1. **A 3D passport replaces today's attendee view for every booth passport (D870).** The paper page, discs and box grids from D854–D857 are no longer the attendee's passport. It is built with three.js through `@react-three/fiber` (already in the project; `@react-three/drei` is not and need not be added). The page is immersive like polaroid (D485): no back link, cover or title. It is full-screen over the portal, with × returning to the portal home. Applies whether or not the passport has a personality test (goal 12).

2. **Closed, then open (D871).** The guest first sees a **closed portrait passport**, like a real one, floating gently. A light drag tilts it.
   - **Cover:** the passport's cover colour (goal 16), gold foil "PASSPORT", the passport's name as a small line above it, a crest in the middle and the e-passport chip mark near the foot.
   - **Opening:** a tap opens it **like a book, spine on the left**. The open passport then **turns 90°** into the stacked "hand it to immigration" layout: one landscape page on top and one below, joined by a horizontal fold. Everything after this happens in that stacked layout.
   - The user approved this sequence in sketch v2/v3. They rejected a landscape closed booklet (v1).

3. **One page per question (D872).** Each question is one spread:
   - **Top page:** the question's **image** in a rounded frame on the passport paper. Above it is a small letter-spaced line: "PAGE 03" on the left and the question's short scene name on the right (e.g. "WINDOW VIEW").
   - **Bottom page:** "QUESTION 3 OF 10" in small capitals, the question (one line; the type shrinks a little to fit), then **four answers as full-width rows**. Each row is a rounded pill: an optional small icon on the left, the answer text beside it. There are **no checkboxes**; the user removed them.
   - **Tap an answer:** the row turns solid green with white text, then after a short beat the bottom page **flips up** over the fold. Its back becomes the next question's image, and the next question appears below.
   - **Back:** tapping the top page flips the last page back down to the previous question, with its earlier pick still shown. The guest can change it. The cover cannot be closed again by flipping back.
   - A thin progress bar and "3/10" sit at the top of the screen. A hint line under the passport says "Tap an answer. Tap the top page to go back."
   - Pages bend as they turn. The sketch's flips are rigid; the real build should curl the paper.

4. **Images on the top page (D873).** The organiser uploads one image per question, photo or illustration; the user has not decided which and the slot must take either. It is **cropped to fill** a landscape frame of about 3:2, centred.
   - A question without an image shows a plain panel in a soft tint with the passport paper's faint rosette, so the page never looks broken.
   - Answer icons are optional. They are short emoji or a small uploaded image (builder's choice of which to support first; emoji alone is enough for the ready-made set).

5. **Name page (D874).** After the last question, the next spread is:
   - top: a "Sign your passport" page ("Almost done");
   - bottom: "PASSPORT HOLDER / Is this your name?", with the attendee's name already in a handwritten-style field on a dashed line, and a "That's me" button.
   - The guest may change it. **The changed name goes on the passport only**, stored with the result. It does not change the attendee record (my call).
   - The field is a real HTML input laid over the page, because typing on a 3D page is not practical.

6. **Reveal (D875).** "That's me" flips the last page. Underneath is the **holder page** at the bottom and the **stamp page** on top. The holder page **fills itself in**, about 1.8 s in total:
   - the character picture fades in;
   - the personality name lands in chunky outlined capitals, settling from slightly larger;
   - the three trait ticks draw one after another;
   - then the two handwritten lines appear.
   - A banner above the passport reads "YOU'RE A / TRAILBLAZER".
   - The passport stays open on these two pages from then on.

7. **The holder page (D876).** This is the layout from the Flavour Passport reference and sketch v3:
   - a heading (the passport's name, e.g. "INNOVATION HUB PASSPORT");
   - on the left, the personality's character picture in a rounded frame, with under it the personality name in outlined capitals, a small "PASSPORT HOLDER" label and the guest's name in handwriting;
   - on the right, three labelled sections in dark pills:
     - section 1 (travel set: "KEY TRAITS"): six words in a 3×2 grid, three of them ticked;
     - section 2 ("TRAVEL STYLE"): one handwritten line on a dashed rule;
     - section 3 ("LIKELY TO SAY"): two handwritten lines on dashed rules.
   - The three section labels are set per passport (goal 15).
   - The page is drawn in the personality's colour (a dark, a light and an accent derived from one picked colour). Text must stay readable on the cream paper.

8. **The stamp page (D877).** The top page after the reveal is cream paper with the faint wavy lines and rosette from `paper.ts`, and "ENTRIES · STAMPS" small at the top.
   - Each stamp is the booth's **stamp artwork** (D844, unchanged admin upload) pressed straight onto the page, slightly tilted, **overlapping** earlier stamps like a real passport.
   - Positions are **deterministic** per booth, so a reload shows the same arrangement. They come from a jittered layout that spreads N stamps over the page and shrinks them as N grows.
   - Booths without artwork use the plain chop (`StampGlyph`) in the event's colours, as now.
   - Two stamps (UOB) must look generous, and twelve must still be legible.

9. **A new stamp's reveal keeps the approved grow-from-centre feel (D878).** When a stamp arrives, from the "Show my QR" wait or on opening the page with unseen stamps:
   - the screen dims and the stamp **grows from the centre** on a round piece of the same paper, with the gold outline traced around it as in D851;
   - then it **moves down onto its spot** on the stamp page and settles with a small press (a light shake of the passport).
   - Tap or Escape skips. Reduced motion shows it in place.
   - The sketch's straight "slam from above" is only a placeholder. In the earlier passport work the user **rejected a stamp slam as not visible enough**, so the builder must not ship the slam alone.
   - Seen-tracking (`seen_at`, `markStampsSeenAction`) works as today.

10. **Booths, QR and progress live in a bottom bar and sheet (D879, my call).** The overlapping stamp page no longer shows empty "?" slots or booth names, but guests still need that information. Under the open passport:
    - **"Show my QR"**: the existing dialog and 2 s poll (`PassportQr`, `pollRevealsAction`), shown under the same rule as now (`qrButtonShown`).
    - **"Booths"**: opens a bottom sheet listing every booth with stamped/not yet, its location and map link (D798). It also shows the progress line ("1 of 2 stamps"), the reward message once complete, and the passport's description under "About", as polaroid's drawer does (D485).
    - **Completion:** when the passport is complete, a short celebratory moment shows the reward message once.

11. **The test opens with the passport; stamps before the test are kept (D880).**
    - **The test follows the passport's open switch** (the user's call, 10 Nov), including a scheduled opening (D600–D612). While the passport is closed the guest sees the closed passport with the cover's "opens soon" wording, e.g. "Your passport opens at the event", and cannot start the test. So the test is a venue moment, not something done at home beforehand.
    - The server refuses to save a result while the passport is closed, the same way `record_stamp` returns `closed`. A guest who is mid-test when an organiser closes it sees a short "The passport has closed" message instead of the reveal (my call).
    - Because everyone can start the moment it opens, goal 20's load rules matter most at that minute.
    - A booth can stamp a guest who has not finished the test. `record_stamp` is unchanged and does not require a result.
    - Those stamps wait. When the guest finishes the test, they appear on the stamp page right after the reveal, each played in turn as an unseen stamp. If the guest opens the activity before finishing, they land on the test, not on a passport with stamps.
    - "Show my QR" stays reachable during the test from a small corner button, because a booth may scan someone mid-test. That makes it the guest's choice to pause.

12. **Passports without a test (D881).** The personality test is **on or off per passport**, off by default for existing passports. With it off:
    - the guest opens the cover;
    - the passport turns to a holder page with only the heading, "PASSPORT HOLDER" and their registered name, plus the stamp page above;
    - everything else in goals 8–10 still applies.
    - This keeps every current passport working after this ships, including `uobih2` until UOB's test is set up.

13. **Taken once, result fixed (D882).** A guest takes the test **once per passport**. After "That's me" the result is saved and the passport always opens straight to the finished pages, with no retake button. Opening it again skips the cover animation, or plays it shortened (builder's call).
    - An **organiser can clear one guest's result** from admin (goal 19), e.g. a guest who handed their phone to a friend. The guest then retakes. Their stamps are unaffected (my call).
    - Answers are not saved until "That's me". Leaving mid-test and coming back starts the test again; keeping progress locally on the phone is the builder's choice.

14. **How the result is chosen (D883).** Each answer points to exactly one personality. The result is the personality the guest's answers point to **most often**. **Ties** go to whichever tied personality the guest picked **most recently**. The server works it out from the submitted answers; the client's guess is never trusted.

### Organiser setup (admin)

15. **A "Personality test" section in the passport's admin page (D884).** It sits beside the booths and stamp artwork in `PassportDetail`, in the admin style the user approved on 25 Sep 2026 (capped and centred, header actions, table-style lists with ⋯ menus, sticky save bar). It holds:
    - **On/off switch.**
    - **"Use the travel set"** button: fills in the ready-made set (goal 17) when the test is empty. Once questions exist it asks before replacing them.
    - **Questions**, a table-style list: question text, short scene name, image upload, and four answers. Each answer has text, an optional icon and **the personality it points to** (a picker). Questions can be added, reordered, edited and removed, with **5 to 12 questions** and **exactly 4 answers each** (my call, matching the page layout).
    - **Personalities**, a list (2 to 8; the travel set has 4). Each has:
      - a name;
      - a colour;
      - a character picture upload;
      - six trait words, with which three are ticked;
      - section 2's line;
      - section 3's two lines;
      - a short one-line description for admin and the reveal banner.
    - **Page labels**: the three section labels on the holder page, defaulting to the travel set's "KEY TRAITS / TRAVEL STYLE / LIKELY TO SAY". A food event could use "TASTE PROFILE / DESTINATION / PERFECT FOR".
    - **Validation on save:** every answer must point to a personality, every personality name must be unique, and each personality must have exactly three ticked traits.

16. **Cover (D885, my call).** The cover colour defaults to the event theme's primary colour, darkened if needed so the gold reads. The organiser can override it in the same section. An optional crest image upload replaces the default globe crest. The foil colour is gold and fixed.

17. **The ready-made travel set (D886).** It ships in code. It holds the ten travel questions from sketch v3, reworded from Klook's scenes and not copied:
    1. out-of-office reply;
    2. which seat;
    3. the view from the window;
    4. getting from the airport;
    5. lost in the city;
    6. where you stay;
    7. bucket list;
    8. the night market;
    9. the last night;
    10. a souvenir.
    - Each question's four answers point to one each of **four personalities**: Trailblazer, Navigator, Daydreamer and Flavour Hunter. Their traits and lines are as in the sketch.
    - The set ships with **default character pictures** for the four personalities, so it works with no uploads. The sketch's canvas-drawn faces are stand-ins; the builder makes cleaner illustrated characters in the same spirit (simple, friendly, one per personality, matching the personality colour), stored as static assets.
    - The questions ship **without images**, showing the plain panel (goal 4) until the organiser uploads.
    - The copy is editable after loading. For UOB the user will load the set and adjust it.

18. **Editing once guests have results (D887).** Once any guest has a saved result for the passport, these are **locked**:
    - which personality an answer points to;
    - adding, removing or reordering questions;
    - removing personalities.
    - Admin shows why: "N guests have taken this test". Text, images, colours, traits and labels stay editable and show on everyone's passport straight away.
    - The way out is clearing all results with a confirm, which is an organiser action and not automatic.

19. **Seeing results (D888).**
    - Admin's passport page shows a count per personality ("Trailblazer 212 · Navigator 180 · …") and how many guests have taken the test.
    - The admin attendee list, or the passport's per-guest view if that is the natural place (builder's call), shows each guest's personality, with the ⋯ menu offering "Clear result" (goal 13).
    - The passport export (`export/passport.xlsx`) gains "Personality" and "Passport name" columns.

### Running at a venue

20. **Fast and light (D889).** Most of the 685 guests open it in the same hour on venue Wi-Fi.
    - **3D code:** loaded with `next/dynamic(..., { ssr: false })` after a WebGL check, as `SlimeGame` and `DisplayView` do.
    - **Images:** shrunk on upload with `sharp` (already a dependency) to at most about 1600 px on the long side, WebP. Today's uploads are stored as is (`src/lib/db/media.ts`), so this is new. It applies at least to question images and character pictures.
    - **Prefetch:** the next two questions' images load while the guest answers.
    - **GPU memory:** only the pages near the current spread hold full-resolution textures, so low-end phones keep up.
    - **No-WebGL phones:** get the same pages as flat 2D, with CSS page turns or crossfades, the same taps and the same order. Nobody is blocked.
    - **Reduced motion:** page turns become crossfades and the reveal shows the finished page.
    - **Rate limits:** saving the result is one server action, rate-limited per guest token like the portal's other actions. It checks the passport is open (goal 11).

21. **Accessible underneath.** The 3D canvas carries a real DOM layer, visually hidden but present:
    - the question as a heading;
    - the four answers as buttons;
    - a "Previous question" button;
    - the name field and "That's me";
    - the holder page's text after the reveal.
    - Screen readers and keyboards use the test through it. A tap on the canvas and a press of the matching button do the same thing.

22. **Draft preview** (D714–D716) shows the whole test and reveal but **saves nothing**. The result shows only for that viewing, the same as stamps aren't marked seen in preview today.

## Non-goals

- The public foyer view `/e/[slug]/stamps` (locked passport, no attendee) keeps today's 2D paper grid.
- The booth scanner (`/booth/[token]`), `record_stamp`, stamp uniqueness and category eligibility are unchanged. The booth still never sees artwork, and does not see the guest's personality either.
- No retake by the guest, no sharing or downloading the passport as an image (polaroid made the same call, D485; it can come later), no selfie or guest photo on the holder page.
- No BM translation (the EN | BM switch, D736–D741, is not extended to the test in this round).
- No scoring weights, multi-personality answers or percentages; one answer points to one personality.
- Not a new activity kind. The test is part of the passport kind.

## Anti-goals (a failure even if it works)

- Anything that reads as a quiz or exam: right/wrong colours, scores, "correct".
- A guest who cannot get past a loading screen, a blank canvas or a stuck page turn at the venue.
- A stamp a booth recorded that never appears on the guest's passport.
- A passport that looks broken when an organiser leaves out images: missing image icons, empty frames.

## Constraints

- Next.js 16.3.4 with breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing code (AGENTS.md).
- `three ^0.186.1`, `@react-three/fiber ^9.8.1`, `motion ^13.4.4`, React 19.2.8.
- New feature code follows the modular layout (`src/features/<name>/` or the passport kind folder `src/features/activities/kinds/passport/`). The test belongs with the passport kind.
- **Storage (my call, builder may refine):**
  - Settings in a new `activities.passport_test jsonb` column, read through a `readPassportTestSettings` with defaults, following polaroid's `activities.polaroid jsonb` (0076).
  - Questions, answers and personalities get **stable ids** so edits never re-map results.
  - Results in a new table, e.g. `passport_results (id, org_id, event_id, activity_id, attendee_id, personality_id, answers jsonb, holder_name, created_at, unique (activity_id, attendee_id))`, cascading with the attendee and the activity. RLS on, no policies, written only with the service role, the same as `booth_stamps`.
  - Next free migration number after 0133 (other sessions also write migrations; check before numbering).
- Uploads go to the `event-media` bucket through `nextImage` / `mediaObjectPath`, with new image kinds, e.g. `passport-scene`, `passport-character`, `passport-crest`. Replaced files are deleted after the row update, as now.
- **Testing:**
  - Test on `zz-queue-test` only; it has UOB's theme copied in and the "ZZ Booth Passport" with two booths.
  - Never test on `ecphub` (the live event) or on `uobih2`.
  - Real-phone checks on a mid-range Android are part of done, because the venue is the whole point.
- Other sessions push to `main` and also use D-numbers. D870–D889 were free on 9 Nov; check before committing.

## Timing

UOB's dinner is 5 Dec 2026. My call: aim to have it built and checked on `zz-queue-test` by **Fri 27 Nov**, leaving a week for the user to load and adjust the travel set and upload UOB's images and stamps on `uobih2`.

- **Checkpoint about Fri 20 Nov (my call).** The guest flow and the no-WebGL fallback reach a phone first, with admin and export after. At the checkpoint the user tries it on their own phone and a mid-range Android, and approves or rejects the four default character pictures. Fixes from that land before 27 Nov.

## Left to the builder

- Page-curl technique (bent geometry, shader, or a few rigid segments). It must read as paper bending, not a board swinging.
- Exact timings and easing, within the beats above.
- Canvas-texture versus DOM-to-texture for drawing pages. The sketch draws pages on 2D canvases after `document.fonts.load`. Fonts: the sketch uses Archivo Black, Caveat and DM Sans; the builder may keep these or pick equivalents.
- The jittered stamp layout algorithm.
- Whether answer icons support uploads now or emoji only.
- Where "Clear result" lives in admin.
- Whether progress mid-test is kept on the phone.

## Calls I made (for the user to check)

- D874: an edited name on the name page goes on the passport only, not the attendee record.
- D879: booths, QR and progress move to a bottom bar and sheet, because the overlapping stamp page has no slots.
- D880: "Show my QR" stays reachable mid-test. A guest mid-test when the passport closes gets a "closed" message, not the reveal.
- D881: the test is optional per passport, off by default. Without it the passport opens to a name-only holder page.
- D882: organisers can clear a guest's result.
- D885: the cover colour comes from the theme and can be overridden; optional crest upload.
- Goal 15: 5 to 12 questions, exactly 4 answers each, 2 to 8 personalities.
- D889: images shrunk on upload.
- Ready by 27 Nov, with a phone and artwork checkpoint around 20 Nov.
