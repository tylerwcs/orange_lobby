/**
 * The long-form text organisers write in the rich text editor - an activity's description, the
 * info page - on its way in and on its way out.
 *
 * Stored as HTML in the same columns that used to hold plain text or hand-typed HTML, so
 * nothing about the database changed. `sanitizeHtml` stays the security boundary; everything
 * here assumes HTML it is handed has been through it, or is about to be.
 *
 * Pure, and safe on both sides: the editor reads `toRichHtml` in the browser, the pages read
 * `splitSections` on the server.
 */
import { sanitizeHtml } from "@/lib/sanitize";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

/** The words in some HTML, tags dropped and entities read. */
function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

const LOOKS_LIKE_HTML = /<(p|h2|h3|ul|ol|li|blockquote|img|br|strong|em|a)\b[^>]*>/i;

/**
 * Anything stored in a rich text column, as HTML the editor and the pages can use.
 *
 * Descriptions written before the editor existed are plain text: those become paragraphs, a
 * blank line starting a new one and a single line break kept as a <br>, so they look the way
 * the organiser typed them. Anything that already reads as HTML is returned as it is.
 */
export function toRichHtml(stored: string | null | undefined): string {
  const text = (stored ?? "").trim();
  if (!text) return "";
  if (LOOKS_LIKE_HTML.test(text)) return text;
  return text
    .split(/\n\s*\n/)
    .map((para) => `<p>${para.split("\n").map((line) => escapeHtml(line.trim())).join("<br>")}</p>`)
    .join("");
}

/**
 * Whether the editor holds anything worth keeping. An editor nobody typed in still posts
 * `<p></p>`, and that should store as no description at all, not as an empty one.
 */
export function isRichTextEmpty(html: string | null | undefined): boolean {
  const h = html ?? "";
  if (/<img\b/i.test(h)) return false;
  return textOf(h) === "";
}

export type RichSections = {
  /** Everything before the first section heading - the page's About. Empty when there is none. */
  intro: string;
  sections: { title: string; html: string }[];
};

/**
 * One description as the blocks an attendee's page draws: the text before the first <h2>, then
 * one section per <h2>, each running to the next.
 *
 * Only h2 splits. The editor's "Section" button writes h2 and its smaller heading writes h3,
 * which is how an organiser puts a subheading inside a section without starting a new one. A
 * heading with no words is not a section - it is a stray key press - so its content joins
 * whatever came before it.
 */
export function splitSections(html: string): RichSections {
  const parts = html.split(/<h2>([\s\S]*?)<\/h2>/i);
  // split() with one capture group alternates: [before, title1, body1, title2, body2, ...]
  let intro = parts[0];
  const sections: RichSections["sections"] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const title = textOf(parts[i]);
    const body = parts[i + 1] ?? "";
    if (!title) {
      if (sections.length) sections[sections.length - 1].html += body;
      else intro += body;
      continue;
    }
    sections.push({ title, html: body });
  }
  const tidy = (h: string) => (isRichTextEmpty(h) ? "" : h);
  return { intro: tidy(intro), sections: sections.map((s) => ({ ...s, html: tidy(s.html) })) };
}

/**
 * What an organiser typed into the editor's link box, as a link `sanitizeHtml` will keep - or
 * null when it is not one. A bare address gets https, a bare email address becomes mailto, and
 * anything else with a scheme of its own (javascript:, data:) is refused here rather than
 * silently stripped from the page later.
 */
export function normalizeLink(input: string): string | null {
  const v = input.trim();
  if (!v || /\s/.test(v)) return null;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(v)) return v;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return null;
  if (/^[^@]+@[^@]+\.[^@]+$/.test(v)) return `mailto:${v}`;
  if (/^[^/]+\.[a-z]{2,}(\/.*)?$/i.test(v)) return `https://${v}`;
  return null;
}

/**
 * What a Server Action stores for one rich text field: null for an editor with nothing in it,
 * otherwise the HTML with everything `sanitizeHtml` would strip already gone. Cleaned on the way
 * in as well as on the way out, so the column never holds markup the page would not show.
 */
export function cleanRichText(html: string | null | undefined): string | null {
  if (isRichTextEmpty(html)) return null;
  // Blank paragraphs at either end are Enter pressed once too often; in the middle they are
  // the organiser's own spacing, and stay.
  return sanitizeHtml((html ?? "").trim())
    .replace(/^(?:\s*<p>(?:\s|&nbsp;|<br>)*<\/p>)+\s*/, "")
    .replace(/\s*(?:<p>(?:\s|&nbsp;|<br>)*<\/p>\s*)+$/, "");
}
