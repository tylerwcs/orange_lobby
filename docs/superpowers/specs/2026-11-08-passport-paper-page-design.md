# Booth passport: a paper page for the stamps — design

8 Nov 2026. Follows `2026-11-08-passport-stamp-artwork-design.md` (D844–D853, shipped and pushed the same day).

## Why

The stamps shipped on white discs. On UOB Innovation Hub 2's navy theme (`uobih2`, background `#000C36` with glow, white cards) the user found that look unappealing: white circles on navy do not feel like a passport. Events usually have a theme, and UOB's is holiday travel, so the passport should feel like the inside of a real one, a bit paper-like. While reviewing the mockups the user also spotted a hard white bar under the page title. That is the activity page's section divider, which on UOB's theme comes out near-white.

Success: an attendee opening Booth Passport sees a passport page with stamps pressed onto it, on any event's theme, and no white bar under the title on dark themes.

## Goals

1. **Paper page (D854).** On every booth passport, the stamps sit on one cream "passport page" card under the progress card (or the completed card), not on white discs.
   - **Paper:** a soft radial gradient, about `#FBF6EA` at the centre through `#F5EDDA` to `#EFE3C8` at the edges. It has 6px corners and a drop shadow strong enough to lift it off a navy page and still visible on a near-white one.
   - **Texture, kept faint (the user asked for less):** one set of thin wavy security lines and one faint rosette (rotated ellipses) behind the stamps, both in brown ink at about 7% opacity. There is **no** paper grain and no second crossing set of lines. The user rejected the heavier version as "a bit too much".
   - **Holder line (D855):** at the top of the page is a small label, "PASSPORT HOLDER", in letter-spaced serif small capitals. Under it is the attendee's name as a subtitle: serif italic, about 14px, sentence case, wrapping over lines if needed, then a thin brown rule. The user rejected a large capitals name and chose "with label" over "name only". This puts the attendee's name back on the passport page. It is still not on the completed card (D849 stands).
   - **Page number:** a small italic page number centred at the foot ("— 3 —"). It is decorative and fixed.
   - The serif is Georgia, falling back to the system serif, used only inside the paper.
2. **Stamps on the paper (D856).** A stamped slot shows the booth's artwork straight on the paper: no disc, tilted as today (`TILTS`). The ink is darkened slightly so a designer's light gold line art reads on cream. The mockup uses `mix-blend-mode: multiply` with `saturate(1.4) brightness(.8) contrast(1.2)`.
   - **Booth without artwork:** shows the plain chop (`StampGlyph`) pressed in the same slot at about two thirds of its width. It is drawn in the event's colours, darkened if needed to read on cream at 3:1 or better.
3. **Empty slots on the paper.** A dashed brown circle holds a serif "?", then the booth name in letter-spaced serif capitals, then the location as today. The colours must read on the paper (WCAG AA for the name and location; the "?" counts as large text). The map link stays under its slot and must read on cream too.
4. **One look for every passport (D857).** The box look (`BoothGrid` / `Cell`, used when no booth has artwork) goes away. Every passport uses the round slots on paper, two columns, with an odd last slot centred at a normal slot's width (as `RoundGrid` does now). `passportLook` and its tests go with it, along with anything that only it fed. A passport with many booths makes a longer page.
5. **Reveal on paper (D858).** The reveal (`StampReveal`, "grow from centre") keeps its whole sequence and timings:
   - The white disc in the middle of the dimmed screen becomes a round piece of the same paper, with the same faint lines, gradient and shadow.
   - The stamp grows onto it, with the gold outline drawn around it as now, then moves into its slot.
   - A booth without artwork reveals the plain chop the same way.
   - Tap or Escape to skip and the reduced-motion version behave as now.
   - What lands in the slot (`LandedCover`) is the stamp straight on the page, matching goal 2.
6. **Divider colour (D859).** The section divider on activity pages (`block` in `src/features/activities/portal/detail-parts.tsx`, `border-t-8 border-muted`) gets its own theme token. Light themes stay unchanged: the token resolves to today's `--muted`.
   - **The cause:** `--muted` is derived from the card colour, so a white-card-on-navy theme (mixed polarity) gives a near-white band on the page ground.
   - **The fix:** with mixed polarity, the divider is a soft shade of the page ground instead, close to the theme's border colour. On UOB that is about `#1A3366`–`#1F3663`, a quiet navy band.
   - This changes every activity page that uses `block` (bookings, submissions, trackers, passport…), on every event whose cards and ground differ in polarity.
   - It also covers the same bar drawn by `src/components/portal/RichSections.tsx` (line 27, its own copy of the classes, above "About" and each organiser section). The user asked to fix the divider "for every activity page on dark themes", and a UOB activity with a description would otherwise still show white bars. Today only `uobih2` and `zz-queue-test` have white cards on a dark ground.
7. **Locked passport.** The no-attendee view (`/e/[slug]/stamps` from the foyer signage, "Your passport is on your badge", D103) keeps its message above the paper.
   - Its booth list is the same paper page with the same two-column grid of "?" slots as a real passport: name, location and map link, plus the page number.
   - It has no holder line, because there is no attendee.
   - My call: this means one paper and one grid get built for both views. The slot hooks on a page with no reveal do no harm. The cost is a taller foyer page when there are many booths.

## Non-goals

- A paper artwork from the event's designer, or any per-event paper colour, texture or font. The paper is drawn in code and is the same on every event. A designer-supplied page image is a possible follow-up.
- Changes to the progress card, the completed card, Show my QR, polling, `seen_at` or the reveal's timing.
- Admin changes. Nothing new to set up.

## Anti-goals

- The texture becoming the thing you notice. It must stay faint; the stamps are the point.
- Gold artwork washing out on cream. That is why the white disc existed (StampDisc's comment, D850). If the darkened ink still looks faint on a real designer's file, the fix is stronger ink treatment, not a white disc again.
- Text on the paper that fails contrast.
- A light-theme change to the divider. Default and light themes must look exactly as today.

## Constraints

- The paper and its inks are fixed colours on every theme, so each use needs the `theme-fixed:` comment on the same line (`tests/theme/fixed-colours-guard.test.ts`).
- Tests run in node (vitest), with no DOM. The divider token rule belongs in `src/features/theme/lib/theme.ts` and is unit-testable there. Visual checks are done in the browser on a test event (`zz-queue-test`, which currently carries UOB's theme). Never test on `ecphub` or `uobih2`.
- The `data-booth-slot`, `data-slot-face` and `data-deg` hooks the reveal measures stay on every slot.
- Mockups (gitignored): `.superpowers/brainstorm/1156-1794126020/content/passport-final.html` is the approved look. It shows UOB with artwork, a light-theme event without artwork with an odd last slot, and the reveal on paper. `passport-page-a3.html` (right phone) shows the chosen holder line.

## Calls I made (not the user's)

- **Box look removed** rather than given its own paper version (goal 4). Both looks were already two columns, and one look is simpler.
- **Plain chop size and inks on paper** (goal 2).
- **Locked view on paper**, using the passport's slot grid rather than the old row list (goal 7).
- **`RichSections` divider included** in the token change (goal 6). It reads as the user's "every activity page".
- **Multiply blend on the image itself**, not on a rotated wrapper, so the blend keeps working (goal 2).
- **The divider rule:** use the ground-derived shade only for mixed polarity (goal 6). The exact shade is the builder's, close to the theme's border.
- **Georgia** as the paper's serif, with no web font loaded.

## Left to the builder

- How the paper, its texture and the paper reveal disc are built and shared: one component, an inline SVG pattern, CSS or a data-URI background.
- The exact ink filter, shadow values and the chop's darkening method, within the goals above.
- What happens to `StampDisc` (rename, variant or replacement), and the cleanup of the white-disc code and its comments.
- The divider token's name and where it is registered (`globals.css` default plus `theme.ts`).
