/**
 * D399: where a "View file" link points. Not the file itself: a signed Storage URL dies a minute
 * after it is minted, and a page minting one per photo at render time handed out links that were
 * dead by the time a committee member, a few minutes into the table, clicked them. These name the
 * entry and the question instead; the route behind each checks who is asking, then mints a fresh
 * one-minute link and redirects to it, so a link is never stale however long the page sat open.
 */
// A question key is lowercase letters, digits and underscores (parseQuestions), so it needs no escaping.
export function adminFileHref(eventId: string, submissionId: string, key: string): string {
  return `/admin/events/${eventId}/submissions/${submissionId}/files/${key}`;
}

/** The attendee's own route: their personal link's token is the authority, as on every portal page. */
export function portalFileHref(slug: string, token: string, submissionId: string, key: string): string {
  return `/e/${slug}/a/${token}/files/${submissionId}/${key}`;
}
