// The only source of randomness in the slime game (D790). A run's seed fixes every draw, so the
// phone and the server replay get the same slimes. Integer ops only: identical in every engine.

/** The standard 32-bit mulberry32 generator. Returns numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An integer in [0, n). */
export const randInt = (r: () => number, n: number): number => Math.floor(r() * n);
