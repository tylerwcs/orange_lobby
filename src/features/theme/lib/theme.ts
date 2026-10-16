import { brandStyle } from "@/lib/brand";
import type { Event } from "@/lib/types";
import { contrastRatio, hexToRgb, oklabToRgb, readableOn, rgbToOklab, toHex, type Rgb } from "@/lib/contrast";

/** D623: the worked-out colours an organiser can override, each on its own picker. */
export type ThemeColorKey = "card" | "text" | "muted_text" | "border" | "heading";
/** D632: how far the heading colour reaches. */
export type HeadingReach = "titles" | "titles_and_cards";
/** D622/D623: an event's theme as stored. A null background is the default ground; an absent override is worked out. */
export type EventTheme = { background: string | null; overrides: Partial<Record<ThemeColorKey, string>>; heading_reach: HeadingReach };

export const EMPTY_THEME: EventTheme = { background: null, overrides: {}, heading_reach: "titles" };
/** D622: the ground when the organiser has not picked one (globals.css --background). */
export const DEFAULT_BACKGROUND = "#F5F5F3";

const KEYS: ThemeColorKey[] = ["card", "text", "muted_text", "border", "heading"];
const HEX = /^#[0-9a-fA-F]{6}$/;
const WHITE: Rgb = [255, 255, 255];
const INK = "#111827"; // globals.css --foreground
const MUTED_INK = "#4B5563"; // globals.css --muted-foreground
const MIN = 4.5;

const hex = (v: unknown): string | null => (typeof v === "string" && HEX.test(v.trim()) ? v.trim().toLowerCase() : null);

/** D622/D623: a stored theme, read defensively - a colour that is not #RRGGBB is dropped, as if never set. */
export function parseTheme(raw: unknown): EventTheme {
  if (!raw || typeof raw !== "object") return { ...EMPTY_THEME, overrides: {} };
  const r = raw as Record<string, unknown>;
  const given = r.overrides && typeof r.overrides === "object" ? (r.overrides as Record<string, unknown>) : {};
  const overrides: EventTheme["overrides"] = {};
  for (const k of KEYS) {
    const v = hex(given[k]);
    if (v) overrides[k] = v;
  }
  return { background: hex(r.background), overrides, heading_reach: r.heading_reach === "titles_and_cards" ? "titles_and_cards" : "titles" };
}

/** D630: a ground is dark when white text reads better on it than ink - the organiser never picks "dark mode". */
export function isDarkGround(color: string): boolean {
  const rgb = hexToRgb(color);
  return !!rgb && readableOn(rgb).hex === "#FFFFFF";
}

const dark = (rgb: Rgb) => readableOn(rgb).hex === "#FFFFFF";
const worst = (c: Rgb, grounds: Rgb[]) => Math.min(...grounds.map((g) => contrastRatio(c, g)));
const chroma = (rgb: Rgb) => {
  const [, A, B] = rgbToOklab(rgb);
  return Math.hypot(A, B);
};

type Walked = { rgb: Rgb; passed: boolean; kept: boolean };

/**
 * Walks Oklab L in 0.02 steps (hue and chroma kept) until every ground passes and `also` holds,
 * at most 50 steps. When nothing does, the best ground contrast among the steps that still keep
 * `also` (`kept`) - the grounds are the best effort, `also` is not; any step only if none keeps it.
 */
function walk(fg: Rgb, grounds: Rgb[], min: number, up: boolean, also: (c: Rgb) => boolean): Walked {
  const [L0, A, B] = rgbToOklab(fg);
  const better = (c: Rgb, than: Rgb | null) => !than || worst(c, grounds) > worst(than, grounds);
  let kept: Rgb | null = also(fg) ? fg : null;
  let any = fg;
  for (let i = 1; i <= 50; i++) {
    const c = oklabToRgb([Math.max(0, Math.min(1, L0 + (up ? 0.02 : -0.02) * i)), A, B]);
    const holds = also(c);
    if (holds && worst(c, grounds) >= min) return { rgb: c, passed: true, kept: true };
    if (holds && better(c, kept)) kept = c;
    if (better(c, any)) any = c;
  }
  return kept ? { rgb: kept, passed: false, kept: true } : { rgb: any, passed: false, kept: false };
}

function ensure(fg: Rgb, grounds: Rgb[], min: number, also: (c: Rgb) => boolean = () => true): { rgb: Rgb; adjusted: boolean } {
  if (worst(fg, grounds) >= min && also(fg)) return { rgb: fg, adjusted: false };
  // Lighter on dark grounds, darker on light. The other way is tried when that fails: a ground
  // just on the dark side can fail even white, and mixed grounds (a white card on navy) may have
  // no colour that passes on both, so the better of the two is kept - one that keeps `also` first.
  const up = grounds.filter(dark).length * 2 >= grounds.length;
  const first = walk(fg, grounds, min, up, also);
  if (first.passed) return { rgb: first.rgb, adjusted: true };
  const other = walk(fg, grounds, min, !up, also);
  const rank = (w: Walked) => [w.passed ? 1 : 0, w.kept ? 1 : 0, worst(w.rgb, grounds)];
  const [a, b] = [rank(first), rank(other)];
  const otherWins = a[0] !== b[0] ? b[0] > a[0] : a[1] !== b[1] ? b[1] > a[1] : b[2] > a[2];
  return { rgb: (otherWins ? other : first).rgb, adjusted: true };
}

/**
 * D624: a text colour moved until it reads on every ground at `min` (4.5:1) - lighter when the
 * grounds are dark, darker when they are light - keeping its hue, the move `--primary` already
 * makes (D72). `adjusted` is false when it already passed.
 */
export function ensureReadable(fg: Rgb, grounds: Rgb[], min = MIN): { rgb: Rgb; adjusted: boolean } {
  return ensure(fg, grounds, min);
}

/**
 * D624, carrying D619's `headingOnWhite` rule: a coloured pick that fails is moved keeping its
 * hue; white or a grey has no hue to keep - moving it gives a dull mid-grey - so it falls back.
 * So does a worked-out colour (`keepHue` false): it was only ever the ground's white or ink.
 */
function readableOrFallback(fg: Rgb, grounds: Rgb[], fallback: Rgb, keepHue = true): { rgb: Rgb; adjusted: boolean } {
  if (worst(fg, grounds) >= MIN) return { rgb: fg, adjusted: false };
  if (!keepHue || chroma(fg) < 0.03) return { rgb: ensure(fallback, grounds, MIN).rgb, adjusted: true };
  return ensure(fg, grounds, MIN);
}

/** The ground's own hue and chroma at a new lightness, lifted further until it stands `ratio` apart from it. */
function lift(ground: Rgb, dL: number, ratio: number): Rgb {
  const [L, A, B] = rgbToOklab(ground);
  let c = oklabToRgb([Math.min(1, L + dL), A, B]);
  for (let i = 1; i <= 50 && contrastRatio(c, ground) < ratio; i++) c = oklabToRgb([Math.min(1, L + dL + 0.01 * i), A, B]);
  return c;
}

/** `bg-white/10` over a surface, flattened as the browser composites it (in sRGB). */
function wash(surface: Rgb): Rgb {
  return surface.map((c) => Math.round(c * 0.9 + 255 * 0.1)) as Rgb;
}

function shade(ground: Rgb, dL: number): Rgb {
  const [L, A, B] = rgbToOklab(ground);
  return oklabToRgb([Math.max(0, L + dL), A, B]);
}

/** Oklab mix, `t` of `a` into `b` - computed here, not left to CSS `color-mix` (D624: what ships is measured). */
function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const [x, y] = [rgbToOklab(a), rgbToOklab(b)];
  return oklabToRgb([x[0] * t + y[0] * (1 - t), x[1] * t + y[1] * (1 - t), x[2] * t + y[2] * (1 - t)]);
}

/**
 * D623: the surfaces the theme works out from the ground. Dark grounds (option A) lift the
 * ground's own navy - tuned so #000C36 lands near the approved mockup's cards #0F1D52 and
 * borders #24336B; `lift` keeps a near-black ground's cards visibly apart. Light grounds keep
 * today's white cards, except on a ground already white.
 */
function surfaces(ground: Rgb) {
  if (dark(ground)) {
    return {
      card: lift(ground, 0.08, 1.18),
      muted: lift(ground, 0.12, 1.3),
      border: lift(ground, 0.16, 1.55),
      feature: lift(ground, 0.1, 1.25),
    };
  }
  const card = rgbToOklab(ground)[0] >= 0.99 ? shade(ground, -0.03) : WHITE;
  const lower = rgbToOklab(card)[0] < rgbToOklab(ground)[0] ? card : ground;
  return { card, muted: shade(lower, -0.01), border: shade(ground, -0.06), feature: hexToRgb(INK)! };
}

/** D623: the dark set's secondary text - the ground's hue, softened, at L 0.82 (#000C36 gives the mockup's blue-grey). */
function mutedOnDark(ground: Rgb): Rgb {
  const [, A, B] = rgbToOklab(ground);
  const c = Math.hypot(A, B);
  const k = c === 0 ? 0 : Math.min(c * 0.6, 0.06) / c;
  return oklabToRgb([0.82, A * k, B * k]);
}

/**
 * D623: every overridable colour worked out from a ground, as the Settings pickers show it.
 * Text colours are already readable on the ground and the worked-out cards (D624); headings
 * default to the text colour.
 */
export function workedOut(background: string): Record<ThemeColorKey, string> {
  const ground = hexToRgb(background) ?? hexToRgb(DEFAULT_BACKGROUND)!;
  const s = surfaces(ground);
  const isDark = dark(ground);
  const grounds = [ground, s.card];
  const text = ensure(isDark ? WHITE : hexToRgb(INK)!, grounds, MIN).rgb;
  const muted = ensure(isDark ? mutedOnDark(ground) : hexToRgb(MUTED_INK)!, [...grounds, s.muted], MIN).rgb;
  return { card: toHex(s.card), text: toHex(text), muted_text: toHex(muted), border: toHex(s.border), heading: toHex(text) };
}

/** D624, D630: the status colours a dark card re-draws (globals.css's are tuned for white). The seed gives the hue. */
const STATUS: [name: string, seed: string][] = [
  ["success", "#16A34A"],
  ["destructive", "#DC2626"],
  ["gold", "#FDE68A"],
  ["silver", "#94A3B8"],
  ["bronze", "#EA580C"],
];

function darkStatus(ground: Rgb, card: Rgb): Record<string, string> {
  const softL = Math.max(0.32, rgbToOklab(card)[0] + 0.06);
  const soft = (seed: Rgb) => {
    const [, A, B] = rgbToOklab(seed);
    const c = Math.hypot(A, B);
    const k = c === 0 ? 0 : Math.min(c, 0.07) / c;
    return oklabToRgb([softL, A * k, B * k]);
  };
  const out: Record<string, string> = {};
  for (const [name, seedHex] of STATUS) {
    const seed = hexToRgb(seedHex)!;
    const s = soft(seed);
    out[`--${name}-soft`] = toHex(s);
    out[`--${name}-strong`] = toHex(ensure(seed, [s, card], MIN).rgb);
  }
  const warn = hexToRgb("#B45309")!;
  const warnSoft = soft(warn);
  out["--warning-soft"] = toHex(warnSoft);
  out["--warning"] = toHex(ensure(warn, [ground, card, warnSoft], MIN).rgb);
  return out;
}

type Built = { tokens: Record<string, string>; dark: boolean; adjusted: Partial<Record<ThemeColorKey, true>> };

function build(ground: Rgb, theme: EventTheme, primary: string | null): Built {
  const isDark = dark(ground);
  const o = theme.overrides;
  const base = workedOut(toHex(ground));
  const s = surfaces(ground);
  const rgb = (key: ThemeColorKey) => hexToRgb(o[key] ?? base[key])!;
  const card = rgb("card");
  const border = rgb("border");
  // Secondary and muted fills sit mostly on cards, so a picked card brings its own.
  const fills = !o.card ? s.muted : dark(card) ? lift(card, 0.04, 1.12) : shade(card, -0.03);
  const adjusted: Built["adjusted"] = {};
  const flag = (key: ThemeColorKey, moved: boolean) => {
    if (moved && o[key]) adjusted[key] = true;
  };

  // D624: text is checked where it sits - the ground and the cards separately, so a white card on
  // navy (mixed polarity) gets ink while the page keeps white.
  const text = rgb("text");
  const inkFor = (g: Rgb) => (dark(g) ? WHITE : hexToRgb(INK)!);
  const fg = readableOrFallback(text, [ground], inkFor(ground), !!o.text);
  const cardFg = readableOrFallback(text, [card], inkFor(card), !!o.text);
  const secondaryFg = ensure(cardFg.rgb, [fills], MIN);
  flag("text", fg.adjusted || cardFg.adjusted);
  const muted = ensure(rgb("muted_text"), [ground, card, fills], MIN);
  flag("muted_text", muted.adjusted);

  // D72 on the theme's grounds: the organiser's colour as text on page and cards, carrying readable button text.
  const brand = primary && HEX.test(primary) ? primary : brandStyle(null)["--brand"];
  const brandRgb = hexToRgb(brand)!;
  const ink = ensure(brandRgb, [ground, card], MIN, (c) => readableOn(c).ratio >= MIN).rgb;
  const accent = mix(brandRgb, ground, 0.14);
  const fill = brandStyle(brand);

  const tokens: Record<string, string> = {
    "--background": toHex(ground),
    "--foreground": toHex(fg.rgb),
    "--card": toHex(card),
    "--card-foreground": toHex(cardFg.rgb),
    "--popover": toHex(card),
    "--popover-foreground": toHex(cardFg.rgb),
    "--secondary": toHex(fills),
    "--secondary-foreground": toHex(secondaryFg.rgb),
    "--muted": toHex(fills),
    "--muted-foreground": toHex(muted.rgb),
    "--border": toHex(border),
    "--input": toHex(border),
    // D629: the event bar is the ground whenever the ground is not the default.
    "--bar": toHex(ground),
    "--feature": toHex(s.feature),
    "--feature-foreground": toHex(ensure(hexToRgb(readableOn(s.feature).hex)!, [s.feature], MIN).rgb),
    "--primary": toHex(ink),
    "--primary-foreground": readableOn(ink).hex,
    "--ring": toHex(ink),
    "--accent": toHex(accent),
    "--accent-foreground": toHex(ensure(ink, [accent], MIN).rgb),
    "--brand": fill["--brand"],
    "--brand-foreground": fill["--brand-foreground"],
    // Its one reader is the badge's pin text, on a 10% white tile over the feature panel (BADGE_TILE's job in brand.ts).
    "--brand-on-dark": toHex(ensure(brandRgb, [s.feature, wash(s.feature)], MIN).rgb),
  };

  // D632: headings default to the text colour (inherited); an override reaches titles, or cards too.
  if (o.heading) {
    const heading = readableOrFallback(hexToRgb(o.heading)!, [ground, card], fg.rgb);
    flag("heading", heading.adjusted);
    tokens["--heading"] = toHex(heading.rgb);
    if (theme.heading_reach === "titles_and_cards") tokens["--card-heading"] = tokens["--heading"];
  }

  if (isDark) {
    // D628: dark logos stay visible on a white tile.
    tokens["--logo-tile"] = "#FFFFFF";
    tokens["--logo-pad"] = "4px";
  }
  // Status chips sit on cards: re-drawn for a dark card; a light one keeps globals.css's.
  if (dark(card)) Object.assign(tokens, darkStatus(ground, card));
  return { tokens, dark: isDark, adjusted };
}

/**
 * D622-D624, D630: the CSS variables an event's portal reads, from its theme and primary colour.
 *  - No background, no overrides: exactly `brandStyle(primary)` - every untouched event as today.
 *  - Background set: the whole worked-out set, overrides winning, every text/ground pair at 4.5:1.
 *  - Overrides on the default ground: only the tokens they change, so the rest (and the white
 *    event bar, D629) stay globals.css's.
 * `adjusted` names the overrides that had to move to be read (D624: shown adjusted, never rejected).
 */
export function themeTokens(theme: EventTheme, primary: string | null): Built {
  const plain = brandStyle(primary);
  const hasOverrides = Object.keys(theme.overrides).length > 0;
  const ground = theme.background ? hexToRgb(theme.background) : null;
  if (ground) return build(ground, theme, primary);
  if (!hasOverrides) return { tokens: plain, dark: false, adjusted: {} };

  const def = hexToRgb(DEFAULT_BACKGROUND)!;
  const themed = build(def, theme, primary);
  const untouched = build(def, { ...theme, overrides: {} }, primary).tokens;
  const tokens = { ...plain };
  for (const [k, v] of Object.entries(themed.tokens)) if (untouched[k] !== v) tokens[k] = v;
  return { tokens, dark: false, adjusted: themed.adjusted };
}

/** D622: the tokens as one `:root` rule, with the colour scheme native controls follow (D630). */
export function themeCss(tokens: Record<string, string>, dark: boolean): string {
  const body = Object.entries(tokens).map(([k, v]) => `${k}:${v};`).join("");
  return `:root{${body}color-scheme:${dark ? "dark" : "light"}}`;
}

/** D625: the `:root` rule an attendee page of this event carries. No theme set: exactly today's brand tokens. */
export function eventThemeCss(event: { theme?: Event["theme"]; primary_color: string | null }): string {
  const { tokens, dark } = themeTokens(event.theme ?? EMPTY_THEME, event.primary_color);
  return themeCss(tokens, dark);
}
