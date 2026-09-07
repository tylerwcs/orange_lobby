function trimSlash(s: string) {
  return s.replace(/\/+$/, "");
}
export function appBaseUrl(): string {
  return trimSlash(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
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
