# Event Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each event gets a colour theme (background + primary, with worked-out colours the organiser can override) that every attendee-facing screen follows, set in Settings with a live phone preview.

**Architecture:** A pure theme engine (`src/features/theme/lib/theme.ts`) turns the stored theme + primary colour into the shadcn CSS variables the portal already reads, contrast-checked in code. Attendee routes render one server `<ThemeStyle>` that writes those variables onto `:root` (so dialogs portalled under `<body>` follow) and replaces today's inline `brandStyle()` on their roots. A few components that hard-code "dark panel" colours move to new `--feature` tokens, and title components read `--heading` / `--card-heading` through CSS fallbacks, so admin pages (which never set them) look unchanged.

**Tech Stack:** Next.js 16 (App Router, server components), Tailwind v4 (`@theme inline`), shadcn/ui on Base UI, Supabase Postgres (jsonb), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-16-event-theme-design.md` (D622–D632). Read it before Task 1.

## Global Constraints

- Every colour is `#RRGGBB`; anything else stored or posted is ignored (treated as "not set").
- An event with no theme set must emit exactly `brandStyle(primary_color)` — today's tokens, nothing more (spec anti-goal: "An event that never touches the theme looking any different from today").
- Every text/ground pair the theme emits clears **4.5:1** (D624). Overrides are adjusted, never rejected.
- Default background `#F5F5F3`, default text ink `#111827` (from `src/app/globals.css`).
- Theme applies only to attendee routes: `/e/[slug]/a/[token]/**`, public `/e/[slug]/**` portal pages, `/e/[slug]/register`, `/e/[slug]/register/done`. Not admin, scanners, verifier pages, game/polaroid displays, `/setup`, or the polaroid camera stage and walk-in page (spec Non-goals).
- The QR image always sits on white (D627).
- Derived colours computed in TypeScript, never CSS `color-mix` (spec Constraints).
- New feature code lives in `src/features/theme/` with `client.ts` (pure, client-safe) and `index.ts` (server) entries, as other features do (D403).
- Decision numbers in code comments: D622–D632 as the spec assigns them.
- `ChromeEvent` and other client-serialised event shapes gain only the fields they need — never the full row.
- Migrations are applied to Supabase project `wfmqwwcolfigjylkgrsv`; test on any event except slug `ecphub`.

## Review Focus

1. **Mixed polarity overrides** — a white card override on a navy background: text on cards must be dark, text on the page must be light. Expected: `--card-foreground` and `--foreground` diverge, both readable. (Task 1 test.)
2. **An override that is unreadable** — text `#0a1440` on background `#000c36`. Expected: shown adjusted to ≥4.5:1, and Settings says "Shown lighter so it can be read" beside that picker. (Task 1 test + Task 5 test.)
3. **Dialogs and the native select on a dark theme** — the cancel dialog and the registration `<select>` must render dark, not white-on-white. Expected: `themeCss()` targets `:root` and sets `color-scheme: dark`. (Task 1 test; Task 4 browser check.)
4. **Garbage in the stored theme** — `theme = {"background":"navy","card":123}` from manual SQL. Expected: page renders as if unset, no crash. (Task 2 test.)
5. **Extreme backgrounds** — `#000000` and `#FFFFFF`. Expected: cards still distinguishable from the page (card ≠ background and border ≠ card), all text readable. (Task 1 test.)

---

## File map

| File | Responsibility |
|---|---|
| `src/features/theme/lib/theme.ts` (create) | Types, defaults, `parseTheme`, `workedOut`, `themeTokens`, `themeCss`, `ensureReadable` |
| `src/features/theme/lib/form.ts` (create) | `themeFromForm(fd)` for the Settings save |
| `src/features/theme/ThemeStyle.tsx` (create) | Server component: `<style>` writing the tokens on `:root` |
| `src/features/theme/admin/ThemeCard.tsx`, `ThemePreview.tsx` (create) | Settings card, pickers, resets, live preview |
| `src/features/theme/client.ts`, `index.ts` (create) | Entries |
| `src/lib/ink.ts` (create) | `TITLE_INK`, `CARD_TITLE_INK` class constants |
| `supabase/migrations/0091_event_theme.sql`, `0092_drop_registration_colours.sql` (create) | Storage; removal of D619/D620 columns |
| `src/app/globals.css` | `--feature`, `--feature-foreground`, colour mappings |
| `src/lib/brand.ts` | Remove D619–D621 helpers |
| UI + attendee files listed per task | Opt into tokens |

---

### Task 1: Theme engine

**Files:**
- Create: `src/features/theme/lib/theme.ts`, `src/features/theme/client.ts`
- Test: `tests/theme/theme-tokens.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ThemeColorKey = "card" | "text" | "muted_text" | "border" | "heading";
  export type HeadingReach = "titles" | "titles_and_cards";
  export type EventTheme = { background: string | null; overrides: Partial<Record<ThemeColorKey, string>>; heading_reach: HeadingReach };
  export const EMPTY_THEME: EventTheme; // { background: null, overrides: {}, heading_reach: "titles" }
  export const DEFAULT_BACKGROUND = "#F5F5F3";
  export function parseTheme(raw: unknown): EventTheme;
  export function isDarkGround(hex: string): boolean;               // D630
  export function workedOut(background: string): Record<ThemeColorKey, string>; // uppercase #RRGGBB
  export function themeTokens(theme: EventTheme, primary: string | null): { tokens: Record<string, string>; dark: boolean; adjusted: Partial<Record<ThemeColorKey, true>> };
  export function themeCss(tokens: Record<string, string>, dark: boolean): string; // ":root{--a:#..;...;color-scheme:dark}"
  export function ensureReadable(fg: Rgb, grounds: Rgb[], min?: number): { rgb: Rgb; adjusted: boolean };
  ```
- Consumes: `brandStyle` (`src/lib/brand.ts`); `contrastRatio`, `hexToRgb`, `readableOn`, `rgbToOklab`, `oklabToRgb`, `toHex`, `Rgb` (`src/lib/contrast.ts`).

Token contract for `themeTokens` (what later tasks read):
- No background and no overrides → `tokens` **equals** `brandStyle(primary)`, `dark: false`.
- Background set → also `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--border`, `--input`, `--bar` (= background, D629), `--feature`, `--feature-foreground`; dark grounds also `--logo-tile: #FFFFFF` and `--logo-pad: 4px` (D628) and dark-adapted `--success-soft`, `--success-strong`, `--warning`, `--warning-soft`, `--destructive-soft`, `--destructive-strong`, `--gold-soft`, `--gold-strong`, `--silver-soft`, `--silver-strong`, `--bronze-soft`, `--bronze-strong`.
- `--primary` readable as text on card and background; `--primary-foreground` = `readableOn(--primary)`; `--accent` = primary mixed 14% toward the ground (Oklab, computed); `--accent-foreground` readable on `--accent`; `--ring` = `--primary`; `--brand`/`--brand-foreground` as in `brandStyle`; `--brand-on-dark` readable on `--feature`.
- `--foreground` readable on background; `--card-foreground` readable on card (they diverge for mixed polarity); `--muted-foreground` readable on both background and card.
- Heading override set → `--heading` readable on background and card; a hue-less heading (Oklab chroma < 0.03) that fails falls back to the text colour (carries D621's `headingOnWhite` rule). `heading_reach: "titles_and_cards"` → also `--card-heading` = `--heading`.
- Overrides win over worked-out values, then pass through `ensureReadable`; `adjusted[key] = true` when that moved them.

- [ ] **Step 1: Write the failing tests** in `tests/theme/theme-tokens.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { brandStyle } from "@/lib/brand";
import { contrastRatio, hexToRgb } from "@/lib/contrast";
import { EMPTY_THEME, parseTheme, themeTokens, themeCss, workedOut, isDarkGround } from "@/features/theme/client";

const r = (a: string, b: string) => contrastRatio(hexToRgb(a)!, hexToRgb(b)!);
const UOB = { ...EMPTY_THEME, background: "#000c36" };

describe("themeTokens (D622-D632)", () => {
  it("an event with no theme gets exactly today's tokens", () => {
    for (const p of [null, "#F97316", "#ffb066", "#d9b25f"]) {
      expect(themeTokens(EMPTY_THEME, p)).toEqual({ tokens: brandStyle(p), dark: false, adjusted: {} });
    }
  });

  it("decides light or dark from the background (D630)", () => {
    expect(isDarkGround("#000c36")).toBe(true);
    expect(isDarkGround("#fef3c7")).toBe(false);
    expect(themeTokens(UOB, "#d9b25f").dark).toBe(true);
  });

  it("UOB navy + gold gives option A: lighter navy cards, white text, gold that reads", () => {
    const { tokens: t } = themeTokens(UOB, "#d9b25f");
    expect(t["--background"]).toBe("#000C36");
    expect(t["--bar"]).toBe("#000C36");
    expect(t["--foreground"]).toBe("#FFFFFF");
    expect(t["--card"]).not.toBe(t["--background"]);
    expect(r(t["--card"], "#FFFFFF")).toBeLessThan(r("#000c36", "#FFFFFF")); // card lighter than ground
    for (const [fg, bg] of [["--foreground", "--background"], ["--card-foreground", "--card"], ["--muted-foreground", "--card"], ["--muted-foreground", "--background"], ["--primary", "--card"], ["--primary-foreground", "--primary"], ["--accent-foreground", "--accent"], ["--brand-on-dark", "--feature"], ["--feature-foreground", "--feature"], ["--success-strong", "--success-soft"], ["--destructive-strong", "--destructive-soft"], ["--gold-strong", "--gold-soft"]])
      expect(r(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    expect(t["--logo-tile"]).toBe("#FFFFFF");
    expect(t["--logo-pad"]).toBe("4px");
  });

  it("every pair reads on extreme and odd grounds", () => {
    for (const bg of ["#000000", "#FFFFFF", "#7f7f7f", "#fef3c7", "#0b1f4b"])
      for (const p of ["#ffd400", "#111111", "#ffffff", "#d9b25f"]) {
        const { tokens: t } = themeTokens({ ...EMPTY_THEME, background: bg }, p);
        expect(t["--card"]).not.toBe(t["--background"]);
        expect(t["--border"]).not.toBe(t["--card"]);
        for (const [fg, g] of [["--foreground", "--background"], ["--card-foreground", "--card"], ["--muted-foreground", "--background"], ["--muted-foreground", "--card"], ["--primary", "--card"], ["--primary", "--background"], ["--primary-foreground", "--primary"]])
          expect(r(t[fg], t[g]), `${bg}/${p} ${fg} on ${g}`).toBeGreaterThanOrEqual(4.5);
      }
  });

  it("mixed polarity: a white card on navy keeps both texts readable", () => {
    const { tokens: t } = themeTokens({ ...UOB, overrides: { card: "#ffffff" } }, "#d9b25f");
    expect(r(t["--foreground"], t["--background"])).toBeGreaterThanOrEqual(4.5);
    expect(r(t["--card-foreground"], "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });

  it("an unreadable override is adjusted and flagged, never dropped", () => {
    const out = themeTokens({ ...UOB, overrides: { text: "#0a1440" } }, "#d9b25f");
    expect(out.adjusted.text).toBe(true);
    expect(r(out.tokens["--foreground"], "#000c36")).toBeGreaterThanOrEqual(4.5);
    expect(themeTokens({ ...UOB, overrides: { text: "#ffffff" } }, null).adjusted.text).toBeUndefined();
  });

  it("heading reach (D632) and hue-less headings", () => {
    const titles = themeTokens({ ...UOB, overrides: { heading: "#d9b25f" } }, null).tokens;
    expect(titles["--heading"]).toBeDefined();
    expect(titles["--card-heading"]).toBeUndefined();
    const cards = themeTokens({ ...UOB, overrides: { heading: "#d9b25f" }, heading_reach: "titles_and_cards" }, null).tokens;
    expect(cards["--card-heading"]).toBe(cards["--heading"]);
    // White heading on the default (light) ground falls back to the text ink, not a dull grey.
    expect(themeTokens({ ...EMPTY_THEME, overrides: { heading: "#ffffff" } }, null).tokens["--heading"]).toBe("#111827");
  });

  it("workedOut fills every key, and themeCss writes :root with the colour scheme", () => {
    expect(Object.keys(workedOut("#000c36")).sort()).toEqual(["border", "card", "heading", "muted_text", "text"]);
    const css = themeCss({ "--background": "#000C36" }, true);
    expect(css).toBe(":root{--background:#000C36;color-scheme:dark}");
    expect(themeCss({}, false)).toBe(":root{color-scheme:light}");
  });

  it("parseTheme keeps valid colours and drops the rest", () => {
    expect(parseTheme({ background: "navy", overrides: { card: 123, text: "#FFFFFF" }, heading_reach: "everything" }))
      .toEqual({ background: null, overrides: { text: "#ffffff" }, heading_reach: "titles" });
    expect(parseTheme(null)).toEqual(EMPTY_THEME);
  });
});
```

- [ ] **Step 2: Run to see it fail**
  Run: `npx vitest run tests/theme/theme-tokens.test.ts`
  Expected: FAIL — cannot resolve `@/features/theme/client`.

- [ ] **Step 3: Implement `src/features/theme/lib/theme.ts`** with the Interfaces and token contract above; `client.ts` re-exports it.
  - `parseTheme` lower-cases valid hex; `heading` lives in `overrides`.
  - `ensureReadable` moves Oklab L away from the grounds (lighter when the grounds are dark, darker when light) in 0.02 steps until every ground passes, max 50 steps; `adjusted` is false when the input already passed.
  - `workedOut` targets for a dark ground: card L+0.06, border L+0.14 and `--secondary`/`--muted` L+0.10 (hue and chroma of the ground kept), text `#FFFFFF`, muted text at L≈0.80 with the ground's hue. For a light ground: card `#FFFFFF`, border = ground L−0.06, text `#111827`, muted `#4B5563`. Tune so `#000c36` lands near card `#0F1D52`, border `#24336B`, muted `#B9C3E6` (the approved mockup values); exact values are the builder's call within the tests.
  - `--feature` on a dark ground: ground L+0.10; on a light ground `#111827`; `--feature-foreground` readable on it.
  - Dark status tokens: each `*-soft` = the status hue at L≈0.32 with the ground's lightness range, each `*-strong` lightened until readable on its soft. Light grounds: leave status tokens unset (globals' values).
  - `themeCss` joins `tokens` in insertion order as `name:value;`, then `color-scheme:dark|light`, inside `:root{…}`. Values are already validated hex or known `color-mix`-free strings, so no escaping is needed.

- [ ] **Step 4: Run the tests until green**
  Run: `npx vitest run tests/theme/theme-tokens.test.ts tests/brand.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  `git add src/features/theme tests/theme && git commit -m "feat(theme): theme engine - worked-out colours, overrides, contrast (D622-D624, D630, D632)"`

---

### Task 2: Storage and save path

**Files:**
- Create: `supabase/migrations/0091_event_theme.sql`, `src/features/theme/lib/form.ts`, `src/features/theme/index.ts`
- Modify: `src/lib/types.ts` (Event), `src/lib/db/events.ts:19-37` (hydrate), `src/app/admin/events/[id]/actions.ts` (`updateSettingsAction`)
- Test: `tests/theme/theme-form.test.ts`

**Interfaces:**
- Consumes: `EventTheme`, `parseTheme`, `EMPTY_THEME` (Task 1).
- Produces: `Event.theme: EventTheme` (always present after hydrate); `themeFromForm(fd: { get(name: string): FormDataEntryValue | null }): EventTheme`. Form field names: `theme_background`, `theme_card`, `theme_text`, `theme_muted_text`, `theme_border`, `theme_heading`, `theme_heading_reach`. An empty string means "not set / worked out".

- [ ] **Step 1: Write the failing test** `tests/theme/theme-form.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { themeFromForm } from "@/features/theme/lib/form";
const fd = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });

describe("themeFromForm", () => {
  it("reads set colours, treats blanks as worked out", () => {
    expect(themeFromForm(fd({ theme_background: "#000C36", theme_card: "", theme_heading: "#D9B25F", theme_heading_reach: "titles_and_cards" })))
      .toEqual({ background: "#000c36", overrides: { heading: "#d9b25f" }, heading_reach: "titles_and_cards" });
  });
  it("stores the default background as unset, and ignores junk", () => {
    expect(themeFromForm(fd({ theme_background: "#f5f5f3", theme_text: "red", theme_heading_reach: "x" })))
      .toEqual({ background: null, overrides: {}, heading_reach: "titles" });
  });
});
```

- [ ] **Step 2: Run to see it fail** — `npx vitest run tests/theme/theme-form.test.ts` → FAIL, module not found.

- [ ] **Step 3: Implement**
  - `form.ts`: `themeFromForm` builds a raw object and runs it through `parseTheme`; a background equal to `DEFAULT_BACKGROUND` (case-insensitive) becomes `null`.
  - Migration `0091_event_theme.sql`:
    ```sql
    -- Event theme (D622-D632). {} = no theme: the portal looks as it always has.
    alter table public.events add column if not exists theme jsonb not null default '{}'::jsonb
      check (jsonb_typeof(theme) = 'object');
    -- D619/D620 were registration-only; their values become the theme's (spec "What happens to D619-D621").
    update public.events set theme = jsonb_strip_nulls(jsonb_build_object(
        'background', registration_background_color,
        'overrides', jsonb_strip_nulls(jsonb_build_object('heading', registration_heading_color))))
      where registration_background_color is not null or registration_heading_color is not null;
    ```
  - `types.ts`: `theme?: EventTheme` on `Event` (optional so fixtures compile; hydrate always fills it). `hydrate`: `theme: parseTheme((row as { theme?: unknown }).theme)`.
  - `updateSettingsAction`: add `theme: themeFromForm(formData)`; keep `primary_color` as today. Remove the `registration_heading_color` / `registration_background_color` writes and their imports (`parseColor`, `DEFAULT_HEADING_COLOR`, `DEFAULT_PAGE_BACKGROUND`).
  - `index.ts` re-exports `client.ts` and `form.ts`.

- [ ] **Step 4: Run tests and typecheck**
  Run: `npx vitest run tests/theme && npx tsc --noEmit -p .`
  Expected: PASS; tsc reports errors only in files Task 4 rewrites (settings page still renders the removed pickers) — if so, leave the pickers' `defaultValue` reading `ev.registration_*` for now; they are removed in Task 4.

- [ ] **Step 5: Apply migration 0091** to `wfmqwwcolfigjylkgrsv` (Supabase MCP `apply_migration`), then confirm: `select slug, theme from events where theme <> '{}'` → uobih2 with `{"background":"#000c36","overrides":{"heading":"#ffffff"}}`.

- [ ] **Step 6: Commit** — `git add supabase/migrations/0091_event_theme.sql src/features/theme src/lib/types.ts src/lib/db/events.ts "src/app/admin/events/[id]/actions.ts" tests/theme && git commit -m "feat(theme): store the event theme (0091)"`

---

### Task 3: Tokens every attendee component can follow

Make attendee components read tokens instead of fixed colours, with defaults that leave today's look unchanged.

**Files:**
- Create: `src/lib/ink.ts`; Test: `tests/theme/fixed-colours-guard.test.ts`
- Modify: `src/app/globals.css`; `src/components/ui/card.tsx` (CardTitle), `dialog.tsx` (DialogTitle), `sheet.tsx` (SheetTitle), `alert-dialog.tsx` (AlertDialogTitle), `field.tsx` (FieldLegend); `src/components/portal/PortalHeader.tsx` (bar + Mark); `src/components/portal/PortalChrome.tsx` (desktop bar, skip link); `src/components/portal/BadgeCard.tsx`; `src/features/activities/kinds/passport/PassportGrid.tsx`; `src/app/e/[slug]/a/[token]/plan/page.tsx:18`; `src/app/e/[slug]/a/[token]/seat/page.tsx:18-19`; `src/features/activities/kinds/submission/SubmissionFields.tsx:75`; `src/features/cancel/portal/CancelSection.tsx:45`; `src/features/activities/kinds/submission/EntryActions.tsx:77`; `src/features/games/components/phone/Panel.tsx`; `src/features/games/components/PlayClient.tsx`; `src/components/portal/BadgeQrDialog.tsx:27`.

**Interfaces:**
- Produces: `TITLE_INK = "text-[color:var(--heading,inherit)]"`, `CARD_TITLE_INK = "text-[color:var(--card-heading,inherit)]"` in `src/lib/ink.ts`; Tailwind colours `bg-feature`, `text-feature-foreground`, `bg-logo-tile` (via `@theme inline`); `--bar` read as `bg-[color:var(--bar,var(--card))]`.
- Consumes: token names from Task 1's contract.

- [ ] **Step 1: Write the failing guard test** `tests/theme/fixed-colours-guard.test.ts`: walk `src/components/portal`, `src/app/e`, `src/features/activities/{portal,kinds}`, `src/features/cancel/portal`, `src/features/games/components/{phone,PlayClient.tsx}`; fail on any `.tsx` line matching `/\b(text-white|bg-white(?!\/)|bg-black|bg-foreground|text-gray-\d+)\b/` unless the line carries a `theme-fixed:` comment explaining why (same opt-out pattern as `tests/attendee-reads-guard.test.ts`'s `any-status:`). Exclude `src/app/e/[slug]/polaroid/` and `src/features/polaroid/` (non-goal).
- [ ] **Step 2: Run it** — `npx vitest run tests/theme/fixed-colours-guard.test.ts` → FAIL listing the files above.
- [ ] **Step 3: globals.css** — in `:root` add `--feature: oklch(0.2101 0.0318 264.66); /* #111827 */`, `--feature-foreground: oklch(0.9696 0.0026 106.45); /* #F5F5F3 */`, `--logo-tile: transparent;` and in `@theme inline` map `--color-feature`, `--color-feature-foreground`, `--color-logo-tile`. Update the `--brand-on-dark` comment: it is read on `--feature`.
- [ ] **Step 4: Sweep** — each listed file:
  - dark panels (`bg-foreground … text-background|text-white`) → `bg-feature text-feature-foreground`; `text-background/70` inside them → `text-feature-foreground/70`; `text-gray-300` in the seat tile → `text-feature-foreground/70`.
  - destructive buttons' `text-white` → `text-destructive-foreground`; skip link → `focus:bg-feature focus:text-feature-foreground`.
  - games `bg-white` + `text-primary` → `bg-card text-primary`.
  - `bg-white/10` tiles inside a feature panel stay (they sit on `--feature`, which stays dark) — mark with `theme-fixed: on --feature`.
  - PortalHeader: `bg-card` → `bg-[color:var(--bar,var(--card))]`; event name gets `TITLE_INK`; remove the `onGround` prop and its D621 branches (`PAGE_HEADING_INK`, `PAGE_TEXT_INK`, `HEADING_INK`) — meta line goes back to `text-muted-foreground`. Mark's `<img>` gets `bg-logo-tile p-[var(--logo-pad,0px)]`.
  - QR on white (D627): `BadgeQrDialog`'s `<img>` (`src/components/portal/BadgeQrDialog.tsx:27`) gets `bg-white p-3` with a `theme-fixed: QR on white (D627)` comment; any other attendee QR `<img>` the same.
  - PortalChrome desktop bar: same `--bar` class.
  - CardTitle, DialogTitle, SheetTitle, AlertDialogTitle, FieldLegend: append `CARD_TITLE_INK` to their `cn(...)`. Admin never sets `--card-heading`, so `inherit` keeps them as today.
- [ ] **Step 5: Run** — `npx vitest run && npx tsc --noEmit -p . && npx eslint src/components src/features src/app/e src/lib` → all PASS. `tests/contrast.test.ts` must still pass with the new globals entries (add `--feature-foreground` on `--feature` to its pairs).
- [ ] **Step 6: Browser check, default theme** — on a non-ecphub live event, Me page badge, passport grid, seat page and a dialog look exactly as before (screenshot before/after).
- [ ] **Step 7: Commit** — `git commit -am "refactor(portal): attendee components read theme tokens; defaults unchanged (D625, D628, D629)"` (add `src/lib/ink.ts` and the new test first).

---

### Task 4: Apply the theme on attendee routes; retire D619–D621

**Files:**
- Create: `src/features/theme/ThemeStyle.tsx`
- Modify: `src/app/e/[slug]/a/[token]/layout.tsx`, `src/components/portal/PortalShell.tsx`, `src/components/portal/PortalChrome.tsx`, `src/components/portal/ConsentGate.tsx:34`, `src/features/cancel/portal/CancelledCard.tsx:10`, `src/app/e/[slug]/register/page.tsx`, `src/app/e/[slug]/register/RegisterForm.tsx`, `src/app/e/[slug]/register/done/page.tsx:36`, `src/lib/brand.ts`, `tests/brand.test.ts`, `src/app/admin/events/[id]/settings/page.tsx` (Registration tab), page titles listed in Step 3
- Test: `tests/theme/theme-style.test.ts` (the suite runs `.test.ts` files in Node only — no component rendering; `vitest.config.ts`)

**Interfaces:**
- Consumes: `themeTokens`, `themeCss` (Task 1); `Event.theme` (Task 2); `TITLE_INK` (Task 3).
- Produces: `eventThemeCss(event: Pick<Event, "theme" | "primary_color">): string` in `src/features/theme/lib/theme.ts` (= `themeCss` of `themeTokens(event.theme ?? EMPTY_THEME, event.primary_color)`), and `ThemeStyle({ event })` — a server component rendering `<style>{eventThemeCss(event)}</style>`.

- [ ] **Step 1: Failing test** `tests/theme/theme-style.test.ts` — `eventThemeCss({ theme: {background:"#000c36",overrides:{},heading_reach:"titles"}, primary_color: "#d9b25f" })` starts with `:root{`, contains `--background:#000C36` and ends with `color-scheme:dark}`; `eventThemeCss({ theme: undefined, primary_color: null })` contains `--primary:`, ends with `color-scheme:light}` and has no `--background`.
- [ ] **Step 2: Run** → FAIL (module missing).
- [ ] **Step 3: Implement and wire**
  - `ThemeStyle.tsx` (server component, in `index.ts`).
  - Render `<ThemeStyle event={event} />` once in: the token layout (before every return: cancelled, consent, chrome), `PortalShell`, register page, register/done page.
  - Remove the inline `style={brandStyle(...)}` from `PortalChrome` (both branches), `ConsentGate`, `CancelledCard`, register page, register/done page — the `:root` style now carries those tokens. Keep `brandStyle` everywhere else (verifier, setup, PhoneFrame).
  - Register page: drop the outer full-window `div` and `registrationLook`; body's `bg-background` now fills the window. Keep the D618 banner placement under the bar.
  - `src/lib/brand.ts`: delete `DEFAULT_HEADING_COLOR`, `DEFAULT_PAGE_BACKGROUND`, `parseColor`, `headingOnWhite`, `registrationLook`, `HEADING_INK`, `PAGE_HEADING_INK`, `PAGE_TEXT_INK`, and their tests in `tests/brand.test.ts` (Task 1 covers the behaviour). `RegisterForm` legends drop `HEADING_INK` (FieldLegend now carries `CARD_TITLE_INK`; "Event terms" keeps `font-extrabold`).
  - Settings → Registration: remove the Heading colour and Background colour pickers and their `formKey` entries.
  - Page titles get `TITLE_INK`: every `<h1` under `src/components/portal`, `src/app/e`, `src/features/activities/{portal,kinds}`, `src/features/games/components/PlayClient.tsx` (24 today — `grep -rn "<h1"` those paths), plus the register `Register` h1 and the home greeting.
- [ ] **Step 4: Run** — `npx vitest run && npx tsc --noEmit -p . && npx eslint src` → PASS.
- [ ] **Step 5: Browser check on uobih2** (theme from 0091: navy + white heading; set `primary_color` to `#d9b25f` there by SQL for the check and restore it after): registration page, token link home (`/e/uobih2/a/g6d2fw2fa6k6` is draft → Coming soon; temporarily set status live, restore after), Me page with badge, a dialog (cancel), the native `<select>` on registration. Expected: option A look, dark dialog, dark select, QR on white, logo on a white tile, nothing unreadable. Screenshot each.
- [ ] **Step 6: Commit** — `git commit -m "feat(theme): attendee routes follow the event theme; registration-only colours retired (D625-D629)"`

---

### Task 5: Theme card with live preview in Settings

**Files:**
- Create: `src/features/theme/admin/ThemeCard.tsx`, `src/features/theme/admin/ThemePreview.tsx`
- Modify: `src/app/admin/events/[id]/settings/page.tsx` (Details tab; move Primary colour out of the Event section), `src/features/setup/preview/PhoneFrame.tsx` (optional `style` prop overriding `brandStyle`)
- Create: `src/features/theme/admin/card-state.ts`
- Test: `tests/theme/theme-card-state.test.ts`

**Interfaces:**
- Consumes: `workedOut`, `themeTokens`, `EventTheme`, `DEFAULT_BACKGROUND` (Task 1); form field names (Task 2); `PortalHeader`, `LauncherGrid`, `launcherItems`, `sectionIcons` (as `src/features/setup/preview/HomePreview.tsx` uses them).
- Produces: in `card-state.ts` (pure): `pickerValue(theme: EventTheme, key: ThemeColorKey | "background"): string` (override, else worked-out, else `DEFAULT_BACKGROUND`, lower-case); `postedValue(theme, key): string` (override or "", background or ""); `withOverride(theme, key, hex: string | null): EventTheme` (null = reset); `adjustedNote(theme, primary: string, key: ThemeColorKey): string | null`. And `ThemeCard({ theme, primaryColor, event }: { theme: EventTheme; primaryColor: string; event: { name: string; logo_url: string | null; banner_url: string | null; starts_on: string | null; ends_on: string | null; venue_name: string | null } })` — client component, renders inside the Settings form.

- [ ] **Step 1: Failing test** `tests/theme/theme-card-state.test.ts`:
  - `postedValue(EMPTY_THEME, "background")` and `postedValue(EMPTY_THEME, "card")` are `""`; `pickerValue(EMPTY_THEME, "background")` is `"#f5f5f3"`.
  - With `t = withOverride(EMPTY_THEME, "background", "#000c36")`: `postedValue(t, "background")` is `"#000c36"`, `pickerValue(t, "card")` equals `workedOut("#000c36").card.toLowerCase()`.
  - `postedValue(withOverride(withOverride(t, "card", "#ffffff"), "card", null), "card")` is `""`.
  - `adjustedNote(withOverride(t, "text", "#0a1440"), "#d9b25f", "text")` is `"Shown lighter so it can be read"`; on a light ground with text `#f0f0f0` it is `"Shown darker so it can be read"`; a readable override gives `null`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**
  - Card title **Theme**, description "Colours for everything attendees see. Set the background and primary colour; the rest is worked out, and you can change any of it."
  - Rows: Background (picker + Reset to default), Primary colour (`name="primary_color"`, moved here from the Event section), then Cards, Text, Secondary text, Borders, Headings — each a colour input showing the override or the worked-out value, a hidden input posting the override or "", and **Reset** (shown only when overridden). Under Headings, a two-option radio "Use the heading colour for": "Page titles only" (`titles`) / "Page titles and card titles" (`titles_and_cards`).
  - Note beside any row in `themeTokens(...).adjusted`: "Shown lighter so it can be read" on a dark ground, "Shown darker so it can be read" on a light one.
  - `ThemePreview`: `PhoneFrame` with `style={themeTokens(currentTheme, primary).tokens}` and `color-scheme`, showing PortalHeader (bar), the event banner, a greeting title (`TITLE_INK`), a primary button, a Card with title + three agenda rows, and the launcher grid. Side by side with the pickers at `@3xl` container width, stacked below.
  - `ThemeCard` holds an `EventTheme` in state and renders only through the `card-state.ts` helpers, so the tested logic is the logic that runs.
  - Settings page: add `<ThemeCard>` in the Details tab after "Branding and images"; add `ev.theme` to the form's `formKey` list.
- [ ] **Step 4: Run** — `npx vitest run && npx tsc --noEmit -p . && npx eslint src` → PASS.
- [ ] **Step 5: Browser check** (signed-in admin session, uobih2 — if the browser pane is not signed in, ask the user to sign in; never enter a password): pick colours, watch the preview change before saving, switch the heading reach and see card titles change in the preview, Save, open the registration link — matches the preview. Reset each override. Restore uobih2's theme afterwards to navy + white heading.
- [ ] **Step 6: Commit** — `git commit -m "feat(theme): Theme card with live preview in Settings (D626, D631, D632)"`

---

### Task 6: Drop the registration-only colour columns (after deploy)

Run only after Tasks 1–5 are pushed and the deploy is live: the old deploy still writes these columns on Save.

**Files:**
- Create: `supabase/migrations/0092_drop_registration_colours.sql`
- Modify: `src/lib/types.ts` (remove `registration_heading_color`, `registration_background_color`), `docs/superpowers/specs/2026-10-16-registration-look-design.md` (note: D619–D621 superseded by D622–D632)

- [ ] **Step 1:** `0092`: `alter table public.events drop column if exists registration_heading_color, drop column if exists registration_background_color;`
- [ ] **Step 2:** Remove the two fields from `Event`; `npx tsc --noEmit -p .` → PASS (nothing reads them after Task 4).
- [ ] **Step 3:** Apply 0092 to `wfmqwwcolfigjylkgrsv`; confirm with `select column_name from information_schema.columns where table_name='events' and column_name like 'registration_%color'` → no rows.
- [ ] **Step 4: Commit** — `git commit -m "chore(theme): drop registration-only colour columns (0092)"`
