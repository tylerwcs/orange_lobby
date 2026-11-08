# Booth Passport Paper Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put every booth passport's stamps on a faint cream "passport page" with the holder's name. The reveal grows on a round piece of the same paper. On dark themes with white cards, the activity pages' white section bar becomes a soft shade of the page.

**Architecture:**
- **Colours and texture:** a pure module `paper.ts` holds the paper's fixed colours, inks and texture, plus `chopInk`, which darkens the event's colour until the plain chop reads on cream. Node tests check every ink against every paper stop.
- **Components:** `PassportPaper` is the sheet. `StampInk` is a stamp with no backing. `PaperDisc` is the reveal's round piece of paper.
- **What uses them:** `PassportGrid` (attendee and locked views) and `StampReveal`. The box look is deleted.
- **Divider:** a new `--divider` token is emitted by `theme.ts` only for mixed polarity. It defaults to `var(--muted)` in `globals.css`, so untouched and light themes are byte-identical.

**Tech Stack:** Next.js (repo's version — read `node_modules/next/dist/docs/` before touching framework APIs), React, Tailwind v4, vitest (node env, no DOM).

**Spec:** `docs/superpowers/specs/2026-11-08-passport-paper-page-design.md`

## Global Constraints

- Paper gradient: about `#FBF6EA` centre → `#F5EDDA` → `#EFE3C8` edge. Corners 6px. The drop shadow must lift the paper off navy and still show on a near-white page.
- Texture: one set of wavy lines plus one rosette, brown ink at about 7% opacity. **No grain (`feTurbulence`) and no second crossing set of lines.**
- Holder line: a "PASSPORT HOLDER" label in letter-spaced serif capitals, then the attendee's name in serif italic at about 14px, sentence case, wrapping onto more lines as needed, then a thin brown rule. The name is not on the completed card (D849 stands).
- Page number: "— 3 —", italic, centred, fixed.
- Serif: `Georgia, serif`, used only inside the paper. No web font is loaded.
- Stamp art on paper: `mix-blend-mode: multiply` with `saturate(1.4) brightness(.8) contrast(1.2)`, applied on the `<img>` itself, never on a rotated wrapper.
- Text on the paper meets AA: 4.5:1 for the name, label, booth name and location; the "?" meets 3:1 as large text. The plain chop's ring is at least 3:1 on cream.
- Every attendee line with a fixed white, black or gray class carries `theme-fixed: <reason>` on the same line (`tests/theme/fixed-colours-guard.test.ts`). The paper's hex colours get the same comment as documentation.
- `data-booth-slot`, `data-slot-face` and `data-deg` stay on every slot (the reveal measures them).
- Untouched events: `themeTokens(EMPTY_THEME, p)` still equals `brandStyle(p)` exactly.
- Browser checks run on `zz-queue-test` only (UOB theme copied in, passport `77ab95f9-…`, attendee ZZ Delta, token `zzqdetaqqqqq`). Never on `ecphub` or `uobih2`.
- Decision numbers: D854 paper page, D855 holder line, D856 stamps on paper and chop ink, D857 one look, D858 reveal on paper, D859 divider token.

## Review Focus

1. **A very long or unbroken holder name** (for example 60 letters with no spaces) must wrap or break inside the paper with no sideways scroll. Owned by Task 3, checked in the browser.
2. **A pale event colour** (`#FDE68A`, `#ffb066`, or no colour set, which gives the default) must give a chop ring that still reads on cream. Owned by Task 2, `chopInk` tests.
3. **A dark card on a dark page** (not mixed) keeps `--divider` unset, so the bar is today's `--muted`. **A dark card override on the default light page** (mixed on light) gets a slightly darker shade of the page, not navy. Owned by Task 1, token tests.
4. **An odd booth count** (3, or 7) centres the last slot at a normal slot's width on the paper, in both the attendee and the locked view. Owned by Task 3, checked in the browser.
5. **The map link on cream.** The outline button's `bg-background` (navy on UOB) must not show as a navy chip on the paper. Its fill, border and icon must read on cream. Owned by Task 3, checked through computed styles in the browser.

---

### Task 1: Divider token (D859)

**Files:**
- Modify: `src/features/theme/lib/theme.ts` (`build()`, beside the `mixed` constant, about line 307)
- Modify: `src/app/globals.css`: `--divider: var(--muted);` in `:root` beside `--muted` (line 29), and `--color-divider: var(--divider);` in `@theme inline` beside `--color-muted` (line 121)
- Modify: `src/features/activities/portal/detail-parts.tsx:7` (`block`): `border-muted` → `border-divider`
- Modify: `src/components/portal/RichSections.tsx:27`: the same swap
- Test: `tests/theme/theme-tokens.test.ts`

**Interfaces:**
- Produces: the CSS custom property `--divider` and the Tailwind colour `divider` (`border-divider`).

- [ ] **Step 1: Write the failing tests** in `theme-tokens.test.ts`, inside the `themeTokens` describe:

```ts
it("D859: white cards on navy get a soft navy divider, not the near-white muted", () => {
  const { tokens: t } = themeTokens({ ...UOB, overrides: { card: "#ffffff" } }, "#005cb9");
  expect(t["--divider"]).toBeDefined();
  expect(r(t["--divider"], "#FFFFFF")).toBeGreaterThanOrEqual(7); // a dark band
  expect(r(t["--divider"], t["--background"])).toBeGreaterThanOrEqual(1.2);
  expect(r(t["--divider"], t["--background"])).toBeLessThanOrEqual(2.2); // quiet, not a stripe
});
it("D859: same-polarity themes set no divider, so it stays --muted", () => {
  expect(themeTokens(UOB, "#d9b25f").tokens["--divider"]).toBeUndefined(); // navy cards on navy
  expect(themeTokens({ ...EMPTY_THEME, background: "#fef3c7" }, null).tokens["--divider"]).toBeUndefined();
});
it("D859: a dark card on the default light page gets a slightly darker page shade", () => {
  const { tokens: t } = themeTokens({ ...EMPTY_THEME, overrides: { card: "#1f2937" } }, null);
  expect(r(t["--divider"], "#F5F5F3")).toBeGreaterThanOrEqual(1.05);
  expect(r(t["--divider"], "#F5F5F3")).toBeLessThanOrEqual(1.6);
});
```

- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run tests/theme/theme-tokens.test.ts`
Expected: the 3 new tests FAIL (`--divider` undefined). The existing "no theme gets exactly today's tokens" test still passes.

- [ ] **Step 3: Implement.** In `build()`, when `mixed`, set `tokens["--divider"]`:
  - on a dark page: `toHex(lift(ground, 0.1, 1.3))`
  - on a light page: `toHex(shade(ground, -0.05))`

  Set nothing otherwise. Add one comment naming D859 and the cause (`--muted` follows the card). Then make the `globals.css` and class swaps listed under Files.

- [ ] **Step 4: Run the theme tests and the guard**

Run: `npx vitest run tests/theme`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/theme/lib/theme.ts src/app/globals.css src/features/activities/portal/detail-parts.tsx src/components/portal/RichSections.tsx tests/theme/theme-tokens.test.ts
git commit -m "feat(theme): soft divider band on white-card dark themes (D859)"
```

---

### Task 2: Paper colours, inks and texture (D854, D856)

**Files:**
- Create: `src/features/activities/kinds/passport/paper.ts` (pure, no React)
- Test: `tests/activities/paper.test.ts`

**Interfaces:**
- Consumes: `brandStyle` (`@/lib/brand`), `ensureReadable` (`@/features/theme/lib/theme`), `contrastRatio`/`hexToRgb`/`toHex` (`@/lib/contrast`).
- Produces:
  - `PAPER: { centre: string; mid: string; edge: string }`: `#FBF6EA`, `#F5EDDA`, `#EFE3C8`.
  - `PAPER_INK: { label: string; name: string; booth: string; location: string; question: string; rule: string; dash: string }`. Start from the mockup values (`label #7A5C34`, `name #5E4526`, `booth #7A5C34`, `question #9A7B52`); `rule` and `dash` are brown at about 30–45% alpha, as `rgba()`. Darken any value that fails its test.
  - `paperBackground(): string`: a CSS `background` value. It layers a data-URI SVG (one wave pattern plus one rosette at about 7% brown) over the radial gradient of `PAPER`. Used for both the sheet and the reveal disc.
  - `chopInk(brand: string | null): { ring: string; check: string }`. Uppercase hex.
    - Start from `brandStyle(brand)["--brand"]`, so null gives the default brand.
    - `ring` is moved, keeping its hue, until it reaches 3:1 on all three `PAPER` stops.
    - `check` is the same hue at 4.5:1.
  - `STAMP_ART_FILTER = "saturate(1.4) brightness(.8) contrast(1.2)"`.

- [ ] **Step 1: Write the failing tests**

```ts
const stops = () => Object.values(PAPER);
const ratio = (a: string, b: string) => contrastRatio(hexToRgb(a)!, hexToRgb(b)!);

it("text inks read on every paper stop", () => {
  for (const bg of stops()) {
    for (const k of ["label", "name", "booth", "location"] as const) expect(ratio(PAPER_INK[k], bg), `${k} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    expect(ratio(PAPER_INK.question, bg)).toBeGreaterThanOrEqual(3);
  }
});
it("chopInk lifts a pale brand to 3:1 ring / 4.5:1 check on cream", () => {
  for (const b of ["#FDE68A", "#ffb066", "#F0C88E", "#418EEF", null]) {
    const ink = chopInk(b);
    for (const bg of stops()) {
      expect(ratio(ink.ring, bg)).toBeGreaterThanOrEqual(3);
      expect(ratio(ink.check, bg)).toBeGreaterThanOrEqual(4.5);
    }
  }
});
it("chopInk keeps a brand that already reads", () => expect(chopInk("#005cb9").ring).toBe("#005CB9"));
it("the texture is faint lines only: no grain", () => {
  const bg = paperBackground();
  expect(bg).toContain("data:image/svg+xml");
  expect(decodeURIComponent(bg)).not.toContain("feTurbulence");
});
```

- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run tests/activities/paper.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `paper.ts`** with the Produces signatures. Encode the SVG with `encodeURIComponent`. The SVG carries its own `<pattern>` ids, so pages need no DOM ids or `useId`.

- [ ] **Step 4: Run them**

Run: `npx vitest run tests/activities/paper.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/activities/kinds/passport/paper.ts tests/activities/paper.test.ts
git commit -m "feat(passport): paper colours, inks, texture and chop ink (D854, D856)"
```

---

### Task 3: The passport page on paper, one look (D854–D857)

**Files:**
- Create: `src/features/activities/kinds/passport/PassportPaper.tsx`
- Modify: `src/features/activities/kinds/passport/StampDisc.tsx`
  - Add `StampInk`.
  - `StampGlyph` draws its rings in `var(--chop-ring, var(--brand))` and its check in `var(--chop-check, var(--primary))`. The fallbacks keep the reveal's chop visible until Task 4.
  - `StampDisc` (the white disc) stays only because `StampReveal` still uses it. Task 4 deletes it.
- Modify: `src/features/activities/kinds/passport/PassportGrid.tsx`
  - Delete `Cell`, `BoothGrid`, `EmptyRing` and the `passportLook` branch.
  - `RoundSlot` is restyled in paper inks.
  - `RoundGrid` goes inside `PassportPaper`.
  - `LockedPassport` keeps its `Empty` message, then shows `PassportPaper` with `holder={null}` around `RoundGrid`.
  - New prop `brand: string | null`.
- Modify: `src/features/activities/kinds/passport/PassportLive.tsx`
  - `LandedCover` renders `StampInk`.
  - Delete `LandedGlyph`.
- Modify: `src/features/activities/kinds/passport/PassportBody.tsx`: new prop `brand: string | null`, passed to `PassportGrid`.
- Modify: `src/features/activities/portal/ActivityPage.tsx:82`: pass `brand={event.primary_color}`.
- Modify: `src/app/e/[slug]/(portal)/stamps/page.tsx`: pass `brand={event.primary_color}`.
- Modify: `src/features/activities/lib/booths.ts`: delete `passportLook`.
- Test: `tests/activities/booths.test.ts`: delete the `passportLook` describe and its import.

**Interfaces:**
- Consumes (Task 2): `PAPER_INK`, `paperBackground()`, `chopInk()`, `STAMP_ART_FILTER`.
- Produces:
  - `PassportPaper({ holder, brand, children }: { holder: string | null; brand: string | null; children: ReactNode })`.
    - Renders the sheet: background `paperBackground()`, 6px corners and the shadow.
    - Sets the CSS vars `--chop-ring` and `--chop-check` from `chopInk(brand)` in its `style`.
    - Shows the holder line (only when `holder` is set) above `children`, and "— 3 —" under them.
  - `StampInk({ image, name, deg, artStyle }: { image: string | null; name: string; deg: number; artStyle?: CSSProperties })` fills its box with no backing.
    - With an image: `<img>` with `mixBlendMode: "multiply"` and `filter: STAMP_ART_FILTER`, rotated by `deg`, with `artStyle` on the img.
    - Without one: `StampGlyph`, centred at about two thirds of the box, inside a `role="img"` with `aria-label="<name> stamped"` and `artStyle`. The reveal's mask selector `img, [role=img]` depends on this.
  - `PassportGrid` props gain `brand: string | null`.
  - `PassportBody` props gain `brand: string | null`.

- [ ] **Step 1: Delete the `passportLook` tests** and the import in `tests/activities/booths.test.ts`, then delete `passportLook` from `booths.ts`.

- [ ] **Step 2: Run tsc to list every reference**

Run: `npx tsc --noEmit -p .`
Expected: errors only at `PassportGrid.tsx` (the `passportLook` import). Each one is a place this task rewrites.

- [ ] **Step 3: Build `PassportPaper`, `StampInk`, the restyled `RoundSlot`/`RoundGrid`/`LockedPassport` and `LandedCover`, and plumb `brand`.**
  - **Holder name:** in `PAPER_INK.name`, with `break-words` so an unbroken name cannot overflow (Review Focus 1).
  - **Empty slot:** a dashed circle in `PAPER_INK.dash`; a serif "?" in `question`; the name in letter-spaced serif capitals in `booth`; the location in `location`.
  - **Map link (Review Focus 5):** under its slot, with a transparent fill, the paper rule as its border and `PAPER_INK.name` as the icon colour.
    - Make the override actually beat `buttonVariants`' `bg-background`. Use Tailwind v4's `!` suffix or a `MapLink` `className` merged with `cn`, and confirm it in Step 5.
  - **Odd slot:** the odd last slot stays centred at a normal width.
  - **Comments:** each fixed colour line carries a `theme-fixed:` comment.

- [ ] **Step 4: Run the suite, types and lint for the changed files**

Run: `npx tsc --noEmit -p . && npx vitest run && npx eslint src/features/activities/kinds/passport src/features/activities/lib/booths.ts src/features/activities/portal/ActivityPage.tsx "src/app/e/[slug]/(portal)/stamps/page.tsx" src/features/theme/lib/theme.ts src/components/portal/RichSections.tsx`
Expected: no type errors, every test passing (guard included) and no lint errors.

- [ ] **Step 5: Browser check on `zz-queue-test`.** Use `preview_start`; if the dev server 500s on `next/font`, delete `.next/dev` and `.next/cache` and restart. Then open `/e/zz-queue-test/a/<activity>?t=zzqdetaqqqqq` (or the passport's portal path as ZZ Delta) at mobile width and check:
  - The paper, the holder line with ZZ Delta's name, the Jom stamp in ink on the paper with no disc, and the "?" slot.
  - The navy divider under the title: its computed `border-top-color` is not near-white.
  - The map link's computed background is transparent on the paper.
  - **Long name (Review Focus 1):** temporarily set the attendee's name to `ZZ Deltaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`. `document.documentElement.scrollWidth` must be `<=` the viewport width. Then restore the name.
  - **Chop:** temporarily clear `zzpasstest02`'s `stamp_image_url`, stamp it, and confirm the chop is pressed in the event's colour. Restore it afterwards.
  - **Locked view:** `/e/zz-queue-test/stamps` shows the message, then the paper with "?" slots and no holder line.
  - **Odd count (Review Focus 4):** add a third test booth and confirm the centred last slot, then delete it.
  - **Light theme:** set `zz-queue-test`'s theme back to `{"overrides":{},"background":null,"heading_reach":"titles"}` (primary `#f97316`). The paper shadow must show on the light page and the divider must be unchanged grey. Then restore UOB's theme.

- [ ] **Step 6: Commit**

```bash
git add -A src/features/activities src/app/e tests/activities/booths.test.ts
git commit -m "feat(passport): stamps on a paper page with the holder's name; one look for every passport (D854-D857)"
```

---

### Task 4: The reveal on a piece of paper (D858)

**Files:**
- Modify: `src/features/activities/kinds/passport/StampDisc.tsx`
  - Add `PaperDisc`.
  - Delete `StampDisc`.
  - Rewrite the file's comments: there is no white disc any more, and they should say why (the paper and the ink filter, D856).
- Modify: `src/features/activities/kinds/passport/StampReveal.tsx`: `StampDisc` becomes `PaperDisc` + `StampInk`. Gains a prop `brand: string | null`.
- Modify: `src/features/activities/kinds/passport/PassportLive.tsx`: a new prop `brand: string | null`, passed to `StampReveal`.
- Modify: `src/features/activities/kinds/passport/PassportBody.tsx`: passes `brand` to `PassportLive`.

**Interfaces:**
- Consumes (Tasks 2–3): `paperBackground()`, `chopInk()`, `StampInk`.
- Produces: `PaperDisc({ brand, children }: { brand: string | null; children: ReactNode })`. It is a round piece of paper that fills its box: `paperBackground()`, `rounded-full`, `overflow-hidden`, a shadow that reads on the dark scrim, and `--chop-ring`/`--chop-check` from `chopInk(brand)`.

- [ ] **Step 1: Swap the reveal's disc**
  - In `StampReveal`, render `<PaperDisc brand={brand}><StampInk image={shown.image} name={shown.name} deg={0} /></PaperDisc>` where `StampDisc` was.
  - Keep `box`, the gold outline SVG, every timing, skip, Escape and reduced motion unchanged.
  - The mask still finds `img, [role=img]`, now inside `StampInk`.
  - Update the component's doc comment: "a round piece of paper", not "a white disc".

- [ ] **Step 2: Run types, the suite and lint**

Run: `npx tsc --noEmit -p . && npx vitest run && npx eslint src/features/activities/kinds/passport`
Expected: everything passes.

- [ ] **Step 3: Browser check on `zz-queue-test` as ZZ Delta**
  - Delete ZZ Delta's `zzpasstest02` stamp, so the slot is "?", and open the passport.
  - Open Show my QR, then insert the stamp with a separate SQL call: `insert into booth_stamps …` as the booth scan would.
  - Mid-reveal, take a screenshot: the round paper disc with Rangoli art on the dim scrim, and the gold outline.
  - Once it lands, the stamp sits in ink on the page with no white flash.
  - Tap to skip still lands it.
  - Repeat with `zzpasstest02`'s artwork cleared: the chop reveals on paper. Restore the artwork.

- [ ] **Step 4: Commit**

```bash
git add src/features/activities/kinds/passport
git commit -m "feat(passport): the reveal grows on a round piece of the same paper (D858)"
```
