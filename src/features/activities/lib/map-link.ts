/**
 * The optional map link beside an activity's location (D798): a session's room, a booth, a
 * submission's venue. Usually a Google Maps share link, but any web address is taken, since a
 * venue may send Waze or its own floor map instead.
 *
 * A pasted "maps.app.goo.gl/abc" without its https:// is accepted and given one, because that is
 * how a link copied from a phone's share sheet into a note often comes back. Anything that is not
 * a web address afterwards - "Level 3", "javascript:..." - is refused: it becomes the href of a
 * button attendees tap.
 */

export const MAX_MAP_LINK = 2000;
export const MAP_LINK_ERROR = "The map link must be a web address, like https://maps.app.goo.gl/…";

/** The link to store, null for none, or the sentence the organiser reads. */
export function parseMapLink(raw: string | null | undefined): { ok: true; url: string | null } | { ok: false; error: string } {
  const value = raw?.trim() ?? "";
  if (!value) return { ok: true, url: null };
  if (value.length > MAX_MAP_LINK || /\s/.test(value)) return { ok: false, error: MAP_LINK_ERROR };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  let url: URL;
  try { url = new URL(withScheme); } catch { return { ok: false, error: MAP_LINK_ERROR }; }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || !url.hostname.includes(".")) return { ok: false, error: MAP_LINK_ERROR };
  return { ok: true, url: url.href };
}

/** `parseMapLink` for the form readers that throw the organiser's sentence. */
export function readMapLink(raw: string | null | undefined): string | null {
  const link = parseMapLink(raw);
  if (!link.ok) throw new Error(link.error);
  return link.url;
}
