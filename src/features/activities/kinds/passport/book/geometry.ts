/** Every landscape page is painted at this size (the cover is the same canvas turned: 720 × 1024). */
export const PAGE = { w: 1024, h: 720 } as const;

export type Box = { x: number; y: number; w: number; h: number };

/**
 * The margin every spread page keeps: the picture's frame on the top page and the answer rows on
 * the bottom one line up, with the same room at each side and at the free edge.
 */
export const MARGIN = 50;
/** The small label line ("PAGE 01") on the picture page, from its free edge. */
export const LABEL_Y = 58;

/** D872: the question page's four answer rows, top to bottom, in page pixels, ending a margin above the edge. */
export function answerBox(j: 0 | 1 | 2 | 3): Box {
  return { x: MARGIN, y: 196 + j * 122, w: PAGE.w - 2 * MARGIN, h: 108 };
}

/** The scene picture's rounded frame on the top page (D873): the same side and edge margins as the rows. */
export const SCENE_FRAME: Box = { x: MARGIN, y: 92, w: PAGE.w - 2 * MARGIN, h: PAGE.h - 92 - MARGIN };

/** The Start button on the intro's bottom page (the whole page starts the test; this is what it shows). */
export const START_BUTTON: Box = { x: 312, y: 440, w: 400, h: 110 };

/** Where the name field sits on the name page, for the DOM input laid over it (D874). */
export const NAME_FIELD: Box = { x: 112, y: 300, w: PAGE.w - 224, h: 120 };

/** Where "That's me" sits on the name page. */
export const NAME_BUTTON: Box = { x: 312, y: 500, w: 400, h: 110 };

/**
 * The answer row under a tap, from the raycast's UV (`v` runs up, as three.js gives it), or
 * null when the tap is between rows or off them.
 */
export function answerAt(u: number, v: number): number | null {
  const x = u * PAGE.w;
  const y = (1 - v) * PAGE.h;
  for (const j of [0, 1, 2, 3] as const) {
    const b = answerBox(j);
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return j;
  }
  return null;
}

/** Whether a UV point is inside a page box. */
export function inBox(u: number, v: number, b: Box): boolean {
  const x = u * PAGE.w;
  const y = (1 - v) * PAGE.h;
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}
