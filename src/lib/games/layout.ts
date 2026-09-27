/** Layouts on the LED's 1920×1080 canvas (D284). x/y are a box's centre, from the top-left. */
export type Box = { x: number; y: number; w: number; h: number };

const W = 1920;
const H = 1080;

/** LED pixels to 3D world units: the canvas centre is the origin and y points up (D293). */
export function toWorld(x: number, y: number): [number, number] {
  return [x - W / 2, H / 2 - y];
}

/** A card round's grid (D317): 1 row up to 5 cards, then 2, 3 and 4 rows. */
export function cardGrid(n: number): { cols: number; rows: number } {
  const count = Math.max(1, Math.floor(n));
  const rows = count <= 5 ? 1 : count <= 10 ? 2 : count <= 15 ? 3 : 4;
  return { cols: Math.ceil(count / rows), rows };
}

const CARD_TOP = 220;
const CARD_AREA_W = 1720;
const CARD_AREA_H = 800;
const CARD_GAP = 28;
const CARD_RATIO = 1.4;

/** Where each card sits, by card number − 1. Cards keep their place as others are taken. */
export function cardLayout(n: number): Box[] {
  const { cols, rows } = cardGrid(n);
  let w = Math.min(260, (CARD_AREA_W - (cols - 1) * CARD_GAP) / cols);
  let h = w * CARD_RATIO;
  const maxH = (CARD_AREA_H - (rows - 1) * CARD_GAP) / rows;
  if (h > maxH) { h = maxH; w = h / CARD_RATIO; }
  const gridW = cols * w + (cols - 1) * CARD_GAP;
  const gridH = rows * h + (rows - 1) * CARD_GAP;
  const left = (W - gridW) / 2;
  const top = CARD_TOP + (CARD_AREA_H - gridH) / 2;
  return Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    return { x: left + c * (w + CARD_GAP) + w / 2, y: top + r * (h + CARD_GAP) + h / 2, w, h };
  });
}

/** Up to this many winners get a reel each; more cascade in as a grid of names (D313). */
export const MAX_REELS = 10;

/** One wide reel, a row of up to 5, or two rows of up to 5. */
export function reelLayout(n: number): Box[] {
  if (n < 1 || n > MAX_REELS) return [];
  if (n === 1) return [{ x: W / 2, y: 580, w: 1400, h: 300 }];
  const rows = n <= 5 ? 1 : 2;
  const cols = Math.ceil(n / rows);
  const gap = 32;
  const w = Math.min(340, (1800 - (cols - 1) * gap) / cols);
  const h = rows === 1 ? 240 : 190;
  const gridW = cols * w + (cols - 1) * gap;
  const top = rows === 1 ? 580 : 440;
  return Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    return { x: (W - gridW) / 2 + c * (w + gap) + w / 2, y: top + r * (h + 60), w, h };
  });
}
