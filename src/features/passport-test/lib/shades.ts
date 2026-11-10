import { contrastRatio, hexToRgb, oklabToRgb, rgbToOklab, toHex, type Rgb } from "@/lib/contrast";
import type { PassportTest } from "./settings";

/** The cover's foil (D885): fixed, so every cover darkens to suit it rather than the other way round. */
export const COVER_GOLD = "#D9B26A";
/** A cover with no override and no brand colour. */
const DEFAULT_COVER = "#1F3A5F";

/**
 * D876: one personality colour as the holder page uses it - the accent itself, a dark ink for
 * labels and words, and a pale wash for the pills. Same hue, Oklab lightness moved.
 */
export function personalityShades(hex: string): { accent: string; dark: string; light: string } {
  const rgb = hexToRgb(hex) ?? hexToRgb("#3E7BD9")!;
  const [, A, B] = rgbToOklab(rgb);
  return { accent: toHex(rgb), dark: toHex(oklabToRgb([0.32, A * 0.6, B * 0.6])), light: toHex(oklabToRgb([0.93, A * 0.25, B * 0.25])) };
}

/**
 * D885: the cover's colour - the organiser's override, else the event's brand colour - darkened
 * until the gold foil reads on it (3:1, large lettering). A colour that already passes is kept.
 */
export function coverColour(t: PassportTest, brand: string | null): string {
  const fill = hexToRgb(t.cover.colour ?? brand ?? DEFAULT_COVER) ?? hexToRgb(DEFAULT_COVER)!;
  return toHex(darkenUnder(fill, hexToRgb(COVER_GOLD)!, 3));
}

function darkenUnder(fill: Rgb, ink: Rgb, target: number): Rgb {
  if (contrastRatio(fill, ink) >= target) return fill;
  const [L0, A, B] = rgbToOklab(fill);
  for (let L = L0 - 0.02; L > 0; L -= 0.02) {
    const c = oklabToRgb([L, A, B]);
    if (contrastRatio(c, ink) >= target) return c;
  }
  return oklabToRgb([0, A, B]);
}
