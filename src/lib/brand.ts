import { contrastRatio, darkenUntilReadable, hexToRgb, readableOn, toHex } from "@/lib/contrast";

const DEFAULT_BRAND = "#F97316";

/**
 * An event's own colour, mapped onto the tokens every shadcn component already reads.
 *
 * It used to emit `--brand`, `--brand-ink` and `--brand-soft` and derive the last two with
 * `color-mix`, which the browser resolves and nothing in the codebase could measure. That
 * is how an event mark shipped at 3.97:1 and survived a redesign - the contrast suite
 * tests `globals.css`, and this never appears there.
 *
 * Now the derived values are computed here, in code that is tested:
 *  - `--primary` is the event colour, darkened if it cannot carry white text at 4.5:1
 *  - `--primary-foreground` is whichever of white or ink is actually readable on it
 *  - `--accent` is a pale tint for chips and grounds, `--accent-foreground` the readable ink
 *  - `--ring` follows primary, so the focus ring stays the event's colour
 *
 * `--brand` and `--brand-foreground` are emitted too, and are not leftovers: they are the
 * colour as the organiser chose it, for the decorative jobs `--primary` cannot do once it
 * has been darkened to be readable as text (D72).
 */
export function brandStyle(primary: string | null | undefined): Record<string, string> {
  const brand = primary && /^#[0-9a-fA-F]{6}$/.test(primary) ? primary : DEFAULT_BRAND;
  const rgb = hexToRgb(brand) ?? hexToRgb(DEFAULT_BRAND)!;

  // Two tokens, because there are two jobs and one colour cannot do both.
  //
  // `--primary` is read BOTH as a fill carrying --primary-foreground AND as `text-primary`
  // on a white card. A pale brand works as a fill and is invisible as text: this event's
  // #FFB066 renders at about 1.9:1 on white. So --primary is the event's colour darkened -
  // in Oklab, keeping its hue - until it clears 4.5:1 as text. That is the same move the
  // fixed palette already makes by hand, shipping #C2410C rather than #F97316.
  //
  // `--brand` stays the colour exactly as the organiser chose it, for decorative fills -
  // the event mark, a status dot - paired with a foreground computed for it.
  const ink = darkenUntilReadable(rgb);
  const inkHex = toHex(ink);
  const onInk = readableOn(ink);
  const onBrand = readableOn(rgb);

  return {
    "--primary": inkHex,
    "--primary-foreground": onInk.hex,
    "--ring": inkHex,
    "--accent": `color-mix(in oklch, ${brand} 14%, white)`,
    "--accent-foreground": inkHex,

    // The organiser's colour, untouched, and whatever can be read on it.
    "--brand": brand,
    "--brand-foreground": onBrand.hex,
  };
}

/**
 * What the contrast of an event's colour actually is, for the places that need to report
 * it rather than just use it. Measured on the darkened fill, which is what ships.
 */
export function brandContrast(primary: string | null | undefined): number {
  const style = brandStyle(primary);
  const fill = hexToRgb(style["--primary"])!;
  const fg = hexToRgb(style["--primary-foreground"])!;
  return contrastRatio(fill, fg);
}
