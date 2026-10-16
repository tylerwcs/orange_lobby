import { brandStyle } from "@/lib/brand";
import type { Event } from "@/lib/types";
import { contrastRatio, hexToRgb, oklabToRgb, readableOn, rgbToOklab, toHex, type Rgb } from "@/lib/contrast";

/** D623: the worked-out colours an organiser can override, each on its own picker. */
export type ThemeColorKey = "card" | "text" | "muted_text" | "border" | "heading";
/** D632: how far the heading colour reaches. */
export type HeadingReach = "titles" | "titles_and_cards";
/** D636: the page behind the cards - one flat colour, or soft glows worked out from it and the primary. */
export type BackgroundStyle = "solid" | "glow";
/**
 * D622/D623: an event's theme as stored. A null background is the default ground; an absent
 * override is worked out; an absent background_style is solid (D636).
 */
export type EventTheme = {
  background: string | null;
  overrides: Partial<Record<ThemeColorKey, string>>;
  heading_reach: HeadingReach;
  background_style?: BackgroundStyle;
};

export const EMPTY_THEME: EventTheme = { background: null, overrides: {}, heading_reach: "titles" };
/** D622: the ground when the organiser has not picked one (globals.css --background). */
export const DEFAULT_BACKGROUND = "#F5F5F3";

const KEYS: ThemeColorKey[] = ["card", "text", "muted_text", "border", "heading"];
const HEX = /^#[0-9a-fA-F]{6}$/;
const WHITE: Rgb = [255, 255, 255];
const INK = "#111827"; // globals.css --foreground
const MUTED_INK = "#4B5563"; // globals.css --muted-foreground
const MIN = 4.5;
/** The tokens globals.css's `.rich-text` maps Tailwind Typography's colours to (final review 1). */
const RICH = ["--rich-text", "--rich-muted", "--rich-rule"];

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
  const theme: EventTheme = { background: hex(r.background), overrides, heading_reach: r.heading_reach === "titles_and_cards" ? "titles_and_cards" : "titles" };
  // D636: only "glow" is stored; anything else is the solid default, left out so untouched themes stay as they were.
  if (r.background_style === "glow") theme.background_style = "glow";
  return theme;
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

/** `bg-<colour>/<alpha>` over a surface, flattened as the browser composites it (in sRGB). */
function over(fg: Rgb, alpha: number, surface: Rgb): Rgb {
  return surface.map((c, i) => Math.round(fg[i] * alpha + c * (1 - alpha))) as Rgb;
}

/**
 * D636: the glow - a lifted ground from the top, and the primary in two corners like stage lights.
 * Fainter on a light ground, where the same strength reads as a wash. `peaks` are the brightest
 * points as they composite over the ground, which page text must read on too (D624).
 */
function glow(ground: Rgb, brand: Rgb): { css: string; peaks: Rgb[] } {
  const isDark = dark(ground);
  const top = isDark ? lift(ground, 0.16, 1.2) : mix(WHITE, ground, 0.7);
  let [aTop, aLeft, aRight] = isDark ? [0.75, 0.45, 0.4] : [0.8, 0.16, 0.14];
  // A bright primary on a dark ground (or a dark one on a light ground) would leave no text
  // colour readable on both the ground and the glow: soften the glow until the page's own ink
  // still reads on its brightest point.
  const ink = isDark ? WHITE : hexToRgb(INK)!;
  const peaksAt = (t: number, l: number, r: number) => {
    const topPeak = over(top, t, ground);
    return [topPeak, over(brand, l, ground), over(brand, r, ground), over(brand, l, topPeak)];
  };
  for (let i = 0; i < 20 && worst(ink, peaksAt(aTop, aLeft, aRight)) < MIN; i++) {
    [aTop, aLeft, aRight] = [aTop * 0.85, aLeft * 0.85, aRight * 0.85].map((a) => Math.round(a * 100) / 100);
  }
  const rgba = (c: Rgb, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const css = [
    `radial-gradient(130% 55% at 50% 0%,${rgba(top, aTop)} 0%,transparent 70%)`,
    `radial-gradient(70% 40% at 0% 8%,${rgba(brand, aLeft)} 0%,transparent 70%)`,
    `radial-gradient(80% 45% at 100% 100%,${rgba(brand, aRight)} 0%,transparent 70%)`,
  ].join(",");
  return { css, peaks: peaksAt(aTop, aLeft, aRight) };
}

/** `bg-white/10` over a surface - the badge's pin tile. */
function wash(surface: Rgb): Rgb {
  return over(WHITE, 0.1, surface);
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
  // Form errors, the destructive alert and ghost buttons draw `text-destructive` on cards (and the
  // page): lightened like --warning, and kept readable on its own tints (bg-destructive/10, /20
  // hover) and at the alert description's /90. The card decides when the page is the other polarity.
  const red = hexToRgb("#DC2626")!;
  const destructive = ensure(red, dark(ground) ? [ground, card] : [card], MIN, (c) =>
    contrastRatio(c, over(c, 0.2, card)) >= MIN && contrastRatio(over(c, 0.9, card), card) >= MIN).rgb;
  out["--destructive"] = toHex(destructive);
  // The fill under the cancel and delete confirms' text (bg-destructive text-destructive-foreground).
  out["--destructive-foreground"] = readableOn(destructive).hex;
  return out;
}

/** Tailwind's `bg-success` (globals.css --success, never re-drawn): the badge check-in pill's fill at 25%. */
const SUCCESS = "#16A34A";
/** globals.css --success-soft: the check-in pill's text today, the seed of its re-drawn one. */
const SUCCESS_SOFT = "#E7F6EC";

/**
 * `dark` is the colour scheme native controls follow: the card's polarity, as they sit on cards
 * (final review 1 ruling) - the ground decides the worked-out set (D630), the card the scheme.
 */
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

  // D636: with the glow on, text on the page must also read on its brightest points.
  const brand = primary && HEX.test(primary) ? primary : brandStyle(null)["--brand"];
  const brandRgb = hexToRgb(brand)!;
  const glowing = theme.background_style === "glow" ? glow(ground, brandRgb) : null;
  const page = glowing ? [ground, ...glowing.peaks] : [ground];

  // D624: text is checked where it sits - the ground and the cards separately, so a white card on
  // navy (mixed polarity) gets ink while the page keeps white.
  const text = rgb("text");
  const inkFor = (g: Rgb) => (dark(g) ? WHITE : hexToRgb(INK)!);
  const fg = readableOrFallback(text, page, inkFor(ground), !!o.text);
  const cardFg = readableOrFallback(text, [card], inkFor(card), !!o.text);
  const secondaryFg = ensure(cardFg.rgb, [fills], MIN);
  flag("text", fg.adjusted || cardFg.adjusted);
  // Secondary text, like text, is checked where it sits. With the card and the ground on the same
  // side one colour serves both; with mixed polarity (white cards on navy) the page keeps the
  // organiser's colour and cards get their own, which globals.css swaps in on card surfaces.
  const mixed = dark(card) !== isDark;
  const muted = ensure(rgb("muted_text"), mixed ? page : [...page, card, fills], MIN);
  const cardMuted = mixed ? ensure(rgb("muted_text"), [card, fills], MIN) : muted;
  flag("muted_text", muted.adjusted || cardMuted.adjusted);

  // D72 on the theme's grounds: the organiser's colour as text on page, cards and the muted fills
  // inside them (links in event terms, rich text in a muted panel), carrying readable button text.
  const ink = ensure(brandRgb, [...page, card, fills], MIN, (c) => readableOn(c).ratio >= MIN).rgb;
  const accent = mix(brandRgb, ground, 0.14);
  const fill = brandStyle(brand);

  // The two pills on the feature panel (badge check-in, passport complete) are tinted by a colour
  // at 25% over the panel, so they read their own tokens, not the card's re-drawn status ones.
  const pill = (tint: Rgb) => over(tint, 0.25, s.feature);
  const featureSuccess = ensure(hexToRgb(SUCCESS_SOFT)!, [pill(hexToRgb(SUCCESS)!)], MIN).rgb;
  const featureAccent = ensure(mix(brandRgb, WHITE, 0.14), [pill(brandRgb)], MIN).rgb;

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
    "--card-muted-foreground": toHex(cardMuted.rgb),
    "--border": toHex(border),
    "--input": toHex(border),
    // D629: the event bar is the ground whenever the ground is not the default - and so is its
    // text, which must not inherit the card's ink when a card override flips polarity.
    "--bar": toHex(ground),
    "--bar-foreground": toHex(fg.rgb),
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
    "--feature-success": toHex(featureSuccess),
    "--feature-accent": toHex(featureAccent),
    // Organiser rich text (globals.css `.rich-text`): body and headings in the colour of the text
    // around it - the card's on a card, the page's on the page - so they read wherever they sit;
    // captions and rules in the theme's secondary text and border. Unset, prose keeps today's greys.
    "--rich-text": "currentColor",
    "--rich-muted": toHex(cardMuted.rgb),
    "--rich-rule": toHex(border),
  };

  // D632: headings default to the text colour (inherited); an override reaches titles, or cards too.
  if (o.heading) {
    const heading = readableOrFallback(hexToRgb(o.heading)!, [...page, card], fg.rgb);
    flag("heading", heading.adjusted);
    tokens["--heading"] = toHex(heading.rgb);
    if (theme.heading_reach === "titles_and_cards") tokens["--card-heading"] = tokens["--heading"];
  }

  if (glowing) {
    // D636: painted behind the page by globals.css; the bar goes clear so the top glow is not cut off.
    tokens["--page-glow"] = glowing.css;
    tokens["--bar"] = "transparent";
  }
  if (isDark) {
    // D628: dark logos stay visible on a white tile.
    tokens["--logo-tile"] = "#FFFFFF";
    tokens["--logo-pad"] = "4px";
  }
  // Status chips sit on cards: re-drawn for a dark card; a light one keeps globals.css's.
  if (dark(card)) Object.assign(tokens, darkStatus(ground, card));
  // Native controls (selects, date pickers, checkboxes) sit on cards, so the card picks the scheme.
  return { tokens, dark: dark(card), adjusted };
}

/**
 * D622-D624, D630: the CSS variables an event's portal reads, from its theme and primary colour.
 *  - No background, no overrides: exactly `brandStyle(primary)` - every untouched event as today.
 *  - Background set: the whole worked-out set, overrides winning, every text/ground pair at 4.5:1.
 *  - Overrides on the default ground: only the tokens they change (and the rich-text ones), so
 *    the rest (and the white event bar, D629) stay globals.css's.
 * `adjusted` names the overrides that had to move to be read (D624: shown adjusted, never rejected).
 */
export function themeTokens(theme: EventTheme, primary: string | null): Built {
  const plain = brandStyle(primary);
  const hasOverrides = Object.keys(theme.overrides).length > 0;
  const ground = theme.background ? hexToRgb(theme.background) : null;
  if (ground) return build(ground, theme, primary);
  if (!hasOverrides && theme.background_style !== "glow") return { tokens: plain, dark: false, adjusted: {} };

  const def = hexToRgb(DEFAULT_BACKGROUND)!;
  const themed = build(def, theme, primary);
  const untouched = build(def, { ...theme, overrides: {}, background_style: undefined }, primary).tokens;
  const tokens = { ...plain };
  for (const [k, v] of Object.entries(themed.tokens)) if (untouched[k] !== v) tokens[k] = v;
  // Rich text follows the theme once any colour is set: its unset greys are tuned for white cards.
  for (const k of RICH) tokens[k] = themed.tokens[k];
  return { tokens, dark: themed.dark, adjusted: themed.adjusted };
}

/** D622: the tokens as one `:root` rule, with the colour scheme native controls follow (D630). */
export function themeCss(tokens: Record<string, string>, dark: boolean): string {
  const body = Object.entries(tokens).map(([k, v]) => `${k}:${v};`).join("");
  // A themed card can differ from the page (white cards on navy). Parts on it that paint with the
  // page's colours - outline buttons (bg-background), hover text (text-foreground) - take the
  // card's there. Only when the theme sets the card, so untouched events and admin keep theirs.
  const onCards = "--card" in tokens ? ".bg-card,.bg-popover{--background:var(--card);--foreground:var(--card-foreground)}" : "";
  return `:root{${body}color-scheme:${dark ? "dark" : "light"}}${onCards}`;
}

/** D625: the `:root` rule an attendee page of this event carries. No theme set: exactly today's brand tokens. */
export function eventThemeCss(event: { theme?: Event["theme"]; primary_color: string | null }): string {
  const { tokens, dark } = themeTokens(event.theme ?? EMPTY_THEME, event.primary_color);
  return themeCss(tokens, dark);
}
