// The light of the slime meadow through a run (D816): a fresh morning at the start, a golden
// afternoon by the first boss, sunset for the last. Pure, so it is tested without three.js.
import { FOG, HEMI_GROUND, HEMI_INTENSITY, HEMI_SKY, SKY, SUN, SUN_INTENSITY } from "./palette";

export type Sky = { sky: number; fog: number; sun: number; sunI: number; hemiSky: number; hemiGround: number; hemiI: number };

/** [run ms, light]. Between two stops each colour is mixed in RGB; before the first and after the last, they hold. */
export const SKY_STOPS: readonly (readonly [number, Sky])[] = [
  [0, { sky: SKY, fog: FOG, sun: SUN, sunI: SUN_INTENSITY, hemiSky: HEMI_SKY, hemiGround: HEMI_GROUND, hemiI: HEMI_INTENSITY }],
  [60_000, { sky: SKY, fog: FOG, sun: SUN, sunI: SUN_INTENSITY, hemiSky: HEMI_SKY, hemiGround: HEMI_GROUND, hemiI: HEMI_INTENSITY }],
  [100_000, { sky: 0xf6dfb0, fog: 0xf7e6c4, sun: 0xffd590, sunI: 1.8, hemiSky: 0xfff1d6, hemiGround: 0xb2b98a, hemiI: 1.05 }],
  [165_000, { sky: 0xf4a98c, fog: 0xf2bfa4, sun: 0xff9a6a, sunI: 1.5, hemiSky: 0xffd9c6, hemiGround: 0x9a8fa0, hemiI: 0.95 }],
  [180_000, { sky: 0xc99ab8, fog: 0xd8acb8, sun: 0xff8a70, sunI: 1.25, hemiSky: 0xf2cde0, hemiGround: 0x8c84a4, hemiI: 0.9 }],
];

const mixHex = (a: number, b: number, k: number): number => {
  const ch = (shift: number) => Math.round(((a >> shift) & 255) + ((((b >> shift) & 255) - ((a >> shift) & 255)) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** The light at run time `ms` (anything before the start reads as the start). */
export function skyAt(ms: number): Sky {
  const stops = SKY_STOPS;
  if (!(ms > stops[0][0])) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [t1, b] = stops[i];
    if (ms > t1) continue;
    const [t0, a] = stops[i - 1];
    const k = (ms - t0) / (t1 - t0);
    return {
      sky: mixHex(a.sky, b.sky, k), fog: mixHex(a.fog, b.fog, k), sun: mixHex(a.sun, b.sun, k),
      sunI: a.sunI + (b.sunI - a.sunI) * k, hemiSky: mixHex(a.hemiSky, b.hemiSky, k),
      hemiGround: mixHex(a.hemiGround, b.hemiGround, k), hemiI: a.hemiI + (b.hemiI - a.hemiI) * k,
    };
  }
  return stops[stops.length - 1][1];
}
