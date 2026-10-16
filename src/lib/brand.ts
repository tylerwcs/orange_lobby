import { contrastRatio, darkenUntilReadable, hexToRgb, lightenUntilReadable, readableOn, rgbToOklab, toHex, type Rgb } from "@/lib/contrast";

const DEFAULT_BRAND = "#F97316";

/** D619: the ink headings use when the organiser has not picked a colour (globals.css --foreground). */
export const DEFAULT_HEADING_COLOR = "#111827";
/** D620: the page ground when the organiser has not picked one (globals.css --background). */
export const DEFAULT_PAGE_BACKGROUND = "#F5F5F3";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** D619/D620: a posted colour as stored - #RRGGBB lower-cased, or null for anything else or the default. */
export function parseColor(raw: string | null | undefined, fallback: string): string | null {
  const v = raw?.trim() ?? "";
  if (!HEX.test(v) || v.toLowerCase() === fallback.toLowerCase()) return null;
  return v.toLowerCase();
}

/**
 * D619: a heading colour as it can be shown on white. Kept when it reads (4.5:1); a coloured one
 * is darkened, hue kept, the move `--primary` makes (D72). White or a grey has no hue to keep -
 * darkening it gives a dull mid-grey - so it falls back to the usual ink.
 */
function headingOnWhite(rgb: Rgb): Rgb {
  if (contrastRatio(rgb, [255, 255, 255]) >= 4.5) return rgb;
  const [, A, B] = rgbToOklab(rgb);
  return Math.hypot(A, B) < 0.03 ? hexToRgb(DEFAULT_HEADING_COLOR)! : darkenUntilReadable(rgb);
}

/**
 * D619/D620: the registration page's colours, as variables on its root.
 *  - `--heading`: headings on white (the form card), via `headingOnWhite`.
 *  - `--background`: the organiser's ground, which `bg-background` reads.
 *  - `--page-heading` / `--page-text`: what sits on that ground - the event bar (D621), the
 *    Register heading and the line under it. The heading colour exactly as chosen where it reads
 *    there; otherwise both become whichever of white or ink reads on the ground.
 * Nothing chosen, nothing set: everything falls back to the usual tokens.
 */
export function registrationLook(heading: string | null | undefined, background: string | null | undefined): Record<string, string> {
  const style: Record<string, string> = {};
  const head = heading && HEX.test(heading) ? hexToRgb(heading)! : null;
  if (head) style["--heading"] = toHex(headingOnWhite(head));
  const ground = background && HEX.test(background) ? hexToRgb(background)! : null;
  if (ground) {
    const onGround = readableOn(ground).hex;
    style["--background"] = toHex(ground);
    style["--page-text"] = onGround;
    style["--page-heading"] = head && contrastRatio(head, ground) >= 4.5 ? toHex(head) : onGround;
  }
  return style;
}

/** D619: a heading on white follows `--heading` where it is set, and the usual ink elsewhere. */
export const HEADING_INK = "text-[color:var(--heading,var(--foreground))]";
/** D620/D621: a heading on the page ground rather than on white - Register, and the event bar's name. */
export const PAGE_HEADING_INK = "text-[color:var(--page-heading,var(--heading,var(--foreground)))]";
/** D620: body text on the page ground; the usual muted ink when the ground is the default. */
export const PAGE_TEXT_INK = "text-[color:var(--page-text,var(--muted-foreground))]";

/**
 * What a pinned value on the attendee's badge sits on: the card's #111827 under the tile's
 * 10% white wash, flattened. The badge is the one dark surface the brand colour is text on.
 */
export const BADGE_TILE: Rgb = [41, 47, 61];

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
    // The same colour as text on the dark badge: exactly the organiser's when it reads there,
    // as a bright orange does, so the badge matches the logo; lightened only when it would not.
    "--brand-on-dark": toHex(lightenUntilReadable(rgb, BADGE_TILE)),
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
