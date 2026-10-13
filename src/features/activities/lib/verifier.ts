import { isValidToken } from "@/lib/tokens";
import type { ActivitySubmission, VerifierLink } from "@/lib/types";
import { NAME_MAX } from "./revoke";

/**
 * Verifier links (D492–D496). Server-side rules, kept apart from `revoke.ts` because
 * `isValidToken` comes from a module that imports node:crypto.
 */

export function parseVerifierName(raw: string): { name: string } | { error: string } {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return { error: "Add their name." };
  if ([...name].length > NAME_MAX) return { error: `Keep the name to ${NAME_MAX} characters or fewer.` };
  return { name };
}

/**
 * D496: every page load, action and file asks this. A malformed token never reaches the
 * database; a removed link, or a row whose token has since been replaced, is no link at all.
 */
export async function resolveVerifier(
  token: string,
  lookup: (token: string) => Promise<VerifierLink | null>,
  /** Whether the link's event still runs submissions: with the add-on off, the Verification tab is gone, so its links must stop too. */
  eventAllows: (eventId: string) => Promise<boolean> = async () => true,
): Promise<VerifierLink | null> {
  if (!isValidToken(token)) return null;
  const link = await lookup(token);
  if (!link || link.removed_at !== null || link.token !== token) return null;
  return (await eventAllows(link.event_id)) ? link : null;
}

export const VERIFY_PAGE_SIZE = 30;
/**
 * Thumbnails a link may load a minute. Every photo on the page is one hit, so this outlasts a
 * committee member paging steadily through two-photo entries (Project Active) for a minute.
 */
export const VERIFY_FILE_LIMIT = 2400;

/** D495: a verifier sees their link's event and nothing else - an id from another event is not theirs. */
export function belongsToLink(link: Pick<VerifierLink, "event_id">, s: Pick<ActivitySubmission, "event_id"> | null): boolean {
  return s !== null && s.event_id === link.event_id;
}

export type VerifyStatus = "submitted" | "revoked" | "all";
export type VerifyQuery = { activity: string | null; status: VerifyStatus; q: string; page: number };

/** The verify page's filters from its search params. Anything unrecognised reads as the default. */
export function verifyQuery(raw: Record<string, string | undefined>): VerifyQuery {
  const status = raw.status === "revoked" || raw.status === "all" ? raw.status : "submitted";
  const page = /^\d+$/.test(raw.page ?? "") ? Number(raw.page) : 0;
  return { activity: raw.activity || null, status, q: (raw.q ?? "").trim(), page };
}

/** Back to a query string, `?`-prefixed, or "" when everything is the default. */
export function verifyQueryString(q: VerifyQuery, patch: Partial<VerifyQuery> = {}): string {
  const v = { ...q, ...patch };
  const p = new URLSearchParams();
  if (v.activity) p.set("activity", v.activity);
  if (v.status !== "submitted") p.set("status", v.status);
  if (v.q) p.set("q", v.q);
  if (v.page > 0) p.set("page", String(v.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}
