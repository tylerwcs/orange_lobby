import type React from "react";
import { STAMP_ART_FILTER } from "./paper";

/**
 * A collected chop, for a booth with no artwork: two rings with a checkmark. On the paper (D856)
 * it is pressed in the event's colour as `chopVars` moved it to read on cream (`--chop-ring`,
 * `--chop-check`); outside one it falls back to `--brand` and `--primary`. `size` null fills the box.
 */
export function StampGlyph({ deg, size = 52 }: { deg: number; size?: number | null }) {
  return (
    <svg
      width={size ?? "100%"} height={size ?? "100%"} viewBox="0 0 56 56" fill="none" aria-hidden="true" className="shrink-0"
      style={{ transform: `rotate(${deg}deg)` }}
    >
      <g style={{ color: "var(--chop-ring, var(--brand))" }}>
        <circle cx="28" cy="28" r="25" stroke="currentColor" strokeWidth="3" />
        <circle cx="28" cy="28" r="19" stroke="currentColor" strokeWidth="1.5" opacity=".45" />
      </g>
      <path d="M19 28.5l6.5 6.5L37 23" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--chop-check, var(--primary))" }} />
    </svg>
  );
}

/**
 * D856: a stamp pressed straight onto the paper - the booth's artwork, or the plain chop when it
 * has none - with no backing. It fills whatever box it is given. The ink blend and filter sit on
 * the image itself: on a rotated wrapper the blend stops reaching the paper. `artStyle` is the
 * reveal's grow-from-centre mask, which finds the art as `img, [role=img]`.
 */
export function StampInk({ image, name, deg, artStyle }: { image: string | null; name: string; deg: number; artStyle?: React.CSSProperties }) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image} alt={`${name} stamp`} className="absolute inset-[4%] size-[92%] object-contain"
        style={{ mixBlendMode: "multiply", filter: STAMP_ART_FILTER, transform: `rotate(${deg}deg)`, ...artStyle }}
      />
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center" role="img" aria-label={`${name} stamped`} style={artStyle}>
      <div className="size-[66%]"><StampGlyph deg={deg} size={null} /></div>
    </div>
  );
}

/**
 * A stamped round slot, and what the reveal lands (D850): the booth's artwork on a white disc,
 * or the plain chop when the booth has none. The white is deliberate - designers' gold line art
 * goes faint on cream and on navy alike, and the disc makes it read on any theme. It fills
 * whatever box it is given; the caller sizes and places it.
 */
export function StampDisc({ image, name, deg, className = "", artStyle }: {
  image: string | null;
  name: string;
  deg: number;
  className?: string;
  /** The reveal's grow-from-centre mask, on the artwork only: the white disc is already there. */
  artStyle?: React.CSSProperties;
}) {
  return (
    <div
      className={`relative size-full rounded-full bg-white shadow-[0_6px_16px_rgba(0,0,0,0.3)] ${className}`} /* theme-fixed: white on every theme so the artwork reads (D850) */
      style={{ transform: `rotate(${deg}deg)` }}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={`${name} stamp`} className="absolute inset-[4%] size-[92%] object-contain" style={artStyle} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center" role="img" aria-label={`${name} stamped`} style={artStyle}>
          <StampGlyph deg={0} size={64} />
        </div>
      )}
    </div>
  );
}
