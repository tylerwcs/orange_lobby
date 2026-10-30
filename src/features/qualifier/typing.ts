// The typing rules of a qualifier run (D767), as a pure reducer so the phone and the tests
// run the same code. The client feeds it whatever the input box inserted; the server never
// replays keystrokes, it only checks what the client submits (see scoring.ts).

export type TypingState = {
  /** The word being typed (0-based); equals the number of words completed. */
  index: number;
  /** What is in the box for the current word, wrong letters included. */
  typed: string;
  /** Every character keystroke so far (letters and spaces; backspace is not one). */
  keys: number;
  /** Keystrokes that were right when pressed. */
  correctKeys: number;
  /** Inserts of more than one character at once (swipe typing, whole-word commits). */
  multiInserts: number;
  /** Time in ms into the run at which each completed word was finished. */
  offsets: number[];
};

export const initialTyping: TypingState = {
  index: 0, typed: "", keys: 0, correctKeys: 0, multiInserts: 0, offsets: [],
};

/**
 * Apply inserted `text` at `tMs` into the run, one character at a time, lowercased.
 * - A space completes the word only when `typed` is exactly the word; otherwise it is a wrong
 *   keystroke and is dropped (the player must backspace the mistake first).
 * - Any other character is appended and is correct when `typed` stays a prefix of the word.
 * - Other whitespace (Enter, Tab) is ignored. Input after the last word is ignored.
 * - An insert of more than one character counts once in `multiInserts`.
 */
export function typeText(
  s: TypingState, words: readonly string[], text: string, tMs: number,
): TypingState {
  let { index, typed, keys, correctKeys } = s;
  const offsets = s.offsets.slice();
  for (const ch of text.toLowerCase()) {
    const word = words[index];
    if (word === undefined) break;
    if (ch === " " || ch === " ") { // some keyboards send a non-breaking space
      keys++;
      if (typed === word) {
        correctKeys++;
        offsets.push(tMs);
        index++;
        typed = "";
      }
    } else if (/\s/.test(ch)) {
      continue;
    } else {
      keys++;
      if (word.startsWith(typed + ch)) correctKeys++;
      typed += ch;
    }
  }
  return {
    index, typed, keys, correctKeys, offsets,
    multiInserts: s.multiInserts + (text.length > 1 ? 1 : 0),
  };
}

/** Remove the last letter of the current word. Finished words can't be reopened. */
export function backspace(s: TypingState): TypingState {
  return s.typed ? { ...s, typed: s.typed.slice(0, -1) } : s;
}

/** How many leading letters of the current word are right (what the wpm counts of it). */
export function prefixOf(s: TypingState, words: readonly string[]): number {
  const word = words[s.index];
  if (word === undefined) return 0;
  let n = 0;
  while (n < s.typed.length && n < word.length && s.typed[n] === word[n]) n++;
  return n;
}

/** How many words a recorded run had finished by `tMs` (offsets are increasing). */
export function ghostIndexAt(offsets: readonly number[], tMs: number): number {
  let lo = 0;
  let hi = offsets.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid] <= tMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
