export type Point = { x: number; y: number };

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const angle = (a: Point, b: Point) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

/** Two fingers (D482): scale by how far apart they moved, rotate by how far the line between them turned. */
export function pinch(start: [Point, Point], now: [Point, Point], base: { scale: number; rot: number }): { scale: number; rot: number } {
  const d0 = dist(start[0], start[1]);
  if (d0 < 1) return base;
  return {
    scale: (base.scale * dist(now[0], now[1])) / d0,
    rot: base.rot + angle(now[0], now[1]) - angle(start[0], start[1]),
  };
}

/** The one-thumb corner handle: a pinch whose first finger is pinned at the sticker's centre. */
export function handleDrag(center: Point, start: Point, now: Point, base: { scale: number; rot: number }): { scale: number; rot: number } {
  return pinch([center, start], [center, now], base);
}
