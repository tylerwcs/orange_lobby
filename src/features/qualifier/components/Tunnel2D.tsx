"use client";
import type { SkinId } from "../progress";
import { skinColour } from "../screen";

/**
 * What a tunnel is drawn from (D772). `progress` and the ghosts are counts of completed words;
 * Task 7's 3D tunnel takes the same props, so it can stand in for this one.
 */
export type Tunnel2DProps = { progress: number; ghosts: { best: number | null; cut: number | null }; skin: SkinId | null };

/** Gates shown behind and ahead of the ship, and where the ship sits across the strip. */
const BEHIND = 2;
const AHEAD = 7;
const SHIP_AT = 22; // %
const STEP = (100 - SHIP_AT - 6) / AHEAD; // % per word
export const CUT_COLOUR = "#f59e0b";

const xOf = (words: number, progress: number) => SHIP_AT + (words - progress) * STEP;
const clampX = (x: number) => Math.min(96, Math.max(4, x));

function Ship({ colour, ghost = false }: { colour: string; ghost?: boolean }) {
  return (
    <svg viewBox="0 0 24 16" className="h-4 w-6" style={{ opacity: ghost ? 0.45 : 1 }} aria-hidden>
      <path d="M2 2 L22 8 L2 14 L6 8 Z" fill={colour} />
    </svg>
  );
}

/**
 * The 2D stand-in for the gate tunnel: a strip of gates passing the ship, one per word, with the
 * player's best run and the #10 run as ghosts. A ghost further away than the strip shows sits at
 * its edge. Decoration only, hidden from screen readers; the HUD carries the numbers.
 */
export function Tunnel2D({ progress, ghosts, skin }: Tunnel2DProps) {
  const colour = skinColour(skin);
  const gates = [];
  for (let w = Math.max(1, progress - BEHIND + 1); w <= progress + AHEAD; w++) gates.push(w);
  const ghost = (words: number | null, c: string, label: string) => words === null ? null : (
    <div className="absolute flex flex-col items-center transition-[left] duration-300 ease-out"
      // Above the ship's line for the cut, below it for the best, so neither hides the ship.
      style={{ left: `${clampX(xOf(words, progress))}%`, ...(label === "#10" ? { top: 4 } : { bottom: 4 }), transform: "translateX(-50%)" }}>
      <Ship colour={c} ghost />
      <span className="text-[10px] font-bold leading-none text-muted-foreground">{label}</span>
    </div>
  );

  return (
    <div aria-hidden className="relative h-20 w-full overflow-hidden rounded-2xl bg-muted">
      {gates.map((w) => (
        // A gate sits where its word is finished: passing it is finishing the word.
        <div key={w} className="absolute inset-y-2 w-1 rounded-full bg-muted-foreground/30 transition-[left] duration-300 ease-out"
          style={{ left: `${xOf(w - 0.5, progress)}%` }} />
      ))}
      {ghost(ghosts.cut, CUT_COLOUR, "#10")}
      {ghost(ghosts.best, colour, "Best")}
      <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${SHIP_AT}%` }}>
        <Ship colour={colour} />
      </div>
    </div>
  );
}
