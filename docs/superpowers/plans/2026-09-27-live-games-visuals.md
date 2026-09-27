# Live games visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the live games a game-show look on the LED and the phone, add LED sound and per-game backgrounds, and give the lucky draw four formats (slot machine, wheel of names, mosaic elimination, card round).

**Architecture:** Pure rules first (config, phases, mosaic rounds, card deck, wheel geometry, layouts) under `src/lib/games/`, unit-tested with Vitest. One migration (`0050`) adds the card round's data and widens `draw_spin`; `npm run check:games` proves it on a throwaway event. Server views (`display-state.ts`, `phone-state.ts`) and host actions learn the formats. The LED keeps its 1920×1080 canvas (D284) and gains one React Three Fiber canvas behind the HTML screens, loaded only on `/display/[token]`; 2D motion uses `motion`.

**Tech Stack:** Next.js 16.3 (App Router; read `node_modules/next/dist/docs/` before using an API you have not used in this repo), React 19.2, TypeScript, Tailwind v4, zod 4, Supabase (Postgres + Storage), Vitest 5 (node environment, `tests/**/*.test.ts`), `motion`, `three`, `@react-three/fiber` 9, `@react-three/drei`.

**Spec:** `docs/superpowers/specs/2026-09-27-live-games-visuals-design.md` (D290–D322), which builds on `docs/superpowers/specs/2026-09-26-live-games-design.md` (D250–D289). Read both before starting.

## Global Constraints

- Work on `main` directly (the user declines worktrees). Commit after every task. Never push without asking the user: pushing `main` deploys to Vercel.
- Never create, edit or delete anything in the event with slug `ecphub` (the real event). Browser checks use `ecpkom`.
- Migration `0050_draw_formats.sql` must be applied to the live database **before** any code that reads it is pushed. Ask the user before applying it.
- Stored game configs must keep parsing: add keys with defaults, never remove or rename one (D287).
- `motion` may be imported only by LED components, `PlayClient`, `GameBanner` and the phone components under `src/components/games/phone/`. `three`, `@react-three/fiber` and `@react-three/drei` may be imported only under `src/components/games/display/three/`, reached through `next/dynamic` with `ssr: false`.
- The LED is laid out on a fixed 1920×1080 canvas; 3D world units equal CSS pixels at z = 0 (origin at the centre, y up).
- No tap counts on any screen or in any display or phone payload (D304).
- The display link may learn draw winners when a spin starts (D312); phone payloads never learn them before the reveal.
- Chroma green is `#00B140`; in green mode the D option colour is `#8E4EC6` and confetti has no green (D299).
- Copy follows the app's voice: short, plain sentences; no exclamation marks in admin copy.
- Run `npx vitest run` and `npx tsc --noEmit` before every commit; both must pass.

## File Structure

New pure modules (unit-tested):
- `src/lib/games/background.ts` — background schema, defaults, green helpers, `backgroundFromForm`
- `src/lib/games/cards.ts` — deck dealing, card views, remaining cards
- `src/lib/games/wheel.ts` — slice geometry and tick throttle
- `src/lib/games/layout.ts` — LED layouts: card grid, slot reels
- `src/lib/games/display-test.ts` — fixtures for the `?test` self-test
- `src/lib/games/sound.ts` — Web Audio synth and mute storage (client-safe, no top-level `window`)
- `src/lib/games/font.ts` — the display font (`next/font/google`)

New components:
- `src/components/games/display/three/` — `Stage3D.tsx`, `textTexture.ts`, `useAnimating.ts`, `ThemeBackdrop.tsx`, `Confetti3D.tsx`, `SlotReels.tsx`, `Wheel.tsx`, `CardTable.tsx`, `Scene.tsx`
- `src/components/games/display/` — `DisplayView.tsx`, `Backdrop.tsx`, `MuteToggle.tsx`, `TimerRing.tsx`, `useSoundCues.ts`, `MosaicDraw.tsx`, `DisplayTest.tsx`
- `src/components/games/phone/` — `Panel.tsx`, `TapPad.tsx`
- `src/components/admin/BackgroundPicker.tsx`, `src/components/admin/DrawFormatFields.tsx`
- `src/lib/supabase/browser.ts`
- `supabase/migrations/0050_draw_formats.sql`

Changed: `config.ts`, `config-form.ts`, `views.ts`, `phase.ts`, `poll.ts`, `mosaic.ts`, `race.ts`, `draw.ts`, `wire.ts`, `display-state.ts`, `phone-state.ts`, `db/games.ts`, `db/media.ts`, `storage.ts`, `exports.ts`, `app/host/[token]/actions.ts`, `HostConsole.tsx`, `PlayClient.tsx`, `GameBanner.tsx`, every file in `components/games/display/`, the display and play pages, the game editor page and its actions, `scripts/games-db-check.mjs`, `scripts/games-load.mjs`, `docs/runbook.md`, `src/app/globals.css`, `package.json`.

---

### Task 1: Packages and the display font

**Files:**
- Modify: `package.json` (via npm)
- Create: `src/lib/games/font.ts`
- Modify: `src/app/globals.css` (the `@theme inline` block, line ~77)

**Interfaces:**
- Produces: `gameFont` (a `next/font` object: `.variable` is the class that defines `--font-bricolage`, `.style.fontFamily` is the CSS family string); the Tailwind utility `font-game`.

- [ ] **Step 1: Install the packages**

Run:
```bash
npm install motion three @react-three/fiber @react-three/drei
npm install -D @types/three
```
Expected: installs without peer-dependency errors (R3F 9 supports React 19). Run `npm ls motion three @react-three/fiber @react-three/drei` and confirm each is listed once.

- [ ] **Step 2: Create the font module**

`src/lib/games/font.ts`:
```ts
import { Bricolage_Grotesque } from "next/font/google";

/**
 * The games' display face (D291): names, numbers, questions and headings on the LED and the
 * play page. Body text stays Manrope. `variable` defines --font-bricolage, which the
 * `font-game` utility reads (globals.css); 3D text textures use `style.fontFamily` (D293).
 */
export const gameFont = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: "800",
  variable: "--font-bricolage",
  display: "swap",
});
```
If `Bricolage_Grotesque` is not exported by this Next's `next/font/google` (tsc says so), stop and ask the user which face to use instead; do not silently swap.

- [ ] **Step 3: Add the Tailwind utility**

In `src/app/globals.css`, inside the existing `@theme inline {` block, after `--font-heading: var(--font-sans);`, add:
```css
  --font-game: var(--font-bricolage), var(--font-sans);
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — Expected: no errors.
Run: `npx vitest run` — Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/games/font.ts src/app/globals.css
git commit -m "chore(games): motion, three and the display font"
```

---

### Task 2: Backgrounds and the new config keys

**Files:**
- Create: `src/lib/games/background.ts`
- Modify: `src/lib/games/config.ts`
- Modify: `src/lib/games/config-form.ts`
- Test: `tests/games-background.test.ts` (new), `tests/games-config.test.ts`, `tests/games-config-form.test.ts`

**Interfaces:**
- Produces:
  - `BACKGROUND_KINDS`, `type BackgroundKind`, `type Background = { kind: BackgroundKind; url: string | null }`, `DEFAULT_BACKGROUND`, `CHROMA_GREEN`, `backgroundSchema`, `backgroundOf(game: { config: { background?: Background } } | null): Background`, `confettiColours(green: boolean): string[]`, `backgroundFromForm(kind: string, input: { image: string | null; video: string | null; ours: (url: string) => boolean }): { ok: true; background: Background } | { ok: false; error: string }`
  - In `config.ts`: `DRAW_FORMATS`, `type DrawFormat`, `DRAW_FORMAT_LABELS`, `MAX_CARDS = 20`, `prizeUnits(prizes: { quantity: number }[]): number`; every config type gains `background: Background`; `DrawConfig` gains `format: DrawFormat; spin_s: number; rounds: number`.

- [ ] **Step 1: Write the failing tests**

`tests/games-background.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  backgroundFromForm, backgroundOf, backgroundSchema, CHROMA_GREEN, confettiColours, DEFAULT_BACKGROUND,
} from "@/lib/games/background";

describe("backgroundSchema (D297)", () => {
  it("reads a missing background as Theme", () => {
    expect(backgroundSchema.parse(undefined)).toEqual(DEFAULT_BACKGROUND);
  });
  it("keeps green and drops any url on it", () => {
    expect(backgroundSchema.parse({ kind: "green", url: "https://x.test/a.png" })).toEqual({ kind: "green", url: null });
  });
  it("keeps an image with its url", () => {
    expect(backgroundSchema.parse({ kind: "image", url: "https://x.test/a.png" })).toEqual({ kind: "image", url: "https://x.test/a.png" });
  });
  it("reads an image or video with no url as Theme", () => {
    expect(backgroundSchema.parse({ kind: "video", url: null })).toEqual(DEFAULT_BACKGROUND);
  });
  it("reads anything unreadable as Theme rather than failing the game", () => {
    expect(backgroundSchema.parse({ kind: "disco", url: 3 })).toEqual(DEFAULT_BACKGROUND);
  });
});

describe("backgroundOf", () => {
  it("is Theme with no game on stage", () => {
    expect(backgroundOf(null)).toEqual(DEFAULT_BACKGROUND);
  });
  it("is the game's background", () => {
    expect(backgroundOf({ config: { background: { kind: "green", url: null } } })).toEqual({ kind: "green", url: null });
  });
});

describe("confettiColours (D299)", () => {
  it("has green normally and none in green mode", () => {
    expect(confettiColours(false)).toContain("#22C55E");
    expect(confettiColours(true).some((c) => c === "#22C55E" || c === CHROMA_GREEN)).toBe(false);
  });
});

describe("backgroundFromForm (D300)", () => {
  const ours = (u: string) => u.startsWith("https://sb.test/");
  it("theme and green need nothing", () => {
    expect(backgroundFromForm("green", { image: null, video: null, ours })).toEqual({ ok: true, background: { kind: "green", url: null } });
  });
  it("an image needs an uploaded or kept image", () => {
    expect(backgroundFromForm("image", { image: null, video: null, ours }).ok).toBe(false);
    expect(backgroundFromForm("image", { image: "https://sb.test/a.png", video: null, ours }))
      .toEqual({ ok: true, background: { kind: "image", url: "https://sb.test/a.png" } });
  });
  it("a video must be one we stored", () => {
    expect(backgroundFromForm("video", { image: null, video: "https://evil.test/v.mp4", ours }).ok).toBe(false);
    expect(backgroundFromForm("video", { image: null, video: "https://sb.test/v.mp4", ours }))
      .toEqual({ ok: true, background: { kind: "video", url: "https://sb.test/v.mp4" } });
  });
  it("an unknown kind is refused", () => {
    expect(backgroundFromForm("disco", { image: null, video: null, ours }).ok).toBe(false);
  });
});
```

Append to `tests/games-config.test.ts` (keep its existing imports; add `DRAW_FORMAT_LABELS`, `drawFormSchema`, `prizeUnits`, `MAX_CARDS` to the import from `@/lib/games/config`):
```ts
describe("draw formats (D310, D311, D315, D321)", () => {
  it("an old draw reads as a slot machine with the defaults", () => {
    const c = parseConfig("draw", { checkpoint_id: null, exclude_categories: [], prizes: [] });
    expect(c).toMatchObject({ format: "slot", spin_s: 6, rounds: 4, background: { kind: "theme", url: null } });
  });
  it("an unknown stored format reads as slot rather than dropping the game", () => {
    expect(parseConfig("draw", { format: "roulette" })?.format).toBe("slot");
  });
  it("every kind gets a Theme background by default", () => {
    expect(defaultConfig("tap_race").background).toEqual({ kind: "theme", url: null });
    expect(defaultConfig("survival").background).toEqual({ kind: "theme", url: null });
  });
  it("counts prize units", () => {
    expect(prizeUnits([{ quantity: 1 }, { quantity: 2 }, { quantity: 7 }])).toBe(10);
  });
  it("the editor refuses a card round over 20 cards, but a stored one still reads", () => {
    const prizes = [{ name: "Mug", quantity: MAX_CARDS + 1 }];
    const form = { checkpoint_id: null, exclude_categories: [], prizes, format: "cards", spin_s: 6, rounds: 4 };
    expect(drawFormSchema.safeParse(form).success).toBe(false);
    expect(drawFormSchema.safeParse({ ...form, format: "slot" }).success).toBe(true);
    expect(parseConfig("draw", form)?.format).toBe("cards");
  });
  it("labels every format", () => {
    expect(Object.keys(DRAW_FORMAT_LABELS).sort()).toEqual(["cards", "mosaic", "slot", "wheel"]);
  });
});
```

Append to `tests/games-config-form.test.ts` (it already builds forms; if it has no helper, add this one at the top):
```ts
const form = (entries: [string, string][]) => {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
};

describe("draw format fields (D310, D311, D315)", () => {
  const cp = "11111111-1111-4111-8111-111111111111";
  const base: [string, string][] = [["checkpoint_id", cp], ["prizes", JSON.stringify([{ name: "Mug", quantity: 2 }])]];
  it("reads format, spin time and rounds", () => {
    const r = configFromForm("draw", form([...base, ["format", "mosaic"], ["spin_s", "9"], ["rounds", "5"]]));
    expect(r).toMatchObject({ ok: true, config: { format: "mosaic", spin_s: 9, rounds: 5 } });
  });
  it("explains a spin time out of range", () => {
    const r = configFromForm("draw", form([...base, ["format", "slot"], ["spin_s", "2"], ["rounds", "4"]]));
    expect(r).toEqual({ ok: false, error: "Spin time is 3 to 20 seconds." });
  });
  it("explains rounds out of range", () => {
    const r = configFromForm("draw", form([...base, ["format", "mosaic"], ["spin_s", "6"], ["rounds", "9"]]));
    expect(r).toEqual({ ok: false, error: "Rounds are 2 to 8." });
  });
  it("explains a card round over 20 cards", () => {
    const big: [string, string][] = [["checkpoint_id", cp], ["prizes", JSON.stringify([{ name: "Mug", quantity: 21 }])]];
    const r = configFromForm("draw", form([...big, ["format", "cards"], ["spin_s", "6"], ["rounds", "4"]]));
    expect(r).toEqual({ ok: false, error: "A card round has at most 20 cards: its prize quantities must add up to 20 or fewer." });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/games-background.test.ts tests/games-config.test.ts tests/games-config-form.test.ts`
Expected: FAIL — `@/lib/games/background` does not exist; `prizeUnits` is not exported.

- [ ] **Step 3: Write `background.ts`**

`src/lib/games/background.ts`:
```ts
import { z } from "zod";

/** What the LED shows behind a game (D297). */
export const BACKGROUND_KINDS = ["theme", "green", "image", "video"] as const;
export type BackgroundKind = (typeof BACKGROUND_KINDS)[number];
export type Background = { kind: BackgroundKind; url: string | null };

export const DEFAULT_BACKGROUND: Background = { kind: "theme", url: null };

/** Broadcast chroma green, for the AV team to key out (D299). */
export const CHROMA_GREEN = "#00B140";

const needsUrl = (k: BackgroundKind) => k === "image" || k === "video";

/**
 * Read tolerantly (D297): a stored background that no longer parses — or an image or video with
 * no file — reads as Theme, so one bad value can never take a game off the LED on the day.
 */
export const backgroundSchema = z
  .object({ kind: z.enum(BACKGROUND_KINDS), url: z.url().max(2000).nullable() })
  .transform((b): Background => {
    if (!needsUrl(b.kind)) return { kind: b.kind, url: null };
    return b.url ? { kind: b.kind, url: b.url } : DEFAULT_BACKGROUND;
  })
  .catch(DEFAULT_BACKGROUND);

/** The background of the game on stage; Theme when nothing is on (the idle screen, D298). */
export function backgroundOf(game: { config: { background?: Background } } | null): Background {
  return game?.config.background ?? DEFAULT_BACKGROUND;
}

const CONFETTI = ["#F97316", "#FACC15", "#22C55E", "#3B82F6", "#EC4899"];

/** Confetti colours; no green in green mode, or the pieces would be keyed out (D299). */
export function confettiColours(green: boolean): string[] {
  return green ? CONFETTI.filter((c) => c !== "#22C55E") : CONFETTI;
}

export type BackgroundResult = { ok: true; background: Background } | { ok: false; error: string };

/**
 * The background the game editor saves (D300). `image` is the image URL after the save's upload
 * (a new upload, or the one already stored); `video` is the URL the browser uploaded a video to,
 * accepted only when `ours` says it is in our bucket.
 */
export function backgroundFromForm(kind: string, input: { image: string | null; video: string | null; ours: (url: string) => boolean }): BackgroundResult {
  if (kind === "theme" || kind === "green") return { ok: true, background: { kind, url: null } };
  if (kind === "image") {
    return input.image ? { ok: true, background: { kind, url: input.image } } : { ok: false, error: "Choose a background image, or pick another background." };
  }
  if (kind === "video") {
    if (!input.video) return { ok: false, error: "Upload a background video, or pick another background." };
    return input.ours(input.video) ? { ok: true, background: { kind, url: input.video } } : { ok: false, error: "That video was not uploaded here. Upload it again." };
  }
  return { ok: false, error: "Pick a background." };
}
```

- [ ] **Step 4: Extend `config.ts`**

In `src/lib/games/config.ts`:

Add after the `import { z } from "zod";` line:
```ts
import { backgroundSchema } from "@/lib/games/background";
```

Replace `raceConfigSchema` and `survivalConfigSchema`:
```ts
export const raceConfigSchema = z.object({
  duration_s: z.number().int().min(10).max(60).default(20),
  background: backgroundSchema,
});
```
```ts
export const survivalConfigSchema = z.object({
  answer_s: z.number().int().min(5).max(30).default(10),
  questions: z.array(questionSchema).max(50).default([]),
  background: backgroundSchema,
});
```

Before `drawConfigSchema`, add:
```ts
/** How a lucky draw plays on the LED (D310). Keys may be added but never removed. */
export const DRAW_FORMATS = ["slot", "wheel", "mosaic", "cards"] as const;
export type DrawFormat = (typeof DRAW_FORMATS)[number];

export const DRAW_FORMAT_LABELS: Record<DrawFormat, string> = {
  slot: "Slot machine",
  wheel: "Wheel of names",
  mosaic: "Mosaic elimination",
  cards: "Card round",
};

/** A card round deals one card per prize unit, at most this many (D317). */
export const MAX_CARDS = 20;

export function prizeUnits(prizes: { quantity: number }[]): number {
  return prizes.reduce((sum, p) => sum + p.quantity, 0);
}
```

Replace `drawConfigSchema` and `drawFormSchema`:
```ts
export const drawConfigSchema = z.object({
  // Read tolerantly: a stored value that is not an id (an older build let one through) reads as
  // no checkpoint, rather than the whole game failing to parse. The admin form is strict
  // (drawFormSchema).
  checkpoint_id: z.uuid().nullable().catch(null),
  exclude_categories: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  prizes: z.array(prizeSchema).max(50).default([]),
  // Existing draws read as a slot machine; an unknown stored format does too (D310).
  format: z.enum(DRAW_FORMATS).catch("slot"),
  spin_s: z.number().int().min(3).max(20).default(6),
  rounds: z.number().int().min(2).max(8).default(4),
  background: backgroundSchema,
});

/**
 * What the draw editor may save: the checkpoint must be an id (updateGameAction checks it is
 * this event's), the format must be a real one, and a card round deals at most MAX_CARDS cards.
 * The 20-card limit lives here, not in drawConfigSchema, so a stored row over it still reads.
 */
export const drawFormSchema = drawConfigSchema
  .extend({ checkpoint_id: z.uuid().nullable(), format: z.enum(DRAW_FORMATS) })
  .refine((c) => c.format !== "cards" || prizeUnits(c.prizes) <= MAX_CARDS, { path: ["cards"], message: "Too many cards." });
```

Replace the draw branch of `gameSummary`:
```ts
  const n = g.config.prizes.length;
  const total = prizeUnits(g.config.prizes);
  return `${DRAW_FORMAT_LABELS[g.config.format]} · ${n} prize${n === 1 ? "" : "s"} · ${total} to give`;
```

- [ ] **Step 5: Read the new fields in `config-form.ts`**

In `explain()`, before the final `return`, add:
```ts
  if (field === "spin_s") return "Spin time is 3 to 20 seconds.";
  if (field === "rounds") return "Rounds are 2 to 8.";
  if (field === "format") return "Pick a format for the draw.";
  if (field === "cards") return "A card round has at most 20 cards: its prize quantities must add up to 20 or fewer.";
```

Replace the `drawFormSchema.safeParse({...})` call at the end of `configFromForm`:
```ts
  const r = drawFormSchema.safeParse({
    checkpoint_id: String(form.get("checkpoint_id") ?? "") || null,
    exclude_categories: form.getAll("exclude").map(String),
    prizes,
    format: String(form.get("format") ?? "slot"),
    spin_s: int(form.get("spin_s")),
    rounds: int(form.get("rounds")),
  });
```
Background is not read here: `updateGameAction` sets it after any upload (Task 22). The schema's `.catch` gives Theme until then.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/games-background.test.ts tests/games-config.test.ts tests/games-config-form.test.ts`
Expected: PASS. If an existing `defaultConfig`/`parseConfig` expectation in `games-config.test.ts` now fails only because the result gained `background`, `format`, `spin_s` or `rounds`, update that expectation to include `background: { kind: "theme", url: null }` (and for draws `format: "slot", spin_s: 6, rounds: 4`). If an existing draw test in `games-config-form.test.ts` posts no `spin_s`/`rounds`, add `["spin_s", "6"], ["rounds", "4"]` to its form (the editor always posts them from Task 22 on).

- [ ] **Step 7: Full check and commit**

Run: `npx tsc --noEmit && npx vitest run` — Expected: PASS.
```bash
git add src/lib/games/background.ts src/lib/games/config.ts src/lib/games/config-form.ts tests/games-background.test.ts tests/games-config.test.ts tests/games-config-form.test.ts
git commit -m "feat(games): per-game backgrounds and draw format settings"
```

---

### Task 3: Option shapes and green-safe colours

**Files:**
- Modify: `src/lib/games/views.ts`
- Test: `tests/games-views.test.ts`

**Interfaces:**
- Consumes: `backgroundOf` (Task 2).
- Produces: `OPTION_STYLES` entries gain `shape` (`"▲" | "◆" | "●" | "■"`); `GREEN_SAFE_D = "#8E4EC6"`; `type OptionStyle = { letter: string; colour: string; shape: string }`; `optionStyles(green: boolean): OptionStyle[]`; `PublicStage.game` gains `green: boolean`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/games-views.test.ts` (add `optionStyles`, `GREEN_SAFE_D` to its import from `@/lib/games/views`):
```ts
describe("optionStyles (D299, D306)", () => {
  it("gives every option a colour, a letter and a shape", () => {
    expect(optionStyles(false).map((o) => o.shape)).toEqual(["▲", "◆", "●", "■"]);
  });
  it("swaps only the green option in green mode", () => {
    const normal = optionStyles(false);
    const green = optionStyles(true);
    expect(green[3].colour).toBe(GREEN_SAFE_D);
    expect(green.slice(0, 3)).toEqual(normal.slice(0, 3));
  });
});
```
Also find the existing `publicStage` test that checks `game` (search the file for `game:`) and add one case:
```ts
it("says whether the game on stage keys out green (D299)", () => {
  const g = { ...raceGame, config: { ...raceGame.config, background: { kind: "green" as const, url: null } } };
  expect(publicStage({ ...stageOf(g), phase: "race_lobby" }, g, 0).game?.green).toBe(true);
});
```
If the file names its fixtures differently, use its existing race game fixture and stage builder in place of `raceGame` and `stageOf`.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/games-views.test.ts` — Expected: FAIL (`optionStyles` not exported).

- [ ] **Step 3: Implement**

In `src/lib/games/views.ts` replace `OPTION_STYLES`:
```ts
/**
 * Option colours and shapes, the same on the LED and the phones so "pick red" and "pick the
 * triangle" both work across the room (D306); the shape is for colour-blind players.
 */
export const OPTION_STYLES = [
  { letter: "A", colour: "#E5484D", shape: "▲" },
  { letter: "B", colour: "#3E63DD", shape: "◆" },
  { letter: "C", colour: "#F5A524", shape: "●" },
  { letter: "D", colour: "#30A46C", shape: "■" },
] as const;

/** D's colour when the LED is keyed on green (D299). */
export const GREEN_SAFE_D = "#8E4EC6";

export type OptionStyle = { letter: string; colour: string; shape: string };

/** The options as a green-screened game shows them; the phone uses the same, so colours match. */
export function optionStyles(green: boolean): OptionStyle[] {
  return OPTION_STYLES.map((o, i) => ({ letter: o.letter, colour: green && i === 3 ? GREEN_SAFE_D : o.colour, shape: o.shape }));
}
```
Add the import `import { backgroundOf } from "@/lib/games/background";`.
In `PublicStage`, change `game` to:
```ts
  game: { id: string; kind: GameKind; title: string; green: boolean } | null;
```
In `publicStage`, change the `game:` line to:
```ts
    game: g ? { id: g.id, kind: g.kind, title: g.title, green: backgroundOf(g).kind === "green" } : null,
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/games-views.test.ts && npx tsc --noEmit` — Expected: PASS. (Any other file building a `PublicStage.game` by hand now fails tsc; add `green: false` there.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/views.ts tests/games-views.test.ts
git commit -m "feat(games): option shapes and a green-safe D colour"
```

---

### Task 4: New draw phases, host actions and polling

**Files:**
- Modify: `src/lib/games/phase.ts`
- Modify: `src/lib/games/poll.ts`
- Modify: `src/components/games/HostConsole.tsx` (only the `PHASE_LABEL` record, so tsc stays green)
- Test: `tests/games-phase.test.ts`, `tests/games-poll.test.ts`

**Interfaces:**
- Produces:
  - `PHASES` gains `"draw_rounds"`, `"draw_card_pick"`, `"draw_card_reveal"`; `HostAction` gains `"round"`, `"pick"`.
  - `QUICK_SPIN_MS = 3000`. `SPIN_MS` is removed (every draw now uses its game's `spin_s`, D311).
  - `spinFacts(s)` now returns `{ prizeNo: number | null; winnerIds: string[]; newIds: string[] } | null` (null prize = a card round's turn).
  - `type DrawExtra = { spinMs: number | null; quick: boolean; cards: boolean; round: number | null; rounds: number | null; poolAt: number | null; cardNo: number | null }`; `drawExtra(s: StageRow): DrawExtra`.
  - `roundWrite(s: StageRow): StageWrite | null`.
  - `drawRevealWrite(s, prizeNo: number | null, winnerIds)` (signature widened).

- [ ] **Step 1: Write the failing tests**

Append to `tests/games-phase.test.ts` (extend its import from `@/lib/games/phase` with `allowedActions, drawExtra, resolveStage, roundWrite, spinFacts, type StageRow`; reuse its stage helper if it has one, else add this):
```ts
const drawStage = (phase: StageRow["phase"], phase_data: Record<string, unknown>, phase_ends_at: string | null = null): StageRow =>
  ({ event_id: "e", run_id: "r", game_id: "g", phase, phase_data, phase_ends_at, version: 7 });

describe("draw formats (D315, D317)", () => {
  it("a card spin lands on the card pick, not the reveal", () => {
    const s = drawStage("draw_spinning", { cards: true, prize_no: null, winner_ids: ["a"] }, new Date(1000).toISOString());
    expect(resolveStage(s, 2000).phase).toBe("draw_card_pick");
  });
  it("a normal spin still lands on the reveal", () => {
    const s = drawStage("draw_spinning", { prize_no: 0, winner_ids: ["a"] }, new Date(1000).toISOString());
    expect(resolveStage(s, 2000).phase).toBe("draw_reveal");
  });
  it("reads a card turn's facts with no prize", () => {
    expect(spinFacts(drawStage("draw_card_pick", { cards: true, prize_no: null, winner_ids: ["a"], new_ids: ["a"] })))
      .toEqual({ prizeNo: null, winnerIds: ["a"], newIds: ["a"] });
  });
  it("has no spin facts without a prize key", () => {
    expect(spinFacts(drawStage("draw_ready", {}))).toBeNull();
  });
  it("reads the draw extras", () => {
    const at = "2026-10-01T02:00:00.000Z";
    expect(drawExtra(drawStage("draw_rounds", { round: 1, rounds: 4, pool_at: at, spin_ms: 6000, quick: true, cards: false, card_no: 3 })))
      .toEqual({ spinMs: 6000, quick: true, cards: false, round: 1, rounds: 4, poolAt: Date.parse(at), cardNo: 3 });
  });
  it("Next round moves the round on, and the last round goes to the reveal", () => {
    const s = drawStage("draw_rounds", { prize_no: 0, winner_ids: ["a"], round: 2, rounds: 4 });
    expect(roundWrite(s)).toMatchObject({ phase: "draw_rounds", phase_data: { round: 3, rounds: 4, winner_ids: ["a"] } });
    expect(roundWrite({ ...s, phase_data: { ...s.phase_data, round: 3 } })).toMatchObject({ phase: "draw_reveal", phase_data: { round: 4 } });
  });
  it("has no round write outside the rounds", () => {
    expect(roundWrite(drawStage("draw_reveal", { prize_no: 0, winner_ids: ["a"] }))).toBeNull();
  });
  it("lets the host do only what each new phase allows", () => {
    expect(allowedActions("draw_rounds")).toEqual(["round", "idle"]);
    expect(allowedActions("draw_card_pick")).toEqual(["pick", "redraw", "idle"]);
    expect(allowedActions("draw_card_reveal")).toEqual(["draw", "idle"]);
  });
});
```

Append to `tests/games-poll.test.ts` (import `phoneInterval`):
```ts
it("polls phones once a second through the new draw phases", () => {
  for (const p of ["draw_rounds", "draw_card_pick", "draw_card_reveal"] as const) expect(phoneInterval(p)).toBe(1000);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/games-phase.test.ts tests/games-poll.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement in `phase.ts`**

Replace the `PHASES` array:
```ts
export const PHASES = [
  "idle",
  "race_lobby", "race_countdown", "race_live", "race_results",
  "survival_lobby", "survival_question", "survival_locked", "survival_reveal", "survival_over",
  "draw_ready", "draw_spinning", "draw_reveal",
  // Draw formats (D315, D317): the mosaic's rounds, and a card round's pick and flip.
  "draw_rounds", "draw_card_pick", "draw_card_reveal",
] as const;
```
Replace `export const SPIN_MS = 5000;` with:
```ts
/** A "Not here" redraw's quick reel (D318). A first spin lasts its game's spin_s (D311). */
export const QUICK_SPIN_MS = 3000;
```
In `resolveStage`, replace the `draw_spinning` block:
```ts
  if (cur.phase === "draw_spinning" && passed(cur.phase_ends_at, now)) {
    // A card round's reel names the participant, who then picks a card (D317).
    return { ...cur, phase: cur.phase_data.cards === true ? "draw_card_pick" : "draw_reveal", phase_ends_at: null };
  }
```
Replace the `HostAction` type:
```ts
export type HostAction =
  | "open" | "start" | "stop" | "reveal" | "next" | "finish" | "draw" | "present" | "redraw" | "idle"
  | "round" | "pick";
```
Add to `ALLOWED` after `draw_reveal`:
```ts
  draw_rounds: ["round", "idle"],
  draw_card_pick: ["pick", "redraw", "idle"],
  draw_card_reveal: ["draw", "idle"],
```
Replace `spinFacts` and `drawRevealWrite`, and add `drawExtra` and `roundWrite` after them:
```ts
/**
 * A draw on stage (D280, D281). `winnerIds` is everyone the LED reveals for the prize: after a
 * redraw, the winners kept from the earlier spin and then the replacement (draw_spin's p_keep).
 * `newIds` is only what this spin drew (all of them for a first spin, or when the stage
 * predates new_ids). `prizeNo` is null for a card round's turn until a card is picked (D317).
 */
export function spinFacts(s: StageRow): { prizeNo: number | null; winnerIds: string[]; newIds: string[] } | null {
  const winnerIds = ids(s.phase_data.winner_ids);
  if (!winnerIds || !("prize_no" in s.phase_data)) return null;
  return { prizeNo: num(s.phase_data.prize_no), winnerIds, newIds: ids(s.phase_data.new_ids) ?? winnerIds };
}

/**
 * "Not here" with no one left to draw (D281): back to the reveal of the prize's other winners,
 * so each of them can still be sent away in turn.
 */
export function drawRevealWrite(s: StageRow, prizeNo: number | null, winnerIds: string[]): StageWrite {
  return { ...keep(s), phase: "draw_reveal", phase_data: { prize_no: prizeNo, winner_ids: winnerIds, new_ids: [] }, phase_ends_at: null };
}

/** What draw_spin and card_pick add to a draw's phase_data (D311, D315, D316, D317). */
export type DrawExtra = {
  spinMs: number | null;
  quick: boolean;
  cards: boolean;
  round: number | null;
  rounds: number | null;
  poolAt: number | null;
  cardNo: number | null;
};

export function drawExtra(s: StageRow): DrawExtra {
  const at = str(s.phase_data.pool_at);
  return {
    spinMs: num(s.phase_data.spin_ms),
    quick: s.phase_data.quick === true,
    cards: s.phase_data.cards === true,
    round: num(s.phase_data.round),
    rounds: num(s.phase_data.rounds),
    poolAt: at ? Date.parse(at) : null,
    cardNo: num(s.phase_data.card_no),
  };
}

/** Next round of a mosaic draw (D315); after the last round the winners are revealed. */
export function roundWrite(s: StageRow): StageWrite | null {
  const { round, rounds } = drawExtra(s);
  if (s.phase !== "draw_rounds" || round === null || rounds === null) return null;
  const next = round + 1;
  return { ...keep(s), phase: next >= rounds ? "draw_reveal" : "draw_rounds", phase_data: { ...s.phase_data, round: next }, phase_ends_at: null };
}
```

- [ ] **Step 4: Polling and the console's labels**

In `src/lib/games/poll.ts`, add `"draw_rounds", "draw_card_pick", "draw_card_reveal",` to `ACTIVE` after `"draw_ready", "draw_spinning", "draw_reveal",`.

In `src/components/games/HostConsole.tsx`, add to `PHASE_LABEL` after `draw_reveal`:
```ts
  draw_rounds: "Elimination rounds",
  draw_card_pick: "Pick a card",
  draw_card_reveal: "Card revealed",
```

- [ ] **Step 5: Fix the callers `tsc` now flags**

Run: `npx tsc --noEmit`. Expected errors, each fixed as shown:
- `src/app/host/[token]/actions.ts` imports `SPIN_MS`: replace `SPIN_MS` in the import with `QUICK_SPIN_MS`, and in both `spinEndsAt:` lines use `QUICK_SPIN_MS` for now (Task 11 rewrites these actions properly).
- `src/components/games/display/DrawScreen.tsx` imports `SPIN_MS`: replace the import with `QUICK_SPIN_MS` and the use in `useRoller` with `QUICK_SPIN_MS` (Task 16 rewrites this file).
- `src/lib/games/phone-state.ts`: `game.config.prizes[spun.prizeNo]` — change to `spun.prizeNo === null ? "a prize" : game.config.prizes[spun.prizeNo]?.name ?? "a prize"`.
- `src/lib/games/display-state.ts` `poolFor(event, game, prizeNo)` and `absentFor(..., prizeNo)` accept `number | null` already at the call; if tsc flags `absentFor`, widen its parameter in `src/lib/games/draw.ts` to `prizeNo: number | null` (the body compares with `===`, which is right for null too).

- [ ] **Step 6: Run everything and commit**

Run: `npx vitest run && npx tsc --noEmit` — Expected: PASS.
```bash
git add src/lib/games/phase.ts src/lib/games/poll.ts src/lib/games/draw.ts src/lib/games/phone-state.ts src/lib/games/display-state.ts src/components/games/HostConsole.tsx src/components/games/display/DrawScreen.tsx "src/app/host/[token]/actions.ts" tests/games-phase.test.ts tests/games-poll.test.ts
git commit -m "feat(games): mosaic rounds and card-round phases"
```

---

### Task 5: Mosaic elimination rounds

**Files:**
- Modify: `src/lib/games/mosaic.ts`
- Test: `tests/games-mosaic.test.ts`

**Interfaces:**
- Produces: `survivorCounts(n: number, w: number, rounds: number): number[]` (length `rounds + 1`, index = round); `mosaicSurvivors(poolIds: string[], winnerIds: string[], round: number, rounds: number, seed: string): string[]` (survivors in pool order).

- [ ] **Step 1: Write the failing tests**

Append to `tests/games-mosaic.test.ts` (add `mosaicSurvivors, survivorCounts` to its import):
```ts
describe("mosaic elimination rounds (D315)", () => {
  const pool = Array.from({ length: 300 }, (_, i) => `p${String(i).padStart(3, "0")}`);
  const winners = ["p007", "p250"];

  it("shrinks geometrically from the pool to the winners", () => {
    const c = survivorCounts(300, 2, 4);
    expect(c[0]).toBe(300);
    expect(c[4]).toBe(2);
    for (let r = 1; r <= 4; r++) expect(c[r]).toBeLessThan(c[r - 1]);
    expect(c[2]).toBe(Math.round(300 * Math.pow(2 / 300, 2 / 4)));
  });
  it("still shrinks by at least one each round when the numbers are small", () => {
    expect(survivorCounts(5, 1, 4)).toEqual([5, 4, 3, 2, 1]);
  });
  it("never drops below the winners, even with more rounds than people", () => {
    const c = survivorCounts(3, 1, 8);
    expect(Math.min(...c)).toBe(1);
    expect(c[8]).toBe(1);
  });
  it("round 0 is everyone and the last round is exactly the winners", () => {
    expect(mosaicSurvivors(pool, winners, 0, 4, "s")).toEqual(pool);
    expect(mosaicSurvivors(pool, winners, 4, 4, "s")).toEqual(winners);
  });
  it("always keeps the winners and keeps pool order", () => {
    for (let r = 0; r <= 4; r++) {
      const s = mosaicSurvivors(pool, winners, r, 4, "s");
      expect(s).toEqual(expect.arrayContaining(winners));
      expect(s).toEqual(pool.filter((id) => s.includes(id)));
      expect(s.length).toBe(survivorCounts(300, 2, 4)[r]);
    }
  });
  it("each round's survivors are inside the last round's", () => {
    for (let r = 1; r <= 4; r++) {
      const before = new Set(mosaicSurvivors(pool, winners, r - 1, 4, "s"));
      expect(mosaicSurvivors(pool, winners, r, 4, "s").every((id) => before.has(id))).toBe(true);
    }
  });
  it("is the same for the same seed and different for another", () => {
    expect(mosaicSurvivors(pool, winners, 2, 4, "s")).toEqual(mosaicSurvivors(pool, winners, 2, 4, "s"));
    expect(mosaicSurvivors(pool, winners, 2, 4, "s")).not.toEqual(mosaicSurvivors(pool, winners, 2, 4, "t"));
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/games-mosaic.test.ts` — Expected: FAIL (not exported).

- [ ] **Step 3: Implement**

Append to `src/lib/games/mosaic.ts`:
```ts
/**
 * How many tiles stand after each round of a mosaic draw (D315): from `n` down to the `w`
 * winners, shrinking geometrically (round(n × (w/n)^(round/rounds))). While there are
 * non-winners left every round takes at least one, and a round never takes so many that a
 * later round would have nobody to take. Never below `w`. Index 0 is before the first round.
 */
export function survivorCounts(n: number, w: number, rounds: number): number[] {
  const total = Math.max(0, Math.floor(n));
  const floor = Math.min(total, Math.max(0, Math.floor(w)));
  const out = [total];
  for (let r = 1; r <= rounds; r++) {
    const prev = out[r - 1];
    const target = r >= rounds ? floor : Math.round(total * Math.pow(Math.max(floor, 1) / Math.max(total, 1), r / rounds));
    const upper = prev > floor ? prev - 1 : prev;
    const lower = Math.min(upper, floor + (rounds - r));
    out.push(Math.max(floor, lower, Math.min(upper, target)));
  }
  return out;
}

/**
 * Who stands after `round` of `rounds` (D315). Non-winners fall in a seeded order, the same
 * every time for the same seed, so a reloaded LED shows the same round; each round's survivors
 * are inside the round before's. Returned in pool order. Only the server calls this: the LED
 * gets the result, never the winners (D312).
 */
export function mosaicSurvivors(poolIds: string[], winnerIds: string[], round: number, rounds: number, seed: string): string[] {
  const inPool = new Set(poolIds);
  const winners = new Set(winnerIds.filter((id) => inPool.has(id)));
  const others = seededOrder(poolIds.filter((id) => !winners.has(id)), seed);
  const counts = survivorCounts(poolIds.length, winners.size, rounds);
  const standing = counts[Math.min(Math.max(0, round), rounds)] - winners.size;
  const kept = new Set([...winners, ...others.slice(others.length - Math.max(0, standing))]);
  return poolIds.filter((id) => kept.has(id));
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/games-mosaic.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/mosaic.ts tests/games-mosaic.test.ts
git commit -m "feat(games): mosaic draw survivors per round"
```

---

### Task 6: The card deck

**Files:**
- Create: `src/lib/games/cards.ts`
- Modify: `src/lib/games/draw.ts` (`WinnerRow` gains optional `run_id` and `card_no`; `prize_no` becomes `number | null`)
- Test: `tests/games-cards.test.ts` (new)

**Interfaces:**
- Consumes: `PrizeProgress` from `draw.ts`; `Prize` from `config.ts`.
- Produces:
  - `WinnerRow` = `{ id; event_id; game_id; prize_no: number | null; attendee_id; drawn_at; void; run_id?: string | null; card_no?: number | null }`
  - `dealDeck(progress: PrizeProgress[], rand: () => number): number[]` — prize numbers, card 1 first
  - `secureRandom(): number` — in [0, 1) from `crypto.getRandomValues`
  - `type CardView = { no: number; taken: boolean; prize: string | null; winner: string | null }`
  - `cardsView(deck: number[], winners: WinnerRow[], runId: string, prizes: Prize[], nameOf: (id: string) => string): CardView[]`
  - `cardsLeft(deck: number[], winners: WinnerRow[], runId: string): number`

- [ ] **Step 1: Write the failing tests**

`tests/games-cards.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { cardsLeft, cardsView, dealDeck, secureRandom } from "@/lib/games/cards";
import type { PrizeProgress, WinnerRow } from "@/lib/games/draw";

const progress = (quantities: number[], given: number[] = []): PrizeProgress[] =>
  quantities.map((quantity, prize_no) => ({ prize_no, name: `P${prize_no}`, quantity, given: given[prize_no] ?? 0, remaining: quantity - (given[prize_no] ?? 0) }));

const win = (attendee_id: string, card_no: number | null, prize_no: number | null, run_id = "r1", isVoid = false): WinnerRow =>
  ({ id: `w-${attendee_id}`, event_id: "e", game_id: "g", prize_no, attendee_id, drawn_at: "2026-10-01T02:00:00Z", void: isVoid, run_id, card_no });

describe("dealDeck (D317)", () => {
  it("deals one card per remaining prize unit", () => {
    const deck = dealDeck(progress([1, 2, 7]), () => 0.5);
    expect(deck).toHaveLength(10);
    expect(deck.filter((p) => p === 0)).toHaveLength(1);
    expect(deck.filter((p) => p === 1)).toHaveLength(2);
    expect(deck.filter((p) => p === 2)).toHaveLength(7);
  });
  it("leaves out units already given", () => {
    expect(dealDeck(progress([2, 1], [1, 1]), () => 0.5)).toEqual([0]);
  });
  it("shuffles with the random source it is given", () => {
    const a = dealDeck(progress([1, 1, 1, 1]), () => 0);
    const b = dealDeck(progress([1, 1, 1, 1]), () => 0.99);
    expect(a).not.toEqual(b);
  });
  it("secureRandom stays in [0, 1)", () => {
    for (let i = 0; i < 100; i++) {
      const x = secureRandom();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("cardsView (D317)", () => {
  const prizes = [{ name: "Mug", quantity: 2 }, { name: "Pen", quantity: 1 }];
  const deck = [0, 1, 0];
  const nameOf = (id: string) => ({ a: "Ann Lee", b: "Ben Tan" })[id] ?? "";

  it("numbers cards from 1 and keeps every untaken prize secret", () => {
    expect(cardsView(deck, [], "r1", prizes, nameOf)).toEqual([
      { no: 1, taken: false, prize: null, winner: null },
      { no: 2, taken: false, prize: null, winner: null },
      { no: 3, taken: false, prize: null, winner: null },
    ]);
  });
  it("shows a taken card's prize and winner", () => {
    const v = cardsView(deck, [win("a", 2, 1)], "r1", prizes, nameOf);
    expect(v[1]).toEqual({ no: 2, taken: true, prize: "Pen", winner: "Ann Lee" });
    expect(v[0].prize).toBeNull();
  });
  it("ignores void winners, other runs and people still to pick", () => {
    const rows = [win("a", 1, 0, "r1", true), win("b", 3, 0, "r0"), win("c", null, null)];
    expect(cardsView(deck, rows, "r1", prizes, nameOf).every((c) => !c.taken)).toBe(true);
    expect(cardsLeft(deck, rows, "r1")).toBe(3);
  });
  it("counts the cards left", () => {
    expect(cardsLeft(deck, [win("a", 2, 1), win("b", 1, 0)], "r1")).toBe(1);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/games-cards.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Widen `WinnerRow`**

In `src/lib/games/draw.ts` replace the `WinnerRow` type:
```ts
export type WinnerRow = {
  id: string;
  event_id: string;
  game_id: string;
  /** Null while a card round's participant has not picked a card yet (D317). */
  prize_no: number | null;
  attendee_id: string;
  drawn_at: string;
  void: boolean;
  /** The run that drew them (0050); null on rows drawn before it. */
  run_id?: string | null;
  /** The card picked in a card round, numbered from 1 (D317). */
  card_no?: number | null;
};
```
Also change `absentFor`'s parameter to `prizeNo: number | null` if Task 4 did not already.

- [ ] **Step 4: Write `cards.ts`**

`src/lib/games/cards.ts`:
```ts
import type { Prize } from "@/lib/games/config";
import type { PrizeProgress, WinnerRow } from "@/lib/games/draw";

/** A uniform number in [0, 1) from the platform's cryptographic source. */
export function secureRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}

/**
 * A card round's deck (D317): one card per prize unit still to give, shuffled (Fisher–Yates with
 * `rand`). Each entry is a prize number; card 1 is the first entry. The server deals with
 * secureRandom and stores the result on the run, where only a flipped card is ever read.
 */
export function dealDeck(progress: PrizeProgress[], rand: () => number): number[] {
  const deck = progress.flatMap((p) => Array.from({ length: Math.max(0, p.remaining) }, () => p.prize_no));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rand() * (i + 1)));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export type CardView = { no: number; taken: boolean; prize: string | null; winner: string | null };

/** Cards taken in this run: standing winners with a card, by card number. */
function takenCards(winners: WinnerRow[], runId: string): Map<number, WinnerRow> {
  const taken = new Map<number, WinnerRow>();
  for (const w of winners) if (!w.void && w.run_id === runId && typeof w.card_no === "number") taken.set(w.card_no, w);
  return taken;
}

/**
 * The cards as the LED and the host see them (D317). A card's prize is only here once it has
 * been taken: the deck itself never leaves the server, so nobody can read the grid off the wire.
 */
export function cardsView(deck: number[], winners: WinnerRow[], runId: string, prizes: Prize[], nameOf: (id: string) => string): CardView[] {
  const taken = takenCards(winners, runId);
  return deck.map((_, i) => {
    const no = i + 1;
    const w = taken.get(no);
    if (!w) return { no, taken: false, prize: null, winner: null };
    return { no, taken: true, prize: w.prize_no === null ? null : prizes[w.prize_no]?.name ?? null, winner: nameOf(w.attendee_id) };
  });
}

export function cardsLeft(deck: number[], winners: WinnerRow[], runId: string): number {
  return Math.max(0, deck.length - takenCards(winners, runId).size);
}
```

- [ ] **Step 5: Run everything**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS. If tsc flags a `prizes[w.prize_no]` lookup elsewhere (the game editor page, `src/lib/exports.ts`), leave a `w.prize_no === null ? "No card picked" : …` guard there; Task 22 finishes those screens.

- [ ] **Step 6: Commit**

```bash
git add src/lib/games/cards.ts src/lib/games/draw.ts tests/games-cards.test.ts src/lib/exports.ts "src/app/admin/events/[id]/games/[gameId]/page.tsx"
git commit -m "feat(games): card round deck and card views"
```
(Add only the files you changed.)

---

### Task 7: Wheel geometry and LED layouts

**Files:**
- Create: `src/lib/games/wheel.ts`, `src/lib/games/layout.ts`
- Test: `tests/games-wheel.test.ts`, `tests/games-layout.test.ts` (new)

**Interfaces:**
- Produces:
  - `WHEEL_NAMED_MAX = 60`, `TICK_MIN_MS = 1000 / 30`, `sliceAt(angle: number, n: number): number`, `landingAngle(target: number, n: number, turns: number, within?: number): number`, `easeOutQuart(t: number): number`, `canTick(lastAt: number, now: number): boolean`
  - `type Box = { x: number; y: number; w: number; h: number }` (centre x/y in LED pixels from the top-left), `cardGrid(n): { cols: number; rows: number }`, `cardLayout(n: number): Box[]` (index = card number − 1), `reelLayout(n: number): Box[]`, `MAX_REELS = 10`, `toWorld(x: number, y: number): [number, number]`

- [ ] **Step 1: Write the failing tests**

`tests/games-wheel.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { canTick, easeOutQuart, landingAngle, sliceAt, TICK_MIN_MS } from "@/lib/games/wheel";

const TAU = Math.PI * 2;

describe("wheel geometry (D314)", () => {
  it("slice 0 is under the pointer at rest", () => {
    expect(sliceAt(0.01, 12)).toBe(11);
    expect(sliceAt(-0.01, 12)).toBe(0);
    expect(sliceAt(TAU - TAU / 24, 12)).toBe(0);
  });
  it("lands on the target slice after whole turns", () => {
    for (const n of [2, 7, 60, 437]) {
      for (const t of [0, 1, Math.floor(n / 2), n - 1]) {
        const a = landingAngle(t, n, 5);
        expect(sliceAt(a, n)).toBe(t);
        expect(a).toBeGreaterThanOrEqual(5 * TAU);
      }
    }
  });
  it("stays inside the slice for any offset within it", () => {
    expect(sliceAt(landingAngle(3, 10, 4, 0.1), 10)).toBe(3);
    expect(sliceAt(landingAngle(3, 10, 4, 0.9), 10)).toBe(3);
  });
  it("eases from 0 to 1", () => {
    expect(easeOutQuart(0)).toBe(0);
    expect(easeOutQuart(1)).toBe(1);
    expect(easeOutQuart(0.5)).toBeGreaterThan(0.9);
  });
  it("caps slice ticks at 30 a second", () => {
    expect(canTick(0, TICK_MIN_MS - 1)).toBe(false);
    expect(canTick(0, TICK_MIN_MS)).toBe(true);
  });
});
```

`tests/games-layout.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { cardGrid, cardLayout, reelLayout, toWorld } from "@/lib/games/layout";

describe("cardGrid (D317)", () => {
  it("is 5×2 for 10 and 3×2 for 6", () => {
    expect(cardGrid(10)).toEqual({ cols: 5, rows: 2 });
    expect(cardGrid(6)).toEqual({ cols: 3, rows: 2 });
  });
  it("is one row up to 5, then 2, 3 and 4 rows", () => {
    expect(cardGrid(1)).toEqual({ cols: 1, rows: 1 });
    expect(cardGrid(5)).toEqual({ cols: 5, rows: 1 });
    expect(cardGrid(15)).toEqual({ cols: 5, rows: 3 });
    expect(cardGrid(20)).toEqual({ cols: 5, rows: 4 });
    expect(cardGrid(11)).toEqual({ cols: 4, rows: 3 });
  });
});

describe("cardLayout", () => {
  it("places every card on the canvas without overlap", () => {
    for (const n of [1, 3, 6, 10, 14, 20]) {
      const boxes = cardLayout(n);
      expect(boxes).toHaveLength(n);
      for (const b of boxes) {
        expect(b.x - b.w / 2).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w / 2).toBeLessThanOrEqual(1920);
        expect(b.y - b.h / 2).toBeGreaterThanOrEqual(200);
        expect(b.y + b.h / 2).toBeLessThanOrEqual(1080);
      }
      for (let i = 1; i < boxes.length; i++) {
        const [a, b] = [boxes[i - 1], boxes[i]];
        const apart = Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2;
        expect(apart).toBe(true);
      }
    }
  });
});

describe("reelLayout (D313)", () => {
  it("is one wide reel for one winner", () => {
    expect(reelLayout(1)).toHaveLength(1);
    expect(reelLayout(1)[0].w).toBeGreaterThan(1000);
  });
  it("is one row up to 5 and two rows up to 10", () => {
    expect(new Set(reelLayout(5).map((b) => b.y)).size).toBe(1);
    expect(new Set(reelLayout(10).map((b) => b.y)).size).toBe(2);
  });
  it("has no reels past 10", () => {
    expect(reelLayout(11)).toEqual([]);
  });
});

describe("toWorld", () => {
  it("puts the canvas centre at the origin with y up", () => {
    expect(toWorld(960, 540)).toEqual([0, 0]);
    expect(toWorld(0, 0)).toEqual([-960, 540]);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/games-wheel.test.ts tests/games-layout.test.ts` — Expected: FAIL.

- [ ] **Step 3: Write `wheel.ts`**

`src/lib/games/wheel.ts`:
```ts
/**
 * The wheel of names (D314). Slice i spans [i, i+1) × 2π/n clockwise from the pointer at the
 * top when the wheel is at rest. `angle` is how far the wheel has turned clockwise, in radians.
 */
const TAU = Math.PI * 2;

/** Above this many slices, names are not drawn on the wheel; only the winner's is shown. */
export const WHEEL_NAMED_MAX = 60;

/** At most 30 slice ticks a second, however fast the wheel turns. */
export const TICK_MIN_MS = 1000 / 30;

const mod = (a: number, m: number) => ((a % m) + m) % m;

/** Which slice is under the pointer after turning `angle` clockwise. */
export function sliceAt(angle: number, n: number): number {
  const step = TAU / n;
  return Math.min(n - 1, Math.floor(mod(-angle, TAU) / step));
}

/**
 * The total clockwise turn that stops with `target` under the pointer, after `turns` whole
 * turns; `within` (0–1) is where in the slice the pointer ends up.
 */
export function landingAngle(target: number, n: number, turns: number, within = 0.5): number {
  const step = TAU / n;
  return turns * TAU + mod(TAU - (target + within) * step, TAU);
}

export function easeOutQuart(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 4);
}

export function canTick(lastAt: number, now: number): boolean {
  return now - lastAt >= TICK_MIN_MS;
}
```

- [ ] **Step 4: Write `layout.ts`**

`src/lib/games/layout.ts`:
```ts
/** Layouts on the LED's 1920×1080 canvas (D284). x/y are a box's centre, from the top-left. */
export type Box = { x: number; y: number; w: number; h: number };

const W = 1920;
const H = 1080;

/** LED pixels to 3D world units: the canvas centre is the origin and y points up (D293). */
export function toWorld(x: number, y: number): [number, number] {
  return [x - W / 2, H / 2 - y];
}

/** A card round's grid (D317): 1 row up to 5 cards, then 2, 3 and 4 rows. */
export function cardGrid(n: number): { cols: number; rows: number } {
  const count = Math.max(1, Math.floor(n));
  const rows = count <= 5 ? 1 : count <= 10 ? 2 : count <= 15 ? 3 : 4;
  return { cols: Math.ceil(count / rows), rows };
}

const CARD_TOP = 220;
const CARD_AREA_W = 1720;
const CARD_AREA_H = 800;
const CARD_GAP = 28;
const CARD_RATIO = 1.4;

/** Where each card sits, by card number − 1. Cards keep their place as others are taken. */
export function cardLayout(n: number): Box[] {
  const { cols, rows } = cardGrid(n);
  let w = Math.min(260, (CARD_AREA_W - (cols - 1) * CARD_GAP) / cols);
  let h = w * CARD_RATIO;
  const maxH = (CARD_AREA_H - (rows - 1) * CARD_GAP) / rows;
  if (h > maxH) { h = maxH; w = h / CARD_RATIO; }
  const gridW = cols * w + (cols - 1) * CARD_GAP;
  const gridH = rows * h + (rows - 1) * CARD_GAP;
  const left = (W - gridW) / 2;
  const top = CARD_TOP + (CARD_AREA_H - gridH) / 2;
  return Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    return { x: left + c * (w + CARD_GAP) + w / 2, y: top + r * (h + CARD_GAP) + h / 2, w, h };
  });
}

/** Up to this many winners get a reel each; more cascade in as a grid of names (D313). */
export const MAX_REELS = 10;

/** One wide reel, a row of up to 5, or two rows of up to 5. */
export function reelLayout(n: number): Box[] {
  if (n < 1 || n > MAX_REELS) return [];
  if (n === 1) return [{ x: W / 2, y: 580, w: 1400, h: 300 }];
  const rows = n <= 5 ? 1 : 2;
  const cols = Math.ceil(n / rows);
  const gap = 32;
  const w = Math.min(340, (1800 - (cols - 1) * gap) / cols);
  const h = rows === 1 ? 240 : 190;
  const gridW = cols * w + (cols - 1) * gap;
  const top = rows === 1 ? 580 : 440;
  return Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    return { x: (W - gridW) / 2 + c * (w + gap) + w / 2, y: top + r * (h + 60), w, h };
  });
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/games-wheel.test.ts tests/games-layout.test.ts` — Expected: PASS. If the `cardGrid(11)` case fails, the implementation is right and the expectation must equal `{ cols: 4, rows: 3 }` (11 cards → 3 rows → 4 columns); keep the implementation.

- [ ] **Step 6: Commit**

```bash
git add src/lib/games/wheel.ts src/lib/games/layout.ts tests/games-wheel.test.ts tests/games-layout.test.ts
git commit -m "feat(games): wheel geometry and LED layouts"
```

---
### Task 8: Migration 0050 and the database check

**Files:**
- Create: `supabase/migrations/0050_draw_formats.sql`
- Modify: `scripts/games-db-check.mjs`

**Interfaces:**
- Produces (SQL): `game_runs.deck int[]`; `draw_winners.run_id`, `draw_winners.card_no`, nullable `draw_winners.prize_no`; `draw_spin(p_event_id uuid, p_expected int, p_run_id uuid, p_game_id uuid, p_prize_no int, p_count int, p_checkpoint_id uuid, p_exclude text[], p_spin_ends_at timestamptz, p_keep uuid[] default '{}', p_phase text default 'draw_spinning', p_extra jsonb default '{}') returns uuid[]`; `card_pick(p_event_id uuid, p_expected int, p_run_id uuid, p_game_id uuid, p_attendee_id uuid, p_card_no int) returns int` (the prize number, or null when refused).

- [ ] **Step 1: Write the migration**

`supabase/migrations/0050_draw_formats.sql`:
```sql
-- Live games visuals (spec 2026-09-27-live-games-visuals-design.md, D290–D322): the lucky
-- draw's four formats. Additive, and draw_spin keeps its old call working through defaults, so
-- this is applied BEFORE the code that uses it is deployed (D320).

-- A card round's shuffled deck (D317): prize numbers, card 1 first. Null for every other run.
alter table game_runs add column deck int[];

-- Which run drew a winner, and which card they picked. Older rows keep run_id null.
alter table draw_winners add column run_id uuid references game_runs(id) on delete cascade;
alter table draw_winners add column card_no int;
-- A card round draws the person before the prize is known (D317).
alter table draw_winners alter column prize_no drop not null;
-- A card is taken once per run.
create unique index draw_winners_card_idx on draw_winners (run_id, card_no) where card_no is not null and not void;
create index draw_winners_run_idx on draw_winners (run_id);

drop function draw_spin(uuid, int, uuid, uuid, int, int, uuid, text[], timestamptz, uuid[]);

-- As 0049's, plus: no prize for a card round's turn (only when the game's format is 'cards');
-- the run recorded on each winner; voided winners matched with IS NOT DISTINCT FROM, so a
-- person sent away before picking a card is not drawn again in that card round; p_phase
-- 'draw_rounds' for the mosaic, which has no end time (D315); p_extra merged into phase_data;
-- and pool_at stamped from the database clock (D316).
create function draw_spin(
  p_event_id uuid, p_expected int, p_run_id uuid, p_game_id uuid, p_prize_no int, p_count int,
  p_checkpoint_id uuid, p_exclude text[], p_spin_ends_at timestamptz, p_keep uuid[] default '{}',
  p_phase text default 'draw_spinning', p_extra jsonb default '{}'
) returns uuid[]
language plpgsql
as $$
declare
  v int;
  picked uuid[];
  kept uuid[];
begin
  if p_phase is null or p_phase not in ('draw_spinning', 'draw_rounds') then
    return null;
  end if;
  if not exists (
    select 1 from game_runs r join games g on g.id = r.game_id
     where r.id = p_run_id and r.event_id = p_event_id
       and g.id = p_game_id and g.event_id = p_event_id and g.kind = 'draw'
       and (p_prize_no is not null or g.config->>'format' = 'cards')) then
    return null;
  end if;
  update game_stage set version = version + 1, updated_at = now()
   where event_id = p_event_id and version = p_expected
  returning version into v;
  if v is null then return null; end if;

  select coalesce(array_agg(s.id), '{}'::uuid[]) into picked from (
    select a.id from attendees a
     where a.event_id = p_event_id
       and exists (select 1 from checkins c where c.attendee_id = a.id and c.checkpoint_id = p_checkpoint_id)
       -- category_matches treats an empty list as "everyone", so an empty exclude list is guarded.
       and not (coalesce(array_length(p_exclude, 1), 0) > 0 and category_matches(p_exclude, a.category))
       and not exists (
         select 1 from draw_winners w
          where w.event_id = p_event_id and w.attendee_id = a.id and not w.void)
       and not exists (
         select 1 from draw_winners w
          where w.game_id = p_game_id and w.prize_no is not distinct from p_prize_no
            and w.attendee_id = a.id and w.void)
     order by gen_random_uuid()
     limit greatest(p_count, 0)
  ) s;

  insert into draw_winners (event_id, game_id, run_id, prize_no, attendee_id)
  select p_event_id, p_game_id, p_run_id, p_prize_no, unnest(picked);

  select coalesce(array_agg(k.id order by k.n), '{}'::uuid[]) into kept
    from unnest(coalesce(p_keep, '{}'::uuid[])) with ordinality k(id, n)
   where exists (
     select 1 from draw_winners w
      where w.game_id = p_game_id and w.prize_no is not distinct from p_prize_no
        and w.attendee_id = k.id and not w.void)
     and not k.id = any(picked);

  update game_stage
     set run_id = p_run_id, game_id = p_game_id, phase = p_phase,
         phase_ends_at = case when p_phase = 'draw_spinning' then p_spin_ends_at end,
         phase_data = coalesce(p_extra, '{}'::jsonb)
                      || jsonb_build_object('prize_no', p_prize_no, 'winner_ids', to_jsonb(kept || picked),
                                            'new_ids', to_jsonb(picked), 'pool_at', now())
   where event_id = p_event_id;
  return picked;
end;
$$;

-- A card round's pick (D317, D320): the participant on stage takes card p_card_no of this run's
-- deck. Only once their reel has stopped (2 s allowed for the app's and the database's clocks
-- disagreeing), only a card inside the deck and not yet taken, only for the stage's current,
-- card-less winner. Moves the stage to the flip. Null when refused; the version does not move.
create function card_pick(
  p_event_id uuid, p_expected int, p_run_id uuid, p_game_id uuid, p_attendee_id uuid, p_card_no int
) returns int
language plpgsql
as $$
declare
  s game_stage%rowtype;
  d int[];
  prize int;
begin
  select r.deck into d from game_runs r join games g on g.id = r.game_id
   where r.id = p_run_id and r.event_id = p_event_id
     and g.id = p_game_id and g.event_id = p_event_id
     and g.kind = 'draw' and g.config->>'format' = 'cards';
  if d is null or p_card_no is null or p_card_no < 1 or p_card_no > coalesce(array_length(d, 1), 0) then
    return null;
  end if;
  -- Locks the stage row: two consoles tapping a card at once take turns, and the second sees
  -- the version moved.
  select * into s from game_stage where event_id = p_event_id for update;
  if not found
     or s.version <> p_expected
     or s.run_id is distinct from p_run_id or s.game_id is distinct from p_game_id
     or s.phase <> 'draw_spinning' or coalesce(s.phase_data->>'cards', 'false') <> 'true'
     or s.phase_ends_at is null or now() + interval '2 seconds' < s.phase_ends_at
     or not (coalesce(s.phase_data->'winner_ids', '[]'::jsonb) ? p_attendee_id::text) then
    return null;
  end if;
  if exists (select 1 from draw_winners where run_id = p_run_id and card_no = p_card_no and not void) then
    return null;
  end if;
  update draw_winners set card_no = p_card_no, prize_no = d[p_card_no]
   where game_id = p_game_id and run_id = p_run_id and attendee_id = p_attendee_id
     and not void and card_no is null and prize_no is null
  returning prize_no into prize;
  if prize is null then return null; end if;
  update game_stage
     set phase = 'draw_card_reveal', phase_ends_at = null, version = version + 1, updated_at = now(),
         phase_data = jsonb_build_object('cards', true, 'prize_no', prize, 'card_no', p_card_no,
                                         'winner_ids', jsonb_build_array(p_attendee_id), 'new_ids', '[]'::jsonb)
   where event_id = p_event_id;
  return prize;
end;
$$;

revoke execute on function draw_spin(uuid, int, uuid, uuid, int, int, uuid, text[], timestamptz, uuid[], text, jsonb) from public, anon, authenticated;
grant execute on function draw_spin(uuid, int, uuid, uuid, int, int, uuid, text[], timestamptz, uuid[], text, jsonb) to service_role;
revoke execute on function card_pick(uuid, int, uuid, uuid, uuid, int) from public, anon, authenticated;
grant execute on function card_pick(uuid, int, uuid, uuid, uuid, int) to service_role;

-- Background videos (D300): up to 30 MB, uploaded straight from the browser with a signed URL.
-- Images keep their 4 MB gate in the app (src/lib/storage.ts acceptImage).
update storage.buckets
   set file_size_limit = 31457280,
       allowed_mime_types = array['image/png','image/jpeg','image/jpg','image/webp','image/svg+xml','video/mp4','video/webm']
 where id = 'event-media';
```

- [ ] **Step 2: Add the checks to `scripts/games-db-check.mjs`**

In the header comment's "WHAT THIS PROVES" list, add after item 6:
```js
//   7. Draw formats (0050): draw_spin refuses no prize outside a card round; a card round's turn
//      records the person, the run and no prize; card_pick refuses a spinning reel, a stale
//      version, someone other than the participant, a card outside the deck, a taken card and a
//      run of another game, and gives the deck's prize; someone sent away before picking is not
//      drawn again in that card round; draw_spin can open the mosaic's rounds (no end time,
//      round 0, pool_at) and refuses any other phase; the media bucket takes 30 MB videos.
```
Then insert this block immediately before the line `  // 6. Ownership`:
```js
  // 7. Draw formats (0050)
  must(await db.from("draw_winners").delete().eq("game_id", draw.id));
  const stageVersion = async () => must(await db.from("game_stage").select("version").eq("event_id", event.id).single()).version;
  let cv = await stageVersion();
  const noPrize = must(await db.rpc("draw_spin", { p_event_id: event.id, p_expected: cv, p_run_id: drawRun.id, p_game_id: draw.id, p_prize_no: null, p_count: 1, p_checkpoint_id: cp.id, p_exclude: [], p_spin_ends_at: new Date().toISOString() }));
  check("a draw with no prize is refused outside a card round", noPrize === null && (await stageVersion()) === cv);

  const cards = must(await db.from("games").insert({
    org_id: event.org_id, event_id: event.id, kind: "draw", title: "Cards",
    config: { format: "cards", checkpoint_id: cp.id, exclude_categories: [], prizes: [{ name: "Mug", quantity: 2 }, { name: "Pen", quantity: 1 }] },
  }).select("id").single());
  const cardRun = must(await db.from("game_runs").insert({ event_id: event.id, game_id: cards.id, deck: [0, 1, 0] }).select("id").single());
  const cardSpin = async (endsAt) => {
    const ids = must(await db.rpc("draw_spin", { p_event_id: event.id, p_expected: cv, p_run_id: cardRun.id, p_game_id: cards.id, p_prize_no: null, p_count: 1, p_checkpoint_id: cp.id, p_exclude: [" crew "], p_spin_ends_at: new Date(endsAt).toISOString(), p_extra: { cards: true, spin_ms: 50 } }));
    if (ids !== null) cv += 1;
    return ids ?? [];
  };
  const pick = (attendeeId, cardNo, expected = cv, runId = cardRun.id, gameId = cards.id) => db.rpc("card_pick", { p_event_id: event.id, p_expected: expected, p_run_id: runId, p_game_id: gameId, p_attendee_id: attendeeId, p_card_no: cardNo });
  const stopReel = () => db.from("game_stage").update({ phase_ends_at: new Date(Date.now() - 1000).toISOString() }).eq("event_id", event.id);

  const [first] = await cardSpin(Date.now() + 60_000);
  const firstRow = first ? must(await db.from("draw_winners").select("prize_no, card_no, run_id").eq("game_id", cards.id).eq("attendee_id", first).single()) : null;
  check("a card round's turn records the person and the run, with no prize yet", !!firstRow && firstRow.prize_no === null && firstRow.card_no === null && firstRow.run_id === cardRun.id);
  const spinning = must(await pick(first, 1));
  check("a card cannot be picked while the reel is still spinning", spinning === null && (await stageVersion()) === cv);
  must(await stopReel());
  const stalePick = must(await pick(first, 1, cv - 1));
  const someoneElse = must(await pick([ann.id, ben.id, cai.id].find((id) => id !== first), 1));
  const zero = must(await pick(first, 0));
  const tooFar = must(await pick(first, 4));
  const wrongRun = must(await pick(first, 1, cv, quizRun.id, quiz.id));
  check("card_pick refuses a stale version, someone else, a card outside the deck and another game's run",
    [stalePick, someoneElse, zero, tooFar, wrongRun].every((v) => v === null) && (await stageVersion()) === cv);
  const pen = must(await pick(first, 2));
  if (pen !== null) cv += 1;
  const penRow = must(await db.from("draw_winners").select("prize_no, card_no").eq("game_id", cards.id).eq("attendee_id", first).single());
  const afterPick = must(await db.from("game_stage").select("phase, phase_data").eq("event_id", event.id).single());
  check("card_pick gives the deck's prize and flips the card", pen === 1 && penRow.prize_no === 1 && penRow.card_no === 2
    && afterPick.phase === "draw_card_reveal" && afterPick.phase_data.card_no === 2, `got ${pen}`);

  const [second] = await cardSpin(Date.now() - 1000);
  const taken = must(await pick(second, 2));
  check("a card is taken once", taken === null);
  const mug = must(await pick(second, 3));
  if (mug !== null) cv += 1;
  check("the next participant takes another card", mug === 0, `got ${mug}`);

  const [third] = await cardSpin(Date.now() - 1000);
  must(await db.from("draw_winners").update({ void: true }).eq("game_id", cards.id).eq("attendee_id", third));
  const again = await cardSpin(Date.now() - 1000);
  check("someone sent away before picking is not drawn again in that card round", !!third && again.length === 0, `drew ${again.length}`);

  const rounds = must(await db.rpc("draw_spin", { p_event_id: event.id, p_expected: cv, p_run_id: drawRun.id, p_game_id: draw.id, p_prize_no: 0, p_count: 1, p_checkpoint_id: cp.id, p_exclude: [" crew "], p_spin_ends_at: new Date().toISOString(), p_phase: "draw_rounds", p_extra: { round: 0, rounds: 4 } }));
  if (rounds !== null) cv += 1;
  const roundStage = must(await db.from("game_stage").select("phase, phase_ends_at, phase_data").eq("event_id", event.id).single());
  const roundRow = rounds?.length ? must(await db.from("draw_winners").select("run_id").eq("game_id", draw.id).eq("attendee_id", rounds[0]).single()) : null;
  check("draw_spin opens the mosaic's rounds with no end time, round 0 and pool_at, and records the run",
    roundStage.phase === "draw_rounds" && roundStage.phase_ends_at === null && roundStage.phase_data.round === 0
      && typeof roundStage.phase_data.pool_at === "string" && roundRow?.run_id === drawRun.id);
  const badPhase = must(await db.rpc("draw_spin", { p_event_id: event.id, p_expected: cv, p_run_id: drawRun.id, p_game_id: draw.id, p_prize_no: 0, p_count: 1, p_checkpoint_id: cp.id, p_exclude: [], p_spin_ends_at: new Date().toISOString(), p_phase: "idle" }));
  check("draw_spin refuses any other phase", badPhase === null && (await stageVersion()) === cv);

  const { data: bucket, error: bucketError } = await db.storage.getBucket("event-media");
  check("the media bucket takes 30 MB MP4 and WebM videos", !bucketError && bucket?.file_size_limit === 31457280
    && ["video/mp4", "video/webm"].every((t) => bucket?.allowed_mime_types?.includes(t)));

```
Note: by this point in the script Ann and Ben won prize 1 and Cai prize 0 of `draw`; deleting `draw`'s winners puts all three back in the pool, and Crew (Dev, Eve) stays left out. The three card turns use up Ann, Ben and Cai, which is what makes the fourth turn empty.

- [ ] **Step 3: Ask the user, then apply the migration**

Stop and ask the user: "Migration 0050 is ready. It only adds columns, a function and a bucket limit, and keeps the deployed code's draw working. OK to apply it to the live Supabase project?" Do not continue until they say yes.

On yes: apply it with the Supabase MCP `apply_migration` tool (project id `wfmqwwcolfigjylkgrsv`, name `0050_draw_formats`, query = the file's contents).

- [ ] **Step 4: Run the database check**

Run: `npm run check:games`
Expected: every line PASS, apart from `a batch is capped at ceil(15 × elapsed)`, which fails only when this PC's clock runs more than ~0.3 s fast (measure with `w32tm /stripchart /computer:time.google.com /samples:3 /dataonly`). Every new check from step 2 must PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0050_draw_formats.sql scripts/games-db-check.mjs
git commit -m "feat(games): card round and mosaic rounds in the database"
```

---

### Task 9: Database layer for the formats

**Files:**
- Modify: `src/lib/db/games.ts`
- Modify: `src/lib/games/draw.ts` (add `checkedInBy`)
- Test: `tests/games-draw.test.ts`

**Interfaces:**
- Consumes: 0050 (Task 8).
- Produces:
  - `type CheckinRow = { attendee_id: string; scanned_at: string }`; `checkedInBy(rows: CheckinRow[], at: number | null): Set<string>` (in `draw.ts`)
  - `listCheckins(eventId: string, checkpointId: string): Promise<CheckinRow[]>`
  - `Run` gains `deck: number[] | null`; `createRun(game: Game, grouping: Grouping, deck?: number[] | null): Promise<Run>`
  - `drawSpin(a: { eventId; expected; runId; gameId; prizeNo: number | null; count; checkpointId; exclude; spinEndsAt: string | null; keep?: string[]; phase?: "draw_spinning" | "draw_rounds"; extra?: Record<string, unknown> }): Promise<string[] | null>`
  - `cardPick(a: { eventId: string; expected: number; runId: string; gameId: string; attendeeId: string; cardNo: number }): Promise<number | null>`
  - `voidPendingCard(gameId: string, attendeeId: string): Promise<void>`
  - `resetDraw(gameId)` also clears the game's runs' decks.

- [ ] **Step 1: Write the failing test**

Append to `tests/games-draw.test.ts` (add `checkedInBy` to the import):
```ts
describe("checkedInBy (D316)", () => {
  const rows = [
    { attendee_id: "a", scanned_at: "2026-10-01T02:00:00Z" },
    { attendee_id: "b", scanned_at: "2026-10-01T02:05:00Z" },
  ];
  it("is everyone so far with no draw time", () => {
    expect(checkedInBy(rows, null)).toEqual(new Set(["a", "b"]));
  });
  it("is only who had checked in by the draw", () => {
    expect(checkedInBy(rows, Date.parse("2026-10-01T02:01:00Z"))).toEqual(new Set(["a"]));
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/games-draw.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `checkedInBy`**

Append to `src/lib/games/draw.ts`:
```ts
export type CheckinRow = { attendee_id: string; scanned_at: string };

/**
 * Who had checked in by `at` (D316): a wheel or mosaic shows the pool as it stood when the draw
 * was made, so someone scanning in mid-draw adds no slice or tile. Null = everyone so far.
 */
export function checkedInBy(rows: CheckinRow[], at: number | null): Set<string> {
  return new Set(rows.filter((r) => at === null || Date.parse(r.scanned_at) <= at).map((r) => r.attendee_id));
}
```

- [ ] **Step 4: Update `src/lib/db/games.ts`**

Change the import of `WinnerRow` to `import type { CheckinRow, WinnerRow } from "@/lib/games/draw";`.

Replace the `Run` type, `hydrateRun` and `createRun`:
```ts
export type Run = { id: string; event_id: string; game_id: string; grouping: Grouping; started_at: string; deck: number[] | null };

const hydrateRun = (r: Record<string, unknown>): Run => ({
  id: r.id as string, event_id: r.event_id as string, game_id: r.game_id as string,
  grouping: parseGrouping(r.grouping), started_at: r.started_at as string,
  deck: Array.isArray(r.deck) ? (r.deck as unknown[]).filter((x): x is number => typeof x === "number") : null,
});

/** A new play-through. A card round's run carries its shuffled deck (D317). */
export async function createRun(game: Game, grouping: Grouping, deck: number[] | null = null): Promise<Run> {
  const { data, error } = await serviceClient().from("game_runs")
    .insert({ event_id: game.event_id, game_id: game.id, grouping, deck }).select("*").single();
  if (error) throw error;
  return hydrateRun(data);
}
```

After `listCheckedInIds`, add:
```ts
/** A checkpoint's check-ins with their times, for a pool frozen at the draw (D316). */
export async function listCheckins(eventId: string, checkpointId: string): Promise<CheckinRow[]> {
  return selectAll<CheckinRow>((from, to) => serviceClient().from("checkins")
    .select("attendee_id, scanned_at").eq("event_id", eventId).eq("checkpoint_id", checkpointId).order("attendee_id").range(from, to));
}
```

Replace `drawSpin`:
```ts
/**
 * Draws and moves the stage on in one transaction (D280). Null when stale or refused. `keep` is
 * a redraw's other winners, left on the stage ahead of the replacement (D281). `prizeNo` null is
 * a card round's turn (D317); `phase` "draw_rounds" opens the mosaic's rounds, with no end time
 * (D315); `extra` is merged into phase_data (spin_ms, quick, cards, round, rounds).
 */
export async function drawSpin(a: {
  eventId: string; expected: number; runId: string; gameId: string; prizeNo: number | null; count: number;
  checkpointId: string; exclude: string[]; spinEndsAt: string | null; keep?: string[];
  phase?: "draw_spinning" | "draw_rounds"; extra?: Record<string, unknown>;
}): Promise<string[] | null> {
  const { data, error } = await serviceClient().rpc("draw_spin", {
    p_event_id: a.eventId, p_expected: a.expected, p_run_id: a.runId, p_game_id: a.gameId,
    p_prize_no: a.prizeNo, p_count: a.count, p_checkpoint_id: a.checkpointId,
    p_exclude: a.exclude, p_spin_ends_at: a.spinEndsAt, p_keep: a.keep ?? [],
    p_phase: a.phase ?? "draw_spinning", p_extra: a.extra ?? {},
  });
  if (error) throw error;
  return (data as string[] | null) ?? null;
}

/** The host taps the card the participant called (D317). The prize number, or null when refused. */
export async function cardPick(a: { eventId: string; expected: number; runId: string; gameId: string; attendeeId: string; cardNo: number }): Promise<number | null> {
  const { data, error } = await serviceClient().rpc("card_pick", {
    p_event_id: a.eventId, p_expected: a.expected, p_run_id: a.runId, p_game_id: a.gameId,
    p_attendee_id: a.attendeeId, p_card_no: a.cardNo,
  });
  if (error) throw error;
  return typeof data === "number" ? data : null;
}

/**
 * End game while a participant is still to pick (D318): they are voided, so they are not left
 * holding a draw with no prize, which would keep them out of every later draw.
 */
export async function voidPendingCard(gameId: string, attendeeId: string): Promise<void> {
  const { error } = await serviceClient().from("draw_winners").update({ void: true })
    .eq("game_id", gameId).eq("attendee_id", attendeeId).eq("void", false).is("card_no", null).is("prize_no", null);
  if (error) throw error;
}
```

Replace `resetDraw`:
```ts
/**
 * Clears a draw's winners, e.g. after a rehearsal, so everyone is back in the pool. A card
 * round's decks go too (D322), so reopening deals a fresh one.
 */
export async function resetDraw(gameId: string): Promise<void> {
  const db = serviceClient();
  const { error } = await db.from("draw_winners").delete().eq("game_id", gameId);
  if (error) throw error;
  const { error: deckError } = await db.from("game_runs").update({ deck: null }).eq("game_id", gameId);
  if (deckError) throw deckError;
}
```

- [ ] **Step 5: Run and commit**

Run: `npx vitest run && npx tsc --noEmit` — Expected: PASS.
```bash
git add src/lib/db/games.ts src/lib/games/draw.ts tests/games-draw.test.ts
git commit -m "feat(games): database calls for card rounds and mosaic rounds"
```

---

### Task 10: What the LED, the host and the phone are sent

**Files:**
- Modify: `src/lib/games/wire.ts`, `src/lib/games/race.ts`, `src/lib/games/display-state.ts`, `src/lib/games/phone-state.ts`
- Test: `tests/games-race.test.ts`

**Interfaces:**
- Consumes: Tasks 2–9.
- Produces (wire types every later UI task uses):
```ts
export type PhoneMe =
  | { kind: "race"; joined: boolean; lane: string; place: number | null; lanes: number }
  | { kind: "survival"; joined: boolean; outAt: number | null; answered: number | null }
  | { kind: "draw"; won: string | null; up: boolean }
  | { kind: "none" };
export type DisplayLane = { key: string; label: string; players: number; progress: number; place: number; initials: string[] };
export type DisplayDraw = {
  format: DrawFormat; prize: string | null; pool: number; sample: Person[];
  targets: Person[] | null; spinMs: number | null; quick: boolean; wheel: Person[] | null;
  mosaic: { people: Person[]; survivorIds: string[]; round: number; rounds: number } | null;
  cards: { slots: CardView[]; participant: { name: string; company: string } | null; picked: number | null } | null;
  winners: { name: string; company: string }[] | null;
};
// DisplayState gains `look: Background`; race.mvp becomes { name: string } | null; draw becomes DisplayDraw | null.
// HostState.hostDraw gains `format: DrawFormat` and `cardsLeft: number | null`.
```
  - `progressOf(score: number, leader: number): number` in `race.ts`.
  - `poolFor(event, game, prizeNo: number | null, at?: number | null)`.

- [ ] **Step 1: Write the failing test**

Append to `tests/games-race.test.ts` (import `progressOf`):
```ts
describe("progressOf (D303, D304)", () => {
  it("is the score over 110% of the leader, so the leader never looks finished", () => {
    expect(progressOf(100, 100)).toBeCloseTo(1 / 1.1);
    expect(progressOf(50, 100)).toBeCloseTo(0.5 / 1.1);
  });
  it("is 0 before anyone taps", () => {
    expect(progressOf(0, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/games-race.test.ts` — Expected: FAIL.

- [ ] **Step 3: `race.ts`**

Append:
```ts
/**
 * How far up its column a lane is on the LED (D303): its score over 110% of the leader's, so the
 * leader never looks finished. Sent instead of the score, so no count is on the wire (D304).
 */
export function progressOf(score: number, leader: number): number {
  return leader > 0 ? Math.min(1, score / (leader * 1.1)) : 0;
}
```

- [ ] **Step 4: `wire.ts`**

Replace the file's types from `PhoneMe` down to the end of `DisplayState` with:
```ts
/** What a phone knows about itself in the game on stage. No tap counts (D304). */
export type PhoneMe =
  | { kind: "race"; joined: boolean; lane: string; place: number | null; lanes: number }
  | { kind: "survival"; joined: boolean; outAt: number | null; answered: number | null }
  /** `up`: drawn in a card round and called to the stage to pick a card (D319). */
  | { kind: "draw"; won: string | null; up: boolean }
  | { kind: "none" };

/** GET /api/play/[token]/state. `unchanged` means "same key as you sent", and nothing else is sent. */
export type PhoneState = { now: number; key: string; unchanged?: true; stage?: PublicStage; me?: PhoneMe };

/** A tile on the LED: initials plus first name (D273). */
export type Person = { id: string; initials: string; first: string };

/**
 * A race lane on the LED. `progress` (0–1) replaces the score (D304); `initials` are the lane's
 * latest joiners, only in the lobby (D305).
 */
export type DisplayLane = { key: string; label: string; players: number; progress: number; place: number; initials: string[] };

/** The lucky draw on the LED (D310–D319). */
export type DisplayDraw = {
  format: DrawFormat;
  prize: string | null;
  pool: number;
  sample: Person[];
  /** During draw_spinning only: who the reels or the wheel land on (D312). */
  targets: Person[] | null;
  spinMs: number | null;
  /** A "Not here" redraw's quick reel (D318). */
  quick: boolean;
  /** Wheel format: every slice, the frozen pool in id order (D314, D316). */
  wheel: Person[] | null;
  /** Mosaic format, in draw_rounds: the frozen pool, and who stands after this round (D315). */
  mosaic: { people: Person[]; survivorIds: string[]; round: number; rounds: number } | null;
  /** Card round (D317). */
  cards: { slots: CardView[]; participant: { name: string; company: string } | null; picked: number | null } | null;
  /** Only in draw_reveal (D280). */
  winners: { name: string; company: string }[] | null;
};

/** GET /api/display/[token]/state — the full view on every poll (D260). */
export type DisplayState = {
  now: number;
  stage: PublicStage;
  event: { name: string; logoUrl: string | null; colour: string };
  /** The LED background of the game on stage; Theme when idle (D297, D298). */
  look: Background;
  race: { lanes: DisplayLane[]; solo: boolean; mvp: { name: string } | null } | null;
  survival: {
    players: Person[];
    eliminatedIds: string[];
    answered: number;
    split: number[] | null;
    winners: { name: string; company: string }[];
  } | null;
  draw: DisplayDraw | null;
};
```
Add to the imports:
```ts
import type { DrawFormat } from "@/lib/games/config";
import type { Background } from "@/lib/games/background";
import type { CardView } from "@/lib/games/cards";
```
(`GameKind` is already imported from config; merge into one import line.) In `HostState.hostDraw`, add after `checkpointSet: boolean;`:
```ts
    format: DrawFormat;
    /** Card round: cards not yet taken in this run. Null for the other formats. */
    cardsLeft: number | null;
```

- [ ] **Step 5: `display-state.ts`**

Update the imports:
```ts
import { gameSummary, type DrawGame, type Game, type SurvivalGame } from "@/lib/games/config";
import { allowedActions, currentQuestion, drawExtra, spinFacts, type StageRow } from "@/lib/games/phase";
import { laneLabel, progressOf, standings, topTapper, visibleLanes } from "@/lib/games/race";
import { absentFor, checkedInBy, eligiblePool, nextPrize, poolBeforeDraw, prizeProgress, standingWinners, type CheckinRow, type WinnerRow } from "@/lib/games/draw";
import { mosaicSurvivors, seededOrder } from "@/lib/games/mosaic";
import { backgroundOf } from "@/lib/games/background";
import { cardsLeft, cardsView } from "@/lib/games/cards";
import { listAnswerChoices, listCheckins, listEventWinners, listGames, listPlayers, listWinners } from "@/lib/db/games";
```
Replace `PoolRows` and `poolFor`:
```ts
type PoolRows = { roster: Attendee[]; checkins: CheckinRow[]; winners: WinnerRow[] };
```
```ts
/**
 * The draw's eligible pool (D278) for one prize, for the host's count and the LED's names.
 * Only this event's attendees can be in it: the roster is the event's, and check-ins are read
 * for this event. Categories follow the multi-programme rule in `eligiblePool`, as draw_spin
 * does. Whoever was "not here" for `prizeNo` stays out (absentFor); a card round's turn has no
 * prize, and its absentees are the ones sent away before picking (prize null). `at` freezes the
 * check-ins at the draw (D316). The rows are memoised per game; the filters apply on each call.
 */
export async function poolFor(event: Event, game: DrawGame, prizeNo: number | null, at: number | null = null): Promise<Attendee[]> {
  const { checkpoint_id, exclude_categories } = game.config;
  // hydrateGame already reads a stored checkpoint that is not an id as unset; checked again here
  // so a bad value can never fail the whole LED and host view on a query error.
  if (!checkpoint_id || !UUID.test(checkpoint_id)) return [];
  const rows = await poolMemo.get(game.id, async () => {
    const [roster, checkins, winners] = await Promise.all([
      rosterFor(event.id), listCheckins(event.id, checkpoint_id), listEventWinners(event.id),
    ]);
    return { roster: [...roster.values()], checkins, winners };
  });
  const cards = game.config.format === "cards";
  const absent = prizeNo === null && !cards ? new Set<string>() : absentFor(rows.winners, game.id, prizeNo);
  return eligiblePool(rows.roster, checkedInBy(rows.checkins, at), exclude_categories, standingWinners(rows.winners), absent);
}
```
In `displayFor`, add `look` to `base` after `event`:
```ts
    look: backgroundOf(game && stage.game_id === game.id ? game : null),
```
Replace `raceView`:
```ts
async function raceView(event: Event, stage: StageRow): Promise<DisplayState["race"]> {
  const runId = stage.run_id!;
  const [run, rows, roster] = await Promise.all([runFor(runId, event.id), tapsFor(runId), rosterFor(event.id)]);
  const grouping = run?.grouping ?? { by: "solo" as const };
  const nameOf = (id: string) => roster.get(id)?.name ?? "";
  const table = standings(rows);
  const shown = stage.phase === "race_results" ? table : visibleLanes(table, grouping);
  const leader = Math.max(0, ...table.map((l) => l.score));
  const lobby = stage.phase === "race_lobby";
  // The lobby's initials: each lane's latest joiners, newest last (D305).
  const initials = (key: string) => lobby
    ? rows.filter((r) => r.lane_key === key).slice(-12).map((r) => tag(nameOf(r.attendee_id)).initials)
    : [];
  const top = topTapper(rows);
  return {
    lanes: shown.map((l) => ({
      key: l.key, label: laneLabel(l.key, grouping, nameOf), players: l.players,
      progress: progressOf(l.score, leader), place: l.place, initials: initials(l.key),
    })),
    solo: grouping.by === "solo",
    // The name only (D304).
    mvp: stage.phase === "race_results" && top ? { name: tagLabel(nameOf(top.attendee_id)) } : null,
  };
}
```
Replace `drawView` (and add the `people` helper above it):
```ts
const people = (list: Attendee[]) => list.map((a) => person(a.id, a.name));

async function drawView(event: Event, stage: StageRow, game: DrawGame): Promise<DisplayState["draw"]> {
  const [winners, roster] = await Promise.all([listWinners(game.id), rosterFor(event.id)]);
  const format = game.config.format;
  const spun = spinFacts(stage);
  const extra = drawExtra(stage);
  const prizeNo = spun ? spun.prizeNo : format === "cards" ? null : nextPrize(prizeProgress(game.config.prizes, winners))?.prize_no ?? null;
  const pool = await poolFor(event, game, prizeNo, extra.poolAt);
  // While a spin or the mosaic's rounds run, the pool is the one the draw was made from, however
  // fresh the memo (see poolBeforeDraw). Only this spin's draw is added back.
  const running = stage.phase === "draw_spinning" || stage.phase === "draw_rounds";
  const drawn = running && spun ? spun.newIds.flatMap((id) => { const a = roster.get(id); return a ? [a] : []; }) : [];
  const shown = poolBeforeDraw(pool, drawn);
  const nameOf = (id: string) => roster.get(id)?.name ?? "";

  const run = format === "cards" && stage.run_id ? await runFor(stage.run_id, event.id) : null;
  const onStage = spun && (stage.phase === "draw_card_pick" || stage.phase === "draw_card_reveal") ? spun.winnerIds[0] : null;

  return {
    format,
    prize: prizeNo === null ? null : game.config.prizes[prizeNo]?.name ?? null,
    pool: shown.length,
    sample: people(seededOrder(shown, `${stage.run_id}:${stage.version}`).slice(0, 40)),
    // The display link learns who the reels land on when the spin starts (D312). Phones never do.
    targets: stage.phase === "draw_spinning" && spun ? spun.newIds.map((id) => person(id, nameOf(id))) : null,
    spinMs: extra.spinMs,
    quick: extra.quick,
    wheel: format === "wheel" && (stage.phase === "draw_ready" || stage.phase === "draw_spinning") ? people(shown) : null,
    mosaic: stage.phase === "draw_rounds" && spun && extra.round !== null && extra.rounds !== null
      ? {
        people: people(shown),
        // Only who still stands this round: the winners cannot be picked out early (D315).
        survivorIds: mosaicSurvivors(shown.map((a) => a.id), spun.winnerIds, extra.round, extra.rounds, `${stage.run_id}:${spun.winnerIds.join(",")}`),
        round: extra.round,
        rounds: extra.rounds,
      }
      : null,
    cards: format === "cards" && stage.run_id
      ? {
        slots: cardsView(run?.deck ?? [], winners, stage.run_id, game.config.prizes, nameOf),
        participant: onStage ? card(roster.get(onStage)) : null,
        picked: stage.phase === "draw_card_reveal" ? extra.cardNo : null,
      }
      : null,
    // Never before the reveal: the winner is not on the wire while the names are still rolling (D280).
    winners: stage.phase === "draw_reveal" && spun ? spun.winnerIds.map((id) => card(roster.get(id))) : null,
  };
}
```
In `hostState`, replace the `hostDraw = {...}` assignment (keep the `const [winners, roster] = ...` line above it) with:
```ts
    const spun = spinFacts(stage);
    const run = game.config.format === "cards" && stage.run_id ? await runFor(stage.run_id, event.id) : null;
    const showing: ReadonlySet<string> = new Set(["draw_spinning", "draw_reveal", "draw_rounds", "draw_card_pick", "draw_card_reveal"]);
    hostDraw = {
      progress: prizeProgress(game.config.prizes, winners),
      spinWinners: spun && showing.has(stage.phase) ? spun.winnerIds.map((id) => ({ id, ...card(roster.get(id)) })) : [],
      checkpointSet: game.config.checkpoint_id !== null,
      format: game.config.format,
      cardsLeft: run && stage.run_id ? cardsLeft(run.deck ?? [], winners, stage.run_id) : null,
    };
```

- [ ] **Step 6: `phone-state.ts`**

In the race branch, drop `taps` from the returned object:
```ts
    return { kind: "race", joined: mine !== null, lane, place, lanes };
```
Replace the draw branch (from the `// The winner's own phone` comment to the end of `phoneMe`):
```ts
  // The winner's own phone learns only once the LED reveals it (D280, D282). In a card round
  // the participant is called up when their reel stops, and learns the prize at the flip (D319).
  const spun = spinFacts(stage);
  const mine = !!spun?.winnerIds.includes(ctx.attendee.id);
  const prizeNo = spun?.prizeNo ?? null;
  const prize = prizeNo === null ? "a prize" : game.config.prizes[prizeNo]?.name ?? "a prize";
  if (mine && (stage.phase === "draw_reveal" || stage.phase === "draw_card_reveal")) return { kind: "draw", won: prize, up: false };
  if (mine && stage.phase === "draw_card_pick") return { kind: "draw", won: null, up: true };
  return { kind: "draw", won: null, up: false };
```

- [ ] **Step 7: Fix what tsc flags, run and commit**

Run: `npx tsc --noEmit`. The remaining errors are UI files reading removed fields; fix each minimally now (later tasks rewrite them):
- `HostConsole.tsx`: race `Facts` rows — use `[`${l.place}. ${l.label}`, ""]`; the MVP line — drop ` ({state.race.mvp.taps})`.
- `RaceScreen.tsx`: `l.score` in `Lanes`/`Podium` — use `l.progress` for the bar width (`${l.progress * 100}%`) and drop the score text.
- `PlayClient.tsx`: `TapPad initial={me.taps}` — pass `initial={0}`; the results note — drop "— you tapped …".
- `scripts/games-load.mjs` is plain JS and is fixed in Task 23.

Run: `npx vitest run && npx tsc --noEmit` — Expected: PASS.
```bash
git add src/lib/games/wire.ts src/lib/games/race.ts src/lib/games/display-state.ts src/lib/games/phone-state.ts tests/games-race.test.ts src/components/games
git commit -m "feat(games): draw formats and progress on the wire, no tap counts"
```

---

### Task 11: Host actions for the formats

**Files:**
- Modify: `src/app/host/[token]/actions.ts`

**Interfaces:**
- Consumes: `drawSpin`, `cardPick`, `voidPendingCard`, `createRun(game, grouping, deck)` (Task 9); `dealDeck`, `secureRandom`, `cardsLeft` (Task 6); `roundWrite`, `drawExtra`, `QUICK_SPIN_MS` (Task 4); `MAX_CARDS` (Task 2); `runFor` from `@/lib/games/live`.
- Produces: `roundAction(token: string, expected: number): Promise<HostResult>`, `pickCardAction(token: string, expected: number, cardNo: number): Promise<HostResult>`; `drawAction`, `redrawAction`, `openGameAction`, `idleAction` learn the formats.

- [ ] **Step 1: Imports**

Replace the import lines for `live`, `db/games` and `phase` with:
```ts
import { forgetStage, hostLinkState, liveStage, runFor } from "@/lib/games/live";
import { cardPick, createRun, drawSpin, getGame, listWinners, revealQuestion, voidPendingCard, voidWinner, writeStage } from "@/lib/db/games";
import {
  canDo, canReveal, currentQuestion, drawExtra, drawReadyWrite, drawRevealWrite, idleWrite, lobbyWrite, overWrite, questionWrite,
  QUICK_SPIN_MS, raceStartWrite, raceStopWrite, revealFacts, roundWrite, spinFacts, type HostAction, type StageRow, type StageWrite,
} from "@/lib/games/phase";
import { MAX_CARDS } from "@/lib/games/config";
import { cardsLeft, dealDeck, secureRandom } from "@/lib/games/cards";
```
(Keep `import type { Game } from "@/lib/games/config";` — merge `MAX_CARDS` into it as `import { MAX_CARDS, type Game } from "@/lib/games/config";`.) Add below the `isId` helper:
```ts
const at = (ms: number) => new Date(Date.now() + ms).toISOString();
```

- [ ] **Step 2: Open deals a card round's deck**

In `openGameAction`, replace the last two lines (`const run = await createRun(game, lanes);` and its `return`) with:
```ts
  // A card round deals its deck now, from the prize units still to give (D317).
  let deck: number[] | null = null;
  if (game.kind === "draw" && game.config.format === "cards") {
    deck = dealDeck(prizeProgress(game.config.prizes, await listWinners(game.id)), secureRandom);
    if (deck.length === 0) return fail("Every prize in this draw has been given. Reset the draw in admin to deal again.");
    if (deck.length > MAX_CARDS) return fail(`A card round has at most ${MAX_CARDS} cards. Lower the prize quantities in admin.`);
  }
  const run = await createRun(game, lanes, deck);
  return commit(b.event, expected, lobbyWrite(game, run.id));
```

- [ ] **Step 3: Draw by format, rounds and picks**

Replace `drawAction`:
```ts
/**
 * Draw (D279, D310–D317). Slot and wheel spin for the game's spin time; the wheel always draws
 * one. The mosaic draws the winners, then plays its rounds with no end time. A card round draws
 * one participant, with no prize until they pick a card, while cards are left.
 */
export async function drawAction(token: string, expected: number, mode: "one" | "all"): Promise<HostResult> {
  const b = await begin(token, expected, "draw");
  if ("ok" in b) return b;
  const game = b.game;
  const runId = b.stage.run_id;
  if (game?.kind !== "draw" || !runId || !game.config.checkpoint_id) return fail("Pick a checkpoint for this draw in admin first.");
  forgetPool(game.id);
  const format = game.config.format;
  const spinMs = game.config.spin_s * 1000;
  const base = { eventId: b.event.id, expected, runId, gameId: game.id, checkpointId: game.config.checkpoint_id, exclude: game.config.exclude_categories };
  const winners = await listWinners(game.id);
  let picked: string[] | null;

  if (format === "cards") {
    const run = await runFor(runId, b.event.id);
    if (cardsLeft(run?.deck ?? [], winners, runId) === 0) return fail("All cards have been dealt.");
    if ((await poolFor(b.event, game, null)).length === 0) return fail("No one left to draw. Check the checkpoint and the categories left out.");
    picked = await drawSpin({ ...base, prizeNo: null, count: 1, spinEndsAt: at(spinMs), extra: { cards: true, spin_ms: spinMs } });
  } else {
    const prize = nextPrize(prizeProgress(game.config.prizes, winners));
    if (!prize) return fail("Every prize has been drawn.");
    const pool = await poolFor(b.event, game, prize.prize_no);
    const count = drawCount(prize, format === "wheel" || mode !== "all" ? "one" : "all", pool.length);
    if (count === 0) return fail("No one left to draw. Check the checkpoint and the categories left out.");
    picked = format === "mosaic"
      ? await drawSpin({ ...base, prizeNo: prize.prize_no, count, spinEndsAt: null, phase: "draw_rounds", extra: { round: 0, rounds: game.config.rounds } })
      : await drawSpin({ ...base, prizeNo: prize.prize_no, count, spinEndsAt: at(spinMs), extra: { spin_ms: spinMs } });
  }
  forgetStage(b.event.id);
  forgetPool(game.id);
  return picked === null ? STALE : { ok: true };
}

/** Next round of a mosaic draw (D315). After the last one the winners are revealed. */
export async function roundAction(token: string, expected: number): Promise<HostResult> {
  const b = await begin(token, expected, "round");
  if ("ok" in b) return b;
  const w = roundWrite(b.stage);
  return w ? commit(b.event, expected, w) : STALE;
}

/** The host taps the card the participant called out (D317). */
export async function pickCardAction(token: string, expected: number, cardNo: number): Promise<HostResult> {
  const b = await begin(token, expected, "pick");
  if ("ok" in b) return b;
  const game = b.game;
  const spun = spinFacts(b.stage);
  if (game?.kind !== "draw" || !spun || spun.winnerIds.length !== 1 || !b.stage.run_id || !Number.isInteger(cardNo)) return STALE;
  const prize = await cardPick({ eventId: b.event.id, expected, runId: b.stage.run_id, gameId: game.id, attendeeId: spun.winnerIds[0], cardNo });
  forgetStage(b.event.id);
  forgetPool(game.id);
  return prize === null ? fail("That card is taken, or someone else moved the game on. Showing the latest.") : { ok: true };
}
```

- [ ] **Step 4: Redraw by format**

In `redrawAction`, replace everything after `const spun = spinFacts(b.stage);` with:
```ts
  if (game?.kind !== "draw" || !spun || !isId(attendeeId) || !spun.winnerIds.includes(attendeeId) || !b.stage.run_id || !game.config.checkpoint_id) return STALE;
  const cards = drawExtra(b.stage).cards;
  await voidWinner(game.id, attendeeId);
  forgetPool(game.id);
  // A card round has one participant at a time, so there is nobody else to keep.
  const keep = cards ? [] : spun.winnerIds.filter((id) => id !== attendeeId);
  const pool = await poolFor(b.event, game, spun.prizeNo);
  if (pool.length === 0) {
    const back = keep.length > 0 ? drawRevealWrite(b.stage, spun.prizeNo, keep) : drawReadyWrite(b.stage);
    return commit(b.event, expected, back, "Marked as not here. No one is left to draw for this prize.");
  }
  // The wheel spins again; everything else rolls a quick reel for the replacement (D318).
  const wheel = game.config.format === "wheel";
  const ms = wheel ? game.config.spin_s * 1000 : QUICK_SPIN_MS;
  const picked = await drawSpin({
    eventId: b.event.id, expected, runId: b.stage.run_id, gameId: game.id, prizeNo: spun.prizeNo, count: 1,
    checkpointId: game.config.checkpoint_id, exclude: game.config.exclude_categories,
    spinEndsAt: at(ms), keep, extra: { spin_ms: ms, quick: !wheel, ...(cards ? { cards: true } : {}) },
  });
  forgetStage(b.event.id);
  forgetPool(game.id);
  return picked === null ? STALE : { ok: true };
}
```
Change the first sentence of its doc comment to: `"Not here — redraw" (D281, D318): the winner is voided, kept on record, and one replacement is drawn for the same prize (or, in a card round, the same turn).`

- [ ] **Step 5: End game voids a participant still to pick**

Replace `idleAction`:
```ts
export async function idleAction(token: string, expected: number): Promise<HostResult> {
  const b = await begin(token, expected, "idle");
  if ("ok" in b) return b;
  const pending = b.stage.phase === "draw_card_pick" && b.game?.kind === "draw" ? spinFacts(b.stage)?.winnerIds ?? [] : [];
  const r = await commit(b.event, expected, idleWrite());
  // Only once the stage has really moved: a stale End must not void anyone (D318).
  if (r.ok && b.game) for (const id of pending) await voidPendingCard(b.game.id, id);
  if (b.game) forgetPool(b.game.id);
  return r;
}
```

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit && npx vitest run` — Expected: PASS.
```bash
git add "src/app/host/[token]/actions.ts"
git commit -m "feat(games): host actions for draw formats, rounds and card picks"
```

---

### Task 12: The LED's sound

**Files:**
- Create: `src/lib/games/sound.ts`
- Test: `tests/games-sound.test.ts`

**Interfaces:**
- Produces: `MUTE_KEY`, `readMuted(storage: Pick<Storage, "getItem"> | null): boolean`, `writeMuted(storage: Pick<Storage, "setItem"> | null, muted: boolean): void`, `type Sfx = "tick" | "go" | "drumroll" | "slice" | "clunk" | "whoosh" | "lift" | "flip" | "fanfare"`, `type Synth = { unlock(): void; play(sfx: Sfx, durationMs?: number): void; setMuted(m: boolean): void; isMuted(): boolean }`, `createSynth(): Synth`, `silentSynth: Synth`.

- [ ] **Step 1: Write the failing tests**

`tests/games-sound.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createSynth, MUTE_KEY, readMuted, silentSynth, writeMuted } from "@/lib/games/sound";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("mute (D302)", () => {
  it("starts unmuted", () => {
    expect(readMuted(memory())).toBe(false);
    expect(readMuted(null)).toBe(false);
  });
  it("remembers muted per machine", () => {
    const s = memory();
    writeMuted(s, true);
    expect(s.getItem(MUTE_KEY)).toBe("1");
    expect(readMuted(s)).toBe(true);
  });
  it("survives storage that throws", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readMuted(broken)).toBe(false);
    expect(() => writeMuted(broken, true)).not.toThrow();
  });
});

describe("createSynth", () => {
  it("does nothing, without throwing, where there is no Web Audio (the server, tests)", () => {
    const s = createSynth();
    expect(() => { s.unlock(); s.play("fanfare"); s.play("drumroll", 3000); }).not.toThrow();
  });
  it("tracks muted", () => {
    const s = createSynth();
    s.setMuted(true);
    expect(s.isMuted()).toBe(true);
  });
  it("has a silent stand-in", () => {
    expect(() => silentSynth.play("tick")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/games-sound.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

`src/lib/games/sound.ts`:
```ts
/**
 * The LED's sound (D301, D302): every effect synthesised with Web Audio, so there are no audio
 * files and nothing to license. Phones play none. Safe to import anywhere: nothing touches
 * `window` until a synth is used in a browser.
 */
export const MUTE_KEY = "ecphub.display.muted";

export function readMuted(storage: Pick<Storage, "getItem"> | null): boolean {
  try {
    return storage?.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeMuted(storage: Pick<Storage, "setItem"> | null, muted: boolean): void {
  try {
    storage?.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* private window or blocked storage: the choice lasts until reload */
  }
}

export type Sfx = "tick" | "go" | "drumroll" | "slice" | "clunk" | "whoosh" | "lift" | "flip" | "fanfare";

export type Synth = {
  /** Call from a click: browsers start audio only after a user gesture (D302). */
  unlock(): void;
  play(sfx: Sfx, durationMs?: number): void;
  setMuted(m: boolean): void;
  isMuted(): boolean;
};

export const silentSynth: Synth = { unlock() {}, play() {}, setMuted() {}, isMuted: () => true };

export function createSynth(): Synth {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let muted = false;

  const ready = (): AudioContext | null => {
    if (ctx) return ctx;
    const AC = typeof window === "undefined"
      ? undefined
      : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return ctx;
  };

  const tone = (c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, gain: number, endFreq?: number) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(master!);
    o.start(start);
    o.stop(start + dur + 0.02);
  };

  const hiss = (c: AudioContext, start: number, dur: number, gain: number, filter: BiquadFilterType, freq: number, endFreq?: number) => {
    const src = c.createBufferSource();
    src.buffer = noise;
    const f = c.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, start);
    if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(master!);
    src.start(start);
    src.stop(start + dur + 0.02);
  };

  return {
    unlock() {
      const c = ready();
      if (c && c.state === "suspended") void c.resume();
    },
    setMuted(m) { muted = m; },
    isMuted: () => muted,
    play(sfx, durationMs = 0) {
      if (muted) return;
      const c = ready();
      if (!c || c.state !== "running") return;
      const t = c.currentTime + 0.01;
      switch (sfx) {
        case "tick": tone(c, 1200, t, 0.05, "square", 0.25); break;
        case "go": [440, 554, 659].forEach((f) => tone(c, f, t, 0.7, "sawtooth", 0.18)); break;
        case "slice": tone(c, 1800, t, 0.02, "triangle", 0.12); break;
        case "clunk": tone(c, 180, t, 0.14, "sine", 0.5); hiss(c, t, 0.08, 0.2, "lowpass", 900); break;
        case "whoosh": hiss(c, t, 0.6, 0.35, "bandpass", 400, 3000); break;
        case "lift": tone(c, 300, t, 0.22, "sine", 0.3, 600); break;
        case "flip": hiss(c, t, 0.09, 0.3, "highpass", 2500); tone(c, 900, t + 0.05, 0.06, "square", 0.15); break;
        case "drumroll": {
          const dur = Math.max(0.3, durationMs / 1000);
          for (let s = 0; s < dur; s += 0.045) hiss(c, t + s, 0.04, 0.12 + 0.25 * (s / dur), "lowpass", 1800);
          break;
        }
        case "fanfare": {
          [523, 659, 784].forEach((f, i) => { tone(c, f, t + i * 0.15, 0.16, "triangle", 0.3); tone(c, f, t + i * 0.15, 0.16, "square", 0.08); });
          [1047, 784, 659].forEach((f) => tone(c, f, t + 0.45, 0.9, "triangle", 0.22));
          break;
        }
      }
    },
  };
}
```

- [ ] **Step 4: Run tests and commit**

Run: `npx vitest run tests/games-sound.test.ts && npx tsc --noEmit` — Expected: PASS.
```bash
git add src/lib/games/sound.ts tests/games-sound.test.ts
git commit -m "feat(games): synthesised LED sound with a remembered mute"
```

---

### Task 13: The LED shell — 3D layer, backgrounds, sound and mute

**Files:**
- Create: `src/components/games/display/three/Stage3D.tsx`, `three/useAnimating.ts`, `three/textTexture.ts`, `three/ThemeBackdrop.tsx`, `three/Layer3D.tsx`
- Create: `src/components/games/display/DisplayView.tsx`, `Backdrop.tsx`, `MuteToggle.tsx`, `TimerRing.tsx`, `useSoundCues.ts`
- Modify: `src/components/games/display/DisplayClient.tsx`, `Frame.tsx`, `IdleScreen.tsx`
- Modify: `src/lib/games/views.ts` (add `celebrationDelay`)
- Test: `tests/games-views.test.ts`

**Interfaces:**
- Consumes: `Background`, `DEFAULT_BACKGROUND`, `CHROMA_GREEN` (Task 2); `Synth`, `createSynth`, `readMuted`, `writeMuted` (Task 12); `gameFont` (Task 1); `DisplayState` (Task 10).
- Produces:
  - `celebrationDelay(phase: Phase): number | null` (views.ts) — ms after the phase starts that confetti begins; null = no confetti.
  - `CAMERA_Z`, default `Stage3D({ children, onLost })`; `useAnimating(active: boolean, fps?: number)`; `GAME_FAMILY`, `useFontReady()`, `textTexture(width, height, lines: Line[], opts?)`, `type Line = { text: string; size: number; colour: string; alpha?: number }`; `ThemeBackdrop({ colour })`; default `Layer3D({ state, offset, synth, theme, onLost })`.
  - `DisplayShell({ state, offset })` — everything on the LED page except where the state comes from (used by `DisplayClient` and, in Task 20, `DisplayTest`).
  - `Frame({ title, right?: React.ReactNode, children })` — `right` widened from string.
  - `TimerRing({ left: number; total: number; size?: number })`.
  - `useSoundCues(state, offset, synth)`.

- [ ] **Step 1: Test `celebrationDelay`**

Append to `tests/games-views.test.ts` (import `celebrationDelay`):
```ts
describe("celebrationDelay (D305, D306, D317)", () => {
  it("throws confetti for every winner screen, after the podium rises or the card flips", () => {
    expect(celebrationDelay("race_results")).toBe(1600);
    expect(celebrationDelay("survival_over")).toBe(0);
    expect(celebrationDelay("draw_reveal")).toBe(0);
    expect(celebrationDelay("draw_card_reveal")).toBe(2000);
  });
  it("throws none anywhere else", () => {
    expect(celebrationDelay("draw_spinning")).toBeNull();
    expect(celebrationDelay("idle")).toBeNull();
  });
});
```
Run: `npx vitest run tests/games-views.test.ts` — Expected: FAIL.

Append to `src/lib/games/views.ts`:
```ts
/**
 * When a winner screen's confetti starts, in ms after its phase begins: after the podium has
 * risen (D305), or the card has flipped (D317). Null where there is nothing to celebrate.
 */
export function celebrationDelay(phase: Phase): number | null {
  if (phase === "race_results") return 1600;
  if (phase === "draw_card_reveal") return 2000;
  if (phase === "survival_over" || phase === "draw_reveal") return 0;
  return null;
}
```
Run the test again — Expected: PASS.

- [ ] **Step 2: The 3D canvas**

`src/components/games/display/three/Stage3D.tsx`:
```tsx
"use client";
import { Canvas } from "@react-three/fiber";

export const CAMERA_FOV = 30;
/** At this distance a 1080-unit-tall plane at z = 0 fills the view: 1 unit = 1 LED pixel (D293). */
export const CAMERA_Z = 540 / Math.tan((CAMERA_FOV / 2) * (Math.PI / 180));

/**
 * The LED's one WebGL canvas (D293–D295), behind the HTML screens on the 1920×1080 canvas. It
 * measures its unscaled size (offsetSize), so it always draws 1920×1080 at pixel ratio 1, and it
 * redraws only when something asks (frameloop "demand", see useAnimating). A lost context calls
 * `onLost`, which reloads the page; the stage redraws from the server (D262, D295).
 */
export default function Stage3D({ children, onLost }: { children: React.ReactNode; onLost: () => void }) {
  return (
    <Canvas
      style={{ position: "absolute", inset: 0 }}
      frameloop="demand"
      dpr={1}
      resize={{ offsetSize: true }}
      camera={{ fov: CAMERA_FOV, position: [0, 0, CAMERA_Z], near: 10, far: CAMERA_Z * 4 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); onLost(); });
      }}
    >
      <ambientLight intensity={1.1} />
      <directionalLight position={[400, 600, 1600]} intensity={1.6} />
      {children}
    </Canvas>
  );
}
```
Before writing this, confirm in `node_modules/@react-three/fiber` that `Canvas` accepts `resize` with `offsetSize` (search the package's type definitions for `offsetSize`). If it does not, drop the `resize` prop: R3F then measures the scaled size, which only lowers resolution on a smaller window.

`src/components/games/display/three/useAnimating.ts`:
```ts
"use client";
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

/** Keeps the demand-rendered canvas drawing at `fps` while `active` (D294); idle otherwise. */
export function useAnimating(active: boolean, fps = 60) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!active) return;
    if (fps >= 60) {
      let raf = 0;
      const loop = () => { invalidate(); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }
    const id = setInterval(() => invalidate(), 1000 / fps);
    return () => clearInterval(id);
  }, [active, fps, invalidate]);
}
```

`src/components/games/display/three/textTexture.ts`:
```ts
"use client";
import * as THREE from "three";
import { useEffect, useState } from "react";
import { gameFont } from "@/lib/games/font";

/** The display font's CSS family, for canvas text (D293). */
export const GAME_FAMILY = gameFont.style.fontFamily;

/** True once the display font can be drawn onto a canvas: canvas text does not wait for fonts. */
export function useFontReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    document.fonts.load(`800 64px ${GAME_FAMILY}`).catch(() => undefined).finally(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);
  return ready;
}

export type Line = { text: string; size: number; colour: string; alpha?: number };

/**
 * A texture of centred lines in the display font, drawn at twice the size so it stays crisp when
 * a card grows. Lines shrink to fit 90% of the width. The caller disposes it when replaced.
 */
export function textTexture(width: number, height: number, lines: Line[], opts: { background?: string; radius?: number; gap?: number } = {}): THREE.CanvasTexture {
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, opts.radius ?? 0);
    ctx.fill();
  }
  const gap = opts.gap ?? 0.25;
  const sizes = lines.map((l) => {
    let s = l.size;
    ctx.font = `800 ${s}px ${GAME_FAMILY}`;
    while (s > 8 && ctx.measureText(l.text).width > width * 0.9) {
      s -= 2;
      ctx.font = `800 ${s}px ${GAME_FAMILY}`;
    }
    return s;
  });
  const total = sizes.reduce((a, s, i) => a + s + (i ? s * gap : 0), 0);
  let y = (height - total) / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  lines.forEach((l, i) => {
    if (i) y += sizes[i] * gap;
    ctx.font = `800 ${sizes[i]}px ${GAME_FAMILY}`;
    ctx.globalAlpha = l.alpha ?? 1;
    ctx.fillStyle = l.colour;
    ctx.fillText(l.text, width / 2, y);
    y += sizes[i];
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
```

`src/components/games/display/three/ThemeBackdrop.tsx`:
```tsx
"use client";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useAnimating } from "./useAnimating";

const vertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const fragment = /* glsl */ `
uniform float uTime;
uniform vec3 uColour;
varying vec2 vUv;
void main() {
  vec2 p = vUv - vec2(0.5, 0.42);
  p.x *= 1.7778;
  float r = length(p);
  float a = atan(p.y, p.x);
  float rays = pow(0.5 + 0.5 * sin(a * 14.0 + uTime * 0.18), 4.0) * smoothstep(1.3, 0.05, r) * 0.28;
  float glow = smoothstep(0.95, 0.0, r) * 0.35;
  float drift = 0.06 * sin(vUv.x * 5.0 + uTime * 0.21) * sin(vUv.y * 3.5 - uTime * 0.17);
  vec3 base = mix(uColour * 0.42, vec3(0.015), smoothstep(0.1, 1.15, r));
  gl_FragColor = vec4(base + uColour * (rays + glow + drift), 1.0);
}`;

/** The Theme background (D298): a slowly drifting gradient with soft rays in the event colour, at 30 fps (D294). */
export function ThemeBackdrop({ colour }: { colour: string }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColour: { value: new THREE.Color(colour) } },
    vertexShader: vertex,
    fragmentShader: fragment,
    depthWrite: false,
  }), [colour]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ clock }) => { material.uniforms.uTime.value = clock.elapsedTime; });
  useAnimating(true, 30);
  return (
    <mesh renderOrder={-10} material={material}>
      <planeGeometry args={[1920, 1080]} />
    </mesh>
  );
}
```

`src/components/games/display/three/Layer3D.tsx` (Tasks 15–18 add the draw scenes and confetti here):
```tsx
"use client";
import type { DisplayState } from "@/lib/games/wire";
import type { Synth } from "@/lib/games/sound";
import Stage3D from "./Stage3D";
import { ThemeBackdrop } from "./ThemeBackdrop";

/**
 * Everything the LED draws in 3D (D293), in the one canvas: the Theme background and, from later
 * tasks, the draw scenes and the winner confetti. Loaded with next/dynamic (ssr: false), so
 * three.js only ever reaches the display page.
 */
export default function Layer3D({ state, theme, onLost }: { state: DisplayState; offset: number; synth: Synth; theme: boolean; onLost: () => void }) {
  return (
    <Stage3D onLost={onLost}>
      {theme && <ThemeBackdrop colour={state.event.colour} />}
    </Stage3D>
  );
}
```

- [ ] **Step 3: Backdrop, mute, timer ring and sound cues**

`src/components/games/display/Backdrop.tsx`:
```tsx
"use client";
import { CHROMA_GREEN, type Background } from "@/lib/games/background";

/**
 * What sits behind the 3D layer (D297–D300): nothing for Theme (the 3D layer paints it), solid
 * chroma green with nothing on it, or the uploaded image or muted looping video under a 35% black
 * veil. A file that fails to load calls `onFail`, and the LED falls back to Theme.
 */
export function Backdrop({ look, onFail }: { look: Background; onFail: () => void }) {
  if (look.kind === "green") return <div className="absolute inset-0" style={{ background: CHROMA_GREEN }} />;
  if ((look.kind === "image" || look.kind === "video") && look.url) {
    return (
      <div className="absolute inset-0">
        {look.kind === "image"
          // eslint-disable-next-line @next/next/no-img-element -- an organiser upload; next/image adds nothing on a 1080p canvas
          ? <img src={look.url} alt="" className="size-full object-cover" onError={onFail} />
          : <video src={look.url} className="size-full object-cover" autoPlay muted loop playsInline onError={onFail} />}
        <div className="absolute inset-0 bg-black/35" />
      </div>
    );
  }
  return null;
}
```

`src/components/games/display/MuteToggle.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";

/** The LED's mute switch (D302): top-right, shown only while the mouse moves (the cursor is otherwise hidden). */
export function MuteToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const move = () => {
      setShown(true);
      clearTimeout(t);
      t = setTimeout(() => setShown(false), 2500);
    };
    window.addEventListener("mousemove", move);
    return () => { window.removeEventListener("mousemove", move); clearTimeout(t); };
  }, []);
  return (
    <button type="button" onClick={onToggle} aria-label={muted ? "Turn the display's sound on" : "Turn the display's sound off"}
      className={`absolute right-6 top-6 z-40 cursor-pointer rounded-full bg-black/70 px-5 py-3 text-xl font-bold text-white transition-opacity ${shown ? "opacity-100" : "pointer-events-none opacity-0"}`}>
      {muted ? "🔇 Sound off" : "🔊 Sound on"}
    </button>
  );
}
```

`src/components/games/display/TimerRing.tsx`:
```tsx
/** A draining ring with the seconds left in the middle (D303, D306). `left` and `total` are seconds. */
export function TimerRing({ left, total, size = 150 }: { left: number; total: number; size?: number }) {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const f = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.18)" strokeWidth={14} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--brand)" strokeWidth={14} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - f)} style={{ transition: "stroke-dashoffset 250ms linear" }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-game text-6xl tabular-nums text-white" suppressHydrationWarning>
        {Math.ceil(left)}
      </span>
    </div>
  );
}
```

`src/components/games/display/useSoundCues.ts`:
```ts
"use client";
import { useEffect, useRef } from "react";
import type { DisplayState } from "@/lib/games/wire";
import type { Synth } from "@/lib/games/sound";

/**
 * The LED's sound cues that follow the stage (D301): countdown ticks and the horn, the last three
 * seconds of a question, the whoosh of a reveal or a mosaic round, the drumroll under a reel, and
 * the fanfare on a winner screen. Once per stage key: a poll that changes nothing else never
 * replays a sound. The reels' clunks, the wheel's ticks and the card's lift and flip belong to
 * those scenes.
 */
export function useSoundCues(state: DisplayState, offset: number, synth: Synth) {
  const latest = useRef({ state, offset });
  useEffect(() => { latest.current = { state, offset }; });
  const key = state.stage.key;
  useEffect(() => {
    const { state: st, offset: off } = latest.current;
    const s = st.stage;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const now = Date.now() + off;
    const atServer = (ms: number, fn: () => void) => { if (ms - now >= -100) timers.push(setTimeout(fn, Math.max(0, ms - now))); };
    const after = (ms: number, fn: () => void) => { timers.push(setTimeout(fn, ms)); };
    switch (s.phase) {
      case "race_countdown":
        if (s.race) {
          for (let k = 3; k >= 1; k--) atServer(s.race.liveFrom - k * 1000, () => synth.play("tick"));
          atServer(s.race.liveFrom, () => synth.play("go"));
        }
        break;
      case "race_results": after(1600, () => synth.play("fanfare")); break;
      case "survival_question":
        if (s.question?.deadline) for (let k = 3; k >= 1; k--) atServer(s.question.deadline - k * 1000, () => synth.play("tick"));
        break;
      case "survival_reveal": after(1200, () => synth.play("whoosh")); break;
      case "survival_over": synth.play("fanfare"); break;
      case "draw_spinning": {
        const wheel = st.draw?.format === "wheel" && !st.draw.quick;
        if (s.endsAt && !wheel) synth.play("drumroll", s.endsAt - now);
        break;
      }
      case "draw_rounds": if ((st.draw?.mosaic?.round ?? 0) > 0) synth.play("whoosh"); break;
      case "draw_reveal": synth.play("fanfare"); break;
    }
    return () => timers.forEach(clearTimeout);
  }, [key, synth]);
}
```

- [ ] **Step 4: Frame, idle screen and the shell**

Replace `src/components/games/display/Frame.tsx`:
```tsx
"use client";
import { motion } from "motion/react";

/**
 * The LED's standard layout: a title on the left, one big fact on the right (a count, or a timer
 * ring), the screen's content below. The fact may be a clock, so it may differ at hydration.
 */
export function Frame({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col px-16 pb-12 pt-10">
      <header className="flex min-h-[150px] items-center justify-between gap-8">
        <motion.h1 initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
          className="truncate font-game text-6xl drop-shadow-[0_4px_16px_rgba(0,0,0,0.45)]">{title}</motion.h1>
        {right !== undefined && right !== null && (
          <div className="shrink-0 font-game text-6xl tabular-nums text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.45)]" suppressHydrationWarning>{right}</div>
        )}
      </header>
      <div className="min-h-0 flex-1 pt-4">{children}</div>
    </div>
  );
}
```

Replace `src/components/games/display/IdleScreen.tsx`:
```tsx
"use client";
import { motion } from "motion/react";
import { APP_NAME } from "@/lib/app-name";
import type { DisplayState } from "@/lib/games/wire";

/** Nothing on stage (D285, D298): the event's logo and name over the Theme background, and a nudge to have phones ready. */
export function IdleScreen({ event }: { event: DisplayState["event"] }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-10">
      {event.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- an organiser upload of unknown size; next/image adds nothing on a 1080p canvas
        <motion.img src={event.logoUrl} alt="" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="max-h-[260px] max-w-[900px] object-contain drop-shadow-[0_10px_40px_rgba(0,0,0,0.5)]" />
      )}
      <h1 className="max-w-[1700px] text-center font-game text-[110px] leading-none drop-shadow-[0_8px_30px_rgba(0,0,0,0.5)]">{event.name}</h1>
      <motion.p animate={{ opacity: [0.55, 1, 0.55] }} transition={{ repeat: Infinity, duration: 2.4 }} className="font-game text-5xl">Get ready…</motion.p>
      <p className="text-3xl opacity-70">Open {APP_NAME} on your phone to play</p>
    </div>
  );
}
```

Create `src/components/games/display/DisplayView.tsx`, moving the `Screen` switch out of `DisplayClient.tsx` into it:
```tsx
"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { DisplayState } from "@/lib/games/wire";
import type { Synth } from "@/lib/games/sound";
import { DEFAULT_BACKGROUND } from "@/lib/games/background";
import { gameFont } from "@/lib/games/font";
import { Backdrop } from "./Backdrop";
import { useSoundCues } from "./useSoundCues";
import { DrawScreen } from "./DrawScreen";
import { IdleScreen } from "./IdleScreen";
import { RaceScreen } from "./RaceScreen";
import { SurvivalScreen } from "./SurvivalScreen";

// three.js reaches only this page, and only in the browser (D293).
const Layer3D = dynamic(() => import("./three/Layer3D"), { ssr: false });

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * The LED's picture on the 1920×1080 canvas: background, 3D layer, the HTML screen on top, and
 * the logo in the corner on Theme. The same for the live display and the ?test self-test.
 */
export function DisplayView({ state, offset, synth }: { state: DisplayState; offset: number; synth: Synth }) {
  const [failed, setFailed] = useState<string | null>(null);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  useEffect(() => { setWebgl(hasWebGL()); }, []);
  useSoundCues(state, offset, synth);
  const look = failed !== null && state.look.url === failed ? DEFAULT_BACKGROUND : state.look;
  const idle = state.stage.phase === "idle";

  if (webgl === false) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 bg-black text-center">
        <p className="text-6xl font-extrabold">This display needs hardware graphics</p>
        <p className="text-3xl opacity-80">Open this link in Chrome, with hardware acceleration on.</p>
      </div>
    );
  }
  return (
    <div className={`${gameFont.variable} relative h-full w-full`} style={{ "--brand": state.event.colour } as React.CSSProperties}>
      <Backdrop look={look} onFail={() => setFailed(state.look.url)} />
      {webgl && <Layer3D state={state} offset={offset} synth={synth} theme={look.kind === "theme"} onLost={() => window.location.reload()} />}
      <div className="absolute inset-0"><Screen state={state} offset={offset} synth={synth} /></div>
      {look.kind === "theme" && !idle && state.event.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- an organiser upload; see IdleScreen
        <img src={state.event.logoUrl} alt="" className="absolute bottom-8 right-10 max-h-[70px] max-w-[260px] object-contain opacity-85" />
      )}
    </div>
  );
}

function Screen({ state, offset, synth }: { state: DisplayState; offset: number; synth: Synth }) {
  if (state.race) return <RaceScreen state={state} offset={offset} />;
  if (state.survival) return <SurvivalScreen state={state} offset={offset} />;
  if (state.draw) return <DrawScreen state={state} offset={offset} synth={synth} />;
  return <IdleScreen event={state.event} />;
}
```
(Task 16 rewrites `DrawScreen` with an optional `synth` prop; until then add `synth?: Synth` to its props so this compiles.) Check the old `Screen` in `DisplayClient.tsx` first and keep any branch it has that this one lacks.

Rewrite `src/components/games/display/DisplayClient.tsx` so the page chrome (start overlay, wake lock, mute) lives in an exported `DisplayShell`, and `DisplayClient` only adds the polling:
```tsx
"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { DisplayState } from "@/lib/games/wire";
import { displayInterval } from "@/lib/games/poll";
import { createSynth, readMuted, writeMuted } from "@/lib/games/sound";
import { usePoll } from "../usePoll";
import { DisplayView } from "./DisplayView";
import { MuteToggle } from "./MuteToggle";

const displayEvery = (s: DisplayState) => displayInterval(s.stage.phase);

const onResize = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};
const fitScale = () => Math.min(window.innerWidth / 1920, window.innerHeight / 1080);

/** Everything is laid out on a fixed 1920×1080 canvas (D284) and scaled to whatever the screen is. */
function Canvas1080({ children }: { children: React.ReactNode }) {
  const scale = useSyncExternalStore(onResize, fitScale, () => 1);
  return (
    <div className="absolute left-1/2 top-1/2 h-[1080px] w-[1920px]" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
      {children}
    </div>
  );
}

// (keep the existing useWakeLock function here unchanged)

const storage = () => { try { return window.localStorage; } catch { return null; } };

/**
 * The LED page around a state (D251, D284, D302): "Click to start display" (fullscreen, wake lock
 * and audio all need a click), the mute switch, and the picture. Used by the live display and by
 * the ?test self-test.
 */
export function DisplayShell({ state, offset }: { state: DisplayState; offset: number }) {
  const [started, setStarted] = useState(false);
  const synth = useMemo(() => createSynth(), []);
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    const m = readMuted(storage());
    synth.setMuted(m);
    setMuted(m);
  }, [synth]);
  useWakeLock(started);

  const start = () => {
    setStarted(true);
    synth.unlock();
    void document.documentElement.requestFullscreen?.().catch(() => {});
  };
  const toggle = () => {
    const m = !muted;
    setMuted(m);
    synth.setMuted(m);
    writeMuted(storage(), m);
  };

  return (
    <div className="fixed inset-0 cursor-none overflow-hidden bg-black text-white">
      <Canvas1080><DisplayView state={state} offset={offset} synth={synth} /></Canvas1080>
      {started && <MuteToggle muted={muted} onToggle={toggle} />}
      {!started && (
        <button type="button" onClick={start}
          className="absolute inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-4 bg-black/85">
          <span className="text-5xl font-extrabold">Click to start display</span>
          <span className="text-xl opacity-70">Goes full screen, keeps the screen awake and turns the sound on.</span>
        </button>
      )}
    </div>
  );
}

/**
 * The LED page (D251). It polls the full view (D260): four times a second during a race, once a
 * second otherwise. A reload redraws straight from the stage (D262).
 */
export function DisplayClient({ token, initial }: { token: string; initial: DisplayState }) {
  const { state, offset } = usePoll<DisplayState>(`/api/display/${token}/state`, initial, displayEvery, false);
  return <DisplayShell state={state} offset={offset} />;
}
```
Copy the file's existing `useWakeLock` into the marked place unchanged.

- [ ] **Step 5: Verify in the browser**

Run: `npx tsc --noEmit && npx vitest run` — Expected: PASS.
Create `.claude/launch.json` if it does not exist:
```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "dev", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 3000 }
  ]
}
```
Start it with the preview tool (`preview_start` name `dev`). Get `ecpkom`'s display token with the Supabase MCP (`select display_token from events where slug = 'ecpkom'`). Open `http://localhost:3000/display/<token>`, resize to 1600×900, click the start overlay. With nothing on stage, expect: the drifting Theme background in the event colour, the logo and name in the display font, "Get ready…" pulsing, no console errors (`read_console_messages`). Move the mouse: the sound button appears top-right. Take a screenshot.

- [ ] **Step 6: Commit**

```bash
git add src/components/games/display src/lib/games/views.ts tests/games-views.test.ts .claude/launch.json
git commit -m "feat(games): LED 3D layer, backgrounds, sound cues and mute"
```

---

### Task 14: Tap race on the LED

**Files:**
- Modify: `src/components/games/display/RaceScreen.tsx` (full rewrite)

**Interfaces:**
- Consumes: `DisplayLane` with `progress` and `initials` (Task 10); `Frame`, `TimerRing` (Task 13).

- [ ] **Step 1: Rewrite the race screen**

Replace `src/components/games/display/RaceScreen.tsx`:
```tsx
"use client";
import { AnimatePresence, motion } from "motion/react";
import { APP_NAME } from "@/lib/app-name";
import type { DisplayLane, DisplayState } from "@/lib/games/wire";
import { useServerNow } from "../usePoll";
import { Frame } from "./Frame";
import { TimerRing } from "./TimerRing";

type Race = NonNullable<DisplayState["race"]>;
const spring = { type: "spring", stiffness: 260, damping: 20 } as const;
const climb = { type: "spring", stiffness: 90, damping: 18 } as const;

/** The tap race on the LED (D268, D303–D305): lanes filling, 3-2-1-GO, vertical lanes, the podium. No tap counts (D304). */
export function RaceScreen({ state, offset }: { state: DisplayState; offset: number }) {
  const s = state.stage;
  const race = state.race!;
  const now = useServerNow(offset, 100, s.phase === "race_countdown" || s.phase === "race_live");
  const title = s.game?.title ?? "Tap race";

  if (s.phase === "race_lobby") return <Lobby title={title} lanes={race.lanes} />;

  if (s.phase === "race_countdown" && s.race) {
    const n = Math.max(1, Math.ceil((s.race.liveFrom - now) / 1000));
    return (
      <Frame title={title}>
        <div className="flex h-full items-center justify-center">
          <AnimatePresence mode="popLayout">
            <motion.span key={n} initial={{ scale: 2.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={spring}
              className="font-game text-[480px] leading-none text-white drop-shadow-[0_0_60px_var(--brand)]" suppressHydrationWarning>{n}</motion.span>
          </AnimatePresence>
        </div>
      </Frame>
    );
  }

  if (s.phase === "race_live" && s.race) {
    const left = Math.max(0, (s.race.liveUntil - now) / 1000);
    const sinceGo = now - s.race.liveFrom;
    return (
      <Frame title={title} right={<TimerRing left={left} total={s.race.duration_s} />}>
        <div className="relative h-full">
          <Lanes lanes={race.lanes} />
          <AnimatePresence>
            {sinceGo < 900 && (
              <motion.div key="go" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 2, opacity: 0 }}
                className="pointer-events-none absolute inset-0 flex items-center justify-center font-game text-[300px] text-white drop-shadow-[0_0_50px_var(--brand)]">GO!</motion.div>
            )}
          </AnimatePresence>
        </div>
      </Frame>
    );
  }

  return (
    <Frame title={`${title} — results`}>
      <Podium lanes={race.lanes} solo={race.solo} mvp={race.mvp} />
    </Frame>
  );
}

/** Lanes as cards, with each lane's latest joiners popping in (D305). The player count is not a tap count. */
function Lobby({ title, lanes }: { title: string; lanes: DisplayLane[] }) {
  const players = lanes.reduce((n, l) => n + l.players, 0);
  return (
    <Frame title={title} right={<span>{players} <span className="text-4xl opacity-75">{players === 1 ? "player" : "players"}</span></span>}>
      <div className="flex h-full flex-col items-center gap-8">
        <motion.p animate={{ scale: [1, 1.04, 1] }} transition={{ repeat: Infinity, duration: 1.8 }} className="font-game text-7xl drop-shadow-[0_6px_24px_rgba(0,0,0,0.5)]">Join on your phone!</motion.p>
        <p className="-mt-4 text-3xl opacity-80">Open {APP_NAME} → Games</p>
        <div className="flex max-w-[1760px] flex-wrap justify-center gap-5">
          {lanes.map((l) => (
            <motion.div layout key={l.key} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="w-[330px] rounded-3xl bg-black/40 p-5 ring-2 ring-white/15 backdrop-blur-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-game text-3xl">{l.label}</span>
                <span className="text-2xl tabular-nums opacity-70">{l.players}</span>
              </div>
              <div className="mt-4 flex min-h-12 flex-wrap gap-2">
                <AnimatePresence>
                  {l.initials.map((ini, i) => (
                    <motion.span key={`${ini}-${i}`} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring}
                      className="flex size-12 items-center justify-center rounded-full bg-[var(--brand)] text-lg font-extrabold">{ini}</motion.span>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/**
 * Vertical lanes racing bottom to top (D303), in a fixed order so columns grow instead of
 * swapping. The leader's column glows and wears a crown. Heights come from `progress`, which is
 * already scaled to 110% of the leader (progressOf), so nobody looks finished.
 */
function Lanes({ lanes }: { lanes: DisplayLane[] }) {
  const ordered = [...lanes].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const lead = lanes.reduce<DisplayLane | null>((best, l) => (l.progress > 0 && (!best || l.progress > best.progress) ? l : best), null);
  return (
    <div className="flex h-full items-stretch justify-center gap-5 px-6">
      {ordered.map((l) => {
        const leader = lead?.key === l.key;
        return (
          <div key={l.key} className="flex min-w-0 max-w-[150px] flex-1 flex-col items-center gap-3">
            <div className="relative w-full flex-1 rounded-[32px] bg-white/10">
              <motion.div className="absolute inset-x-0 bottom-0 rounded-[32px] bg-[var(--brand)]" initial={false}
                animate={{ height: `${l.progress * 100}%` }} transition={climb}
                style={{ boxShadow: leader ? "0 0 48px var(--brand)" : "none" }} />
              <motion.div className="absolute inset-x-0 flex justify-center" initial={false}
                animate={{ bottom: `calc(${l.progress * 100}% - 8px)` }} transition={climb}>
                <span className={`flex size-16 items-center justify-center rounded-full bg-white text-3xl shadow-xl ${leader ? "ring-8 ring-white/40" : ""}`}>{leader ? "👑" : "🏃"}</span>
              </motion.div>
            </div>
            <span className="w-full truncate text-center font-game text-2xl">{l.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** The podium rises 3rd, then 2nd, then 1st (D305); confetti follows from the 3D layer (celebrationDelay). */
function Podium({ lanes, solo, mvp }: { lanes: DisplayLane[]; solo: boolean; mvp: Race["mvp"] }) {
  const [first, second, third] = lanes;
  const rest = lanes.slice(3, 12);
  const step = (l: DisplayLane | undefined, height: number, medal: string, delay: number) =>
    l ? (
      <div className="flex w-[440px] flex-col items-center gap-4">
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...spring, delay: delay + 0.4 }} className="text-8xl">{medal}</motion.span>
        <motion.span initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: delay + 0.3 }} className="max-w-full truncate font-game text-6xl">{l.label}</motion.span>
        <motion.div initial={{ height: 0 }} animate={{ height }} transition={{ type: "spring", stiffness: 120, damping: 16, delay }}
          className="w-full rounded-t-3xl bg-[var(--brand)] shadow-[0_0_60px_var(--brand)]" />
      </div>
    ) : <div className="w-[440px]" />;
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 items-end justify-center gap-10">
        {step(second, 280, "🥈", 0.5)}{step(first, 400, "🥇", 1.0)}{step(third, 190, "🥉", 0)}
      </div>
      <div className="flex items-center justify-between gap-8 pt-8 text-3xl">
        {/* Separate spans, not a joined string: HTML would collapse the spaces between places. */}
        <div className="flex min-w-0 gap-10 overflow-hidden whitespace-nowrap opacity-75">
          {rest.map((l) => <span key={l.key}>{l.place}. {l.label}</span>)}
        </div>
        {mvp && !solo && <span className="shrink-0">⚡ Fastest tapper: <b>{mvp.name}</b></span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in the browser**

Run: `npx tsc --noEmit` — Expected: PASS.
On `ecpkom`: open the host link (`select host_token from events where slug = 'ecpkom'`) in a second tab at phone size, and an attendee's play page (any `ecpkom` attendee token) in a third. Open the Tap race by category, join from the phone tab, and watch the display tab: the lobby card gets the initials; Start shows 3-2-1 slamming in, then GO!, then vertical lanes climbing as you tap on the phone tab, with the timer ring draining; results show the podium rising 3rd→2nd→1st. No tap number anywhere on the LED (read the page text with `get_page_text` during the race and the results, and confirm no number other than places, player counts and seconds). Screenshot each phase.

- [ ] **Step 3: Commit**

```bash
git add src/components/games/display/RaceScreen.tsx
git commit -m "feat(games): vertical race lanes, slam countdown and a rising podium"
```

---

### Task 15: Last one standing, winner screens and confetti

**Files:**
- Modify: `src/components/games/display/QuestionBoard.tsx` (rewrite), `SurvivalScreen.tsx`, `WinnerCard.tsx`, `src/app/display/[token]/display.css`
- Create: `src/components/games/display/three/Confetti3D.tsx`
- Modify: `src/components/games/display/three/Layer3D.tsx`

**Interfaces:**
- Consumes: `optionStyles` (Task 3), `celebrationDelay` (Task 13), `confettiColours` (Task 2).
- Produces: `QuestionBoard` gains `green?: boolean`; `Confetti3D({ green, delayMs })`; `WinnerCard`/`JointWinners` keep their props; the CSS `Confetti` export is removed.

- [ ] **Step 1: Question board**

Replace `src/components/games/display/QuestionBoard.tsx`:
```tsx
"use client";
import { motion } from "motion/react";
import type { PublicQuestion } from "@/lib/games/views";
import { optionStyles } from "@/lib/games/views";
import { TimerRing } from "./TimerRing";

/**
 * A question on the LED (D276, D306): the question slides in, then four glossy tiles with colour
 * and shape; a draining timer ring; the room's split growing in at the lock; at the reveal the
 * wrong tiles shake and fade and the right one pulses.
 */
export function QuestionBoard({ q, now, answered, players, split, showTimer = false, green = false }: {
  q: PublicQuestion;
  now: number;
  answered?: number;
  players?: number;
  split?: number[] | null;
  showTimer?: boolean;
  green?: boolean;
}) {
  const styles = optionStyles(green);
  const left = q.deadline ? Math.max(0, (q.deadline - now) / 1000) : 0;
  const total = split ? Math.max(1, split.reduce((a, b) => a + b, 0)) : 1;
  const revealed = q.correct !== null;
  return (
    <div className="flex h-full flex-col gap-8">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-black/40 px-6 py-2 text-3xl font-bold">Question {q.no + 1} of {q.total}</span>
        {showTimer ? <TimerRing left={left} total={q.answer_s} /> : !revealed && <span className="font-game text-5xl">Time&apos;s up!</span>}
      </div>
      <motion.p key={q.no} initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 140, damping: 18 }}
        className="text-center font-game text-[76px] leading-tight drop-shadow-[0_6px_24px_rgba(0,0,0,0.5)]">{q.text}</motion.p>
      <div className="grid flex-1 grid-cols-2 gap-6">
        {q.options.map((o, i) => {
          const right = q.correct === i;
          const wrong = revealed && !right;
          return (
            <motion.div key={i} initial={{ opacity: 0, scale: 0.85 }}
              animate={wrong ? { opacity: 0.25, x: [0, -14, 14, -8, 8, 0], scale: 1 } : right ? { opacity: 1, scale: [1, 1.04, 1] } : { opacity: 1, scale: 1 }}
              transition={wrong ? { duration: 0.5 } : right ? { repeat: Infinity, duration: 1.2 } : { type: "spring", stiffness: 200, damping: 18, delay: 0.25 + i * 0.08 }}
              className={`relative flex items-center gap-6 overflow-hidden rounded-[32px] px-10 font-game text-6xl shadow-[inset_0_-10px_0_rgba(0,0,0,0.25),0_12px_30px_rgba(0,0,0,0.35)] ${right ? "ring-[10px] ring-white" : ""}`}
              style={{ background: styles[i].colour }}>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
              {split && (
                <motion.div className="absolute inset-y-0 left-0 bg-white/20" initial={{ width: 0 }}
                  animate={{ width: `${((split[i] ?? 0) / total) * 100}%` }} transition={{ duration: 0.8 }} />
              )}
              <span className="relative text-7xl">{styles[i].shape}</span>
              <span className="relative min-w-0 flex-1 truncate">{o}</span>
              {split && <span className="relative tabular-nums">{split[i] ?? 0}</span>}
              {right && <span className="relative">✓</span>}
            </motion.div>
          );
        })}
      </div>
      {showTimer && answered !== undefined && <p className="text-center text-4xl opacity-85">{answered} of {players ?? 0} answered</p>}
    </div>
  );
}
```

- [ ] **Step 2: Survival screen touches**

In `src/components/games/display/SurvivalScreen.tsx`:
- Add `const green = s.game?.green ?? false;` after `const title = ...` in `SurvivalScreen`, and pass `green={green}` to the `QuestionBoard` there. In `RevealSequence`, add the same line after its `const q = s.question!;` and pass `green={s.game?.green ?? false}` to its `QuestionBoard`.
- Lobby prompt: change its `<p>` classes to `"text-center font-game text-5xl drop-shadow-[0_6px_24px_rgba(0,0,0,0.5)]"`.
- Reveal header: change `className="text-5xl font-extrabold"` to `className="font-game text-5xl"`.
- In `RevealCounter`, import `motion` from `motion/react` and replace the returned `<span>` with:
```tsx
    <motion.span key={running ? "running" : "idle"} initial={running ? { scale: 1.4 } : false} animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 220, damping: 12, delay: running ? 2 : 0 }} className="font-game text-6xl tabular-nums">
      {running ? <>{from} → <span className="text-[var(--brand)]">{shown}</span> remain</> : `${from} in`}
    </motion.span>
```

- [ ] **Step 3: Winner screens**

In `src/components/games/display/WinnerCard.tsx`: delete `COLOURS`, `PIECES` and the `Confetti` function, and the `<Confetti />` lines in both components (confetti is now 3D). Add `import { motion } from "motion/react";`. Replace `WinnerCard`:
```tsx
/** The one place the LED shows a full name and company (D273): someone is walking on stage. */
export function WinnerCard({ label, name, company, prize }: { label: string; name: string; company: string; prize?: string | null }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-6 px-16 text-center">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-full w-[1100px] -translate-x-1/2 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.28),transparent_65%)]" />
      <motion.div initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="font-game text-5xl uppercase tracking-[0.2em] text-white/90">{label}</motion.div>
      <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 180, damping: 14, delay: 0.15 }}
        className="max-w-[1780px] font-game text-[150px] leading-none drop-shadow-[0_8px_40px_var(--brand)]">{name}</motion.div>
      {company && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.85 }} transition={{ delay: 0.5 }} className="text-5xl">{company}</motion.div>}
      {prize && (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 220, damping: 12, delay: 0.7 }}
          className="mt-6 rounded-full bg-[var(--brand)] px-14 py-5 font-game text-6xl shadow-[0_0_60px_var(--brand)]">{prize}</motion.div>
      )}
    </div>
  );
}
```
In `JointWinners`, change the title `div`'s classes `text-5xl font-bold` to `font-game text-5xl`, and replace each grid cell `<div key={from + i} ...>` with a `motion.div` that keeps the same `key`, `className` and `style` and adds `initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(1.5, i * 0.04) }}`; change the name `div`'s `font-extrabold` to `font-game`.

In `src/app/display/[token]/display.css`, delete the `.confetti` rule and the `@keyframes confetti-fall` block.

- [ ] **Step 4: 3D confetti**

`src/components/games/display/three/Confetti3D.tsx`:
```tsx
"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { confettiColours } from "@/lib/games/background";
import { useAnimating } from "./useAnimating";

const COUNT = 260;

// Fixed, index-based scatter: the same shower on every render and reload (no Math.random in render).
const PIECES = Array.from({ length: COUNT }, (_, i) => ({
  x: (((i * 373) % 1000) / 1000 - 0.5) * 1920,
  y: 560 + ((i * 617) % 1000) * 1.1,
  z: (i * 53) % 200,
  vy: 180 + ((i * 97) % 220),
  vx: (((i * 131) % 100) / 100 - 0.5) * 60,
  spin: 2 + ((i * 71) % 40) / 10,
  rx: (i * 0.7) % Math.PI,
  ry: (i * 1.3) % Math.PI,
}));

/**
 * Confetti for a winner screen (D305, D306): tumbling pieces over the whole canvas, starting
 * `delayMs` after it mounts; no green in green mode (D299). Remounted per stage key.
 */
export function Confetti3D({ green, delayMs = 0 }: { green: boolean; delayMs?: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  // Mutated every frame, so a ref (not a memo): this mount's own copy of the scatter.
  const pieces = useRef(PIECES.map((p) => ({ ...p })));
  const colours = useMemo(() => confettiColours(green), [green]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const born = useRef<number | null>(null);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const c = new THREE.Color();
    for (let i = 0; i < COUNT; i++) m.setColorAt(i, c.set(colours[i % colours.length]));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [colours]);
  useAnimating(true, 60);
  useFrame(({ clock }, dt) => {
    const m = mesh.current;
    if (!m) return;
    if (born.current === null) born.current = clock.elapsedTime;
    const on = (clock.elapsedTime - born.current) * 1000 >= delayMs;
    pieces.current.forEach((p, i) => {
      if (on) {
        p.y -= p.vy * dt;
        p.x += p.vx * dt;
        p.rx += p.spin * dt;
        p.ry += p.spin * 0.7 * dt;
        if (p.y < -600) p.y += 1300;
      }
      dummy.position.set(p.x, on ? p.y : 5000, p.z);
      dummy.rotation.set(p.rx, p.ry, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]}>
      <planeGeometry args={[16, 26]} />
      <meshBasicMaterial side={THREE.DoubleSide} />
    </instancedMesh>
  );
}
```
In `three/Layer3D.tsx`, import `Confetti3D` and `celebrationDelay` (from `@/lib/games/views`), and add inside `<Stage3D>` after the backdrop:
```tsx
      {celebrationDelay(state.stage.phase) !== null && (
        <Confetti3D key={state.stage.key} green={state.look.kind === "green"} delayMs={celebrationDelay(state.stage.phase) ?? 0} />
      )}
```

- [ ] **Step 5: Verify in the browser**

Run: `npx tsc --noEmit && npx vitest run` — Expected: PASS.
On `ecpkom`, run "KOM quiz: last one standing" from the host tab with one phone joined: the question slides in, tiles pop with shapes ▲◆●■, the timer ring drains with ticks in the last 3 s; at the lock the split bars grow; Reveal shakes the wrong tiles and pulses the right one; the mosaic ripple runs; at the end the winner card springs in with 3D confetti. Then set the quiz's background to Green screen — temporarily with SQL (`update games set config = jsonb_set(config, '{background}', '{"kind":"green","url":null}') where title = 'KOM quiz: last one standing' and event_id = (select id from events where slug = 'ecpkom')`; Task 22 adds the editor control) — reopen, and confirm the background is flat #00B140 with no logo, the D tile is purple, and the confetti has no green. Set it back to Theme (`'{"kind":"theme","url":null}'`). Screenshot each.

- [ ] **Step 6: Commit**

```bash
git add src/components/games/display "src/app/display/[token]/display.css"
git commit -m "feat(games): glossy quiz board, spring winner cards and 3D confetti"
```

---

### Task 16: The draw's slot machine and ready screens

**Files:**
- Create: `src/components/games/display/three/SlotReels.tsx`
- Modify: `src/components/games/display/DrawScreen.tsx` (full rewrite), `three/Layer3D.tsx`

**Interfaces:**
- Consumes: `reelLayout`, `MAX_REELS`, `toWorld` (Task 7); `easeOutQuart` (Task 7); `DisplayDraw` (Task 10); `textTexture`, `useFontReady`, `useAnimating` (Task 13).
- Produces: `SlotReels({ targets, sample, endsAt, spinMs, offset, synth })`; `DrawScreen({ state, offset, synth })`; `DrawScene3D({ state, offset, synth })` in Layer3D (extended by Tasks 17 and 18).

- [ ] **Step 1: Slot reels**

`src/components/games/display/three/SlotReels.tsx`:
```tsx
"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { Person } from "@/lib/games/wire";
import type { Synth } from "@/lib/games/sound";
import { reelLayout, toWorld, type Box } from "@/lib/games/layout";
import { easeOutQuart } from "@/lib/games/wheel";
import { textTexture, useFontReady } from "./textTexture";
import { useAnimating } from "./useAnimating";

const FACES = 12;
const STAGGER_MS = 350;
const TAU = Math.PI * 2;

/**
 * One reel per winner (D313): a drum of name faces that spins and eases to a stop with its winner
 * at the front, reels stopping left to right, the last exactly when the spin ends. A clunk as each
 * reel lands. The winners arrive with the spin (D312); the other faces are names from the pool.
 */
export function SlotReels({ targets, sample, endsAt, spinMs, offset, synth }: {
  targets: Person[]; sample: Person[]; endsAt: number; spinMs: number; offset: number; synth: Synth;
}) {
  const boxes = reelLayout(targets.length);
  const last = targets.length - 1;
  useAnimating(true, 60);
  return (
    <>
      {targets.map((t, j) => (
        <Reel key={t.id} box={boxes[j]} target={t} names={sample.filter((p) => p.id !== t.id)}
          stopAt={endsAt - (last - j) * STAGGER_MS} spinMs={Math.max(800, spinMs - (last - j) * STAGGER_MS)} offset={offset} synth={synth} />
      ))}
    </>
  );
}

function Reel({ box, target, names, stopAt, spinMs, offset, synth }: {
  box: Box; target: Person; names: Person[]; stopAt: number; spinMs: number; offset: number; synth: Synth;
}) {
  const ready = useFontReady();
  const faceH = box.h * 0.62;
  const radius = (faceH * FACES) / TAU;
  const turns = Math.max(3, Math.round(spinMs / 700));
  const drum = useRef<THREE.Group>(null);
  const landed = useRef(false);
  const textures = useMemo(() => {
    if (!ready) return [];
    const size = Math.min(faceH * 0.55, 150);
    return Array.from({ length: FACES }, (_, i) => {
      const p = i === 0 ? target : names.length ? names[(i - 1) % names.length] : target;
      return textTexture(box.w, faceH, [
        { text: p.first || p.initials, size, colour: "#ffffff" },
        { text: p.initials, size: size * 0.4, colour: "#ffffff", alpha: 0.7 },
      ], { background: i % 2 ? "#1c1c24" : "#262632" });
    });
  }, [ready, target, names, box.w, faceH]);
  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures]);
  useFrame(() => {
    const g = drum.current;
    if (!g) return;
    const p = Math.min(1, Math.max(0, 1 - (stopAt - (Date.now() + offset)) / spinMs));
    // Face i sits at angle i·τ/FACES; turning the drum by θ brings face θ to the front, so whole
    // turns land face 0 — the winner — at the front.
    g.rotation.x = turns * TAU * easeOutQuart(p);
    if (p >= 1 && !landed.current) {
      landed.current = true;
      synth.play("clunk");
    }
  });
  const [x, y] = toWorld(box.x, box.y);
  return (
    <group position={[x, y, -radius]}>
      <group ref={drum}>
        {textures.map((tex, i) => {
          const a = (i * TAU) / FACES;
          return (
            <mesh key={i} position={[0, radius * Math.sin(a), radius * Math.cos(a)]} rotation={[-a, 0, 0]}>
              <planeGeometry args={[box.w, faceH]} />
              <meshBasicMaterial map={tex} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}
```

- [ ] **Step 2: The draw's 3D scene selector**

In `three/Layer3D.tsx`, add (and render `<DrawScene3D state={state} offset={offset} synth={synth} />` inside `<Stage3D>` after the backdrop; the component now needs the `offset` and `synth` props it was given):
```tsx
import { MAX_REELS } from "@/lib/games/layout";
import { SlotReels } from "./SlotReels";

/** Which 3D draw scene is on (D313–D317). Tasks 17 and 18 add the wheel and the card table. */
function DrawScene3D({ state, offset, synth }: { state: DisplayState; offset: number; synth: Synth }) {
  const s = state.stage;
  const d = state.draw;
  if (!d) return null;
  if (s.phase === "draw_spinning" && d.targets && d.spinMs && s.endsAt) {
    const wheel = d.format === "wheel" && !d.quick;
    if (!wheel && d.targets.length <= MAX_REELS) {
      return <SlotReels key={s.key} targets={d.targets} sample={d.sample} endsAt={s.endsAt} spinMs={d.spinMs} offset={offset} synth={synth} />;
    }
  }
  return null;
}
```

- [ ] **Step 3: The draw's HTML screens**

Replace `src/components/games/display/DrawScreen.tsx`:
```tsx
"use client";
import { motion } from "motion/react";
import type { DisplayState, Person } from "@/lib/games/wire";
import type { Synth } from "@/lib/games/sound";
import { MAX_REELS, reelLayout } from "@/lib/games/layout";
import { useServerNow } from "../usePoll";
import { Frame } from "./Frame";
import { JointWinners, WinnerCard } from "./WinnerCard";

/**
 * The lucky draw on the LED (D279–D282, D310–D319): the HTML over the 3D scenes — titles, the
 * frames round the reels, the wheel's caption, the mosaic, the card round's prompts, and the
 * winner cards.
 */
export function DrawScreen({ state, offset }: { state: DisplayState; offset: number; synth?: Synth }) {
  const s = state.stage;
  const d = state.draw!;
  const title = s.game?.title ?? "Lucky draw";
  const now = useServerNow(offset, 100, s.phase === "draw_spinning");

  if (s.phase === "draw_ready") {
    return (
      <Frame title={title} right={`${d.pool} in the draw`}>
        <div className="flex h-full flex-col items-center justify-center gap-8">
          {d.prize ? (
            <>
              <p className="font-game text-5xl opacity-85">Next up</p>
              <motion.p key={d.prize} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 180, damping: 14 }}
                className="line-clamp-4 max-w-[1700px] break-words text-center font-game text-[150px] leading-none drop-shadow-[0_8px_40px_var(--brand)]">{d.prize}</motion.p>
            </>
          ) : <p className="font-game text-8xl">All prizes drawn 🎉</p>}
        </div>
      </Frame>
    );
  }

  if (s.phase === "draw_spinning") {
    const targets = d.targets ?? [];
    return (
      <Frame title={title} right={d.prize ?? ""}>
        {targets.length > MAX_REELS
          ? <Cascade people={targets} endsAt={s.endsAt} now={now} />
          : <ReelFrames count={targets.length} />}
      </Frame>
    );
  }

  const winners = d.winners ?? [];
  if (s.phase !== "draw_reveal") return null;
  if (winners.length === 0) {
    return <Frame title={title}><div className="flex h-full items-center justify-center font-game text-7xl">No one left to draw</div></Frame>;
  }
  if (winners.length === 1) return <WinnerCard label="Winner" name={winners[0].name} company={winners[0].company} prize={d.prize} />;
  return <JointWinners title="Winners" winners={winners} prize={d.prize} />;
}

/**
 * The window round each 3D reel (D313), in LED pixels: a bright border, and fades top and bottom
 * so the names roll in and out. Frame's content box is not positioned, so `absolute inset-0`
 * here is the whole 1920×1080 screen layer — the same pixels reelLayout and the 3D reels use.
 */
function ReelFrames({ count }: { count: number }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {reelLayout(count).map((b, i) => (
        <div key={i} className="absolute overflow-hidden rounded-[28px] ring-8 ring-[var(--brand)] shadow-[0_0_60px_var(--brand)]"
          style={{ left: b.x - b.w / 2, top: b.y - b.h / 2, width: b.w, height: b.h }}>
          <div className="absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-black/80 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black/80 to-transparent" />
        </div>
      ))}
    </div>
  );
}

/** More winners than reels (D313): the names cascade into a grid over the spin. */
function Cascade({ people, endsAt, now }: { people: Person[]; endsAt: number | null; now: number }) {
  const left = endsAt === null ? 0 : Math.max(0, endsAt - now);
  return (
    <div className="grid h-full content-center gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(8, Math.ceil(Math.sqrt(people.length * 2)))}, minmax(0, 1fr))` }}>
      {people.map((p, i) => (
        <motion.div key={p.id} initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: (i / people.length) * Math.max(0.5, left / 1000 - 0.5) }}
          className="truncate rounded-2xl bg-black/40 px-4 py-3 text-center font-game text-3xl">{p.first} {p.initials}</motion.div>
      ))}
    </div>
  );
}
```
Keep `Frame`'s content box unpositioned (no `relative` on it): `ReelFrames`, the wheel caption and the card round's captions all position against the whole screen layer. Check at the browser step that the frames sit exactly over the 3D reels.

- [ ] **Step 4: Verify in the browser**

Run: `npx tsc --noEmit` — Expected: PASS.
On `ecpkom`, the "KOM lucky draw" is a slot machine (the default). Open it from the host tab: the LED shows "Next up" with the prize. Press Draw 1: one wide reel spins for 6 s with a drumroll and lands on the name the host tab shows, with a clunk, then the winner card and confetti. Press Present, then "Draw all remaining" on a prize with 2+ left: several reels stop left to right. Screenshot the spin mid-way and at the stop. Press "Not here" on a winner: a quick 3 s reel draws the replacement.

- [ ] **Step 5: Commit**

```bash
git add src/components/games/display
git commit -m "feat(games): 3D slot reels for the lucky draw"
```

---

### Task 17: Wheel of names

**Files:**
- Create: `src/components/games/display/three/Wheel.tsx`
- Modify: `three/Layer3D.tsx`, `DrawScreen.tsx`

**Interfaces:**
- Consumes: `sliceAt`, `landingAngle`, `easeOutQuart`, `canTick`, `WHEEL_NAMED_MAX` (Task 7); `GAME_FAMILY`, `useFontReady`, `useAnimating` (Task 13).
- Produces: `Wheel({ people, targetId, endsAt, spinMs, offset, synth, colour })`; `wheelLabel(p: Person): string`.

- [ ] **Step 1: The wheel**

`src/components/games/display/three/Wheel.tsx`:
```tsx
"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { Person } from "@/lib/games/wire";
import type { Synth } from "@/lib/games/sound";
import { canTick, easeOutQuart, landingAngle, sliceAt, WHEEL_NAMED_MAX } from "@/lib/games/wheel";
import { GAME_FAMILY, useFontReady } from "./textTexture";
import { useAnimating } from "./useAnimating";

const RADIUS = 440;

/** A slice's name: first name and surname initial ("Priya R."). */
export function wheelLabel(p: Person): string {
  return p.initials.length > 1 ? `${p.first} ${p.initials.slice(1)}.` : p.first || p.initials;
}

/**
 * The wheel's face: one slice per person, clockwise from the top (the pointer) to match sliceAt,
 * alternating shades of the event colour. Names only up to WHEEL_NAMED_MAX slices (D314).
 */
function wheelTexture(people: Person[], colour: string): THREE.CanvasTexture {
  const size = 2048;
  const c = size / 2;
  const r = c - 4;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const n = people.length;
  const step = (Math.PI * 2) / n;
  const base = new THREE.Color(colour);
  const shades = [
    base.clone().lerp(new THREE.Color("#ffffff"), 0.18),
    base.clone().lerp(new THREE.Color("#000000"), 0.3),
    base.clone().lerp(new THREE.Color("#000000"), 0.55),
  ].map((x) => `#${x.getHexString()}`);
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + i * step;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, r, a0, a0 + step);
    ctx.closePath();
    // An odd count would put two equal shades side by side at the seam: the last slice takes a third.
    ctx.fillStyle = n % 2 === 1 && i === n - 1 ? shades[2] : shades[i % 2];
    ctx.fill();
  }
  if (n <= WHEEL_NAMED_MAX) {
    const font = Math.max(20, Math.min(72, r * step * 0.5));
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = `800 ${font}px ${GAME_FAMILY}`;
    for (let i = 0; i < n; i++) {
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(-Math.PI / 2 + (i + 0.5) * step);
      ctx.fillText(wheelLabel(people[i]), r - 36, 0, r * 0.72);
      ctx.restore();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * The wheel of names (D314): every eligible name, one slice each, tilted towards the room. With a
 * target it spins for the spin time and eases to a stop with the target under the pointer,
 * ticking as slices pass (at most 30 a second). Without one it rests (the ready screen).
 */
export function Wheel({ people, targetId, endsAt, spinMs, offset, synth, colour }: {
  people: Person[]; targetId: string | null; endsAt: number | null; spinMs: number | null; offset: number; synth: Synth; colour: string;
}) {
  const ready = useFontReady();
  const n = people.length;
  const texture = useMemo(() => (ready && n > 0 ? wheelTexture(people, colour) : null), [ready, people, colour, n]);
  useEffect(() => () => texture?.dispose(), [texture]);
  const disc = useRef<THREE.Mesh>(null);
  const lastSlice = useRef(-1);
  const lastTick = useRef(0);
  const target = targetId ? people.findIndex((p) => p.id === targetId) : -1;
  const spinning = target >= 0 && endsAt !== null && spinMs !== null && spinMs > 0;
  const turns = Math.max(4, Math.round((spinMs ?? 6000) / 1000));
  // Where in the slice the pointer ends: varied by target so stops do not all look alike.
  const total = spinning ? landingAngle(target, n, turns, 0.3 + 0.4 * (((target * 7919) % 100) / 100)) : 0;
  useAnimating(spinning, 60);
  useFrame(() => {
    const d = disc.current;
    if (!d || n === 0) return;
    let angle = 0;
    if (spinning) {
      const p = Math.min(1, Math.max(0, 1 - (endsAt! - (Date.now() + offset)) / spinMs!));
      angle = total * easeOutQuart(p);
    }
    d.rotation.z = -angle;
    const s = sliceAt(angle, n);
    if (spinning && s !== lastSlice.current) {
      lastSlice.current = s;
      const t = performance.now();
      if (canTick(lastTick.current, t)) {
        lastTick.current = t;
        synth.play("slice");
      }
    }
  });
  return (
    <group position={[0, -70, 0]} rotation={[-0.32, 0, 0]}>
      <mesh position={[0, 0, -6]}>
        <circleGeometry args={[RADIUS + 24, 128]} />
        <meshStandardMaterial color={colour} metalness={0.4} roughness={0.35} />
      </mesh>
      <mesh ref={disc}>
        <circleGeometry args={[RADIUS, 256]} />
        {texture ? <meshBasicMaterial map={texture} /> : <meshBasicMaterial color={colour} />}
      </mesh>
      <mesh position={[0, 0, 6]}>
        <circleGeometry args={[56, 64]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, RADIUS + 30, 24]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[30, 70, 3]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}
```

- [ ] **Step 2: Wire it in**

In `three/Layer3D.tsx` `DrawScene3D`: import `Wheel`, and before `return null` at the end add:
```tsx
  if (d.format === "wheel" && d.wheel && (s.phase === "draw_ready" || s.phase === "draw_spinning")) {
    const spin = s.phase === "draw_spinning" && !d.quick;
    return (
      <Wheel key={spin ? s.key : "resting"} people={d.wheel} targetId={spin ? d.targets?.[0]?.id ?? null : null}
        endsAt={spin ? s.endsAt : null} spinMs={spin ? d.spinMs : null} offset={offset} synth={synth} colour={state.event.colour} />
    );
  }
```
In `DrawScreen.tsx`:
- In the `draw_ready` branch, when `d.format === "wheel"`, return instead a `Frame` with the same title and `right`, whose child is `<p className="absolute bottom-16 left-0 right-0 text-center font-game text-5xl">{d.prize ? `Spinning for ${d.prize}` : "All prizes drawn 🎉"}</p>` (the wheel itself is 3D).
- In the `draw_spinning` branch, when `d.format === "wheel" && !d.quick`, return a `Frame` whose child is this landed-name overlay (the winner's name enlarges once the wheel stops, D314):
```tsx
          {s.endsAt !== null && now >= s.endsAt && d.targets?.[0] && (
            <motion.div initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14 }}
              className="absolute inset-x-0 bottom-16 text-center font-game text-[120px] leading-none drop-shadow-[0_8px_40px_var(--brand)]">
              {d.targets[0].first} {d.targets[0].initials}
            </motion.div>
          )}
```

- [ ] **Step 3: Verify in the browser**

Run: `npx tsc --noEmit` — Expected: PASS.
Switch the KOM draw to the wheel with SQL (`update games set config = config || '{"format":"wheel"}' where title = 'KOM lucky draw' and event_id = (select id from events where slug = 'ecpkom')`; Task 22 adds the editor control). Open it on the host: the LED shows the resting wheel with all 37 names (≤ 60, so named), tilted, with the pointer at the top. Draw 1: it spins ~6 s with ticking and stops with the host tab's winner under the pointer (read the slice under the pointer off the screenshot), the name enlarges, then the winner card. Confirm the host console offers only "Draw 1" for the wheel (Task 19 changes the label). Screenshot mid-spin and at the stop.

- [ ] **Step 4: Commit**

```bash
git add src/components/games/display
git commit -m "feat(games): 3D wheel of names"
```

---

### Task 18: Mosaic elimination and the card round on the LED

**Files:**
- Create: `src/components/games/display/MosaicDraw.tsx`, `src/components/games/display/three/CardTable.tsx`
- Modify: `DrawScreen.tsx`, `three/Layer3D.tsx`

**Interfaces:**
- Consumes: `Mosaic` (existing); `cardLayout`, `toWorld` (Task 7); `CardView` (Task 6); `textTexture`, `useFontReady`, `useAnimating` (Task 13).
- Produces: `MosaicDraw({ title, prize, mosaic, seed })`; `CardTable({ cards, picked, revealing, synth, colour })`.

- [ ] **Step 1: Mosaic elimination**

`src/components/games/display/MosaicDraw.tsx`:
```tsx
"use client";
import { useMemo } from "react";
import { motion } from "motion/react";
import type { DisplayDraw } from "@/lib/games/wire";
import { Frame } from "./Frame";
import { Mosaic } from "./Mosaic";

/**
 * Mosaic elimination (D315): the whole frozen pool as tiles; each round, the tiles no longer
 * standing fade out in a seeded ripple (the D275 mosaic). Tiles already out stay dark. The
 * server sends only who stands this round, so the winners cannot be spotted early.
 */
export function MosaicDraw({ title, prize, mosaic, seed }: { title: string; prize: string | null; mosaic: NonNullable<DisplayDraw["mosaic"]>; seed: string }) {
  const dark = useMemo(() => {
    const standing = new Set(mosaic.survivorIds);
    return new Set(mosaic.people.filter((p) => !standing.has(p.id)).map((p) => p.id));
  }, [mosaic]);
  return (
    <Frame title={title} right={<span>Round {mosaic.round} <span className="text-4xl opacity-75">of {mosaic.rounds}</span></span>}>
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <span className="font-game text-4xl opacity-90">{prize ? `Drawing for ${prize}` : ""}</span>
          <motion.span key={mosaic.survivorIds.length} initial={{ scale: 1.5 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 220, damping: 12, delay: 2 }}
            className="font-game text-6xl tabular-nums text-white drop-shadow-[0_0_30px_var(--brand)]">{mosaic.survivorIds.length} left</motion.span>
        </div>
        <div className="min-h-0 flex-1">
          <Mosaic key={mosaic.round} people={mosaic.people} darkIds={dark} darken seed={`${seed}:${mosaic.round}`} height={820} />
        </div>
      </div>
    </Frame>
  );
}
```
In `DrawScreen.tsx`, import `MosaicDraw` and, before the `draw_ready` branch, add:
```tsx
  if (s.phase === "draw_rounds" && d.mosaic) return <MosaicDraw title={title} prize={d.prize} mosaic={d.mosaic} seed={s.key} />;
```

- [ ] **Step 2: The card table**

`src/components/games/display/three/CardTable.tsx`:
```tsx
"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { CardView } from "@/lib/games/cards";
import type { Synth } from "@/lib/games/sound";
import { cardLayout, toWorld, type Box } from "@/lib/games/layout";
import { textTexture, useFontReady } from "./textTexture";
import { useAnimating } from "./useAnimating";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** The reveal's timeline (D317), in ms from the flip phase starting: glow and lift, fly to the centre, flip. */
export const LIFT_MS = 500;
export const FLY_END_MS = 1300;
export const FLIP_END_MS = 2000;

/**
 * The card round's table (D317): the cards still face down, numbered, bobbing gently in their
 * fixed places; taken cards are gone. When `revealing`, card `picked` glows and lifts, flies to
 * the centre, grows and flips to show its prize, with a lift, a flip and a fanfare.
 */
export function CardTable({ cards, picked, revealing, synth, colour }: { cards: CardView[]; picked: number | null; revealing: boolean; synth: Synth; colour: string }) {
  const boxes = cardLayout(cards.length);
  const ready = useFontReady();
  useAnimating(true, revealing ? 60 : 30);
  return (
    <>
      {cards.map((c, i) => {
        const active = revealing && c.no === picked;
        if (c.taken && !active) return null;
        return <Card key={c.no} card={c} box={boxes[i]} active={active} ready={ready} synth={synth} colour={colour} />;
      })}
    </>
  );
}

function Card({ card, box, active, ready, synth, colour }: { card: CardView; box: Box; active: boolean; ready: boolean; synth: Synth; colour: string }) {
  const mesh = useRef<THREE.Mesh>(null);
  const back = useMemo(() => (ready ? textTexture(box.w, box.h, [
    { text: String(card.no), size: box.h * 0.42, colour: "#ffffff" },
  ], { background: colour, radius: 18 }) : null), [ready, card.no, box.w, box.h, colour]);
  const face = useMemo(() => (ready && card.prize ? textTexture(box.w, box.h, [
    { text: "YOU WIN", size: box.h * 0.09, colour: "#6b7280" },
    { text: card.prize, size: box.h * 0.17, colour: "#111827" },
  ], { background: "#ffffff", radius: 18 }) : null), [ready, card.prize, box.w, box.h]);
  useEffect(() => () => { back?.dispose(); face?.dispose(); }, [back, face]);
  const materials = useMemo(() => {
    const side = new THREE.MeshStandardMaterial({ color: colour, emissive: new THREE.Color(colour), emissiveIntensity: 0 });
    // BoxGeometry faces: +x, −x, +y, −y, +z (towards the room: the numbered back), −z (the prize).
    return [side, side, side, side,
      new THREE.MeshStandardMaterial(back ? { map: back } : { color: colour }),
      new THREE.MeshStandardMaterial(face ? { map: face } : { color: "#ffffff" })];
  }, [back, face, colour]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  const [x, y] = toWorld(box.x, box.y);
  const start = useRef<number | null>(null);
  const played = useRef({ lift: false, flip: false, fanfare: false });
  const grow = Math.min(2.4, 560 / box.h);

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime * 1000;
    if (!active) {
      m.position.set(x, y + Math.sin(t / 700 + card.no) * 4, 0);
      m.rotation.set(0, 0, 0);
      m.scale.setScalar(1);
      return;
    }
    if (start.current === null) start.current = t;
    const e = t - start.current;
    const lift = clamp01(e / LIFT_MS);
    const fly = ease(clamp01((e - LIFT_MS) / (FLY_END_MS - LIFT_MS)));
    const flip = ease(clamp01((e - FLY_END_MS) / (FLIP_END_MS - FLY_END_MS)));
    m.position.set(x * (1 - fly), y * (1 - fly) - 30 * fly, 120 * lift + 80 * fly);
    m.rotation.set(0, Math.PI * flip, 0);
    m.scale.setScalar(1 + fly * (grow - 1));
    (materials[0] as THREE.MeshStandardMaterial).emissiveIntensity = lift * (0.7 - 0.4 * flip) + 0.15 * Math.sin(e / 120) * lift;
    const p = played.current;
    if (!p.lift) { p.lift = true; synth.play("lift"); }
    if (e >= FLY_END_MS && !p.flip) { p.flip = true; synth.play("flip"); }
    if (e >= FLIP_END_MS && !p.fanfare) { p.fanfare = true; synth.play("fanfare"); }
  });

  return (
    <mesh ref={mesh} material={materials}>
      <boxGeometry args={[box.w, box.h, 10]} />
    </mesh>
  );
}
```
In `three/Layer3D.tsx` `DrawScene3D`, import `CardTable` and, before the final `return null`, add:
```tsx
  if (d.cards && (s.phase === "draw_ready" || s.phase === "draw_card_pick" || s.phase === "draw_card_reveal")) {
    const revealing = s.phase === "draw_card_reveal";
    return <CardTable key={revealing ? s.key : "table"} cards={d.cards.slots} picked={d.cards.picked} revealing={revealing} synth={synth} colour={state.event.colour} />;
  }
```

- [ ] **Step 3: The card round's HTML**

In `DrawScreen.tsx`, add `const FLIP_END_MS = 2000; // keep equal to CardTable's FLIP_END_MS` at the top. Do not import it from `./three/CardTable`: that would pull three.js into the page bundle outside the dynamic import (Global Constraints). Then, after the `draw_rounds` line, add:
```tsx
  if (d.format === "cards" && d.cards && s.phase !== "draw_spinning" && s.phase !== "draw_reveal") {
    const left = d.cards.slots.filter((c) => !c.taken).length;
    const who = d.cards.participant;
    const picked = d.cards.slots.find((c) => c.no === d.cards!.picked);
    if (s.phase === "draw_card_pick" && who) {
      return (
        <Frame title="Pick a card!" right={`${left} left`}>
          <motion.p initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            className="-mt-4 text-center font-game text-7xl drop-shadow-[0_6px_24px_rgba(0,0,0,0.5)]">{who.name}</motion.p>
        </Frame>
      );
    }
    if (s.phase === "draw_card_reveal" && who && picked?.prize) {
      return (
        <Frame title={title}>
          <motion.p initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: FLIP_END_MS / 1000 }}
            className="absolute inset-x-0 bottom-14 text-center font-game text-6xl drop-shadow-[0_6px_24px_rgba(0,0,0,0.6)]">
            {who.name} wins {picked.prize}
          </motion.p>
        </Frame>
      );
    }
    return (
      <Frame title={title} right={`${left} ${left === 1 ? "card" : "cards"} left`}>
        {left === 0 && <div className="flex h-full items-center justify-center font-game text-8xl">All cards dealt 🎉</div>}
      </Frame>
    );
  }
```
And in the `draw_spinning` branch, use the title `d.format === "cards" ? "Who picks next?" : title`.

- [ ] **Step 4: Verify in the browser**

Run: `npx tsc --noEmit && npx vitest run` — Expected: PASS.
The host console's Next round and card grid arrive in Task 19, so run this step's host presses after Task 19 if you are working in order (commit this task first, then come back to this check).
Mosaic: `update games set config = config || '{"format":"mosaic","rounds":4}' where title = 'KOM lucky draw' and event_id = (select id from events where slug = 'ecpkom')`. Open it; Draw 1: the LED shows the pool as tiles and "Round 0 of 4"; press Next round on the host four times: each press fades a share with a whoosh and the "N left" count drops; after the fourth the winner card shows. Read the display state (`fetch('/api/display/<token>/state').then(r => r.json())` in the display tab) during round 2 and confirm `draw.mosaic.survivorIds` has more ids than the winners and `draw.winners` is null.
Card round: `update games set config = config || '{"format":"cards"}' ...`, then Reset draw in the game editor or `delete from draw_winners where game_id = (select id from games where title = 'KOM lucky draw' and event_id = (select id from events where slug = 'ecpkom'))`. Open it: 8 face-down cards (1+2+5) in a 4×2 grid bobbing. Draw participant: reel, then "Pick a card! <name>"; pick a card on the host: it glows, flies to the centre, flips to the prize with a fanfare and confetti, then "<name> wins <prize>". Confirm in the display state before the flip that no untaken card has a `prize`. Put the draw back to `"format":"slot"` after.
Screenshots of each.

- [ ] **Step 5: Commit**

```bash
git add src/components/games/display
git commit -m "feat(games): mosaic elimination and the 3D card round on the LED"
```

---

### Task 19: Host console controls for the formats

**Files:**
- Modify: `src/components/games/HostConsole.tsx`

**Interfaces:**
- Consumes: `roundAction`, `pickCardAction` (Task 11); `HostState.hostDraw.format`/`cardsLeft`, `DisplayDraw.mosaic`/`cards` (Task 10); `DRAW_FORMAT_LABELS` (Task 2).

- [ ] **Step 1: Imports**

Add `roundAction, pickCardAction` to the import from `@/app/host/[token]/actions`, and change the config import to `import { DRAW_FORMAT_LABELS, GAME_KIND_LABELS } from "@/lib/games/config";`.

- [ ] **Step 2: Races show places only (D304)**

Replace the live-race `Facts` line with:
```tsx
            <Facts rows={state.race?.lanes.slice(0, 5).map((l) => [`${l.place}. ${l.label}`, l.place === 1 ? "Leading" : ""]) ?? []} />
```
Replace the results `Facts` line and the MVP line with:
```tsx
            <Facts rows={state.race?.lanes.slice(0, 3).map((l) => [`${l.place}. ${l.label}`, ""]) ?? []} />
            {state.race?.mvp && <p className="text-sm">Fastest tapper: <b>{state.race.mvp.name}</b></p>}
```

- [ ] **Step 3: The draw's controls**

Replace everything inside the `{/* Lucky draw */}` part of the section (both existing draw blocks) with:
```tsx
        {/* Lucky draw */}
        {s.phase === "draw_ready" && state.hostDraw && (
          <>
            <p className="text-sm font-bold">{DRAW_FORMAT_LABELS[state.hostDraw.format]}</p>
            {state.hostDraw.format === "cards"
              ? <p className="text-sm text-muted-foreground">{state.hostDraw.cardsLeft ?? 0} cards left · {state.draw?.pool ?? 0} eligible</p>
              : (
                <>
                  <Facts rows={state.hostDraw.progress.map((p) => [p.name, `${p.given}/${p.quantity}`])} />
                  <p className="text-sm text-muted-foreground">{state.draw?.pool ?? 0} eligible</p>
                </>
              )}
            <DrawButtons state={state} pending={pending} onDraw={(mode) => run(() => drawAction(token, v, mode))} />
          </>
        )}
        {(s.phase === "draw_spinning" || s.phase === "draw_reveal" || s.phase === "draw_rounds") && state.hostDraw && (
          <>
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
              {s.phase === "draw_reveal" ? "On screen now" : "Drawn — the screen has not shown it yet"}
            </p>
            <ul className="flex flex-col gap-2">
              {state.hostDraw.spinWinners.map((w) => (
                <li key={w.id} className="flex items-center gap-2 rounded-lg border border-border p-3">
                  <span className="min-w-0 flex-1"><b className="block truncate">{w.name}</b><span className="text-xs text-muted-foreground">{w.company}</span></span>
                  {s.phase === "draw_reveal" && (
                    <Button variant="outline" size="sm" disabled={pending} onClick={() => confirmTwice(`redraw:${w.id}`, () => redrawAction(token, v, w.id))}>
                      {armed === `redraw:${w.id}` ? "Tap again" : "Not here"}
                    </Button>
                  )}
                </li>
              ))}
              {state.hostDraw.spinWinners.length === 0 && <li className="text-sm text-muted-foreground">No one left to draw.</li>}
            </ul>
            {s.phase === "draw_rounds" && state.draw?.mosaic && (
              <>
                <p className="text-center text-lg font-bold">
                  Round {state.draw.mosaic.round} of {state.draw.mosaic.rounds} · {state.draw.mosaic.survivorIds.length} left on screen
                </p>
                <Button className={big} disabled={pending} onClick={() => run(() => roundAction(token, v))}>
                  {state.draw.mosaic.round + 1 >= state.draw.mosaic.rounds ? "Final round — show the winner" : `Next round (${state.draw.mosaic.round + 1} of ${state.draw.mosaic.rounds})`}
                </Button>
              </>
            )}
            {s.phase === "draw_reveal" && <Button className={big} disabled={pending} onClick={() => run(() => presentAction(token, v))}>✓ Present — next prize</Button>}
          </>
        )}
        {s.phase === "draw_card_pick" && state.draw?.cards && (
          <CardPicker cards={state.draw.cards} pending={pending} armed={armed}
            participantId={state.hostDraw?.spinWinners[0]?.id ?? null}
            onPick={(no) => run(() => pickCardAction(token, v, no))}
            onAway={(id) => confirmTwice(`redraw:${id}`, () => redrawAction(token, v, id))} />
        )}
        {s.phase === "draw_card_reveal" && state.draw?.cards && (
          <CardRevealed cards={state.draw.cards} cardsLeft={state.hostDraw?.cardsLeft ?? 0} pending={pending}
            onNext={() => run(() => drawAction(token, v, "one"))} />
        )}
```
Replace `DrawButtons`:
```tsx
/**
 * The next draw (D279, D310): the next prize in the admin's order, one at a time or all that is
 * left of it. The wheel draws one per spin; a card round draws the next participant.
 */
function DrawButtons({ state, pending, onDraw }: { state: HostState; pending: boolean; onDraw: (mode: "one" | "all") => void }) {
  const format = state.hostDraw?.format ?? "slot";
  if (format === "cards") {
    const left = state.hostDraw?.cardsLeft ?? 0;
    return left > 0
      ? <Button className={big} disabled={pending} onClick={() => onDraw("one")}>Draw the next participant</Button>
      : <p className="text-sm font-bold">All cards have been dealt.</p>;
  }
  const next = state.hostDraw?.progress.find((p) => p.remaining > 0);
  if (!next) return <p className="text-sm font-bold">Every prize has been drawn.</p>;
  if (format === "wheel") return <Button className={big} disabled={pending} onClick={() => onDraw("one")}>Spin the wheel for {next.name}</Button>;
  const verb = format === "mosaic" ? "Start the rounds" : "Draw";
  return (
    <>
      <Button className={big} disabled={pending} onClick={() => onDraw("one")}>{verb}: 1 × {next.name}</Button>
      {next.remaining > 1 && (
        <Button className={big} variant="outline" disabled={pending} onClick={() => onDraw("all")}>
          {verb}: all {next.remaining} remaining
        </Button>
      )}
    </>
  );
}

/** After a card flips (D317): what it held, and the next participant while cards are left. */
function CardRevealed({ cards, cardsLeft, pending, onNext }: {
  cards: NonNullable<NonNullable<HostState["draw"]>["cards"]>;
  cardsLeft: number;
  pending: boolean;
  onNext: () => void;
}) {
  const c = cards.slots.find((x) => x.no === cards.picked);
  return (
    <>
      <p className="text-center text-lg font-bold">Card {c?.no}: {c?.prize} — {cards.participant?.name}</p>
      <Button className={big} disabled={pending || cardsLeft === 0} onClick={onNext}>
        {cardsLeft > 0 ? "Next participant" : "All cards dealt"}
      </Button>
    </>
  );
}

/**
 * The card round's pick (D317): the participant calls a number, the host taps it, then confirms.
 * Taken cards are greyed. "Not here" sends the participant away before a card is chosen (D318).
 */
function CardPicker({ cards, pending, armed, participantId, onPick, onAway }: {
  cards: NonNullable<NonNullable<HostState["draw"]>["cards"]>;
  pending: boolean;
  armed: string | null;
  participantId: string | null;
  onPick: (no: number) => void;
  onAway: (id: string) => void;
}) {
  const [chosen, setChosen] = useState<number | null>(null);
  return (
    <>
      <p className="text-sm">On stage: <b>{cards.participant?.name ?? "—"}</b></p>
      <div className="grid grid-cols-5 gap-2">
        {cards.slots.map((c) => (
          <button key={c.no} type="button" disabled={c.taken || pending} onClick={() => setChosen(c.no)} aria-pressed={chosen === c.no}
            className={`h-14 rounded-lg border text-lg font-extrabold tabular-nums ${c.taken ? "opacity-25" : chosen === c.no ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
            {c.no}
          </button>
        ))}
      </div>
      <Button className={big} disabled={pending || chosen === null} onClick={() => chosen !== null && onPick(chosen)}>
        {chosen === null ? "Tap the card they call out" : `Flip card ${chosen}`}
      </Button>
      {participantId && (
        <Button variant="outline" disabled={pending} onClick={() => onAway(participantId)}>
          {armed === `redraw:${participantId}` ? "Tap again" : "Not here — draw someone else"}
        </Button>
      )}
    </>
  );
}
```

- [ ] **Step 4: Verify in the browser and commit**

Run: `npx tsc --noEmit` — Expected: PASS.
Now run the host presses deferred from Task 18 Step 4 (mosaic rounds and the card round), and check at phone size (375×812) on the host tab: the rounds button counts up and ends with "Final round — show the winner"; the card grid greys taken cards; "Flip card N" needs a card chosen; "Not here — draw someone else" asks twice. Screenshot the card grid.
```bash
git add src/components/games/HostConsole.tsx
git commit -m "feat(games): host controls for rounds, card picks and the wheel"
```

---

### Task 20: The display self-test

**Files:**
- Create: `src/lib/games/display-test.ts`, `src/components/games/display/DisplayTest.tsx`
- Modify: `src/app/display/[token]/page.tsx`
- Test: `tests/games-display-test.test.ts`

**Interfaces:**
- Consumes: `DisplayShell` (Task 13), `DisplayState`/`DisplayDraw` (Task 10).
- Produces: `TEST_STEPS = 4`, `testStep(i: number, event: DisplayState["event"], at: number): { state: DisplayState; holdMs: number }`.

- [ ] **Step 1: Write the failing test**

`tests/games-display-test.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { TEST_STEPS, testStep } from "@/lib/games/display-test";

const event = { name: "Test event", logoUrl: null, colour: "#F97316" };

describe("display self-test (D296)", () => {
  it("plays a slot spin, a wheel spin, a card flip and a winner, then loops", () => {
    const phases = Array.from({ length: TEST_STEPS + 1 }, (_, i) => testStep(i, event, 0).state.stage.phase);
    expect(phases).toEqual(["draw_spinning", "draw_spinning", "draw_card_reveal", "draw_reveal", "draw_spinning"]);
    expect(testStep(1, event, 0).state.draw?.format).toBe("wheel");
  });
  it("times each spin from the moment its step starts", () => {
    const s = testStep(0, event, 10_000).state;
    expect(s.stage.endsAt).toBe(10_000 + (s.draw?.spinMs ?? 0));
  });
  it("gives every step its own key, so sounds and scenes replay", () => {
    expect(new Set([0, 1, 2, 3, 4].map((i) => testStep(i, event, 0).state.stage.key)).size).toBe(5);
  });
  it("lands the wheel on a name that is on it, and hides every untaken card", () => {
    const wheel = testStep(1, event, 0).state.draw!;
    expect(wheel.wheel?.some((p) => p.id === wheel.targets?.[0]?.id)).toBe(true);
    const cards = testStep(2, event, 0).state.draw!.cards!;
    expect(cards.slots.filter((c) => !c.taken).every((c) => c.prize === null)).toBe(true);
  });
});
```
Run: `npx vitest run tests/games-display-test.test.ts` — Expected: FAIL.

- [ ] **Step 2: The fixtures**

`src/lib/games/display-test.ts`:
```ts
import type { DisplayDraw, DisplayState, Person } from "@/lib/games/wire";
import type { Phase } from "@/lib/games/phase";
import { DEFAULT_BACKGROUND } from "@/lib/games/background";
import { tag } from "@/lib/games/names";

const NAMES = [
  "Ann Lee", "Ben Tan", "Cai Wong", "Dev Raj", "Eve Lim", "Farah Aziz", "Gopal Nair", "Hana Ito",
  "Ivan Koh", "Jia Hui Ong", "Kumar Das", "Lina Chua", "Mei Ling Tan", "Nik Hassan", "Omar Said",
  "Priya Rama", "Qi Wei", "Rosa Diaz", "Sam Yeo", "Tara Singh", "Uma Devi", "Victor Lau", "Wen Jie", "Yusof Ali",
];
const PEOPLE: Person[] = NAMES.map((n, i) => ({ id: `test-${i}`, ...tag(n) }));

export const TEST_STEPS = 4;

/**
 * The display self-test (D296), for the AV laptop before the show: a slot spin, a wheel spin, a
 * card flip and a winner, from built-in names, looping. It never reads or writes the stage. `at`
 * is when step `i` starts; its spin ends relative to it.
 */
export function testStep(i: number, event: DisplayState["event"], at: number): { state: DisplayState; holdMs: number } {
  const n = ((i % TEST_STEPS) + TEST_STEPS) % TEST_STEPS;
  const stage = (phase: Phase, endsAt: number | null = null): DisplayState["stage"] => ({
    key: `test:${i}`, phase, endsAt, game: { id: "test", kind: "draw", title: "Display test", green: false },
    race: null, question: null, reveal: null, prizeNo: 0,
  });
  const draw = (over: Partial<DisplayDraw>): DisplayDraw => ({
    format: "slot", prize: "Grand prize", pool: PEOPLE.length, sample: PEOPLE, targets: null, spinMs: null,
    quick: false, wheel: null, mosaic: null, cards: null, winners: null, ...over,
  });
  const base = { now: at, event, look: DEFAULT_BACKGROUND, race: null, survival: null };
  if (n === 0) return { holdMs: 7000, state: { ...base, stage: stage("draw_spinning", at + 5000), draw: draw({ targets: [PEOPLE[0]], spinMs: 5000 }) } };
  if (n === 1) {
    return { holdMs: 8500, state: { ...base, stage: stage("draw_spinning", at + 6000), draw: draw({ format: "wheel", wheel: PEOPLE, targets: [PEOPLE[7]], spinMs: 6000 }) } };
  }
  if (n === 2) {
    const slots = Array.from({ length: 10 }, (_, k) => (k === 3
      ? { no: 4, taken: true, prize: "Grand prize", winner: "Ann Lee" }
      : { no: k + 1, taken: false, prize: null, winner: null }));
    return { holdMs: 5000, state: { ...base, stage: stage("draw_card_reveal"), draw: draw({ format: "cards", prize: null, cards: { slots, participant: { name: "Ann Lee", company: "Ecopia" }, picked: 4 } }) } };
  }
  return { holdMs: 5000, state: { ...base, stage: stage("draw_reveal"), draw: draw({ winners: [{ name: "Ann Lee", company: "Ecopia" }] }) } };
}
```
Run the test — Expected: PASS.

- [ ] **Step 3: The component and the page**

`src/components/games/display/DisplayTest.tsx`:
```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import type { DisplayState } from "@/lib/games/wire";
import { testStep } from "@/lib/games/display-test";
import { DisplayShell } from "./DisplayClient";

/** /display/[token]?test (D296): the LED page on built-in data, looping, with no polling. */
export function DisplayTest({ event }: { event: DisplayState["event"] }) {
  const [step, setStep] = useState(0);
  const [at, setAt] = useState(() => Date.now());
  const { state, holdMs } = useMemo(() => testStep(step, event, at), [step, event, at]);
  useEffect(() => {
    const id = setTimeout(() => { setStep((s) => s + 1); setAt(Date.now()); }, holdMs);
    return () => clearTimeout(id);
  }, [step, holdMs]);
  return <DisplayShell state={state} offset={0} />;
}
```
In `src/app/display/[token]/page.tsx`: add `searchParams: Promise<Record<string, string | string[] | undefined>>` to the page's props, import `DisplayTest`, and replace the final `return` with:
```tsx
  // The pre-show check (D296): the real link, built-in data, the stage untouched.
  if ((await searchParams).test !== undefined) {
    const e = link.event;
    return <DisplayTest event={{ name: e.name, logoUrl: e.logo_url, colour: e.primary_color }} />;
  }
  return <DisplayClient token={token} initial={await firstView(link.event)} />;
```

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run && npx tsc --noEmit` — Expected: PASS.
Open `http://localhost:3000/display/<ecpkom display token>?test`, click start: a reel lands on "Ann", the wheel spins and lands on "Hana", card 4 flips to "Grand prize", Ann's winner card with confetti, then it loops. Confirm with `read_network_requests` that the page made no `/api/display/` request.
```bash
git add src/lib/games/display-test.ts src/components/games/display/DisplayTest.tsx "src/app/display/[token]/page.tsx" tests/games-display-test.test.ts
git commit -m "feat(games): a display self-test for the AV laptop"
```

---

### Task 21: The phone's play page and the Game on banner

**Files:**
- Create: `src/components/games/phone/Panel.tsx`, `src/components/games/phone/TapPad.tsx`
- Modify: `src/components/games/PlayClient.tsx` (full rewrite), `src/components/games/GameBanner.tsx`

**Interfaces:**
- Consumes: `PhoneMe` (Task 10: no `taps`; draw has `up`), `optionStyles` and `PublicStage.game.green` (Task 3), `gameFont` (Task 1).
- Produces: `Panel({ tone, icon?, title, children?, pulse? })`, `TapPad({ token, secondsLeft })`.

- [ ] **Step 1: Panel and TapPad**

`src/components/games/phone/Panel.tsx`:
```tsx
"use client";
import { motion } from "motion/react";

const TONES = {
  brand: "bg-primary text-primary-foreground",
  go: "bg-emerald-500 text-white",
  out: "bg-rose-600 text-white",
  win: "bg-amber-400 text-amber-950",
  calm: "bg-muted text-foreground",
} as const;
export type Tone = keyof typeof TONES;

/** One full-screen moment on the play page (D307): a colour, an icon, a big line, a small line. */
export function Panel({ tone, icon, title, children, pulse = false }: { tone: Tone; icon?: string; title: React.ReactNode; children?: React.ReactNode; pulse?: boolean }) {
  return (
    <motion.div initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className={`flex min-h-[62dvh] w-full flex-col items-center justify-center gap-4 rounded-3xl p-6 text-center ${TONES[tone]}`}>
      {icon && (
        <motion.span aria-hidden className="text-7xl"
          animate={pulse ? { scale: [1, 1.12, 1] } : undefined} transition={pulse ? { repeat: Infinity, duration: 1.6 } : undefined}>{icon}</motion.span>
      )}
      <div className="font-game text-4xl leading-tight">{title}</div>
      {children && <div className="max-w-sm text-base opacity-90">{children}</div>}
    </motion.div>
  );
}
```

`src/components/games/phone/TapPad.tsx`:
```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

/**
 * The tap button (D269, D307). Taps are counted here and sent in a batch every second (D266); a
 * batch that fails is dropped, never replayed (D262). The last batch is sent when the race ends
 * and this unmounts, inside the server's 1.5 s grace. No counter (D304): every tap squashes the
 * button, bursts a ring and buzzes where the phone can.
 */
export function TapPad({ token, secondsLeft }: { token: string; secondsLeft: number }) {
  const pending = useRef(0);
  const nextRing = useRef(0);
  const [rings, setRings] = useState<number[]>([]);

  useEffect(() => {
    const send = () => {
      const n = pending.current;
      if (!n) return;
      pending.current = 0;
      void fetch(`/api/play/${token}/taps`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ n }), keepalive: true,
      }).catch(() => {});
    };
    const id = setInterval(send, 1000);
    return () => { clearInterval(id); send(); };
  }, [token]);

  const tap = () => {
    pending.current += 1;
    navigator.vibrate?.(10);
    const id = nextRing.current++;
    setRings((r) => [...r.slice(-7), id]);
  };

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <p className="font-game text-3xl">Tap tap tap!</p>
      <div className="relative flex size-72 items-center justify-center">
        <AnimatePresence>
          {rings.map((id) => (
            <motion.span key={id} aria-hidden initial={{ scale: 0.8, opacity: 0.7 }} animate={{ scale: 1.6, opacity: 0 }} transition={{ duration: 0.5 }}
              onAnimationComplete={() => setRings((r) => r.filter((x) => x !== id))}
              className="absolute inset-0 rounded-full border-8 border-primary" />
          ))}
        </AnimatePresence>
        <motion.button type="button" onPointerDown={tap} onContextMenu={(e) => e.preventDefault()}
          whileTap={{ scale: 0.88 }} transition={{ type: "spring", stiffness: 600, damping: 18 }}
          className="relative flex size-64 select-none items-center justify-center rounded-full bg-primary font-game text-6xl text-primary-foreground shadow-[inset_0_-12px_0_rgba(0,0,0,0.25),0_16px_40px_rgba(0,0,0,0.3)]"
          style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}>
          TAP!
        </motion.button>
      </div>
      <p className="font-game text-2xl tabular-nums" suppressHydrationWarning>{secondsLeft}s left</p>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `PlayClient.tsx`**

Replace `src/components/games/PlayClient.tsx`:
```tsx
"use client";
import { useState } from "react";
import { MotionConfig, motion } from "motion/react";
import type { PhoneMe, PhoneState } from "@/lib/games/wire";
import type { PublicStage } from "@/lib/games/views";
import { optionStyles } from "@/lib/games/views";
import { phoneInterval } from "@/lib/games/poll";
import { gameFont } from "@/lib/games/font";
import { Button } from "@/components/ui/button";
import { usePoll, useServerNow } from "./usePoll";
import { Panel } from "./phone/Panel";
import { TapPad } from "./phone/TapPad";

const phoneEvery = (s: PhoneState) => phoneInterval(s.stage?.phase ?? null);
const SURVIVAL_PLAY = ["survival_question", "survival_locked", "survival_reveal", "survival_over"];
const SUFFIX: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };
const ordinal = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? `${n}th` : `${n}${SUFFIX[n % 10] ?? "th"}`);
const MEDALS = ["🥇", "🥈", "🥉"];

/**
 * The attendee's side of every game (D251, D307). It follows the stage by polling (D256): once a
 * second while a game is on, every 5 s otherwise, sending its key so an unchanged stage costs
 * almost nothing. Each state is one full-screen moment; motion is reduced to fades when the phone
 * asks for reduced motion.
 */
export function PlayClient({ token, initial }: { token: string; initial: PhoneState }) {
  const { state, offset, apply } = usePoll<PhoneState>(`/api/play/${token}/state`, initial, phoneEvery, true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const s = state.stage;
  const me = state.me;
  const ticking = !!s && (s.phase === "race_countdown" || s.phase === "race_live" || s.phase === "survival_question");
  const now = useServerNow(offset, 100, ticking);

  const join = async () => {
    setError(null);
    setJoining(true);
    try {
      const res = await fetch(`/api/play/${token}/join`, { method: "POST" });
      const body = await res.json().catch(() => ({ error: "Could not join. Try again." }));
      if (res.ok) apply(body as PhoneState);
      else setError((body as { error?: string }).error ?? "Could not join. Try again.");
    } catch {
      setError("Could not join. Check the connection and try again.");
    } finally {
      setJoining(false);
    }
  };
  const joinButton = (label: string) => (
    <Button className="h-16 w-full max-w-xs bg-white font-game text-2xl text-primary hover:bg-white/90" onClick={join} disabled={joining}>
      {joining ? "Joining…" : label}
    </Button>
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className={`${gameFont.variable} flex flex-col items-center gap-4 text-center`}>
        {s?.game?.title && <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{s.game.title}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!s || !me ? <Panel tone="calm" title="Loading…" /> : (
          <>
            {s.phase === "idle" && (
              <Panel tone="calm" icon="🎮" title="No game on right now">Keep this page open. It switches on by itself when the host starts one.</Panel>
            )}
            {me.kind === "race" && <RacePlay stage={s} me={me} now={now} token={token} joinButton={joinButton} />}
            {me.kind === "survival" && s.phase === "survival_lobby" && (
              me.joined
                ? <Panel tone="brand" icon="🧠" pulse title="You're in!">Watch the screen for question 1.</Panel>
                : <Panel tone="brand" icon="🧠" title="Last one standing">{joinButton("I'm in")}</Panel>
            )}
            {me.kind === "survival" && SURVIVAL_PLAY.includes(s.phase) && (
              // Keyed by the question, so a new question starts with no local pick and no error.
              <SurvivalPlay key={s.question?.no ?? -1} token={token} stage={s} me={me} now={now} />
            )}
            {me.kind === "draw" && (
              me.won
                ? <Panel tone="win" icon="🎉" pulse title={<>You won {me.won}!</>}>Come to the stage.</Panel>
                : me.up
                  ? <Panel tone="brand" icon="🃏" pulse title="You're up!">Come to the stage and pick a card.</Panel>
                  : <Panel tone="calm" icon="🎰" pulse title="Lucky draw is on">Eyes on the screen!</Panel>
            )}
          </>
        )}
      </div>
    </MotionConfig>
  );
}

type RaceMe = Extract<PhoneMe, { kind: "race" }>;

function RacePlay({ stage, me, now, token, joinButton }: { stage: PublicStage; me: RaceMe; now: number; token: string; joinButton: (label: string) => React.ReactNode }) {
  const missed = <Panel tone="calm" icon="⏱️" title="The race has started">Catch the next one!</Panel>;
  if (stage.phase === "race_lobby") {
    return me.joined
      ? <Panel tone="brand" icon="🏁" pulse title="You're in!">Racing for <b>{me.lane}</b>. Get ready to tap!</Panel>
      : <Panel tone="brand" icon="🏁" title={<>Racing for {me.lane}</>}>{joinButton("Join the race")}</Panel>;
  }
  if (stage.phase === "race_countdown" && stage.race) {
    if (!me.joined) return missed;
    const n = Math.max(1, Math.ceil((stage.race.liveFrom - now) / 1000));
    return (
      <Panel tone="brand" title={
        <motion.span key={n} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="block text-[160px] leading-none" suppressHydrationWarning>{n}</motion.span>
      }>Get ready…</Panel>
    );
  }
  if (stage.phase === "race_live" && stage.race) {
    return me.joined ? <TapPad token={token} secondsLeft={Math.max(0, Math.ceil((stage.race.liveUntil - now) / 1000))} /> : missed;
  }
  if (stage.phase === "race_results") {
    if (!me.joined || !me.place) return <Panel tone="calm" icon="🏁" title="Race over">See the screen for the results.</Panel>;
    return (
      <Panel tone={me.place === 1 ? "win" : "brand"} icon={MEDALS[me.place - 1] ?? "🏁"} title={<>{me.lane} finished {ordinal(me.place)}</>}>
        of {me.lanes}
      </Panel>
    );
  }
  return null;
}

type SurvivalMe = Extract<PhoneMe, { kind: "survival" }>;

/** One question of last one standing. The parent keys it by question number (see PlayClient). */
function SurvivalPlay({ token, stage, me, now }: { token: string; stage: PublicStage; me: SurvivalMe; now: number }) {
  const q = stage.question;
  const [picked, setPicked] = useState<number | null>(me.answered);
  const [error, setError] = useState<string | null>(null);
  const styles = optionStyles(stage.game?.green ?? false);

  if (!me.joined) return <Panel tone="calm" icon="👀" title="This game started without you">Watch the screen. The next one is yours!</Panel>;
  const outBefore = me.outAt !== null && (q === null || me.outAt < q.no);
  if (stage.phase === "survival_over") {
    return me.outAt === null
      ? <Panel tone="win" icon="🏆" pulse title="You won!" />
      : <Panel tone="calm" icon="🏁" title="Game over">See the screen for the winner.</Panel>;
  }
  if (!q) return null;
  if (stage.phase === "survival_reveal") {
    if (outBefore) return <Panel tone="calm" icon="👀" title="You're out">Watching.</Panel>;
    return me.outAt === q.no
      ? <Panel tone="out" icon="❌" title="You're out">Stay and watch who wins!</Panel>
      : <Panel tone="go" icon="✅" pulse title="You're through!" />;
  }

  const answer = async (choice: number) => {
    setError(null);
    setPicked(choice);
    try {
      const res = await fetch(`/api/play/${token}/answer`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q.no, choice }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; choice?: number; error?: string };
      if (body.ok && typeof body.choice === "number") setPicked(body.choice);
      else { setPicked(null); setError(body.error ?? "That answer did not go through."); }
    } catch {
      setPicked(null);
      setError("That answer did not go through. Check the connection and try again.");
    }
  };
  const locked = stage.phase === "survival_locked" || picked !== null || outBefore;

  return (
    <div className="flex w-full flex-col gap-3">
      <p className="text-sm font-bold text-muted-foreground" suppressHydrationWarning>
        Question {q.no + 1} of {q.total}
        {stage.phase === "survival_question" && q.deadline ? ` · ${Math.max(0, Math.ceil((q.deadline - now) / 1000))}s` : ""}
      </p>
      <p className="font-game text-2xl leading-tight">{q.text}</p>
      {outBefore && <p className="text-sm text-muted-foreground">You&apos;re out — watching this one.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-1 gap-3">
        {q.options.map((o, i) => (
          <motion.button key={i} type="button" disabled={locked} onClick={() => answer(i)} whileTap={{ scale: 0.96 }}
            animate={{ opacity: locked && picked !== i ? 0.3 : 1, scale: picked === i ? 1.02 : 1 }}
            className="flex min-h-20 items-center gap-4 rounded-2xl px-5 text-left font-game text-2xl text-white shadow-[inset_0_-6px_0_rgba(0,0,0,0.25)]"
            style={{ background: styles[i].colour }}>
            <span aria-hidden className="text-3xl">{styles[i].shape}</span>
            <span className="min-w-0 flex-1">{o}</span>
            {picked === i && <span aria-hidden>✓</span>}
          </motion.button>
        ))}
      </div>
      {picked !== null && <p className="font-game text-xl">Locked in — look at the screen</p>}
      {picked === null && stage.phase === "survival_locked" && !outBefore && <p className="text-sm text-muted-foreground">Time&apos;s up.</p>}
    </div>
  );
}
```

- [ ] **Step 3: The banner**

In `src/components/games/GameBanner.tsx`: add imports `import { MotionConfig, motion } from "motion/react";` and `import { gameFont } from "@/lib/games/font";`. Replace the `if (me?.kind === "draw" && me.won) {...}` block and the final `return (...)` with:
```tsx
  if (me?.kind === "draw" && (me.won || me.up)) {
    return (
      <div role="status" className={`${gameFont.variable} rounded-2xl bg-amber-400 p-4 text-center text-amber-950 shadow-lg`}>
        <b className="font-game text-2xl">{me.won ? `🎉 You won ${me.won}!` : "🃏 You're up!"}</b>
        <p className="text-sm">{me.won ? "Come to the stage." : "Come to the stage and pick a card."}</p>
      </div>
    );
  }
  if (!s || !PLAYING.has(s.phase)) return null;
  const joining = s.phase === "race_lobby" || s.phase === "survival_lobby";
  return (
    <MotionConfig reducedMotion="user">
      <Link href={`${basePath}/play`} className={`${gameFont.variable} relative flex items-center gap-4 overflow-hidden rounded-2xl bg-primary p-4 text-primary-foreground shadow-lg`}>
        <span className="relative flex size-4 shrink-0">
          <motion.span className="absolute inset-0 rounded-full bg-white" animate={{ scale: [1, 2.2], opacity: [0.7, 0] }} transition={{ repeat: Infinity, duration: 1.4 }} />
          <span className="relative size-4 rounded-full bg-white" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <b className="font-game text-xl leading-tight">Game on!</b>
          <span className="truncate text-sm opacity-90">{s.game?.title}</span>
        </span>
        <span className="shrink-0 rounded-full bg-white px-4 py-2 font-game text-base text-primary">{joining ? "Join now" : "Play"}</span>
      </Link>
    </MotionConfig>
  );
```
Update the component's doc comment: `"Game on" on the portal home while a race or last one standing is in its lobby or live (D254, D308), "You won" for a draw winner (D282) and "You're up" for a card round's participant (D319).`

- [ ] **Step 4: Verify in the browser and commit**

Run: `npx tsc --noEmit && npx vitest run` — Expected: PASS.
At phone size (375×812), on an `ecpkom` attendee's play page and portal home, walk the Tap race (join, countdown, tapping — confirm rings and no counter — result) and the quiz (tiles with shapes, locked in, through/out). Emulate reduced motion (`resize_window` cannot; use `javascript_tool` to check `matchMedia('(prefers-reduced-motion: reduce)')` is honoured by reading `MotionConfig` behaviour is not required — skip if not emulatable). On the portal home, the banner shows "Game on!" with the pulsing dot during a lobby. Screenshot each state.
```bash
git add src/components/games/PlayClient.tsx src/components/games/GameBanner.tsx src/components/games/phone
git commit -m "feat(games): full-screen game moments on the phone and a bolder banner"
```

---

### Task 22: Game editor controls, video uploads and the winners export

**Files:**
- Modify: `src/lib/storage.ts`, `src/lib/db/media.ts`, `src/lib/exports.ts`
- Create: `src/lib/supabase/browser.ts`, `src/components/admin/DrawFormatFields.tsx`, `src/components/admin/BackgroundPicker.tsx`
- Modify: `src/app/admin/events/[id]/games/actions.ts`, `src/app/admin/events/[id]/games/[gameId]/page.tsx`
- Test: `tests/storage.test.ts`, `tests/games-winners-export.test.ts`

**Interfaces:**
- Consumes: `backgroundFromForm` (Task 2), `nextImage`, `deleteEventImage` (existing, `src/lib/db/media.ts`), `mediaPathFromUrl` (existing).
- Produces: `acceptVideo(file: { type: string; size: number }): string`, `MAX_VIDEO_BYTES`, `VIDEO_ACCEPT`; `ImageKind` gains `"game-background" | "game-video"`; `createVideoUpload(where: { orgId: string; eventId: string; ext: string }): Promise<{ path: string; token: string; url: string }>`; `browserStorage()`; `backgroundVideoUploadAction(eventId, gameId, type, size)`; the winners sheet gains a Card column.

- [ ] **Step 1: Write the failing tests**

Append to `tests/storage.test.ts` (import `acceptVideo`, `MAX_VIDEO_BYTES`):
```ts
describe("acceptVideo (D300)", () => {
  it("takes MP4 and WebM up to 30 MB", () => {
    expect(acceptVideo({ type: "video/mp4", size: 1000 })).toBe("mp4");
    expect(acceptVideo({ type: "video/webm", size: MAX_VIDEO_BYTES })).toBe("webm");
  });
  it("refuses other types, empty files and anything over 30 MB", () => {
    expect(() => acceptVideo({ type: "video/quicktime", size: 1000 })).toThrow("Videos must be MP4 or WebM.");
    expect(() => acceptVideo({ type: "video/mp4", size: 0 })).toThrow("Choose a video first.");
    expect(() => acceptVideo({ type: "video/mp4", size: MAX_VIDEO_BYTES + 1 })).toThrow("Videos must be 30 MB or smaller.");
  });
});
```
In `tests/games-winners-export.test.ts`, update the expected header and rows for the new Card column (after Prize), and add a card-round case:
```ts
    expect(rows[0]).toEqual(["Prize", "Card", "Name", "Company", "Category", "Email", "Drawn at", "Status"]);
    expect(rows[1]).toEqual(["iPad", "", "Priya Ramasamy", "Ecopia", "Staff", "p@x.test", "2026-10-01 10:00", "Won"]);
    expect(rows[2]).toEqual(["Voucher", "", "Tan Mei Ling", "", "", "", "2026-10-01 10:00", "Not here — redrawn"]);
```
```ts
  it("shows a card round's card, and a participant who never picked (D322)", () => {
    const picked: WinnerRow = { ...w("a1", 1), card_no: 3 };
    const pending: WinnerRow = { ...w("a2", 0), prize_no: null, card_no: null };
    const rows = winnerSheetRows([{ name: "Voucher", quantity: 2 }, { name: "iPad", quantity: 1 }], [picked, pending], people);
    expect(rows[1].slice(0, 2)).toEqual(["iPad", "3"]);
    expect(rows[2].slice(0, 2)).toEqual(["No card picked", ""]);
  });
```
Also update any other row expectation in that file that lists every column (it gains `""` after the prize). Run: `npx vitest run tests/storage.test.ts tests/games-winners-export.test.ts` — Expected: FAIL.

- [ ] **Step 2: Storage, media, export**

In `src/lib/storage.ts`: extend `ImageKind` with `| "game-background" | "game-video"`, and append:
```ts
/**
 * A game's LED background video (D300). Far past the Server Action's 10 MB cap, so the browser
 * uploads it straight to the bucket with a signed URL (createVideoUpload); the bucket's own
 * 30 MB limit is the real gate, and this is the early answer the organiser reads.
 */
export const MAX_VIDEO_BYTES = 30 * 1024 * 1024;

const VIDEO_EXTENSIONS: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm" };

export function acceptVideo(file: { type: string; size: number }): string {
  if (file.size === 0) throw new Error("Choose a video first.");
  const ext = VIDEO_EXTENSIONS[file.type.toLowerCase()];
  if (!ext) throw new Error("Videos must be MP4 or WebM.");
  if (file.size > MAX_VIDEO_BYTES) throw new Error("Videos must be 30 MB or smaller.");
  return ext;
}

export const VIDEO_ACCEPT = Object.keys(VIDEO_EXTENSIONS).join(",");
```
In `src/lib/db/media.ts`, append:
```ts
/**
 * A signed upload URL for one background video (D300): the browser sends the file straight to
 * the bucket, past the Server Action's 10 MB cap. The path is minted here, so the browser can
 * write only this one new object.
 */
export async function createVideoUpload(where: { orgId: string; eventId: string; ext: string }): Promise<{ path: string; token: string; url: string }> {
  const path = mediaObjectPath({ orgId: where.orgId, eventId: where.eventId, kind: "game-video", ext: where.ext }, crypto.randomUUID().slice(0, 8));
  const storage = serviceClient().storage.from(MEDIA_BUCKET);
  const { data, error } = await storage.createSignedUploadUrl(path);
  if (error || !data) throw new Error("Could not start the upload. Try again.");
  return { path, token: data.token, url: storage.getPublicUrl(path).data.publicUrl };
}
```
`src/lib/supabase/browser.ts`:
```ts
import { createClient } from "@supabase/supabase-js";

/**
 * An anon client for one job: uploading to a signed URL the server minted (D300). The bucket has
 * no write policy, so without that URL this client can put nothing in it.
 */
export function browserStorage() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```
In `src/lib/exports.ts` `winnerSheetRows`: change the header to start `["Prize", "Card", "Name", ...` and the row's first cell to:
```ts
      w.prize_no === null ? "No card picked" : prizes[w.prize_no]?.name ?? `Prize ${w.prize_no + 1}`,
      typeof w.card_no === "number" ? String(w.card_no) : "",
```
Run the tests — Expected: PASS.

- [ ] **Step 3: Editor components**

`src/components/admin/DrawFormatFields.tsx`:
```tsx
"use client";
import { useState } from "react";
import { DRAW_FORMAT_LABELS, DRAW_FORMATS, MAX_CARDS, type DrawFormat } from "@/lib/games/config";

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const HELP: Record<DrawFormat, string> = {
  slot: "Reels spin through names and land on the winners. Draw one at a time or a whole prize at once.",
  wheel: "Every eligible name on a wheel. One winner per spin.",
  mosaic: "Everyone as a tile. Each round fades out a share until only the winners stand. The host presses Next round.",
  cards: `Draw a person, then they pick one of the face-down cards and win what it hides. One card per prize, up to ${MAX_CARDS}.`,
};

/** A draw's format, spin time and rounds (D310, D311, D315). Both numbers always post; each shows only where it applies. */
export function DrawFormatFields({ format, spinS, rounds }: { format: DrawFormat; spinS: number; rounds: number }) {
  const [f, setF] = useState(format);
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1.5 text-sm font-bold">Format</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {DRAW_FORMATS.map((k) => (
          <label key={k} className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm ${f === k ? "border-primary bg-primary/5" : "border-border"}`}>
            <span className="flex items-center gap-2 font-bold">
              <input type="radio" name="format" value={k} checked={f === k} onChange={() => setF(k)} className="size-4" />
              {DRAW_FORMAT_LABELS[k]}
            </span>
            <span className="text-xs text-muted-foreground">{HELP[k]}</span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        <label className={`flex flex-col gap-1.5 text-sm font-bold ${f === "mosaic" ? "hidden" : ""}`}>
          Spin time (seconds)
          <input name="spin_s" type="number" min={3} max={20} defaultValue={spinS} className={`${input} max-w-32 tabular-nums`} />
        </label>
        <label className={`flex flex-col gap-1.5 text-sm font-bold ${f === "mosaic" ? "" : "hidden"}`}>
          Rounds
          <input name="rounds" type="number" min={2} max={8} defaultValue={rounds} className={`${input} max-w-32 tabular-nums`} />
        </label>
      </div>
    </fieldset>
  );
}
```

`src/components/admin/BackgroundPicker.tsx`:
```tsx
"use client";
import { useState } from "react";
import type { Background, BackgroundKind } from "@/lib/games/background";
import { acceptVideo, MEDIA_BUCKET, VIDEO_ACCEPT } from "@/lib/storage";
import { browserStorage } from "@/lib/supabase/browser";
import { ImageField } from "@/components/admin/ImageField";
import { backgroundVideoUploadAction } from "@/app/admin/events/[id]/games/actions";

const OPTIONS: { kind: BackgroundKind; label: string; help: string }[] = [
  { kind: "theme", label: "Theme", help: "A moving background in the event colour, with the logo." },
  { kind: "green", label: "Green screen", help: "Solid green for the AV team to key out." },
  { kind: "image", label: "Image", help: "Your own picture, darkened a little so text stays readable." },
  { kind: "video", label: "Video", help: "A looping MP4 or WebM, up to 30 MB, played without sound." },
];

/** A game's LED background (D297–D300). An image posts with the form; a video uploads on its own first. */
export function BackgroundPicker({ eventId, gameId, current }: { eventId: string; gameId: string; current: Background }) {
  const [kind, setKind] = useState<BackgroundKind>(current.kind);
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1.5 text-sm font-bold">LED background</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((o) => (
          <label key={o.kind} className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm ${kind === o.kind ? "border-primary bg-primary/5" : "border-border"}`}>
            <span className="flex items-center gap-2 font-bold">
              <input type="radio" name="background_kind" value={o.kind} checked={kind === o.kind} onChange={() => setKind(o.kind)} className="size-4" />
              {o.label}
            </span>
            <span className="text-xs text-muted-foreground">{o.help}</span>
          </label>
        ))}
      </div>
      {kind === "image" && (
        <ImageField label="Background image" name="background_image" url={current.kind === "image" ? current.url : null}
          description="PNG, JPEG or WebP, up to 4 MB. 1920 × 1080 fits the LED exactly." />
      )}
      {kind === "video" && <VideoField eventId={eventId} gameId={gameId} current={current.kind === "video" ? current.url : null} />}
    </fieldset>
  );
}

/**
 * The video goes straight to the bucket with a signed URL the server mints after checking its
 * type and size (D300): it is too big for the form. Save then keeps the URL it landed at.
 */
function VideoField({ eventId, gameId, current }: { eventId: string; gameId: string; current: string | null }) {
  const [url, setUrl] = useState(current);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      acceptVideo(file);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setUploading(true);
    try {
      const r = await backgroundVideoUploadAction(eventId, gameId, file.type, file.size);
      if (!r.ok) { setError(r.error); return; }
      const { error: upload } = await browserStorage().storage.from(MEDIA_BUCKET)
        .uploadToSignedUrl(r.path, r.token, file, { contentType: file.type, cacheControl: "31536000" });
      if (upload) { setError("Could not upload that video. Try again."); return; }
      setUrl(r.url);
    } catch {
      setError("Could not upload that video. Check the connection and try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="background_video" value={url ?? ""} />
      {url && <video src={url} muted loop autoPlay playsInline className="aspect-video w-full max-w-md rounded-lg bg-black object-cover" />}
      {/* No name: the file itself never rides the form. */}
      <input type="file" accept={VIDEO_ACCEPT} disabled={uploading} onChange={(e) => void choose(e.target.files?.[0])} className="text-sm" />
      <p className="text-xs text-muted-foreground">{uploading ? "Uploading… keep this page open." : "MP4 or WebM, up to 30 MB. It uploads straight away; Save keeps it."}</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: The actions**

In `src/app/admin/events/[id]/games/actions.ts`, add imports:
```ts
import { backgroundFromForm } from "@/lib/games/background";
import { acceptVideo, mediaPathFromUrl } from "@/lib/storage";
import { createVideoUpload, deleteEventImage, nextImage } from "@/lib/db/media";
```
In `updateGameAction`, replace the lines from `const title = ...` to the end of the function with:
```ts
  // The LED background (D297, D300). An image uploads with this save; a video was already
  // uploaded by the browser, and is accepted only if it is in our bucket.
  const current = game.config.background;
  const kind = String(form.get("background_kind") ?? current.kind);
  let image: string | null = null;
  if (kind === "image") {
    try {
      image = (await nextImage(form, "background_image", current.kind === "image" ? current.url : null,
        { orgId: ev.org_id, eventId: ev.id, kind: "game-background" })).url;
    } catch (e) {
      redirect(flashPath(path, (e as Error).message, "error"));
    }
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const bg = backgroundFromForm(kind, {
    image,
    video: String(form.get("background_video") ?? "").trim() || null,
    ours: (u) => mediaPathFromUrl(u, supabaseUrl) !== null,
  });
  if (!bg.ok) redirect(flashPath(path, bg.error, "error"));
  const title = (String(form.get("title") ?? "").trim() || game.title).slice(0, 80);
  await updateGame(game.id, ev.id, { title, config: { ...(parsed.config as Record<string, unknown>), background: bg.background } });
  // The file this save replaced goes only once the row no longer names it (see nextImage).
  if (current.url && current.url !== bg.background.url) await deleteEventImage(current.url);
  revalidatePath(path);
  revalidatePath(gamesPath(ev.id));
  redirect(flashPath(path, "Saved."));
}
```
Append:
```ts
/** Mints the signed URL a background video uploads to (D300), after checking the game is this event's and the file is one we take. */
export async function backgroundVideoUploadAction(eventId: string, gameId: string, type: string, size: number): Promise<{ ok: true; path: string; token: string; url: string } | { ok: false; error: string }> {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  if (!(await getGame(gameId, ev.id))) return { ok: false, error: "That game no longer exists." };
  let ext: string;
  try {
    ext = acceptVideo({ type: String(type), size: Number(size) });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  try {
    return { ok: true, ...(await createVideoUpload({ orgId: ev.org_id, eventId: ev.id, ext })) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
```

- [ ] **Step 5: The editor page**

In `src/app/admin/events/[id]/games/[gameId]/page.tsx`: import `DrawFormatFields` and `BackgroundPicker`. Inside the form, right after the draw's `Prizes` block (still inside `{game.kind === "draw" && (<>...</>)}`), add:
```tsx
                <DrawFormatFields format={game.config.format} spinS={game.config.spin_s} rounds={game.config.rounds} />
```
and just before `<SaveBar inCard />` add:
```tsx
            <BackgroundPicker eventId={ev.id} gameId={game.id} current={game.config.background} />
```
In the winners list, replace the prize `span`'s content with:
```tsx
                        {w.prize_no === null ? "No card picked" : game.config.prizes[w.prize_no]?.name ?? `Prize ${w.prize_no + 1}`}
                        {typeof w.card_no === "number" ? ` · card ${w.card_no}` : ""}
```

- [ ] **Step 6: Verify in the browser and commit**

Run: `npx vitest run && npx tsc --noEmit` — Expected: PASS.
In the admin (log in yourself if the preview is signed out — ask the user to sign in if it needs their password; never type it), open `ecpkom` → Games → KOM lucky draw: pick each format and save; the host tab shows the matching buttons. Try a Card round with prizes adding up to 21: the red flash says "A card round has at most 20 cards…". Set LED background to Image with a small PNG, save, and open the display: the image fills the LED under a dark veil. Set Video with a short MP4 (create one if none is at hand, or skip the upload and note it), save, and confirm it loops on the display. Set Green screen, then Theme. Put the draw back to Slot machine with Theme when done. Download the winners export and confirm the Card column.
```bash
git add src/lib/storage.ts src/lib/db/media.ts src/lib/exports.ts src/lib/supabase/browser.ts src/components/admin/DrawFormatFields.tsx src/components/admin/BackgroundPicker.tsx "src/app/admin/events/[id]/games" tests/storage.test.ts tests/games-winners-export.test.ts
git commit -m "feat(admin): draw formats, LED backgrounds and card numbers in the winners export"
```

---

### Task 23: Load test, runbook and spec status

**Files:**
- Modify: `scripts/games-load.mjs`, `docs/runbook.md`, `docs/superpowers/specs/2026-09-27-live-games-visuals-design.md`

- [ ] **Step 1: The load test's tap check**

In `scripts/games-load.mjs`, replace the whole `if (displayToken) { ... }` block after `console.log(`Taps accepted by the server: ${accepted}`);` with:
```js
  // D304 took tap totals off the LED, so the check reads the database: the taps the server
  // accepted must equal what race_taps holds for the run on stage, read after the grace so the
  // last batches have landed. Paged: one request stops at 1,000 rows.
  const stage = must(await db.from("game_stage").select("run_id, phase_data").eq("event_id", ev.id).maybeSingle());
  const liveUntil = stage?.phase_data?.live_until ? Date.parse(stage.phase_data.live_until) : 0;
  if (stage?.run_id && liveUntil) {
    const wait = liveUntil + SETTLE_MS - Date.now();
    if (wait > 0) await sleep(wait);
    let stored = 0;
    for (let from = 0; ; from += 1000) {
      const page = must(await db.from("race_taps").select("taps").eq("run_id", stage.run_id).order("attendee_id").range(from, from + 999));
      stored += page.reduce((sum, r) => sum + r.taps, 0);
      if (page.length < 1000) break;
    }
    const ok = stored === accepted;
    console.log(`${ok ? "PASS" : "FAIL"}  taps stored ${stored} vs accepted ${accepted}`);
    if (!ok) failed = true;
  } else {
    console.log("Skipped the tap-total check: no race on the stage.");
  }
```
Update the header comment's PASS line: replace "and — when a display token is given and the stage ends on a race's results — the LED's lane totals equal the taps the server accepted" with "and the taps stored for the race on stage equal the taps the server accepted". The optional `display-token` argument stays (it is still checked against the event) but is no longer needed for the check.
Run: `node --check scripts/games-load.mjs` — Expected: no output.

- [ ] **Step 2: Runbook**

In `docs/runbook.md`, in the "Live games" section:
- Under **Before deploying (one-time)**, add: "Migration `supabase/migrations/0050_draw_formats.sql` (draw formats) must also be applied **before** its code is deployed. It keeps the older code's draw working, so applying it first is safe. Then run `npm run check:games`; every line should say PASS (the tap-cap line can fail only if this computer's clock runs fast — check with `w32tm /stripchart /computer:time.google.com /samples:3 /dataonly`)."
- Under **Before the day**, add these bullets:
  - "Each draw has a **Format**: Slot machine, Wheel of names, Mosaic elimination (with **Rounds**) or Card round. Slot and wheel have a **Spin time** (3–20 s). A card round deals one card per prize, at most 20."
  - "Each game has an **LED background**: Theme (moving, in the event colour, with the logo), Green screen (solid #00B140 for the AV team to key out — tell them the colour), an image, or a looping video (MP4/WebM, up to 30 MB)."
  - "On the AV laptop, open the display link with `?test` on the end (for example `…/display/abcd?test`) and click to start. It plays a reel, a wheel, a card flip and a winner, with sound, and never touches the stage. If it says the display needs hardware graphics, switch to Chrome with hardware acceleration on."
  - "The display plays sound (countdown, drumroll, fanfare). Move the mouse to show the **Sound on/off** switch top-right; the laptop remembers it."
- Under **How the rules behave**, add:
  - "**Mosaic draw:** the winners are drawn when the host presses the first button; each **Next round** only fades tiles out. Nobody can tell the winners from the screen until the last round."
  - "**Card round:** the host taps the card the person calls out. **Not here** works only before a card is picked. **End game** while someone is still to pick sends them away (they can be drawn again in another draw)."
  - "**No tap counts anywhere.** The race shows positions only, on the LED, the phones and the host console."

- [ ] **Step 3: Spec status**

In `docs/superpowers/specs/2026-09-27-live-games-visuals-design.md`, change `Status: design approved, not built` to `Status: built YYYY-MM-DD, migration 0050 applied`, with the date the last task finishes (run `date +%F`).

- [ ] **Step 4: Commit**

```bash
git add scripts/games-load.mjs docs/runbook.md docs/superpowers/specs/2026-09-27-live-games-visuals-design.md
git commit -m "docs(games): runbook for draw formats, backgrounds and the display test"
```

---

### Task 24: Final verification, then ask to deploy

**Files:** none new.

- [ ] **Step 1: Baseline bundle size, on production (the old code)**

In the browser pane, open `https://ecphub.vercel.app/e/ecpkom/a/<an ecpkom attendee token>/play` and, once loaded, run with `javascript_tool`:
```js
performance.getEntriesByType("resource").filter((r) => r.initiatorType === "script").reduce((s, r) => s + (r.encodedBodySize || r.transferSize), 0)
```
Record the number. Do the same on the portal home `…/a/<token>`.

- [ ] **Step 2: Everything green**

Run: `npx vitest run` — Expected: all PASS.
Run: `npx tsc --noEmit` — Expected: no errors.
Run: `npm run lint` (if the script exists) — Expected: no errors in files this plan touched.
Run: `npm run build` — Expected: completes. Then confirm three.js stays off the phone: search the build output for the play route's chunks, or, simpler, in step 3 check that no loaded script URL on the play page contains a chunk with `three` in its module list (use `read_network_requests` and open the largest script responses to look for `WebGLRenderer`; it must not appear on the play page or the portal home).

- [ ] **Step 3: After bundle size, on the local production build**

Add a `prod` configuration to `.claude/launch.json` (`"runtimeExecutable": "npm", "runtimeArgs": ["run", "start"], "port": 3000`), start it, and repeat step 1's measurement on `http://localhost:3000/e/ecpkom/a/<token>/play` and the portal home. Report both before/after numbers to the user (D292). The portal home should grow only by the banner's share of `motion`.

- [ ] **Step 4: Full dress run on `ecpkom`**

On the local production build, with the display at 1920×1080 (or 1600×900 scaled), the host at phone size and two attendee play pages at phone size: one tap race, three quiz questions, and one draw in each format (slot with Draw all, wheel, mosaic with 4 rounds, card round with a "Not here" before a pick). Check the display self-test once more. Check the console for errors on every tab (`read_console_messages` with `onlyErrors`). Take a screenshot of each game's key moment for the user.

- [ ] **Step 5: Tidy the test event**

Put `ecpkom`'s games back as the user left them: KOM lucky draw as Slot machine with Theme, and Reset draw on it; end any game on stage.

- [ ] **Step 6: Report and ask**

Tell the user what was built, the before/after bundle numbers, and the screenshots. Ask: "Everything passes on ecpkom. OK to push main (this deploys to Vercel)?" Push only on a yes:
```bash
git push origin main
```
