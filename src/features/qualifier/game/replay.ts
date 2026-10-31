// The server's replay of a run (D791): the player's keystrokes pressed through the same engine from
// the same seed. The score is whatever comes out of here, never anything the phone claims.
import { advance, finish, newGame, press } from "./engine";
import type { Entry } from "./timeline";

export type RunResult = { score: number; endedMs: number; popped: number; bosses: number };

/** Press every entry at its `t`, then let the run play out. A key after the run has ended is refused. */
export function replay(seed: number, entries: readonly Entry[]): RunResult | { refused: "after_end" } {
  const g = newGame(seed);
  for (const e of entries) {
    advance(g, e.t);
    if (g.ended) return { refused: "after_end" };
    press(g, e.key, e.t);
  }
  finish(g);
  return { score: g.score, endedMs: g.endedMs as number, popped: g.popped, bosses: g.bosses };
}
