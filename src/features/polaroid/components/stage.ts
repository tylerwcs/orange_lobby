/**
 * The full-screen composer's hold on the page (D482): the page behind stops scrolling while a
 * stage is open (the lock lives in `@/lib/scroll-lock`, shared with the slime game), and full
 * screen, if the phone was in it, ends with the stage. Browser-only; call these from effects and
 * event handlers, never while rendering.
 */

export { lockBodyScroll } from "@/lib/scroll-lock";

export function exitFullscreen(): void {
  if (!document.fullscreenElement) return;
  document.exitFullscreen?.().catch(() => {});
}
