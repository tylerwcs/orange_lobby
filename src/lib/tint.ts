/**
 * The portal's own launcher pictures in the event's colour (D488). They are drawn in ECP Hub
 * orange; an event with another primary colour gets them hue-shifted to it on the server, so
 * an organiser never has to upload replacements just to match their brand.
 *
 * The shift happens in LCh, the colour space sharp's `modulate` works in: the hue turns from
 * the art's orange to the event's, and the colourfulness scales down for a muted brand colour.
 * Lightness is left alone, so the pale circle stays pale and the shading reads the same.
 *
 * Pure and client-safe: the launcher builds these URLs on the server and in the setup preview.
 */

/** The orange the art was drawn in: the app's default primary colour. */
const ART_COLOUR = "#f97316";

/** The pictures this applies to, by file name under /portal-icons. An upload is never touched. */
export const TINTABLE_ICONS = ["agenda", "info", "group", "floor-plan", "post-event"] as const;
export type TintableIcon = (typeof TINTABLE_ICONS)[number];

const DEFAULT_PATH = /^\/portal-icons\/([a-z-]+)\.webp$/;
const HEX = /^#?([0-9a-f]{6})$/i;

export function isTintableIcon(name: string): name is TintableIcon {
  return (TINTABLE_ICONS as readonly string[]).includes(name);
}

/** "#005CB9" or "005cb9" as "005cb9"; null for anything that is not a six-digit hex colour. */
export function normaliseHex(colour: string): string | null {
  return HEX.exec(colour.trim())?.[1].toLowerCase() ?? null;
}

type Lch = { L: number; C: number; h: number };

/** sRGB hex to CIE LCh(ab), D65 - what libvips' LCh is. */
export function hexToLch(hex: string): Lch {
  const n = parseInt(hex, 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const a = 500 * (f(X) - f(Y));
  const bb = 200 * (f(Y) - f(Z));
  return { L: 116 * f(Y) - 16, C: Math.hypot(a, bb), h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
}

/** Below this chroma a colour is a grey: the pictures go grey with it rather than take a hue it does not really have. */
const GREY = 8;
/** A colour with any real hue keeps at least this much of the art's colourfulness, so a dark navy still reads as blue. */
const MIN_SATURATION = 0.35;

/**
 * What sharp's `modulate` needs to turn the art into this colour, or null when the colour is
 * the art's own (or close enough that nobody would see the shift) and the original file serves.
 */
export function tintFor(hex: string): { hue: number; saturation: number } | null {
  const art = hexToLch(ART_COLOUR.slice(1));
  const to = hexToLch(hex);
  const ratio = to.C / art.C;
  const saturation = to.C < GREY ? ratio : Math.min(1, Math.max(MIN_SATURATION, ratio));
  const hue = Math.round((((to.h - art.h) % 360) + 360) % 360);
  const turn = Math.min(hue, 360 - hue);
  if (turn <= 3 && saturation >= 0.9) return null;
  return { hue, saturation: Math.round(saturation * 100) / 100 };
}

/**
 * The picture to draw for a launcher button: a default one in this event's colour, anything
 * else as it is. Served from /portal-icons, which an event's own address passes through (D425).
 */
export function tintedIcon(image: string | null, colour: string | null | undefined): string | null {
  if (!image || !colour) return image;
  const name = DEFAULT_PATH.exec(image)?.[1];
  const hex = normaliseHex(colour);
  if (!name || !isTintableIcon(name) || !hex || !tintFor(hex)) return image;
  return `/portal-icons/tint/${name}/${hex}`;
}
