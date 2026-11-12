"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Spinner } from "@/components/ui/spinner";
import { REDUCE, prefersReducedMotion, snapshotKeys } from "./dom";
import {
  beginMoment, getMoment, getServerMoment, momentUnanswered, subscribeMoment, type Moment,
} from "./store";

export function useMoment(): Moment {
  return useSyncExternalStore(subscribeMoment, getMoment, getServerMoment);
}

function subscribeReduced(listener: () => void) {
  const q = window.matchMedia(REDUCE);
  q.addEventListener("change", listener);
  return () => q.removeEventListener("change", listener);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, prefersReducedMotion, () => false);
}

/**
 * How long a button whose form stopped working waits for a flash before it decides none is
 * coming. The flash normally lands in the same commit; this only covers a step that answers in
 * place (the booking form's inline refusal) without leaving the circle spinning.
 */
const NO_ANSWER_MS = 400;
const EASE = "cubic-bezier(.4, 0, .2, 1)";

export type MomentFace = "idle" | "busy" | "done";

/**
 * D902: the button half of a success moment. While `pending`, the button shrinks into a circle
 * and spins; once the server says yes it turns green and draws a tick, and stays that way until
 * the dialog it is in has closed. A refusal opens it back into the button it was.
 *
 * The shape is a Web Animation on the element, not a class: the button's width is whatever its
 * label made it, so the circle has to be measured from it, and cancelling the animation hands
 * the element straight back to its own styles. flex-grow and auto margins ride along so a
 * full-width or flex-1 button shrinks to a centred circle rather than a pill stuck to one side.
 *
 * Reduced motion: no shape at all - `face` stays idle and the label says Working, as before.
 */
export function useMomentButton(pending: boolean, ref: React.RefObject<HTMLElement | null>) {
  const owner = useId();
  const m = useMoment();
  const reduced = useReducedMotion();
  const mine = m.owner === owner;
  const busy = pending || (mine && m.phase === "busy");
  const done = mine && (m.phase === "ok" || m.phase === "closing" || m.phase === "landing");
  const shrink = useRef<{ anim: Animation; from: number; to: number } | null>(null);
  const started = useRef(false);
  const won = useRef(false);

  // Start the moment with the press, and give up on it if the form settles and no answer follows.
  useLayoutEffect(() => {
    if (pending && !started.current) {
      started.current = true;
      beginMoment(owner, snapshotKeys());
      return;
    }
    if (!pending && started.current) {
      started.current = false;
      const t = setTimeout(() => momentUnanswered(owner), NO_ANSWER_MS);
      return () => clearTimeout(t);
    }
  }, [pending, owner]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || reduced || typeof el.animate !== "function") return;
    if (busy && !shrink.current) {
      const from = el.offsetWidth;
      const to = el.offsetHeight;
      const hold = { flexGrow: 0, flexBasis: "auto", marginInline: "auto" };
      const anim = el.animate(
        [{ ...hold, width: `${from}px` }, { ...hold, width: `${to}px` }],
        { duration: 220, easing: EASE, fill: "forwards" },
      );
      shrink.current = { anim, from, to };
      return;
    }
    if (done) { won.current = true; return; }
    if (!busy && shrink.current) {
      const { anim, from, to } = shrink.current;
      shrink.current = null;
      anim.cancel();
      // After a success the dialog has normally taken the button away; if not, it simply resets.
      if (won.current) { won.current = false; return; }
      // Refused: cancelled and opened back in one task, so no frame shows the button at either size.
      const hold = { flexGrow: 0, flexBasis: "auto", marginInline: "auto" };
      el.animate([{ ...hold, width: `${to}px` }, { ...hold, width: `${from}px` }], { duration: 220, easing: EASE });
    }
  }, [busy, done, reduced, ref]);

  // A moment that ends while this button is still on the page (rare: its dialog normally takes it
  // away) hands the element back as it was.
  useEffect(() => () => { shrink.current?.anim.cancel(); shrink.current = null; }, []);

  const face: MomentFace = reduced ? "idle" : done ? "done" : busy ? "busy" : "idle";
  return { face, busy, attrs: { "data-moment": face === "idle" ? undefined : face } };
}

/**
 * Classes a moment button needs on top of its own: the circle stays solid while disabled, turns
 * the success green with the tick, and clips the label it keeps (so its height does not change).
 */
export const MOMENT_BUTTON =
  "relative data-[moment]:overflow-hidden data-[moment]:rounded-full data-[moment]:px-0 data-[moment]:disabled:opacity-100 data-[moment]:pointer-events-none data-[moment=done]:bg-success data-[moment=done]:text-white";

/**
 * What a moment button shows. The label is kept, invisible, so the button keeps its height and the
 * circle is as tall as the button was; the spinner and the tick sit over it. Screen readers hear
 * Working while it works, and the toast's words (read out, not shown) once it has worked.
 */
export function MomentLabel({ face, busy, working, children }: {
  face: MomentFace;
  busy: boolean;
  working: string;
  children: React.ReactNode;
}) {
  if (face === "idle") {
    return busy ? <><Spinner data-icon="inline-start" />{working}</> : <>{children}</>;
  }
  return (
    <>
      <span aria-hidden className="invisible">{children}</span>
      <span aria-hidden className="absolute inset-0 flex items-center justify-center">
        {face === "busy" ? <Spinner className="size-5" /> : <MomentTick />}
      </span>
      {face === "busy" && <span className="sr-only">{working}</span>}
    </>
  );
}

function MomentTick() {
  return (
    <svg viewBox="0 0 24 24" className="moment-tick size-6" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/**
 * The dialog half: close when the moment says so, and refuse to be dismissed while the server is
 * still working (a dialog closed mid-send would take the button, and its answer, with it).
 * `seq` makes the close happen once per moment, so the dialog can be opened again straight after.
 */
export function useMomentDialog(open: boolean, setOpen: (open: boolean) => void) {
  const m = useMoment();
  const [closedFor, setClosedFor] = useState(0);
  if (open && m.phase === "closing" && closedFor !== m.seq) {
    setClosedFor(m.seq);
    setOpen(false);
  }
  return (next: boolean) => {
    if (!next && getMoment().phase === "busy") return;
    setOpen(next);
  };
}
