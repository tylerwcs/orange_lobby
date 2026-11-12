export const REDUCE = "(prefers-reduced-motion: reduce)";

/** Read where it is needed rather than at import, so a test or the server never touches window. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia(REDUCE).matches;
}

/** The page's moment keys right now - what a press compares the new page against (D902). */
export function snapshotKeys(): Set<string> {
  return new Set(Array.from(document.querySelectorAll<HTMLElement>("[data-moment-key]"), (el) => el.dataset.momentKey ?? ""));
}
