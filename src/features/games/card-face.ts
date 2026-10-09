/**
 * The maths behind the card round's two-sided cards (D317, polish D323), kept free of three.js
 * and the DOM so it can be tested: where an image goes on a face, how the rounded card's
 * geometry maps onto its texture, and how a line of text is sized and wrapped to fit.
 */

/** Corner radius as a share of the card's width. */
export const CARD_CORNER = 0.07;
/** The number badge on a card back: its diameter as a share of the card's width. */
export const CARD_BADGE = 0.28;
/** On a prize face with a picture: the picture's share of the height; the name bar gets the rest. */
export const CARD_PHOTO_SHARE = 0.78;

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * The part of an `iw`×`ih` image to draw so it covers a `bw`×`bh` box without stretching: the
 * largest centred crop with the box's aspect ratio. In image pixels (canvas drawImage's source).
 */
export function coverCrop(iw: number, ih: number, bw: number, bh: number): Rect {
  if (!(iw > 0 && ih > 0 && bw > 0 && bh > 0)) return { x: 0, y: 0, w: Math.max(0, iw), h: Math.max(0, ih) };
  // Wider than the box: keep the full height and trim the sides; otherwise the full width.
  const wide = iw / ih > bw / bh;
  const w = wide ? ih * (bw / bh) : iw;
  const h = wide ? ih : iw * (bh / bw);
  return { x: (iw - w) / 2, y: (ih - h) / 2, w, h };
}

/** Where an `iw`×`ih` image goes to fit whole inside `box`, centred, without stretching. */
export function containRect(iw: number, ih: number, box: Rect): Rect {
  if (!(iw > 0 && ih > 0)) return { ...box };
  const scale = Math.min(box.w / iw, box.h / ih);
  const w = iw * scale;
  const h = ih * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/**
 * A card-shaped geometry's texture coordinate for the vertex at (`x`, `y`): the card is centred
 * on the origin, so its bottom-left corner maps to (0, 0) and its top-right to (1, 1) — the whole
 * texture spread over the card, with the rounded corners simply cut away.
 */
export function cardUv(x: number, y: number, w: number, h: number): [number, number] {
  return [(x + w / 2) / w, (y + h / 2) / h];
}

/** Greedy word wrap: as many words per line as fit `maxW`. A single word wider than that gets a line to itself. */
export function wrapWords(text: string, maxW: number, width: (s: string) => number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    const last = lines[lines.length - 1];
    if (last !== undefined && width(`${last} ${word}`) <= maxW) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

export type FitOptions = { maxW: number; maxH: number; maxLines: number; start: number; min?: number; lineHeight?: number };

/**
 * The biggest font size (stepping down from `start`) at which `text` wraps into at most
 * `maxLines` lines, each no wider than `maxW`, all together no taller than `maxH`. `measure`
 * gives a string's width at a size. If nothing fits even at `min`, it returns `min` with the text
 * cut to `maxLines` lines (the last line keeps the rest) — the caller still squeezes each line to
 * `maxW` as it draws, so text never spills off the card.
 */
export function fitText(text: string, measure: (s: string, size: number) => number, opts: FitOptions): { lines: string[]; size: number } {
  const min = opts.min ?? 8;
  const lh = opts.lineHeight ?? 1.1;
  const step = Math.max(1, opts.start / 60);
  for (let size = opts.start; size >= min; size -= step) {
    const lines = wrapWords(text, opts.maxW, (s) => measure(s, size));
    const tall = lines.length * size * lh - (lh - 1) * size;
    if (lines.length <= opts.maxLines && tall <= opts.maxH && lines.every((l) => measure(l, size) <= opts.maxW)) return { lines, size };
  }
  const lines = wrapWords(text, opts.maxW, (s) => measure(s, min));
  const kept = lines.slice(0, Math.max(1, opts.maxLines));
  if (lines.length > kept.length) kept[kept.length - 1] = lines.slice(kept.length - 1).join(" ");
  return { lines: kept.length ? kept : [""], size: min };
}
