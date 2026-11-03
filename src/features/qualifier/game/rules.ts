// Tuning of the slime game (D790), shared by the phone and the server replay. Times are integer
// ms, distances integer mm, speeds mm/s. The names are fixed; the values are tuning.

/** One engine step. Every run advances in whole ticks. */
export const TICK_MS = 50;
export const COUNTDOWN_MS = 3000;

/** How long a slime that reached the player stays stuck, biting, before it explodes. */
export const STICK_MS = 3000;
/**
 * Points an exploding small slime / boss costs (D812): there is no health, so a bite costs score,
 * and the combo. The score never drops below 0.
 */
export const SMALL_HIT = 150;
export const BOSS_HIT = 500;

export const SPAWN_DIST_MM = 18000;
export const BOSS_DIST_MM = 20000;
/**
 * A small slime's speed, set when it spawns: SPEED_START_MM_S, rising smoothly by
 * SPEED_GAIN_PER_MIN_MM_S every minute up to SPEED_MAX_MM_S. 1.8 m/s at 0:00, 2.4 at 1:00, 3.0
 * at 2:00, 3.6 at the end (D815: a step up from 1.5-3.3). This, longer words (lengthBand) and the
 * two-word slimes are what make a run harder; slimes keep spawning at the same pace.
 */
export const SPEED_START_MM_S = 1800;
export const SPEED_GAIN_PER_MIN_MM_S = 600;
export const SPEED_MAX_MM_S = 3600;
export const BOSS_SPEED_MM_S = 1100;
/**
 * The last boss starts closer, so it reaches the player just as the run ends: 15 s at
 * BOSS_SPEED_MM_S (FINAL_BOSS_DIST_MM ÷ the 55 mm it walks a tick = 300 ticks).
 */
export const FINAL_BOSS_DIST_MM = 16_500;

/** Gap between small spawns, the same all run, plus up to GAP_JITTER_MS of random: about one every 2 s. */
export const GAP_MS = 1800;
export const GAP_JITTER_MS = 400;
export const MAX_SMALL = 10;

/**
 * When the bosses come (D812): one halfway, and the last at 2:45, the run's last slime: no small
 * slime spawns after it. Small slimes also wait while a boss is out.
 */
export const BOSS_AT_MS = [90_000, 165_000] as const;
/** How many words boss n (1-based) carries (D815): the last has only 15 s. */
export const BOSS_WORDS = [14, 12] as const;

/**
 * From TWO_WORD_FROM_MS (after the first boss), one small slime in TWO_WORD_ONE_IN carries a
 * two-word phrase (PHRASES) instead of a word (D815).
 */
export const TWO_WORD_FROM_MS = 100_000;
export const TWO_WORD_ONE_IN = 3;

export const POINTS_PER_LETTER = 10;
export const COMBO_STEP = 5;
export const COMBO_MAX_MULT = 5;
/** Popping boss n adds BOSS_BONUS × n. */
export const BOSS_BONUS = 100;
/** Popping the last boss ends the run there; every whole second left adds this. */
export const TIME_BONUS_PER_S = 50;

// Run limits and replay checks (used by the server, D790).
/** Every run lasts this long (D812), unless the last boss is popped sooner. */
export const RUN_CAP_MS = 180_000;
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
 * Shortest and longest small-slime word at `elapsedMs` (D815): words grow longer as the run goes
 * on, the longest by a letter every 20 s, the shortest every 40 s. 4-6 letters at 0:00, 5-9 at
 * 1:00, 7-12 from 2:00.
 */
export const lengthBand = (elapsedMs: number): [min: number, max: number] => [
  Math.min(4 + Math.floor(elapsedMs / 40000), 7),
  Math.min(6 + Math.floor(elapsedMs / 20000), 12),
];

/** Speed of a small slime spawned at `elapsedMs`, mm/s. Integer. */
export const speedAt = (elapsedMs: number): number =>
  Math.min(SPEED_START_MM_S + Math.floor((elapsedMs * SPEED_GAIN_PER_MIN_MM_S) / 60000), SPEED_MAX_MM_S);
