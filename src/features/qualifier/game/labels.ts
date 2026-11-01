// Keeps the slimes' word labels readable (D793): labels never cover each other. Pure, screen
// pixels in, screen pixels out.

/** A label's wanted place: top-left corner and size in CSS px. `near`: smaller = nearer the player. */
export type LabelBox = { id: number; x: number; y: number; w: number; h: number; near: number };

type Rect = { x: number; y: number; w: number; h: number };

/** Space kept between two labels, px. */
const GAP = 4;
/** How many label widths sideways to look when a column is full, each way. */
const COLUMNS = 4;

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Climbs (dir -1) or drops (dir +1) from `y` in column `x` past every placed label it hits; null when it leaves the view. */
function slide(b: LabelBox, x: number, y: number, dir: -1 | 1, placed: readonly Rect[], maxY: number): number | null {
  for (;;) {
    const r = { x, y, w: b.w, h: b.h };
    const hits = placed.filter((p) => overlaps(r, p));
    if (hits.length === 0) return y;
    y = dir < 0 ? Math.min(...hits.map((p) => p.y - b.h - GAP)) : Math.max(...hits.map((p) => p.y + p.h + GAP));
    if (y < 0 || y > maxY) return null;
  }
}

/**
 * Places every label, nearest first (ties by id). The nearest keeps its wanted place (clamped
 * inside the view); a farther one that would overlap a placed label moves up past it, the way
 * labels of far slimes already sit higher on screen. When a label can't climb any further it
 * tries below, then the columns either side. Only when the view is truly full does it overlap.
 */
export function layoutLabels(boxes: readonly LabelBox[], view: { w: number; h: number }): Map<number, { x: number; y: number }> {
  const out = new Map<number, { x: number; y: number }>();
  const placed: Rect[] = [];
  const order = [...boxes].sort((a, b) => a.near - b.near || a.id - b.id);
  for (const b of order) {
    const maxX = Math.max(0, view.w - b.w);
    const maxY = Math.max(0, view.h - b.h);
    const x0 = clamp(b.x, 0, maxX);
    const y0 = clamp(b.y, 0, maxY);
    let at: { x: number; y: number } | null = null;
    const columns = [x0];
    for (let k = 1; k <= COLUMNS; k++) columns.push(x0 + k * (b.w + GAP), x0 - k * (b.w + GAP));
    for (const cx of columns) {
      const x = clamp(cx, 0, maxX);
      const y = slide(b, x, y0, -1, placed, maxY) ?? slide(b, x, y0, 1, placed, maxY);
      if (y !== null) { at = { x, y }; break; }
    }
    at ??= { x: x0, y: y0 };
    out.set(b.id, at);
    placed.push({ ...at, w: b.w, h: b.h });
  }
  return out;
}
