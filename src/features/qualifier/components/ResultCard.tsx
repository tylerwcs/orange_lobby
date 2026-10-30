"use client";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cutBar } from "../screen";

/**
 * A counted run (D772): the wpm big, the accuracy, one line, and the player's best against the
 * #10 line. **Fly again** is the primary action (Enter works too, see QualifierClient); `share`
 * is the secondary slot (Task 8's share button). `canFly` is false once the window has shut.
 */
export function ResultCard({
  wpm, accuracy, line, best, cutWpm, canFly, flying, onFlyAgain, share,
}: {
  wpm: number; accuracy: number; line: string; best: number | null; cutWpm: number | null;
  canFly: boolean; flying: boolean; onFlyAgain(): void; share?: ReactNode;
}) {
  const bar = cutBar(best, cutWpm);
  return (
    <div className="flex w-full flex-col items-center gap-4 text-center">
      <p className="font-game text-7xl leading-none tabular-nums">
        {wpm.toFixed(1)}<span className="ml-2 text-2xl text-muted-foreground">wpm</span>
      </p>
      <p className="text-sm font-bold text-muted-foreground">{accuracy}% accuracy</p>
      <p className="font-game text-2xl leading-tight">{line}</p>
      {bar && (
        <div className="w-full max-w-sm">
          <div className="relative h-3 w-full rounded-full bg-muted">
            <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${bar.bestPct}%` }} />
            {bar.cutPct !== null && (
              <div className="absolute -inset-y-1.5 border-l-2 border-dashed border-foreground/70" style={{ left: `${bar.cutPct}%` }} />
            )}
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>Your best {best === null ? "—" : `${best.toFixed(1)} wpm`}</span>
            <span>{cutWpm === null ? "No #10 yet" : `#10 ${cutWpm.toFixed(1)} wpm`}</span>
          </div>
        </div>
      )}
      <div className="flex w-full max-w-xs flex-col gap-2">
        {canFly && (
          // mousedown is cancelled so the typing box keeps focus (and a phone its keyboard).
          <Button className="h-14 w-full font-game text-2xl" onMouseDown={(e) => e.preventDefault()} onClick={onFlyAgain} disabled={flying}>
            {flying ? "Starting…" : "Fly again"}
          </Button>
        )}
        {share}
      </div>
    </div>
  );
}
