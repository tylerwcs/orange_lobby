// The phone's side of a slime run's clock and keys (D794). Pure, so the timing and the input rules
// are tested without a browser. Not engine code: the engine only ever sees the keys and the
// integer times worked out here.
import { inputDiff } from "../input";

/**
 * The run's start on this page's `performance.now()` clock. `startsAtMs` is on the server's clock;
 * `offset` is server minus phone (D257); `dateNow` and `perfNow` are read at the same moment.
 * The performance clock does not jump when the phone's wall clock is corrected mid-run.
 */
export function perfOrigin(startsAtMs: number, offset: number, dateNow: number, perfNow: number): number {
  return perfNow + (startsAtMs - (dateNow + offset));
}

/**
 * The engine keys for one change of the typing box from `prev` to `next`: a `"\b"` for each
 * character removed from the end, then the letters added, lowercased, with everything that is
 * not a–z dropped (spaces, digits, punctuation, Enter). `insert` when more than one letter
 * arrived at once (swipe typing, a keyboard's suggestion): those letters share one timestamp and
 * are marked in the timeline.
 */
export function keysFromInput(prev: string, next: string): { keys: string[]; insert: boolean } {
  const d = inputDiff(prev, next);
  const letters = Array.from(d.text.toLowerCase()).filter((c) => c >= "a" && c <= "z");
  const keys: string[] = Array.from({ length: d.backspaces }, () => "\b");
  return { keys: keys.concat(letters), insert: letters.length > 1 };
}
