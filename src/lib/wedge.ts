/**
 * Reads a handheld barcode scanner that pretends to be a keyboard (a "keyboard wedge"): it
 * types the code it read, one key at a time, then presses Enter (or Tab, on some setups).
 *
 * A scan is told apart from a person by speed alone. A scanner types a whole badge URL with a
 * few milliseconds between keys; a person, even a quick one, is an order of magnitude slower,
 * and never keeps it up for `minLength` keys in a row. So every printable key that arrives
 * more than `maxGapMs` after the one before starts a fresh burst, and Enter only returns a
 * burst that is long enough and still going.
 *
 * Pure — the caller supplies `KeyboardEvent.key` and a timestamp — so it is testable without
 * a DOM, and the Scanner owns the listener.
 */
export function createWedgeReader({ maxGapMs = 60, minLength = 8 }: { maxGapMs?: number; minLength?: number } = {}) {
  let buffer = "";
  let last = -Infinity;

  return {
    /** Returns the scanned text when `key` completes a scan, otherwise null. */
    feed(key: string, at: number): string | null {
      if (key === "Enter" || key === "Tab") {
        const scanned = buffer.length >= minLength && at - last <= maxGapMs ? buffer : null;
        buffer = "";
        return scanned;
      }
      // Modifiers arrive between characters (Shift before every capital) and say nothing.
      if (key === "Shift" || key === "Control" || key === "Alt" || key === "Meta") return null;
      if (key.length !== 1) { buffer = ""; return null; } // Backspace, arrows: a person
      buffer = at - last > maxGapMs ? key : buffer + key;
      last = at;
      return null;
    },
  };
}
