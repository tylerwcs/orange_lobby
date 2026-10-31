// Tuning of the slime game (D790), shared by the phone and the server replay. Times are integer
// ms, distances integer mm, speeds mm/s. The names are fixed; the values are tuning.

/** One engine step. Every run advances in whole ticks. */
export const TICK_MS = 50;
export const COUNTDOWN_MS = 3000;

export const START_HEALTH = 3;
/** How long a slime that reached the player stays stuck before it explodes. */
export const STICK_MS = 3000;
/** Health an exploding small slime / boss costs. */
export const SMALL_HIT = 1;
export const BOSS_HIT = 2;

export const SPAWN_DIST_MM = 18000;
export const BOSS_DIST_MM = 20000;
export const SPEED_START_MM_S = 1600;
export const SPEED_STEP_MM_S = 200;
export const SPEED_MAX_MM_S = 4000;
export const BOSS_SPEED_MM_S = 600;

/** Gap between small spawns: shrinks every ramp, plus up to GAP_JITTER_MS of random. */
export const GAP_START_MS = 2200;
export const GAP_STEP_MS = 150;
export const GAP_MIN_MS = 700;
export const GAP_JITTER_MS = 400;
/** Speed and spawn gap step up this often. */
export const RAMP_EVERY_MS = 30000;
export const MAX_SMALL = 8;

export const BOSS_FIRST_MS = 60000;
/** The next boss is due this long after the previous one is gone. */
export const BOSS_GAP_MS = 60000;

export const POINTS_PER_LETTER = 10;
export const COMBO_STEP = 5;
export const COMBO_MAX_MULT = 5;
/** Popping boss n adds BOSS_BONUS × n. */
export const BOSS_BONUS = 100;

// Run limits and replay checks (used by the server, D790).
export const RUN_CAP_MS = 1_200_000;
export const SUBMIT_GRACE_MS = 60_000;
export const EARLY_TOLERANCE_MS = 2000;
export const CEILING_KEYS = 40;
export const CEILING_WINDOW_MS = 2000;
export const REVIEW_CPS = 12.5;
export const REVIEW_WINDOW_MS = 10_000;

/** 1 + floor(combo ÷ COMBO_STEP), capped at ×COMBO_MAX_MULT. */
export const multiplier = (combo: number): number => Math.min(1 + Math.floor(combo / COMBO_STEP), COMBO_MAX_MULT);

/** Shortest and longest small-slime word at `elapsedMs`: words grow longer as the run goes on. */
export const lengthBand = (elapsedMs: number): [min: number, max: number] => [
  Math.min(3 + Math.floor(elapsedMs / 60000), 6),
  Math.min(5 + Math.floor(elapsedMs / 30000), 10),
];

const ramps = (elapsedMs: number) => Math.floor(elapsedMs / RAMP_EVERY_MS);

/** Speed of a small slime spawned at `elapsedMs`, mm/s. */
export const speedAt = (elapsedMs: number): number =>
  Math.min(SPEED_START_MM_S + SPEED_STEP_MM_S * ramps(elapsedMs), SPEED_MAX_MM_S);

/** Base gap after a small spawn at `elapsedMs`, ms (before jitter). */
export const gapAt = (elapsedMs: number): number => Math.max(GAP_START_MS - GAP_STEP_MS * ramps(elapsedMs), GAP_MIN_MS);
