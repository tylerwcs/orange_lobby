import { MEDIA_BUCKET } from "./storage";

/**
 * D894: which organiser pictures can be served resized, and the URL of a resized copy.
 *
 * Uploads live in the public media bucket at whatever size they were sent - posters of 1-2 MB
 * were common. Supabase's image transformation serves a copy at the width asked for, as WebP or
 * AVIF when the browser takes it, cached for a year like the original. `resize=contain` keeps the
 * picture's shape (the default, `cover`, crops to the original height) and it never enlarges.
 *
 * Only our own bucket's raster images: an SVG has no pixels to shrink, a URL pasted from
 * elsewhere is not ours to transform, and anything else is served exactly as stored.
 */

/** A picture's own size in pixels, as recorded when it was uploaded (D895). */
export type ImageDims = { width: number; height: number };

const RASTER = /\.(jpe?g|png|webp)$/i;

function objectPrefix(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${MEDIA_BUCKET}/`;
}

/** The bucket-relative part of a resizable URL, still URL-encoded as stored; else null. */
export function resizablePath(src: string, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""): string | null {
  if (!supabaseUrl) return null;
  const prefix = objectPrefix(supabaseUrl);
  if (!src.startsWith(prefix)) return null;
  const rest = src.slice(prefix.length);
  if (!rest || rest.includes("?") || rest.includes("#") || !RASTER.test(rest)) return null;
  return rest;
}

export function isResizable(src: string, supabaseUrl?: string): boolean {
  return resizablePath(src, supabaseUrl) !== null;
}

/** A copy of `src` at most `width` px wide, or `src` itself when it cannot be resized. */
export function resizedUrl(src: string, width: number, quality = 75, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""): string {
  const path = resizablePath(src, supabaseUrl);
  if (path === null) return src;
  const base = supabaseUrl.replace(/\/+$/, "");
  return `${base}/storage/v1/render/image/public/${MEDIA_BUCKET}/${path}?width=${Math.round(width)}&quality=${quality}&resize=contain`;
}
