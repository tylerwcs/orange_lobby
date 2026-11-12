export const REDUCE = "(prefers-reduced-motion: reduce)";

/** Read where it is needed rather than at import, so a test or the server never touches window. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia(REDUCE).matches;
}

/** The page's moment keys right now - what a press compares the new page against (D902). */
export function snapshotKeys(): Set<string> {
  return new Set(Array.from(document.querySelectorAll<HTMLElement>("[data-moment-key]"), (el) => el.dataset.momentKey ?? ""));
}

/**
 * Whether an attendee would miss `el` where it is: any part above the top, or below the bottom
 * less room for the floating Book or Submit button that sits over the foot of the page.
 */
export function outOfSight(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.top < 0 || r.bottom > window.innerHeight - FLOATING_BUTTON;
}

/** The floating action button (h-12 at bottom-4) plus a little air. */
const FLOATING_BUTTON = 88;

/**
 * Brings `el` into view and resolves once it has stopped moving. Centred if it fits, otherwise its
 * top is shown first. Instant with reduced motion.
 */
export function bringIntoView(el: HTMLElement, reduced: boolean): Promise<void> {
  const fits = el.offsetHeight < window.innerHeight * 0.6;
  el.scrollIntoView({ block: fits ? "center" : "start", behavior: reduced ? "auto" : "smooth" });
  if (reduced) return Promise.resolve();
  return new Promise((done) => {
    const finish = () => { clearTimeout(timer); window.removeEventListener("scrollend", finish); done(); };
    // scrollend is not in every browser yet; a smooth scroll this short is over well inside this.
    const timer = setTimeout(finish, 700);
    window.addEventListener("scrollend", finish, { once: true });
  });
}
