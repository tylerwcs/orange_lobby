/**
 * Which portal page the reader is on, worked out from the URL rather than from a prop.
 *
 * `PortalShell` used to be told by each page: `current="/agenda"`, `hero`, `dashboard`. A
 * layout cannot be told — it does not know which child is rendering — so the URL becomes the
 * source, which is also the one that cannot disagree with where the reader actually is.
 *
 * These live apart from the component because the cases that break them are string-handling
 * cases — a trailing slash, a query string, one path being a prefix of another — and the test
 * suite has no DOM to reach a component with.
 */

/** The nav hrefs, longest first, so `/me` cannot shadow a longer path that starts with it. */
const NAV_HREFS = ["/activities", "/agenda", "/info", "/me"] as const;

/** The path with its query and trailing slash removed. */
function normalise(pathname: string): string {
  const path = pathname.split("?")[0].split("#")[0];
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/**
 * The part of the path below `basePath`, or null when the path is not under it.
 *
 * Exported (only) so the segment-boundary guard below is directly testable: every consumer
 * pattern in `NAV_HREFS` starts with "/", so a `rest` that lacks a leading "/" can never match
 * one — meaning `activeNavHref`/`isPortalHome` cannot distinguish `${base}/` from a bare `base`
 * prefix check through their own return values. Testing this line requires calling it directly.
 */
export function suffix(pathname: string, basePath: string): string | null {
  const path = normalise(pathname);
  const base = normalise(basePath);
  if (path === base) return "";
  return path.startsWith(`${base}/`) ? path.slice(base.length) : null;
}

export function isPortalHome(pathname: string, basePath: string): boolean {
  return suffix(pathname, basePath) === "";
}

/**
 * The nav href to mark as current, or null for a page the bar does not lead to — the booth
 * passport, the floor plan, the seat card, the announcement list. Those used to pass
 * `current={null}` or nothing at all, and nothing lit up; the same holds here.
 */
export function activeNavHref(pathname: string, basePath: string): string | null {
  const rest = suffix(pathname, basePath);
  if (rest === null) return null;
  if (rest === "") return "";
  return NAV_HREFS.find((h) => rest === h || rest.startsWith(`${h}/`)) ?? null;
}
