"use client";
import { use, useLayoutEffect } from "react";
import { useSearchParams } from "next/navigation";
import { readFlash } from "@/lib/flash";
import { getMoment, holdFor, takeBefore } from "./store";
import { bringIntoView, outOfSight, prefersReducedMotion } from "./dom";

/** The search the gate last saw committed: an ok flash already on screen is not news. */
let committed: string | null = null;

/**
 * D902: holds the page an attendee's Book or Submit came back with until its tick has drawn and
 * its dialog has closed (see store.ts for why the page cannot simply be kept), then makes what the
 * moment made glow once - scrolled into view first if it landed out of sight (D903).
 *
 * It lives in the portal layout, which stays mounted while the page under it is replaced, and it
 * reads the search the router is rendering. When that render carries an ok flash this page has
 * not shown yet and a moment is playing, the gate suspends on the moment's promise. Inside a
 * transition React keeps the old page up rather than show a fallback, so the old dialog and button
 * carry on (they read the store, which only ever changes outside a render). The store opens the
 * promise at landing, and the new page commits.
 *
 * Deliberately not subscribed to the store: a store change while the held render is in progress
 * would make React redo it synchronously, and a synchronous render cannot wait - it would let the
 * new page in early.
 *
 * In its own Suspense boundary (as Flash is) for useSearchParams; already shown, so a held
 * transition never swaps it for its fallback.
 */
export function MomentGate() {
  const params = useSearchParams();
  const search = params.toString();
  const fresh = search !== committed && readFlash(params)?.tone === "ok";
  const hold = fresh ? holdFor(prefersReducedMotion()) : null;
  if (hold) use(hold);

  useLayoutEffect(() => {
    committed = search;
    if (getMoment().phase !== "landing") return;
    const seen = takeBefore();
    if (!seen) return;
    const made = Array.from(document.querySelectorAll<HTMLElement>("[data-moment-key]"))
      .filter((el) => !seen.has(el.dataset.momentKey ?? ""));
    if (made.length === 0) return;
    const reduced = prefersReducedMotion();
    // The new entry or seat can land below the fold (under a tall cover, or down a long list):
    // bring it up first, so the glow is seen, and glow once it has stopped moving.
    const arrived = outOfSight(made[0]) ? bringIntoView(made[0], reduced) : Promise.resolve();
    if (reduced) return;
    void arrived.then(() => {
      for (const el of made) {
        if (!el.isConnected) continue;
        el.setAttribute("data-moment-landed", "");
        el.addEventListener("animationend", () => el.removeAttribute("data-moment-landed"), { once: true });
      }
    });
  }, [search]);

  return null;
}
