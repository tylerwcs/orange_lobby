/**
 * A winner screen's confetti (D305, D306), stepped in world pixels (x, y) and radians (rx, ry).
 * `vy`/`vx` are px/s, `spin` is rad/s. Kept as a pure module so `stepPiece` is unit-testable
 * without three.js or a WebGL canvas.
 */
export type ConfettiPiece = { x: number; y: number; z: number; vy: number; vx: number; spin: number; rx: number; ry: number };

/** However long a frame's `dt` claims to be, a piece never jumps further than this in one step. */
const MAX_DT = 0.05;

/**
 * Moves a piece by `dt` seconds, in place, and returns it. `dt` is capped first: a demand-render
 * canvas can report a huge `dt` on its first frame back from being idle (green mode has no
 * ThemeBackdrop keeping frames going; a hidden tab pauses rAF entirely), and an uncapped step
 * would throw every piece far off in one jump. Both axes wrap, so a capped step can never carry a
 * piece past a wrap boundary without re-entering: y loops through the shower's fall band, x loops
 * across the LED's width with margin either side, so no piece drifts off the sides for good.
 */
export function stepPiece(p: ConfettiPiece, dt: number): ConfettiPiece {
  const step = Math.min(dt, MAX_DT);
  p.y -= p.vy * step;
  p.x += p.vx * step;
  p.rx += p.spin * step;
  p.ry += p.spin * 0.7 * step;
  if (p.y < -600) p.y += 1300;
  if (p.x > 1000) p.x -= 2000;
  else if (p.x < -1000) p.x += 2000;
  return p;
}
