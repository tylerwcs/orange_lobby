/**
 * WCAG 2.x contrast, in the app rather than only in the test suite.
 *
 * `tests/contrast.test.ts` has proved the *fixed* palette for a while. The one colour it
 * could never see is the one that matters most on the portal: an event's own
 * `primary_color`, which arrives from the database and is injected at runtime. The 8 Sep
 * audit found an event mark sitting at 3.97:1 and it survived a whole redesign, because
 * nothing in the code could tell.
 *
 * These are the same formulas the test uses, kept pure so they can be tested the same way.
 */
export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function channelToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function relativeLuminance([r, g, b]: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map(channelToLinear);
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const lA = relativeLuminance(a);
  const lB = relativeLuminance(b);
  return (Math.max(lA, lB) + 0.05) / (Math.min(lA, lB) + 0.05);
}

const WHITE: Rgb = [255, 255, 255];
const INK: Rgb = [17, 24, 39]; // --foreground #111827

/**
 * Black or white, whichever can actually be read on this fill. A mid-tone brand colour -
 * and event organisers pick plenty of them - fails white text and passes dark, or the
 * reverse; picking one and hoping is how 3.97:1 shipped.
 */
export function readableOn(fill: Rgb): { hex: string; ratio: number } {
  const onWhite = contrastRatio(fill, WHITE);
  const onInk = contrastRatio(fill, INK);
  return onWhite >= onInk
    ? { hex: "#FFFFFF", ratio: onWhite }
    : { hex: "#111827", ratio: onInk };
}

// --- Oklab, so darkening keeps the hue it started with ---

function toLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function fromLinear(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

/** [L, a, b] — L is perceptual lightness in 0..1. */
export function rgbToOklab([r8, g8, b8]: Rgb): [number, number, number] {
  const [r, g, b] = [r8, g8, b8].map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToRgb([L, A, B]: [number, number, number]): Rgb {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/**
 * Darkens a colour until text on white clears `target`, keeping its hue.
 *
 * Done by lowering Oklab lightness, NOT by scaling rgb channels. Scaling desaturates:
 * the first version of this turned #F97316 into #986A3E, a brown, because multiplying
 * r, g and b by the same factor moves a saturated colour toward grey as it darkens.
 *
 * Returns the original when it already passes, and stops rather than looping to black.
 */
export function darkenUntilReadable(fill: Rgb, target = 4.5): Rgb {
  if (contrastRatio(fill, WHITE) >= target) return fill;
  const [, A, B] = rgbToOklab(fill);
  let [L] = rgbToOklab(fill);
  for (let i = 0; i < 40 && L > 0; i++) {
    L -= 0.02;
    const candidate = oklabToRgb([L, A, B]);
    if (contrastRatio(candidate, WHITE) >= target) return candidate;
  }
  return oklabToRgb([Math.max(0, L), A, B]);
}

/**
 * The mirror of `darkenUntilReadable`, for text on a dark ground: raises Oklab lightness,
 * keeping the hue, until the colour clears `target` against `ground`. A colour that already
 * does is returned untouched, so a bright brand stays exactly the organiser's.
 */
export function lightenUntilReadable(fill: Rgb, ground: Rgb, target = 4.5): Rgb {
  if (contrastRatio(fill, ground) >= target) return fill;
  const [, A, B] = rgbToOklab(fill);
  let [L] = rgbToOklab(fill);
  for (let i = 0; i < 50 && L < 1; i++) {
    L += 0.02;
    const candidate = oklabToRgb([L, A, B]);
    if (contrastRatio(candidate, ground) >= target) return candidate;
  }
  return oklabToRgb([Math.min(1, L), A, B]);
}

export function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}
