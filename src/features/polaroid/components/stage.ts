/**
 * The full-screen composer's hold on the page (D482): the page behind stops scrolling while a
 * stage is open, and a phone that allows it goes truly full screen. Browser-only; call these from
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

/**
 * Asks for true full screen, from a tap of its own: a tap that also opens the file picker is used
 * up by it. Android Chrome hides its address bar; iOS Safari has no element full screen, so
 * nothing happens there. A refusal is ignored: the stage already fills the viewport.
 */
export function enterFullscreen(): void {
  if (!document.fullscreenEnabled || document.fullscreenElement) return;
  document.documentElement.requestFullscreen?.().catch(() => {});
}

export function exitFullscreen(): void {
  if (!document.fullscreenElement) return;
  document.exitFullscreen?.().catch(() => {});
}
