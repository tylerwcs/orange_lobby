/** What the proxy does with one path on an event's primary address (D425). */
export type Route = { kind: "rewrite"; path: string } | { kind: "pass" } | { kind: "notFound" } | { kind: "main" };

/** The event's public pages, which answer at /<section> on its address. */
const SECTIONS = new Set(["register", "agenda", "info", "plan", "stamps", "announcements"]);
/** public/ folders and root files the attendee pages load. */
const STATIC_DIRS = new Set(["app-icons", "brand", "portal-icons"]);
const ROOT_FILE = /^\/[^/]+\.(?:svg|png|ico|txt|webmanifest)$/;

export function routeEventPath(pathname: string, slug: string): Route {
  const parts = pathname.split("/").filter(Boolean);
  const [first, second] = parts;
  if (parts.length === 0) return { kind: "rewrite", path: `/e/${slug}` };
  if (first === "e") return second === slug ? { kind: "pass" } : { kind: "notFound" };
  // The portal checks the token within this event (loadPortalAttendee), so another event's
  // token gets that page's not-found, never that event's portal.
  if (first === "a") return second ? { kind: "rewrite", path: `/e/${slug}${pathname}` } : { kind: "main" };
  if (SECTIONS.has(first)) return { kind: "rewrite", path: `/e/${slug}${pathname}` };
  if (first === "api" && second === "play") return { kind: "pass" };
  if (first === "privacy") return { kind: "pass" };
  if (STATIC_DIRS.has(first) || ROOT_FILE.test(pathname)) return { kind: "pass" };
  return { kind: "main" };
}

/**
 * The target of a proxy 308: `base`'s origin with the request's path and query. Built by setting
 * `pathname`/`search` on the base URL, never by resolving the path against it - a path starting
 * `//` (or `/\`) would otherwise be read as a protocol-relative URL and send the visitor off-site.
 */
export function redirectTarget(base: string, pathname: string, search: string): URL {
  const to = new URL(base);
  to.pathname = pathname;
  to.search = search;
  return to;
}
