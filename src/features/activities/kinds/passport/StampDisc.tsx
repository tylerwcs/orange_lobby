import type React from "react";
import { STAMP_ART_FILTER, paperBackground } from "./paper";
import { chopVars } from "./PassportPaper";

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
 * D858: the reveal's round piece of paper - the same cream, lines and rosette as the page - that a
 * stamp grows onto in the middle of the dimmed screen. It replaced the white disc (D850), which
 * existed because gold line art went faint on cream; the ink filter on `StampInk` (D856) does
 * that job now. It fills whatever box it is given; the caller sizes and places it.
 */
export function PaperDisc({ brand, children }: { brand: string | null; children: React.ReactNode }) {
  return (
    <div
      className="relative size-full overflow-hidden rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
      style={{ background: paperBackground(), ...chopVars(brand) }}
    >
      {children}
    </div>
  );
}
