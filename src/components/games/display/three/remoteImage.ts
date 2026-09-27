"use client";
import { useEffect, useSyncExternalStore } from "react";

/**
 * Organiser-uploaded pictures (the card back, prize pictures — D323) for drawing into canvas
 * textures. Loaded with `crossOrigin = "anonymous"` so the canvas stays readable and WebGL may
 * upload it (Supabase public storage sends CORS headers); an image served without them fails to
 * load and counts as no image. Each URL loads once per page: the result — the decoded image, or
 * `null` for a failure — is kept, so the LED's once-a-second polls and a card table remounting
 * between phases never download or decode it again, and every caller gets the very same
 * HTMLImageElement back (a stable memo key). A failure is kept too, so a dead link is not
 * retried every second; the page's own reload (a new game, a lost context) tries again.
 */
const settled = new Map<string, HTMLImageElement | null>();
const loading = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function load(url: string): void {
  if (settled.has(url) || loading.has(url)) return;
  const done = (img: HTMLImageElement | null) => {
    settled.set(url, img);
    loading.delete(url);
    listeners.forEach((l) => l());
  };
  loading.set(url, new Promise<void>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      // decode() so the first drawImage onto the texture canvas doesn't stall a frame decoding it.
      img.decode().catch(() => undefined).then(() => done(img.naturalWidth > 0 ? img : null)).finally(resolve);
    };
    img.onerror = () => { done(null); resolve(); };
    img.src = url;
  }));
}

/**
 * The picture at `url`: `undefined` while it loads, `null` when there is none (no URL, or it
 * failed to load), otherwise the loaded image. Callers draw their no-image version for both
 * `undefined` and `null`, so a card is never blank while a picture is on its way.
 */
export function useRemoteImage(url: string | null): HTMLImageElement | null | undefined {
  const img = useSyncExternalStore(subscribe, () => (url ? settled.get(url) : null), () => undefined);
  useEffect(() => { if (url) load(url); }, [url]);
  return img;
}
