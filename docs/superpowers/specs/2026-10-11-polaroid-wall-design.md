# Polaroid wall — a new activity kind — design

Approved in chat on 11 Oct 2026. It is a new interactive activity:
- People snap or pick a photo on an instant-camera screen.
- The photo ejects as a polaroid print.
- They can add a handwritten-style message and stickers, then post it.
- Posts appear live on a dedicated LED wall as alternating vertical columns that loop forever.

Reference: the user's earlier standalone app, `github.com/tylerwcs/digital-polaroid` (Vite +
Socket.IO, read on 11 Oct 2026). We carry over:
- the camera upload screen and its eject animation
- the Caveat handwriting
- the washi-tape card
- the `obscenity` profanity check
- the background video

We leave out:
- the signature pad
- text-only notes
- the ZIP export
- the "Download my polaroid" keepsake

## Context checked on 11 Oct 2026

- **Activity kinds.**
  - Activity kinds are `booking | submission | passport` (src/lib/types.ts). There is no
    registry; the union drives exhaustive `Record`/`switch` dispatch (D414–D420).
  - Adding a kind breaks the build at every site that needs a branch: kinds/meta.ts,
    kinds/settings.ts, tabs.ts, row.ts, cards.ts, lib/portal-activity-entries.ts,
    admin/ActivityDetailPage.tsx, portal/ActivityPage.tsx, the admin list's `listItem` and
    `NewActivityMenu`, and catalogue `ACTIVITY_KIND_ORDER`.
  - The kind check constraint was last widened in 0036_passport_kind.sql. The latest migration is
    0075.
- **LED displays.**
  - The only LED surface is the games display `/display/[token]`. It is fixed at 1920×1080
    (D284), so it letterboxes on the 5504×2322 KOM LED.
  - Live updates use polling (`usePoll`, versioned `?v=` answers, `no-store`). There is no
    Supabase Realtime, and every table has RLS with no policies, so all access goes through
    the service role.
- **Uploads.**
  - Uploads use signed upload URLs minted by the server (D300). Photos are shrunk in the
    browser by `shrinkImage`.
  - There is no content moderation anywhere yet.
  - The user previously rejected unvetted typed text on the LED (D365).
- **Fonts.** Manrope (app) and Bricolage Grotesque (games). There is no handwriting font yet.

## Decisions

### Shape

- **D471 — `polaroid` is a fourth activity kind, unlocked by the engagement add-on.**
  - Its kind wiring (settings reader, admin detail, portal body) lives in
    `src/features/activities/kinds/polaroid/`.
  - The feature itself lives in its own module, `src/features/polaroid/` (index.ts server
    barrel, client.ts client barrel, D403):
    - the card, the composer, the wall
    - the pure rules in `lib/`
    - the service-role queries in `db/`
  - The kind files import only from those barrels.
  - KIND_META: label "Polaroid wall", lucide `Camera` icon.
- **D472 — A polaroid is stored as parts and drawn live, never flattened.**
  - The parts are the photo, the message text and the sticker placements.
  - One `PolaroidCard` component draws it on the phone, the LED and admin. What someone
    composes is what the wall shows.
  - The message on the LED is the exact text that passed the server's check, so a crafted image
    can't get wording past the filter.
- **D473 — Auto-post with takedown. There is no approval queue.**
  - A post goes live as soon as the server accepts it.
  - Admin can remove any post. A portal attendee can remove their own.
  - Removal is final and deletes the photo file.

### Data

- **D474 — Migration 0076:**
  - Widen `activities_kind_check` to include `'polaroid'`.
  - Add three columns to `activities`:
    - `wall_token text unique`
    - `public_token text unique`
    - `polaroid jsonb`, the settings described in D475
  - Create table `polaroids`:

    | column | type | notes |
    |---|---|---|
    | `id` | uuid pk | |
    | `event_id` | uuid | fk events, on delete cascade |
    | `activity_id` | uuid | fk activities, on delete cascade |
    | `attendee_id` | uuid null | fk attendees, on delete set null; null means a walk-in |
    | `photo_path` | text | |
    | `photo_w`, `photo_h` | int | pixel size of the stored photo |
    | `message` | text | ≤ 80 chars, `''` allowed |
    | `stickers` | jsonb | `[{id, x, y, scale, rot}]` |
    | `tilt` | real | −3 … 3 degrees, set by the server |
    | `status` | text | `'live' \| 'removed'` |
    | `removed_by` | text null | `'admin:<user id>'` or `'self'` |
    | `removed_at` | timestamptz null | |
    | `client_key` | text | sha-256 of a random per-device cookie id |
    | `ip_hash` | text | sha-256 of the IP with a server salt |
    | `created_at` | timestamptz | |

  - Indexes:
    - `(activity_id, status, created_at)` for the wall and admin
    - `(activity_id, client_key, created_at)` and `(activity_id, ip_hash, created_at)` for rate
      limits
  - RLS is enabled with no policies, as on every other table.
  - Create bucket `polaroids`: public read, no write policy, 4 MB cap, jpeg/webp.
- **D475 — `activities.polaroid` settings, validated with zod:**
  - `prompt` — the composer heading, default "Share the moment!"
  - `public` — the walk-in link on or off, default off
  - `hidden_builtin` — built-in sticker ids to hide
  - `stickers` — event stickers, `{id, url, name}` in `event-media`
  - `blocked_words` — the admin's extra blocked words
  - `columns` — `'auto'` or 3–10
  - `speed` — `'slow' | 'medium' | 'fast'`, default medium
  - `background` — `null`, or `{type: 'image' | 'video', url}` in `event-media`
- **D476 — Sticker coordinates are fractions of the card width.**
  - `x` and `y` are the sticker's centre, measured from the card's top-left corner, in card
    widths. `x` is 0–1. `y` is 0 to the card's height ÷ width.
  - `scale` is the sticker's width as a fraction of the card width, 0.08–0.6.
  - `rot` is in degrees, −180 to 180.
  - The server clamps every value and rejects more than 8 stickers or unknown or hidden ids.
  - A sticker id deleted later draws nothing rather than breaking the card.
- **D477 — Photos keep their own shape. There is no cropping.**
  - The photo fills the card's width.
  - Its box is clamped to a ratio between 9:16 (tall) and 16:9 (wide). A photo beyond that is
    contained in the box with paper-coloured margins, still uncropped.
  - Phones shrink photos to a **1600 px long edge**, JPEG, before upload (a polaroid-specific
    call to `shrinkImage` that always runs). That is enough for a 700 px LED card and a
    ~1,400 px spotlight.

### Posting

- **D478 — Upload flow.**
  1. The composer asks the server action `startPolaroid` for a signed upload URL to
     `polaroids/<event>/<activity>/<uuid>.jpg`. The action checks the activity is open and, for
     walk-ins, that `public` is on.
  2. The browser uploads directly with `uploadToSignedUrl`.
  3. `postPolaroid` re-checks access and the rate limit, then:
     - confirms the object exists and is ≤ 4 MB
     - validates the message and stickers
     - sets the tilt
     - inserts the row
  4. Uploaded objects that never become a post are swept when the event is purged (D485).
- **D479 — The message check runs on the server.**
  - The check uses `obscenity` (English dataset + recommended transformers, so `f4ck` matches),
    a bundled starter list of common Malay/Manglish profanity, and the activity's
    `blocked_words`.
  - A failure returns "Let's keep it friendly — please change the wording." The composer keeps the
    photo, text and stickers.
  - The same matcher runs on the client for instant feedback, but the server is authoritative.
- **D480 — Rate limits.**
  - Everyone: one post per 30 s per `client_key`, and per attendee for portal posts.
  - Walk-ins also: at most 10 posts per hour per `client_key`.
  - No per-IP cap (changed 12 Oct 2026). The first design capped walk-ins at 30 an hour per
    `ip_hash`, but a venue's Wi-Fi or a mobile carrier puts a whole room behind one address, so it
    would throttle everyone. `ip_hash` is still stored, unused. Abuse is handled by closing the
    activity, rotating the walk-in link and takedowns.
  - When limited, the server answers with the seconds to wait, and the button shows "You can post
    again in 18 s".
- **D481 — Two entry points, one composer.**
  - **Portal:** `/e/[slug]/a/[token]/activities/[activityId]`, the attendee's own link. Posts carry
    `attendee_id`.
  - **Walk-in:** `/e/[slug]/polaroid/[publicToken]`. It is public, posts are anonymous, and it
    works only while the event is published, the activity is open and `public` is on. Otherwise
    it shows a friendly "not available" page.
  - Polaroids are never signed with a name.

### Composer (phone)

- **D482 — The instant-camera composer.**
  - **Camera.** The screen opens on an instant camera in the style of the old app: rounded body,
    flash window, viewfinder, a big lens pulsing "TAP TO SNAP", a red shutter, the rainbow stripe
    and the film slot. The activity's prompt is above it. Tapping the lens or the shutter opens
    the phone's picker (`accept="image/*"`, camera or gallery).
  - **Eject.** After a photo is picked, the flash fires and the print ejects downward out of the
    slot. The camera then dims and blurs, and the print rises to centre stage. The print comes out
    pale and **develops** to full colour over ~1.5 s.
  - **Message.** Tap the strip under the photo and type, live in **Caveat** (next/font, loaded
    only by this feature). The limit is 80 chars with a counter; text over 2 lines shrinks to fit.
    The message is optional.
  - **Stickers.**
    - One **Stickers** tray holds the event's stickers first, then the visible built-ins, with no
      tabs.
    - Tap a sticker to drop it at the centre. Drag to move, two-finger pinch to scale and rotate.
    - A corner handle scales and rotates with one thumb, and × deletes. The selected sticker gets
      a dashed outline; tapping elsewhere deselects. The limit is 8.
  - **Cancel** puts the print away and the camera returns.
  - **Post to wall** shows upload progress. On success the print flies up and off the screen,
    "It's on the wall!" appears, and the camera is ready again.
  - **Errors:**
    - profanity → the friendly prompt, nothing lost
    - upload failure → Retry, nothing lost
    - rate limited → a countdown on the button
    - undecodable file (e.g. HEIC the browser can't read) → "Try a different photo"
    - activity closed → "Posting is paused"
  - **Portal only:** a "Your polaroids" strip under the composer, where attendees can remove their
    own posts (with a confirm dialog).
- **D483 — The card look.**
  - A white frame with even borders on three sides and a deeper bottom strip for the message.
  - Washi tape on top and a small tilt.
  - A subtle warm film tone (CSS filter) applied when drawn, never baked into the photo.
  - Built-in stickers are ~20 SVGs bundled in the repo: hearts, stars, sparkles, speech bubbles
    and party icons, with licences recorded next to them.

### Wall (LED)

- **D484 — `/wall/[token]`, its own link per polaroid activity.**
  - It is gated like `displayLinkState`: a valid `wall_token`, a published event, and not past
    `crewLinkLive`.
  - It opens on "Click to start display" (fullscreen and wake lock), reusing the games display
    shell without audio. If that shell can't be imported through `@/features/games/client`, its
    shared part moves to `src/components/display/`.
  - **It is laid out for the real screen, not the 1920×1080 frame.**
    - Column count is `'auto'` by default: `clamp(round(width / (height × 0.33)), 3, 10)`, which
      gives 7 at 5504×2322 and 5 at 1920×1080. Admin can override it from 3 to 10.
  - **Alternating columns:**
    - Odd columns scroll up and even ones down, with each column's speed varied ±10%.
    - The speed is the admin's slow / medium / fast.
    - Each column loops seamlessly. A column too short to fill the screen repeats its list until
      it does.
    - New polaroids go to the column with the least content, inserted at a point currently
      off-screen, so nothing visible jumps.
    - A removed polaroid fades out and its column closes the gap smoothly.
  - **Spotlight:**
    - A new arrival shows large in the centre, developing from pale, while the columns dim and
      blur. Then it shrinks and flies into its column.
    - It lasts 6 s, or 3 s while more than 5 are queued.
    - Beyond 15 queued, the extras skip the spotlight and slide straight in.
  - **Background:** the event's brand colour as a soft gradient by default, or the admin's
    image or looping muted video.
  - **Corner panel:** a "Scan to share" QR to the walk-in link when `public` is on. Otherwise
    nothing.
  - **Empty state:** the camera illustration, "Be the first on the wall", and the QR if on.
  - **Data and memory:**
    - It polls `/api/wall/[token]/state?v=<version>` every 2 s, where the version is built from
      the live count plus the newest created/removed time.
    - It reuses `usePoll` (backoff, clock offset) and `createMemo`.
    - Only cards near the visible area are mounted. Images are preloaded before a card enters.

### Admin

- **D485 — Admin, in the approved admin style (capped and centred, header actions, tabs,
  table-style lists with ⋯ menus, sticky save bar).**
  - **Add:** New activity → Polaroid wall, with name and prompt. `wall_token` and `public_token`
    are minted on create.
  - **Header:**
    - **Open wall** and **Copy wall link**.
    - The existing open/closed switch is the pause: closed means no new posts, while the wall keeps
      showing.
    - ⋯ menu: rotate wall link, delete activity.
  - **Polaroids tab:**
    - `PolaroidCard`s, newest first, refreshing every 5 s.
    - Live / Removed filter with counts.
    - Each card shows who posted it (name or "Walk-in") and the time, with a ⋯ menu → **Remove
      from wall**. A confirm dialog says the photo will be deleted.
    - Removed entries stay as a greyed record (who, when, removed by) without the photo.
  - **Stickers tab:**
    - Event sticker upload (PNG/WebP/SVG ≤ 1 MB, transparent recommended), listed with ⋯ →
      Delete.
    - The built-in pack with a show/hide toggle per sticker.
  - **Settings tab:**
    - Prompt.
    - **Walk-in link:** on/off, QR, copy, rotate.
    - **Blocked words.**
    - **Wall:** columns, speed, background image or video.
  - **Delete activity:** the remove warning counts the polaroids. The rows cascade and the photos
    are deleted from the bucket.
  - **Event purge:** the existing purge also clears `polaroids/<event>/`.

## Out of scope

- An approval queue before posting.
- A downloadable keepsake.
- Flattened images.
- Text-only notes.
- The signature pad.
- Photo filters chosen by the user.
- Name signatures.
- Showing polaroids on the games display.
- Supabase Realtime.
- Checking photo content (only text is checked).

## Testing

- **Unit tests (vitest, `tests/polaroid/`), on the pure rules in `src/features/polaroid/lib/`:**
  - Message check: length, English and Malay words, admin words, leetspeak, empty allowed.
  - Sticker check: count ≤ 8, clamping, unknown and hidden ids rejected.
  - Rate limits: 30 s spacing, the walk-in hourly cap per client, no per-IP cap.
  - The photo box clamp at 9:16 and 16:9.
  - Wall layout:
    - auto column count (7 at 5504×2322, 5 at 1920×1080)
    - shortest-column assignment
    - repeating a short list to fill the screen
  - Spotlight queue: 6 s, 3 s above 5 queued, skipped above 15.
  - Settings zod parsing and defaults.
  - The existing `never` checks and catalogue tests cover the new kind's wiring.
- **`scripts/polaroid-db-check.mjs`:** the migration is applied, the kind constraint accepts
  `polaroid`, the bucket reads publicly with no public write, and takedown deletes the object.
- **`scripts/polaroid-load.mjs` (D405.6):**
  - Posts 150 polaroids within a minute to **`ecpkom`** (never `ecphub`), to check the
    spotlight queue and wall memory.
  - Hammers the walk-in endpoint to confirm the rate limits.
- **Browser checks, on `ecpkom`:**
  - **Phone (mobile viewport):**
    - camera → eject → develop → edit
    - sticker drag, pinch and handle
    - profanity rejection, rate-limit countdown, removing my own polaroid
  - **Wall (5504×2322):**
    - alternating seamless columns and the spotlight
    - a takedown fading out within ~2 s
    - the QR on and off
    - memory flat with 150 polaroids
  - **Admin:** create, moderation feed, sticker upload and hide, settings save, close, and
    delete with clean-up.
