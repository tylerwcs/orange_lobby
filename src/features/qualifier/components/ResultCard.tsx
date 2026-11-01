"use client";
import { Button } from "@/components/ui/button";
import { points } from "../screen";

/**
 * A counted run (D772, D795): this run's score big, "New best!" when it is one, the player's
 * best, and where they stand (`line`, placeLine). **Play again** is the action (Enter works too,
 * see QualifierClient); `canPlay` is false once the window has shut.
 */
export function ResultCard({ score, best, newBest, line, canPlay, onPlayAgain }: {
  score: number; best: number | null; newBest: boolean; line: string; canPlay: boolean; onPlayAgain(): void;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-3 text-center">
      {newBest && <p className="font-game text-2xl leading-tight text-primary">New best!</p>}
      <p className="font-game text-7xl leading-none tabular-nums">
        {points(score)}<span className="ml-2 text-2xl text-muted-foreground">points</span>
      </p>
      <p className="text-sm font-bold text-muted-foreground tabular-nums">
        Your best {best === null ? "—" : points(best)}
      </p>
      <p className="font-game text-2xl leading-tight">{line}</p>
      {canPlay && (
        <Button className="h-14 w-full max-w-xs font-game text-2xl" onClick={onPlayAgain}>Play again</Button>
      )}
      {canPlay && <p className="hidden text-xs text-muted-foreground pointer-fine:block">or press Enter</p>}
    </div>
  );
}
