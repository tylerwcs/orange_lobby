import type { WallSpeed } from "./settings";

/** D484: about a third of the screen's height per column: 7 on the 5504×2322 KOM LED, 5 on a 16:9 TV. */
export function autoColumns(width: number, height: number): number {
  if (!(width > 0 && height > 0)) return 3;
  return Math.min(10, Math.max(3, Math.round(width / (height * 0.33))));
}

export function columnCount(setting: "auto" | number, width: number, height: number): number {
  return setting === "auto" ? autoColumns(width, height) : setting;
}

export function shortestColumn(heights: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < heights.length; i++) if (heights[i] < heights[best]) best = i;
  return best;
}

/**
 * Each card, oldest first, to the column with the least content so far. With fewer cards than
 * columns every column still gets one, repeating cards, so a new wall never shows bare columns.
 */
export function assignColumns(items: readonly { id: string; height: number }[], columns: number, gap: number): string[][] {
  if (items.length > 0 && items.length < columns) return Array.from({ length: columns }, (_, c) => [items[c % items.length].id]);
  const ids: string[][] = Array.from({ length: columns }, () => []);
  const filled = Array.from({ length: columns }, () => 0);
  for (const it of items) {
    const c = shortestColumn(filled);
    ids[c].push(it.id);
    filled[c] += it.height + gap;
  }
  return ids;
}

/** One column's cards stacked from 0; `cycle` is one full pass, after which it repeats. */
export type ColumnLayout = { tops: number[]; heights: number[]; cycle: number };

export function layoutColumn(heights: readonly number[], gap: number): ColumnLayout {
  const tops: number[] = [];
  let y = 0;
  for (const h of heights) {
    tops.push(y);
    y += h + gap;
  }
  return { tops, heights: [...heights], cycle: y };
}

/** A card on the endless repeat: which card, which pass, and its top in column coordinates. */
export type Slot = { index: number; repeat: number; y: number };

/** Every slot overlapping [offset − buffer, offset + view + buffer], top to bottom. */
export function visibleSlots(layout: ColumnLayout, offset: number, view: number, buffer: number): Slot[] {
  const { tops, heights, cycle } = layout;
  if (tops.length === 0 || cycle <= 0) return [];
  const from = offset - buffer;
  const to = offset + view + buffer;
  const out: Slot[] = [];
  for (let r = Math.floor(from / cycle) - 1; r * cycle < to; r++) {
    for (let i = 0; i < tops.length; i++) {
      const y = r * cycle + tops[i];
      if (y + heights[i] > from && y < to) out.push({ index: i, repeat: r, y });
    }
  }
  return out;
}

/**
 * The offset that keeps the screen still when a column's cards change: the first card still on
 * screen stays exactly where it was. `newIndexOf` maps an old card to its new index, or null if it
 * went. Everything between that card and the edge of the change keeps its place, so nothing jumps.
 */
export function keepAnchor(prev: ColumnLayout, next: ColumnLayout, offset: number, view: number, newIndexOf: (i: number) => number | null): number {
  const anchor = visibleSlots(prev, offset, view, 0).find((s) => newIndexOf(s.index) !== null);
  if (!anchor || next.cycle <= 0) return offset;
  const j = newIndexOf(anchor.index)!;
  return offset + (anchor.repeat * next.cycle + next.tops[j] - anchor.y);
}

/**
 * D484: where a new card joins a moving column so it arrives from off-screen. Scrolling up, cards
 * enter from below, so it goes in after the last card on screen; scrolling down, before the first.
 */
export function insertionFor(layout: ColumnLayout, offset: number, view: number, direction: 1 | -1, newHeight: number, gap: number): { index: number; offset: number } {
  const n = layout.tops.length;
  const shown = visibleSlots(layout, offset, view, 0);
  if (n === 0 || shown.length === 0) return { index: n, offset };
  const index = direction === 1 ? shown[shown.length - 1].index + 1 : shown[0].index;
  const heights = [...layout.heights];
  heights.splice(index, 0, newHeight);
  const next = layoutColumn(heights, gap);
  return { index, offset: keepAnchor(layout, next, offset, view, (i) => (i >= index ? i + 1 : i)) };
}

/** Review Focus 1: a wall left on all day keeps its offsets small by dropping whole cycles, which moves nothing. */
export function rebase(offset: number, cycle: number, limit = 1_000_000): number {
  if (cycle <= 0 || Math.abs(offset) < limit) return offset;
  return offset - Math.trunc(offset / cycle) * cycle;
}

/** Base px/s on a 1080 px-high screen. */
export const SPEED_PX: Record<WallSpeed, number> = { slow: 30, medium: 50, fast: 80 };
const JITTER = [0, 0.07, -0.05, 0.1, -0.08, 0.03, -0.1, 0.06, -0.02, 0.09];

/** Signed px/s: even columns scroll up (+), odd down (−), each a little off the others (D484). */
export function columnSpeed(speed: WallSpeed, column: number, viewH: number): number {
  const v = SPEED_PX[speed] * (viewH / 1080) * (1 + JITTER[column % JITTER.length]);
  return Math.round((column % 2 === 0 ? v : -v) * 1000) / 1000;
}
