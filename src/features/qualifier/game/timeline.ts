// The keystroke timeline of a slime run (D791). The phone sends the server its keys, never a score;
// the server replays them through the engine. These are the wire format and the checks that run
// on it before and beside the replay. Integer ms only, no clock and no randomness in here.
import { CEILING_KEYS, CEILING_WINDOW_MS, REVIEW_CPS, REVIEW_WINDOW_MS, RUN_CAP_MS } from "./rules";

export type Device = "touch" | "keyboard" | "unknown";

/** One key the player pressed: `t` ms into the run; `insert` when it came from pasted or injected text. */
export type Entry = { key: string; t: number; insert: boolean };

/** The wire form of a run: one char per key (a–z, "\b"), `times` the gap in ms to the previous key (the first from 0). */
export type Timeline = { keys: string; times: number[]; inserts: number[] };

export type SubmitBody = Timeline & { runId: string; device: Device };

/** Why the submit route answered `{ ok: false, reason }`. */
export type SubmitReason = "early" | "late" | "done" | "refused" | "invalid";

const MAX_KEYS = 20_000;
const DEVICES: readonly string[] = ["touch", "keyboard", "unknown"];
/** An inside-the-run rhythm this even, over this many keys, reads as a script, not a hand. */
const EVEN_MIN_KEYS = 60;
const EVEN_MAX_CV = 0.15;

export function encodeTimeline(entries: readonly Entry[]): Timeline {
  const times: number[] = [];
  const inserts: number[] = [];
  let prev = 0;
  entries.forEach((e, i) => {
    times.push(e.t - prev);
    prev = e.t;
    if (e.insert) inserts.push(i);
  });
  return { keys: entries.map((e) => e.key).join(""), times, inserts };
}

export function decodeTimeline(t: Timeline): Entry[] {
  const insert = new Set(t.inserts);
  let at = 0;
  return Array.from(t.keys, (key, i) => {
    at += t.times[i];
    return { key, t: at, insert: insert.has(i) };
  });
}

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

/** Validate an untrusted submit body; null when anything is off. */
export function parseSubmitBody(body: unknown): SubmitBody | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const { runId, device, keys, times, inserts } = b;
  if (typeof runId !== "string" || runId === "") return null;
  if (typeof device !== "string" || !DEVICES.includes(device)) return null;
  if (typeof keys !== "string" || keys.length > MAX_KEYS || !/^[a-z\b]*$/.test(keys)) return null;
  if (!Array.isArray(times) || times.length !== keys.length || !times.every(isCount)) return null;
  if (!Array.isArray(inserts)) return null;
  let last = -1;
  for (const i of inserts) {
    if (!isCount(i) || i <= last || i >= keys.length) return null;
    last = i;
  }
  return { runId, device: device as Device, keys, times: times as number[], inserts: inserts as number[] };
}

export type TimelineRefusal = "too_fast" | "too_long";

/**
 * The keys the speed checks count: letters typed one at a time. Inserted letters (swipe, a
 * keyboard's suggestion) are flagged instead, and backspaces are left out (R13): a keyboard that
 * rewrites a long composition sends many at the same instant, and a backspace never scores.
 */
const typedLetters = (entries: readonly Entry[]) => entries.filter((e) => !e.insert && e.key !== "\b");

/** Refuse what no hand could type: past the run cap, or more than CEILING_KEYS typed letters in any CEILING_WINDOW_MS. */
export function checkTimeline(entries: readonly Entry[]): TimelineRefusal | null {
  if (entries.length > 0 && entries[entries.length - 1].t > RUN_CAP_MS) return "too_long";
  const typed = typedLetters(entries);
  // Two pointers: `lo` is the oldest key still within the window that ends at key `hi`.
  for (let hi = 0, lo = 0; hi < typed.length; hi++) {
    while (typed[hi].t - typed[lo].t > CEILING_WINDOW_MS) lo++;
    if (hi - lo + 1 > CEILING_KEYS) return "too_fast";
  }
  return null;
}

export type Review = { flagged: boolean; peakCps: number; inserts: number };

/**
 * Signals for a human to look at, never a refusal and never a score change: any inserted text, a
 * burst of typed letters at REVIEW_CPS or more, or a long run of suspiciously even letters.
 */
export function reviewOf(entries: readonly Entry[]): Review {
  const inserts = entries.filter((e) => e.insert).length;
  const typed = typedLetters(entries);
  let most = 0;
  for (let hi = 0, lo = 0; hi < typed.length; hi++) {
    while (typed[hi].t - typed[lo].t >= REVIEW_WINDOW_MS) lo++;
    most = Math.max(most, hi - lo + 1);
  }
  // Most keys in any REVIEW_WINDOW_MS window, as keys per second to one decimal.
  const peakCps = Math.round((most * 10_000) / REVIEW_WINDOW_MS) / 10;
  return { flagged: inserts > 0 || peakCps >= REVIEW_CPS || tooEven(typed), peakCps, inserts };
}

/** Gaps with a coefficient of variation under EVEN_MAX_CV: stddev < EVEN_MAX_CV × mean, compared squared. */
function tooEven(typed: readonly Entry[]): boolean {
  if (typed.length < EVEN_MIN_KEYS) return false;
  const gaps = typed.slice(1).map((e, i) => e.t - typed[i].t);
  const mean = gaps.reduce((a, g) => a + g, 0) / gaps.length;
  const variance = gaps.reduce((a, g) => a + (g - mean) * (g - mean), 0) / gaps.length;
  return variance < EVEN_MAX_CV * EVEN_MAX_CV * mean * mean || mean === 0;
}
