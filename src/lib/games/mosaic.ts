/** The last-one-standing mosaic (D274, D275): one tile per player on a 1920×1080 canvas. */
export type Tier = "dense" | "medium" | "large" | "finalist";

/** Bigger tiles as the field narrows. Type scales with the tile; the content never changes (D273). */
export function tierFor(n: number): Tier {
  if (n <= 5) return "finalist";
  if (n < 50) return "large";
  if (n < 200) return "medium";
  return "dense";
}

export type Grid = { cols: number; rows: number; cell: number };

/** The column count that gives the largest square tiles for `n` players. */
export function gridFor(n: number, width = 1920, height = 1080): Grid {
  const count = Math.max(1, Math.floor(n));
  let best: Grid = { cols: 1, rows: count, cell: 0 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const cell = Math.floor(Math.min(width / cols, height / rows));
    if (cell > best.cell) best = { cols, rows, cell };
  }
  return best;
}

// FNV-1a: a stable 32-bit hash of the seed string.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32: a small seeded PRNG. Not for secrets — only for the order tiles go dark in.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A shuffle that is the same every time for the same seed (D275): seeded by run and question,
 * so an LED reloaded mid-reveal replays the ripple identically.
 */
export function seededOrder<T>(items: T[], seed: string): T[] {
  const rand = mulberry32(hash(seed));
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
