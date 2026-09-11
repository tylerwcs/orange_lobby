"use client";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { readFlash, stripFlash } from "@/lib/flash";
import { toast } from "@/lib/toast-store";

/**
 * Takes the flash out of the address bar once it has been said, so a reload does not
 * announce a save that happened a minute ago.
 *
 * `history.replaceState` rather than `router.replace`: the router's version is a real
 * navigation, and after a server action it lands in the same tick as the action's own
 * redirect — the redirect wins the race and puts the flash straight back. This only edits
 * the address bar, which is all that is wanted; nothing on the page depends on the
 * parameter once the toast is up. Next keeps `usePathname`/`useSearchParams` in step.
 */
function stripFromUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("flash")) return;
  window.history.replaceState(null, "", `${url.pathname}${stripFlash(url.search.slice(1))}`);
}

/** Roughly a second at 60fps. A flash left in the address bar is untidy, not broken. */
const MAX_FRAMES = 60;

/**
 * Keeps the flash out of the address bar for a moment after announcing it.
 *
 * Not a single strip, because the router puts it back. Measured on a save: the strip lands
 * at t+4229ms and Next re-writes `?flash=…` at t+4331ms, because a server action's redirect
 * applies its history entry when the navigation *commits*, which is after the effect that
 * reacted to it. Stripping once — whenever you time it — either edits the URL being left
 * behind or gets overwritten a frame or two later. So this strips on every frame for about
 * a second, which outlasts the commit and is idempotent the rest of the time.
 *
 * Deliberately not cancellable: a cleanup would be called by StrictMode's remount in
 * development before the first frame fires, and the re-run would take the `announced`
 * guard and never schedule another.
 */
function stripWhileTheRouterSettles(frame = 0) {
  stripFromUrl();
  if (frame >= MAX_FRAMES) return;
  requestAnimationFrame(() => stripWhileTheRouterSettles(frame + 1));
}

/**
 * Turns the flash a server action redirected with into a toast.
 *
 * Raising it from an effect is fine because the store is not React state: this reports an
 * external change (the URL) to an external system, not a setState cascade. The ref guards
 * against announcing the same flash twice if the effect re-runs.
 */
export function Flash() {
  const params = useSearchParams();
  const pathname = usePathname();
  const announced = useRef<string | null>(null);

  // Primitives, not the object `readFlash` builds: a fresh object every render would make
  // this effect re-run on every render, and its cleanup would cancel the pending frame
  // before it ever fired — which is exactly how the strip broke on a hard load.
  const flash = readFlash(params);
  const message = flash?.message ?? "";
  const tone = flash?.tone ?? "ok";
  const key = message ? `${pathname}:${tone}:${message}` : "";

  useEffect(() => {
    if (!key || announced.current === key) return;
    announced.current = key;
    toast(message, tone);
    stripWhileTheRouterSettles();
  }, [key, message, tone]);

  return null;
}
