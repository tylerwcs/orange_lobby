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
export function attendeeLink(base: string, slug: string, token: string) {
  return `${genericLink(base, slug)}/a/${token}`;
}
export function registrationLink(base: string, slug: string) {
  return `${genericLink(base, slug)}/register`;
}
