/** Every landscape page is painted at this size (the cover is the same canvas turned: 720 × 1024). */
export const PAGE = { w: 1024, h: 720 } as const;

export type Box = { x: number; y: number; w: number; h: number };

/** D872: the question page's four answer rows, top to bottom, in page pixels. */
export function answerBox(j: 0 | 1 | 2 | 3): Box {
  return { x: 50, y: 232 + j * 118, w: PAGE.w - 100, h: 104 };
}

/** The scene picture's rounded frame on the top page (D873), about 3:2. */
export const SCENE_FRAME: Box = { x: 44, y: 84, w: PAGE.w - 88, h: PAGE.h - 140 };

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
