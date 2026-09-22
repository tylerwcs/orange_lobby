/**
 * Editing the info page's HTML from outside the textarea.
 *
 * The info page is raw HTML an organiser types, and `sanitizeHtml` decides what survives
 * on the way out. Anything that writes into that HTML has to write markup that sanitiser
 * keeps, which is why `appendImage` is here and tested against it rather than being an
 * inline template literal in a Server Action.
 *
 * Pure, for the same reason the rest of src/lib is: the upload belongs to db/media.ts, and
 * what the page should say afterwards is a string question with a string answer.
 */

/** Text going into an attribute or between tags, with the five characters that would escape it. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The info page with one more image on the end.
 *
 * Appending — rather than inserting at a cursor — is the deliberate shape: the textarea is
 * the editor, and an organiser who wants the image higher up moves the tag. A caret
 * position does not survive a round trip through a Server Action, so a picker that claimed
 * to insert "where you were" would be guessing.
 *
 * `alt` is escaped, never trusted. It is typed by an admin rather than the public, so this
 * is not the security boundary — `sanitizeHtml` is — but an unescaped quote would end the
 * attribute and leave the rest of the description loose in the tag, which is a broken page
 * from an honest typo.
 */
export function appendImage(html: string | null | undefined, url: string, alt: string): string {
  const tag = `<img src="${url}" alt="${escapeHtml(alt)}">`;
  const before = (html ?? "").replace(/\s+$/, "");
  return before ? `${before}\n${tag}` : tag;
}
