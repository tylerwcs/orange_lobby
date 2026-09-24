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
export function genericLink(base: string, slug: string) {
  return `${trimSlash(base)}/e/${slug}`;
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
export function attendeeLink(base: string, slug: string, token: string) {
  return `${trimSlash(base)}${attendeePath(slug, token)}`;
}
export function registrationLink(base: string, slug: string) {
  return `${genericLink(base, slug)}/register`;
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
