// Scoring and validation of a qualifier run (D767). The score is wpm and nothing else:
// ranks, streaks, skins and effects never change it. Pure, so the server recomputes
// exactly what the tests check.

export const RUN_MS = 30_000;
export const COUNTDOWN_MS = 3_000;
export const GRACE_MS = 3_000;
export const WORDS_PER_RUN = 120;
/** Above this no human types: the run is refused. */
export const HARD_CEILING_WPM = 250;
/** At or above this the run is kept but flagged for the admin. */
export const REVIEW_WPM = 150;
export const FINALISTS = 10;

/** Most word offsets a body may carry (a run can't finish anywhere near this many words). */
const MAX_OFFSETS = 500;
/** Machine-regular check: needs this many words, and gaps this even (std dev / mean). */
const EVEN_MIN_WORDS = 15;
const EVEN_MAX_CV = 0.08;

export type Device = "touch" | "keyboard" | "unknown";

export type Submission = {
  /** Words completed. They are the start of the run's list, so a count is all we need. */
  wordsDone: number;
  /** ms into the run at which each completed word was finished. */
  offsets: number[];
  /** Correct leading letters of the word in progress when time ran out. */
  prefix: number;
  keys: number;
  correctKeys: number;
  device: Device;
  multiInserts: number;
};

export type Scored = { wpm: number; accuracy: number; flagged: boolean };
export type Refusal = "shape" | "offsets" | "too_fast";

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/** Read a request body into a Submission, or null when it isn't one. Device is clamped. */
export function parseSubmission(body: unknown): Submission | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const { wordsDone, prefix, keys, correctKeys, multiInserts, offsets } = b;
  if (!isCount(wordsDone) || !isCount(prefix) || !isCount(keys) || !isCount(correctKeys) || !isCount(multiInserts)) return null;
  if (!Array.isArray(offsets) || offsets.length > MAX_OFFSETS) return null;
  if (!offsets.every((o) => typeof o === "number" && Number.isFinite(o))) return null;
  const device: Device = b.device === "touch" || b.device === "keyboard" ? b.device : "unknown";
  return { wordsDone, offsets: offsets as number[], prefix, keys, correctKeys, device, multiInserts };
}

/** Characters counted: each completed word plus its space, plus the correct prefix of the next. */
function countedChars(words: readonly string[], wordsDone: number, prefix: number): number {
  let n = prefix;
  for (let i = 0; i < wordsDone; i++) n += (words[i]?.length ?? 0) + 1;
  return n;
}

/** wpm = counted characters / 5 / 0.5 min, to one decimal. */
export function wpmOf(words: readonly string[], wordsDone: number, prefix: number): number {
  return Math.round((countedChars(words, wordsDone, prefix) / 5 / (RUN_MS / 60_000)) * 10) / 10;
}

/** Correct keystrokes over all character keystrokes, whole percent; 100 with no keys. */
export function accuracyOf(keys: number, correctKeys: number): number {
  return keys <= 0 ? 100 : Math.round((correctKeys / keys) * 100);
}

/** Word times too regular for a person: 15+ words whose gaps vary by under 8%. */
export function tooEven(offsets: readonly number[]): boolean {
  if (offsets.length < EVEN_MIN_WORDS) return false;
  const gaps = offsets.slice(1).map((o, i) => o - offsets[i]);
  const mean = gaps.reduce((a, g) => a + g, 0) / gaps.length;
  if (mean <= 0) return false;
  const variance = gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length;
  return Math.sqrt(variance) / mean < EVEN_MAX_CV;
}

/**
 * Recompute a submitted run against the words the server gave it. Offsets are checked first
 * (they're a property of the body alone); then the shape against the list; then the ceiling.
 */
export function scoreRun(words: readonly string[], s: Submission): Scored | { refused: Refusal } {
  let prev = 0;
  for (const o of s.offsets) {
    if (!(o > prev) || o > RUN_MS) return { refused: "offsets" };
    prev = o;
  }

  if (s.wordsDone > words.length - 1 || s.offsets.length !== s.wordsDone) return { refused: "shape" };
  if (!(s.prefix >= 0 && s.prefix <= words[s.wordsDone].length)) return { refused: "shape" };
  if (s.correctKeys > s.keys) return { refused: "shape" };
  if (s.keys < countedChars(words, s.wordsDone, s.prefix)) return { refused: "shape" };

  const wpm = wpmOf(words, s.wordsDone, s.prefix);
  if (wpm > HARD_CEILING_WPM) return { refused: "too_fast" };
  return {
    wpm,
    accuracy: accuracyOf(s.keys, s.correctKeys),
    flagged: wpm >= REVIEW_WPM || s.multiInserts > 0 || tooEven(s.offsets),
  };
}
