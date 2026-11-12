/**
 * D899: tracked registration links. A partner's link carries `?utm_source=<tag>` (the name
 * marketing teams already use), and the registration page counts visits and registrations by tag.
 */
export const SOURCE_PARAM = "utm_source";

const MAX_LENGTH = 50;

/**
 * The tag as stored: lower case, spaces and anything else not in [a-z0-9._-] turned to "-",
 * runs of "-" folded, trimmed of "-" at either end, at most 50 characters. Null when nothing is left.
 */
export function cleanSource(raw: unknown): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const tag = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, MAX_LENGTH)
    .replace(/^-+|-+$/g, "");
  return tag || null;
}

/** The registration link with the tag on it. */
export function trackedLink(url: string, source: string): string {
  const u = new URL(url);
  u.searchParams.set(SOURCE_PARAM, source);
  return u.toString();
}

/** The registration outcomes that add someone new, and so count as a registration. `updated` is a person already on the list. */
export function countsAsRegistration(outcome: string): boolean {
  return outcome === "registered" || outcome === "waiting" || outcome === "pending";
}
