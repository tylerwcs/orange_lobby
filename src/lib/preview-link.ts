import { isValidToken } from "@/lib/tokens";

/**
 * D715: a draft event's preview link. Opening /e/<slug>/preview/<token> leaves this cookie,
 * scoped to that event's portal path, and every portal page after it reads the draft as live.
 * The cookie holds the token itself, so replacing or turning off the link ends every browser's
 * preview at once - nothing to expire or revoke separately.
 */
export const PREVIEW_COOKIE = "ecp_preview";

/** A month: long enough for the client's committee to come back to it, short enough to lapse. */
export const PREVIEW_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function previewLink(base: string, slug: string, token: string): string {
  return `${base.replace(/\/+$/, "")}/e/${slug}/preview/${token}`;
}

/** Whether a browser's cookie still opens this event's preview: the link is on, and it is that link. */
export function previewCookieMatches(previewToken: string | null | undefined, cookie: string | undefined): boolean {
  return !!previewToken && !!cookie && isValidToken(cookie) && cookie === previewToken;
}
