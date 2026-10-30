"use client";
import type { QualifierView } from "../view";
import type { Phase } from "../phase";
import { boardLayout, droppedText, skinColour, untilText } from "../screen";

/**
 * The qualifier's board (D772): the top 10, the dashed finale cut, 11-20, then the player's own
 * rows after a gap when they are further down. The player's own row is highlighted. While the
 * window is open it counts down to the close, and a player pushed down since their last visit
 * sees the "you dropped" banner above it.
 */
export function Board({ view, phase, now }: { view: QualifierView; phase: Phase; now: number }) {
  const items = boardLayout(view.board.top, view.board.around);
  const open = phase === "open";
  const dropped = droppedText(view.me.dropped, { best: view.me.best, cutWpm: view.cutWpm, open });
  const closes = view.closesAt ? Date.parse(view.closesAt) : null;

  return (
    <section aria-labelledby="qualifier-board" className="flex w-full flex-col gap-3">
      {dropped && (
        <p role="status" className="rounded-xl bg-amber-100 px-4 py-3 text-sm font-bold text-amber-950">{dropped}</p>
      )}
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="qualifier-board" className="font-game text-xl">{phase === "confirmed" ? "Final board" : "Leaderboard"}</h2>
        {open && closes !== null && (
          <p className="text-sm text-muted-foreground tabular-nums" suppressHydrationWarning>Closes in {untilText(closes - now)}</p>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one has flown yet.</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {items.map((it, i) => {
            if (it.kind === "cut") {
              return (
                <li key={`cut-${i}`} aria-label="Finale cut" className="flex items-center gap-2 py-1 text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
                  <span className="h-0 flex-1 border-t-2 border-dashed border-current" />
                  Finale cut
                  <span className="h-0 flex-1 border-t-2 border-dashed border-current" />
                </li>
              );
            }
            if (it.kind === "gap") return <li key={`gap-${i}`} aria-hidden className="py-0.5 text-center text-muted-foreground">…</li>;
            const r = it.entry;
            return (
              <li key={r.rank} aria-current={r.me ? "true" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${r.me ? "bg-primary font-bold text-primary-foreground" : "bg-card"}`}>
                <span className="w-8 shrink-0 tabular-nums">#{r.rank}</span>
                <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: skinColour(r.skin) }} />
                <span className="min-w-0 flex-1 truncate">{r.label}{r.me && <span className="sr-only"> (you)</span>}</span>
                <span className="shrink-0 tabular-nums">{r.wpm.toFixed(1)} wpm</span>
              </li>
            );
          })}
        </ol>
      )}
      {view.me.total > 0 && (
        <p className="text-xs text-muted-foreground">{view.me.total} {view.me.total === 1 ? "pilot" : "pilots"} on the board</p>
      )}
    </section>
  );
}
