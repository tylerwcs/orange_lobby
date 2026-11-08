import { brandStyle } from "@/lib/brand";
import { hexToRgb, toHex } from "@/lib/contrast";
import { ensureReadable } from "@/features/theme/lib/theme";

/**
 * D854: the passport page. One cream sheet the stamps are pressed onto, the same on every event
 * and theme - it is paper, not a theme surface, so its colours are fixed here rather than read
 * from tokens. The user asked for "a bit paper like" and then for less texture: faint wavy
 * security lines and one rosette, no grain.
 */
export const PAPER = {
  centre: "#FBF6EA",
  mid: "#F5EDDA",
  edge: "#EFE3C8",
} as const;

/** Brown inks on the paper, each checked against all three paper stops (tests/activities/paper.test.ts). */
export const PAPER_INK = {
  /** "PASSPORT HOLDER", the page's small caps. */
  label: "#7A5C34",
  /** The holder's name. */
  name: "#5E4526",
  /** A booth's name in an empty slot. */
  booth: "#7A5C34",
  location: "#6E5230",
  /** The "?" in an empty slot: large text, 3:1. */
  question: "#9A7B52",
  /** The rule under the holder line, and the map link's border. */
  rule: "rgba(138, 106, 64, 0.3)",
  /** An empty slot's dashed circle. */
  dash: "rgba(122, 92, 52, 0.45)",
} as const;

/**
 * D856: a designer's gold line art goes faint on cream, so the ink is pressed a little darker.
 * Paired with `mix-blend-mode: multiply` on the image itself (a rotated wrapper breaks the blend).
 */
export const STAMP_ART_FILTER = "saturate(1.4) brightness(.8) contrast(1.2)";

const svg = (body: string, w: number, h: number, box = `0 0 ${w} ${h}`) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${box}">${body}</svg>`)}")`;

const INK = `fill="none" stroke="#A07A45" stroke-opacity=".07" stroke-width=".7"`;
const WAVE = svg(`<path d="M0 5.5 C11.5 0 11.5 0 23 5.5 S34.5 11 46 5.5" ${INK}/>`, 46, 11);
const ROSETTE = svg(
  `<g ${INK}>${[0, 30, 60, 90, 120, 150].map((d) => `<ellipse rx="70" ry="24" transform="rotate(${d})"/>`).join("")}<circle r="74"/></g>`,
  160, 160, "-80 -80 160 160",
);

/**
 * The paper as one CSS `background`: the rosette once near the middle, the wavy lines tiled
 * over the whole sheet, on the cream gradient. Data URIs carry their own drawing, so a page
 * with many sheets (and the reveal's disc) needs no SVG ids in the DOM.
 */
export function paperBackground(): string {
  return [
    `${ROSETTE} 50% 55% / 160px 160px no-repeat`,
    `${WAVE} 0 0 / 46px 11px repeat`,
    `radial-gradient(140% 100% at 50% 40%, ${PAPER.centre} 0%, ${PAPER.mid} 70%, ${PAPER.edge} 100%)`,
  ].join(", ");
}

/**
 * D856: the plain chop on paper, for a booth with no artwork. Drawn in the event's own colour
 * (`--brand`, as the organiser chose it), moved keeping its hue until the ring reads on cream at
 * 3:1 and the check at 4.5:1 - a pale gold or peach brand would vanish on the paper otherwise.
 */
export function chopInk(brand: string | null): { ring: string; check: string } {
  const rgb = hexToRgb(brandStyle(brand)["--brand"])!;
  const grounds = Object.values(PAPER).map((c) => hexToRgb(c)!);
  return {
    ring: toHex(ensureReadable(rgb, grounds, 3).rgb),
    check: toHex(ensureReadable(rgb, grounds, 4.5).rgb),
  };
}
