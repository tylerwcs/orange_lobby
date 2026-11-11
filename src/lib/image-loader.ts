import { resizedUrl } from "./image-src";

/**
 * next/image's loader for the whole app (next.config.ts `images.loaderFile`, D894): each width
 * in a picture's srcset is a resized copy from Supabase. No "use client" - `getImageProps` runs
 * in Server Components too (EventImage), and this is a plain function either side.
 *
 * Only reached for resizable sources: EventImage marks anything else `unoptimized`, which skips
 * the loader and serves the file as stored.
 */
export default function supabaseImageLoader({ src, width, quality }: { src: string; width: number; quality?: number }): string {
  return resizedUrl(src, width, quality ?? 75);
}
