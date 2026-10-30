// The phone's side of one run (D772): where it is on the server's clock, the live wpm, and the
// body it submits. Pure, so the timing rules are tested without a browser.
import { prefixOf, type TypingState } from "./typing";
import { RUN_MS, wpmOf, type Device, type Submission } from "./scoring";

export type RunStage = "countdown" | "sprint" | "over";

/**
 * Where a run is at `tMs` from its start (negative during the countdown): the 3-2-1 number,
 * the time left and the time elapsed. The countdown is clamped to 3..1, so a start that arrives
 * late or early still reads sensibly.
 */
export function runClock(tMs: number): { stage: RunStage; count: number; leftMs: number; elapsedMs: number } {
  if (tMs < 0) return { stage: "countdown", count: Math.min(3, Math.max(1, Math.ceil(-tMs / 1000))), leftMs: RUN_MS, elapsedMs: 0 };
  if (tMs < RUN_MS) return { stage: "sprint", count: 0, leftMs: RUN_MS - tMs, elapsedMs: tMs };
  return { stage: "over", count: 0, leftMs: 0, elapsedMs: RUN_MS };
}

/**
 * The run's start on this page's `performance.now()` clock. `startsAtMs` is on the server's clock;
 * `offset` is server minus phone (D257); `dateNow` and `perfNow` are read at the same moment.
 * The performance clock does not jump when the phone's wall clock is corrected mid-run.
 */
export function perfOrigin(startsAtMs: number, offset: number, dateNow: number, perfNow: number): number {
  return perfNow + (startsAtMs - (dateNow + offset));
}

/** Damps the first seconds, when a word or two would read as a wild speed. */
const LIVE_MIN_MS = 2000;

/** wpm so far: the run's wpm over the time elapsed instead of the full 30 s, to one decimal. */
export function liveWpm(words: readonly string[], index: number, prefix: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return Math.round(wpmOf(words, index, prefix) * (RUN_MS / Math.max(elapsedMs, LIVE_MIN_MS)) * 10) / 10;
}

/**
 * Word times as the server takes them: whole ms (the column is int[]), strictly increasing, in
 * (0, 30 s]. Two words finished by one insert share a time; the earlier one is moved back 1 ms.
 */
export function cleanOffsets(offsets: readonly number[]): number[] {
  const out = offsets.map((o) => Math.min(RUN_MS, Math.max(1, Math.round(o))));
  for (let i = out.length - 2; i >= 0; i--) if (out[i] >= out[i + 1]) out[i] = out[i + 1] - 1;
  for (let i = 0; i < out.length; i++) out[i] = Math.max(out[i], (i > 0 ? out[i - 1] : 0) + 1);
  return out;
}

/** The submit body for a finished run (the run id is added by the caller). */
export function submissionOf(s: TypingState, words: readonly string[], device: Device): Submission {
  return {
    wordsDone: s.index,
    offsets: cleanOffsets(s.offsets),
    prefix: prefixOf(s, words),
    keys: s.keys,
    correctKeys: s.correctKeys,
    device,
    multiInserts: s.multiInserts,
  };
}
