"use client";
import type { ReactNode } from "react";
import { points } from "../screen";

/**
 * A counted run (D772, D795): this run's score big, "New best!" when it is one, the player's
 * best, and where they stand (`line`, placeLine). A practice run (D909) says so, and that it is
 * not on the leaderboard, in place of the best and the place. `children` are the page's play
 * buttons (QualifierClient's PlayActions).
 */
export function ResultCard({ score, best, newBest, line, practice = false, children }: {
  score: number; best: number | null; newBest: boolean; line: string; practice?: boolean; children?: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-3 text-center">
      {practice && <p className="font-game text-2xl leading-tight text-primary">Practice run</p>}
      {newBest && !practice && <p className="font-game text-2xl leading-tight text-primary">New best!</p>}
      <p className="font-game text-7xl leading-none tabular-nums">
        {points(score)}<span className="ml-2 text-2xl text-muted-foreground">points</span>
      </p>
      {practice ? (
        <p className="font-game text-2xl leading-tight">Not on the leaderboard</p>
      ) : (
        <>
          <p className="text-sm font-bold text-muted-foreground tabular-nums">
            Your best {best === null ? "—" : points(best)}
          </p>
          <p className="font-game text-2xl leading-tight">{line}</p>
        </>
      )}
      {children}
    </div>
  );
}
