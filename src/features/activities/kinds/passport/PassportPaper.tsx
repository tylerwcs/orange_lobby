import type { CSSProperties, ReactNode } from "react";
import { PAPER_INK, chopInk, paperBackground } from "./paper";

/** The serif is the paper's alone: a passport page, not the portal's type (D854). No web font. */
export const PAPER_SERIF = 'Georgia, "Times New Roman", serif';

/** The event's chop colours, moved until they read on cream, for `StampGlyph` inside (D856). */
export function chopVars(brand: string | null): CSSProperties {
  const ink = chopInk(brand);
  return { "--chop-ring": ink.ring, "--chop-check": ink.check } as CSSProperties;
}

/**
 * D854, D855: the passport page the stamps sit on. One cream sheet, the same on every theme - its
 * colours are fixed (paper.ts), not tokens - with the holder's name at the top like the name
 * line in a real passport, the slots, and a page number at the foot. `holder` is null on the
 * no-attendee view (D103): nobody's page, so no name line.
 */
export function PassportPaper({ holder, brand, children }: { holder: string | null; brand: string | null; children: ReactNode }) {
  return (
    <div
      className="relative flex flex-col gap-3.5 overflow-hidden rounded-[6px] px-3.5 pt-4 pb-3 shadow-[0_12px_28px_rgba(20,12,0,0.32),0_0_0_1px_rgba(138,106,64,0.18)]"
      style={{ background: paperBackground(), fontFamily: PAPER_SERIF, ...chopVars(brand) }}
    >
      {holder !== null && (
        <div className="border-b pb-2" style={{ borderColor: PAPER_INK.rule }}>
          <div className="text-[11px] leading-none font-bold tracking-[0.22em] uppercase" style={{ color: PAPER_INK.label }}>Passport holder</div>
          <div className="mt-1.5 text-sm leading-snug italic break-words" style={{ color: PAPER_INK.name }}>{holder}</div>
        </div>
      )}
      {children}
      <div aria-hidden="true" className="text-center text-[11px] italic tracking-[0.1em]" style={{ color: PAPER_INK.label }}>— 3 —</div>
    </div>
  );
}
