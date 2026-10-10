function trimSlash(s: string) {
  return s.replace(/\/+$/, "");
}
export function appBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return trimSlash(configured);
  // Silently falling back in production would mint QR codes and links pointing at localhost.
  if (process.env.NODE_ENV === "production") throw new Error("NEXT_PUBLIC_APP_URL is not set");
  return "http://localhost:3000";
}
/** Where an event lives for attendees (D426): its slug, and its primary address if it has one. */
export type EventAddress = { slug: string; domain: string | null };

/** A host as a base URL, with the app's own protocol and port - https in production, http://…:3000 locally. */
export function hostUrl(host: string): string {
  const app = new URL(appBaseUrl());
  return `${app.protocol}//${host}${app.port ? `:${app.port}` : ""}`;
}

export function genericLink(addr: EventAddress) {
  return addr.domain ? hostUrl(addr.domain) : `${appBaseUrl()}/e/${addr.slug}`;
}
/**
 * The personal portal as a path, for a redirect that is already on the right host. The
 * WhatsApp template button points at /a/<token>, which resolves the event and sends the
 * attendee here; a template is frozen once Meta approves it, so the event's slug cannot be
 * part of the link that goes out.
 */
export function attendeePath(slug: string, token: string) {
  return `/e/${slug}/a/${token}`;
}
export function attendeeLink(addr: EventAddress, token: string) {
  return addr.domain ? `${hostUrl(addr.domain)}/a/${token}` : `${appBaseUrl()}${attendeePath(addr.slug, token)}`;
}

export function registrationLink(addr: EventAddress) {
  return addr.domain ? `${hostUrl(addr.domain)}/register` : `${appBaseUrl()}/e/${addr.slug}/register`;
}
/**
 * The booth's scanner. Not under /e/<slug>: it is staff-facing, it is not part of the
 * attendee portal, and the token is looked up on its own before any event is known.
 */
export function boothScannerLink(base: string, token: string) {
  return `${trimSlash(base)}/booth/${token}`;
}
/**
 * The shared crew scanner. Staff-facing like the booth link, and outside `/e` for the same
 * reason: it is not part of the attendee portal and is looked up by token alone.
 */
export function crewLink(base: string, token: string) {
  return `${trimSlash(base)}/crew/${token}`;
}
/** The host console (D251). Staff-facing like the crew link, and looked up by token alone. */
export function hostLink(base: string, token: string) {
  return `${trimSlash(base)}/host/${token}`;
}
/** The LED display (D251). Show-only; a separate token from the host link (D252). */
export function displayLink(base: string, token: string) {
  return `${trimSlash(base)}/display/${token}`;
}
