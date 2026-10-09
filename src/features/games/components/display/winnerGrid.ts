/**
 * How a grid of winners fits the LED (D282). A "Draw all" can hand out up to 500 of a prize, and
 * everyone can survive last one standing, so the grid is sized from the count rather than left
 * to grow: the biggest type that fits the box, the company line dropped when it no longer fits,
 * and past what fits at the smallest type, pages of names that the LED steps through.
 */
export type WinnerGrid = {
  cols: number;
  rows: number;
  /** Name size in px; the company line is 0.6 of it. */
  font: number;
  company: boolean;
  gap: number;
  pad: number;
  cellHeight: number;
  /** Winners on one page; the whole list when it fits. */
  perPage: number;
};

/** Grid box on the 1920×1080 canvas, inside JointWinners' padding, header and prize line. */
export const GRID_WIDTH = 1792;
export const LINE = 1.2;
const MAX_FONT = 56;
const MIN_COMPANY_FONT = 28;
const MIN_FONT = 20;
/** Room for a name of about 16 characters of bold type; longer names are cut with an ellipsis. */
const EMS_PER_NAME = 9;

function metrics(font: number, company: boolean, width: number, height: number) {
  const pad = Math.round(Math.min(20, Math.max(6, font * 0.35)));
  const gap = font >= 40 ? 20 : font >= 28 ? 12 : 8;
  const cellHeight = Math.ceil(2 * pad + LINE * font * (company ? 1.6 : 1));
  const cellWidth = EMS_PER_NAME * font + 2 * pad;
  const maxRows = Math.max(0, Math.floor((height + gap) / (cellHeight + gap)));
  const maxCols = Math.max(0, Math.floor((width + gap) / (cellWidth + gap)));
  return { pad, gap, cellHeight, maxRows, maxCols };
}

function place(count: number, font: number, company: boolean, m: ReturnType<typeof metrics>): WinnerGrid {
  const minCols = Math.ceil(count / m.maxRows);
  const cols = Math.min(m.maxCols, Math.max(minCols, Math.ceil(Math.sqrt(count))));
  return { cols, rows: Math.ceil(count / cols), font, company, gap: m.gap, pad: m.pad, cellHeight: m.cellHeight, perPage: count };
}

export function winnerGrid(count: number, height: number, width = GRID_WIDTH): WinnerGrid {
  const n = Math.max(1, count);
  const tries: [number, boolean][] = [];
  for (let f = MAX_FONT; f >= MIN_COMPANY_FONT; f -= 2) tries.push([f, true]);
  for (let f = MAX_FONT; f >= MIN_FONT; f -= 2) tries.push([f, false]);
  for (const [font, company] of tries) {
    const m = metrics(font, company, width, height);
    if (m.maxRows * m.maxCols >= n) return place(n, font, company, m);
  }
  // Too many for one screen at the smallest type: as few pages as that allows, split evenly
  // (150 is two pages of 75, not 136 and 14), each laid out as a screen of its own.
  const m = metrics(MIN_FONT, false, width, height);
  const pages = Math.ceil(n / Math.max(1, m.maxRows * m.maxCols));
  return winnerGrid(Math.ceil(n / pages), height, width);
}
