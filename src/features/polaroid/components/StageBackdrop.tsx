import type { CSSProperties } from "react";

const FALLBACK = "#f97316";
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** The glow's colour (D482): the event's brand colour when it is a hex colour, else orange. */
export function glowColour(brand: string | null | undefined): string {
  const c = brand?.trim() ?? "";
  return `color-mix(in oklab, ${HEX.test(c) ? c : FALLBACK} 40%, transparent)`;
}

/** The stage's near-black ground, the colour every full-screen polaroid page sits on. */
export const STAGE_BG = "#0b0b0d";

/**
 * A soft radial glow in the event's colour (D482), centred on `x`, `y` (px or % of its positioned
 * parent). Decoration only.
 */
export function StageGlow({ brand, x = "50%", y = "50%", size = 560 }: {
  brand?: string | null;
  x?: number | string;
  y?: number | string;
  size?: number;
}) {
  const style: CSSProperties = {
    left: x, top: y, width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2,
    background: `radial-gradient(closest-side, ${glowColour(brand)}, transparent)`,
  };
  return <div aria-hidden className="pointer-events-none absolute rounded-full" style={style} />;
}
