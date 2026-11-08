import type React from "react";

/**
 * A collected chop: two rings in the event's brand colour with a checkmark in `primary`,
 * matching the mockups. The two tones can't share one `currentColor`, so the rings and the
 * check sit in their own `<g>`/path each carrying its own text colour.
 */
export function StampGlyph({ deg, size = 52 }: { deg: number; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" aria-hidden="true" className="shrink-0" style={{ transform: `rotate(${deg}deg)` }}>
      <g className="text-brand">
        <circle cx="28" cy="28" r="25" stroke="currentColor" strokeWidth="3" />
        <circle cx="28" cy="28" r="19" stroke="currentColor" strokeWidth="1.5" opacity=".45" />
      </g>
      <path d="M19 28.5l6.5 6.5L37 23" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary" />
    </svg>
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
