// The server's replay of a run (D791): the player's keystrokes pressed through the same engine from
// the same seed. The score is whatever comes out of here, never anything the phone claims.
import { advance, finish, newGame, press } from "./engine";
import type { Entry } from "./timeline";

export type RunResult = { score: number; endedMs: number; popped: number; bosses: number };

/**
 * `letters`: the times of the letters the engine accepted (locked a slime or was the next letter,
 * a word's last one included), typed one at a time, not inserted. What `checkSpeed` counts.
 */
export type Replayed = RunResult & { letters: number[] };

/** Press every entry at its `t`, then let the run play out. A key after the run has ended is refused. */
export function replay(seed: number, entries: readonly Entry[]): Replayed | { refused: "after_end" } {
  const g = newGame(seed);
  const letters: number[] = [];
  for (const e of entries) {
    advance(g, e.t);
    if (g.ended) return { refused: "after_end" };
    // The ticks' events are not needed here; what is left after the press is the press's own.
    g.events.length = 0;
    press(g, e.key, e.t);
    // An accepted key logs exactly one "letter" event, first ("word" or "pop" may follow it).
    if (g.events[0]?.type === "letter" && !e.insert) letters.push(e.t);
  }
  finish(g);
  return { score: g.score, endedMs: g.endedMs as number, popped: g.popped, bosses: g.bosses, letters };
}
