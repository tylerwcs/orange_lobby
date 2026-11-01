/**
 * A full-screen layer's hold on the page (D482, D794): the page behind stops scrolling while the
 * layer is open. Shared by the polaroid composer and the slime game, so nested or overlapping
 * layers count against one lock. Browser-only; call it from effects and event handlers, never
 * while rendering.
 */

let locks = 0;
let saved = "";

/** Stops `document.body` scrolling until every lock taken is released; returns the release. */
export function lockBodyScroll(): () => void {
  if (locks++ === 0) {
    saved = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks === 0) document.body.style.overflow = saved;
  };
}
