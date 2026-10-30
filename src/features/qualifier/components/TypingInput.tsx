"use client";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { Device } from "../scoring";
import { deviceOf, inputDiff, isPhysicalKey } from "../input";

/** `focused` says whether keys are reaching the box; `device` is what the run records (best effort). */
export type TypingInputHandle = { focus(): void; focused(): boolean; device(): Device };

/** Enough single backspaces to empty any word in progress (Ctrl/Alt+Backspace). */
const WORD_CLEAR = 64;
/** Inserts that are not typing: blocked outright (D767, "Paste is blocked"). */
const BLOCKED = new Set(["insertFromPaste", "insertFromPasteAsQuotation", "insertFromDrop", "insertFromYank", "insertReplacementText"]);

/**
 * The one box a run is typed into (D772). It is kept empty, so the keyboard has nothing to
 * autocorrect, and every letter is reported as it happens, timed from the run's start (`origin`,
 * on the `performance.now()` clock).
 *
 * - `beforeinput` is the main path: `insertText` → onText, `deleteContentBackward` → onBackspace,
 *   each cancelled so the box stays empty. Paste and drop are cancelled and dropped.
 * - Composing keyboards (most Android ones: `insertCompositionText`, which cannot be cancelled and
 *   carries the whole word so far) and browsers with no `beforeinput` fall through to the `input`
 *   event, where the box is diffed against what was already reported. The box is emptied as
 *   soon as no composition is open.
 * - Backspace on the empty box is taken at `keydown`: browsers send no `beforeinput` when there
 *   is nothing to delete, and Android keyboards send a real Backspace key then.
 *
 * `disabled` swallows input without blurring, so the soft keyboard stays up between runs. The
 * native `disabled` attribute would close it.
 */
export function TypingInput({
  onText, onBackspace, disabled, origin = 0, className, ref,
}: {
  onText(text: string, tMs: number): void;
  onBackspace(): void;
  disabled: boolean;
  origin?: number;
  className?: string;
  ref?: Ref<TypingInputHandle>;
}) {
  const box = useRef<HTMLInputElement>(null);
  const sawPhysical = useRef(false);
  // Latest props for the native listeners, which are attached once.
  const latest = useRef({ onText, onBackspace, disabled, origin });
  useEffect(() => {
    latest.current = { onText, onBackspace, disabled, origin };
  }, [onText, onBackspace, disabled, origin]);

  useImperativeHandle(ref, () => ({
    focus: () => box.current?.focus({ preventScroll: true }),
    focused: () => !!box.current && document.activeElement === box.current,
    device: () => deviceOf(typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches, sawPhysical.current),
  }), []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let shadow = ""; // what the box holds that has already been reported
    let composing = false;
    const t = () => performance.now() - latest.current.origin;
    const text = (s: string) => { if (!latest.current.disabled && s) latest.current.onText(s, t()); };
    const back = (n: number) => { if (!latest.current.disabled) for (let i = 0; i < n; i++) latest.current.onBackspace(); };
    const empty = () => { el.value = ""; shadow = ""; };

    const onBeforeInput = (e: InputEvent) => {
      const type = e.inputType;
      if (BLOCKED.has(type)) { e.preventDefault(); return; }
      // Left to the input event: a composition, or anything this browser won't let us cancel.
      if (composing || e.isComposing || type === "insertCompositionText" || !e.cancelable) return;
      e.preventDefault();
      if (type === "insertText") text(e.data ?? "");
      else if (type === "deleteContentBackward") back(1);
      else if (type.startsWith("delete") && type.endsWith("Backward")) back(WORD_CLEAR);
      // Anything else (line breaks, forward deletes, formatting) does nothing.
    };
    const onInput = (e: Event) => {
      const d = inputDiff(shadow, el.value);
      back(d.backspaces);
      text(d.text);
      if (composing || (e as InputEvent).isComposing) shadow = el.value;
      else empty();
    };
    const onCompositionStart = () => { composing = true; shadow = el.value; };
    const onCompositionEnd = () => {
      composing = false;
      // Whatever the last update left unreported (browsers order this event differently).
      const d = inputDiff(shadow, el.value);
      back(d.backspaces);
      text(d.text);
      empty();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isPhysicalKey(e)) sawPhysical.current = true;
      if (e.key === "Backspace" && e.keyCode !== 229 && !composing && el.value === "") {
        e.preventDefault();
        back(e.ctrlKey || e.altKey || e.metaKey ? WORD_CLEAR : 1);
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
      aria-label="Type the word shown, then space"
      aria-disabled={disabled}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="none"
      spellCheck={false}
      inputMode="text"
      enterKeyHint="next"
      className={className}
      // 16px or more, or iOS zooms the page when the box is focused (whatever the root size).
      style={{ fontSize: 16 }}
    />
  );
}
