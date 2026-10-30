// How the typing box's events become letters (D772). Pure, so the fallback for keyboards that
// compose (most Android ones) is tested without a browser.
import type { Device } from "./scoring";

/**
 * What changed between what the box held and what it holds now: letters removed from the end,
 * then letters added. Used for composing keyboards, whose `beforeinput` cannot be cancelled and
 * carries the whole word so far, not the new letter.
 */
export function inputDiff(prev: string, next: string): { backspaces: number; text: string } {
  let p = 0;
  while (p < prev.length && p < next.length && prev[p] === next[p]) p++;
  return { backspaces: prev.length - p, text: next.slice(p) };
}

/**
 * A key from a physical keyboard: one character, and not the 229 / "Unidentified" a soft
 * keyboard sends while composing. iOS's soft keyboard sends real keys too, so this is best effort.
 */
export function isPhysicalKey(e: { key: string; keyCode: number; isComposing: boolean }): boolean {
  return e.key.length === 1 && !e.isComposing && e.keyCode !== 229;
}

/** Recorded on the run for the admin only; it never changes the ranking. */
export function deviceOf(coarsePointer: boolean, sawPhysicalKey: boolean): Device {
  return coarsePointer && !sawPhysicalKey ? "touch" : "keyboard";
}
