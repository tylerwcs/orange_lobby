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

  const flash = readFlash(params);
  const key = flash ? `${pathname}:${flash.tone}:${flash.message}` : null;

  useEffect(() => {
    if (!flash || !key || announced.current === key) return;
    announced.current = key;
    toast(flash.message, flash.tone);
    // The address bar is written by the router as it commits the navigation, which can
    // happen after this effect runs — stripping now would edit the URL being left behind,
    // and the commit would put the flash straight back. A frame later the commit has
    // landed, so `window.location` is the thing to read and to correct.
    const frame = requestAnimationFrame(stripFromUrl);
    return () => cancelAnimationFrame(frame);
  }, [flash, key]);

  return null;
}
