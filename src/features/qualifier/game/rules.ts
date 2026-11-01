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
/**
 * A small slime's speed, set when it spawns: SPEED_START_MM_S, rising smoothly by
 * SPEED_GAIN_PER_MIN_MM_S every minute up to SPEED_MAX_MM_S. 1.5 m/s at 0:00, 1.95 at 1:00, 2.4
 * at 2:00, 3.3 at 4:00, the top from 6:40. This and longer words (lengthBand) are what make a run
 * harder; slimes keep spawning at the same pace.
 */
export const SPEED_START_MM_S = 1500;
export const SPEED_GAIN_PER_MIN_MM_S = 450;
export const SPEED_MAX_MM_S = 4500;
export const BOSS_SPEED_MM_S = 1100;

/** Gap between small spawns, the same all run, plus up to GAP_JITTER_MS of random: about one every 2 s. */
export const GAP_MS = 1800;
export const GAP_JITTER_MS = 400;
export const MAX_SMALL = 10;

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
/** A run with more than CEILING_KEYS accepted letters in any CEILING_WINDOW_MS is refused (Ruling 17). */
export const CEILING_KEYS = 60;
export const CEILING_WINDOW_MS = 2000;
export const REVIEW_CPS = 12.5;
export const REVIEW_WINDOW_MS = 10_000;

/** 1 + floor(combo ÷ COMBO_STEP), capped at ×COMBO_MAX_MULT. */
export const multiplier = (combo: number): number => Math.min(1 + Math.floor(combo / COMBO_STEP), COMBO_MAX_MULT);

/**
 * Shortest and longest small-slime word at `elapsedMs`: words grow longer as the run goes on, the
 * longest by a letter every 20 s, the shortest every 40 s. 3-5 letters at 0:00, 4-8 at 1:00, 6-10
 * at 2:00, 7-10 from 2:40.
 */
export const lengthBand = (elapsedMs: number): [min: number, max: number] => [
  Math.min(3 + Math.floor(elapsedMs / 40000), 7),
  Math.min(5 + Math.floor(elapsedMs / 20000), 10),
];

/** Speed of a small slime spawned at `elapsedMs`, mm/s. Integer. */
export const speedAt = (elapsedMs: number): number =>
  Math.min(SPEED_START_MM_S + Math.floor((elapsedMs * SPEED_GAIN_PER_MIN_MM_S) / 60000), SPEED_MAX_MM_S);
