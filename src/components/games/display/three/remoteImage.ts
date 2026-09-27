"use client";
import { useEffect, useSyncExternalStore } from "react";
import { imageRetryDelay } from "@/lib/games/image-retry";

/**
 * Organiser-uploaded pictures (the card back, prize pictures — D323) for drawing into canvas
 * textures. Loaded with `crossOrigin = "anonymous"` so the canvas stays readable and WebGL may
 * upload it (Supabase public storage sends CORS headers); an image served without them fails to
 * load and counts as no image. Each URL loads once per page: the result — the decoded image, or
 * `null` after a failure — is kept, so the LED's once-a-second polls and a card table remounting
 * between phases never download or decode it again, and every caller gets the very same
 * HTMLImageElement back (a stable memo key).
 *
 * A failure reads as `null` (callers draw their no-picture version) and stays `null` while the
 * picture is retried in the background with backoff (imageRetryDelay: 15 s, 30 s, 60 s, 120 s),
 * so the card doesn't flicker between tries; a retry that succeeds replaces the `null` and tells
 * every listener, so a network blip at the venue doesn't leave the plain card up for the rest of
 * a night-long show. After the last retry it stays `null` until the page reloads.
 */
const settled = new Map<string, HTMLImageElement | null>();
const started = new Set<string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function settle(url: string, img: HTMLImageElement | null) {
  if (settled.has(url) && settled.get(url) === img) return;
  settled.set(url, img);
  listeners.forEach((l) => l());
}

function attempt(url: string, failures: number): void {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.decoding = "async";
  const fail = () => {
    settle(url, null);
    const delay = imageRetryDelay(failures + 1);
    if (delay !== null) setTimeout(() => attempt(url, failures + 1), delay);
  };
  img.onload = () => {
    // decode() so the first drawImage onto the texture canvas doesn't stall a frame decoding it.
    img.decode().catch(() => undefined).then(() => (img.naturalWidth > 0 ? settle(url, img) : fail()));
  };
  img.onerror = fail;
  img.src = url;
}

function load(url: string): void {
  // One chain of attempts per URL for the page's lifetime; later callers just read the cache.
  if (started.has(url)) return;
  started.add(url);
  attempt(url, 0);
}

/**
 * The picture at `url`: `undefined` while it first loads, `null` when there is none (no URL, or
 * it failed — possibly still being retried), otherwise the loaded image. Callers draw their
 * no-image version for both `undefined` and `null`, so a card is never blank while a picture is
 * on its way.
 */
export function useRemoteImage(url: string | null): HTMLImageElement | null | undefined {
  const img = useSyncExternalStore(subscribe, () => (url ? settled.get(url) : null), () => undefined);
  useEffect(() => { if (url) load(url); }, [url]);
  return img;
}
