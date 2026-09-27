import type { Person } from "@/lib/games/wire";

/**
 * The wheel of names (D314). Slice i spans [i, i+1) × 2π/n clockwise from the pointer at the
 * top when the wheel is at rest. `angle` is how far the wheel has turned clockwise, in radians.
 */
const TAU = Math.PI * 2;

/** Above this many slices, names are not drawn on the wheel; only the winner's is shown. */
export const WHEEL_NAMED_MAX = 60;

/** At most 30 slice ticks a second, however fast the wheel turns. */
export const TICK_MIN_MS = 1000 / 30;

const mod = (a: number, m: number) => ((a % m) + m) % m;

/** Which slice is under the pointer after turning `angle` clockwise. */
export function sliceAt(angle: number, n: number): number {
  const step = TAU / n;
  return Math.min(n - 1, Math.floor(mod(-angle, TAU) / step));
}

/**
 * The total clockwise turn that stops with `target` under the pointer, after `turns` whole
 * turns; `within` (0–1) is where in the slice the pointer ends up.
 */
export function landingAngle(target: number, n: number, turns: number, within = 0.5): number {
  const step = TAU / n;
  return turns * TAU + mod(TAU - (target + within) * step, TAU);
}

export function easeOutQuart(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 4);
}

export function canTick(lastAt: number, now: number): boolean {
  return now - lastAt >= TICK_MIN_MS;
}

/**
 * A slice's name: first name and surname initial ("Priya R."). Shared by the wheel's own texture
 * and the landed-name overlay (DrawScreen), so the enlarged name always matches the slice under
 * the pointer.
 */
export function wheelLabel(p: Person): string {
  return p.initials.length > 1 ? `${p.first} ${p.initials.slice(1)}.` : p.first || p.initials;
}
