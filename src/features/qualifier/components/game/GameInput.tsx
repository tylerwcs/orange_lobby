"use client";
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from "react";
import { deviceOf, isPhysicalKey } from "../../input";
import type { Device } from "../../game/timeline";
import { keysFromInput } from "../../game/keys";

/** `device` is what the run records (best effort). */
export type GameInputHandle = { focus(): void; focused(): boolean; device(): Device };

/** Inserts that are not typing: blocked outright (D767, "Paste is blocked"). */
const BLOCKED = new Set(["insertFromPaste", "insertFromPasteAsQuotation", "insertFromDrop", "insertFromYank", "insertReplacementText"]);

/**
 * The one box a slime run is typed into (D794): a native input, focused on mount and kept empty,
 * so the keyboard has nothing to autocorrect. Every change becomes engine keys through
 * `keysFromInput` (letters lowercased, everything else dropped, a multi-letter change marked as
 * an insert) and is reported at once; the caller times it.
 *
 * - `beforeinput` is the main path: `insertText` and `deleteContentBackward` are cancelled, so
 *   the box stays empty. Paste and drop are cancelled and dropped.
 * - Composing keyboards (most Android ones: `insertCompositionText`, which cannot be cancelled and
 *   carries the whole word so far) and browsers with no `beforeinput` fall through to `input`,
 *   where the box is diffed against what was already reported, and emptied as soon as no
 *   composition is open.
 * - Backspace on the empty box is taken at `keydown`: browsers send no `beforeinput` when there
 *   is nothing to delete, and Android keyboards send a real Backspace key then.
 * - A word-delete (Ctrl/Alt+Backspace, a keyboard's delete-word) calls `onWordBack`: the caller
 *   knows how many letters the locked word has.
 *
 * Focus is taken in a layout effect, so a parent that mounts this inside a tap (flushSync) opens
 * a phone's keyboard. It never catches taps itself: the overlay re-focuses it on any tap.
 */
export function GameInput({ onKeys, onWordBack, ref }: {
  onKeys(keys: string[], insert: boolean): void;
  onWordBack(): void;
  ref?: Ref<GameInputHandle>;
}) {
  const box = useRef<HTMLInputElement>(null);
  const sawPhysical = useRef(false);
  // Latest props for the native listeners, which are attached once.
  const latest = useRef({ onKeys, onWordBack });
  useEffect(() => { latest.current = { onKeys, onWordBack }; }, [onKeys, onWordBack]);

  useImperativeHandle(ref, () => ({
    focus: () => box.current?.focus({ preventScroll: true }),
    focused: () => !!box.current && document.activeElement === box.current,
    device: () => deviceOf(typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches, sawPhysical.current),
  }), []);

  useLayoutEffect(() => { box.current?.focus({ preventScroll: true }); }, []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let shadow = ""; // what the box holds that has already been reported
    let composing = false;
    const report = (prev: string, next: string) => {
      const { keys, insert } = keysFromInput(prev, next);
      if (keys.length > 0) latest.current.onKeys(keys, insert);
    };
    const empty = () => { el.value = ""; shadow = ""; };

    const onBeforeInput = (e: InputEvent) => {
      const type = e.inputType;
      if (BLOCKED.has(type)) { e.preventDefault(); return; }
      // Left to the input event: a composition, or anything this browser won't let us cancel.
      if (composing || e.isComposing || type === "insertCompositionText" || !e.cancelable) return;
      e.preventDefault();
      if (type === "insertText") report("", e.data ?? "");
      else if (type === "deleteContentBackward") latest.current.onKeys(["\b"], false);
      else if (type.startsWith("delete") && type.endsWith("Backward")) latest.current.onWordBack();
      // Anything else (line breaks, forward deletes, formatting) does nothing.
    };
    const onInput = (e: Event) => {
      report(shadow, el.value);
      if (composing || (e as InputEvent).isComposing) shadow = el.value;
      else empty();
    };
    const onCompositionStart = () => { composing = true; shadow = el.value; };
    const onCompositionEnd = () => {
      composing = false;
      // Whatever the last update left unreported (browsers order this event differently).
      report(shadow, el.value);
      empty();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isPhysicalKey(e)) sawPhysical.current = true;
      if (e.key === "Enter") e.preventDefault();
      if (e.key === "Backspace" && e.keyCode !== 229 && !composing && el.value === "") {
        e.preventDefault();
        if (e.ctrlKey || e.altKey || e.metaKey) latest.current.onWordBack();
        else latest.current.onKeys(["\b"], false);
      }
    };
    const block = (e: Event) => e.preventDefault();

    el.addEventListener("beforeinput", onBeforeInput);
    el.addEventListener("input", onInput);
    el.addEventListener("compositionstart", onCompositionStart);
    el.addEventListener("compositionend", onCompositionEnd);
    el.addEventListener("keydown", onKeyDown);
    el.addEventListener("paste", block);
    el.addEventListener("drop", block);
    return () => {
      el.removeEventListener("beforeinput", onBeforeInput);
      el.removeEventListener("input", onInput);
      el.removeEventListener("compositionstart", onCompositionStart);
      el.removeEventListener("compositionend", onCompositionEnd);
      el.removeEventListener("keydown", onKeyDown);
      el.removeEventListener("paste", block);
      el.removeEventListener("drop", block);
    };
  }, []);

  return (
    <input
      ref={box}
      type="text"
      aria-label="Type the words on the slimes"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="none"
      spellCheck={false}
      inputMode="text"
      enterKeyHint="go"
      // Out of sight and out of the way of taps, but a real focusable box (iOS opens its
      // keyboard only for one). Transparent text and caret, so nothing flickers while composing.
      className="pointer-events-none absolute left-0 top-0 h-8 w-8 border-0 bg-transparent p-0 text-transparent caret-transparent opacity-0 outline-none"
      // 16px or more, or iOS zooms the page when the box is focused (whatever the root size).
      style={{ fontSize: 16 }}
    />
  );
}
