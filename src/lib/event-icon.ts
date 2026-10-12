import { createHash } from "node:crypto";
import { mediaPathFromUrl } from "@/lib/storage";
import type { Event } from "@/lib/types";

/**
 * An event's own app icon, drawn from its logo (D487): the browser tab, the iPhone home screen
 * and the Android install all show the event rather than ECP Hub.
 *
 * Every variant is the logo fitted whole onto an opaque white square. Opaque because iOS paints
 * a transparent home-screen icon black, and white because a logo is drawn for the light header
 * it already sits on. A wide logo becomes a band across the middle; nothing is cropped.
 */
export const ICON_VARIANTS = {
  /** The browser tab. Tight, since every pixel counts at 16–32 px. */
  favicon: { size: 64, pad: 0.04, fallback: "/icon.png" },
  /** iOS Add to Home Screen; iOS rounds the corners itself. */
  apple: { size: 180, pad: 0.1, fallback: "/apple-icon.png" },
  "192": { size: 192, pad: 0.1, fallback: "/app-icons/icon-192.png" },
  "512": { size: 512, pad: 0.1, fallback: "/app-icons/icon-512.png" },
  /** Android crops a maskable icon to a circle or squircle: the logo stays inside its middle 80%. */
  maskable: { size: 512, pad: 0.22, fallback: "/app-icons/icon-512.png" },
} as const;

export type IconVariant = keyof typeof ICON_VARIANTS;

export function isIconVariant(v: string): v is IconVariant {
  return Object.hasOwn(ICON_VARIANTS, v);
}

/**
 * The bucket path of a logo we can draw, or null. Only our own uploads: a URL pasted before
 * uploads existed points anywhere, and the server does not fetch arbitrary addresses.
 */
export function logoPath(event: Pick<Event, "logo_url">, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""): string | null {
  return event.logo_url ? mediaPathFromUrl(event.logo_url, supabaseUrl) : null;
}

/** Changes whenever the logo does. A replaced logo is a new object name, so its URL is the version. */
export function iconVersion(logoUrl: string): string {
  return createHash("sha256").update(logoUrl).digest("hex").slice(0, 10);
}

/**
 * Where one variant of this event's icon is served, or null when the event has no logo of
 * ours and ECP Hub's own icons stand. Under /e/<slug>, which an event's own address passes
 * through unchanged (D425). The version makes each URL safe to cache forever.
 */
export function eventIconUrl(event: Pick<Event, "slug" | "logo_url">, variant: IconVariant, supabaseUrl?: string): string | null {
  if (!logoPath(event, supabaseUrl)) return null;
  return `/e/${event.slug}/app-icon/${variant}?v=${iconVersion(event.logo_url!)}`;
}
