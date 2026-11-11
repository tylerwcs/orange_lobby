import { getImageProps } from "next/image";
import { isResizable, type ImageDims } from "@/lib/image-src";

export type { ImageDims };

/**
 * An organiser's picture as attendees see it (D894). Every portal image goes through this:
 *  - a srcset of resized copies (src/lib/image-loader.ts), so a phone downloads one sized for
 *    its screen instead of the 1-2 MB original, and `sizes` says how wide it is drawn;
 *  - its space reserved before it arrives, so nothing on the page moves when it lands - either
 *    the slot's own box (`fill`, inside a sized `relative` parent) or the picture's recorded
 *    shape (`dims`). A picture with neither (one uploaded before sizes were recorded and not
 *    backfilled) takes its shape when it arrives;
 *  - lazy unless `eager`. Eager is for what the first screen shows (a banner, an activity's
 *    cover) and gets `fetchPriority="high"` too.
 *
 * Built on `getImageProps`, not `<Image>`: `<Image>` always sets the img's `onLoad`, and React
 * holds a page transition (D891) only for images without one - with it, pages would animate in
 * with their pictures half drawn, which is the glitch this exists to stop. A plain <img> also
 * renders from a Server Component.
 */
export function EventImage({ src, alt = "", sizes, dims, fill = false, eager = false, className, style }: {
  src: string;
  alt?: string;
  /** How wide the picture is drawn, e.g. "(min-width: 768px) 560px, 100vw". */
  sizes: string;
  dims?: ImageDims | null;
  fill?: boolean;
  eager?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const shape = fill ? { fill: true as const } : dims ? { width: dims.width, height: dims.height } : { width: 0, height: 0 };
  const { props } = getImageProps({
    src,
    alt,
    sizes,
    ...shape,
    unoptimized: !isResizable(src),
    loading: eager ? "eager" : "lazy",
    fetchPriority: eager ? "high" : undefined,
    decoding: "async",
    className,
    style,
  });
  // No size known: no width="0" height="0" on the page; CSS and the picture decide.
  const { width, height, ...rest } = props;
  const sized = width && height ? { width, height } : {};
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- getImageProps' props, alt included
  return <img {...rest} {...sized} />;
}
