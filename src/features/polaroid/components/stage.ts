/**
 * The full-screen composer's hold on the page (D482): the page behind stops scrolling while a
 * stage is open, and full screen, if the phone was in it, ends with the stage. Browser-only; call these from
 * effects and event handlers, never while rendering.
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

export function exitFullscreen(): void {
  if (!document.fullscreenElement) return;
  document.exitFullscreen?.().catch(() => {});
}
