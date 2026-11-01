"use client";
import type { QualifierView } from "../view";
import type { Phase } from "../phase";
import { boardLayout, points, untilText } from "../screen";

/**
 * Slime Splat's leaderboard (D772, D795, D797): the top 20, then the player's own rows after a
 * gap when they are further down, each with its best score. The player's own row is
 * highlighted. While the window is open it counts down to the close.
 */
export function Board({ view, phase, now }: { view: QualifierView; phase: Phase; now: number }) {
  const items = boardLayout(view.board.top, view.board.around);
  const open = phase === "open";
  const closes = view.closesAt ? Date.parse(view.closesAt) : null;

  return (
    <section aria-labelledby="qualifier-board" className="flex w-full flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="qualifier-board" className="font-game text-xl">Leaderboard</h2>
        {open && closes !== null && (
          <p className="text-sm text-muted-foreground tabular-nums" suppressHydrationWarning>Closes in {untilText(closes - now)}</p>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one has played yet.</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {items.map((it, i) => {
            if (it.kind === "gap") return <li key={`gap-${i}`} aria-hidden className="py-0.5 text-center text-muted-foreground">…</li>;
            const r = it.entry;
            return (
              <li key={r.rank} aria-current={r.me ? "true" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${r.me ? "bg-primary font-bold text-primary-foreground" : "bg-card"}`}>
                <span className="w-8 shrink-0 tabular-nums">#{r.rank}</span>
                <span className="min-w-0 flex-1 truncate">{r.label}{r.me && <span className="sr-only"> (you)</span>}</span>
                <span className="shrink-0 tabular-nums">{points(r.score)}</span>
              </li>
            );
          })}
        </ol>
      )}
      {view.me.total > 0 && (
        <p className="text-xs text-muted-foreground">{view.me.total} {view.me.total === 1 ? "player" : "players"} on the board</p>
      )}
    </section>
  );
}
