/**
 * D877: where each stamp lands on the stamp page - jittered and overlapping, like a real
 * passport, but the same on every visit. A spot depends only on its place in the stamp order and
 * the guest, never on how many stamps exist, so a new stamp never moves the ones already down.
 *
 * Twelve cells on a 4 × 3 lattice, walked in an order where each next cell is never a direct
 * neighbour of the last, so two stamps in a row never pile on each other. The walk starts at a
 * cell chosen by the guest, so passports don't all look alike. Past twelve it goes round again
 * with fresh jitter, overlapping more.
 */
const COLS = [240, 420, 604, 784];
const ROWS = [210, 360, 510];
const WALK = [0, 6, 1, 7, 8, 2, 11, 4, 10, 5, 3, 9];
const JITTER = 30;
const MAX_TILT = 0.35;

export function stampSpot(i: number, seed: string): { x: number; y: number; rot: number; scale: number } {
  const start = hash(seed) % WALK.length;
  const cell = WALK[(start + i) % WALK.length];
  const rand = mulberry32(hash(`${seed}:${i}`));
  return {
    x: COLS[cell % 4] + (rand() * 2 - 1) * JITTER,
    y: ROWS[Math.floor(cell / 4)] + (rand() * 2 - 1) * JITTER,
    rot: (rand() * 2 - 1) * MAX_TILT,
    scale: 0.9 + rand() * 0.2,
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
