import { isResizable, resizedUrl, type ImageDims } from "./image-src";

/** Widths offered in a rich-text picture's srcset: Next's device sizes, up to a full HD screen. */
export const RICH_WIDTHS = [640, 750, 828, 1080, 1200, 1920] as const;

/**
 * D894/D895: the pictures in an organiser's rich text (Info tabs, activity descriptions) given
 * what EventImage gives every other picture - a srcset of resized copies, the picture's recorded
 * width and height so its space is held, and lazy loading below the first one.
 *
 * Runs on HTML that has already been through `sanitizeHtml`, which writes every image as exactly
 * `<img src="…" alt="…">` with a src it accepted. The attributes added here are built only from
 * that src and from numbers, so nothing an organiser typed reaches them unchecked.
 */
export function responsiveRichImages(html: string, dims: Record<string, ImageDims>, sizes: string): string {
  let index = 0;
  return html.replace(/<img src="([^"]*)" alt="([^"]*)"/g, (_whole, src: string, alt: string) => {
    const first = index++ === 0;
    const size = dims[src];
    const attrs: string[] = [];
    if (isResizable(src)) {
      const widths = size ? RICH_WIDTHS.filter((w) => w < size.width) : [...RICH_WIDTHS];
      const set = [...widths.map((w) => `${resizedUrl(src, w)} ${w}w`), ...(size && widths.length < RICH_WIDTHS.length ? [`${resizedUrl(src, size.width)} ${size.width}w`] : [])];
      attrs.push(`src="${resizedUrl(src, 828)}"`, `srcset="${set.join(", ")}"`, `sizes="${sizes}"`);
    } else {
      attrs.push(`src="${src}"`);
    }
    attrs.push(`alt="${alt}"`);
    if (size) attrs.push(`width="${size.width}"`, `height="${size.height}"`);
    attrs.push(`loading="${first ? "eager" : "lazy"}"`, `decoding="async"`);
    return `<img ${attrs.join(" ")}`;
  });
}
